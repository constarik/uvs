// ============================================================================
// UVS uvGacha - REFERENCE RESOLVER (C++17, no dependencies)
//
// A gacha session is a deterministic resolver replayed over committed entropy:
//   combinedSeed = SHA-256( serverSeed : clientSeed : drandRandomness )
//   u_i          = SHA-256( combinedSeed : i )  as a 256-bit big-endian int, mod D
//   outcome      = the tier whose cumulative integer interval in [0,D) contains u_i
// The 256-bit value mod D is computed by base-16 nibble iteration -> no big-int needed,
// byte-identical to the JS (BigInt) / Python / Java (BigInteger) resolvers.
// Optional hard-pity (uvGacha 5) is reconstructed by replay from pull 1, never stored.
//
// Build (MSVC):  cl /EHsc /O2 gacha_resolve.cpp     then  gacha_resolve.exe
// Build (g++):   g++ -std=c++17 -O2 -o gacha gacha_resolve.cpp
// (C++ has no stdlib SHA-256, so a compact FIPS-180-4 implementation is bundled.)
// ============================================================================
#define _CRT_SECURE_NO_WARNINGS
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>
using namespace std;

static const uint32_t K[64] = {
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
};
static inline uint32_t rotr(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }

string sha256_hex(const string& msg) {
  uint32_t h[8] = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
  vector<uint8_t> d(msg.begin(), msg.end());
  uint64_t bitlen = (uint64_t)d.size() * 8;
  d.push_back(0x80);
  while (d.size() % 64 != 56) d.push_back(0x00);
  for (int i = 7; i >= 0; i--) d.push_back((uint8_t)((bitlen >> (i * 8)) & 0xff));
  for (size_t off = 0; off < d.size(); off += 64) {
    uint32_t w[64];
    for (int i = 0; i < 16; i++)
      w[i] = ((uint32_t)d[off+i*4]<<24)|((uint32_t)d[off+i*4+1]<<16)|((uint32_t)d[off+i*4+2]<<8)|((uint32_t)d[off+i*4+3]);
    for (int i = 16; i < 64; i++) {
      uint32_t s0 = rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>3);
      uint32_t s1 = rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>10);
      w[i] = w[i-16] + s0 + w[i-7] + s1;
    }
    uint32_t a=h[0],b=h[1],c=h[2],dd=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
    for (int i = 0; i < 64; i++) {
      uint32_t S1 = rotr(e,6)^rotr(e,11)^rotr(e,25);
      uint32_t ch = (e&f)^((~e)&g);
      uint32_t t1 = hh + S1 + ch + K[i] + w[i];
      uint32_t S0 = rotr(a,2)^rotr(a,13)^rotr(a,22);
      uint32_t maj = (a&b)^(a&c)^(b&c);
      uint32_t t2 = S0 + maj;
      hh=g; g=f; f=e; e=dd+t1; dd=c; c=b; b=a; a=t1+t2;
    }
    h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=dd;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=hh;
  }
  char out[65];
  for (int i = 0; i < 8; i++) snprintf(out + i*8, 9, "%08x", h[i]);
  out[64] = 0;
  return string(out);
}

string combinedSeed(const string& server, const string& client, const string& drand) {
  return sha256_hex(server + ":" + client + ":" + drand);
}
// u_i = SHA-256(combined:i) as a 256-bit big-endian integer, mod D (base-16 nibble iteration)
int64_t pullValue(const string& combined, int i, int64_t D) {
  string hx = sha256_hex(combined + ":" + to_string(i));
  int64_t acc = 0;
  for (char c : hx) { int v = (c >= '0' && c <= '9') ? c - '0' : c - 'a' + 10; acc = (acc * 16 + v) % D; }
  return acc;
}
struct Tier { string name; int64_t rate; };
// rates MUST be non-negative and sum to exactly D (uvGacha §4)
bool ratesValid(const vector<Tier>& tiers, int64_t D) {
  int64_t sum = 0;
  for (auto& t : tiers) { if (t.rate < 0) return false; sum += t.rate; }
  return sum == D;
}
string tierOf(const vector<Tier>& tiers, int64_t u) {
  int64_t acc = 0;
  for (auto& t : tiers) { acc += t.rate; if (u < acc) return t.name; }
  return "ERR";
}
// resolve a session. hardAfter>0 enables the §5 example hard-pity machine for tier `pityTier`.
vector<pair<string,bool>> resolve(const vector<Tier>& tiers, int64_t D, const string& combined,
                                  int pullCount, const string& pityTier, int hardAfter) {
  vector<pair<string,bool>> out;
  int miss = 0;
  for (int i = 1; i <= pullCount; i++) {
    int64_t u = pullValue(combined, i, D);
    string tier; bool forced = false;
    if (hardAfter > 0 && miss + 1 >= hardAfter) { tier = pityTier; forced = true; }
    else tier = tierOf(tiers, u);
    out.push_back({tier, forced});
    miss = (hardAfter > 0 && tier == pityTier) ? 0 : miss + 1;
  }
  return out;
}

int main() {
  const string ss = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f70811223344556";
  const int64_t D = 1000000;
  vector<Tier> tiers = {{"5star",6000},{"4star",91000},{"3star",903000}};

  // -- stateless vector --
  string cA = combinedSeed(ss, "uvs-gacha-demo", "");
  auto A = resolve(tiers, D, cA, 10, "", 0);
  const char* expA[10] = {"4star","3star","3star","3star","3star","3star","3star","3star","3star","3star"};
  bool aOk = (cA == "91d696b5dd3f9634d7015b321685ae61ac3a52eb4cf540cf11d5a1a2cc561043");
  for (int i = 0; i < 10; i++) if (A[i].first != expA[i]) aOk = false;

  // -- pity vector (hard pity: 5star guaranteed on the 10th consecutive miss) --
  string cB = combinedSeed(ss, "uvs-gacha-pity", "");
  auto B = resolve(tiers, D, cB, 12, "5star", 10);
  const char* expB[12] = {"3star","3star","3star","3star","3star","3star","3star","3star","3star","5star","4star","3star"};
  bool bOk = (cB == "fa753fc5786340d20b5857a90736473fb4360f55d2e4a9a3eed6f36909710cdf") && B[9].second; // pull 10 forced
  for (int i = 0; i < 12; i++) if (B[i].first != expB[i]) bOk = false;

  // -- negative: rates 6000+91000+900000 = 997000 != D --
  vector<Tier> bad = {{"5star",6000},{"4star",91000},{"3star",900000}};
  bool negOk = !ratesValid(bad, D) && ratesValid(tiers, D);

  printf("combinedSeed(stateless) = %s\n", cA.c_str());
  printf("stateless %s | pity %s | rates-sum-reject %s\n", aOk?"OK":"FAIL", bOk?"OK":"FAIL", negOk?"OK":"FAIL");
  printf("gacha self-test %s\n", (aOk && bOk && negOk) ? "PASS" : "FAIL");
  return 0;
}

// ============================================================================
// UVS verifiable allocation - REFERENCE VERIFIER (C++17, no dependencies)
//
// One operation: a seeded random PERMUTATION of participants, then a published
// prize pool dealt onto that order.
//   combinedSeed = SHA-256( serverSeed + ":" + drandRandomness )
//   score(id)    = SHA-256( combinedSeed + ":" + id )
//   permutation  = participants sorted by score DESC  (ties: id ASC)
// Reproduces test-vectors.json, same as the JS / Python / Java verifiers.
//
// Build (MSVC):  cl /EHsc /O2 draw_verify.cpp     then  draw_verify.exe
// (C++ has no stdlib SHA-256, so a compact FIPS-180-4 implementation is bundled.)
// ============================================================================
#define _CRT_SECURE_NO_WARNINGS
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>
#include <utility>
#include <algorithm>
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

int main() {
  string serverSeed = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f70811223344556";
  string randomness = "e8d0543d60b639cf02775d16d8bc66f281b7bcbdf59706f29a1684889f8b9548";
  int M = 20, N = 5;
  vector<string> parts(M);
  for (int i = 0; i < M; i++) { char b[16]; snprintf(b, sizeof(b), "TICKET-%04d", i+1); parts[i] = b; }

  string c = sha256_hex(serverSeed + ":" + randomness);
  vector<pair<string,string>> ranked;
  for (auto& id : parts) ranked.push_back({ sha256_hex(c + ":" + id), id });
  sort(ranked.begin(), ranked.end(), [](const pair<string,string>& x, const pair<string,string>& y) {
    if (x.first != y.first) return x.first > y.first;   // score DESC
    return x.second < y.second;                          // id ASC
  });

  printf("combinedSeed = SHA-256(serverSeed:drandRandomness) = %s\n", c.c_str());
  printf("%d prize(s) among %d participants:\n", N, M);
  for (int i = 0; i < N; i++) printf("  #%d %s -> SEAT\n", i+1, ranked[i].second.c_str());
  return 0;
}

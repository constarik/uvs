// ============================================================================
// UVS uvGacha - REFERENCE RESOLVER (Java, stdlib only). Mirrors gacha-resolve.js.
//   combinedSeed = SHA-256( serverSeed : clientSeed : drandRandomness )
//   u_i          = SHA-256( combinedSeed : i )  as a 256-bit big-endian int, mod D  (BigInteger)
//   outcome      = the tier whose cumulative integer interval in [0,D) contains u_i
// Optional hard-pity (uvGacha 5) is reconstructed by replay from pull 1, never stored (core 6.1).
//
// Run:  java GachaResolve.java <record.json>     (Java 11+; no javac needed)
//       java GachaResolve.java                   (self-test against test-vectors-gacha.json)
// ============================================================================
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

public class GachaResolve {

    static String sha256(String s) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        for (byte b : d) sb.append(String.format("%02x", b));
        return sb.toString();
    }
    static String combinedSeed(String server, String client, String drand) throws Exception {
        return sha256(server + ":" + client + ":" + (drand == null ? "" : drand));
    }
    // u_i = SHA-256(combined:i) as a 256-bit big-endian integer, mod D
    static long pullValue(String combined, int i, long D) throws Exception {
        return new BigInteger(sha256(combined + ":" + i), 16).mod(BigInteger.valueOf(D)).longValue();
    }

    @SuppressWarnings("unchecked")
    static void validateRules(Map<String,Object> rules, long D) {
        if (D <= 0) throw new IllegalArgumentException("INVALID: rateDenominator must be a positive integer (uvGacha 4)");
        long sum = 0;
        for (Object o : (List<Object>) rules.get("tiers")) {
            Map<String,Object> t = (Map<String,Object>) o;
            if (!(t.get("tier") instanceof String)) throw new IllegalArgumentException("INVALID: tier label must be a string (uvGacha 4)");
            if (!(t.get("rate") instanceof Long)) throw new IllegalArgumentException("INVALID: rate must be a JSON integer (uvGacha 4)");
            long r = (Long) t.get("rate");
            if (r < 0) throw new IllegalArgumentException("INVALID: rate must be non-negative (uvGacha 4)");
            sum += r;
        }
        if (sum != D) throw new IllegalArgumentException("INVALID: rates sum to " + sum + " != D " + D + " (uvGacha 4)");
    }
    @SuppressWarnings("unchecked")
    static String tierOf(List<Object> tiers, long u) {
        long acc = 0;
        for (Object o : tiers) { Map<String,Object> t = (Map<String,Object>) o; acc += (Long) t.get("rate"); if (u < acc) return (String) t.get("tier"); }
        throw new IllegalArgumentException("INVALID: u beyond cumulative range");
    }

    @SuppressWarnings("unchecked")
    static List<Map<String,Object>> resolve(Map<String,Object> rec) throws Exception {
        long D = (Long) rec.get("rateDenominator");
        Map<String,Object> rules = (Map<String,Object>) rec.get("rules");
        validateRules(rules, D);
        Object dr = rec.get("drand");
        String drand = (dr instanceof Map) ? (String) ((Map<String,Object>) dr).get("randomness") : null;
        String combined = combinedSeed((String) rec.get("serverSeed"), (String) rec.get("clientSeed"), drand);
        Map<String,Object> pity = rules.get("pity") instanceof Map ? (Map<String,Object>) rules.get("pity") : null;
        List<Object> tiers = (List<Object>) rules.get("tiers");
        long pullCount = (Long) rec.get("pullCount");
        List<Map<String,Object>> out = new ArrayList<>();
        int miss = 0;
        for (int i = 1; i <= pullCount; i++) {
            long u = pullValue(combined, i, D);
            String tier; boolean forced = false;
            if (pity != null && miss + 1 >= (Long) pity.get("hardAfter")) { tier = (String) pity.get("tier"); forced = true; }
            else tier = tierOf(tiers, u);
            Map<String,Object> r = new LinkedHashMap<>(); r.put("i", (long) i); r.put("tier", tier); r.put("forced", forced);
            out.add(r);
            String pt = pity != null ? (String) pity.get("tier") : null;
            miss = (pity != null && tier.equals(pt)) ? 0 : miss + 1;
        }
        out.add(0, mapOf("combinedSeed", combined));  // index 0 carries the combinedSeed for the caller
        return out;
    }
    static Map<String,Object> mapOf(String k, Object v) { Map<String,Object> m = new LinkedHashMap<>(); m.put(k, v); return m; }

    // ---- minimal JSON parser (objects -> LinkedHashMap, arrays -> ArrayList) ----
    static final class P {
        final String s; int i = 0;
        P(String s) { this.s = s; }
        void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
        Object value() {
            ws(); char ch = s.charAt(i);
            if (ch == '{') return obj(); if (ch == '[') return arr(); if (ch == '"') return str();
            if (ch == 't') { i += 4; return Boolean.TRUE; }
            if (ch == 'f') { i += 5; return Boolean.FALSE; }
            if (ch == 'n') { i += 4; return null; }
            int j = i; while (j < s.length() && "+-0123456789.eE".indexOf(s.charAt(j)) >= 0) j++;
            String n = s.substring(i, j); i = j;
            return n.contains(".") || n.contains("e") || n.contains("E") ? (Object) Double.parseDouble(n) : (Object) Long.parseLong(n);
        }
        Map<String,Object> obj() {
            Map<String,Object> m = new LinkedHashMap<>(); i++; ws();
            if (s.charAt(i) == '}') { i++; return m; }
            while (true) { ws(); String k = str(); ws(); i++; m.put(k, value()); ws();
                if (s.charAt(i) == ',') { i++; continue; } i++; return m; }
        }
        List<Object> arr() {
            List<Object> a = new ArrayList<>(); i++; ws();
            if (s.charAt(i) == ']') { i++; return a; }
            while (true) { a.add(value()); ws();
                if (s.charAt(i) == ',') { i++; continue; } i++; return a; }
        }
        String str() {
            StringBuilder b = new StringBuilder(); i++;
            while (s.charAt(i) != '"') {
                char ch = s.charAt(i++);
                if (ch == '\\') { char e = s.charAt(i++);
                    switch (e) { case 'n': b.append('\n'); break; case 't': b.append('\t'); break;
                        case 'r': b.append('\r'); break; case 'b': b.append('\b'); break; case 'f': b.append('\f'); break;
                        case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                        default: b.append(e); } }
                else b.append(ch);
            }
            i++; return b.toString();
        }
    }
    @SuppressWarnings("unchecked")
    static Map<String,Object> parse(String json) { return (Map<String,Object>) new P(json).value(); }

    @SuppressWarnings("unchecked")
    public static void main(String[] args) throws Exception {
        if (args.length > 0) {
            Map<String,Object> rec = parse(new String(Files.readAllBytes(Paths.get(args[0])), StandardCharsets.UTF_8));
            List<Map<String,Object>> r = resolve(rec);
            System.out.println("combinedSeed = " + r.get(0).get("combinedSeed"));
            for (int k = 1; k < r.size(); k++) System.out.println("  pull " + r.get(k).get("i") + ": " + r.get(k).get("tier") + (((Boolean) r.get(k).get("forced")) ? "  (pity)" : ""));
            return;
        }
        // self-test against the committed vectors
        String json = null;
        for (String p : new String[]{"test-vectors-gacha.json", "verifiers/test-vectors-gacha.json"})
            if (Files.exists(Paths.get(p))) { json = new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8); break; }
        if (json == null) { System.out.println("test-vectors-gacha.json not found (run from repo root or verifiers/)"); System.exit(2); }
        Map<String,Object> tv = parse(json);

        Map<String,Object> st = (Map<String,Object>) tv.get("stateless");
        List<Map<String,Object>> A = resolve((Map<String,Object>) st.get("record"));
        boolean aOk = A.get(0).get("combinedSeed").equals(st.get("combinedSeed"));
        List<Object> expTiers = (List<Object>) st.get("tiers");
        for (int k = 0; k < expTiers.size(); k++) if (!A.get(k + 1).get("tier").equals(expTiers.get(k))) aOk = false;

        Map<String,Object> pt = (Map<String,Object>) tv.get("pity");
        List<Map<String,Object>> B = resolve((Map<String,Object>) pt.get("record"));
        boolean bOk = B.get(0).get("combinedSeed").equals(pt.get("combinedSeed"));
        List<Object> expPulls = (List<Object>) pt.get("pulls");
        for (int k = 0; k < expPulls.size(); k++) {
            Map<String,Object> e = (Map<String,Object>) expPulls.get(k), g = B.get(k + 1);
            if (!g.get("tier").equals(e.get("tier")) || !g.get("forced").equals(e.get("forced"))) bOk = false;
        }

        Map<String,Object> neg = (Map<String,Object>) ((Map<String,Object>) tv.get("negative")).get("rates-not-sum-D");
        boolean negOk = false;
        try { resolve((Map<String,Object>) neg.get("record")); } catch (IllegalArgumentException e) { negOk = true; }

        System.out.println("stateless " + aOk + " | pity " + bOk + " | rates-sum-reject " + negOk);
        System.out.println("gacha self-test " + (aOk && bOk && negOk ? "PASS" : "FAIL"));
    }
}

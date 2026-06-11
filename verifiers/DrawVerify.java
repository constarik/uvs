// ============================================================================
// UVS verifiable allocation - REFERENCE VERIFIER (Java, stdlib only)
//
// One operation: a seeded random PERMUTATION of participants, then a published
// prize pool dealt onto that order.
//   combinedSeed = SHA-256( serverSeed + ":" + drandRandomness )
//   score(id)    = SHA-256( combinedSeed + ":" + id )
//   permutation  = participants sorted by score DESC  (ties: id ASC)
//   allocation   = order[i] receives prizes[i]
// Parity with draw-verify.js / draw_verify.py / draw_verify.cpp:
//   - rejects duplicate participant ids (uvLs 3.1)
//   - checks the 5.4 derived-R anchor rule when the record carries one
// Run:  java DrawVerify.java <record.json> [id]     (Java 11+; no javac needed)
//       java DrawVerify.java                        (built-in canonical self-test)
// ============================================================================
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

public class DrawVerify {

    // ---- crypto ----
    static String sha256(String s) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        for (byte b : d) sb.append(String.format("%02x", b));
        return sb.toString();
    }
    static String combined(String server, String rand) throws Exception { return sha256(server + ":" + rand); }
    static String score(String c, String id) throws Exception { return sha256(c + ":" + id); }

    // ---- uvLs 3.1: duplicate ids break the total order -> reject, don't rank ----
    static void requireUnique(List<String> parts) {
        if (new HashSet<>(parts).size() != parts.size())
            throw new IllegalArgumentException("INVALID: duplicate participant ids - record rejected (uvLs 3.1)");
    }

    // ---- permutation: score DESC, ties id ASC ----
    static List<String[]> permute(List<String> parts, String c) throws Exception {
        requireUnique(parts);
        List<String[]> r = new ArrayList<>();
        for (String p : parts) r.add(new String[]{ score(c, p), p });
        r.sort((x, y) -> { int s = y[0].compareTo(x[0]); return s != 0 ? s : x[1].compareTo(y[1]); });
        return r;
    }

    // ---- single lookup: O(M) hashing, no sort ----
    static int rankOf(List<String> parts, String c, String id) throws Exception {
        requireUnique(parts);
        String me = score(c, id);
        int higher = 0;
        for (String a : parts) {
            if (a.equals(id)) continue;
            String s = score(c, a);
            if (s.compareTo(me) > 0 || (s.equals(me) && a.compareTo(id) < 0)) higher++;
        }
        return higher + 1;
    }

    // ---- 5.4 derived-R rule (quicknet: 3s period, genesis 1692803367) ----
    static final long QN_GENESIS = 1692803367L, QN_PERIOD = 3L;
    static long roundAt(long unixSec) { return (unixSec - QN_GENESIS) / QN_PERIOD + 1; }
    static long timeOfRound(long round) { return QN_GENESIS + (round - 1) * QN_PERIOD; }
    static boolean checkAnchorRound(long genTime, long round) {
        return round == roundAt(genTime) + 1 && genTime < timeOfRound(round);
    }

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
        Map<String, Object> obj() {
            Map<String, Object> m = new LinkedHashMap<>(); i++; ws();
            if (s.charAt(i) == '}') { i++; return m; }
            while (true) { ws(); String k = str(); ws(); i++; /* : */ m.put(k, value()); ws();
                if (s.charAt(i) == ',') { i++; continue; } i++; /* } */ return m; }
        }
        List<Object> arr() {
            List<Object> a = new ArrayList<>(); i++; ws();
            if (s.charAt(i) == ']') { i++; return a; }
            while (true) { a.add(value()); ws();
                if (s.charAt(i) == ',') { i++; continue; } i++; /* ] */ return a; }
        }
        String str() {
            StringBuilder b = new StringBuilder(); i++; // opening quote
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
    static Map<String, Object> parse(String json) { return (Map<String, Object>) new P(json).value(); }

    // ---- prize pool: explicit prizes[], or {winners, prizeLabel} ----
    @SuppressWarnings("unchecked")
    static List<String> poolOf(Map<String, Object> rec) {
        Object p = rec.get("prizes");
        if (p instanceof List) { List<String> out = new ArrayList<>(); for (Object x : (List<Object>) p) out.add(String.valueOf(x)); return out; }
        long n = rec.get("winners") instanceof Long ? (Long) rec.get("winners") : (rec.get("N") instanceof Long ? (Long) rec.get("N") : 0L);
        String label = rec.get("prizeLabel") != null ? String.valueOf(rec.get("prizeLabel")) : "WIN";
        List<String> out = new ArrayList<>(); for (long k = 0; k < n; k++) out.add(label); return out;
    }

    @SuppressWarnings("unchecked")
    public static void main(String[] args) throws Exception {
        if (args.length == 0) { selfTest(); return; }
        Map<String, Object> rec = parse(new String(Files.readAllBytes(Paths.get(args[0])), StandardCharsets.UTF_8));
        List<String> parts = new ArrayList<>(); for (Object x : (List<Object>) rec.get("participants")) parts.add(String.valueOf(x));
        try { requireUnique(parts); } catch (IllegalArgumentException e) { System.out.println(e.getMessage()); System.exit(1); }
        Map<String, Object> drand = (Map<String, Object>) rec.get("drand");
        String c = combined(String.valueOf(rec.get("serverSeed")), String.valueOf(drand.get("randomness")));
        List<String> prizes = poolOf(rec);
        System.out.println("combinedSeed = SHA-256(serverSeed:drandRandomness) = " + c);
        Map<String, Object> ca = (Map<String, Object>) rec.get("commitmentAnchor");
        if (ca != null && ca.get("genTime") instanceof Long && drand.get("round") instanceof Long
                && String.valueOf(ca.getOrDefault("roundRule", "")).startsWith("roundAt")) {
            long g = (Long) ca.get("genTime"), r = (Long) drand.get("round");
            System.out.println("5.4 derived-R (genTime=" + g + ", R=" + r + "): " + (checkAnchorRound(g, r) ? "OK" : "FAIL"));
        }
        if (args.length > 1) {
            String id = args[1];
            if (!parts.contains(id)) { System.out.println(id + ": NOT in the committed list"); return; }
            int rank = rankOf(parts, c, id);
            System.out.println(id + ": rank " + rank + " of " + parts.size() + " -> " + (rank <= prizes.size() ? prizes.get(rank - 1) : "no prize"));
        } else {
            List<String[]> order = permute(parts, c);
            int n = Math.min(prizes.size(), order.size());
            System.out.println(n + " prize(s) among " + parts.size() + " participants:");
            for (int k = 0; k < n; k++) System.out.println("  #" + (k + 1) + " " + order.get(k)[1] + " -> " + prizes.get(k));
        }
    }

    // canonical vector from verifiers/test-vectors.json + the negative duplicate-ids vector
    static void selfTest() throws Exception {
        String serverSeed = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f70811223344556";
        String randomness = "e8d0543d60b639cf02775d16d8bc66f281b7bcbdf59706f29a1684889f8b9548";
        List<String> parts = new ArrayList<>();
        for (int k = 1; k <= 20; k++) parts.add(String.format("TICKET-%04d", k));
        String c = combined(serverSeed, randomness);
        System.out.println("combinedSeed = " + c);
        List<String[]> order = permute(parts, c);
        for (int k = 0; k < 5; k++) System.out.println("  #" + (k + 1) + " " + order.get(k)[1] + " -> SEAT");
        List<String> dup = new ArrayList<>(parts); dup.add("TICKET-0007");
        boolean rejected = false;
        try { permute(dup, c); } catch (IllegalArgumentException e) { rejected = true; }
        System.out.println("negative vector duplicate-ids: " + (rejected ? "correctly rejected" : "FAIL not rejected"));
    }
}

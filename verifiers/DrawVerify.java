// ============================================================================
// UVS verifiable allocation - REFERENCE VERIFIER (Java, stdlib only)
//
// One operation: a seeded random PERMUTATION of participants, then a published
// prize pool dealt onto that order.
//   combinedSeed = SHA-256( serverSeed + ":" + drandRandomness )
//   score(id)    = SHA-256( combinedSeed + ":" + id )
//   permutation  = participants sorted by score DESC  (ties: id ASC)
// Reproduces test-vectors.json, same as the JS / Python / C++ verifiers.
//
// Compile/run:  javac DrawVerify.java && java DrawVerify
// (the canonical test record is hard-coded in main; the 4 functions are the verifier)
// ============================================================================
import java.security.MessageDigest;
import java.util.Arrays;

public class DrawVerify {
    static String sha256(String s) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes("UTF-8"));
        StringBuilder sb = new StringBuilder();
        for (byte b : d) sb.append(String.format("%02x", b));
        return sb.toString();
    }
    static String combined(String server, String rand) throws Exception { return sha256(server + ":" + rand); }
    static String score(String c, String id) throws Exception { return sha256(c + ":" + id); }

    // uvLs §3.1: participant ids MUST be unique — a duplicate breaks the total order. Reject.
    static void requireUnique(String[] parts) {
        if (new java.util.HashSet<>(java.util.Arrays.asList(parts)).size() != parts.length)
            throw new IllegalArgumentException("INVALID: duplicate participant ids - record rejected (uvLs 3.1)");
    }

    public static void main(String[] args) throws Exception {
        String serverSeed = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f70811223344556";
        String randomness = "e8d0543d60b639cf02775d16d8bc66f281b7bcbdf59706f29a1684889f8b9548";
        int M = 20, N = 5;
        String[] parts = new String[M];
        for (int i = 0; i < M; i++) parts[i] = String.format("TICKET-%04d", i + 1);

        requireUnique(parts);
        String c = combined(serverSeed, randomness);
        String[][] ranked = new String[M][2];
        for (int i = 0; i < M; i++) ranked[i] = new String[]{ score(c, parts[i]), parts[i] };
        Arrays.sort(ranked, (x, y) -> {
            int s = y[0].compareTo(x[0]);   // score DESC
            return s != 0 ? s : x[1].compareTo(y[1]); // tie: id ASC
        });

        System.out.println("combinedSeed = SHA-256(serverSeed:drandRandomness) = " + c);
        System.out.println(N + " prize(s) among " + M + " participants:");
        for (int i = 0; i < N; i++) System.out.println("  #" + (i + 1) + " " + ranked[i][1] + " -> SEAT");

        // negative vector (uvLs §3.1): the same list with TICKET-0007 repeated MUST be rejected
        String[] dup = java.util.Arrays.copyOf(parts, M + 1);
        dup[M] = "TICKET-0007";
        try { requireUnique(dup); System.out.println("FAIL: duplicate-ids not rejected"); }
        catch (IllegalArgumentException ex) { System.out.println("negative vector duplicate-ids: correctly rejected"); }
    }
}

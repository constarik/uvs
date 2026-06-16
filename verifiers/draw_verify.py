#!/usr/bin/env python3
# ============================================================================
# UVS verifiable allocation - REFERENCE VERIFIER (Python 3, stdlib only)
#
# One operation: a seeded random PERMUTATION of participants, then a published
# prize pool dealt onto that order.
#   combinedSeed = SHA-256( serverSeed + ":" + drandRandomness )
#   score(id)    = SHA-256( combinedSeed + ":" + id )
#   permutation  = participants sorted by score DESC  (ties: id ASC)
#   allocation   = order[i] receives prizes[i]
# Same result as draw-verify.js / DrawVerify.java / draw_verify.cpp.
#
# Run:  python draw_verify.py <record.json> [id]
# ============================================================================
import hashlib, json, sys
from functools import cmp_to_key

def sha256(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def combined_seed(server, rand): return sha256(server + ':' + rand)
def score_of(combined, idv): return sha256(combined + ':' + idv)

def require_unique(parts):   # uvLs 3.1: duplicate ids break the total order -> reject, don't rank
    if len(set(parts)) != len(parts):
        raise ValueError('INVALID: duplicate participant ids - record rejected (uvLs 3.1)')

def _cmp(a, b):           # a,b = (score, id); score DESC, id ASC
    if a[0] > b[0]: return -1
    if a[0] < b[0]: return 1
    if a[1] < b[1]: return -1
    if a[1] > b[1]: return 1
    return 0

def permute(parts, combined):
    require_unique(parts)
    return sorted([(score_of(combined, i), i) for i in parts], key=cmp_to_key(_cmp))

def allocate(parts, combined, prizes):
    order = permute(parts, combined)
    return [{'id': p[1], 'rank': i + 1, 'prize': prizes[i] if i < len(prizes) else None} for i, p in enumerate(order)]

def lookup(parts, combined, idv, prizes):
    require_unique(parts)
    me = score_of(combined, idv)
    higher, present = 0, False
    for a in parts:
        if a == idv:
            present = True; continue
        s = score_of(combined, a)
        if s > me or (s == me and a < idv): higher += 1
    rank = higher + 1
    return {'id': idv, 'present': present, 'rank': rank,
            'prize': prizes[rank - 1] if present and rank <= len(prizes) else None}

# §6.1 proportional pools: a tier count derived from M as an integer num/den with one rounding
# mode. All-integer so JS (BigInt), Python, Java (long) and C++ (int64) agree; operands are
# non-negative, so integer division is floor.
def resolve_count(M, rule):
    num, den, mode = rule.get('num'), rule.get('den'), rule.get('mode', 'round-half-up')
    ints = all(isinstance(x, int) and not isinstance(x, bool) for x in (num, den, M))
    if not ints or den <= 0 or num < 0 or M < 0:
        raise ValueError('INVALID: proportional num/den/M must be non-negative integers with den>0 (uvLs 6.1)')
    if mode == 'floor': return (M * num) // den
    if mode == 'ceil':  return (M * num + den - 1) // den
    if mode == 'round-half-up': return (2 * M * num + den) // (2 * den)
    raise ValueError('INVALID: unknown rounding mode "%s" (uvLs 6.1)' % mode)

def pool_of(rec):
    if isinstance(rec.get('prizes'), list): return rec['prizes']
    r = rec.get('rules') or {}
    if isinstance(r.get('prizes'), list): return r['prizes']
    # a published draw record nests the pool under `rules` (uvLs 7); accept either shape.
    pp = rec['prizePool'] if isinstance(rec.get('prizePool'), list) else (r['prizePool'] if isinstance(r.get('prizePool'), list) else None)
    if pp is not None:
        M, prizes, total = len(rec['participants']), [], 0
        for t in pp:
            if not isinstance(t.get('tier'), str):
                raise ValueError('INVALID: tier label must be a string (uvLs 6)')
            if t.get('rule') is not None:
                count = resolve_count(M, t['rule'])
                if t.get('count') is not None and t['count'] != count:   # §6.1/§9.4 mismatch -> reject
                    raise ValueError('INVALID: tier "%s" count %s != rule-resolved %d (uvLs 6.1)' % (t['tier'], t['count'], count))
            else:
                if not isinstance(t.get('count'), int) or isinstance(t.get('count'), bool):
                    raise ValueError('INVALID: tier count must be a JSON integer (uvLs 6.1)')
                count = t['count']
            if total + count > M: count = M - total      # §6.1 ordering: clamp running total to M
            prizes.extend([t['tier']] * count)
            total += count
        return prizes
    n = rec.get('winners') or rec.get('N') or r.get('winners') or r.get('N') or 0
    return [rec.get('prizeLabel') or r.get('prizeLabel') or 'WIN'] * n

# -- §5.4 anchor round rule (optional) --
# drand quicknet: 3s period, genesis 1692803367. The DERIVED-R rule (uvLs 5.4.1) sets
# R = round_at(genTime)+1, so genTime < time_of_round(R) holds by construction and R is not the
# operator's choice. Confirm ORDERING here; verify the token itself with `openssl ts -verify`.
QN_GENESIS, QN_PERIOD = 1692803367, 3
def round_at(unix_sec): return (unix_sec - QN_GENESIS) // QN_PERIOD + 1
def time_of_round(rnd): return QN_GENESIS + (rnd - 1) * QN_PERIOD
def check_anchor_round(gen_time, rnd):
    expected = round_at(gen_time) + 1
    rt = time_of_round(rnd)
    return {'ok': rnd == expected and gen_time < rt, 'expectedRound': expected, 'roundTime': rt, 'genBeforeRound': gen_time < rt}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('usage: python draw_verify.py <record.json> [id]'); sys.exit(2)
    rec = json.load(open(sys.argv[1], encoding='utf-8'))
    try: require_unique(rec['participants'])
    except ValueError as e: print(e); sys.exit(1)
    combined = combined_seed(rec['serverSeed'], rec['drand']['randomness'])
    prizes = pool_of(rec)
    print('combinedSeed = SHA-256(serverSeed:drandRandomness) =', combined)
    ca = rec.get('commitmentAnchor')
    if ca and ca.get('genTime') is not None and rec.get('drand', {}).get('round') is not None and str(ca.get('roundRule', '')).startswith('roundAt'):
        c = check_anchor_round(ca['genTime'], rec['drand']['round'])
        print('5.4 derived-R: R==round_at(genTime)+1 ?', rec['drand']['round'] == c['expectedRound'],
              '| genTime<time_of_round(R) ?', c['genBeforeRound'], '->', 'OK' if c['ok'] else 'FAIL')
    if len(sys.argv) > 2:
        r = lookup(rec['participants'], combined, sys.argv[2], prizes)
        if r['present']:
            print('%s: rank %d of %d -> %s' % (r['id'], r['rank'], len(rec['participants']), r['prize'] or 'no prize'))
        else:
            print('%s: NOT in the committed list' % r['id'])
    else:
        a = allocate(rec['participants'], combined, prizes)
        winners = [x for x in a if x['prize'] is not None]
        print('%d prize(s) among %d participants:' % (len(winners), len(rec['participants'])))
        for w in winners:
            print('  #%d %s -> %s' % (w['rank'], w['id'], w['prize']))

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

def pool_of(rec):
    if isinstance(rec.get('prizes'), list): return rec['prizes']
    n = rec.get('winners') or rec.get('N') or 0
    return [rec.get('prizeLabel', 'WIN')] * n

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('usage: python draw_verify.py <record.json> [id]'); sys.exit(2)
    rec = json.load(open(sys.argv[1], encoding='utf-8'))
    try: require_unique(rec['participants'])
    except ValueError as e: print(e); sys.exit(1)
    combined = combined_seed(rec['serverSeed'], rec['drand']['randomness'])
    prizes = pool_of(rec)
    print('combinedSeed = SHA-256(serverSeed:drandRandomness) =', combined)
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

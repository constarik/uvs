#!/usr/bin/env python3
# ============================================================================
# UVS uvGacha - REFERENCE RESOLVER (Python 3, stdlib only). Mirrors gacha-resolve.js.
#   combinedSeed = SHA-256( serverSeed : clientSeed : drandRandomness )
#   u_i          = int(SHA-256(combinedSeed : i), 16) % D        # 256-bit, arbitrary precision
#   outcome      = the tier whose cumulative integer interval in [0,D) contains u_i
# Optional pity (uvGacha 5) is reconstructed by replay from pull 1, never stored (core 6.1).
#
# Run:  python gacha_resolve.py <record.json>     |     python gacha_resolve.py  (self-test)
# ============================================================================
import hashlib, json, sys, os

def sha256(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def combined_seed(server, client, drand): return sha256(server + ':' + client + ':' + (drand or ''))
def pull_value(combined, i, D): return int(sha256(combined + ':' + str(i)), 16) % D   # big int, no overflow

def validate_rules(rules, D):
    if not isinstance(D, int) or isinstance(D, bool) or D <= 0:
        raise ValueError('INVALID: rateDenominator must be a positive integer (uvGacha 4)')
    s = 0
    for t in rules['tiers']:
        if not isinstance(t.get('tier'), str):
            raise ValueError('INVALID: tier label must be a string (uvGacha 4)')
        if not isinstance(t.get('rate'), int) or isinstance(t.get('rate'), bool) or t['rate'] < 0:
            raise ValueError('INVALID: rate must be a non-negative integer (uvGacha 4)')
        s += t['rate']
    if s != D:
        raise ValueError('INVALID: rates sum to %d != D %d (uvGacha 4)' % (s, D))

def tier_of(tiers, u):
    acc = 0
    for t in tiers:
        acc += t['rate']
        if u < acc: return t['tier']
    raise ValueError('INVALID: u beyond cumulative range')

def resolve(rec):
    D = rec['rateDenominator']
    validate_rules(rec['rules'], D)
    drand = (rec.get('drand') or {}).get('randomness')
    combined = combined_seed(rec['serverSeed'], rec['clientSeed'], drand)
    pity = rec['rules'].get('pity')
    results, miss = [], 0
    for i in range(1, rec['pullCount'] + 1):
        u = pull_value(combined, i, D)
        if pity and miss + 1 >= pity['hardAfter']:
            tier, forced = pity['tier'], True
        else:
            tier, forced = tier_of(rec['rules']['tiers'], u), False
        results.append({'i': i, 'tier': tier, 'forced': forced})
        miss = 0 if (pity and tier == pity['tier']) else miss + 1
    return {'combined': combined, 'results': results}

if __name__ == '__main__':
    if len(sys.argv) > 1:
        r = resolve(json.load(open(sys.argv[1], encoding='utf-8')))
        print('combinedSeed =', r['combined'])
        for x in r['results']:
            print('  pull %d: %s%s' % (x['i'], x['tier'], '  (pity)' if x['forced'] else ''))
    else:
        d = os.path.dirname(os.path.abspath(__file__))
        tv = json.load(open(os.path.join(d, 'test-vectors-gacha.json'), encoding='utf-8'))
        A = resolve(tv['stateless']['record'])
        a_ok = A['combined'] == tv['stateless']['combinedSeed'] and [r['tier'] for r in A['results']] == tv['stateless']['tiers']
        B = resolve(tv['pity']['record'])
        b_ok = B['combined'] == tv['pity']['combinedSeed'] and B['results'] == tv['pity']['pulls']
        neg = False
        try:
            resolve(tv['negative']['rates-not-sum-D']['record'])
        except Exception:
            neg = True
        print('stateless', a_ok, '| pity', b_ok, '| rates-sum-reject', neg)
        print('gacha self-test', 'PASS' if (a_ok and b_ok and neg) else 'FAIL')

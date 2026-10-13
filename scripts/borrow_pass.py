#!/usr/bin/env python3
"""Final pass: token-similarity borrowing for still-unmatched products."""
import json, random, re
from collections import defaultdict

random.seed(11)

final = json.load(open('scripts/final-image-update.json'))
db = json.load(open('scripts/db-products-dump.json'))

STOP = {'the', 'and', 'with', 'for', 'set', 'series', 'range', 'products', 'product', 'new', 'use', 'only', 'nv'}

def toks(name):
    name = name.lower().replace('\\"', ' inch ').replace('"', ' inch ')
    ts = [t for t in re.findall(r'[a-z]{3,}', name) if t not in STOP]
    return set(ts)

matched = [p for p in db if str(p['id']) in final]
unmatched = [p for p in db if str(p['id']) not in final]

# index matched products by token
by_token = defaultdict(list)
for p in matched:
    for t in toks(p['name']):
        by_token[t].append(p)

borrowed = 0
still = 0
for p in unmatched:
    pt = toks(p['name'])
    cand = defaultdict(int)
    for t in pt:
        for mp in by_token.get(t, []):
            cand[mp['id']] += 1
    if cand:
        # pick the matched product sharing most tokens (tie-break random)
        best = sorted(cand.items(), key=lambda kv: (-kv[1], random.random()))
        top_score = best[0][1]
        pool = [pid for pid, sc in best if sc == top_score]
        donor = random.choice(pool)
        final[str(p['id'])] = final[str(donor)]
        borrowed += 1
    else:
        still += 1

print(f'borrowed: {borrowed}, still none: {still}')
print(f'Total with real photos: {len(final)} / {len(db)}')
json.dump(final, open('scripts/final-image-update.json', 'w'), indent=1)

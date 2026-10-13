#!/usr/bin/env python3
"""Build final image mapping: fuzzy matches + same-end-category fallbacks."""
import json, random
from collections import defaultdict

random.seed(7)

fuzzy = json.load(open('scripts/img-fuzzy-mapping.json'))
db = json.load(open('scripts/db-products-dump.json'))

# valid URLs only (drop the one relative-path entry)
final = {}
for pid, v in fuzzy.items():
    url = v['url']
    if url and url.startswith('http'):
        final[pid] = url

# index matched URLs by end/mid category
by_end = defaultdict(list)
by_mid = defaultdict(list)
for p in db:
    pid = str(p['id'])
    if pid in final:
        if p.get('end'):
            by_end[p['end']].append(pid)
        if p.get('mid'):
            by_mid[p['mid']].append(pid)

fallback_stats = {'matched': len(final), 'end_fallback': 0, 'mid_fallback': 0, 'none': 0}
for p in db:
    pid = str(p['id'])
    if pid in final:
        continue
    pool = []
    if p.get('end') and by_end.get(p['end']):
        pool = by_end[p['end']]
        src = 'end'
    elif p.get('mid') and by_mid.get(p['mid']):
        pool = by_mid[p['mid']]
        src = 'mid'
    if pool:
        final[pid] = final[random.choice(pool)]
        fallback_stats[f'{src}_fallback'] += 1
    else:
        fallback_stats['none'] += 1

print(fallback_stats)
print(f'Total products getting real photos: {len(final)} / {len(db)}')
json.dump(final, open('scripts/final-image-update.json', 'w'), indent=1)

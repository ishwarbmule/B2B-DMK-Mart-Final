#!/usr/bin/env python3
"""Fuzzy-match DB products to the new xlsx products (which carry real image URLs)."""
import json, re
from collections import defaultdict

COMPANY_PREFIXES = [
    'dmkpolymers', 'dmkmart', 'pariwarhouseholds', 'skyfurniture', 'mahanandaunbreakable',
    'mauliplastic', 'mahavirunbreakable', 'steelking', 'aplastic', 'deepplastic',
    'goldexkitchenequipments', 'borosil', 'shayadrihouseware', 'posai', 'hotpot',
    'samarthya', 'gardenneeds', 'mangofurniture', 'falcon', 'travelpartner',
]

ABBREV = {
    'ltr': 'ltr', 'ltrs': 'ltr', 'litre': 'ltr', 'litres': 'ltr', 'liter': 'ltr',
    'no': '', 'nos': '', 'pcs': '', 'pc': '', 'piece': '', 'pieces': '',
    'premium': 'premium', 'unbreakable': '',
}

def norm(s):
    if not s:
        return ''
    return str(s).lower().replace('\\"', '').replace('"', 'inch').replace('\u201d', 'inch').replace('\u2019', '')

def tokenize(s):
    return set(t for t in re.findall(r'[a-z]+|\d+(?:\.\d+)?', norm(s)) if t)

def strip_prefix(tokens):
    # remove company/brand prefix words found in token stream (joined form)
    name = ''.join(sorted(tokens))  # unused; work on string level instead
    return tokens

def core_tokens(name):
    toks = tokenize(name)
    # remove generic words
    stop = {'the', 'and', 'with', 'for', 'new', 'product', 'products', 'nv', 'v', 'c', 'b'}
    toks = toks - stop
    return toks

def jaccard(a, b):
    if not a or not b:
        return 0
    return len(a & b) / len(a | b)

def size_tokens(toks):
    return set(t for t in toks if re.match(r'\d', t))

def load():
    db = json.load(open('scripts/db-products-dump.json'))
    file_rows = json.load(open('scripts/file-products-norm.json'))
    return db, file_rows

def main():
    db, file_rows = load()
    # Build file index
    file_entries = []  # (normkey, core_tokens, size_tokens, url, name)
    for key, fr in file_rows.items():
        toks = core_tokens(fr['name'])
        file_entries.append({
            'toks': toks, 'sizes': size_tokens(toks),
            'url': fr['url'], 'name': fr['name'], 'key': key,
        })

    matched = {}      # db id -> url
    unmatched = []
    for pr in db:
        toks = core_tokens(pr['name'])
        sizes = size_tokens(toks)
        best = None
        best_score = 0
        for fe in file_entries:
            inter = toks & fe['toks']
            union = toks | fe['toks']
            j = len(inter) / len(union) if union else 0
            # size agreement boost/penalty
            size_ok = (sizes == fe['sizes']) or (sizes and fe['sizes'] and (sizes & fe['sizes']))
            score = j * (1.15 if size_ok else 0.8)
            # require either high jaccard or (good jaccard + same sizes)
            if score > best_score:
                best_score = score
                best = fe
        if best and ((best_score >= 0.62) or (best_score >= 0.5 and best['sizes'] == sizes and len(toks & best['toks']) >= 3)):
            if best['url']:
                matched[pr['id']] = {'url': best['url'], 'file_name': best['name'], 'db_name': pr['name'], 'score': round(best_score, 3)}
        else:
            unmatched.append({'id': pr['id'], 'name': pr['name']})

    with_url = {k: v for k, v in matched.items() if v['url']}
    print(f'DB products: {len(db)}')
    print(f'Matched with image URL: {len(with_url)}')
    print(f'Unmatched/without URL: {len(db) - len(with_url)}')
    # sanity samples
    import itertools
    for k, v in itertools.islice(matched.items(), 8):
        print(f"  [{v['score']}] DB: {v['db_name'][:45]}  <=  FILE: {v['file_name'][:45]}")
    json.dump(matched, open('scripts/img-fuzzy-mapping.json', 'w'), indent=1)

if __name__ == '__main__':
    main()

"""Tune fuzzy matching v2: tokens from RAW names both sides, overlap coefficient, number agreement."""
import json, re, unicodedata

BASE = "/home/z/my-project/scripts"
neon = json.load(open(f"{BASE}/neon-pull.json"))
old = json.load(open(f"{BASE}/dmk-catalog.json"))

def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).lower()
    return re.sub(r"[^a-z0-9]+", "", s)

def tokens(s):
    return set(re.findall(r"[a-z0-9]+", str(s).lower()))

def nums(t):
    return {x for x in t if x.isdigit()}

def overlap(a, b):
    if not a or not b: return 0.0
    return len(a & b) / min(len(a), len(b))

# index raw names
old_list = []
for op in old["products"]:
    old_list.append((norm(op["name"]), tokens(op["name"]), nums(tokens(op["name"])), op))

def strip_brand(name, company, brand):
    n = str(name)
    for prefix in (company, brand):
        p = (prefix or "").strip()
        if p and n.lower().startswith(p.lower()):
            n = n[len(p):].strip()
    return n

for THRESH in (0.75, 0.66, 0.6):
    matched, unmatched = 0, []
    for np in neon["products"]:
        nm = strip_brand(np["name"], np.get("company"), np.get("brand"))
        t = tokens(nm); nnums = nums(t)
        best, bs = None, 0.0
        for on, ot, onums, op in old_list:
            s = overlap(t, ot)
            if s > bs:
                if nnums and onums and not (nnums & onums):
                    continue
                best, bs = on, s
        if bs >= THRESH:
            matched += 1
        else:
            unmatched.append((np["sku"], np["name"], round(bs, 2)))
    print(f"THRESH {THRESH}: matched {matched}/2272")
    if THRESH == 0.6:
        print("  sample unmatched:", unmatched[:12])

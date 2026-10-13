"""Merge Neon ERP catalog (authoritative) with legacy local data (images, categories, flags).
Output: scripts/catalog-final.json for seeding.

Sources:
  scripts/neon-pull.json          2,272 ERP products (sku, prices, stock, brand, photoUrl)
  scripts/dmk-catalog.json        old 2,400 products (top/mid/end, flags, old brand)
  scripts/final-image-update.json old product id -> Cloudinary image URL (2,400)
  scripts/brand-logo-urls.json    39 Cloudinary brand logos
"""
import json, re, hashlib, unicodedata
from collections import defaultdict

BASE = "/home/z/my-project/scripts"

neon = json.load(open(f"{BASE}/neon-pull.json"))
old = json.load(open(f"{BASE}/dmk-catalog.json"))
img_map = json.load(open(f"{BASE}/final-image-update.json"))
logos = json.load(open(f"{BASE}/brand-logo-urls.json"))

neon_products = neon["products"]
warehouse = neon["warehouse"]
old_products = old["products"]  # sku, name, brand, top, mid, end, dealerPrice..., flags
old_tops = old["tops"]

# ---------- helpers ----------
def norm(s):
    if not s: return ""
    s = unicodedata.normalize("NFKD", str(s))
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s

def tokens(s):
    return set(re.findall(r"[a-z0-9]+", str(s).lower()))

def tok_jaccard(a, b):
    if not a or not b: return 0.0
    return len(a & b) / len(a | b)

def slugify(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:70] or "item"

def det_hash(s, mod):
    return int(hashlib.md5(str(s).encode()).hexdigest(), 16) % mod

# ---------- brand canonicalization ----------
BRANDS = [
    ("Deep Household",          ["deep household","deep","sun deep","DEEP"]),
    ("Garden Needs",            ["garden needs","gardens need","garden need"]),
    ("Goldex Kitchen Equipments",["goldex kitchen equipments","goldex"]),
    ("Pariwar Households",      ["pariwar households","parivar households","pariwar","parivar","parivar ceramic"]),
    ("Samarthya Cleaning",      ["samarthya cleaning","samarthya"]),
    ("Steel King Cleaning",     ["steel king cleaning","steel king"]),
    ("Mahananda Unbreakable",   ["mahananda unbreakable","mahananda"]),
    ("Namo",                    ["namo","naamo"]),
    ("Sky Furniture",           ["sky furniture"]),
    ("Mango Furniture",         ["mango furniture","mango"]),
    ("Falcon Garden Tools",     ["falcon garden tools","falcon"]),
    ("Shreeji Kitchenware",     ["shreeji kitchenware","shreeji"]),
    ("Shradha Unbreakable",     ["shradha unbreakable","shradha"]),
    ("Mahavir Unbreakable",     ["mahavir unbreakable","mahavir"]),
    ("Mauli Plastic",           ["mauli plastic","mauli"]),
    ("Black",                   ["black","black household"]),
    ("AP Plastics",             ["ap plastics","ap plastic","a p plastics"]),
    ("Borosil Kitchenware",     ["borosil kitchenware","borosil","pronto"]),
    ("Belstar",                 ["belstar"]),
    ("Posai Jar",               ["posai jar","posai"]),
    ("Sahayadri",               ["sahayadri","sahyadri"]),
    ("Hirva Kitchenware",       ["hirva kitchenware","hirva"]),
    ("Supreme Plastics",        ["supreme","supreme plastics"]),
    ("Nayasa",                  ["nayasa"]),
    ("Hariware Plastic",        ["haridware plastic","hariware plastic","hariware","haridware"]),
    ("SAI",                     ["sai","sai plastics"]),
    ("Samruddhi Plastic",       ["samruddhi","samruddhi plastic","samruddhi plastics"]),
    ("Paras Plastics",          ["paras","paras plastics"]),
    ("Novae Plastic",           ["novae","novae plastic"]),
    ("Himalaya Thermoplast",    ["himalaya thermoplast","himalaya thrmoplast","himalay","himlay","himalaya"]),
    ("Milton Kitchenware",      ["milton","milton kitchenware"]),
    ("Anupam Royals Furnitures",["anupam royals","anupam royals furnitures","anupam"]),
    ("Hawkins",                 ["hawkins","hawkins pvt"]),
    ("Prestige",                ["prestige","prestige ltd"]),
    ("Anjali Kitchenware",      ["anjali","anjali kitchenware"]),
    ("Jaipan Home Appliance",   ["jaipan","jaipan home appliance"]),
    ("HD Polyplast",            ["hd poly plast","hd polyplast","hd"]),
    ("Galaxy Garden",           ["galaxy garden","galaxy"]),
    ("DMK Mart",                ["dmk mart","dmk polymers","dmk","drum","none",""]),
]

brand_alias = {}
for canon, aliases in BRANDS:
    for a in aliases:
        brand_alias[norm(a)] = canon

def brand_key_from(company, brand):
    for raw in (company, brand):
        n = norm(raw)
        if n and n in brand_alias:
            return brand_alias[n]
        if n:
            # prefix/prefix containment fallback
            for alias_norm, canon in brand_alias.items():
                if alias_norm and (n.startswith(alias_norm) or alias_norm.startswith(n)) and len(alias_norm) >= 4:
                    return canon
    return "DMK Mart"

# canonical -> slug + logo
brand_defs = {}
for canon, _ in BRANDS:
    slug = slugify(canon)
    logo = logos.get(slug, "")
    brand_defs[canon] = {"name": canon, "slug": slug, "logo": logo, "aliases": sorted({a for a, c in brand_alias.items() if c == canon})}

# logo key variants (cloudinary ids differ slightly from canonical names)
LOGO_KEY_OVERRIDES = {
    "Himalaya Thermoplast": "himalaya-thrmoplast",
    "Hariware Plastic": "haridware-plastic",
    "Hawkins": "hawkins-pvt",
    "Prestige": "prestige-ltd",
    "Anjali Kitchenware": "anjali-kitchenware",
    "Anupam Royals Furnitures": "anupam-royals-furnitures",
    "Jaipan Home Appliance": "jaipan-home-appliance",
    "Milton Kitchenware": "milton-kitchenware",
    "Borosil Kitchenware": "borosil-kitchenware",
    "Hirva Kitchenware": "hirva-kitchenware",
    "Samruddhi Plastic": "samruddhi-plastic",
    "Paras Plastics": "paras-plastics",
    "Novae Plastic": "novae-plastic",
    "Namo": "namo",
    "HD Polyplast": "hd-polyplast",
    "Galaxy Garden": "galaxy-garden",
    "Shreeji Kitchenware": "shreeji-kitchenware",
    "DMK Mart": "dmk-mart",
    "Samarthya Cleaning": "samarthya-cleaning",
    "Steel King Cleaning": "steel-king-cleaning",
    "Goldex Kitchen Equipments": "goldex-kitchen-equipments",
    "Mahavir Unbreakable": "mahavir-unbreakable",
    "Mahananda Unbreakable": "mahananda-unbreakable",
    "Shradha Unbreakable": "shradha-unbreakable",
    "Mauli Plastic": "mauli-plastic",
    "Pariwar Households": "pariwar-households",
    "Posai Jar": "posai-jar",
    "AP Plastics": "ap-plastics",
    "Deep Household": "deep-household",
    "Falcon Garden Tools": "falcon-garden-tools",
    "Garden Needs": "garden-needs",
    "Sky Furniture": "sky-furniture",
    "Mango Furniture": "mango-furniture",
}
for canon, key in LOGO_KEY_OVERRIDES.items():
    if key in logos:
        brand_defs[canon]["logo"] = logos[key]

# ---------- old product indexes ----------
old_by_norm = {}
for op in old_products:
    old_by_norm.setdefault(norm(op["name"]), op)

# token index on RAW names (for fuzzy v2)
old_token_list = []
for op in old_products:
    tk = tokens(op["name"])
    old_token_list.append((norm(op["name"]), tk, {x for x in tk if x.isdigit()}, op))

def nums_of(t):
    return {x for x in t if x.isdigit()}

def strip_brand_prefix(name, company, brand):
    n = str(name)
    for prefix in (company, brand):
        p = (prefix or "").strip()
        if p and n.lower().startswith(p.lower()):
            n = n[len(p):].strip()
    return n

def fuzzy_find_old(name, company, brand, thresh=0.66):
    t = tokens(strip_brand_prefix(name, company, brand))
    if not t:
        return None, 0.0
    nnums = nums_of(t)
    best, bs = None, 0.0
    for on, ot, onums, op in old_token_list:
        if not ot: continue
        s = len(t & ot) / min(len(t), len(ot))
        if s > bs:
            if nnums and onums and not (nnums & onums):
                continue
            best, bs = op, s
    return (best, bs) if bs >= thresh else (None, 0.0)

# old images by id (ids live in db-products-dump.json)
dbdump = json.load(open(f"{BASE}/db-products-dump.json"))
old_img = {}
for dp in dbdump:
    u = img_map.get(dp["id"])
    if u:
        old_img[norm(dp["name"])] = u

# ---------- category keyword fallback ----------
TOP_BY_KEYWORD = [
    ("Gardening Tools & Planters", ["planter","pot ","pots","garden","plant","nursery","jali","railing","hanging","flower","seed","tool"]),
    ("WATER JAR  & BOTTLE", ["jar","bottle","casserole","dispenser","theroware","thermo"," flask"]),
    ("Kitchen Equipments Commercial", ["pulveriser","machine","commercial","grinder","mixer","stove","gas","oven","juicer","kadai","tilting","wet grinder"]),
    ("Furniture", ["chair","table","stool","bench","sofa","desk","cupboard","rack","shelf","furniture"]),
    ("HouseHold Unbreakable", ["bucket","tub","drum","dustbin","basin","mug","bowl","dabba","container","storage","unbreakable","matka","balti","hawda","lota","charti","chappar","dolara","kunda","pali","ganesh","cohda","coddah","box"]),
    ("KITCHEN WARE", ["kitchen","spoon","plate","glass","tray","jar","tumbler","server","cutter","peeler","knife","grater","strainer","lid","chopper","stand","organizer","dish","cups"]),
    ("Clening & HouseHolds", ["mop","wiper","brush","broom","clean","dust","garbage","scrub","toilet","napkin","wiping","cloth","hanger","dryer","floor"]),
    ("Home Decor", ["decor","flower","vase","showpiece","clock","photo","frame","wall","basket","planter box"]),
    ("NV PRODUCTS-FERIWALA", ["nv","feriwala","basket","crate","hamper"]),
]

def top_by_text(*texts):
    joined = " " + " ".join(str(t) for t in texts if t).lower() + " "
    for top, kws in TOP_BY_KEYWORD:
        for kw in kws:
            if kw in joined:
                return top
    return "HouseHold Unbreakable"

# ---------- matching ----------
used_old_norms = set()
results = []
no_img = []

for np in neon_products:
    sku = (np.get("sku") or "").strip()
    name = (np.get("name") or "").strip()
    company = (np.get("company") or "").strip()
    brand_raw = (np.get("brand") or "").strip()
    erp_cat = (np.get("category") or "").strip()

    canon_brand = brand_key_from(company, brand_raw)
    bdef = brand_defs[canon_brand]

    # match old product
    n = norm(name)
    op = old_by_norm.get(n)
    match_score = 1.0 if op else 0.0
    if not op:
        op, match_score = fuzzy_find_old(name, company, brand_raw)

    # image
    image = ""
    if op:
        image = old_img.get(norm(op["name"]), "")
    if not image and np.get("photoUrl"):
        image = np["photoUrl"]
    if not image:
        no_img.append({"sku": sku, "name": name, "end": (op or {}).get("end", erp_cat), "mid": (op or {}).get("mid", ""), "brand": canon_brand})

    # categories
    top = mid = end = None
    if op:
        top, mid, end = op.get("top"), op.get("mid"), op.get("end")
    if not top:
        top = top_by_text(name, erp_cat, canon_brand)
    if not mid:
        mid = erp_cat or "General"
    if not end:
        end = erp_cat or "General"

    # stock: prefer warehouse rollup
    w = warehouse.get(np.get("id") or "", {})
    stock = float(w.get("qty") if w.get("qty") is not None else (np.get("stockQuantity") or 0))

    t1 = float(np.get("tier1Distributor") or 0)
    t2 = float(np.get("tier2Wholesale") or 0)
    t3 = float(np.get("tier3SemiWholesale") or 0)
    t4 = float(np.get("tier4Retailer") or 0)
    t5 = float(np.get("tier5Mrp") or 0)
    dealer = t4 if t4 > 0 else (t5 if t5 > 0 else t3)
    mrp = t5 if t5 > 0 else dealer
    base = t3 if t3 > 0 else dealer

    results.append({
        "erpId": np.get("id") or "",
        "sku": sku,
        "name": name,
        "brand": canon_brand,
        "company": company,
        "brandRaw": brand_raw,
        "top": top, "mid": mid, "end": end,
        "unit": np.get("unit") or "Pcs",
        "packQty": int(np.get("packQty") or 1),
        "piecesPerBox": int(np.get("piecesPerBox") or 0),
        "purchaseCost": float(np.get("purchaseCost") or 0),
        "tier1": t1, "tier2": t2, "tier3": t3, "tier4": t4, "tier5": t5,
        "dealerPrice": round(dealer, 2),
        "basePrice": round(base, 2),
        "mrp": round(mrp, 2),
        "packPrice": float(np.get("packPrice") or 0),
        "packDiscountPct": float(np.get("packDiscountPercent") or 0),
        "stock": stock,
        "damaged": float(np.get("damagedStock") or 0),
        "reserved": float(np.get("reservedQty") or 0),
        "lowStockThreshold": int(float(np.get("lowStockThreshold") or 10)),
        "barcode": (np.get("barcode") or "").strip(),
        "hsn": (np.get("hsnCode") or "").strip(),
        "gst": float(np.get("gstRate") or 0),
        "weightGrams": float(np.get("weightGrams") or 0),
        "image": image,
        "isActive": bool(np.get("isActive")),
        # inherited merchandising
        "isFeatured": bool(op.get("isFeatured")) if op else False,
        "isTop": bool(op.get("isTop")) if op else False,
        "isHot": bool(op.get("isHot")) if op else False,
        "rating": round(3.6 + det_hash(sku, 14) / 10, 1),
        "reviewCount": 12 + det_hash(sku + "r", 468),
        "matchScore": match_score,
    })
    if op:
        used_old_norms.add(norm(op["name"]))

# ---------- borrow images for no-image products (same end -> mid -> brand -> any) ----------
pool_by_end, pool_by_mid, pool_any = defaultdict(list), defaultdict(list), []
for r in results:
    if r["image"]:
        pool_by_end[norm(r["end"])].append(r["image"])
        pool_by_mid[norm(r["mid"])].append(r["image"])
        pool_any.append(r["image"])

for item in no_img:
    e, m = norm(item["end"]), norm(item["mid"])
    img = None
    if e and pool_by_end.get(e): img = pool_by_end[e][det_hash(item["sku"], len(pool_by_end[e]))]
    elif m and pool_by_mid.get(m): img = pool_by_mid[m][det_hash(item["sku"], len(pool_by_mid[m]))]
    elif pool_any: img = pool_any[det_hash(item["sku"] + "b", len(pool_any))]
    for r in results:
        if r["sku"] == item["sku"]:
            r["image"] = img or ""
            break

# ---------- deals of the day: top discounts ----------
with_price = [r for r in results if r["isActive"] and r["dealerPrice"] > 0 and r["mrp"] > r["dealerPrice"]]
with_price.sort(key=lambda r: (r["mrp"] - r["dealerPrice"]) / max(r["mrp"], 1), reverse=True)
per_brand = defaultdict(int)
deal_count = 0
for r in with_price:
    if deal_count >= 90: break
    if per_brand[r["brand"]] >= 10: continue
    r["isDeal"] = True
    disc = 1 - r["dealerPrice"] / r["mrp"] if r["mrp"] else 0
    r["dealPrice"] = round(r["dealerPrice"] * (1 - min(0.15, disc * 0.2)), 2)
    per_brand[r["brand"]] += 1
    deal_count += 1

# ---------- output ----------
brands_out = []
for canon, b in brand_defs.items():
    count = sum(1 for r in results if r["brand"] == canon)
    brands_out.append({
        **b,
        "productCount": count,
        "isFeatured": count >= 30,
        "sortOrder": count,
    })
brands_out.sort(key=lambda b: -b["productCount"])

tops_out = []
seen_top = set()
for t in old_tops:
    if t["name"] in {r["top"] for r in results}:
        tops_out.append(t); seen_top.add(t["name"])
for r in results:
    if r["top"] not in seen_top:
        emoji = {"Furniture":"🪑","Gardening Tools & Planters":"🪴","Clening & HouseHolds":"🧹","Home Decor":"🖼️","HouseHold Unbreakable":"🪣","KITCHEN WARE":"🍽️","Kitchen Equipments Commercial":"⚙️","NV PRODUCTS-FERIWALA":"🧺","WATER JAR  & BOTTLE":"🫙"}.get(r["top"], "🧺")
        tops_out.append({"name": r["top"], "emoji": emoji, "image": "", "sortOrder": len(tops_out)})
        seen_top.add(r["top"])

mids_out, ends_out = [], []
seen_mid, seen_end = set(), set()
for r in results:
    mk = (r["top"], r["mid"]); ek = (r["mid"], r["end"])
    if mk not in seen_mid:
        mids_out.append({"name": r["mid"], "top": r["top"]}); seen_mid.add(mk)
    if ek not in seen_end:
        ends_out.append({"name": r["end"], "mid": r["mid"]}); seen_end.add(ek)

out = {"brands": brands_out, "tops": tops_out, "mids": mids_out, "ends": ends_out, "products": results}
json.dump(out, open(f"{BASE}/catalog-final.json", "w"), indent=1)

# ---------- stats ----------
matched = sum(1 for r in results if r["matchScore"] >= 0.72)
active = sum(1 for r in results if r["isActive"])
withimg = sum(1 for r in results if r["image"])
cloud = sum(1 for r in results if r["image"].startswith("http"))
print(f"NEON products merged: {len(results)}")
print(f"  matched to legacy (inherit cat/flags/img): {matched}")
print(f"  brand-new (no legacy pair): {len(results) - matched}")
print(f"  active: {active} | inactive: {len(results) - active}")
print(f"  with images: {withimg} ({cloud} cloudinary)")
print(f"  brands: {len(brands_out)} | tops: {len(tops_out)} | mids: {len(mids_out)} | ends: {len(ends_out)}")
print(f"  deals (isDeal): {deal_count}")
print("  brand distribution:", {b["name"]: b["productCount"] for b in brands_out[:12]})
nol = [r for r in results if not r["image"]]
print(f"  STILL no image: {len(nol)}", [r['sku'] for r in nol[:8]])

#!/bin/bash
# End-to-end test: ERP webhook push → active/inactive mapping → storefront/admin behavior
B="http://localhost:3000"
K="testkey123"

echo "=== 1. ERP auto-push: 4 products with mixed flag styles + relative image paths ==="
curl -s -X POST "$B/api/inventory/webhook" -H "content-type: application/json" -H "x-api-key: $K" -d '{
  "products": [
    {"sku":"TEST-ACT-1","name":"Steel Water Bottle 1L","company":"DMK Mart","brand":"DMK Home","category":"HouseHold Unbreakable","unit":"Pcs","gstRate":18,"purchaseCost":120,"tier4Retailer":180,"tier5Mrp":220,"stockQuantity":50,"image":"uploads/products/bottle-1l.jpg","status":1},
    {"sku":"TEST-INA-1","name":"Plastic Bucket 20L","company":"DMK Mart","brand":"DMK Home","category":"HouseHold Unbreakable","unit":"Pcs","gstRate":18,"purchaseCost":90,"tier4Retailer":140,"tier5Mrp":170,"stockQuantity":30,"image":"uploads/products/bucket-20l.jpg","status":"N"},
    {"sku":"TEST-ACT-2","name":"Unbreakable Dinner Set 32pc","company":"DMK Mart","brand":"DMK Home","category":"HouseHold Unbreakable","unit":"Set","gstRate":18,"purchaseCost":850,"tier4Retailer":1250,"tier5Mrp":1499,"stockQuantity":12,"image":"uploads/products/dinner-32.jpg","status":"Active"},
    {"sku":"TEST-INA-2","name":"Garden Hose 10m","company":"DMK Mart","brand":"DMK Green","category":"General","unit":"Pcs","gstRate":18,"purchaseCost":200,"tier4Retailer":320,"tier5Mrp":399,"stockQuantity":8,"image":"","productStatus":"inactive"}
  ]
}' | head -c 300
echo; echo

echo "=== 2. Storefront /api/products: which TEST SKUs are visible? ==="
curl -s "$B/api/products?q=TEST-" | python3 -c "
import sys, json
d = json.load(sys.stdin)
rows = d.get('products', d.get('rows', d if isinstance(d, list) else []))
print('visible on storefront:', [r['sku'] for r in rows])"
echo

TOKEN=$(curl -s -X POST "$B/api/admin/login" -H "content-type: application/json" -d '{"loginId":"B2B DMK Mart","password":"1234"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
echo "=== 3. Admin list (status=inactive): inactive visible for admin only? ==="
curl -s "$B/api/admin/products?status=inactive" -H "authorization: Bearer $TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
rows = d.get('rows', [])
print('admin sees inactive:', [(r['sku'], r['active'], r.get('activeSource')) for r in rows if r['sku'].startswith('TEST')])"
echo

echo "=== 4. Bulk ACTIVATE the two inactive ones (admin decision) ==="
IDS=$(curl -s "$B/api/admin/products?status=inactive" -H "authorization: Bearer $TOKEN" | python3 -c "
import sys, json
rows = json.load(sys.stdin).get('rows', [])
print(json.dumps([r['id'] for r in rows if r['sku'].startswith('TEST')]))")
curl -s -X POST "$B/api/admin/products/flags" -H "content-type: application/json" -H "authorization: Bearer $TOKEN" -d "{\"ids\":$IDS,\"flag\":\"active\",\"value\":true}" | head -c 100
echo; echo

echo "=== 5. Re-send the SAME ERP push (ERP still says inactive) — admin decision must STICK ==="
curl -s -X POST "$B/api/inventory/webhook" -H "content-type: application/json" -H "x-api-key: $K" -d '{
  "products": [
    {"sku":"TEST-INA-1","name":"Plastic Bucket 20L","company":"DMK Mart","brand":"DMK Home","category":"HouseHold Unbreakable","unit":"Pcs","gstRate":18,"purchaseCost":90,"tier4Retailer":140,"tier5Mrp":170,"stockQuantity":30,"image":"uploads/products/bucket-20l.jpg","status":"N"},
    {"sku":"TEST-INA-2","name":"Garden Hose 10m","company":"DMK Mart","brand":"DMK Green","category":"General","unit":"Pcs","gstRate":18,"purchaseCost":200,"tier4Retailer":320,"tier5Mrp":399,"stockQuantity":8,"image":"","productStatus":"inactive"}
  ]
}' | head -c 200
echo
curl -s "$B/api/products?q=TEST-" | python3 -c "
import sys, json
d = json.load(sys.stdin)
rows = d.get('products', d.get('rows', d if isinstance(d, list) else []))
print('visible on storefront after ERP re-push:', sorted(r['sku'] for r in rows))"
echo

echo "=== 6. Images resolved with ERP base? (should be empty base → relative stays, check admin record) ==="
curl -s "$B/api/admin/products?q=TEST-ACT-1" -H "authorization: Bearer $TOKEN" | python3 -c "
import sys, json
rows = json.load(sys.stdin).get('rows', [])
for r in rows: print('image:', r['image'])"

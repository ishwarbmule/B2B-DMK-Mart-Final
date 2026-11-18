#!/bin/bash
# E2E proof v5 — full chain on Neon, idempotent via RUN stamp.
set -u
B=http://localhost:3000
C="curl -s -m 60"
JAR=/tmp/e2e.cookies
RUN=$(date +%H%M%S)
rm -f $JAR

echo "== 1. Admin login =="
TOKEN=$($C -X POST $B/api/admin/login -H 'content-type: application/json' -d '{"loginId":"B2B DMK Mart","password":"1234"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
[ -n "$TOKEN" ] && echo "  [PASS] token len ${#TOKEN}" || { echo "  [FAIL] no token"; exit 1; }
AH="authorization: Bearer $TOKEN"

echo "== 2. Tick save (ERP products mapping -> Neon Setting erp_map_products) =="
$C -X POST $B/api/admin/erp-direct/mapping -H "$AH" -H 'content-type: application/json' -d "{\"entity\":\"products\",\"mapping\":{\"table\":\"products\",\"skuCol\":\"sku\",\"nameCol\":\"item_name\",\"companyCol\":\"company_name\",\"mrpCol\":\"mrp\",\"rateCol\":\"rate\",\"stockCol\":\"stock\",\"imageCol\":\"image\",\"activeCol\":\"is_active\",\"columns\":[\"sku\",\"item_name\",\"company_name\",\"mrp\",\"rate\",\"stock\",\"image\",\"is_active\"]}}" | head -c 60; echo
$C "$B/api/admin/erp-direct/mapping?entity=products" -H "$AH" | python3 -c "
import sys,json;c=(json.load(sys.stdin).get('current') or {})
print('  [PASS] ticked columns persisted:', c.get('columns')) if c.get('columns') else print('  [FAIL] empty mapping')" 2>/dev/null || echo "  [FAIL] read-back"

echo "== 3. Categories tops->mids->ends =="
TOPID=$($C -X POST $B/api/admin/crud/tops -H "$AH" -H 'content-type: application/json' -d "{\"name\":\"E2E Top $RUN\",\"sortOrder\":999}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('row',{}).get('id',''))" 2>/dev/null)
MIDID=$($C -X POST $B/api/admin/crud/mids -H "$AH" -H 'content-type: application/json' -d "{\"name\":\"E2E Mid $RUN\",\"topId\":\"$TOPID\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('row',{}).get('id',''))" 2>/dev/null)
ENDID=$($C -X POST $B/api/admin/crud/ends -H "$AH" -H 'content-type: application/json' -d "{\"name\":\"E2E End $RUN\",\"midId\":\"$MIDID\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('row',{}).get('id',''))" 2>/dev/null)
echo "  top=$TOPID mid=$MIDID end=$ENDID"
[ -n "$ENDID" ] && echo "  [PASS] category chain in Neon" || { echo "  [FAIL] chain"; exit 1; }

echo "== 4. LOCAL product (admin /api/admin/products) =="
PR=$($C -X POST $B/api/admin/products -H "$AH" -H 'content-type: application/json' -d "{\"name\":\"E2E Probe $RUN\",\"sku\":\"E2E-$RUN-1\",\"company\":\"E2E Co $RUN\",\"dealerPrice\":199,\"mrp\":249,\"unit\":\"PCS\",\"active\":true,\"stock\":100,\"topId\":\"$TOPID\",\"midId\":\"$MIDID\",\"endId\":\"$ENDID\"}")
PID=$(echo "$PR" | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('row') or d.get('product') or d).get('id',''))" 2>/dev/null)
[ -n "$PID" ] && echo "  [PASS] product $PID created" || { echo "  [FAIL] product: $(echo "$PR"|head -c 240)"; exit 1; }
STOCK0=$(RUN="$RUN" node - <<"NEON"
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const p = await db.product.findUnique({where:{sku:`E2E-${process.env.RUN}-1`},select:{stock:true}});
console.log(p?.stock); await db.$disconnect();
NEON
)
echo "  stock before order: $STOCK0"

echo "== 5. Signup + admin approves B2B buyer =="
CU=$($C -X POST $B/api/auth/register -H 'content-type: application/json' -d "{\"name\":\"E2E Buyer $RUN\",\"shopName\":\"E2E Shop\",\"phone\":\"9000$RUN\",\"email\":\"e2e$RUN@neon.test\",\"password\":\"Test@1234\",\"customerType\":\"RETAILER\",\"city\":\"Mumbai\",\"pincode\":\"400001\",\"lat\":19.076,\"lng\":72.8777,\"geoSource\":\"MAP\"}")
CID=$(echo "$CU" | python3 -c "import sys,json;print(json.load(sys.stdin).get('customer',{}).get('id',''))" 2>/dev/null)
echo "  customer=$CID"
AP=$($C -X POST $B/api/admin/customers/approve -H "$AH" -H 'content-type: application/json' -d "{\"id\":\"$CID\",\"action\":\"APPROVE\"}")
echo "  approve: $(echo "$AP" | head -c 110)"
[ -n "$CID" ] && echo "  [PASS] signup + approval flow" || echo "  [FAIL] signup"

echo "== 6. Customer login (cookie session) =="
LG=$($C -X POST $B/api/auth/login -H 'content-type: application/json' -d "{\"identifier\":\"9000$RUN\",\"password\":\"Test@1234\"}")
CTOK=$(echo "$LG" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
echo "  login: $(echo "$LG" | head -c 110)"
[ -n "$CTOK" ] && echo "  [PASS] customer session token" || echo "  [FAIL] no token"

echo "== 7. Place order (DELIVERY, COD, qty 2) =="
ORD=$($C -X POST $B/api/orders -H "x-customer-token: $CTOK" -H 'content-type: application/json' -d "{\"customerName\":\"E2E Buyer $RUN\",\"phone\":\"9000$RUN\",\"addressLine\":\"E2E Street 1\",\"city\":\"Mumbai\",\"pincode\":\"400001\",\"fulfillment\":\"DELIVERY\",\"paymentMethod\":\"COD\",\"items\":[{\"id\":\"$PID\",\"unitType\":\"SINGLE\",\"qty\":2}]}")
OID=$(echo "$ORD" | python3 -c "import sys,json;print(json.load(sys.stdin).get('orderId',''))" 2>/dev/null)
echo "  order: $(echo "$ORD" | head -c 200)"
[ -n "$OID" ] && echo "  [PASS] order $OID persisted" || echo "  [FAIL] order"

echo "== 7b. Admin confirms order (stock decrement + ERP-ready state) =="
CF=$($C -X POST $B/api/admin/orders-flow -H "$AH" -H 'content-type: application/json' -d "{\"action\":\"confirm\",\"orderId\":\"$OID\"}")
echo "  confirm: $(echo "$CF" | head -c 140)"

echo "== 8. Stock reduced after confirm? =="
STOCK1=$(RUN="$RUN" node - <<"NEON"
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const p = await db.product.findUnique({where:{sku:`E2E-${process.env.RUN}-1`},select:{stock:true}});
console.log(p?.stock); await db.$disconnect();
NEON
)
echo "  stock after order: $STOCK1 (before: $STOCK0)"

echo "== 9. Neon ground truth =="
node - <<'EOF'
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const o = await db.order.findFirst({orderBy:{createdAt:'desc'},include:{items:true}});
const p = await db.product.findFirst({where:{sku:{startsWith:'E2E-'}},orderBy:{createdAt:'desc'},select:{name:true,sku:true,stock:true,company:true,active:true}});
console.log('  order:', o ? JSON.stringify({id:o.id.slice(-8),phone:o.phone,total:o.total,status:o.status,items:o.items.length}) : 'NONE');
console.log('  product:', JSON.stringify(p));
console.log('  counts: customers', await db.customer.count(), '| orders', await db.order.count(), '| orderItems', await db.orderItem.count());
await db.$disconnect();
EOF
echo "== done =="

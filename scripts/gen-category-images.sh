#!/bin/bash
# Category + warehouse artwork for DMK Mart (generated, brand-consistent).
set -u
OUT=/home/z/my-project/scripts/gen-imgs
mkdir -p "$OUT"
gen() { # prompt, out
  if [ -s "$2" ]; then echo "skip $2"; return; fi
  for i in 1 2 3; do
    z-ai image -p "$1" -o "$2" -s 1024x1024 && [ -s "$2" ] && { echo "ok $2"; return; }
    echo "retry $2 ($i)"; sleep 3
  done
  echo "FAILED $2"
}
STYLE="professional e-commerce product photography, bright studio lighting, soft warm yellow tones, clean minimal background, high quality, detailed, no text, no watermark"

gen "neatly arranged collection of colorful plastic household products, buckets, mugs, baskets and containers grouped together, $STYLE" "$OUT/top-general.png"
gen "assortment of plastic household utility items, hangers, small drawers, baskets and kitchen racks arranged neatly, $STYLE" "$OUT/top-nv.png"
gen "garden tools and terracotta colored plastic planters with green plants, trowel and pruning shears, $STYLE" "$OUT/top-gardening.png"
gen "stainless steel commercial kitchen equipment, large cooking pots, steel work tables and gas burners, $STYLE" "$OUT/top-kitchen-commercial.png"
gen "sturdy unbreakable plastic household containers and storage boxes in bold colors, stacked neatly, $STYLE" "$OUT/top-household.png"
gen "plastic outdoor furniture set, moldable chairs and a round table, durable stackable design, $STYLE" "$OUT/top-furniture.png"
gen "large water storage jars and bottles with blue tinted plastic, clean and fresh, $STYLE" "$OUT/top-waterjar.png"
gen "kitchenware set with plastic containers, serving spoons, canisters and trays, $STYLE" "$OUT/top-kitchenware.png"

# wide godown interiors
if [ ! -s "$OUT/wh-pune.png" ]; then z-ai image -p "large modern warehouse godown interior with tall racks full of stacked plastic household goods boxes, forklift aisle, bright industrial lighting, $STYLE" -o "$OUT/wh-pune.png" -s 1344x768; fi
if [ ! -s "$OUT/wh-kolhar.png" ]; then z-ai image -p "spacious wholesale distribution godown interior, shelves with cartons of plastic products, warm daylight through large windows, $STYLE" -o "$OUT/wh-kolhar.png" -s 1344x768; fi
echo "ALL DONE"; ls -la "$OUT"

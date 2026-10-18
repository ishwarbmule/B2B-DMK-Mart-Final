#!/bin/bash
# Generate mega-menu department images (square) + 4 ad banner images (16:9-ish landscape)
set -u
OUT_MENU="/home/z/my-project/public/images/menu"
OUT_ADS="/home/z/my-project/public/images/ads"
mkdir -p "$OUT_MENU" "$OUT_ADS"

STYLE="warm cream-yellow studio background, bright soft daylight, professional e-commerce product photography, clean minimal composition, high quality, detailed, no text, no watermark"

gen() { # prompt out size
  local p="$1" o="$2" s="$3"
  if [ -s "$o" ]; then echo "SKIP $(basename $o)"; return 0; fi
  for i in 1 2 3; do
    z-ai image -p "$p, $STYLE" -o "$o" -s "$s" && [ -s "$o" ] && { echo "OK $(basename $o)"; return 0; }
    echo "retry $i for $(basename $o)"; sleep 2
  done
  echo "FAIL $(basename $o)"; return 1
}

# ---- 9 department images (square 1024) ----
gen "assorted plastic furniture set, molded chairs and storage cabinet and stool, walnut brown and beige tones" "$OUT_MENU/furniture.jpg" 1024x1024
gen "gardening tools and terracotta and colorful plastic planters with green plants, watering can and trowel" "$OUT_MENU/garden.jpg" 1024x1024
gen "cleaning supplies set, colorful plastic mops and buckets and brushes and spray bottles, blue and yellow" "$OUT_MENU/cleaning.jpg" 1024x1024
gen "unbreakable plastic storage containers and airtight food boxes stacked neatly, translucent and red lids" "$OUT_MENU/unbreakable.jpg" 1024x1024
gen "colorful woven plastic baskets and laundry hampers and household utility assortment, red blue purple" "$OUT_MENU/fariwala.jpg" 1024x1024
gen "kitchenware set, plastic food containers and plates and cups and serving spoons, teal and white" "$OUT_MENU/kitchenware.jpg" 1024x1024
gen "large plastic water jars and bottles and dispensers, transparent blue, fresh clean look" "$OUT_MENU/water-jar.jpg" 1024x1024
gen "commercial stainless steel kitchen equipment, steel pots and pans and counters, restaurant kitchen" "$OUT_MENU/commercial-kitchen.jpg" 1024x1024
gen "home decor items, picture frames and vases and wall art and decorative planters, cozy elegant" "$OUT_MENU/home-decor.jpg" 1024x1024

# ---- 4 ad banners (landscape 1344x768) ----
gen "wholesale bulk cardboard boxes and plastic household products stacked with price tags, retail promotion scene" "$OUT_ADS/ad-bulk.jpg" 1344x768
gen "shiny stainless steel commercial kitchenware pots and pans arranged as festive store launch display with orange ribbon" "$OUT_ADS/ad-kitchen-launch.jpg" 1344x768
gen "plastic storage boxes and containers organized on retail shelves, blue and red, monsoon home organization sale mood" "$OUT_ADS/ad-storage.jpg" 1344x768
gen "lush green potted plants in colorful plastic planters arranged in garden shop display, spring gardening season promotion" "$OUT_ADS/ad-garden.jpg" 1344x768

echo "DONE. Files:"
ls -la "$OUT_MENU" "$OUT_ADS"

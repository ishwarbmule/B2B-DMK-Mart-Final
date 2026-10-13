#!/bin/bash
# Generate photorealistic product photos for remaining Borosil groups
set -e
OUT=/home/z/my-project/public/products/gen
mkdir -p "$OUT"

gen() {
  local name="$1"; shift
  local prompt="$1"; shift
  if [ -s "$OUT/$name.png" ]; then echo "SKIP $name (exists)"; return; fi
  for i in 1 2 3; do
    if z-ai image -p "$prompt" -o "$OUT/$name.png" -s 1024x1024 >/dev/null 2>&1; then
      echo "OK  $name"
      return
    fi
    echo "retry $i for $name"; sleep 2
  done
  echo "FAIL $name"
}

gen "ss-pressure-cooker" "Professional product photography of a polished stainless steel pressure cooker with steel lid, studio lighting, soft pale yellow seamless background, e-commerce catalog style, centered, high quality, no text, no watermark"
gen "ss-insulated-lunchbox" "Professional product photography of a stack of stainless steel insulated lunch boxes tiffin carriers, one open showing steel containers, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
gen "cooker-accessories" "Professional product photography of pressure cooker accessories, rubber gasket seals and safety valves and handles arranged neatly, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
gen "teapot-steel" "Professional product photography of an elegant stainless steel teapot with handle, studio lighting, soft pale yellow seamless background, e-commerce catalog style, centered, high quality, no text"
gen "granito-nonstick" "Professional product photography of a granite grey non-stick cookware set with frying pan and kadai wok with glass lids, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
gen "double-wall-bottle" "Professional product photography of sleek double wall vacuum insulated stainless steel water bottles in assorted colors, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
gen "ss-cookware-set" "Professional product photography of premium stainless steel triply cookware set with saucepans and stockpot, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
gen "mini-blender" "Professional product photography of a compact electric mixer grinder blender jar appliance, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
gen "hard-anodized-cookware" "Professional product photography of hard anodized black aluminium cooking pots and frying pan set, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
gen "copper-bottle" "Professional product photography of an elegant hammered copper water bottle with copper cup, warm reflections, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
gen "electric-kettle" "Professional product photography of a modern stainless steel electric kettle with glass window, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
gen "otg-oven" "Professional product photography of a compact black countertop oven toaster griller appliance, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
gen "coffeemate-mug" "Professional product photography of a stainless steel coffee mug with lid on a small wooden coaster, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
gen "festive-cookware-set" "Professional product photography of a colorful festive non-stick cookware gift set with pans in pink gift box, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
gen "garment-steamer" "Professional product photography of a handheld garment steamer iron appliance, studio lighting, soft pale yellow seamless background, e-commerce catalog style, high quality, no text"
echo DONE

#!/usr/bin/env python3
"""Assign generated images to last 136 products + produce final complete update."""
import json

final = json.load(open('scripts/final-image-update.json'))
db = json.load(open('scripts/db-products-dump.json'))

RULES = [
    (['SERVE FRESH', 'TRAVEL BUDDY'], '/products/gen/ss-insulated-lunchbox.png'),
    (['PRESSURE COOKER', 'TRIPLY COOKER'], '/products/gen/ss-pressure-cooker.png'),
    (['COOKER ACCESSORIES'], '/products/gen/cooker-accessories.png'),
    (['TEAPOTS'], '/products/gen/teapot-steel.png'),
    (['COFFEEMATE', 'MUG SERIES'], '/products/gen/coffeemate-mug.png'),
    (['FESTIVE GLORY'], '/products/gen/festive-cookware-set.png'),
    (['NON STICK', 'NON-STICK', 'GRANITO'], '/products/gen/granito-nonstick.png'),
    (['DOUBLE WALL', 'SINGLE WALL', 'SIPPERS', 'LAGUNA', 'COLOR CRUSH'], '/products/gen/double-wall-bottle.png'),
    (['COPPER'], '/products/gen/copper-bottle.png'),
    (['IMPACT BONDED', 'KITCHEN ACCESSORIES'], '/products/gen/ss-cookware-set.png'),
    (['BLENDER', 'GRINDER'], '/products/gen/mini-blender.png'),
    (['HARD ANODIZ'], '/products/gen/hard-anodized-cookware.png'),
    (['KETTLE'], '/products/gen/electric-kettle.png'),
    (['OVEN TOASTER', 'OTG'], '/products/gen/otg-oven.png'),
    (['STEAMER', 'IRON'], '/products/gen/garment-steamer.png'),
]

assigned = 0
for p in db:
    pid = str(p['id'])
    if pid in final:
        continue
    endc = (p.get('end') or '').upper()
    midc = (p.get('mid') or '').upper()
    name = (p['name'] or '').upper()
    hay = endc + ' | ' + midc + ' | ' + name
    for keys, img in RULES:
        if any(k in hay for k in keys):
            final[pid] = img
            assigned += 1
            break

print(f'Assigned from generated groups: {assigned}')
print(f'Total covered: {len(final)} / {len(db)}')
missing = [p['name'] for p in db if str(p['id']) not in final]
print('Still missing:', len(missing), missing[:10])
json.dump(final, open('scripts/final-image-update.json', 'w'), indent=1)

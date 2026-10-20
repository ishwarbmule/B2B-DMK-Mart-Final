#!/usr/bin/env python3
"""Point TopCategory.image at generated mega-menu art and seed 4 ads with 16:9 banners."""
import sqlite3

con = sqlite3.connect("/home/z/my-project/db/custom.db")
cur = con.cursor()

MENU = {
    "Furniture": "/images/menu/furniture.jpg",
    "Gardening Tools & Planters": "/images/menu/garden.jpg",
    "Clening & HouseHolds": "/images/menu/cleaning.jpg",
    "HouseHold Unbreakable": "/images/menu/unbreakable.jpg",
    "NV PRODUCTS-FERIWALA": "/images/menu/fariwala.jpg",
    "KITCHEN WARE": "/images/menu/kitchenware.jpg",
    "WATER JAR  & BOTTLE": "/images/menu/water-jar.jpg",
    "Kitchen Equipments Commercial": "/images/menu/commercial-kitchen.jpg",
    "Home Decor": "/images/menu/home-decor.jpg",
}

for name, path in MENU.items():
    cur.execute("UPDATE TopCategory SET image = ? WHERE name = ?", (path, name))
    print(f"top '{name}': {cur.rowcount} row(s) -> {path}")

ADS = [
    # (match existing by title-prefix, else insert) — 4 x 16:9 banners
    ("Bulk Pack Savings — Buy by the case, save up to 22%",
     "Bulk Pack Savings — Buy by the case, save up to 22%",
     "/catalog?sort=discount", "/images/ads/ad-bulk.jpg", 0),
    ("New: Goldex commercial kitchen line now in stock",
     "New: Goldex commercial kitchen line now in stock",
     "/brand/goldex-kitchen-equipments", "/images/ads/ad-kitchen-launch.jpg", 1),
    ("Monsoon Home Organization — Storage from ₹99",
     None, "/catalog?top=cmv69gg6w0016sxwocn8wshan", "/images/ads/ad-storage.jpg", 2),
    ("Garden Season Live — Planters & Tools up to 30% off",
     None, "/catalog?top=cmv69gg6w0014sxwocn8wshan", "/images/ads/ad-garden.jpg", 3),
]

for title, existing, link, image, sort in ADS:
    if existing:
        cur.execute("UPDATE Ad SET image = ? WHERE title = ?", (image, existing))
        print(f"ad '{title[:40]}…': updated {cur.rowcount} row(s) -> {image}")
    else:
        cur.execute(
            "INSERT INTO Ad (id, title, link, image, brandId, active, sortOrder) VALUES (?, ?, ?, ?, NULL, 1, ?)",
            (f"cmgen_ads_{sort:02d}", title, link, image, sort),
        )
        print(f"ad '{title[:40]}…': inserted -> {image}")

con.commit()
print("\nVerify:")
for r in cur.execute("SELECT name, image FROM TopCategory ORDER BY sortOrder").fetchall():
    print(" ", r)
for r in cur.execute("SELECT title, image, active, sortOrder FROM Ad ORDER BY sortOrder").fetchall():
    print(" ", r)
con.close()

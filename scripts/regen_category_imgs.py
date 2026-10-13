#!/usr/bin/env python3
"""Regenerate top-category SVGs: text-free gradient + big emoji (for DeptCards overlay)."""
import sqlite3, os, random

random.seed(5)
DB = '/home/z/my-project/db/custom.db'
OUT = '/home/z/my-project/public/categories'
os.makedirs(OUT, exist_ok=True)

con = sqlite3.connect(DB)
rows = con.execute("SELECT id, name, emoji, color, image, sortOrder FROM TopCategory ORDER BY sortOrder").fetchall()

PALETTES = [
    ('#fff7e0', '#fbbf24'), ('#fef2f2', '#f87171'), ('#eff6ff', '#60a5fa'),
    ('#f0fdf4', '#4ade80'), ('#faf5ff', '#c084fc'), ('#fff1f2', '#fb7185'),
    ('#f0f9ff', '#38bdf8'), ('#fefce8', '#facc15'), ('#f5f5f4', '#a8a29e'),
]

for i, (tid, name, emoji, color, image, sort) in enumerate(rows):
    pale = PALETTES[i % len(PALETTES)]
    c1, c2 = pale
    if color and color.startswith('#'):
        c2 = color
    fname = f'top-{i}.svg'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient></defs>
<rect width="600" height="750" fill="url(#g)"/>
<circle cx="510" cy="90" r="150" fill="#ffffff" opacity="0.22"/>
<circle cx="80" cy="660" r="120" fill="#000000" opacity="0.06"/>
<circle cx="300" cy="330" r="190" fill="#ffffff" opacity="0.25"/>
<text x="300" y="400" font-size="210" text-anchor="middle">{emoji}</text>
</svg>'''
    with open(os.path.join(OUT, fname), 'w') as f:
        f.write(svg)
    print(f'{fname} <- {name} ({emoji})')
    con.execute("UPDATE TopCategory SET image=? WHERE id=?", ('/categories/' + fname, tid))

con.commit()
con.close()
print('Done:', len(rows), 'category images regenerated (text-free)')

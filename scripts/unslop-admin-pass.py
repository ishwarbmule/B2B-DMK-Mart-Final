#!/usr/bin/env python3
"""unslop pass over admin components (Phase A) — spacing/type/copy/color discipline.
Keeps brand colours (black + yellow-400). Excludes printed barcode labels."""
import re, glob

files = [f for f in glob.glob("src/components/admin/*.tsx") if not f.endswith("barcode.tsx")]

# ordered substitutions: (pattern, replacement)
RULES = [
    # 1. section/field labels: shouty tracked caps → quiet sentence-case labels
    (re.compile(r"text-\[9px\] font-black uppercase tracking-widest text-gray-600"), "text-[12px] font-medium text-gray-500"),
    (re.compile(r"text-\[10px\] font-black uppercase tracking-wide text-gray-400"), "text-[12px] font-medium text-gray-500"),
    (re.compile(r"text-\[10px\] font-bold uppercase tracking-wide text-gray-400"), "text-[12px] font-medium text-gray-500"),
    (re.compile(r"text-\[10px\] font-bold uppercase tracking-wide text-gray-500"), "text-[12px] font-medium text-gray-500"),
    (re.compile(r"text-\[11px\] font-bold uppercase tracking-wide text-gray-400"), "text-[12px] font-medium text-gray-500"),
    (re.compile(r"text-\[11px\] font-black uppercase tracking-wide text-gray-500"), "text-[12px] font-medium text-gray-500"),
    (re.compile(r"text-\[11px\] font-black uppercase tracking-wide text-gray-600"), "text-[12px] font-medium text-gray-500"),
    (re.compile(r"text-\[11px\] font-black uppercase tracking-wide text-gray-700"), "text-[12px] font-medium text-gray-600"),
    (re.compile(r"text-\[10px\] uppercase tracking-wide text-gray-500"), "text-[12px] font-medium text-gray-500"),
    (re.compile(r"text-\[9px\] uppercase tracking-wide text-gray-500"), "text-[12px] font-medium text-gray-500"),
    (re.compile(r"text-xs font-black uppercase tracking-wide text-gray-500"), "text-[12px] font-medium text-gray-500"),
    (re.compile(r"text-xs font-black uppercase tracking-wide text-gray-700"), "text-[12px] font-medium text-gray-600"),
    # 2. remaining shouty tokens on any label/button
    (re.compile(r"font-black uppercase tracking-widest"), "font-medium"),
    (re.compile(r"font-black uppercase tracking-wide"), "font-semibold"),
    (re.compile(r"font-bold uppercase tracking-wide"), "font-semibold"),
    (re.compile(r"uppercase tracking-wide"), ""),
    (re.compile(r"uppercase tracking-widest"), ""),
    # 3. weight 900 → 600 max
    (re.compile(r"\bfont-black\b"), "font-semibold"),
    # 4. primary buttons: pills → control radius
    (re.compile(r"rounded-xl bg-black"), "rounded-lg bg-black"),
    (re.compile(r"rounded-xl bg-yellow-400"), "rounded-lg bg-yellow-400"),
    # 5. bare transition on colour-hover elements → transition-colors
    (re.compile(r"(hover:bg-\S+\"[^\"]*?)\btransition\b"), r"\1transition-colors"),
    (re.compile(r"\btransition hover:"), "transition-colors hover:"),
]

total = {}
for f in files:
    src = open(f).read()
    orig = src
    n = 0
    for pat, rep in RULES:
        src, k = pat.subn(rep, src)
        n += k
    if src != orig:
        open(f, "w").write(src)
        total[f] = n

for f, n in sorted(total.items()):
    print(f"{n:4d}  {f}")
print("total:", sum(total.values()), "substitutions in", len(total), "files")

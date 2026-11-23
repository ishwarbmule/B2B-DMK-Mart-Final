#!/usr/bin/env python3
"""Post-process the PRD docx: remove empty pgNumType from cover section and patch
footer PAGE fields with explicit \\* ROMAN / \\* arabic switches (WPS compatibility)."""
import re
import shutil
import sys
import zipfile

DOCX = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/download/DMK-Mart-B2B-PRD.docx"
TMP = DOCX + ".tmp"

with zipfile.ZipFile(DOCX, "r") as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

doc = data["word/document.xml"].decode("utf-8")

# 1) Remove empty pgNumType emitted for the cover section
doc = doc.replace("<w:pgNumType/>", "")

# 1b) Remove the duplicated inline first TOC entry that add_toc_placeholders.py
#     leaves inside the TOC field paragraph (its PAGEREF has an empty result,
#     so it renders as a page-number-less duplicate of the first real entry)
m = re.search(
    r'(<w:instrText[^>]*>\s*TOC[^<]*</w:instrText>.*?<w:fldChar w:fldCharType="separate"/></w:r>)'
    r'(<w:hyperlink.*?</w:hyperlink>)'
    r'(</w:p>)',
    doc, flags=re.S,
)
if m:
    doc = doc[: m.start()] + m.group(1) + m.group(3) + doc[m.end():]
    print("removed duplicated inline TOC entry")
else:
    print("no inline TOC duplicate found")

# 2) Find sectPr blocks in order and their default footer references
sect_blocks = re.findall(r"<w:sectPr[^>]*>.*?</w:sectPr>", doc, flags=re.S)
sect_footers = []
for blk in sect_blocks:
    m = re.search(r'<w:footerReference w:type="default" r:id="(rId\d+)"', blk)
    sect_footers.append(m.group(1) if m else None)
print("sections:", len(sect_blocks), "footer refs:", sect_footers)

# 3) Map rId -> footer file via document rels
rels = data["word/_rels/document.xml.rels"].decode("utf-8")
rid_to_target = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', rels))

def patch_footer(fname, fmt):
    key = "word/" + fname
    xml = data[key].decode("utf-8")
    new = re.sub(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        r"\1 PAGE \\* " + fmt + r" \\* MERGEFORMAT \2",
        xml,
    )
    if new != xml:
        data[key] = new.encode("utf-8")
        print("patched", key, "->", fmt)
    else:
        print("WARN: no PAGE instrText found in", key)

# Section order: [cover, front-matter(Roman), body(arabic)] - skip cover (None)
fmts = [None, "ROMAN", "arabic"]
for i, rid in enumerate(sect_footers):
    if rid is None or i >= len(fmts) or fmts[i] is None:
        continue
    target = rid_to_target.get(rid, "")
    if "footer" in target:
        patch_footer(target, fmts[i])

data["word/document.xml"] = doc.encode("utf-8")

with zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(TMP, DOCX)
print("OK postprocessed:", DOCX)

"""Post-process footers: explicit PAGE format switches (WPS) + strip empty pgNumType."""
import re
import shutil
import sys
import zipfile

src = sys.argv[1]
tmp = src + ".tmp"

with zipfile.ZipFile(src, "r") as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

changed = []
for n in list(data.keys()):
    if n.startswith("word/footer") and n.endswith(".xml"):
        xml = data[n].decode("utf-8")
        if "PAGE" not in xml:
            continue
        # marker color 878787 = roman footer, anything else = arabic
        fmt = "ROMAN" if "878787" in xml else "arabic"
        new = re.sub(
            r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
            rf"\1 PAGE \\* {fmt} \\* MERGEFORMAT \2",
            xml,
        )
        if new != xml:
            data[n] = new.encode("utf-8")
            changed.append(f"{n} -> {fmt}")
    if n == "word/document.xml":
        xml = data[n].decode("utf-8")
        new = xml.replace("<w:pgNumType/>", "")
        if new != xml:
            changed.append("document.xml: stripped empty pgNumType")
        # dedupe TOC: when the same heading appears in two consecutive TOC
        # paragraphs (field-inlined entry + injected static copy), keep the one
        # with the hyperlink and drop the plain duplicate
        paras = re.findall(r"<w:p>(?:(?!</w:p>).)*</w:p>", new, re.S)
        removed = 0
        prev_text = None
        for p in paras:
            if 'w:pStyle w:val="TOC' not in p:
                prev_text = None
                continue
            texts = " ".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p)).strip()
            key = re.sub(r"\s*\d+$", "", texts)  # strip the trailing page number
            if prev_text and key == prev_text and prev_has_link and ("hyperlink" not in p):
                new = new.replace(p, "", 1)
                removed += 1
                prev_text = None
                continue
            prev_text, prev_has_link = key, ("hyperlink" in p)
        if removed:
            changed.append(f"document.xml: removed {removed} duplicate TOC entry(ies)")
        data[n] = new.encode("utf-8")

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(tmp, src)
print("patched:", changed or "nothing to do")

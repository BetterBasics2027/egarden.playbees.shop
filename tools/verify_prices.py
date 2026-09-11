"""Cross-check data/catalog.json against the printed PDF's Quick Price List.

Usage: python tools/verify_prices.py [path-to-pdf]
Exit code 1 on any mismatch.
"""
import json
import os
import re
import sys

import fitz  # PyMuPDF

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = sys.argv[1] if len(sys.argv) > 1 else r"D:\Downloads\Playbees-Wholesale-Catalog-2027.pdf"

data = json.load(open(os.path.join(ROOT, "data", "catalog.json"), encoding="utf-8"))
items = data["items"]
EXPECT_COUNTS = {"Squishy Foods": 11, "Squishy Shapes & Balls": 10, "Coconut Oil Squishies": 3, "Slime & Putty": 6,
                 "Stress Cubes": 10, "Toys, Games & Party Favors": 12, "Stickers, Stationery & Crafts": 12, "Bath Time": 3}

errors = []
if len(items) != 67:
    errors.append(f"item count {len(items)} != 67")
if len(data["categories"]) != 8:
    errors.append(f"category count {len(data['categories'])} != 8")
for c in data["categories"]:
    if EXPECT_COUNTS.get(c["name"]) != c["count"]:
        errors.append(f"{c['name']}: {c['count']} != {EXPECT_COUNTS.get(c['name'])}")
if sum(i["onRequest"] for i in items) != 6:
    errors.append("on-request count != 6")
for i in items:
    if not os.path.exists(os.path.join(ROOT, i["image"])):
        errors.append(f"missing image {i['image']}")
    if not i["onRequest"] and (i["packPrice"] is None or i["piecePrice"] is None):
        errors.append(f"{i['id']} priced item missing a price")

# ---- PDF quick price list: "PB141 Squishy Fun Foods · 10 Pack $2.30 $0.23" lines
doc = fitz.open(PDF)
text = "\n".join(page.get_text() for page in doc)
text = text[text.find("Quick Price List"):]
rows = {}
# tokens come one per line in reading order; join and regex over the flattened stream
flat = re.sub(r"\s+", " ", text)
for m in re.finditer(r"(PB\d{3}|NEW) (.+?) · (.+?) (\$\d+\.\d{2}|Ask us) (\$\d+\.\d{2}|—)", flat):
    uid, name, spec, pack, piece = m.groups()
    key = (uid if uid != "NEW" else "NEW:" + name.strip())
    rows[key] = (name.strip(), pack, piece)

pdf_seen = set()
for i in items:
    key = i["uid"] if i["uid"] else "NEW:" + i["name"]
    row = rows.get(key)
    if not row:
        errors.append(f"{key} not found in PDF price list")
        continue
    pdf_seen.add(key)
    name, pack, piece = row
    if i["onRequest"]:
        if pack != "Ask us":
            errors.append(f"{key}: site says on request, PDF says {pack}")
    else:
        if pack != f"${i['packPrice']:.2f}" or piece != f"${i['piecePrice']:.2f}":
            errors.append(f"{key}: site {i['packPrice']:.2f}/{i['piecePrice']:.2f} vs PDF {pack}/{piece}")
missing = set(rows) - pdf_seen
if missing:
    errors.append(f"PDF rows not on site: {sorted(missing)}")

print(f"checked {len(items)} items against {len(rows)} PDF rows")
if errors:
    print("\n".join("  ✗ " + e for e in errors))
    sys.exit(1)
print("  ✓ all prices, counts and images match the PDF")

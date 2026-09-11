"""Extract the Playbees Wholesale Catalog 2027 HTML into data/catalog.json, img/ and fonts/.

Idempotent: re-run any time the source HTML changes.
Usage: python tools/extract_catalog.py [path-to-source-html]
"""
import base64
import hashlib
import html as H
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else r"D:\Downloads\Playbees-Wholesale-Catalog-2027.html"

raw = open(SRC, encoding="utf-8").read()

# ---------- images: replace every data URI with a placeholder token, keep bytes ----------
blobs = []


def _stash(m):
    mime, b64 = m.group(1), m.group(2)
    blobs.append((mime, b64))
    return f"@@BLOB{len(blobs) - 1}@@"


s = re.sub(r"data:([a-z]+/[a-z0-9+\-.]+);base64,([A-Za-z0-9+/=]+)", _stash, raw)

EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "font/woff2": "woff2"}
written = {}  # sha1 -> relative path


def write_blob(idx, folder, stem):
    mime, b64 = blobs[idx]
    data = base64.b64decode(b64)
    sha = hashlib.sha1(data).hexdigest()
    if sha in written:
        return written[sha]
    ext = EXT.get(mime, mime.split("/")[-1])
    rel = f"{folder}/{stem}.{ext}"
    path = os.path.join(ROOT, rel)
    n = 1
    while os.path.exists(path) and hashlib.sha1(open(path, "rb").read()).hexdigest() != sha:
        n += 1
        rel = f"{folder}/{stem}-{n}.{ext}"
        path = os.path.join(ROOT, rel)
    with open(path, "wb") as f:
        f.write(data)
    written[sha] = rel
    return rel


def slug(t):
    t = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
    return t[:48]


# ---------- fonts ----------
fonts = []
for m in re.finditer(r"@font-face\{font-family:'([^']+)';font-style:(\w+);font-weight:(\d+);[^}]*?src:url\(@@BLOB(\d+)@@\)", s):
    fam, style, weight, idx = m.groups()
    rel = write_blob(int(idx), "fonts", f"{fam.lower()}-{weight}")
    fonts.append({"family": fam, "style": style, "weight": int(weight), "file": rel})

# ---------- logo (first <img class="clogo">) ----------
logo_idx = int(re.search(r'<img class="clogo" src="@@BLOB(\d+)@@"', s).group(1))
logo = write_blob(logo_idx, "img", "playbees-logo")

# ---------- cover text ----------
eyebrow = H.unescape(re.search(r'<div class="eyebrow">(.*?)</div>', s).group(1))
subtitle = re.sub(r"\s+", " ", H.unescape(re.search(r'<p class="csub">(.*?)</p>', s, re.S).group(1))).strip()
cfoot = re.findall(r'<div class="cfoot"><span>(.*?)</span><span>(.*?)</span></div>', s)[0]

# ---------- categories + cards, sequential walk ----------
cats = []
items = []
cur = None
chip_colors = {}
for m in re.finditer(r'<span class="chip" style="--c:(#[0-9A-Fa-f]+);--cd:(#[0-9A-Fa-f]+);--t:(#[0-9A-Fa-f]+)"><i></i>(.*?) <small>(\d+)</small>', s):
    chip_colors[H.unescape(m.group(4))] = dict(c=m.group(1), cd=m.group(2), t=m.group(3), chip=H.unescape(m.group(4)), count=int(m.group(5)))

pat = re.compile(
    r'(<div class="band" style="--c:(?P<c>#[0-9A-Fa-f]+);--cd:(?P<cd>#[0-9A-Fa-f]+);--t:(?P<t>#[0-9A-Fa-f]+)"><h2>(?P<band>[^<]*)</h2><p>(?P<desc>[^<]*)</p><span class="cnt">(?P<cnt>[^<]*)</span>)'
    r'|(<div class="card"[^>]*><div class="ph" style="background:(?P<bg>#[0-9a-fA-F]+)"><img src="@@BLOB(?P<img>\d+)@@" alt=""></div><span class="uid">(?P<uid>[^<]*)</span><div class="bd"><div class="nm">(?P<nm>[^<]*)</div><div class="sp">(?P<sp>[^<]*)</div><div class="px[^"]*">(?P<px>(?:<div><span>[^<]*</span><b[^>]*>[^<]*</b></div>)+)</div></div></div>)',
    re.S,
)
seen_uid = {}
for m in pat.finditer(s):
    if m.group("band"):
        name = H.unescape(m.group("band"))
        if not cats or cats[-1]["name"] != name:
            cats.append(dict(id=slug(name), name=name, blurb=H.unescape(m.group("desc")),
                             c=m.group("c"), cd=m.group("cd"), t=m.group("t")))
        cur = cats[-1]
        continue
    uid = H.unescape(m.group("uid")).strip()
    nm = H.unescape(m.group("nm")).strip()
    sp = H.unescape(m.group("sp")).strip()
    px = re.findall(r"<span>(.*?)</span><b[^>]*>(.*?)</b>", m.group("px"))

    def money(v):
        v = H.unescape(v).strip()
        mm = re.match(r"^\$([\d,]+\.\d{2})$", v)
        return float(mm.group(1).replace(",", "")) if mm else None

    labels = [k for k, _ in px]
    pack = piece = None
    on_request = False
    if labels == ["Wholesale Pack Price", "Wholesale Piece Price"]:
        pack, piece = money(px[0][1]), money(px[1][1])
    elif labels == ["Wholesale price"]:
        on_request = True
        piece = money(px[0][1])  # some "Ask us" cards still carry a per-piece figure; keep it hidden
    else:
        raise SystemExit(f"unexpected price block on {uid} {nm}: {px}")
    if pack is None and not on_request:
        on_request = True
    is_new = uid.upper() == "NEW"
    stem = slug(nm) if is_new else uid
    if stem in seen_uid:
        seen_uid[stem] += 1
        stem = f"{stem}-{seen_uid[stem]}"
    else:
        seen_uid[stem] = 1
    img = write_blob(int(m.group("img")), "img", stem)
    items.append(dict(
        id=stem, uid=None if is_new else uid, isNew=is_new, name=nm, spec=sp,
        category=cur["id"], packPrice=pack, piecePrice=None if on_request else piece,
        onRequest=on_request, bg=m.group("bg").lower(), image=img,
    ))

for c in cats:
    c["count"] = sum(1 for i in items if i["category"] == c["id"])

# ---------- cover mosaic (12 photos) ----------
mosaic = []
mos = re.search(r'<div class="mosaic">(.*?)</div>\s*<div class="chips">', s, re.S).group(1)
for i, m in enumerate(re.finditer(r'<div style="background:(#[0-9a-fA-F]+)"><img src="@@BLOB(\d+)@@"', mos)):
    mosaic.append(dict(bg=m.group(1).lower(), image=write_blob(int(m.group(2)), "img", f"cover-{i + 1}")))

# ---------- footer note on the price-list page ----------
note = re.search(r"All prices in US dollars\..*?on request\.", re.sub(r"<[^>]+>", " ", s), re.S)
note = re.sub(r"\s+", " ", note.group(0)) if note else "All prices in US dollars."

out = dict(
    title="Wholesale Catalog",
    year="2027",
    eyebrow=eyebrow,
    subtitle=subtitle,
    note=H.unescape(note),
    logo=logo,
    contact=dict(
        name="Zolly Friedman",
        title="eGarden Division Head of Sales & Marketing",
        phone="845-774-5084",
        email="abc@zollyfriedman.com",
        raw=[H.unescape(x) for x in cfoot],
    ),
    categories=cats,
    items=items,
    mosaic=mosaic,
    fonts=fonts,
    source=os.path.basename(SRC),
)
with open(os.path.join(ROOT, "data", "catalog.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print(f"categories {len(cats)}  items {len(items)}  on-request {sum(i['onRequest'] for i in items)}  "
      f"new {sum(i['isNew'] for i in items)}  images {len(set(written.values()))}  fonts {len(fonts)}")
for c in cats:
    print(f"  {c['count']:2d}  {c['name']}")

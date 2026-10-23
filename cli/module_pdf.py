"""Render a generated dungeon module (markdown) to a printable PDF in the
Shadowdark house style: Poppins Bold banners, Lora body, boxed stat blocks,
the dungeon map on its own page, and each room's minimap beside its banner.

Usage:
    npm run module-pdf -- <module.md> [out.pdf]
    npm run module-pdf -- <module.md> out.html   # a web page instead (no illustrations)
    python3 cli/module_pdf.py <module.md> [out.pdf | out.html]

Requires: pip install weasyprint markdown

Fonts (Poppins-Bold.ttf, Lora-Variable.ttf, Lora-Italic-Variable.ttf) are
looked up in $MODULE_PDF_FONTS, cli/fonts/, the Windows font folder (WSL),
and the usual Linux font folders. Missing fonts fall back to system fonts.

Illustrations: a module may carry woodcut searches in a hidden comment
("<!-- art" / "N|woodcut query" / "-->"). Their public-domain images come
from the Inside Out Library (insideoutlibrary.com), are cached beside the
module in <module>.art/, turned to clean black and white, and set into the
empty space at the foot of pages — the art for a room near that room — with
a credits list at the end. MODULE_PDF_NO_ART=1 leaves them out.
"""
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

try:
    import markdown
    from weasyprint import HTML
except ImportError as err:
    sys.exit(f'module_pdf: {err.name} is not installed — pip install weasyprint markdown')

FONT_FILES = {
    'poppins':     'Poppins-Bold.ttf',
    'lora':        'Lora-Variable.ttf',
    'lora_italic': 'Lora-Italic-Variable.ttf',
}

STAT_KEYS = r'(AC|HP|ATK|MV|S|D|C|I|W|Ch|AL|LV)'


def find_fonts():
    """Map each house font to a file:// URL, or None if it can't be found."""
    dirs = [
        os.environ.get('MODULE_PDF_FONTS'),
        Path(__file__).resolve().parent / 'fonts',
        '/mnt/c/Windows/Fonts',
        Path.home() / '.local/share/fonts',
        Path.home() / '.fonts',
        '/usr/share/fonts/truetype/google-fonts',
        '/usr/local/share/fonts',
    ]
    found = {}
    for key, name in FONT_FILES.items():
        for d in filter(None, dirs):
            path = Path(d) / name
            if path.is_file():
                found[key] = path.as_uri()
                break
        else:
            found[key] = None
    return found


def font_face(family, url, extra=''):
    return f"@font-face {{ font-family: {family}; {extra} src: url('{url}'); }}" if url else ''


def bold_stats(m):
    """Bold the creature name and stat abbreviations on each stat-block line."""
    line = m.group(0)
    line = re.sub(r'(^<p>|<br />\s*)([^<]+?)(?=\s+AC\s*\d)', r'\1<b class="n">\2</b>', line)
    return re.sub(rf'(?<![\w>])({STAT_KEYS})(?=\s*[\d+\-−(]|\s+(?:near|close|far|double|slow|[LNC]\b))',
                  r'<b class="k">\1</b>', line)


def map_is_wide(md, ratio=1.15):
    """Is the embedded dungeon map wider than it is tall (by `ratio`)?"""
    import base64
    m = re.search(r'<img src="data:image/svg\+xml;base64,([^"]*)" alt="Dungeon Map"', md)
    if not m:
        return False
    head = base64.b64decode(m.group(1))[:600].decode('utf-8', 'ignore')
    vb = re.search(r'viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"', head)
    return bool(vb) and float(vb.group(1)) / float(vb.group(2)) > ratio


def module_html(md):
    # Each blockquote line (stat block, talent) keeps its own line in print.
    md = re.sub(r'^(>.*\S)[ \t]*$', r'\1  ', md, flags=re.M)
    body = markdown.markdown(md, extensions=['tables', 'sane_lists', 'md_in_html'])
    # Stat blocks are blockquotes.
    body = re.sub(r'<blockquote>[\s\S]*?</blockquote>',
                  lambda m: re.sub(r'<p>[\s\S]*?</p>', bold_stats, m.group(0)), body)
    # The overall map gets a page of its own — a landscape page when the map is
    # wide — and rooms start on a fresh page.
    body = body.replace('<h2>Dungeon Map</h2>', '<h2 class="page-start">Dungeon Map</h2>')
    if map_is_wide(md):
        body = re.sub(r'(<h2 class="page-start">Dungeon Map</h2>\s*<p>\s*<img[^>]*alt="Dungeon Map"[^>]*>\s*</p>)',
                      r'<div class="map-landscape">\1</div>', body)
    body = body.replace('<h2>Rooms</h2>', '<h2 class="page-start">Rooms</h2>')
    # A bold line on its own (a faction's name, a table's label) is a lead-in:
    # it never stays behind at the foot of a page without what it introduces.
    body = re.sub(r'<p>(<strong>[^<]*</strong>)</p>', r'<p class="lead-in">\1</p>', body)
    # A section of rooms starts on a fresh page, with its encounter table.
    body = re.sub(r'<h2>((?:Section\b|Other Rooms|Rooms? \d)[^<]*)</h2>', r'<h2 class="page-start">\1</h2>', body)
    # Keep each room banner together with its minimap.
    body = re.sub(r'(<h3>[\s\S]*?</h3>)\s*(<p>\s*<img[^>]*exits[^>]*>\s*</p>)?',
                  lambda m: f'<div class="room-head">{m.group(1)}{m.group(2) or ""}</div>', body)
    # The room's opening paragraph — what the party sees on entering — is boxed,
    # so the GM finds what to describe at a glance.
    body = re.sub(r'(<div class="room-head">[\s\S]*?</div>\s*<p><em>[^<]*</em></p>\s*)<p>',
                  r'\1<p class="first-look">', body)
    # A room is one unit: it never breaks across pages (a room taller than a
    # page still breaks, as it must).
    body = re.sub(r'(<div class="room-head">[\s\S]*?)(?=<div class="room-head">|<h2[ >]|$)',
                  r'<section class="room">\1</section>', body)
    return body


# ── Illustrations ─────────────────────────────────────────────────────

IOL_SEARCH = 'https://api2.insideoutlibrary.com/search'
IOL_META = 'https://img.insideoutlibrary.com/data/meta.json'
IOL_IMAGE = 'https://img.insideoutlibrary.com/img/1024/{id}.jpg'
UA = {'User-Agent': 'randommon-module-pdf/1.0 (dungeon module illustrations)'}


def art_requests(md):
    """[(room or None, query)] from the module's hidden "<!-- art" comment."""
    m = re.search(r'<!--\s*art\s*\n([\s\S]*?)-->', md)
    out = []
    for line in (m.group(1).splitlines() if m else []):
        r = re.match(r'\s*(any|\d+)\s*\|\s*(.+?)\s*$', line)
        if r:
            out.append((None if r.group(1) == 'any' else int(r.group(1)), r.group(2)))
    return out


def _get(url, as_json=True):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as resp:
        data = resp.read()
    return json.loads(data) if as_json else data


def _main_block(g, axis):
    """(start, end) of the largest run of inked rows (axis 0) or columns (1),
    dropping thinner runs — a caption, a page header — set apart by white."""
    w, h = g.size
    px = g.load()
    n, m = (h, w) if axis == 0 else (w, h)
    inked = [sum(1 for j in range(0, m, 2) if (px[j, i] if axis == 0 else px[i, j]) < 140) > m * 0.004 for i in range(n)]
    gap = max(3, n // 60)
    runs, start, blank = [], None, 0
    for i, ink in enumerate(inked + [False] * (gap + 1)):
        if ink:
            start = i if start is None else start
            blank = 0
        elif start is not None:
            blank += 1
            if blank > gap:
                runs.append((start, i - blank + 1))
                start, blank = None, 0
    return max(runs, key=lambda r: r[1] - r[0]) if runs else (0, n)


def _clean(img):
    """Black and white, the old paper's tint lifted to white, and cropped to
    the picture itself (captions and stray text set apart by white are cut)."""
    from PIL import ImageOps
    g = ImageOps.autocontrast(ImageOps.grayscale(img), cutoff=2)
    g = g.point(lambda v: 255 if v > 205 else int(v * 255 / 205))
    top, bottom = _main_block(g, 0)
    g = g.crop((0, top, g.width, bottom))
    left, right = _main_block(g, 1)
    pad = 6
    return ImageOps.expand(g.crop((left, 0, right, g.height)), border=pad, fill=255)


def fetch_art(requests, cache):
    """One cleaned image per search, cached in `cache`: [{id, file, room, query, title, year, w, h}]."""
    from PIL import Image, ImageStat
    cache = cache.resolve()
    cache.mkdir(exist_ok=True)
    index_file = cache / 'art.json'
    index = json.loads(index_file.read_text()) if index_file.exists() else {}
    corpus = None
    chosen, used = [], set()
    for room, query in requests:
        hit = index.get(query)
        if hit is None:
            hit = {}
            try:
                corpus = corpus or _get(IOL_META)['corpus']
                q = urllib.parse.urlencode({'q': query, 'fmt': 'rows', 'n': 20, 'corpus': corpus})
                res = _get(f'{IOL_SEARCH}?{q}')
                for i in range(len(res.get('ids', []))):
                    b = res['book'][i]
                    iid = f"ia-{res['books'][b]}-{res['leaf'][i]}-{res['ids'][i]}"
                    w, h = res['w'][i], res['h'][i]
                    if iid in used or w < 500 or h < 400 or not 0.45 <= w / h <= 2.4:
                        continue
                    try:  # one bad candidate (not on the image server) just moves on
                        raw = Image.open(io.BytesIO(_get(IOL_IMAGE.format(id=iid), as_json=False))).convert('RGB')
                    except Exception:
                        continue
                    # Woodcuts and engravings, not colour plates.
                    if ImageStat.Stat(raw.convert('HSV').split()[1]).mean[0] > 40:
                        continue
                    pic = _clean(raw)
                    if not 0.45 <= pic.width / pic.height <= 2.4 or pic.height < 250:
                        continue
                    pic.save(cache / f'{iid}.jpg', quality=90)
                    hit = {'id': iid, 'title': res['btitle'][b], 'year': res['byear'][b], 'w': pic.width, 'h': pic.height}
                    break
            except Exception as err:  # network down, site changed: no art, still a PDF
                print(f'module_pdf: no illustration for "{query}" ({err})', file=sys.stderr)
                continue
            index[query] = hit
            index_file.write_text(json.dumps(index, indent=1))
        if hit and hit['id'] not in used and (cache / f"{hit['id']}.jpg").exists():
            used.add(hit['id'])
            chosen.append({**hit, 'room': room, 'query': query, 'file': (cache / f"{hit['id']}.jpg").as_uri()})
    return chosen


def _walk(box):
    if type(box).__name__ == 'MarginBox':
        return
    yield box
    for c in getattr(box, 'children', None) or []:
        yield from _walk(c)


def place_art(doc_src, art, min_gap=120, max_h=460):
    """Set illustrations into the space left at the foot of pages, each before
    the block that moved to the next page (so nothing else moves). Returns the
    rendered document and [(art, page number)]."""
    doc = doc_src.render()
    body = next(e for e in doc_src.etree_element.iter() if str(e.tag).endswith('body'))
    top = list(body)
    # Room number and section (its rooms) of each top-level block, in order.
    room_of, section_of, cur_room, cur_section = {}, {}, None, []
    for el in top:
        if str(el.tag).endswith('h2'):
            cur_section = [int(n) for n in re.findall(r'\d+', ''.join(el.itertext()))]
        txt = ''.join(el.itertext())
        m = re.match(r'\s*\d*\s*Room (\d+)\b', txt) if el.get('class') == 'room' else None
        if m:
            cur_room = int(m.group(1))
        room_of[el], section_of[el] = cur_room, cur_section
    first_top = lambda page: next((b.element for b in _walk(page._page_box) if getattr(b, 'element', None) in room_of), None)
    placed, left = [], list(art)
    for i, page in enumerate(doc.pages[:-1]):
        pb = page._page_box
        used = max([b.position_y + b.margin_height() for b in _walk(pb)
                    if type(b).__name__ in ('LineBox', 'BlockReplacedBox', 'InlineReplacedBox', 'TableBox')] or [0])
        gap = pb.content_box_y() + pb.height - used
        nxt = first_top(doc.pages[i + 1])
        if gap < min_gap or nxt is None or not left:
            continue
        before = top[top.index(nxt) - 1] if top.index(nxt) else nxt
        room, rooms = room_of[before], section_of[before]
        pick = (next((a for a in left if a['room'] == room), None)
                or next((a for a in left if a['room'] in rooms), None)
                or next((a for a in left if a['room'] is None), None) or left[0])
        aspect = pick['w'] / pick['h']
        h = min(gap - 20, max_h)
        w = h * aspect
        if w > pb.width * 0.9:
            w = pb.width * 0.9
            h = w / aspect
        if h < 90:
            continue
        fig = ET.Element('figure', {'class': 'art'})
        ET.SubElement(fig, 'img', {'src': pick['file'], 'alt': '', 'style': f'width:{w:.0f}px;height:{h:.0f}px'})
        body.insert(list(body).index(nxt), fig)
        left.remove(pick)
        placed.append((pick, i + 1))
    if placed:
        # The credits are one block: never a lone line on a page of its own.
        block = ET.SubElement(body, 'div', {'class': 'credits-block'})
        h2 = ET.SubElement(block, 'h2')
        h2.text = 'Illustrations'
        p = ET.SubElement(block, 'p')
        p.text = ('The illustrations are public-domain woodcuts and engravings from old books, '
                  'found through the Inside Out Library (insideoutlibrary.com).')
        ul = ET.SubElement(block, 'ul', {'class': 'credits'})
        for a, page_no in sorted(placed, key=lambda x: x[1]):
            title = a['title'] if len(a['title']) <= 110 else a['title'][:107].rsplit(' ', 1)[0] + '…'
            ET.SubElement(ul, 'li').text = f"Page {page_no}: {title} ({a['year']})"
        doc = doc_src.render()
    return doc, placed


def module_css(fonts):
    return f"""
{font_face('Poppins', fonts['poppins'], 'font-weight: bold;')}
{font_face('Lora', fonts['lora'])}
{font_face('Lora', fonts['lora_italic'], 'font-style: italic;')}
@page {{
  size: letter; margin: 0.6in 0.6in 0.7in;
  @bottom-center {{ content: counter(page); font-family: Poppins, sans-serif; font-size: 8pt; color: #555; }}
}}
body {{ font-family: Lora, Georgia, serif; font-size: 10pt; line-height: 1.45; color: #111; }}
h1 {{
  font-family: Poppins, sans-serif; font-size: 22pt; letter-spacing: .04em; text-transform: uppercase;
  background: #111; color: #fff; padding: 10pt 14pt; margin: 0 0 6pt; border-radius: 3pt;
}}
h1 + p em {{ font-family: Poppins, sans-serif; font-style: normal; font-size: 9pt; color: #444; }}
h2 {{
  font-family: Poppins, sans-serif; font-size: 13pt; text-transform: uppercase; letter-spacing: .05em;
  border-bottom: 2.5pt solid #111; padding-bottom: 2pt; margin: 16pt 0 6pt; page-break-after: avoid;
}}
h2.page-start {{ page-break-before: always; }}
.room-head {{ break-inside: avoid; break-after: avoid; }}
.room-head p {{ margin: 0; }}
h3 {{
  font-family: Poppins, sans-serif; font-size: 11pt; background: #111; color: #fff; clear: both;
  padding: 4pt 10pt; margin: 14pt 0 4pt; border-radius: 3pt 14pt 14pt 3pt; page-break-after: avoid;
}}
h4 {{
  font-family: Poppins, sans-serif; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em;
  color: #333; margin: 10pt 0 2pt; page-break-after: avoid;
}}
p {{ margin: 0 0 6pt; break-inside: avoid; orphans: 3; widows: 3; }}
section.room {{ break-inside: avoid; }}
p.first-look {{ border: .75pt solid #111; padding: 5pt 8pt; margin: 4pt 0 8pt; }}
p.lead-in {{ break-after: avoid; page-break-after: avoid; margin-bottom: 3pt; }}
h4 + p, h4 + table {{ break-before: avoid; }}
p + blockquote {{ break-before: avoid; }}  /* a stat block stays with the text that introduces it */
figure.art {{ margin: 10pt 0 0; text-align: center; break-inside: avoid; }}
figure.art img {{ display: inline-block; }}
ul.credits {{ font-size: 8.5pt; color: #444; }}
.credits-block {{ break-inside: avoid; }}
ul {{ margin: 0 0 6pt; padding-left: 14pt; }}
li {{ margin-bottom: 3pt; break-inside: avoid; }}
hr {{ border: none; border-top: 1pt solid #999; margin: 10pt 0; }}
blockquote {{
  margin: 6pt 0; padding: 5pt 8pt; border-left: 3pt solid #111; background: #f1efe9;
  font-size: 9pt; page-break-inside: avoid;
}}
blockquote p {{ margin: 0 0 3pt; }}
b.n {{ font-family: Poppins, sans-serif; font-weight: bold; font-size: 9pt; letter-spacing: .03em; }}
b.k {{ font-family: Poppins, sans-serif; font-weight: bold; font-size: 8.5pt; }}
table {{ border-collapse: collapse; width: 100%; font-size: 9pt; margin: 4pt 0 8pt; }}
th {{ font-family: Poppins, sans-serif; background: #111; color: #fff; text-align: left; padding: 3pt 6pt; }}
td {{ border-bottom: .5pt solid #bbb; padding: 3pt 6pt; vertical-align: top; }}
tr {{ page-break-inside: avoid; }}
img {{ max-width: 100%; }}
/* The map fills its page under the heading, scaled to fit either way; a
   wide map gets a landscape page of its own. */
img[alt="Dungeon Map"] {{ width: 100%; height: 8.9in; object-fit: contain; }}
@page landscape {{ size: letter landscape; }}
.map-landscape {{ page: landscape; }}
.map-landscape img[alt="Dungeon Map"] {{ height: 6.4in; }}
img[alt$="exits"] {{ float: right; width: 1.55in; margin: 0 0 4pt 8pt !important; display: inline !important; }}
"""


def render(src, out=None):
    src = Path(src)
    out = Path(out) if out else src.with_suffix('.pdf')
    fonts = find_fonts()
    missing = [FONT_FILES[k] for k, v in fonts.items() if not v]
    if missing:
        print(f'module_pdf: fonts not found ({", ".join(missing)}) — using system fallbacks. '
              'Set MODULE_PDF_FONTS or put them in cli/fonts/.', file=sys.stderr)
    md = src.read_text(encoding='utf-8')
    html = (f'<html><head><meta charset="utf-8"><style>{module_css(fonts)}</style></head>'
            f'<body>{module_html(md)}</body></html>')
    doc_src = HTML(string=html, base_url=str(src.parent))
    requests = [] if os.environ.get('MODULE_PDF_NO_ART') else art_requests(md)
    if requests:
        art = fetch_art(requests, src.with_suffix('.art'))
        doc, placed = place_art(doc_src, art)
        print(f'module_pdf: {len(placed)} illustrations set ({len(art)} found)', file=sys.stderr)
        doc.write_pdf(out)
    else:
        doc_src.write_pdf(out)
    return out


# The same module as a web page, for reading at the table or in a browser:
# the house fonts from Google Fonts, one readable column, no print pages.
SCREEN_CSS = """
body { max-width: 7.5in; margin: 0 auto; padding: 24px 16px 64px; background: #fff; }
img[alt="Dungeon Map"] { height: auto; }
.map-landscape img[alt="Dungeon Map"] { height: auto; }
section.room { border-top: .75pt solid #ccc; padding-top: 6pt; }
@media (max-width: 600px) { img[alt$="exits"] { float: none; width: 100%; max-width: 2.5in; } }
"""


def render_html(src, out):
    src, out = Path(src), Path(out)
    md = src.read_text(encoding='utf-8')
    fonts = {k: None for k in FONT_FILES}
    title = (re.search(r'^# (.+)$', md, re.M) or [None, src.stem])[1]
    html = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>{title}</title>'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:ital@0;1&family=Poppins:wght@700&display=swap">'
            f'<style>{module_css(fonts)}{SCREEN_CSS}</style></head>'
            f'<body>{module_html(md)}</body></html>')
    out.write_text(html, encoding='utf-8')
    return out


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    if len(sys.argv) > 2 and sys.argv[2].endswith('.html'):
        print(f'Saved web page to {render_html(*sys.argv[1:3])}')
    else:
        print(f'Saved PDF to {render(*sys.argv[1:3])}')

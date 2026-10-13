"""Render a generated dungeon module (markdown) to a printable PDF in the
Shadowdark house style: Poppins Bold banners, Lora body, boxed stat blocks,
the dungeon map on its own page, and each room's minimap beside its banner.

Usage:
    npm run module-pdf -- <module.md> [out.pdf]
    python3 cli/module_pdf.py <module.md> [out.pdf]

Requires: pip install weasyprint markdown

Fonts (Poppins-Bold.ttf, Lora-Variable.ttf, Lora-Italic-Variable.ttf) are
looked up in $MODULE_PDF_FONTS, cli/fonts/, the Windows font folder (WSL),
and the usual Linux font folders. Missing fonts fall back to system fonts.
"""
import os
import re
import sys
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


def module_html(md):
    # Each blockquote line (stat block, talent) keeps its own line in print.
    md = re.sub(r'^(>.*\S)[ \t]*$', r'\1  ', md, flags=re.M)
    body = markdown.markdown(md, extensions=['tables', 'sane_lists', 'md_in_html'])
    # Stat blocks are blockquotes.
    body = re.sub(r'<blockquote>[\s\S]*?</blockquote>',
                  lambda m: re.sub(r'<p>[\s\S]*?</p>', bold_stats, m.group(0)), body)
    # The overall map gets a page of its own; rooms start on a fresh page.
    body = body.replace('<h2>Dungeon Map</h2>', '<h2 class="page-start">Dungeon Map</h2>')
    body = body.replace('<h2>Rooms</h2>', '<h2 class="page-start">Rooms</h2>')
    # A section of rooms starts on a fresh page, with its encounter table.
    body = re.sub(r'<h2>((?:Section\b|Other Rooms)[^<]*)</h2>', r'<h2 class="page-start">\1</h2>', body)
    # Keep each room banner together with its minimap.
    body = re.sub(r'(<h3>[\s\S]*?</h3>)\s*(<p>\s*<img[^>]*exits[^>]*>\s*</p>)?',
                  lambda m: f'<div class="room-head">{m.group(1)}{m.group(2) or ""}</div>', body)
    # A room is one unit: it never breaks across pages (a room taller than a
    # page still breaks, as it must).
    body = re.sub(r'(<div class="room-head">[\s\S]*?)(?=<div class="room-head">|<h2[ >]|$)',
                  r'<section class="room">\1</section>', body)
    return body


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
img[alt="Dungeon Map"] {{ width: 100%; max-height: 8.6in; object-fit: contain; }}
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
    html = (f'<html><head><meta charset="utf-8"><style>{module_css(fonts)}</style></head>'
            f'<body>{module_html(src.read_text(encoding="utf-8"))}</body></html>')
    HTML(string=html, base_url=str(src.parent)).write_pdf(out)
    return out


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    print(f'Saved PDF to {render(*sys.argv[1:3])}')

"""Theme art: freely licensed photos from Wikimedia Commons, cut out onto transparent backgrounds.

Fills assets/themes/<name>.png for the terminal themes (js/eggs.js shows each one as a "cameo" if it
exists) and writes assets/themes/credits.json, which how-it-works.html lists, because CC BY / CC BY-SA
photos must credit their photographer.

Runs on GitHub (.github/workflows/theme-art.yml); Wikimedia isn't reachable from every machine.
    pip install "rembg[cpu]" pillow requests
    python tests/theme_art.py                 # every target
    python tests/theme_art.py keanu gritty    # just these
    python tests/theme_art.py --sheet out.png # also save a contact sheet of what was tried
"""
import io, json, os, re, sys, html
import requests
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'themes')
API = 'https://commons.wikimedia.org/w/api.php'
UA = {'User-Agent': 'robwiscount.org theme art (https://robwiscount.org)'}

# Where to look, best first. Categories are tried in order, then a file search.
TARGETS = {
    'lebron-photo': {'cats': ['LeBron James in 2026', 'LeBron James in 2025', 'LeBron James in 2024', 'LeBron James in 2023'], 'search': 'LeBron James Lakers', 'person': True},
    'keanu':        {'cats': ['Keanu Reeves in 2023', 'Keanu Reeves in 2019', 'Keanu Reeves in 2017', 'Keanu Reeves'], 'search': 'Keanu Reeves', 'person': True},
    'swoop':        {'cats': ['Swoop (mascot)', 'Swoop (Philadelphia Eagles)'], 'search': 'Swoop Eagles mascot'},
    'phanatic':     {'cats': ['Phillie Phanatic'], 'search': 'Phillie Phanatic'},
    'gritty':       {'cats': ['Gritty (mascot)', 'Gritty'], 'search': 'Gritty Flyers mascot'},
    'franklin':     {'cats': ['Franklin the Dog', 'Franklin (mascot)'], 'search': 'Franklin 76ers mascot'},
}
# Licenses that allow reuse on a personal site with credit. (Commons doesn't host NC/ND files.)
OK_LICENSE = re.compile(r'^(cc0|cc[- ]by(-sa)?[- ]?\d|cc[- ]by(-sa)?$|public domain|pd)', re.I)
TRIES = 6        # candidates cut out per target
MAX_H = 640      # output height


def api(params):
    params = dict(params, format='json', formatversion=2)
    r = requests.get(API, params=params, headers=UA, timeout=30)
    r.raise_for_status()
    return r.json()


def files_in(params):
    q = api(dict(params, prop='imageinfo', iiprop='url|size|mime|extmetadata', iiurlwidth=1400))
    return [p for p in q.get('query', {}).get('pages', []) if p.get('imageinfo')]


def candidates(t):
    seen, out = set(), []
    for cat in t['cats']:
        out += files_in({'action': 'query', 'generator': 'categorymembers', 'gcmtitle': 'Category:' + cat, 'gcmtype': 'file', 'gcmlimit': 50})
        if len(out) >= 12:
            break
    if len(out) < 12:
        out += files_in({'action': 'query', 'generator': 'search', 'gsrsearch': t['search'] + ' filetype:bitmap', 'gsrnamespace': 6, 'gsrlimit': 30})
    good = []
    for p in out:
        if p['title'] in seen:
            continue
        seen.add(p['title'])
        ii = p['imageinfo'][0]
        meta = ii.get('extmetadata', {})
        lic = strip(meta.get('LicenseShortName', {}).get('value', ''))
        if ii.get('mime') not in ('image/jpeg', 'image/png') or not OK_LICENSE.match(lic):
            continue
        if min(ii.get('width', 0), ii.get('height', 0)) < 500:
            continue
        good.append({
            'title': p['title'], 'thumb': ii.get('thumburl') or ii['url'], 'page': ii.get('descriptionurl'),
            'w': ii['width'], 'h': ii['height'], 'license': lic,
            'license_url': meta.get('LicenseUrl', {}).get('value', ''),
            'author': strip(meta.get('Artist', {}).get('value', '')) or 'Unknown',
            'date': strip(meta.get('DateTimeOriginal', {}).get('value', '')),
        })
    # Prefer newer photos (for LeBron, "this year"), then bigger ones.
    good.sort(key=lambda c: (year(c['date']), c['w'] * c['h']), reverse=True)
    return good


def strip(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()


def year(s):
    m = re.search(r'(19|20)\d\d', s or '')
    return int(m.group(0)) if m else 0


def cutout(img, person):
    from rembg import remove, new_session
    session = cutout.sessions.get(person)
    if session is None:
        session = cutout.sessions[person] = new_session('u2net_human_seg' if person else 'isnet-general-use')
    return remove(img, session=session, post_process_mask=True)
cutout.sessions = {}


def score(cut):
    """How good is this cutout? One clear subject, not tiny, not the whole frame, not touching every edge."""
    a = cut.getchannel('A')
    w, h = a.size
    box = a.getbbox()
    if not box:
        return 0, None
    fg = sum(1 for v in a.getdata() if v > 128) / float(w * h)
    edges = sum([box[0] <= 2, box[1] <= 2, box[2] >= w - 2, box[3] >= h - 2])
    if fg < 0.06 or fg > 0.8:
        return 0, box
    return (1 - abs(fg - 0.32)) * (1 - 0.15 * edges), box


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    sheet_path = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    names = [a for a in args if a in TARGETS] or list(TARGETS)
    os.makedirs(OUT, exist_ok=True)
    credits_path = os.path.join(OUT, 'credits.json')
    credits = json.load(open(credits_path)) if os.path.exists(credits_path) else {}
    tried, failed = [], []
    for name in names:
        t = TARGETS[name]
        try:
            cands = candidates(t)
        except Exception as e:
            print(f'{name}: Commons lookup failed: {e}')
            failed.append(name)
            continue
        print(f'{name}: {len(cands)} reusable candidates')
        best = None
        for c in cands[:TRIES]:
            try:
                img = Image.open(io.BytesIO(requests.get(c['thumb'], headers=UA, timeout=60).content)).convert('RGB')
                cut = cutout(img, t.get('person', False))
                s, box = score(cut)
                tried.append((name, c['title'], s, cut))
                print(f'  {s:.2f}  {c["title"]}  ({c["license"]})')
                if box and (best is None or s > best[0]):
                    best = (s, cut.crop(box), c)
            except Exception as e:
                print(f'  skip {c["title"]}: {e}')
        if not best or best[0] <= 0:
            print(f'{name}: no clean cutout found')
            failed.append(name)
            continue
        s, img, c = best
        if img.height > MAX_H:
            img = img.resize((round(img.width * MAX_H / img.height), MAX_H), Image.LANCZOS)
        img.save(os.path.join(OUT, name + '.png'), optimize=True)
        credits[name] = {'title': c['title'].replace('File:', ''), 'author': c['author'], 'license': c['license'],
                         'license_url': c['license_url'], 'source': c['page'], 'date': c['date']}
        print(f'{name}: saved ({s:.2f}) from {c["title"]}')
    json.dump(credits, open(credits_path, 'w'), indent=2, ensure_ascii=False)
    if sheet_path and tried:
        cell = 220
        sheet = Image.new('RGB', (cell * TRIES, cell * len(names)), (20, 24, 34))
        rows = {n: i for i, n in enumerate(names)}
        cols = {}
        for name, title, s, cut in tried:
            col = cols[name] = cols.get(name, -1) + 1
            th = cut.copy(); th.thumbnail((cell - 10, cell - 30))
            sheet.paste(th, (col * cell + 5, rows[name] * cell + 5), th)
            ImageDraw.Draw(sheet).text((col * cell + 6, rows[name] * cell + cell - 20), f'{name} {s:.2f}', fill=(220, 230, 255))
        sheet.save(sheet_path)
    if failed:
        print('Not found:', ', '.join(failed), '(the site falls back to emoji for these)')
    if len(failed) == len(names):
        sys.exit(1)


if __name__ == '__main__':
    main()

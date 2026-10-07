"""Theme art: freely licensed photos from Wikimedia Commons, cut out onto transparent backgrounds.

Fills assets/themes/<name>.png for the terminal themes (js/eggs.js shows each one as a "cameo" if it
exists) and writes assets/themes/credits.json, which how-it-works.html lists, because CC BY / CC BY-SA
photos must credit their photographer.

Runs on GitHub (.github/workflows/theme-art.yml); Wikimedia isn't reachable from every machine.
    pip install "rembg[cpu]" pillow requests scipy
    python tests/theme_art.py                 # every target
    python tests/theme_art.py keanu gritty    # just these
    python tests/theme_art.py --sheet out.png # also save a contact sheet of what was tried
    python tests/theme_art.py --review        # save every candidate cutout to assets/themes/_review/ to pick from

A target with "files" uses exactly those Commons files (picked by eye from a --review run); otherwise
it searches, and "must"/"avoid" keep the search honest (a file has to actually be about the subject).
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
    'lebron-photo': {'files': ['File:LeBron James, Olympic Games 2024.jpg'],
                     'cats': ['LeBron James in 2026', 'LeBron James in 2025', 'LeBron James in 2024', 'LeBron James in 2023'], 'search': 'LeBron James Lakers',
                     'must': r'lebron', 'person': True},
    'keanu':        {'cats': ['Keanu Reeves in 2023', 'Keanu Reeves in 2019', 'Keanu Reeves in 2017', 'Keanu Reeves in 2014', 'Keanu Reeves'], 'search': 'Keanu Reeves',
                     'must': r'keanu', 'avoid': r'mural|graffiti|paint|statue|wax|poster|drawing|art\b|cosplay', 'person': True},
    'swoop':        {'cats': ['Swoop (Philadelphia Eagles)', 'Swoop (mascot)'], 'search': 'Swoop Eagles mascot',
                     'must': r'\bswoop\b', 'avoid': r'stadium|field|aerial'},
    'phanatic':     {'cats': ['Phillie Phanatic'], 'search': 'Phillie Phanatic',
                     'must': r'phanatic', 'avoid': r'phoebe|cart|vehicle'},
    'gritty':       {'cats': ['Gritty (mascot)', 'Gritty (Philadelphia Flyers)'], 'search': 'Gritty Philadelphia Flyers mascot',
                     'must': r'\bgritty\b.*(flyers|mascot)|(flyers|mascot).*\bgritty\b', 'avoid': r'angels|band|pride'},
    'franklin':     {'cats': ['Franklin the Dog', 'Franklin (mascot)', 'Franklin (Philadelphia 76ers)'], 'search': 'Franklin 76ers mascot',
                     'must': r'franklin', 'avoid': r'benjamin|statue'},
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
    if t.get('files'):
        out = files_in({'action': 'query', 'titles': '|'.join(t['files'])})
    for cat in ([] if t.get('files') else t['cats']):
        out += files_in({'action': 'query', 'generator': 'categorymembers', 'gcmtitle': 'Category:' + cat, 'gcmtype': 'file', 'gcmlimit': 50})
        if len(out) >= 12:
            break
    if len(out) < 12 and not t.get('files'):
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
        about = ' '.join([p['title'], strip(meta.get('ImageDescription', {}).get('value', '')),
                          strip(meta.get('ObjectName', {}).get('value', '')), meta.get('Categories', {}).get('value', '')])
        if not t.get('files'):  # a pinned file is trusted; a found one has to be about the subject
            if t.get('must') and not re.search(t['must'], about, re.I):
                continue
            if t.get('avoid') and re.search(t['avoid'], about, re.I):
                continue
        good.append({
            'title': p['title'], 'thumb': ii.get('thumburl') or ii['url'], 'page': ii.get('descriptionurl'),
            'w': ii['width'], 'h': ii['height'], 'license': lic,
            'license_url': meta.get('LicenseUrl', {}).get('value', ''),
            'author': strip(meta.get('Artist', {}).get('value', '')) or 'Unknown',
            'date': strip(meta.get('DateTimeOriginal', {}).get('value', '')),
        })
    # Pinned files keep their order; otherwise prefer newer photos (for LeBron, "this year"), then bigger ones.
    if t.get('files'):
        order = {f.replace('File:', '').replace('_', ' '): i for i, f in enumerate(t['files'])}
        good.sort(key=lambda c: order.get(c['title'].replace('File:', ''), 99))
        return good
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
    return main_subject(remove(img, session=session, post_process_mask=True))
cutout.sessions = {}


def main_subject(cut):
    """Keep the biggest blob in the cutout (plus any big pieces of it), so bystanders and stage clutter drop out."""
    import numpy as np
    from scipy import ndimage
    a = np.array(cut.getchannel('A'))
    labels, n = ndimage.label(a > 128)
    if n <= 1:
        return cut
    sizes = ndimage.sum(np.ones_like(a), labels, range(1, n + 1))
    keep = [i + 1 for i, sz in enumerate(sizes) if sz >= 0.25 * sizes.max()]
    mask = np.isin(labels, keep)
    mask = ndimage.binary_dilation(mask, iterations=3)  # keep the soft edge around what stays
    out = np.array(cut)
    out[..., 3] = np.where(mask, out[..., 3], 0)
    return Image.fromarray(out)


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
    tall = (box[3] - box[1]) / float(h)  # a subject that fills the frame top to bottom reads well as a cameo
    return (1 - abs(fg - 0.32)) * (1 - 0.15 * edges) * (0.5 + 0.5 * tall), box


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    sheet_path = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    review = '--review' in sys.argv
    tries = 12 if review else TRIES
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
        picks = []
        for c in cands[:tries]:
            try:
                img = Image.open(io.BytesIO(requests.get(c['thumb'], headers=UA, timeout=60).content)).convert('RGB')
                cut = cutout(img, t.get('person', False))
                s, box = score(cut)
                tried.append((name, c['title'], s, cut))
                print(f'  {s:.2f}  {c["title"]}  ({c["license"]})')
                if box:
                    picks.append({'n': len(picks), 'score': round(s, 3), 'title': c['title'], 'license': c['license'], 'source': c['page']})
                    if review:
                        d = os.path.join(OUT, '_review', name)
                        os.makedirs(d, exist_ok=True)
                        th = cut.crop(box); th.thumbnail((480, 480)); th.save(os.path.join(d, '%02d.png' % (len(picks) - 1)))
                if box and (best is None or s > best[0]):
                    best = (s, cut.crop(box), c)
            except Exception as e:
                print(f'  skip {c["title"]}: {e}')
        if review:
            json.dump(picks, open(os.path.join(OUT, '_review', name, 'index.json'), 'w'), indent=2, ensure_ascii=False)
            continue
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
    if not review:
        json.dump(credits, open(credits_path, 'w'), indent=2, ensure_ascii=False)
    if sheet_path and tried:
        cell = 220
        sheet = Image.new('RGB', (cell * tries, cell * len(names)), (20, 24, 34))
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
    if len(failed) == len(names) and not review:
        sys.exit(1)


if __name__ == '__main__':
    main()

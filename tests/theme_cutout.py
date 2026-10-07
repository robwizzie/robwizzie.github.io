"""Theme cameos from Rob's own photos: cuts each one out onto a transparent background.

Drop photos into tests/theme-src/ named for the theme they belong to (any of .jpg .jpeg .png .heic .webp):
    lebron-photo   keanu   swoop   phanatic   gritty   franklin
and run
    pip install "rembg[cpu]" pillow scipy pillow-heif
    python tests/theme_cutout.py              # every photo in tests/theme-src/
    python tests/theme_cutout.py gritty       # just these
Each becomes assets/themes/<name>.png (js/eggs.js shows it as that theme's cameo; LeBron's also fills the
portrait). A photo that already has a transparent background is just trimmed and resized.
Optional crop before cutting, as fractions (left, top, right, bottom), e.g. to drop a bystander:
    python tests/theme_cutout.py phanatic --crop 0.2,0,1,1
"""
import glob, os, sys
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tests', 'theme-src')
OUT = os.path.join(ROOT, 'assets', 'themes')
NAMES = ['lebron-photo', 'keanu', 'swoop', 'phanatic', 'gritty', 'franklin']
EXTS = ('.jpg', '.jpeg', '.png', '.heic', '.webp')
MAX_H = 640


def load(path):
    if path.lower().endswith('.heic'):
        import pillow_heif
        pillow_heif.register_heif_opener()
    img = ImageOps.exif_transpose(Image.open(path))  # phone photos carry their rotation in EXIF
    img.thumbnail((1600, 1600))
    return img


def has_transparency(img):
    return img.mode in ('RGBA', 'LA') and img.getchannel('A').getextrema()[0] < 250


def main_subject(cut):
    """Keep the biggest blob in the cutout (plus any big pieces of it), so bystanders and clutter drop out."""
    import numpy as np
    from scipy import ndimage
    a = np.array(cut.getchannel('A'))
    labels, n = ndimage.label(a > 128)
    if n <= 1:
        return cut
    sizes = ndimage.sum(np.ones_like(a), labels, range(1, n + 1))
    keep = [i + 1 for i, sz in enumerate(sizes) if sz >= 0.25 * sizes.max()]
    mask = ndimage.binary_dilation(np.isin(labels, keep), iterations=3)  # keep the soft edge around what stays
    out = np.array(cut)
    out[..., 3] = np.where(mask, out[..., 3], 0)
    return Image.fromarray(out)


def cutout(img):
    from rembg import remove, new_session
    if cutout.session is None:
        cutout.session = new_session('isnet-general-use')  # handles people and mascots alike
    return main_subject(remove(img.convert('RGB'), session=cutout.session, post_process_mask=True))
cutout.session = None


def make(name, path, crop=None):
    img = load(path)
    if crop:
        w, h = img.size
        img = img.crop((round(crop[0] * w), round(crop[1] * h), round(crop[2] * w), round(crop[3] * h)))
    cut = img.convert('RGBA') if has_transparency(img) else cutout(img)
    box = cut.getchannel('A').getbbox()
    if not box:
        print(f'{name}: nothing left after the cutout, skipped')
        return
    cut = cut.crop(box)
    if cut.height > MAX_H:
        cut = cut.resize((round(cut.width * MAX_H / cut.height), MAX_H), Image.LANCZOS)
    cut.save(os.path.join(OUT, name + '.png'), optimize=True)
    print(f'{name}: {os.path.basename(path)} -> assets/themes/{name}.png {cut.size}')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    crop = None
    if '--crop' in sys.argv:
        crop = [float(v) for v in sys.argv[sys.argv.index('--crop') + 1].split(',')]
        args = [a for a in args if a != sys.argv[sys.argv.index('--crop') + 1]]
    names = [a for a in args if a in NAMES] or NAMES
    os.makedirs(OUT, exist_ok=True)
    for name in names:
        found = [f for f in sorted(glob.glob(os.path.join(SRC, name + '.*'))) if f.lower().endswith(EXTS)]
        if found:
            make(name, found[0], crop)
        elif len(names) == 1 or name in args:
            print(f'{name}: no photo in tests/theme-src/ (the theme falls back to emoji)')


if __name__ == '__main__':
    main()

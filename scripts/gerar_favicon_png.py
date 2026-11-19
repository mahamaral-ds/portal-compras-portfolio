"""Gera assets/favicon.png (64x64) a partir das mesmas formas de assets/favicon.svg, so' com Pillow (sem fontes)."""
import math
import os
from PIL import Image, ImageDraw

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
S = 4                                  # supersampling para bordas suaves
img = Image.new('RGBA', (64 * S, 64 * S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, 64 * S - 1, 64 * S - 1], radius=14 * S, fill='#2453A6')
d.ellipse([(32 - 21) * S, (32 - 21) * S, (32 + 21) * S, (32 + 21) * S], outline='#EEF1F7', width=4 * S)
d.pieslice([(32 - 15.5) * S, (31 - 15.5) * S, (32 + 15.5) * S, (31 + 15.5) * S], 180, 360, fill='#6E9BF0')
pts = [((14.5 + t * 34.8 / 60) * S, (39.5 - 2.3 * math.sin(t / 60 * 3 * math.pi)) * S) for t in range(61)]
d.line(pts, fill='#FFFFFF', width=int(3.6 * S), joint='curve')
for x, y in (pts[0], pts[-1]):
    r = 1.8 * S
    d.ellipse([x - r, y - r, x + r, y + r], fill='#FFFFFF')
img.resize((64, 64), Image.LANCZOS).save(os.path.join(RAIZ, 'assets', 'favicon.png'), optimize=True)
print('assets/favicon.png gerado')

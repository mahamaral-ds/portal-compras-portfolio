"""Gera assets/favicon.png (64x64) a partir das mesmas formas de assets/favicon.svg (xicara com o sol nascendo),
so' com Pillow (sem fontes)."""
import math
import os
from PIL import Image, ImageDraw

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
S = 4                                  # supersampling para bordas suaves


def p(x, y):
    return (x * S, y * S)


def arco(cx, cy, r, a0, a1, n=40):
    """pontos de um arco (graus; 0 = direita, 90 = baixo, como no Pillow)"""
    return [p(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)))
            for i in range(n + 1)]


def ponta(d, xy, larg, cor):
    r = larg / 2
    d.ellipse([xy[0] - r, xy[1] - r, xy[0] + r, xy[1] + r], fill=cor)


img = Image.new('RGBA', (64 * S, 64 * S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, 64 * S - 1, 64 * S - 1], radius=14 * S, fill='#2453A6')
d.pieslice([p(29 - 11, 30 - 11), p(29 + 11, 30 + 11)], 180, 360, fill='#6E9BF0')          # sol nascendo
xicara = [p(13, 30), p(45, 30), p(45, 33)] + arco(29, 33, 16, 0, 180) + [p(13, 30)]
d.line(xicara, fill='#FFFFFF', width=4 * S, joint='curve')
alca = [p(45, 33), p(48, 33)] + arco(48, 38.5, 5.5, -90, 90) + [p(44, 44)]
d.line(alca, fill='#FFFFFF', width=4 * S, joint='curve')
ponta(d, p(44, 44), 4 * S, '#FFFFFF')
d.line([p(9, 54.5), p(53, 54.5)], fill='#EEF1F7', width=4 * S)                          # pires
for xy in (p(9, 54.5), p(53, 54.5)):
    ponta(d, xy, 4 * S, '#EEF1F7')
img.resize((64, 64), Image.LANCZOS).save(os.path.join(RAIZ, 'assets', 'favicon.png'), optimize=True)
print('assets/favicon.png gerado')

"""
Gera o material ilustrativo da pagina Gestao do Conhecimento (Guia de Strategic Sourcing do Grupo Quintaluz, ficticio):

    modules/gestao-conhecimento/assets/slides/*.png   uma imagem por topico (usadas nos carrosseis da pagina)
    modules/gestao-conhecimento/assets/guia-strategic-sourcing.pdf   capa + os mesmos slides, para download

Tudo e' desenhado aqui com Pillow (formas + fonte DejaVu Sans, de licenca livre, que vem com o matplotlib), sem
imagens de terceiros.
Os numeros dos exemplos sao ficticios.

Uso:
    python scripts/gerar_material_treinamento.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
DESTINO = os.path.join(RAIZ, 'modules', 'gestao-conhecimento', 'assets')
W, H = 1280, 720

INK, PAPER, LINE, MUTED = '#121A2B', '#F6F7FA', '#E1E5EE', '#5A6274'
BRAND, DEEP, LIGHT, TINT = '#2453A6', '#15306A', '#6E9BF0', '#E8EEFA'
AMBER, GREEN, RED, TEAL = '#D9962A', '#2F8F5B', '#C0442C', '#0E6E6E'


def _caminho_fonte():
    """DejaVu Sans (licenca livre) que acompanha o matplotlib; sem ela, cai na fonte embutida do Pillow (sem acentos)."""
    try:
        import matplotlib
        return os.path.join(os.path.dirname(matplotlib.__file__), 'mpl-data', 'fonts', 'ttf', 'DejaVuSans.ttf')
    except ImportError:
        return None


FONTE = _caminho_fonte()


def fonte(tam):
    if FONTE and os.path.exists(FONTE):
        return ImageFont.truetype(FONTE, int(tam * 0.92))
    return ImageFont.load_default(size=tam)


def novo_slide(titulo, subtitulo, numero):
    img = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 8], fill=BRAND)
    d.text((64, 46), titulo, font=fonte(38), fill=INK)
    d.text((64, 98), subtitulo, font=fonte(22), fill=MUTED)
    d.line([64, 140, W - 64, 140], fill=LINE, width=2)
    d.text((64, H - 44), 'Guia de Strategic Sourcing · Grupo Quintaluz (empresa fictícia) · exemplos ilustrativos',
           font=fonte(16), fill=MUTED)
    d.text((W - 100, H - 44), f'{numero:02d}', font=fonte(16), fill=MUTED)
    return img, d


def caixa(d, xy, texto, fundo=TINT, cor=INK, tam=22, borda=None, raio=14, centro=True):
    d.rounded_rectangle(xy, radius=raio, fill=fundo, outline=borda, width=2 if borda else 0)
    linhas = texto.split('\n')
    f = fonte(tam)
    alt = len(linhas) * (tam + 8) - 8
    y = (xy[1] + xy[3]) / 2 - alt / 2
    for ln in linhas:
        w = d.textlength(ln, font=f)
        x = (xy[0] + xy[2]) / 2 - w / 2 if centro else xy[0] + 18
        d.text((x, y), ln, font=f, fill=cor)
        y += tam + 8


def seta(d, x1, y1, x2, y2, cor=MUTED, w=3):
    d.line([x1, y1, x2, y2], fill=cor, width=w)
    ang = math.atan2(y2 - y1, x2 - x1)
    for s in (-1, 1):
        d.line([x2, y2, x2 - 14 * math.cos(ang + s * 0.45), y2 - 14 * math.sin(ang + s * 0.45)], fill=cor, width=w)


def s_categorias(n):
    img, d = novo_slide('Árvore de categorias', 'Itens agrupados por base fornecedora e uso em comum', n)
    caixa(d, (520, 170, 760, 230), 'Gasto total', fundo=INK, cor='white')
    grupos = [('Proteínas', ['Bovinos', 'Aves', 'Pescados']), ('Hortifrúti', ['Legumes', 'Frutas', 'Verduras']),
              ('Mercearia', ['Grãos', 'Massas', 'Óleos']), ('Bebidas', ['Cervejas', 'Águas', 'Destilados'])]
    for i, (g, subs) in enumerate(grupos):
        x = 90 + i * 285
        caixa(d, (x, 300, x + 240, 356), g, fundo=BRAND, cor='white')
        seta(d, 640, 230, x + 120, 298)
        for j, s in enumerate(subs):
            caixa(d, (x + 20, 390 + j * 72, x + 220, 446 + j * 72), s, tam=20)
    return img


def s_metodologia(n):
    img, d = novo_slide('A metodologia em 8 etapas', 'Do diagnóstico interno ao acompanhamento do contrato', n)
    etapas = ['Requerimentos\ninternos', 'Mercado\nfornecedor', 'Custo total\n(TCO)', 'Modelo de\nfornecimento',
              'Análise de\nfornecedores', 'Cotação\n(RFP)', 'Negociação', 'Acordos e\nmonitoramento']
    for i, e in enumerate(etapas):
        lin, col = divmod(i, 4)
        x, y = 80 + col * 290, 200 + lin * 230
        caixa(d, (x, y, x + 240, y + 140), f'{i + 1}\n{e}', fundo=BRAND if lin == 0 else DEEP, cor='white', tam=22)
        if col < 3:
            seta(d, x + 244, y + 70, x + 286, y + 70)
    seta(d, 1240, 270, 1240, 470, cor=LIGHT)
    d.text((80, 640), 'Análise (etapas 1 a 4)  →  Execução (etapas 5 a 8)', font=fonte(20), fill=MUTED)
    return img


def s_perfil(n):
    img, d = novo_slide('Perfil da categoria', 'Seis perguntas antes de ir ao mercado', n)
    itens = [('Preço', 'Quanto pagamos, onde\ne de quem?'), ('Volume', 'Quanto consumimos e\ncom que sazonalidade?'),
             ('Especificação', 'O que de fato precisamos?\nDá para padronizar?'), ('Processo', 'Quem pede, quem aprova,\nquem recebe?'),
             ('Barreiras', 'Regras, prazos e\nrestrições de troca'), ('Base fornecedora', 'Quantos fornecedores\nfazem 80% do gasto?')]
    for i, (t, txt) in enumerate(itens):
        lin, col = divmod(i, 3)
        x, y = 80 + col * 380, 180 + lin * 230
        d.rounded_rectangle((x, y, x + 340, y + 190), radius=16, fill=PAPER, outline=LINE, width=2)
        d.ellipse((x + 22, y + 22, x + 66, y + 66), fill=BRAND)
        d.text((x + 38, y + 30), str(i + 1), font=fonte(22), fill='white')
        d.text((x + 84, y + 30), t, font=fonte(26), fill=INK)
        d.multiline_text((x + 24, y + 96), txt, font=fonte(20), fill=MUTED, spacing=8)
    return img


def s_swot(n):
    img, d = novo_slide('SWOT da categoria Hortifrúti', 'Exemplo fictício para uma rede de restaurantes', n)
    quad = [('Forças', 'Volume concentrado em duas\ncapitais; contratos semanais', GREEN),
            ('Fraquezas', 'Especificações diferentes\npor marca; pouca previsão', RED),
            ('Oportunidades', 'Produtores regionais e\ncompra direta por safra', BRAND),
            ('Ameaças', 'Clima e entressafra elevam\npreços em até 40%', AMBER)]
    for i, (t, txt, cor) in enumerate(quad):
        lin, col = divmod(i, 2)
        x, y = 120 + col * 540, 170 + lin * 240
        d.rounded_rectangle((x, y, x + 500, y + 210), radius=16, fill='white', outline=cor, width=4)
        d.text((x + 28, y + 24), t, font=fonte(30), fill=cor)
        d.multiline_text((x + 28, y + 90), txt, font=fonte(22), fill=INK, spacing=10)
    d.text((120, 655 - 24), 'Interno: forças e fraquezas  ·  Externo: oportunidades e ameaças', font=fonte(18), fill=MUTED)
    return img


def s_mercado(n):
    img, d = novo_slide('Concentração do mercado fornecedor', 'Participação de mercado ilustrativa — categoria Laticínios', n)
    dados = [('Fornecedor A', 31), ('Fornecedor B', 22), ('Fornecedor C', 14), ('Fornecedor D', 9), ('Outros 40+', 24)]
    for i, (nome, v) in enumerate(dados):
        y = 200 + i * 86
        d.text((80, y + 14), nome, font=fonte(22), fill=INK)
        d.rounded_rectangle((300, y, 300 + v * 22, y + 52), radius=8, fill=BRAND if i < 4 else LINE)
        d.text((312 + v * 22, y + 14), f'{v}%', font=fonte(22), fill=INK)
    caixa(d, (1010, 230, 1220, 440), 'Top 3 =\n67% do\nmercado', fundo=DEEP, cor='white', tam=26)
    d.text((80, 640), 'Mercado concentrado: menos poder de barganha, mais foco em parceria e custo total.', font=fonte(20), fill=MUTED)
    return img


def s_tco(n):
    img, d = novo_slide('Custo total de propriedade (TCO)', 'O preço é só uma parte do custo — exemplo: R$ por kg de proteína', n)
    partes = [('Preço de compra', 38.0, BRAND), ('Frete e impostos', 4.6, LIGHT), ('Armazenagem fria', 2.1, TEAL),
              ('Porcionamento', 3.4, AMBER), ('Perdas e quebra', 2.9, RED)]
    x, base = 120, 610
    acum = 0
    for nome, v, cor in partes:
        topo = base - (acum + v) * 8
        d.rectangle((x, topo, x + 150, base - acum * 8), fill=cor)
        d.text((x, topo - 34), f'R$ {v:.1f}'.replace('.', ','), font=fonte(20), fill=INK)
        d.multiline_text((x, base + 10), nome.replace(' ', '\n', 1), font=fonte(17), fill=MUTED, spacing=4)
        acum += v
        x += 190
    d.rectangle((x, base - acum * 8, x + 150, base), fill=INK)
    d.text((x, base - acum * 8 - 34), f'R$ {acum:.1f}'.replace('.', ','), font=fonte(20), fill=INK)
    d.text((x, base + 10), 'Custo\ntotal', font=fonte(17), fill=MUTED)
    return img


def s_kraljic(n):
    img, d = novo_slide('Matriz de posicionamento (Kraljic)', 'Impacto no resultado × risco de fornecimento define o modelo', n)
    x0, y0, s = 260, 170, 230
    quad = [('Alavancagem', 'Concorrência e\nconsolidação de volume', BRAND, 0, 0),
            ('Estratégicos', 'Parceria e contratos\nde longo prazo', DEEP, 1, 0),
            ('Não críticos', 'Catálogo, automação\ne menos esforço', LIGHT, 0, 1),
            ('Gargalo', 'Garantir oferta e\ndesenvolver alternativas', AMBER, 1, 1)]
    for t, txt, cor, cx, cy in quad:
        x, y = x0 + cx * (s * 1.7), y0 + cy * s
        d.rectangle((x, y, x + s * 1.7 - 8, y + s - 8), fill=cor)
        d.text((x + 24, y + 24), t, font=fonte(28), fill='white')
        d.multiline_text((x + 24, y + 86), txt, font=fonte(20), fill='white', spacing=8)
    d.text((x0, y0 + 2 * s + 6), 'Risco de fornecimento  →', font=fonte(20), fill=MUTED)
    d.text((70, y0 + 20), 'Impacto\nno gasto\n↑', font=fonte(20), fill=MUTED)
    return img


def s_funil(n):
    img, d = novo_slide('Do funil à lista curta', 'Exemplo fictício: RFI para a categoria Embalagens', n)
    etapas = [('Fornecedores mapeados', 42), ('Responderam a RFI', 27), ('Atendem requisitos técnicos', 15),
              ('Saúde financeira e capacidade', 9), ('Lista curta para a RFP', 5)]
    for i, (t, v) in enumerate(etapas):
        larg = 1000 - i * 170
        x = (W - larg) / 2
        y = 175 + i * 82
        d.rounded_rectangle((x, y, x + larg, y + 76), radius=12, fill=[BRAND, '#3563B5', '#4C7BC9', LIGHT, DEEP][i])
        caixa(d, (x, y, x + larg, y + 76), f'{t}: {v}', fundo=None or [BRAND, '#3563B5', '#4C7BC9', LIGHT, DEEP][i], cor='white')
    return img


def s_equalizacao(n):
    img, d = novo_slide('Equalização de propostas', 'Variação de cada proposta contra a baseline (custo atual) — exemplo fictício', n)
    dados = [('Fornecedor 1', -6), ('Fornecedor 2', 3), ('Fornecedor 3', -58), ('Fornecedor 4', -9), ('Fornecedor 5', 11)]
    zero = 700
    d.line([zero, 170, zero, 600], fill=MUTED, width=2)
    for i, (t, v) in enumerate(dados):
        y = 190 + i * 82
        d.text((120, y + 14), t, font=fonte(22), fill=INK)
        cor = RED if v < -30 else (GREEN if v < 0 else AMBER)
        x2 = zero + v * 7
        d.rectangle((min(zero, x2), y, max(zero, x2), y + 52), fill=cor)
        d.text((x2 + (10 if v > 0 else -70), y + 14), f'{v:+d}%', font=fonte(22), fill=INK)
    d.text((120, 630), 'Desvio muito grande (Fornecedor 3) indica escopo mal entendido: equalizar antes de comparar.', font=fonte(20), fill=MUTED)
    return img


def s_estilos(n):
    img, d = novo_slide('Estilos de negociação', 'Posicional × baseada em fatos', n)
    for i, (t, pros, contras, cor) in enumerate([
            ('Posicional', 'Simples e rápida\nPouca preparação', 'Desgasta a relação\nIgnora interesses', AMBER),
            ('Baseada em fatos', 'Ganhos para os dois lados\nResultado duradouro', 'Exige dados e preparo\nLeva mais tempo', BRAND)]):
        x = 110 + i * 545
        d.rounded_rectangle((x, 180, x + 505, 600), radius=18, fill=PAPER, outline=cor, width=4)
        d.text((x + 30, 206), t, font=fonte(32), fill=cor)
        d.text((x + 30, 290), 'Prós', font=fonte(22), fill=GREEN)
        d.multiline_text((x + 30, 330), pros, font=fonte(22), fill=INK, spacing=10)
        d.text((x + 30, 440), 'Contras', font=fonte(22), fill=RED)
        d.multiline_text((x + 30, 480), contras, font=fonte(22), fill=INK, spacing=10)
    return img


def s_ipf(n):
    img, d = novo_slide('IPF — Índice de Performance do Fornecedor', 'Três indicadores acordados em contrato — leitura fictícia do mês', n)
    for i, (t, meta, real) in enumerate([('Qualidade dos itens', 98, 99.1), ('OTIF', 95, 91.4), ('Atendimento', 95, 96.8)]):
        cx, cy, r = 250 + i * 390, 400, 140
        d.arc((cx - r, cy - r, cx + r, cy + r), 180, 360, fill=LINE, width=34)
        ok = real >= meta
        d.arc((cx - r, cy - r, cx + r, cy + r), 180, 180 + 180 * min(real, 100) / 100, fill=GREEN if ok else RED, width=34)
        txt = f'{real:.1f}%'.replace('.', ',')
        d.text((cx - d.textlength(txt, font=fonte(34)) / 2, cy - 60), txt, font=fonte(34), fill=INK)
        d.text((cx - d.textlength(t, font=fonte(22)) / 2, cy + 30), t, font=fonte(22), fill=INK)
        m = f'meta ≥ {meta}%'
        d.text((cx - d.textlength(m, font=fonte(18)) / 2, cy + 66), m, font=fonte(18), fill=MUTED)
    return img


SLIDES = [
    ('slide-01-categorias.png', s_categorias), ('slide-02-metodologia.png', s_metodologia),
    ('slide-03-perfil.png', s_perfil), ('slide-04-swot.png', s_swot), ('slide-05-mercado.png', s_mercado),
    ('slide-06-tco.png', s_tco), ('slide-07-kraljic.png', s_kraljic), ('slide-08-funil.png', s_funil),
    ('slide-09-equalizacao.png', s_equalizacao), ('slide-10-estilos.png', s_estilos), ('slide-11-ipf.png', s_ipf),
]


def capa():
    img = Image.new('RGB', (W, H), INK)
    d = ImageDraw.Draw(img)
    d.ellipse((90, 220, 250, 380), outline=LIGHT, width=8)
    d.pieslice((115, 245, 225, 355), 180, 360, fill=LIGHT)
    pts = [(105 + t * 1.3, 330 - 9 * math.sin(t / 130 * 3 * math.pi)) for t in range(131)]
    d.line(pts, fill='white', width=8)
    d.text((300, 230), 'Guia de Strategic Sourcing', font=fonte(54), fill='white')
    d.text((300, 310), 'Grupo Quintaluz Gastronomia · Compras & Suprimentos', font=fonte(26), fill='#AEB6C6')
    d.text((300, 380), 'Material de demonstração — empresa e exemplos fictícios', font=fonte(22), fill=LIGHT)
    return img


def main():
    pasta = os.path.join(DESTINO, 'slides')
    os.makedirs(pasta, exist_ok=True)
    paginas = [capa()]
    for i, (nome, fn) in enumerate(SLIDES, start=1):
        img = fn(i)
        img.save(os.path.join(pasta, nome), optimize=True)
        paginas.append(img)
    pdf = os.path.join(DESTINO, 'guia-strategic-sourcing.pdf')
    paginas[0].save(pdf, save_all=True, append_images=paginas[1:], resolution=96,
                    title='Guia de Strategic Sourcing — Grupo Quintaluz (ficticio)', author='Portal de Compras (demonstração)')
    print(f'{len(SLIDES)} slides e o PDF gerados em {DESTINO}')


if __name__ == '__main__':
    main()

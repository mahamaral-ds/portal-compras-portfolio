"""
Gera o data.js da pagina "Commodities e Insights" (aba Painel de Commodities), a partir de duas fontes SINTETICAS:
  1. Planilha BRUTA de notas fiscais do Grupo Quintaluz (empresa ficticia, a mesma dos demais modulos): gasto mensal
     e PRECO PAGO por familia de commodity. O preco usa a mesma regra de Analise de Itens (unidade de referencia por
     item, sem registros suspeitos — shared em modules/analise-itens/unidade_referencia.py -> base_de_preco()).
  2. raw-data/indices-mercado.json: series sinteticas de IPCA (por item/grupo de referencia de cada familia, IPCA geral
     e Alimentacao e bebidas) e de dolar, geradas por scripts/gerar_dados_sinteticos.py com a mesma semente das notas.
     Na versao original as series vinham das APIs publicas do IBGE (SIDRA 7060) e do Banco Central (SGS 10813); nesta
     versao de demonstracao o build nao acessa a internet e o resultado e' sempre reproduzivel.
Familias: carne bovina, suino, frango, leite e derivados, trigo (farinhas e massas), oleos e azeite, cafe, acucar e
tomate/batata/cebola. A regra de cada uma esta em FAMILIAS abaixo (por SUBGRUPO e/ou nome do item).
Indice de preco pago (por familia): encadeado mes a mes (Laspeyres encadeado). Entre o mes anterior e o mes, usa so'
os itens com preco nos dois meses, ponderados pelo gasto de cada item no mes anterior; itens cuja razao de preco fica
fora de [1/3, 3] sao desconsiderados (provavel erro de cadastro) e o mes so' conta se os itens usados cobrem pelo menos
50% do gasto com preco do mes anterior. O data.js guarda a RAZAO de cada mes (preco do mes / preco do mes anterior),
e a pagina refaz o indice (base 100) a partir do primeiro mes do periodo escolhido.
Uso:
    python build_data.py "caminho/para/base-raw-compras.xlsx" ["caminho/para/indices-mercado.json"]
Gera/sobrescreve: data.js (na mesma pasta deste script)
"""
import sys
import os
import re
import json
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, '..', '..', 'shared_py'))
sys.path.insert(0, os.path.join(BASE_DIR, '..', 'analise-itens'))
from etl_common import raw_to_consolidada  # noqa: E402
import unidade_referencia as ur  # noqa: E402

# Mesma lista dos demais modulos que leem a base bruta: o "gasto" daqui bate com o de Overview/Indicadores/Categorias
EXCLUDE_GRUPOS_RAW = [
    'MANUTENCAO', 'CONSUMO', 'UTENSILIOS',
    'DESCARTAVEIS', 'CIGARROS', 'MAQUINAS E EQUIPAMENTOS', 'SERVICOS'
]
TOP_N_ITENS = 12
COBERTURA_MIN = 0.5
RAZAO_MIN, RAZAO_MAX = 1 / 3, 3

MONTH_LABELS_PT = {'01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
                   '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'}

# id, nome, descricao da regra, funcao (df, um_ref) -> mascara das linhas da familia, id da categoria no IPCA (SIDRA 315)
FAMILIAS = [
    ('cafe', 'Café', 'Subgrupos CAFES ESPECIAIS, CAFES TRADICIONAIS e CAFE VERDE comprados em KG (grão torrado, moído e '
     'café verde da torra própria; cápsulas, sachês e cold brew ficam de fora)',
     lambda d, ref: d['SUBGRUPO'].isin(['CAFES ESPECIAIS', 'CAFES TRADICIONAIS', 'CAFE VERDE']) & (d['DESCRICAO_ITEM'].map(ref) == 'KG'), 7392),
    ('leite_derivados', 'Leite e derivados', 'Grupo LATICINIOS, subgrupos LEITES, QUEIJOS e CREMES E MANTEIGAS (sem as bebidas vegetais)',
     lambda d, ref: (d['GRUPO'] == 'LATICINIOS') & d['SUBGRUPO'].isin(['LEITES', 'QUEIJOS', 'CREMES E MANTEIGAS']), 7356),
    ('trigo', 'Trigo (farinhas)', 'Subgrupo FARINACEOS, só as farinhas de trigo (sem fubá, polvilho, amido e farinha de amêndoas)',
     lambda d, ref: (d['SUBGRUPO'] == 'FARINACEOS') & d['DESCRICAO_ITEM'].str.startswith('FARINHA DE TRIGO'), 7184),
    ('acucar', 'Açúcar', 'Itens que começam com "ACUCAR" comprados em KG (refinado, cristal, demerara, mascavo, confeiteiro; sem sachê)',
     lambda d, ref: d['DESCRICAO_ITEM'].str.startswith('ACUCAR') & (d['DESCRICAO_ITEM'].map(ref) == 'KG'), 7220),
    ('cacau', 'Cacau e chocolate', 'Subgrupo CHOCOLATES E CACAU (chocolate em pó, cacau, gotas e nibs)',
     lambda d, ref: d['SUBGRUPO'] == 'CHOCOLATES E CACAU', 7243),
    ('frutas', 'Frutas', 'Subgrupo FLV-FRUTAS (frutas in natura usadas em sucos, bowls e confeitaria)',
     lambda d, ref: d['SUBGRUPO'] == 'FLV-FRUTAS', 7214),
]
IPCA_GERAL, IPCA_ALIMENTACAO = 7169, 7170


def norm(s):
    return re.sub(r'\s+', ' ', str(s).upper().replace('-', ' ')).strip()


def month_label(m):
    ano, mes = str(m).split('-')
    return f"{MONTH_LABELS_PT.get(mes, mes)}/{ano[-2:]}"


INDICES_PATH = os.path.join(BASE_DIR, '..', '..', 'raw-data', 'indices-mercado.json')


def carregar_indices(path, meses):
    """Le as series sinteticas de IPCA e dolar (mesmo formato que o build original montava a partir das APIs)."""
    if not os.path.exists(path):
        raise RuntimeError(f'Series de mercado nao encontradas em {path} — rode scripts/gerar_dados_sinteticos.py')
    with open(path, encoding='utf-8') as fh:
        j = json.load(fh)
    n = len(meses)
    ipca = {int(k): {'nome': v['nome'], 'var_mensal': (v['var_mensal'] + [None] * n)[:n]} for k, v in j['ipca'].items()}
    ptax = dict(j['ptax'])
    ptax['media_mensal'] = (ptax['media_mensal'] + [None] * n)[:n]
    ptax['dias_no_mes'] = (ptax['dias_no_mes'] + [0] * n)[:n]
    return ipca, ptax


# ---------------- Indice de preco pago (encadeado) ----------------
def razoes_mensais(precos):
    """precos: DataFrame (item, MES) -> v (valor), q (qde). Devolve lista de razoes (None no 1o mes / sem cobertura)."""
    p = (precos['v'] / precos['q']).unstack('MES')
    v = precos['v'].unstack('MES')
    meses = sorted(p.columns)
    out = [None]
    for i in range(1, len(meses)):
        a, b = meses[i - 1], meses[i]
        ambos = p[a].notna() & p[b].notna()
        base_total = v[a][p[a].notna()].sum()
        if not ambos.any() or base_total <= 0:
            out.append(None)
            continue
        razao = p.loc[ambos, b] / p.loc[ambos, a]
        peso = v.loc[ambos, a]
        ok = (razao >= RAZAO_MIN) & (razao <= RAZAO_MAX)
        if not ok.any() or peso[ok].sum() / base_total < COBERTURA_MIN:
            out.append(None)
            continue
        out.append(round(float((razao[ok] * peso[ok]).sum() / peso[ok].sum()), 6))
    return out


def main():
    raw_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE_DIR, 'base-raw-compras.xlsx')
    if not os.path.exists(raw_path):
        print(f"ERRO: arquivo nao encontrado: {raw_path}")
        print('Uso: python build_data.py "base-raw-compras.xlsx"')
        sys.exit(1)

    print(f"Lendo (planilha bruta): {raw_path}")
    df = raw_to_consolidada(raw_path, extra_columns=['UM', 'DESCRICAO ITEM FORNECEDOR'])
    df = df.dropna(subset=['FANTASIA', 'SEGMENTO', 'RAZAO FORNECEDOR', 'DESCRICAO_ITEM', 'MES']).copy()
    df['UM'] = df['UM'].fillna('—')
    df = df.reset_index(drop=True)
    print(f"Base consolidada: {len(df)} linhas")

    # base de preco (mesma regra de Analise de Itens: UM de referencia, sem suspeitos, casos claros convertidos)
    um_ref, usa_preco, qde_preco = ur.base_de_preco(df)
    df['USA_PRECO'] = usa_preco
    df['QDE_PRECO'] = qde_preco

    # recorte dos demais modulos (sem grupos "nao produto" e so' linhas com quantidade)
    exclude_norm = {norm(g) for g in EXCLUDE_GRUPOS_RAW}
    d = df[(df['QDE_COMPRADA'] > 0) & ~df['GRUPO'].apply(norm).isin(exclude_norm)].copy()
    meses = sorted(d['MES'].astype(str).unique())
    gasto_total = d.groupby('MES')['VALOR_CONTABIL'].sum()
    print(f"Meses: {meses} | gasto total do recorte: R$ {d['VALOR_CONTABIL'].sum():,.2f}")

    masks = {f[0]: f[3](d, um_ref) for f in FAMILIAS}
    if (sum(m.astype(int) for m in masks.values()) > 1).any():
        raise RuntimeError('Ha linhas que pertencem a mais de uma familia — revise as regras de FAMILIAS')

    indices_path = sys.argv[2] if len(sys.argv) > 2 else INDICES_PATH
    print(f'Lendo series sinteticas de IPCA e dolar: {indices_path}')
    ipca, ptax = carregar_indices(indices_path, meses)
    faltando = [f[4] for f in FAMILIAS if f[4] not in ipca] + [i for i in (IPCA_GERAL, IPCA_ALIMENTACAO) if i not in ipca]
    if faltando:
        raise RuntimeError(f'indices-mercado.json nao tem as categorias {faltando}')

    familias = []
    for fid, nome, regra, _, ipca_id in FAMILIAS:
        f = d[masks[fid]]
        gasto_mes = f.groupby('MES')['VALOR_CONTABIL'].sum()
        fp = f[f['USA_PRECO']]
        precos = fp.groupby(['DESCRICAO_ITEM', 'MES']).agg(v=('VALOR_CONTABIL', 'sum'), q=('QDE_PRECO', 'sum'))
        rel = razoes_mensais(precos)
        # alinha as razoes aos meses da base (meses sem nenhum preco ficam None)
        meses_com_preco = sorted(precos.index.get_level_values('MES').unique())
        rel_por_mes = dict(zip(meses_com_preco, rel))
        rel_alinhado = [rel_por_mes.get(m) for m in meses]
        if meses_com_preco and meses_com_preco != meses:
            # razao so' vale entre meses consecutivos do calendario da base
            rel_alinhado = [rel_por_mes.get(m) if (i > 0 and meses[i - 1] in meses_com_preco and m in meses_com_preco) else None
                            for i, m in enumerate(meses)]

        gasto_item = f.groupby('DESCRICAO_ITEM')['VALOR_CONTABIL'].sum().sort_values(ascending=False)
        itens_preco = set(fp['DESCRICAO_ITEM'].unique())
        top = [i for i in gasto_item.index if i in itens_preco][:TOP_N_ITENS]
        itens = []
        for it in top:
            g_it = f[f['DESCRICAO_ITEM'] == it].groupby('MES')['VALOR_CONTABIL'].sum()
            p_it = fp[fp['DESCRICAO_ITEM'] == it].groupby('MES').agg(v=('VALOR_CONTABIL', 'sum'), q=('QDE_PRECO', 'sum'))
            itens.append({
                'item': it, 'um': um_ref.get(it),
                'gasto_mensal': [round(float(g_it.get(m, 0.0)), 2) for m in meses],
                'preco_mensal': [round(float(p_it.loc[m, 'v'] / p_it.loc[m, 'q']), 4) if m in p_it.index and p_it.loc[m, 'q'] > 0 else None for m in meses],
            })
        cobertura = float(fp['VALOR_CONTABIL'].sum() / f['VALOR_CONTABIL'].sum() * 100) if len(f) else 0.0
        ref_ipca = ipca[ipca_id]
        familias.append({
            'id': fid, 'nome': nome, 'regra': regra,
            'n_itens': int(f['DESCRICAO_ITEM'].nunique()),
            'gasto_total': round(float(f['VALOR_CONTABIL'].sum()), 2),
            'gasto_mensal': [round(float(gasto_mes.get(m, 0.0)), 2) for m in meses],
            'razao_preco_mensal': rel_alinhado,
            'cobertura_preco_pct': round(cobertura, 1),
            'ipca': {'id': ipca_id, 'nome': ref_ipca['nome'], 'var_mensal': ref_ipca['var_mensal']},
            'itens': itens,
        })
        idx = 100.0
        for r in rel_alinhado:
            if r:
                idx *= r
        print(f"  {nome:26s} {len(f):>7} linhas | {f['DESCRICAO_ITEM'].nunique():>4} itens | R$ {f['VALOR_CONTABIL'].sum():>13,.0f} | "
              f"preco encadeado no periodo: {idx - 100:+.1f}% | cobertura de preco {cobertura:.0f}% | IPCA {ref_ipca['nome']}")

    data = {
        'gerado_em': pd.Timestamp.now().strftime('%d/%m/%Y'),
        'months_order': meses,
        'month_labels': {m: month_label(m) for m in meses},
        'gasto_total_mensal': [round(float(gasto_total.get(m, 0.0)), 2) for m in meses],
        'familias': familias,
        'ipca_geral': {'nome': 'IPCA — Índice geral', 'var_mensal': ipca[IPCA_GERAL]['var_mensal']},
        'ipca_alimentacao': {'nome': 'IPCA — Alimentação e bebidas', 'var_mensal': ipca[IPCA_ALIMENTACAO]['var_mensal']},
        'ptax': ptax,
        'fontes': [
            {'nome': 'Notas fiscais de compras (sintéticas) do Grupo Quintaluz', 'uso': 'Gasto e preço pago por commodity (unidade de referência por item, sem registros suspeitos)', 'atualizacao': 'a cada reconstrução dos módulos'},
            {'nome': 'IPCA sintético (no formato da tabela SIDRA 7060)', 'uso': 'Variação mensal de preços ao consumidor por item/grupo — série simulada', 'atualizacao': 'a cada execução do gerador de dados'},
            {'nome': 'Dólar sintético (no formato da série SGS 10813)', 'uso': 'Dólar comercial (venda), média mensal — série simulada', 'atualizacao': 'a cada execução do gerador de dados'},
        ],
    }
    out_path = os.path.join(BASE_DIR, 'data.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('// Dados gerados automaticamente por build_data.py — NAO EDITAR MANUALMENTE\n')
        f.write(f"// Gerado em: {data['gerado_em']} | Fontes: {os.path.basename(raw_path)}, indices-mercado.json (sinteticos)\n")
        f.write('const COMMODITIES_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'), default=str) + ';\n')
    print(f"OK -> {out_path} ({os.path.getsize(out_path) / 1024:.0f} KB) atualizado.")


if __name__ == '__main__':
    main()

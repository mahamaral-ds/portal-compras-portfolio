"""
Gera o data.js do modulo "CMC por Casas" a partir da planilha "base-CMC.xlsx"
(aba "Planilha1").

Metodologia confirmada empiricamente contra os valores ja calculados na propria
planilha (diferenca < 0.0001 em todas as linhas testadas):

    Custo liquido de alimentos = COMPRAS ALIMENTOS + PRODUÇÃO CENTRAL
                                  - REF. FUNCIONARIO (V.MEDIO)
    % CMC ALIMENTOS = Custo liquido de alimentos / VENDAS ALIMENTOS
    % CMC VINHOS     = COMPRAS VINHOS / VENDAS VINHOS
    % CMC BEBIDAS    = COMPRAS BEBIDAS / VENDAS BEBIDAS
    % CMC GERAL      = (Custo liquido de alimentos + COMPRAS VINHOS + COMPRAS BEBIDAS)
                        / (VENDAS ALIMENTOS + VENDAS VINHOS + VENDAS BEBIDAS)

CMC = Custo da Mercadoria Consumida. Quanto MENOR o percentual, melhor
(menos custo de mercadoria em relacao a receita).

Meta de referencia unica de CMV/CMC: META_CMC, hoje 31% -- constante em
dashboard.js (unica fonte, usada em cmcClass() e no Mural de Insights, que
e calculado inteiramente no cliente a partir dos dados de cada periodo).
Nao ha constante equivalente aqui no build_data.py: nenhum calculo deste
script depende da meta.

As agregacoes por periodo (mes ou "todos os meses") SEMPRE recalculam o
percentual a partir da soma de custos / soma de vendas — nunca pela media
simples dos percentuais de cada casa, o que enviesaria o resultado a favor
de casas pequenas.

Uso:
    python build_data.py "caminho/para/base-CMC.xlsx"

Gera: data.js (na mesma pasta deste script)
"""
import sys
import os
import json
import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Casas excluidas de TODAS as analises desta pagina (pedido especifico do
# modulo de CMC — nao afeta nenhum outro modulo do portal).
EXCLUDE_CASAS = [
    'TQ-VAZUL',   # inaugurada em Jun/2026: ainda sem historico comparavel
]

MONTH_LABELS_PT = {
    '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
    '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
    '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
}


def month_label(mes_str):
    try:
        ano, mes = str(mes_str).split('-')
        return f"{MONTH_LABELS_PT.get(mes, mes)}/{ano[-2:]}"
    except Exception:
        return str(mes_str)


def safe_div(a, b):
    return float(a) / float(b) if b else None


def compute_scope(scope, top_n_heatmap=None, casa_stats=None):
    """Agrega uma fatia (periodo) da base: KPIs, ranking de casas, composicao."""
    if not len(scope):
        return None

    vendas_alim = float(scope['VENDAS ALIMENTOS (+)'].sum())
    vendas_vin = float(scope['VENDAS VINHOS (+)'].sum())
    vendas_beb = float(scope['VENDAS BEBIDAS (+)'].sum())
    vendas_total = vendas_alim + vendas_vin + vendas_beb

    custo_alim = float(scope['custo_liq_alimentos'].sum())
    compras_vin = float(scope['COMPRAS VINHOS (-)'].sum())
    compras_beb = float(scope['COMPRAS BEBIDAS (-)'].sum())
    custo_total = custo_alim + compras_vin + compras_beb

    kpis = {
        'vendas_total': round(vendas_total, 2),
        'vendas_alimentos': round(vendas_alim, 2),
        'vendas_vinhos': round(vendas_vin, 2),
        'vendas_bebidas': round(vendas_beb, 2),
        'custo_total': round(custo_total, 2),
        'custo_alimentos': round(custo_alim, 2),
        'custo_vinhos': round(compras_vin, 2),
        'custo_bebidas': round(compras_beb, 2),
        'cmc_geral_pct': round(100 * safe_div(custo_total, vendas_total), 2) if vendas_total else None,
        'cmc_alimentos_pct': round(100 * safe_div(custo_alim, vendas_alim), 2) if vendas_alim else None,
        'cmc_vinhos_pct': round(100 * safe_div(compras_vin, vendas_vin), 2) if vendas_vin else None,
        'cmc_bebidas_pct': round(100 * safe_div(compras_beb, vendas_beb), 2) if vendas_beb else None,
        'qtd_casas': int(scope['CASA'].nunique()),
    }

    # ---- Ranking por casa ----
    g = scope.groupby('CASA').agg(
        vendas_alim=('VENDAS ALIMENTOS (+)', 'sum'),
        vendas_vin=('VENDAS VINHOS (+)', 'sum'),
        vendas_beb=('VENDAS BEBIDAS (+)', 'sum'),
        custo_alim=('custo_liq_alimentos', 'sum'),
        compras_vin=('COMPRAS VINHOS (-)', 'sum'),
        compras_beb=('COMPRAS BEBIDAS (-)', 'sum'),
    ).reset_index()
    g['vendas_total'] = g['vendas_alim'] + g['vendas_vin'] + g['vendas_beb']
    g['custo_total'] = g['custo_alim'] + g['compras_vin'].fillna(0) + g['compras_beb'].fillna(0)
    g['cmc_pct'] = np.where(g['vendas_total'] > 0, 100 * g['custo_total'] / g['vendas_total'], np.nan)
    g = g.dropna(subset=['cmc_pct'])

    # Casas sem NENHUM custo de compra registrado no periodo (custo_total <= 0)
    # nao tem CMC valido — o valor "negativo" resultante e' artefato de dado
    # ausente (normalmente so ha REF. FUNCIONARIO lancado), nao performance
    # real. Essas casas ficam de fora do ranking e sao sinalizadas a parte.
    sem_dado_custo = sorted(g[g['custo_total'] <= 0]['CASA'].tolist())
    g = g[g['custo_total'] > 0]

    # Media/mediana do CMC mensal de cada casa, considerando todo o periodo
    # disponivel PARA AQUELA CASA (nao muda com o filtro de periodo da pagina —
    # ver compute_casa_cmc_stats). Adicionadas antes da coluna cmc_pct.
    casa_stats = casa_stats or {}
    g['media_cmc'] = g['CASA'].map(lambda c: (casa_stats.get(c) or {}).get('media_cmc'))
    g['mediana_cmc'] = g['CASA'].map(lambda c: (casa_stats.get(c) or {}).get('mediana_cmc'))

    ranking_full = g[['CASA', 'vendas_total', 'custo_total', 'media_cmc', 'mediana_cmc', 'cmc_pct']].copy()
    ranking_full[['vendas_total', 'custo_total', 'cmc_pct']] = ranking_full[['vendas_total', 'custo_total', 'cmc_pct']].round(2)
    ranking_full = ranking_full.rename(columns={'CASA': 'casa'}).sort_values('cmc_pct')

    # ---- Anexa Segmento/Regiao a cada casa (fixos por casa) ----
    if 'SEGMENTO' in scope.columns and 'REGIÃO' in scope.columns:
        casa_meta = scope.drop_duplicates('CASA').set_index('CASA')[['SEGMENTO', 'REGIÃO']]
        ranking_full['segmento'] = ranking_full['casa'].map(casa_meta['SEGMENTO'])
        ranking_full['regiao'] = ranking_full['casa'].map(casa_meta['REGIÃO'])

    ranking_records = ranking_full.to_dict('records')

    melhores = ranking_records[:15]
    piores = list(reversed(ranking_records))[:15]

    # ---- Geolocalizacao: agregados por Segmento, por Regiao e a matriz
    #      Segmento x Regiao (usada na aba "Geolocalizacao") ----
    geo = None
    if 'SEGMENTO' in scope.columns and 'REGIÃO' in scope.columns:
        def agg_geo(group_cols):
            gg = scope.groupby(group_cols).agg(
                vendas_alim=('VENDAS ALIMENTOS (+)', 'sum'),
                vendas_vin=('VENDAS VINHOS (+)', 'sum'),
                vendas_beb=('VENDAS BEBIDAS (+)', 'sum'),
                custo_alim=('custo_liq_alimentos', 'sum'),
                compras_vin=('COMPRAS VINHOS (-)', 'sum'),
                compras_beb=('COMPRAS BEBIDAS (-)', 'sum'),
                qtd_casas=('CASA', 'nunique'),
            ).reset_index()
            gg['vendas_total'] = gg['vendas_alim'] + gg['vendas_vin'] + gg['vendas_beb']
            gg['custo_total'] = gg['custo_alim'] + gg['compras_vin'].fillna(0) + gg['compras_beb'].fillna(0)
            gg['cmc_pct'] = np.where(gg['vendas_total'] > 0, 100 * gg['custo_total'] / gg['vendas_total'], np.nan)
            gg[['vendas_total', 'custo_total']] = gg[['vendas_total', 'custo_total']].round(2)
            gg['cmc_pct'] = gg['cmc_pct'].round(2)
            return gg

        by_regiao = agg_geo(['REGIÃO']).rename(columns={'REGIÃO': 'regiao'})
        by_segmento = agg_geo(['SEGMENTO']).rename(columns={'SEGMENTO': 'segmento'})
        matrix = agg_geo(['SEGMENTO', 'REGIÃO']).rename(columns={'SEGMENTO': 'segmento', 'REGIÃO': 'regiao'})

        cols_out = ['vendas_total', 'custo_total', 'cmc_pct', 'qtd_casas']
        by_regiao_records = by_regiao[['regiao'] + cols_out].sort_values('vendas_total', ascending=False).to_dict('records')
        by_segmento_records = by_segmento[['segmento'] + cols_out].sort_values('vendas_total', ascending=False).to_dict('records')
        matrix_sub = matrix[['segmento', 'regiao'] + cols_out]
        matrix_records = matrix_sub.where(pd.notna(matrix_sub), None).to_dict('records')

        # Treemap: Regiao > Segmento (vendas)
        treemap = []
        for regiao, grp in matrix.groupby('regiao'):
            children = grp.sort_values('vendas_total', ascending=False).apply(
                lambda r: {'name': r['segmento'], 'value': round(float(r['vendas_total']), 2)}, axis=1
            ).tolist()
            treemap.append({
                'name': regiao,
                'value': round(float(grp['vendas_total'].sum()), 2),
                'children': children,
            })
        treemap = sorted(treemap, key=lambda x: x['value'], reverse=True)

        geo = {
            'by_regiao': by_regiao_records,
            'by_segmento': by_segmento_records,
            'matrix': matrix_records,
            'treemap': treemap,
        }

    # ---- Heatmap casa x mes (todas as casas, ordenadas por venda decrescente,
    #      ou top N quando top_n_heatmap for um numero) ----
    heatmap = None
    if top_n_heatmap:
        by_vendas = ranking_full.sort_values('vendas_total', ascending=False)
        if top_n_heatmap == 'all':
            top_casas = by_vendas['casa'].tolist()
        else:
            top_casas = by_vendas.head(top_n_heatmap)['casa'].tolist()
        heatmap = {'casas': top_casas}

    return {
        'kpis': kpis,
        'ranking': ranking_records,
        'melhores': melhores,
        'piores': piores,
        'scatter': ranking_full[['casa', 'vendas_total', 'cmc_pct']].to_dict('records'),
        'sem_dado_custo': sem_dado_custo,
        'geo': geo,
        '_heatmap_casas': heatmap['casas'] if heatmap else None,
    }



# =============================================================================
# CMV (novo indicador, base "cmv-casas.xlsx") — mesma estrutura de saida do
# CMC acima (kpis/ranking/melhores/piores/scatter/geo/heatmap), reaproveitada
# pelo dashboard.js atraves de nomes de campo identicos (vendas_total,
# custo_total, cmc_geral_pct, etc.). A "categoria" (Alimentos/Vinhos/Bebidas)
# do CMC nao existe na base de CMV; usamos a coluna VERTICAL (Bar/Restaurante/
# Cafeteria) no lugar, ja que tem a mesma cardinalidade (3 valores) e o mesmo
# papel de "3a dimensao" nos graficos de Visao Geral e na Geolocalizacao.
#
# Formula (conforme especificado): CMV % = CMV / RECEITA LIQUIDA. A coluna
# CMV na base vem negativa (convencao contabil); usamos abs(CMV) para obter
# a magnitude de custo, consistente com a propria coluna "CMV %" ja presente
# na planilha (conferido: abs(CMV)/RECEITA LIQUIDA reproduz exatamente essa
# coluna, diferenca 0.0 em todas as linhas testadas).
# =============================================================================
VERTICAL_KEYS = {'BAR': 'bar', 'RESTAURANTE': 'restaurante', 'CAFETERIA': 'cafeteria'}
VERTICAL_LABELS = {'bar': 'Bar', 'restaurante': 'Restaurante', 'cafeteria': 'Cafeteria'}


def compute_scope_cmv(scope, top_n_heatmap=None, casa_stats=None):
    if not len(scope):
        return None

    receita_total = float(scope['RECEITA LIQUIDA'].sum())
    cmv_total = float(scope['CMV'].abs().sum())

    kpis = {
        'vendas_total': round(receita_total, 2),
        'custo_total': round(cmv_total, 2),
        'cmc_geral_pct': round(100 * safe_div(cmv_total, receita_total), 2) if receita_total else None,
        'qtd_casas': int(scope['CASAS'].nunique()),
    }
    for label, key in VERTICAL_KEYS.items():
        sub = scope[scope['VERTICAL'] == label]
        v = float(sub['RECEITA LIQUIDA'].sum())
        c = float(sub['CMV'].abs().sum())
        kpis[f'vendas_{key}'] = round(v, 2)
        kpis[f'custo_{key}'] = round(c, 2)
        kpis[f'cmc_{key}_pct'] = round(100 * safe_div(c, v), 2) if v else None

    # ---- Ranking por casa ----
    g = scope.groupby('CASAS').agg(
        vendas_total=('RECEITA LIQUIDA', 'sum'),
        custo_total=('CMV', lambda s: s.abs().sum()),
    ).reset_index()
    g['cmc_pct'] = np.where(g['vendas_total'] > 0, 100 * g['custo_total'] / g['vendas_total'], np.nan)
    g = g.dropna(subset=['cmc_pct'])

    # Mesma regra do CMC: casa sem custo (CMV) registrado no periodo nao
    # entra no ranking (percentual nao seria representativo).
    sem_dado_custo = sorted(g[g['custo_total'] <= 0]['CASAS'].tolist())
    g = g[g['custo_total'] > 0]

    casa_stats = casa_stats or {}
    g['media_cmc'] = g['CASAS'].map(lambda c: (casa_stats.get(c) or {}).get('media_cmc'))
    g['mediana_cmc'] = g['CASAS'].map(lambda c: (casa_stats.get(c) or {}).get('mediana_cmc'))

    ranking_full = g[['CASAS', 'vendas_total', 'custo_total', 'media_cmc', 'mediana_cmc', 'cmc_pct']].copy()
    ranking_full[['vendas_total', 'custo_total', 'cmc_pct']] = ranking_full[['vendas_total', 'custo_total', 'cmc_pct']].round(2)
    ranking_full = ranking_full.rename(columns={'CASAS': 'casa'}).sort_values('cmc_pct')

    casa_meta = scope.drop_duplicates('CASAS').set_index('CASAS')[['VERTICAL', 'REGIÃO']]
    ranking_full['segmento'] = ranking_full['casa'].map(casa_meta['VERTICAL'])
    ranking_full['regiao'] = ranking_full['casa'].map(casa_meta['REGIÃO'])

    ranking_records = ranking_full.to_dict('records')
    melhores = ranking_records[:15]
    piores = list(reversed(ranking_records))[:15]

    def agg_geo(group_cols):
        gg = scope.groupby(group_cols).agg(
            vendas_total=('RECEITA LIQUIDA', 'sum'),
            custo_total=('CMV', lambda s: s.abs().sum()),
            qtd_casas=('CASAS', 'nunique'),
        ).reset_index()
        gg['cmc_pct'] = np.where(gg['vendas_total'] > 0, 100 * gg['custo_total'] / gg['vendas_total'], np.nan)
        gg[['vendas_total', 'custo_total']] = gg[['vendas_total', 'custo_total']].round(2)
        gg['cmc_pct'] = gg['cmc_pct'].round(2)
        return gg

    by_regiao = agg_geo(['REGIÃO']).rename(columns={'REGIÃO': 'regiao'})
    by_segmento = agg_geo(['VERTICAL']).rename(columns={'VERTICAL': 'segmento'})
    matrix = agg_geo(['VERTICAL', 'REGIÃO']).rename(columns={'VERTICAL': 'segmento', 'REGIÃO': 'regiao'})

    cols_out = ['vendas_total', 'custo_total', 'cmc_pct', 'qtd_casas']
    by_regiao_records = by_regiao[['regiao'] + cols_out].sort_values('vendas_total', ascending=False).to_dict('records')
    by_segmento_records = by_segmento[['segmento'] + cols_out].sort_values('vendas_total', ascending=False).to_dict('records')
    matrix_sub = matrix[['segmento', 'regiao'] + cols_out]
    matrix_records = matrix_sub.where(pd.notna(matrix_sub), None).to_dict('records')

    treemap = []
    for regiao, grp in matrix.groupby('regiao'):
        children = grp.sort_values('vendas_total', ascending=False).apply(
            lambda r: {'name': r['segmento'], 'value': round(float(r['vendas_total']), 2)}, axis=1
        ).tolist()
        treemap.append({
            'name': regiao,
            'value': round(float(grp['vendas_total'].sum()), 2),
            'children': children,
        })
    treemap = sorted(treemap, key=lambda x: x['value'], reverse=True)

    geo = {
        'by_regiao': by_regiao_records,
        'by_segmento': by_segmento_records,
        'matrix': matrix_records,
        'treemap': treemap,
    }

    heatmap = None
    if top_n_heatmap:
        by_vendas = ranking_full.sort_values('vendas_total', ascending=False)
        if top_n_heatmap == 'all':
            top_casas = by_vendas['casa'].tolist()
        else:
            top_casas = by_vendas.head(top_n_heatmap)['casa'].tolist()
        heatmap = {'casas': top_casas}

    return {
        'kpis': kpis,
        'ranking': ranking_records,
        'melhores': melhores,
        'piores': piores,
        'scatter': ranking_full[['casa', 'vendas_total', 'cmc_pct']].to_dict('records'),
        'sem_dado_custo': sem_dado_custo,
        'geo': geo,
        '_heatmap_casas': heatmap['casas'] if heatmap else None,
    }


def compute_casa_cmv_stats(df):
    """Media/mediana do CMV% mensal de cada casa (mesma regra de
    compute_casa_cmc_stats: so meses com custo>0 daquela casa)."""
    monthly = df.groupby(['CASAS', 'MES']).agg(
        vendas_total=('RECEITA LIQUIDA', 'sum'),
        custo_total=('CMV', lambda s: s.abs().sum()),
    ).reset_index()
    monthly['cmc_pct'] = np.where(
        (monthly['vendas_total'] > 0) & (monthly['custo_total'] > 0),
        100 * monthly['custo_total'] / monthly['vendas_total'],
        np.nan
    )
    stats = {}
    for casa, sub in monthly.groupby('CASAS'):
        serie = sub['cmc_pct'].dropna()
        if len(serie):
            stats[casa] = {
                'media_cmc': round(float(serie.mean()), 2),
                'mediana_cmc': round(float(serie.median()), 2),
            }
    return stats


def build_cmv(cmv_path):
    print(f"Lendo (CMV): {cmv_path}")
    xls = pd.ExcelFile(cmv_path)
    sheet = next((s for s in ('CMV_CASAS', 'Planilha1') if s in xls.sheet_names), xls.sheet_names[0])
    dfv = pd.read_excel(cmv_path, sheet_name=sheet)
    dfv.columns = [str(c).strip() for c in dfv.columns]

    linhas_antes = len(dfv)
    dfv = dfv[~dfv['CASAS'].astype(str).str.startswith('TOTAL')].copy()
    print(f"CMV — linhas de total agregado removidas: {linhas_antes - len(dfv)}")

    dfv['MES'] = pd.to_datetime(dfv['MÊS']).dt.strftime('%Y-%m')
    months_v = sorted(dfv['MES'].unique())
    month_labels_v = {m: month_label(m) for m in months_v}
    print(f"CMV — Meses: {months_v} | Casas: {dfv['CASAS'].nunique()}")

    casa_stats_v = compute_casa_cmv_stats(dfv)
    periods_v = {'ALL': compute_scope_cmv(dfv, top_n_heatmap='all', casa_stats=casa_stats_v)}
    for m in months_v:
        periods_v[m] = compute_scope_cmv(dfv[dfv['MES'] == m], casa_stats=casa_stats_v)

    mom_fields = ['cmc_geral_pct', 'vendas_total'] + [f'cmc_{k}_pct' for k in VERTICAL_KEYS.values()]
    for i, m in enumerate(months_v):
        if i == 0 or periods_v[m] is None:
            continue
        prev = periods_v[months_v[i - 1]]
        if prev is None:
            continue
        mom = {}
        for f in mom_fields:
            cur_v, prev_v = periods_v[m]['kpis'][f], prev['kpis'][f]
            if cur_v is None or prev_v is None:
                mom[f + '_mom'] = None
            elif f == 'vendas_total':
                mom[f + '_mom'] = round(100 * (cur_v - prev_v) / prev_v, 1) if prev_v else None
            else:
                mom[f + '_mom'] = round(cur_v - prev_v, 2)
        periods_v[m]['kpis'].update(mom)

    monthly_trend_v = []
    for m in months_v:
        k = periods_v[m]['kpis']
        row = {'MES': m, 'cmc_geral_pct': k['cmc_geral_pct'], 'vendas_total': k['vendas_total']}
        for key in VERTICAL_KEYS.values():
            row[f'cmc_{key}_pct'] = k.get(f'cmc_{key}_pct')
        monthly_trend_v.append(row)

    heatmap_casas_all_v = periods_v['ALL']['_heatmap_casas']
    heatmap_rows_v = []
    for casa in heatmap_casas_all_v:
        row = []
        for m in months_v:
            sub = dfv[(dfv['MES'] == m) & (dfv['CASAS'] == casa)]
            if len(sub):
                vt = sub['RECEITA LIQUIDA'].sum()
                ct = sub['CMV'].abs().sum()
                row.append(round(100 * ct / vt, 1) if vt else None)
            else:
                row.append(None)
        heatmap_rows_v.append({'casa': casa, 'valores': row})

    for p in periods_v.values():
        if p:
            p.pop('_heatmap_casas', None)

    return {
        'month_labels': month_labels_v,
        'months_order': months_v,
        'periods': periods_v,
        'monthly_trend': monthly_trend_v,
        'heatmap_casa_mes': {'casas': heatmap_casas_all_v, 'meses': months_v, 'linhas': heatmap_rows_v},
        'subcats': [{'key': k, 'label': VERTICAL_LABELS[k]} for k in VERTICAL_KEYS.values()],
        'gerado_em': pd.Timestamp.now().strftime('%d/%m/%Y'),
    }


def compute_casa_cmc_stats(df):
    """
    Media e mediana do CMC Geral mensal de cada casa, considerando apenas os
    meses em que a propria casa teve custo de compra registrado (custo_total
    > 0 naquele mes) — ou seja, o "periodo disponivel para aquela casa", nao
    necessariamente todos os 7 meses da base. Independe do filtro de periodo
    da pagina: e' calculado uma unica vez sobre a base inteira.
    """
    monthly = df.groupby(['CASA', 'MES']).agg(
        vendas_alim=('VENDAS ALIMENTOS (+)', 'sum'),
        vendas_vin=('VENDAS VINHOS (+)', 'sum'),
        vendas_beb=('VENDAS BEBIDAS (+)', 'sum'),
        custo_alim=('custo_liq_alimentos', 'sum'),
        compras_vin=('COMPRAS VINHOS (-)', 'sum'),
        compras_beb=('COMPRAS BEBIDAS (-)', 'sum'),
    ).reset_index()
    monthly['vendas_total'] = monthly['vendas_alim'] + monthly['vendas_vin'] + monthly['vendas_beb']
    monthly['custo_total'] = monthly['custo_alim'] + monthly['compras_vin'].fillna(0) + monthly['compras_beb'].fillna(0)
    monthly['cmc_pct'] = np.where(
        (monthly['vendas_total'] > 0) & (monthly['custo_total'] > 0),
        100 * monthly['custo_total'] / monthly['vendas_total'],
        np.nan
    )

    stats = {}
    for casa, sub in monthly.groupby('CASA'):
        serie = sub['cmc_pct'].dropna()
        if len(serie):
            stats[casa] = {
                'media_cmc': round(float(serie.mean()), 2),
                'mediana_cmc': round(float(serie.median()), 2),
            }
    return stats


def main():
    input_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE_DIR, 'base-CMC.xlsx')
    if not os.path.exists(input_path):
        print(f"ERRO: arquivo nao encontrado: {input_path}")
        sys.exit(1)

    print(f"Lendo: {input_path}")
    xls = pd.ExcelFile(input_path)
    sheet = next((s for s in ('CMC', 'Planilha1') if s in xls.sheet_names), xls.sheet_names[0])
    df = pd.read_excel(input_path, sheet_name=sheet)

    linhas_antes = len(df)
    df = df[~df['CASA'].isin(EXCLUDE_CASAS)].copy()
    print(f"Casas excluidas desta pagina: {EXCLUDE_CASAS}")
    print(f"Linhas removidas: {linhas_antes - len(df)}")

    df['MES'] = pd.to_datetime(df['mês']).dt.strftime('%Y-%m')
    months = sorted(df['MES'].unique())
    month_labels = {m: month_label(m) for m in months}
    print(f"Meses: {months}")
    print(f"Casas (apos exclusao): {df['CASA'].nunique()}")

    df['custo_liq_alimentos'] = (
        df['COMPRAS ALIMENTOS (-)'].fillna(0)
        + df['PRODUÇÃO CENTRAL (-)'].fillna(0)
        - df['REF. FUNCIONARIO (V.MÉDIO) (+)'].fillna(0)
    )

    # =========================================================================
    # PERIODOS (ALL + cada mes)
    # =========================================================================
    # Media/mediana do CMC por casa: fixo, calculado uma unica vez sobre a
    # base inteira (nao muda com o filtro de periodo — ver docstring da funcao).
    casa_stats = compute_casa_cmc_stats(df)

    periods = {'ALL': compute_scope(df, top_n_heatmap='all', casa_stats=casa_stats)}
    for m in months:
        periods[m] = compute_scope(df[df['MES'] == m], casa_stats=casa_stats)

    # ---- MoM para os KPIs executivos ----
    mom_fields = ['cmc_geral_pct', 'cmc_alimentos_pct', 'cmc_vinhos_pct', 'cmc_bebidas_pct', 'vendas_total']
    for i, m in enumerate(months):
        if i == 0 or periods[m] is None:
            continue
        prev = periods[months[i - 1]]
        if prev is None:
            continue
        mom = {}
        for f in mom_fields:
            cur_v, prev_v = periods[m]['kpis'][f], prev['kpis'][f]
            if cur_v is None or prev_v is None:
                mom[f + '_mom'] = None
            elif f == 'vendas_total':
                mom[f + '_mom'] = round(100 * (cur_v - prev_v) / prev_v, 1) if prev_v else None
            else:
                mom[f + '_mom'] = round(cur_v - prev_v, 2)  # pontos percentuais
        periods[m]['kpis'].update(mom)

    # =========================================================================
    # EVOLUCAO MENSAL (serie completa, sempre jan-jul)
    # =========================================================================
    monthly_trend = []
    for m in months:
        k = periods[m]['kpis']
        monthly_trend.append({
            'MES': m,
            'cmc_geral_pct': k['cmc_geral_pct'],
            'cmc_alimentos_pct': k['cmc_alimentos_pct'],
            'cmc_vinhos_pct': k['cmc_vinhos_pct'],
            'cmc_bebidas_pct': k['cmc_bebidas_pct'],
            'vendas_total': k['vendas_total'],
        })

    # =========================================================================
    # HEATMAP CASA x MES (todas as casas, ordenadas por venda decrescente) -> % CMC geral
    # =========================================================================
    heatmap_casas_all = periods['ALL']['_heatmap_casas']
    heatmap_rows = []
    for casa in heatmap_casas_all:
        row = []
        for m in months:
            sub = df[(df['MES'] == m) & (df['CASA'] == casa)]
            if len(sub):
                vt = sub['VENDAS ALIMENTOS (+)'].sum() + sub['VENDAS VINHOS (+)'].sum() + sub['VENDAS BEBIDAS (+)'].sum()
                ct = sub['custo_liq_alimentos'].sum() + sub['COMPRAS VINHOS (-)'].fillna(0).sum() + sub['COMPRAS BEBIDAS (-)'].fillna(0).sum()
                row.append(round(100 * ct / vt, 1) if vt else None)
            else:
                row.append(None)
        heatmap_rows.append({'casa': casa, 'valores': row})

    # limpar campo interno antes de serializar
    for p in periods.values():
        if p:
            p.pop('_heatmap_casas', None)

    # =========================================================================
    # MONTAGEM FINAL
    #
    # O "Mural de Insights" (5 insights fixos: pior casa, melhor casa, casas
    # acima da meta, evolucao do CMC geral e CMC geral vs. meta) e calculado
    # inteiramente no cliente (renderInsights() em dashboard.js), a partir de
    # periods[periodo_selecionado] e monthly_trend abaixo -- isso e o que
    # permite os 5 insights responderem ao filtro de periodo da pagina. Nao ha
    # mais uma lista 'insights' pre-calculada aqui.
    # =========================================================================
    data = {
        'month_labels': month_labels,
        'months_order': months,
        'periods': periods,
        'monthly_trend': monthly_trend,
        'heatmap_casa_mes': {'casas': heatmap_casas_all, 'meses': months, 'linhas': heatmap_rows},
        'gerado_em': pd.Timestamp.now().strftime('%d/%m/%Y'),
    }

    # =========================================================================
    # CMV (novo indicador) — le a base separada "cmv-casas.xlsx" e gera
    # CMV_DATA no mesmo data.js, sem alterar em nada o CMC_DATA acima.
    # =========================================================================
    cmv_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        BASE_DIR, '..', '..', 'raw-data', 'cmv-casas.xlsx')
    cmv_data = None
    if os.path.exists(cmv_path):
        cmv_data = build_cmv(cmv_path)
    else:
        print(f"AVISO: base de CMV nao encontrada em {cmv_path} — CMV_DATA nao sera gerado.")

    out_path = os.path.join(BASE_DIR, 'data.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('// Dados gerados automaticamente por build_data.py — NAO EDITAR MANUALMENTE\n')
        f.write(f"// Gerado em: {data['gerado_em']} | Fonte: {os.path.basename(input_path)}\n")
        f.write('const CMC_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'), default=str) + ';\n')
        if cmv_data is not None:
            f.write(f"// CMV - Fonte: {os.path.basename(cmv_path)}\n")
            f.write('const CMV_DATA = ' + json.dumps(cmv_data, ensure_ascii=False, separators=(',', ':'), default=str) + ';\n')

    print(f"OK -> {out_path} atualizado.")
    print(f"CMC geral (todos os meses): {periods['ALL']['kpis']['cmc_geral_pct']}%")
    if cmv_data is not None:
        print(f"CMV geral (todos os meses): {cmv_data['periods']['ALL']['kpis']['cmc_geral_pct']}%")


if __name__ == '__main__':
    main()

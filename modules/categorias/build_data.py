"""
Gera o data.js do modulo "Categorias" — painel central de acompanhamento
das categorias de produto (GRUPO/SUBGRUPO), com spend analysis, quantidade
de itens e de fornecedores por categoria, curva ABC de categorias,
composicao por subcategoria e evolucao mensal.

Le a MESMA planilha bruta de notas fiscais usada em Fornecedores,
Indicadores e Analise de Itens (shared_py/etl_common.py cuida
da transformacao bruto -> consolidado), com a mesma exclusao de grupos, para
que os totais batam com os demais modulos do portal.

Uso:
    python build_data.py "caminho/para/base-raw-compras.xlsx"

Gera/sobrescreve: data.js (na mesma pasta deste script)
"""
import sys
import os
import re
import json
import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, '..', '..', 'shared_py'))
from etl_common import raw_to_consolidada, chave_ordem_grupo  # noqa: E402

# Mesma lista usada nos demais modulos do portal
EXCLUDE_GRUPOS_RAW = [
    'MANUTENCAO', 'CONSUMO', 'UTENSILIOS',
    'DESCARTAVEIS', 'CIGARROS', 'MAQUINAS E EQUIPAMENTOS', 'SERVICOS'
]

FORN_COL = 'RAZAO FORNECEDOR'
TOP_N_GRUPOS_EVOLUCAO = 8  # top categorias exibidas na evolucao mensal (resto agrupado em "Outros")

MONTH_LABELS_PT = {
    '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
    '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
    '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
}


def norm(s):
    s = str(s).upper().replace('-', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def month_label(mes_str):
    try:
        ano, mes = str(mes_str).split('-')
        return f"{MONTH_LABELS_PT.get(mes, mes)}/{ano[-2:]}"
    except Exception:
        return str(mes_str)


def classify_abc(cum_pct):
    if cum_pct <= 80.0:
        return 'A'
    elif cum_pct <= 95.0:
        return 'B'
    return 'C'


def compute_period(scope, item_idx_map):
    total_geral = round(float(scope['VALOR_CONTABIL'].sum()), 2)

    grp = scope.groupby('GRUPO')
    valor_total = grp['VALOR_CONTABIL'].sum()
    pedidos = grp.size()
    itens_unicos = grp['DESCRICAO_ITEM'].nunique()
    fornecedores_unicos = grp[FORN_COL].nunique()
    subcategorias = grp['SUBGRUPO'].nunique()
    qtd_comprada = grp['QDE_COMPRADA'].sum()

    # Fornecedor principal de cada categoria (maior valor) + % de concentracao nele
    grupo_forn_valor = scope.groupby(['GRUPO', FORN_COL])['VALOR_CONTABIL'].sum().reset_index()
    idx = grupo_forn_valor.groupby('GRUPO')['VALOR_CONTABIL'].idxmax()
    principal = grupo_forn_valor.loc[idx].set_index('GRUPO')

    segmentos_lista = grp['SEGMENTO'].apply(lambda s: ', '.join(sorted(s.unique())))

    # Identidades brutas por categoria — usadas pelo front-end para
    # recalcular corretamente os campos "nao aditivos" (Itens Unicos,
    # Fornecedores, Subcategorias, Principal Forn./Valor Princ.) quando o
    # usuario seleciona mais de um mes ao mesmo tempo (Ctrl+clique): faz a
    # UNIAO/soma desses dados brutos entre os meses escolhidos, em vez de
    # comparar/somar os valores ja agregados de cada mes isoladamente
    # (que daria resultado errado, ex: um item comprado em 2 meses
    # selecionados contaria 2x, ou o "fornecedor principal" de um mes
    # poderia nao ser o principal quando os meses sao somados).
    itens_idx_by_grupo = grp['DESCRICAO_ITEM'].apply(lambda s: sorted({item_idx_map[nome] for nome in s.dropna().unique()}))
    subgrupos_by_grupo = grp['SUBGRUPO'].apply(lambda s: sorted(s.dropna().unique().tolist()))
    segmentos_raw_by_grupo = grp['SEGMENTO'].apply(lambda s: sorted(s.dropna().unique().tolist()))
    forn_valor_by_grupo = grupo_forn_valor.groupby('GRUPO').apply(
        lambda g: {row[FORN_COL]: round(float(row['VALOR_CONTABIL']), 2) for _, row in g.iterrows()}
    )

    rank_df = pd.DataFrame({'Categoria': valor_total.index, 'Valor Total': valor_total.values})
    rank_df = rank_df.sort_values('Valor Total', ascending=False).reset_index(drop=True)
    rank_df['Rank'] = rank_df.index + 1
    rank_df['Part. %'] = rank_df['Valor Total'] / total_geral if total_geral else 0
    rank_df['Acum. %'] = rank_df['Part. %'].cumsum() * 100
    rank_df['Classe'] = rank_df['Acum. %'].apply(classify_abc)
    rank_df['Itens Únicos'] = rank_df['Categoria'].map(itens_unicos)
    rank_df['Fornecedores'] = rank_df['Categoria'].map(fornecedores_unicos)
    rank_df['Subcategorias'] = rank_df['Categoria'].map(subcategorias)
    rank_df['Pedidos'] = rank_df['Categoria'].map(pedidos)
    rank_df['Qtd. Comprada'] = rank_df['Categoria'].map(qtd_comprada)
    rank_df['Ticket Médio'] = rank_df['Valor Total'] / rank_df['Pedidos']
    rank_df['Segmentos'] = rank_df['Categoria'].map(segmentos_lista)
    rank_df['Principal Forn.'] = rank_df['Categoria'].map(principal[FORN_COL])
    rank_df['Valor Princ.'] = rank_df['Categoria'].map(principal['VALOR_CONTABIL'])
    rank_df['Concentração Princ. %'] = rank_df['Valor Princ.'] / rank_df['Valor Total']
    rank_df['itens_idx'] = rank_df['Categoria'].map(itens_idx_by_grupo)
    rank_df['subgrupos_lista'] = rank_df['Categoria'].map(subgrupos_by_grupo)
    rank_df['segmentos_raw'] = rank_df['Categoria'].map(segmentos_raw_by_grupo)
    rank_df['forn_valor'] = rank_df['Categoria'].map(forn_valor_by_grupo)

    for c in ['Valor Total', 'Ticket Médio', 'Qtd. Comprada', 'Valor Princ.']:
        rank_df[c] = rank_df[c].round(2)
    rank_df['Acum. %'] = rank_df['Acum. %'].round(3)
    rank_df['Concentração Princ. %'] = rank_df['Concentração Princ. %'].round(4)

    ranking_full = rank_df[[
        'Rank', 'Categoria', 'Classe', 'Valor Total', 'Part. %', 'Acum. %',
        'Itens Únicos', 'Fornecedores', 'Subcategorias', 'Pedidos', 'Ticket Médio',
        'Segmentos', 'Principal Forn.', 'Valor Princ.', 'Concentração Princ. %',
        'itens_idx', 'subgrupos_lista', 'segmentos_raw', 'forn_valor',
    ]].to_dict('records')

    classe_counts = rank_df['Classe'].value_counts()
    classe_valores = rank_df.groupby('Classe')['Valor Total'].sum()
    top_categoria = rank_df.iloc[0]['Categoria'] if len(rank_df) else None

    kpis = {
        'total_geral': total_geral,
        'total_categorias': int(len(rank_df)),
        'total_itens': int(scope['DESCRICAO_ITEM'].nunique()),
        'total_fornecedores': int(scope[FORN_COL].nunique()),
        'classe_a_qtd': int(classe_counts.get('A', 0)),
        'classe_a_valor': round(float(classe_valores.get('A', 0.0)), 2),
        'classe_b_qtd': int(classe_counts.get('B', 0)),
        'classe_b_valor': round(float(classe_valores.get('B', 0.0)), 2),
        'classe_c_qtd': int(classe_counts.get('C', 0)),
        'classe_c_valor': round(float(classe_valores.get('C', 0.0)), 2),
        'top_categoria': top_categoria,
    }

    abc_curve = rank_df[['Rank', 'Acum. %', 'Classe']].values.tolist()
    abc_curve = [[int(r[0]), round(float(r[1]), 2), r[2]] for r in abc_curve]

    abc_class_summary = [
        {'Classe': c, 'categorias': int(classe_counts.get(c, 0)), 'valor': round(float(classe_valores.get(c, 0.0)), 2)}
        for c in ['A', 'B', 'C']
    ]

    # ---- Composicao: treemap Categoria -> Subcategoria (+ fornecedores por subcategoria) ----
    s_treemap = scope.groupby(['GRUPO', 'SUBGRUPO'])['VALOR_CONTABIL'].sum().reset_index()
    s_treemap_forn = scope.groupby(['GRUPO', 'SUBGRUPO', FORN_COL])['VALOR_CONTABIL'].sum().reset_index()
    treemap = []
    for grupo, g in s_treemap.groupby('GRUPO'):
        children = []
        for _, row in g.sort_values('VALOR_CONTABIL', ascending=False).iterrows():
            subgrupo = row['SUBGRUPO']
            sub_valor = float(row['VALOR_CONTABIL'])
            forn_sub = s_treemap_forn[
                (s_treemap_forn['GRUPO'] == grupo) & (s_treemap_forn['SUBGRUPO'] == subgrupo)
            ].sort_values('VALOR_CONTABIL', ascending=False)
            fornecedores = [
                {
                    'nome': r[FORN_COL],
                    'valor': round(float(r['VALOR_CONTABIL']), 2),
                    'part': round(float(r['VALOR_CONTABIL']) / sub_valor, 4) if sub_valor else 0.0,
                }
                for _, r in forn_sub.iterrows()
            ]
            children.append({'name': subgrupo, 'value': round(sub_valor, 2), 'fornecedores': fornecedores})
        treemap.append({'name': grupo, 'value': round(float(g['VALOR_CONTABIL'].sum()), 2), 'children': children})
    treemap = sorted(treemap, key=lambda x: x['value'], reverse=True)

    return {
        'kpis': kpis,
        'ranking': ranking_full,
        'abc_curve': abc_curve,
        'abc_class_summary': abc_class_summary,
        'treemap_data': treemap,
    }


def main():
    input_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE_DIR, 'base-raw-compras.xlsx')
    if not os.path.exists(input_path):
        print(f"ERRO: arquivo nao encontrado: {input_path}")
        print('Uso: python build_data.py "caminho/para/base-raw-compras.xlsx"')
        sys.exit(1)

    print(f"Lendo (planilha bruta): {input_path}")
    base = raw_to_consolidada(input_path)
    print(f"Transformado em base consolidada: {len(base)} linhas")

    exclude_norm = set(norm(g) for g in EXCLUDE_GRUPOS_RAW)
    base['_grupo_norm'] = base['GRUPO'].apply(norm)
    excluded_real = sorted(base[base['_grupo_norm'].isin(exclude_norm)]['GRUPO'].unique().tolist())
    df = base[~base['_grupo_norm'].isin(exclude_norm)].copy().drop(columns=['_grupo_norm'])
    df = df[df['QDE_COMPRADA'] > 0].copy()

    months = sorted(df['MES'].astype(str).unique())
    month_labels = {m: month_label(m) for m in months}
    print(f"Meses encontrados: {months}")
    print(f"Grupos excluidos: {excluded_real}")
    print(f"Categorias (GRUPO) na base: {df['GRUPO'].nunique()}")

    # Dicionario global de itens (nome -> indice), construido uma unica vez —
    # usado para compactar a lista de itens distintos por categoria/mes (ver
    # itens_idx em compute_period), sem repetir os nomes por extenso.
    dict_itens_categorias = sorted(df['DESCRICAO_ITEM'].dropna().unique().tolist())
    item_idx_categorias = {nome: i for i, nome in enumerate(dict_itens_categorias)}

    periods = {'ALL': compute_period(df, item_idx_categorias)}
    for m in months:
        periods[m] = compute_period(df[df['MES'].astype(str) == m], item_idx_categorias)

    # =========================================================================
    # Evolucao mensal por categoria (top N + Outros) — sempre serie completa,
    # independente do periodo selecionado na pagina (mesmo padrao do modulo
    # de Fornecedores).
    # =========================================================================
    top_grupos = df.groupby('GRUPO')['VALOR_CONTABIL'].sum().sort_values(ascending=False).head(TOP_N_GRUPOS_EVOLUCAO).index.tolist()
    mg = df.groupby(['MES', 'GRUPO'])['VALOR_CONTABIL'].sum().reset_index()
    mg['GRUPO2'] = mg['GRUPO'].where(mg['GRUPO'].isin(top_grupos), 'OUTROS')
    mg_agg = mg.groupby(['MES', 'GRUPO2'])['VALOR_CONTABIL'].sum().round(2).reset_index()
    mg_pivot = mg_agg.pivot(index='MES', columns='GRUPO2', values='VALOR_CONTABIL').fillna(0).reset_index()
    monthly_grupo_records = mg_pivot.to_dict('records')
    monthly_grupo_cols = sorted((c for c in mg_pivot.columns if c != 'MES'), key=chave_ordem_grupo)   # cor de cada serie = posicao nesta lista

    # Itens unicos e fornecedores unicos por mes e categoria (para o grafico
    # de evolucao poder alternar entre Valor / Itens / Fornecedores)
    mi = df.groupby(['MES', 'GRUPO'])['DESCRICAO_ITEM'].nunique().reset_index()
    mi['GRUPO2'] = mi['GRUPO'].where(mi['GRUPO'].isin(top_grupos), 'OUTROS')
    mi_agg = mi.groupby(['MES', 'GRUPO2'])['DESCRICAO_ITEM'].sum().reset_index()
    mi_pivot = mi_agg.pivot(index='MES', columns='GRUPO2', values='DESCRICAO_ITEM').fillna(0).reset_index()
    monthly_itens_records = mi_pivot.to_dict('records')

    mf = df.groupby(['MES', 'GRUPO'])[FORN_COL].nunique().reset_index()
    mf['GRUPO2'] = mf['GRUPO'].where(mf['GRUPO'].isin(top_grupos), 'OUTROS')
    mf_agg = mf.groupby(['MES', 'GRUPO2'])[FORN_COL].sum().reset_index()
    mf_pivot = mf_agg.pivot(index='MES', columns='GRUPO2', values=FORN_COL).fillna(0).reset_index()
    monthly_fornecedores_records = mf_pivot.to_dict('records')

    from datetime import datetime
    data = {
        'month_labels': month_labels,
        'months_order': months,
        'periods': periods,
        'monthly_grupo_records': monthly_grupo_records,
        'monthly_grupo_cols': monthly_grupo_cols,
        'monthly_itens_records': monthly_itens_records,
        'monthly_fornecedores_records': monthly_fornecedores_records,
        'dict_itens_categorias': dict_itens_categorias,
        'excluded_grupos': excluded_real,
        'gerado_em': datetime.now().strftime('%d/%m/%Y'),
    }

    out_path = os.path.join(BASE_DIR, 'data.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('// Dados gerados automaticamente por build_data.py — NAO EDITAR MANUALMENTE\n')
        f.write(f"// Gerado em: {data['gerado_em']} | Fonte: {os.path.basename(input_path)}\n")
        f.write('const CATEGORIAS_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'), default=str) + ';\n')

    print(f"OK -> {out_path} atualizado com sucesso.")
    print(f"Total geral (todos os meses): R$ {data['periods']['ALL']['kpis']['total_geral']:,.2f}")
    print(f"Categorias (todos os meses): {data['periods']['ALL']['kpis']['total_categorias']}")


if __name__ == '__main__':
    main()

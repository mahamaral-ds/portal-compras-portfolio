"""
Gera o data.js do modulo "Overview Compras" — panorama geral do setor,
com os principais KPIs de Compras e os rankings de fornecedores/categorias
que os acompanham. Tem filtro de periodo (mes a mes), no mesmo padrao dos
demais modulos do portal (Fornecedores, Indicadores, Categorias).

Le as MESMAS duas planilhas do modulo de Indicadores: a
base BRUTA de notas fiscais e a planilha de KPIs (inflacao, PMP, DIO,
cotacao, CMV). Reaproveita shared_py/etl_common.py para a transformacao
bruto -> consolidado, com a mesma exclusao de grupos usada em
Fornecedores/Indicadores, para que os totais sejam consistentes entre
os modulos do portal.

Metodologia:
  - Gasto, SKUs (itens unicos), Fornecedores, Top 15 Fornecedores e as
    categorias/verticais em destaque respeitam o filtro de periodo da
    pagina ("Todos os meses" = base inteira, ou um mes especifico).
  - CMV, Inflacao, PMP, DIO e Cotacao vem da planilha de KPIs para o
    mes escolhido; em "Todos os meses" usam o mes mais recente
    disponivel nessa planilha (pode ser anterior ao ultimo mes da base
    bruta, se a planilha de KPIs ainda nao tiver sido atualizada).
  - O Historico CMV e' um painel de TENDENCIA e fica fixo (ultimos 4 meses
    de KPI), independente do filtro de periodo — mesmo padrao da aba
    "Evolucao Mensal" nos demais modulos. O Top 20 Itens acompanha o filtro
    (cada periodo traz o valor de todos os itens, em `itens_valor`).

Uso:
    python build_data.py "caminho/para/base-raw-compras.xlsx" "caminho/para/base-KPIs.xlsx"

Gera/sobrescreve: data.js (na mesma pasta deste script)
"""
import sys
import os
import re
import json
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, '..', '..', 'shared_py'))
from etl_common import raw_to_consolidada  # noqa: E402

# Mesma lista usada nos modulos de Fornecedores e Indicadores,
# para que o "Gasto" desta pagina bata com o total desses modulos.
EXCLUDE_GRUPOS_RAW = [
    'MANUTENCAO', 'CONSUMO', 'UTENSILIOS',
    'DESCARTAVEIS', 'CIGARROS', 'MAQUINAS E EQUIPAMENTOS', 'SERVICOS'
]

FORN_COL = 'RAZAO FORNECEDOR'
TOP_N_FORNECEDORES = 15
TOP_N_GRUPOS = 5
TOP_N_SEGMENTOS = 3
ULTIMOS_N_MESES_CMV = 4

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


def compute_period(scope, item_idx_map, pedido_idx_map=None):
    gasto = float(scope['VALOR_CONTABIL'].sum())
    skus = int(scope['DESCRICAO_ITEM'].nunique())
    fornecedores = int(scope[FORN_COL].nunique())

    # Listas COMPLETAS (sem corte de top-N) — o corte para exibicao (top 15/
    # 5/3) agora e' feito no front-end, na hora de renderizar; isso permite
    # ao front-end somar corretamente o valor de cada fornecedor/grupo/
    # segmento entre varios meses selecionados ao mesmo tempo (Ctrl+clique)
    # antes de re-cortar o top-N, em vez de tentar combinar top-15 de cada
    # mes (que podem trazer fornecedores diferentes a cada mes).
    top_fornecedores = scope.groupby(FORN_COL)['VALOR_CONTABIL'].sum().sort_values(ascending=False)
    top_fornecedores = [{'fornecedor': f, 'valor': round(float(v), 2)} for f, v in top_fornecedores.items()]

    top_grupos = scope.groupby('GRUPO')['VALOR_CONTABIL'].sum().sort_values(ascending=False)
    top_grupos = [{'grupo': g, 'valor': round(float(v), 2)} for g, v in top_grupos.items()]

    top_segmentos = scope.groupby('SEGMENTO')['VALOR_CONTABIL'].sum().sort_values(ascending=False)
    top_segmentos = [{'segmento': s, 'valor': round(float(v), 2)} for s, v in top_segmentos.items()]

    # indices (no dicionario global item_idx_map) dos itens distintos
    # comprados no recorte — usado so para recalcular corretamente o KPI
    # "skus" (contagem unica) quando varios meses estao selecionados (uniao
    # dos indices, em vez de somar as contagens de cada mes separadamente,
    # o que contaria duas vezes um item comprado em mais de um mes)
    itens_idx = sorted({item_idx_map[nome] for nome in scope['DESCRICAO_ITEM'].unique()})

    # valor comprado de CADA item no recorte, como pares [indice em dict_itens_overview, valor], do maior para o menor
    # (lista completa, sem corte de top-N): o Top 20 Itens da tela acompanha o filtro de periodo, e para varios meses
    # o front-end soma o valor de cada item entre os meses antes de recortar o top 20
    itens_valor = scope.groupby('DESCRICAO_ITEM')['VALOR_CONTABIL'].sum().sort_values(ascending=False)
    itens_valor = [[item_idx_map[nome], round(float(v), 2)] for nome, v in itens_valor.items()]

    # pedidos = combinacoes distintas fornecedor + NF (mesmo criterio de Indicadores). `pedido_ids` guarda, por mes, os
    # identificadores (inteiros globais) para o front-end unir meses sem contar um pedido duas vezes
    # (shared/portal-pedidos.js); o periodo completo so' precisa do total.
    pedidos = int(scope['_PEDIDO_ID'].nunique())

    return {
        'kpis': {'gasto': round(gasto, 2), 'skus': skus, 'fornecedores': fornecedores, 'pedidos': pedidos},
        'top_fornecedores': top_fornecedores,
        'top_grupos': top_grupos,
        'top_segmentos': top_segmentos,
        'itens_idx': itens_idx,
        'itens_valor': itens_valor,
        'pedido_ids': sorted({pedido_idx_map[p] for p in scope['_PEDIDO_ID'].unique()}) if pedido_idx_map is not None else None,
    }


def main():
    raw_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE_DIR, 'base-raw-compras.xlsx')
    kpis_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(BASE_DIR, 'base-KPIs.xlsx')
    for p in (raw_path, kpis_path):
        if not os.path.exists(p):
            print(f"ERRO: arquivo nao encontrado: {p}")
            print('Uso: python build_data.py "base-raw-compras.xlsx" "base-KPIs.xlsx"')
            sys.exit(1)

    print(f"Lendo base bruta: {raw_path}")
    base = raw_to_consolidada(raw_path, extra_columns=['N. NOTA'])
    print(f"Transformado em base consolidada: {len(base)} linhas")

    exclude_norm = set(norm(g) for g in EXCLUDE_GRUPOS_RAW)
    base['_grupo_norm'] = base['GRUPO'].apply(norm)
    df = base[~base['_grupo_norm'].isin(exclude_norm)].copy().drop(columns=['_grupo_norm'])
    df = df[df['QDE_COMPRADA'] > 0].copy()
    # Identificador de pedido = fornecedor + NF (a numeracao da NF e' sequencial por fornecedor; ver o comentario no
    # build_data.py de Indicadores, de onde vem este criterio)
    df['_PEDIDO_ID'] = df[FORN_COL].astype(str) + '||' + df['N. NOTA'].astype(str)

    months = sorted(df['MES'].astype(str).unique())
    month_labels = {m: month_label(m) for m in months}
    print(f"Meses (base bruta): {months}")
    latest_month = months[-1]

    # Dicionario global de itens (nome -> indice), construido uma unica vez
    # sobre toda a base — garante que o mesmo item tenha sempre o mesmo
    # indice em qualquer periodo (necessario para a selecao de varios meses).
    dict_itens_overview = sorted(df['DESCRICAO_ITEM'].dropna().unique().tolist())
    item_idx_map = {nome: i for i, nome in enumerate(dict_itens_overview)}

    # =========================================================================
    # Metricas por periodo (Todos os meses + cada mes) — gasto, SKUs,
    # fornecedores, top fornecedores/categorias/verticais
    # =========================================================================
    pedido_idx_map = {p: i for i, p in enumerate(sorted(df['_PEDIDO_ID'].unique()))}
    periods = {'ALL': compute_period(df, item_idx_map)}   # 'ALL' usa o total (kpis.pedidos); sem lista de ids
    for m in months:
        periods[m] = compute_period(df[df['MES'].astype(str) == m], item_idx_map, pedido_idx_map)

    # =========================================================================
    # KPIs externos (planilha de KPIs) — por mes, para o filtro de periodo
    # =========================================================================
    print(f"Lendo KPIs: {kpis_path}")
    kpis_raw = pd.read_excel(kpis_path, sheet_name=0)
    kpis_raw['MES'] = pd.to_datetime(kpis_raw['MÊS']).dt.strftime('%Y-%m')
    kpis_raw = kpis_raw.sort_values('MES')
    kpis_2026 = kpis_raw[kpis_raw['MES'].str.slice(0, 4) == '2026'].copy()

    external_kpis = []
    for _, r in kpis_2026.iterrows():
        external_kpis.append({
            'MES': r['MES'],
            'inflacao': round(float(r['INFLAÇÃO']) * 100, 2) if pd.notna(r['INFLAÇÃO']) else None,
            'pmp': round(float(r['PMP']), 2) if pd.notna(r['PMP']) and r['PMP'] != 0 else None,
            'dio': round(float(r['DIO']), 2) if pd.notna(r['DIO']) else None,
            'cotacao': int(r['COTAÇÃO']) if pd.notna(r['COTAÇÃO']) else None,
            'cmv': round(float(r['CMV']) * 100, 2) if pd.notna(r['CMV']) else None,
        })
    print(f"Meses (KPIs 2026): {[e['MES'] for e in external_kpis]}")

    latest_kpi = external_kpis[-1] if external_kpis else None
    ultimos_kpis_cmv = external_kpis[-ULTIMOS_N_MESES_CMV:] if external_kpis else []
    # Historico CMV (ultimos 4 meses com KPI): so' o CMV — a inflacao continua no card "Inflacao interna"
    cmv_historico_series = [
        {'mes': e['MES'], 'mes_label': month_label(e['MES']), 'cmv': e['cmv']}
        for e in ultimos_kpis_cmv
    ]

    # =========================================================================
    # MONTAGEM FINAL
    # =========================================================================
    data = {
        'month_labels': month_labels,
        'months_order': months,
        'latest_month': latest_month,
        'latest_month_label': month_label(latest_month),
        'latest_kpi_month': latest_kpi['MES'] if latest_kpi else None,
        'latest_kpi_month_label': month_label(latest_kpi['MES']) if latest_kpi else None,
        'periods': periods,
        'external_kpis': external_kpis,
        'cmv_historico_series': cmv_historico_series,
        'excluded_grupos': sorted(base[base['_grupo_norm'].isin(exclude_norm)]['GRUPO'].unique().tolist()) if '_grupo_norm' in base.columns else [],
        'dict_itens_overview': dict_itens_overview,
        'gerado_em': pd.Timestamp.now().strftime('%d/%m/%Y'),
    }

    out_path = os.path.join(BASE_DIR, 'data.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('// Dados gerados automaticamente por build_data.py — NAO EDITAR MANUALMENTE\n')
        f.write(f"// Gerado em: {data['gerado_em']} | Fontes: {os.path.basename(raw_path)}, {os.path.basename(kpis_path)}\n")
        f.write('const OVERVIEW_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'), default=str) + ';\n')

    print(f"OK -> {out_path} atualizado.")
    print(f"Mes mais recente (base bruta): {latest_month} | Gasto: R$ {periods[latest_month]['kpis']['gasto']:,.2f}")
    print(f"Mes mais recente (KPIs): {latest_kpi['MES'] if latest_kpi else '—'}")
    print(f"Total (todos os meses): R$ {periods['ALL']['kpis']['gasto']:,.2f} | Fornecedores: {periods['ALL']['kpis']['fornecedores']}")


if __name__ == '__main__':
    main()

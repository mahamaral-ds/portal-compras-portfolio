"""
Gera o data.js do modulo "Indicadores" a partir de DUAS
planilhas: a base BRUTA de notas fiscais (mesma usada no modulo de
Fornecedores) e a planilha de KPIs (inflacao, PMP, DIO, cotacao,
contratos, CMV — agora com historico de CMV 2025 tambem).

Este modulo tem hoje uma unica aba, Visao Geral (KPIs executivos,
CMV x Inflacao, Evolucao mensal do gasto, PMP x DIO). As abas Historico de
Precos e Inteligencia de Compras foram movidas para o modulo Analise de
Itens (modules/analise-itens/build_data.py) — usar aquele script para
regenerar os dados dessas duas abas.

Nao e' mais necessario gerar/enviar uma "base-consolidada" a parte: este
script chama shared_py/etl_common.py, que transforma a planilha bruta
diretamente no formato consolidado antes de calcular qualquer metrica.

Uso:
    python build_data.py "caminho/para/base-raw-compras.xlsx" "caminho/para/base-KPIs.xlsx"

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
from etl_common import raw_to_consolidada  # noqa: E402

# Meta de referencia 2026 (fornecidas pela area de Compras)
META_PMP_2026 = 33
META_DIO_2026 = 15

# Mesma lista usada no modulo de Fornecedores, para manter consistencia
EXCLUDE_GRUPOS_RAW = [
    'MANUTENCAO', 'CONSUMO', 'UTENSILIOS',
    'DESCARTAVEIS', 'CIGARROS', 'MAQUINAS E EQUIPAMENTOS', 'SERVICOS'
]

FORN_COL = 'RAZAO FORNECEDOR'

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
    print(f"Lendo KPIs: {kpis_path}")
    kpis_raw = pd.read_excel(kpis_path, sheet_name=0)

    # ---- Limpeza / exclusao de grupos (mesma regra do modulo Fornecedores) ----
    exclude_norm = set(norm(g) for g in EXCLUDE_GRUPOS_RAW)
    base['_grupo_norm'] = base['GRUPO'].apply(norm)
    excluded_real = sorted(base[base['_grupo_norm'].isin(exclude_norm)]['GRUPO'].unique().tolist())
    df = base[~base['_grupo_norm'].isin(exclude_norm)].copy().drop(columns=['_grupo_norm'])
    df = df[df['QDE_COMPRADA'] > 0].copy()  # remove linhas sem quantidade (preco indefinido)

    # Identificador de pedido = NF (numero da nota) + fornecedor. So o numero
    # da NF nao basta: numeracao de nota fiscal e sequencial por fornecedor,
    # entao numeros iguais podem pertencer a fornecedores diferentes (na base
    # atual, ~8% dos numeros de NF sao usados por mais de um fornecedor) — sem
    # o fornecedor na chave, pedidos de empresas diferentes seriam contados
    # como um so. Cada combinacao (fornecedor, N. NOTA) = 1 pedido, contado uma
    # unica vez mesmo tendo varias linhas (uma por item da nota).
    df['_PEDIDO_ID'] = df[FORN_COL].astype(str) + '||' + df['N. NOTA'].astype(str)

    months = sorted(df['MES'].astype(str).unique())
    month_labels = {m: month_label(m) for m in months}
    print(f"Meses (base consolidada): {months}")
    print(f"Grupos excluidos: {excluded_real}")

    # Dicionario global de itens (nome -> indice), construido uma unica vez —
    # usado para compactar a lista de itens distintos por mes (ver
    # monthly_exec abaixo), sem repetir os nomes por extenso em cada mes.
    dict_itens_indicadores = sorted(df['DESCRICAO_ITEM'].dropna().unique().tolist())
    item_idx_indicadores = {nome: i for i, nome in enumerate(dict_itens_indicadores)}

    # =========================================================================
    # 1) KPIs EXECUTIVOS MENSAIS (calculados a partir da base-principal)
    # =========================================================================
    monthly_exec = []
    for m in months:
        sub = df[df['MES'].astype(str) == m]
        valor_total = float(sub['VALOR_CONTABIL'].sum())
        pedidos = int(sub['_PEDIDO_ID'].nunique())
        itens_unicos = int(sub['DESCRICAO_ITEM'].nunique())
        fornecedores = int(sub[FORN_COL].nunique())
        ticket_medio = valor_total / pedidos if pedidos else 0
        monthly_exec.append({
            'MES': m,
            'valor_total': round(valor_total, 2),
            'pedidos': pedidos,
            'itens_unicos': itens_unicos,
            'fornecedores': fornecedores,
            'ticket_medio': round(ticket_medio, 2),
            # Identidades brutas (nao apenas as contagens acima) — usadas
            # pelo front-end para recalcular corretamente pedidos/itens
            # unicos/fornecedores quando o usuario seleciona mais de um mes
            # ao mesmo tempo (Ctrl+clique): faz a UNIAO desses conjuntos
            # entre os meses escolhidos, em vez de somar as contagens de
            # cada mes (que contaria duas vezes um pedido/item/fornecedor
            # presente em mais de um mes selecionado).
            'pedido_ids': sorted(sub['_PEDIDO_ID'].unique().tolist()),
            'itens_idx': sorted({item_idx_indicadores[nome] for nome in sub['DESCRICAO_ITEM'].unique()}),
            'fornecedores_lista': sorted(sub[FORN_COL].unique().tolist()),
        })

    # variacao percentual mes a mes (MoM) para cada metrica executiva
    exec_df = pd.DataFrame(monthly_exec)
    for col in ['valor_total', 'pedidos', 'itens_unicos', 'fornecedores', 'ticket_medio']:
        exec_df[col + '_mom'] = exec_df[col].pct_change() * 100
    exec_df = exec_df.replace({np.nan: None})
    monthly_exec = exec_df.to_dict('records')

    # =========================================================================
    # 2) KPIS EXTERNOS (inflacao, PMP, DIO, cotacao, contratos, CMV)
    #    A planilha agora traz o historico de CMV de 2025 inteiro, alem de
    #    2026. Series usadas:
    #      - external_kpis: TODOS os meses de 2026 (o que ja existia)
    #      - cmv_comparativo: CMV mes a mes, comparando 2025 x 2026, com
    #        percentual de melhora (CMV menor = melhor)
    #      - pmp_dio_series: PMP, DIO e a diferenca DIO-PMP por mes de 2026,
    #        com as metas de referencia
    # =========================================================================
    kpis_raw = kpis_raw.copy()
    kpis_raw['MES'] = pd.to_datetime(kpis_raw['MÊS']).dt.strftime('%Y-%m')
    kpis_raw['ANO'] = kpis_raw['MES'].str.slice(0, 4)
    kpis_raw['MM'] = kpis_raw['MES'].str.slice(5, 7)
    kpis_raw = kpis_raw.sort_values('MES')

    kpis_2026 = kpis_raw[kpis_raw['ANO'] == '2026'].copy()
    external_kpis = []
    for _, r in kpis_2026.iterrows():
        external_kpis.append({
            'MES': r['MES'],
            'inflacao': round(float(r['INFLAÇÃO']) * 100, 3) if pd.notna(r['INFLAÇÃO']) else None,
            'pmp': float(r['PMP']) if pd.notna(r['PMP']) and r['PMP'] != 0 else None,
            'dio': float(r['DIO']) if pd.notna(r['DIO']) else None,
            'cotacao': int(r['COTAÇÃO']) if pd.notna(r['COTAÇÃO']) else None,
            'contratos': int(r['CONTRATOS']) if pd.notna(r['CONTRATOS']) else None,
            'cmv': round(float(r['CMV']) * 100, 2) if pd.notna(r['CMV']) else None,
        })
    external_months = [e['MES'] for e in external_kpis]
    print(f"Meses (KPIs 2026): {external_months}")

    # ---- CMV comparativo 2025 x 2026 (por mes, MM = '01'..'12') ----
    cmv_2025_by_mm = {
        r['MM']: round(float(r['CMV']) * 100, 2)
        for _, r in kpis_raw[kpis_raw['ANO'] == '2025'].iterrows() if pd.notna(r['CMV'])
    }
    cmv_2026_by_mm = {
        r['MM']: round(float(r['CMV']) * 100, 2)
        for _, r in kpis_2026.iterrows() if pd.notna(r['CMV'])
    }
    cmv_comparativo = []
    for mm in sorted(set(cmv_2025_by_mm) | set(cmv_2026_by_mm)):
        v25 = cmv_2025_by_mm.get(mm)
        v26 = cmv_2026_by_mm.get(mm)
        melhora_pct = round(100 * (v25 - v26) / v25, 1) if (v25 and v26) else None
        cmv_comparativo.append({
            'mm': mm,
            'mes_label': MONTH_LABELS_PT.get(mm, mm),
            'cmv_2025': v25,
            'cmv_2026': v26,
            'melhora_pct': melhora_pct,
        })
    print(f"CMV comparativo 2025x2026: {len(cmv_comparativo)} meses com pelo menos um ano com dado")

    # ---- PMP e DIO com metas 2026 ----
    pmp_dio_series = []
    for e in external_kpis:
        if e['pmp'] is None and e['dio'] is None:
            continue
        diff = round(e['dio'] - e['pmp'], 1) if (e['pmp'] is not None and e['dio'] is not None) else None
        pmp_dio_series.append({
            'MES': e['MES'], 'pmp': e['pmp'], 'dio': e['dio'], 'diferenca': diff,
            'meta_pmp': META_PMP_2026, 'meta_dio': META_DIO_2026,
        })

    # =========================================================================
    # 3) TOTAIS GERAIS (usados pelos KPIs executivos, ver secao 1)
    # =========================================================================
    total_geral = float(df['VALOR_CONTABIL'].sum())
    total_fornecedores = int(df[FORN_COL].nunique())
    total_itens = int(df['DESCRICAO_ITEM'].nunique())
    total_pedidos = int(df['_PEDIDO_ID'].nunique())

    # =========================================================================
    # MONTAGEM FINAL
    # =========================================================================
    data = {
        'month_labels': month_labels,
        'months_order': months,
        'external_months': external_months,
        'monthly_exec': monthly_exec,
        'external_kpis': external_kpis,
        'cmv_comparativo': cmv_comparativo,
        'pmp_dio_series': pmp_dio_series,
        'meta_pmp': META_PMP_2026,
        'meta_dio': META_DIO_2026,
        'kpis_gerais': {
            'total_geral': round(total_geral, 2),
            'total_fornecedores': total_fornecedores,
            'total_itens': total_itens,
            'total_pedidos': total_pedidos,
        },
        'excluded_grupos': excluded_real,
        'dict_itens_indicadores': dict_itens_indicadores,
        'gerado_em': pd.Timestamp.now().strftime('%d/%m/%Y'),
    }

    out_path = os.path.join(BASE_DIR, 'data.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('// Dados gerados automaticamente por build_data.py — NAO EDITAR MANUALMENTE\n')
        f.write(f"// Gerado em: {data['gerado_em']} | Fontes: {os.path.basename(raw_path)}, {os.path.basename(kpis_path)}\n")
        f.write('const INDICADORES_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'), default=str) + ';\n')

    print(f"OK -> {out_path} atualizado.")
    print(f"Total geral: R$ {total_geral:,.2f} | Itens: {total_itens} | Fornecedores: {total_fornecedores}")


if __name__ == '__main__':
    main()

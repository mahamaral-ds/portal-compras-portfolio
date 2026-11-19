"""
Gera o data.js do modulo "Analise de Itens" a partir da planilha BRUTA de
notas fiscais (mesma usada nos modulos de Fornecedores e Indicadores) e,
para a aba "Precos por Geolocalizacao", tambem da planilha "base-CMC.xlsx"
(usada so para obter a REGIAO de cada casa — SP/RJ/BR).

Este modulo expoe a base tratada linha a linha (nao agregada), em formato de
tabela filtravel. Como a base tem ~250 mil linhas, os campos categoricos
(mes, casa, segmento, fornecedor, item) sao codificados por dicionario
(cada linha guarda um indice numerico, nao o texto repetido) para manter o
arquivo gerado leve e o carregamento rapido no navegador — o texto de cada
categoria fica em uma tabela de consulta separada, pequena.

Uso:
    python build_data.py "caminho/para/base-raw-compras.xlsx" "caminho/para/base-CMC.xlsx"

Gera/sobrescreve: data.js (na mesma pasta deste script) e raw-data/registros_suspeitos_UM.xlsx
(lista de registros suspeitos e unidade de referencia por item, para revisao manual).

Analises de PRECO UNITARIO (Historico de Precos, maiores aumentos/reducoes, Precos por Geolocalizacao):
usam so' os registros na UNIDADE DE REFERENCIA de cada item (maior valor comprado) e fora dos registros
suspeitos — regra centralizada em unidade_referencia.py. Valor total, quantidade, ABC e a Tabela Detalhada
continuam usando todos os registros.
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
from casa_geo_map import FANTASIA_TO_CMC, FANTASIA_TO_CMV  # noqa: E402
import unicodedata  # noqa: E402
import unidade_referencia as ur  # noqa: E402

TOP_N_ITENS_GEO = 150

# Mesma lista usada nos modulos de Fornecedores/Indicadores/Categorias, para
# manter consistencia — usada so pelo recorte de dados das abas Historico de
# Precos/Inteligencia de Compras (ver df_intel em main()), nao pela Tabela
# Detalhada, que expõe a base tratada como um todo.

EXCLUDE_GRUPOS_RAW = [
    'MANUTENCAO', 'CONSUMO', 'UTENSILIOS',
    'DESCARTAVEIS', 'CIGARROS', 'MAQUINAS E EQUIPAMENTOS', 'SERVICOS'
]

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


def build_dict(series):
    """Devolve (lista_ordenada_de_valores_unicos, dict valor->indice)."""
    values = sorted(series.dropna().unique().tolist())
    index = {v: i for i, v in enumerate(values)}
    return values, index


# Opcoes do filtro "Segmento x Regiao" da Tabela Detalhada, na ordem exibida:
# (vertical na cmv-casas, regiao na cmv-casas, rotulo). Vertical/regiao sao comparadas
# sem acento e em maiusculas. A ligacao casa -> vertical/regiao vem da propria cmv-casas
# (via FANTASIA_TO_CMV); aqui so' ficam as opcoes, nao uma lista de casas.
SEGMENTO_REGIAO_OPCOES = [
    ('CAFETERIA', 'SP', 'Cafeterias SP'),
    ('CAFETERIA', 'RJ', 'Cafeterias RJ'),
    ('CAFETERIA', 'BR', 'Cafeterias BR'),
    ('BISTRO', 'SP', 'Bistrôs SP'),
    ('BISTRO', 'RJ', 'Bistrôs RJ'),
    ('BISTRO', 'BR', 'Bistrôs BR'),
    ('QUIOSQUE', 'SP', 'Quiosques SP'),
    ('QUIOSQUE', 'RJ', 'Quiosques RJ'),
    ('QUIOSQUE', 'BR', 'Quiosques BR'),
]


def _norm_txt(v):
    s = ''.join(c for c in unicodedata.normalize('NFD', str(v)) if unicodedata.category(c) != 'Mn')
    return ' '.join(s.upper().split())


def build_casa_segmento_regiao(casas, cmv_path):
    """
    Para cada casa de `casas` (na ordem de dict_casas) devolve o indice da opcao de
    SEGMENTO_REGIAO_OPCOES a que ela pertence segundo a cmv-casas, ou -1 (sem vinculo:
    casa sem correspondencia na cmv-casas, ou vertical/regiao fora das opcoes).
    Devolve (labels, indices). Sem a cmv-casas, devolve ([], [-1...]) e o filtro some da pagina.
    """
    if not os.path.exists(cmv_path):
        print(f"AVISO: cmv-casas nao encontrada em '{cmv_path}' — filtro Segmento x Regiao ficara oculto.")
        return [], [-1] * len(casas)
    xls = pd.ExcelFile(cmv_path)
    sheet = next((s for s in ('CMV_CASAS', 'Planilha1') if s in xls.sheet_names), xls.sheet_names[0])
    cmv = pd.read_excel(cmv_path, sheet_name=sheet)
    cmv.columns = [_norm_txt(c) for c in cmv.columns]
    col_regiao = next(c for c in cmv.columns if c.startswith('REGI'))
    col_mes = next((c for c in cmv.columns if c.startswith('M') and c.endswith('S') and len(c) == 3), None)
    cmv = cmv[~cmv['CASAS'].astype(str).str.upper().str.startswith('TOTAL')].copy()
    if col_mes:
        cmv = cmv.sort_values(col_mes)
    # uma casa -> (vertical, regiao) do registro mais recente
    info = {}
    for casa, vert, reg in zip(cmv['CASAS'], cmv['VERTICAL'], cmv[col_regiao]):
        info[str(casa).strip()] = (_norm_txt(vert), _norm_txt(reg))
    opcao_idx = {(v, r): i for i, (v, r, _) in enumerate(SEGMENTO_REGIAO_OPCOES)}
    indices, sem_vinculo, fora_das_opcoes = [], [], []
    for casa in casas:
        codigo = FANTASIA_TO_CMV.get(casa)
        chave = info.get(codigo) if codigo else None
        if chave is None:
            sem_vinculo.append(casa)
            indices.append(-1)
        elif chave in opcao_idx:
            indices.append(opcao_idx[chave])
        else:
            fora_das_opcoes.append((casa, chave))
            indices.append(-1)
    print(f"Segmento x Regiao: {sum(1 for i in indices if i >= 0)} de {len(casas)} casas classificadas pela cmv-casas.")
    if sem_vinculo:
        print(f"  Sem correspondencia na cmv-casas ({len(sem_vinculo)}): {', '.join(sem_vinculo)}")
    if fora_das_opcoes:
        print(f"  Vertical/regiao fora das opcoes: {fora_das_opcoes}")
    return [lbl for _, _, lbl in SEGMENTO_REGIAO_OPCOES], indices


GEO_REGIOES = ['SP', 'RJ', 'BR']


def build_casa_regiao(df, casas, cmc_path):
    """
    Para cada casa de `casas` (na ordem de dict_casas) devolve o indice da sua REGIAO em GEO_REGIOES (SP/RJ/BR), ou
    -1 (casa sem correspondencia na base de CMC). A casa (FANTASIA) da base bruta e' ligada a REGIAO cadastrada na
    base de CMC via shared_py/casa_geo_map.py (FANTASIA_TO_CMC).

    O heatmap da aba "Precos por Geolocalizacao" e' calculado no navegador (com os filtros da aba) a partir das linhas
    da base; este mapa casa -> regiao e' o que ele precisa. Devolve None (com um aviso no terminal) se a planilha de
    CMC nao for encontrada — nesse caso a aba fica vazia mas o resto do modulo continua funcionando normalmente.
    """
    if not os.path.exists(cmc_path):
        print(f"AVISO: planilha de CMC nao encontrada em '{cmc_path}' — aba de geolocalizacao ficara vazia.")
        return None

    xls = pd.ExcelFile(cmc_path)
    sheet = next((s for s in ('CMC', 'Planilha1') if s in xls.sheet_names), xls.sheet_names[0])
    cmc = pd.read_excel(cmc_path, sheet_name=sheet)
    regiao_cmc = cmc.drop_duplicates('CASA').set_index('CASA')['REGIÃO'].to_dict()

    regiao_casa = {c: regiao_cmc.get(FANTASIA_TO_CMC.get(c)) for c in casas}
    indices = [GEO_REGIOES.index(regiao_casa[c]) if regiao_casa[c] in GEO_REGIOES else -1 for c in casas]

    mapeadas = {c for c, i in zip(casas, indices) if i >= 0}
    cobertura_valor_pct = round(100 * df.loc[df['FANTASIA'].isin(mapeadas), 'VALOR_CONTABIL'].sum() / df['VALOR_CONTABIL'].sum(), 1)
    print(f"Cruzamento casa->regiao: {len(mapeadas)} de {len(casas)} casas mapeadas ({cobertura_valor_pct}% do valor total comprado).")
    return indices


def main():
    input_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE_DIR, 'base-raw-compras.xlsx')
    cmc_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(BASE_DIR, 'base-CMC.xlsx')
    cmv_path = sys.argv[3] if len(sys.argv) > 3 else os.path.join(BASE_DIR, '..', '..', 'raw-data', 'cmv-casas.xlsx')
    if not os.path.exists(input_path):
        print(f"ERRO: arquivo nao encontrado: {input_path}")
        print('Uso: python build_data.py "caminho/para/base-raw-compras.xlsx" "caminho/para/base-CMC.xlsx"')
        sys.exit(1)

    print(f"Lendo (planilha bruta): {input_path}")
    # D. EMISSAO, N. NOTA e DESCRICAO ITEM FORNECEDOR: colunas brutas extras, so' exibidas na Tabela Detalhada
    df = raw_to_consolidada(input_path, extra_columns=['UM', 'D. EMISSAO', 'N. NOTA', 'DESCRICAO ITEM FORNECEDOR'])
    print(f"Transformado em base consolidada: {len(df)} linhas")

    df = df.dropna(subset=['FANTASIA', 'SEGMENTO', 'RAZAO FORNECEDOR', 'DESCRICAO_ITEM', 'MES']).copy()
    df['UM'] = df['UM'].fillna('—')
    df = df.reset_index(drop=True)

    # ---- Unidade de referencia por item e registros suspeitos (unidade_referencia.py) ----
    # A regra e' aplicada so' no tratamento: a planilha original e a Tabela Detalhada nao mudam.
    ref_resumo = ur.definir_unidade_referencia(df)
    um_ref = ref_resumo['um_ref']
    df['UM_REF'] = df['DESCRICAO_ITEM'].map(um_ref)
    mask_suspeito, suspeitos = ur.marcar_suspeitos(df, um_ref)
    # casos claros de suspeito (mesmo item + descricao, fator de embalagem explicito que fecha com a mediana):
    # so' a QUANTIDADE usada no preco e' ajustada (QDE_PRECO); valor, UM e Tabela Detalhada nao mudam
    qde_preco, conversoes = ur.converter_casos_claros(df, um_ref, mask_suspeito)
    df['QDE_PRECO'] = qde_preco
    mask_convertido = pd.Series(df.index.isin(conversoes.index), index=df.index)
    # base de PRECO: quantidade > 0, na UM de referencia do item e (fora dos suspeitos ou convertido)
    na_ref = (df['QDE_COMPRADA'] > 0) & (df['UM'] == df['UM_REF'])
    df_preco = df[na_ref & (~mask_suspeito | mask_convertido)].copy()

    com_qde = df[df['QDE_COMPRADA'] > 0]
    fora_um = com_qde['UM'] != com_qde['UM_REF']
    resumo_um = {
        'itens': int(len(ref_resumo)),
        'itens_multi_um': int((ref_resumo['n_ums'] > 1).sum()),
        'itens_divergentes': int(ref_resumo['divergente'].sum()),
        'registros': int(len(com_qde)),
        'registros_fora_um': int(fora_um.sum()),
        'valor_fora_um_pct': round(100 * float(com_qde.loc[fora_um, 'VALOR_CONTABIL'].sum() / com_qde['VALOR_CONTABIL'].sum()), 2),
        'registros_suspeitos': int(mask_suspeito.sum()),
        'valor_suspeitos_pct': round(100 * float(df.loc[mask_suspeito, 'VALOR_CONTABIL'].sum() / com_qde['VALOR_CONTABIL'].sum()), 2),
        'registros_convertidos': int(mask_convertido.sum()),
        'valor_convertidos_pct': round(100 * float(df.loc[mask_convertido, 'VALOR_CONTABIL'].sum() / com_qde['VALOR_CONTABIL'].sum()), 2),
        'itens_convertidos': int(df.loc[mask_convertido, 'DESCRICAO_ITEM'].nunique()),
    }
    resumo_um['registros_fora_um_pct'] = round(100 * resumo_um['registros_fora_um'] / resumo_um['registros'], 2)
    print(f"Unidade de referencia: {resumo_um['itens_multi_um']} de {resumo_um['itens']} itens tem mais de uma UM | "
          f"fora da analise de preco: {resumo_um['registros_fora_um']} registros ({resumo_um['registros_fora_um_pct']}%) "
          f"/ {resumo_um['valor_fora_um_pct']}% do valor | suspeitos: {resumo_um['registros_suspeitos']} registros "
          f"({resumo_um['valor_suspeitos_pct']}% do valor), dos quais {resumo_um['registros_convertidos']} convertidos pela descricao "
          f"({resumo_um['itens_convertidos']} itens) | divergencias valor x frequencia: {resumo_um['itens_divergentes']} itens")
    caminho_suspeitos = os.path.join(BASE_DIR, '..', '..', 'raw-data', 'registros_suspeitos_UM.xlsx')
    try:
        ur.gerar_relatorio(caminho_suspeitos, df, ref_resumo, suspeitos, conversoes)
        print(f"Lista para revisao: {os.path.normpath(caminho_suspeitos)}")
    except PermissionError:
        print(f"AVISO: nao foi possivel gravar '{caminho_suspeitos}' (arquivo aberto no Excel?) — feche-o e rode de novo.")

    # Preco unitario por linha (valor contabil / quantidade comprada daquela
    # linha). Guarda None quando a quantidade e' zero/ausente, pra nao dividir
    # por zero nem exibir um preco unitario sem sentido.
    df['PRECO_UNITARIO'] = (df['VALOR_CONTABIL'] / df['QDE_COMPRADA']).where(df['QDE_COMPRADA'] > 0)

    months = sorted(df['MES'].unique())
    month_labels = {m: month_label(m) for m in months}

    # =========================================================================
    # Historico de Precos / Inteligencia de Compras — dados movidos do modulo
    # Indicadores (mesma logica de calculo daquele
    # build_data.py). Usa o mesmo recorte de dados dos demais modulos que leem
    # a base bruta (exclui os grupos "nao produto" e remove linhas sem
    # quantidade comprada, preco indefinido) — diferente da Tabela Detalhada
    # acima, que expõe a base tratada como um todo, sem esses cortes.
    # =========================================================================
    exclude_norm = set(norm(g) for g in EXCLUDE_GRUPOS_RAW)
    df_intel = df[df['QDE_COMPRADA'] > 0].copy()
    df_intel['_grupo_norm'] = df_intel['GRUPO'].apply(norm)
    df_intel = df_intel[~df_intel['_grupo_norm'].isin(exclude_norm)].drop(columns=['_grupo_norm'])
    months_intel = sorted(df_intel['MES'].astype(str).unique())
    # mesmo recorte, mas so' registros na UM de referencia e fora dos suspeitos: base das analises de PRECO
    df_intel_preco = df_preco[~df_preco['GRUPO'].apply(norm).isin(exclude_norm)]

    item_grupo = df_intel.groupby('DESCRICAO_ITEM')['GRUPO'].agg(lambda s: s.value_counts().idxmax())
    item_subgrupo = df_intel.groupby('DESCRICAO_ITEM')['SUBGRUPO'].agg(lambda s: s.value_counts().idxmax())
    item_total_valor = df_intel.groupby('DESCRICAO_ITEM')['VALOR_CONTABIL'].sum().sort_values(ascending=False)

    # preco medio mensal do item SO' na UM de referencia (valor/qde de unidades diferentes nao se comparam)
    item_month_preco = df_intel_preco.groupby(['DESCRICAO_ITEM', 'MES']).agg(
        valor=('VALOR_CONTABIL', 'sum'),
        qde=('QDE_PRECO', 'sum'),
    ).reset_index()
    item_month_preco['preco_medio'] = item_month_preco['valor'] / item_month_preco['qde']

    # ---- Maiores aumentos / reducoes de preco ----
    # Compara o primeiro e o ultimo mes em que cada item teve compra NA UM DE REFERENCIA,
    # exigindo materialidade minima (item entre os que somam ~85% do valor)
    # para nao poluir o ranking com itens comprados uma unica vez.
    materialidade_n = int((item_total_valor.cumsum() / item_total_valor.sum() <= 0.85).sum())
    materialidade_n = max(materialidade_n, 60)
    itens_materiais = set(item_total_valor.head(materialidade_n).index)

    price_moves = []
    quality_flags = []
    for item, g in item_month_preco.groupby('DESCRICAO_ITEM'):
        if item not in itens_materiais:
            continue
        g = g.sort_values('MES')
        if len(g) < 2:
            continue
        first, last = g.iloc[0], g.iloc[-1]
        if first['preco_medio'] <= 0 or first['qde'] <= 0 or last['qde'] <= 0:
            continue

        # Com a UM de referencia fixa, mudanca de unidade entre meses deixou de ser causa de
        # distorcao (o criterio antigo de quantidade >8x sumiu: agora e' so' variacao de volume).
        # Variacao acima de 300% mesmo na mesma unidade continua sendo tratada como possivel erro
        # de cadastro/preco e fica de fora do ranking (sinalizada como alerta de qualidade de dado).
        var_pct = (last['preco_medio'] / first['preco_medio'] - 1) * 100
        if abs(var_pct) > 300:
            quality_flags.append({
                'item': item, 'grupo': item_grupo.get(item, ''),
                'mes_inicial': first['MES'], 'qde_inicial': round(float(first['qde']), 1),
                'mes_final': last['MES'], 'qde_final': round(float(last['qde']), 1),
                'var_pct_bruta': round(float(var_pct), 1),
            })
            continue

        var_abs = last['preco_medio'] - first['preco_medio']
        price_moves.append({
            'item': item,
            'grupo': item_grupo.get(item, ''),
            'subgrupo': item_subgrupo.get(item, ''),
            'um': um_ref.get(item),
            'mes_inicial': first['MES'],
            'preco_inicial': round(float(first['preco_medio']), 2),
            'mes_final': last['MES'],
            'preco_final': round(float(last['preco_medio']), 2),
            'var_pct': round(float(var_pct), 2),
            'var_abs': round(float(var_abs), 2),
            'valor_total': round(float(item_total_valor.get(item, 0)), 2),
        })

    price_moves_df = pd.DataFrame(price_moves)
    top_aumentos = price_moves_df.sort_values('var_pct', ascending=False).head(15).to_dict('records')
    top_reducoes = price_moves_df.sort_values('var_pct', ascending=True).head(15).to_dict('records')

    # ---- Evolucao de preco por categoria (GRUPO), indice base 100 ----
    # Nota: um "preco medio geral" consolidando todos os itens foi
    # deliberadamente descartado — a base mistura itens com unidades de
    # medida distintas (kg, unidade, caixa, litro, pacote etc.), o que
    # tornaria essa metrica estatisticamente incorreta. A analise de preco
    # fica restrita ao nivel de item (mesma unidade ao longo do tempo) e
    # ao indice por categoria abaixo (base 100, comparavel dentro da
    # propria categoria).
    grupo_month_price = df_intel.groupby(['GRUPO', 'MES']).agg(
        valor=('VALOR_CONTABIL', 'sum'), qde=('QDE_COMPRADA', 'sum')
    ).reset_index()
    grupo_month_price['preco_medio'] = grupo_month_price['valor'] / grupo_month_price['qde']

    top_grupos_valor = df_intel.groupby('GRUPO')['VALOR_CONTABIL'].sum().sort_values(ascending=False).head(10).index.tolist()

    grupo_price_pivot = grupo_month_price[grupo_month_price['GRUPO'].isin(top_grupos_valor)].pivot(
        index='MES', columns='GRUPO', values='preco_medio'
    ).reindex(index=months_intel, columns=top_grupos_valor)
    grupo_price_idx = grupo_price_pivot.apply(lambda col: (col / col.dropna().iloc[0]) * 100 if col.dropna().size else col)
    grupo_price_heatmap = {
        'grupos': top_grupos_valor,
        'meses': months_intel,
        'indice': grupo_price_idx.round(1).where(pd.notna(grupo_price_idx), None).values.tolist(),
    }

    # ---- Curva ABC por item, ranking e treemap — calculados por periodo ----
    # (recalculados para "Todos os meses" e para cada mes individual, para
    # alimentar o filtro de periodo da aba "Inteligencia de Compras")
    def compute_intel_period(scope):
        s_item_valor = scope.groupby('DESCRICAO_ITEM')['VALOR_CONTABIL'].sum().sort_values(ascending=False)
        s_item_grupo = scope.groupby('DESCRICAO_ITEM')['GRUPO'].agg(lambda s: s.value_counts().idxmax())

        s_abc = s_item_valor.reset_index()
        s_abc.columns = ['item', 'valor_total']
        s_total = s_abc['valor_total'].sum()
        if s_total <= 0:
            return {'abc_curve_items': [], 'abc_class_summary_items': [], 'ranking_itens': [], 'treemap_data': []}
        s_abc['part_pct'] = s_abc['valor_total'] / s_total
        s_abc['acum_pct'] = s_abc['part_pct'].cumsum() * 100
        s_abc['classe'] = s_abc['acum_pct'].apply(classify_abc)
        s_abc['rank'] = np.arange(1, len(s_abc) + 1)

        curve = [[int(r[0]), round(float(r[1]), 2), r[2]] for r in s_abc[['rank', 'acum_pct', 'classe']].values.tolist()]

        class_summary = []
        for c in ['A', 'B', 'C']:
            sub = s_abc[s_abc['classe'] == c]
            class_summary.append({'classe': c, 'itens': int(len(sub)), 'valor': round(float(sub['valor_total'].sum()), 2)})

        # lista COMPLETA (sem corte de top-60) — o corte para exibicao na
        # tabela e' feito no front-end; sem isso, nao daria pra recalcular
        # corretamente o ranking ao selecionar mais de um mes (a soma de
        # valor por item entre os meses escolhidos precisa do valor de TODO
        # item, nao so dos que estavam no top-60 de um mes especifico)
        rank_top = s_abc.copy()
        rank_top['grupo'] = rank_top['item'].map(s_item_grupo)
        ranking = [
            {
                'rank': int(r['rank']), 'item': r['item'], 'grupo': r['grupo'],
                'valor_total': round(float(r['valor_total']), 2),
                'part_pct': round(float(r['part_pct']), 4),
                'classe': r['classe'],
            } for r in rank_top.to_dict('records')
        ]

        s_treemap = scope.groupby(['GRUPO', 'SUBGRUPO'])['VALOR_CONTABIL'].sum().reset_index()
        treemap = []
        for grupo, g in s_treemap.groupby('GRUPO'):
            children = g.sort_values('VALOR_CONTABIL', ascending=False).apply(
                lambda r: {'name': r['SUBGRUPO'], 'value': round(float(r['VALOR_CONTABIL']), 2)}, axis=1
            ).tolist()
            treemap.append({'name': grupo, 'value': round(float(g['VALOR_CONTABIL'].sum()), 2), 'children': children})
        treemap = sorted(treemap, key=lambda x: x['value'], reverse=True)

        return {
            'abc_curve_items': curve,
            'abc_class_summary_items': class_summary,
            'ranking_itens': ranking,
            'treemap_data': treemap,
        }

    periods_intel = {'ALL': compute_intel_period(df_intel)}
    for m in months_intel:
        periods_intel[m] = compute_intel_period(df_intel[df_intel['MES'].astype(str) == m])

    # ---- Serie mensal completa de preco medio para os itens do seletor
    #      (top 60 por valor), usada no grafico de "Historico de preco por
    #      item" — leve o suficiente para embutir.
    abc_items_df = item_total_valor.reset_index()
    abc_items_df.columns = ['item', 'valor_total']
    total_geral_itens_intel = abc_items_df['valor_total'].sum()
    abc_items_df['part_pct'] = abc_items_df['valor_total'] / total_geral_itens_intel
    abc_items_df['acum_pct'] = abc_items_df['part_pct'].cumsum() * 100
    abc_items_df['classe'] = abc_items_df['acum_pct'].apply(classify_abc)
    abc_items_df['rank'] = np.arange(1, len(abc_items_df) + 1)
    top60_items = abc_items_df.head(60)['item'].tolist()

    item_monthly_series = {}
    for item in top60_items:
        g = item_month_preco[item_month_preco['DESCRICAO_ITEM'] == item].sort_values('MES')
        item_monthly_series[item] = {
            'um': um_ref.get(item),
            'meses': g['MES'].tolist(),
            'precos': [round(float(v), 4) for v in g['preco_medio'].tolist()],
        }

    quality_flags = sorted(quality_flags, key=lambda x: abs(x['var_pct_bruta']), reverse=True)[:30]

    # ---- Dicionarios de codificacao (categorias -> indice) ----
    mes_vals, mes_idx = build_dict(df['MES'])
    casa_vals, casa_idx = build_dict(df['FANTASIA'])
    casa_regiao = build_casa_regiao(df, casa_vals, cmc_path)
    seg_vals, seg_idx = build_dict(df['SEGMENTO'])
    grupo_vals, grupo_idx = build_dict(df['GRUPO'])
    subgrupo_vals, subgrupo_idx = build_dict(df['SUBGRUPO'])
    forn_vals, forn_idx = build_dict(df['RAZAO FORNECEDOR'])
    item_vals, item_idx = build_dict(df['DESCRICAO_ITEM'])
    um_vals, um_idx = build_dict(df['UM'])
    segreg_labels, casa_segreg = build_casa_segmento_regiao(casa_vals, cmv_path)
    df['DESCRICAO ITEM FORNECEDOR'] = df['DESCRICAO ITEM FORNECEDOR'].fillna('—').astype(str)
    desc_forn_vals, desc_forn_idx = build_dict(df['DESCRICAO ITEM FORNECEDOR'])

    print(f"Meses: {len(mes_vals)} | Casas: {len(casa_vals)} | Segmentos: {len(seg_vals)} | "
          f"Grupos: {len(grupo_vals)} | Subgrupos: {len(subgrupo_vals)} | "
          f"Fornecedores: {len(forn_vals)} | Itens: {len(item_vals)} | UMs: {len(um_vals)}")

    # data de referencia para compactar DATA_LANCAMENTO em inteiro (dias desde a base)
    base_date = df['DATA_LANCAMENTO'].min().normalize()
    dias = (df['DATA_LANCAMENTO'].dt.normalize() - base_date).dt.days.values
    # data de emissao no mesmo formato (pode ser anterior a base_date -> offset negativo)
    dias_emissao = (pd.to_datetime(df['D. EMISSAO']).dt.normalize() - base_date).dt.days.values

    mes_col = df['MES'].values
    casa_col = df['FANTASIA'].values
    seg_col = df['SEGMENTO'].values
    grupo_col = df['GRUPO'].values
    subgrupo_col = df['SUBGRUPO'].values
    forn_col = df['RAZAO FORNECEDOR'].values
    item_col = df['DESCRICAO_ITEM'].values
    um_col = df['UM'].values
    qde_col = df['QDE_COMPRADA'].values
    valor_col = df['VALOR_CONTABIL'].values
    preco_unit_col = df['PRECO_UNITARIO'].values
    nf_col = df['N. NOTA'].values
    desc_forn_col = df['DESCRICAO ITEM FORNECEDOR'].values

    # Historico de Precos (calculado no navegador a partir das linhas): por item, a UM de referencia (indice em
    # dict_uns, -1 = sem) e, por linha, a quantidade a usar no preco — 0 = linha fora do preco (outra UM ou suspeita),
    # 1 = usa a Qtde da propria linha, outro valor = Qtde ajustada (caso claro convertido pela descricao).
    um_ref_item = [um_idx.get(um_ref.get(it), -1) for it in item_vals]
    usa_preco = (na_ref & (~mask_suspeito | mask_convertido)).values
    conv_val = mask_convertido.values
    qde_preco_col = df['QDE_PRECO'].values
    rows_preco = [
        0 if not usa_preco[i] else (round(float(qde_preco_col[i]), 4) if conv_val[i] else 1)
        for i in range(len(df))
    ]

    rows = []
    for i in range(len(df)):
        pu = preco_unit_col[i]
        rows.append([
            mes_idx[mes_col[i]],
            casa_idx[casa_col[i]],
            seg_idx[seg_col[i]],
            grupo_idx[grupo_col[i]],
            subgrupo_idx[subgrupo_col[i]],
            forn_idx[forn_col[i]],
            item_idx[item_col[i]],
            int(dias[i]),
            round(float(qde_col[i]), 2),
            round(float(valor_col[i]), 2),
            um_idx[um_col[i]],
            round(float(pu), 4) if pd.notna(pu) else None,
            int(dias_emissao[i]),
            int(nf_col[i]),
            desc_forn_idx[desc_forn_col[i]],
        ])

    data = {
        'dict_meses': mes_vals,
        'dict_meses_labels': [month_labels[m] for m in mes_vals],
        'dict_casas': casa_vals,
        'dict_segmentos': seg_vals,
        'dict_grupos': grupo_vals,
        'dict_subgrupos': subgrupo_vals,
        'dict_fornecedores': forn_vals,
        'dict_itens': item_vals,
        'dict_uns': um_vals,
        'dict_segmento_regiao': segreg_labels,
        'casa_segmento_regiao': casa_segreg,
        'dict_desc_item_fornecedor': desc_forn_vals,
        'geo': None if casa_regiao is None else {'regioes': GEO_REGIOES, 'top_n': TOP_N_ITENS_GEO, 'casa_regiao': casa_regiao},
        'um_n_item': [int(ref_resumo['n_ums'].get(it, 1)) for it in item_vals],
        'unidade_referencia': resumo_um,
        'months_order': months_intel,
        'month_labels': month_labels,
        'top_aumentos': top_aumentos,
        'top_reducoes': top_reducoes,
        'grupo_price_heatmap': grupo_price_heatmap,
        'periods_intel': periods_intel,
        'item_monthly_series': item_monthly_series,
        'um_ref_item': um_ref_item,
        'rows_preco': rows_preco,
        'quality_flags': quality_flags,
        'base_date': base_date.strftime('%Y-%m-%d'),
        'rows': rows,
        'total_linhas': len(rows),
        'gerado_em': pd.Timestamp.now().strftime('%d/%m/%Y'),
    }

    out_path = os.path.join(BASE_DIR, 'data.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('// Dados gerados automaticamente por build_data.py — NAO EDITAR MANUALMENTE\n')
        f.write(f"// Gerado em: {data['gerado_em']} | Fonte: {os.path.basename(input_path)}\n")
        f.write('const ANALISE_ITENS_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'), default=str) + ';\n')

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"OK -> {out_path} ({size_mb:.2f} MB) atualizado.")
    print(f"Total de linhas: {len(rows)}")


if __name__ == '__main__':
    main()

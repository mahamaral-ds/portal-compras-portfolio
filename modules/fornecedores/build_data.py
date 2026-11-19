"""
Regera o arquivo data.js do dashboard de Fornecedores a partir da planilha
BRUTA de notas fiscais (uma linha por item de nota — ex: "base-raw-compras.xlsx").

Nao e' mais necessario gerar/enviar uma "base-consolidada" a parte: este
script chama shared_py/etl_common.py, que transforma a planilha bruta
diretamente no formato consolidado (FANTASIA, SEGMENTO, GRUPO, SUBGRUPO,
DESCRICAO_ITEM, RAZAO FORNECEDOR, DATA_LANCAMENTO, QDE_COMPRADA,
VALOR_CONTABIL, MES) antes de calcular qualquer metrica.

Uso:
    python build_data.py "caminho/para/base-raw-compras.xlsx"

Se nenhum caminho for passado, tenta usar "base-raw-compras.xlsx"
na mesma pasta deste script.

Gera/sobrescreve: data.js (na mesma pasta deste script)
"""
import sys
import os
import re
import json
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, '..', '..', 'shared_py'))
from etl_common import raw_to_consolidada, chave_ordem_grupo  # noqa: E402

# ---- Configuracao do complemento de fornecedores (PMP + Estado/UF) ----
# Fonte: raw-data/complemento_fornecedores.xlsx. Relacionada aos fornecedores
# do portal por NOME (Razao Social ou Nome de Fantasia, normalizados) — a
# base transacional de notas fiscais nao tem CNPJ do fornecedor, so o nome.
COMPLEMENTO_COL_CNPJ = 'CNPJCPF do Fornecedor'
COMPLEMENTO_COL_RAZAO = 'Nome ou Razao Social'
COMPLEMENTO_COL_FANTASIA = 'Nome de Fantasia'
COMPLEMENTO_COL_UF = 'Estado(UF)'
COMPLEMENTO_COL_PMP = 'PMP'

# Estado (UF) -> macro-regiao do IBGE, usado so para o agrupamento de
# visao geral da aba Regionalizacao (nao e' inferido/estimado — e' geografia
# oficial, a mesma classificacao publica de sempre).
UF_TO_REGIAO = {
    'AC': 'Norte', 'AP': 'Norte', 'AM': 'Norte', 'PA': 'Norte', 'RO': 'Norte', 'RR': 'Norte', 'TO': 'Norte',
    'AL': 'Nordeste', 'BA': 'Nordeste', 'CE': 'Nordeste', 'MA': 'Nordeste', 'PB': 'Nordeste',
    'PE': 'Nordeste', 'PI': 'Nordeste', 'RN': 'Nordeste', 'SE': 'Nordeste',
    'DF': 'Centro-Oeste', 'GO': 'Centro-Oeste', 'MT': 'Centro-Oeste', 'MS': 'Centro-Oeste',
    'ES': 'Sudeste', 'MG': 'Sudeste', 'RJ': 'Sudeste', 'SP': 'Sudeste',
    'PR': 'Sul', 'RS': 'Sul', 'SC': 'Sul',
}

# ---- Grupos a excluir de TODAS as analises (ajuste aqui se a lista mudar) ----
EXCLUDE_GRUPOS_RAW = [
    'MANUTENCAO', 'CONSUMO', 'UTENSILIOS',
    'DESCARTAVEIS', 'CIGARROS', 'MAQUINAS E EQUIPAMENTOS', 'SERVICOS'
]

# ---- Configuracao da aba "Itens por Fornecedor" ----
# Unidade "canonica" de um item = a unidade que concentra pelo menos essa
# fracao do valor comprado daquele item. Testado contra a base real: nao
# existe NENHUM par de unidades que seja conversao segura (ex: KG/GRAMAS,
# LITRO/ML) — toda inconsistencia real mistura tipos incompativeis (peso x
# unidade x volume), entao nao ha "tabela de conversao" possivel sem
# inventar peso/densidade de embalagem. Em vez disso: se uma unidade
# concentra >= UM_DOMINANCIA_MINIMA do valor do item, ela vira a unidade
# canonica e as linhas nas demais unidades (minoria) ficam de fora das
# metricas de preco/quantidade (mas continuam contando no valor total, que
# independe de unidade). Sem unidade dominante -> preco/quantidade
# suprimidos por completo para aquele item (badge na tela).
UM_DOMINANCIA_MINIMA = 0.95

# Quantos fornecedores entram na analise, por criterio (valor, nfs, casas,
# itens distintos) — a uniao dos top N de cada criterio e' o universo real
# de fornecedores com dado pre-computado (assim qualquer um dos 4 criterios
# de ranking no front-end sempre tem os 50 primeiros cobertos).
TOP_N_UNIAO = 50

# Saving so e' calculado quando o fornecedor de referencia (quem oferece o
# "melhor preco") tem, no historico completo daquele item, pelo menos esse
# numero de compras E pelo menos esse numero de dias de janela — evita usar
# uma unica compra isolada de outro fornecedor como benchmark.
SAVING_MIN_COMPRAS = 3
SAVING_MIN_DIAS = 30

FORN_COL = 'RAZAO FORNECEDOR'
ITEM_COL = 'COD ITEM'

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
    # mes_str no formato "2026-01" -> "Jan/26"
    try:
        ano, mes = mes_str.split('-')
        return f"{MONTH_LABELS_PT.get(mes, mes)}/{ano[-2:]}"
    except Exception:
        return mes_str


def classify_abc(cum_pct):
    if cum_pct <= 80.0:
        return 'A'
    elif cum_pct <= 95.0:
        return 'B'
    else:
        return 'C'


def norm_nome_fornecedor(s):
    """Normalizacao usada so para casar nomes entre a base de compras e o
    complemento de fornecedores (mais simples que norm(): nao mexe em
    hifen, so caixa/espacos, pra nao alterar nomes com hifen de verdade)."""
    if pd.isna(s):
        return None
    return re.sub(r'\s+', ' ', str(s).upper().strip())


def load_complemento_fornecedores(path):
    """
    Le raw-data/complemento_fornecedores.xlsx e monta, por nome de
    fornecedor (Razao Social OU Nome de Fantasia, normalizados), o PMP e o
    Estado (UF) — usados na coluna nova do Ranking de Fornecedores e na
    aba Regionalizacao (agora baseada em UF real, nao mais em proxy pela
    regiao da casa que compra).

    A base nova e' organizada por CNPJ (uma linha por CNPJ, sem duplicata),
    mas a base de compras so identifica o fornecedor pelo NOME (nao tem
    CNPJ do fornecedor) — entao o relacionamento e' por nome. Isso significa
    que uma razao social com varios CNPJs/filiais (ex: rede nacional) pode
    bater com varias linhas da base nova.

    PMP: quando ha mais de uma filial com PMP registrado, usa a MEDIA entre
    elas (decisao explicita — PMP e' um numero, dá pra resumir varias
    filiais assim sem inventar nada).

    Estado (UF): e' categorico, nao da pra "tirar a media" de dois estados
    — quando as filiais tem UFs DIFERENTES entre si, nao da pra saber por
    qual delas o grupo realmente comprou so pelo nome, entao o valor fica
    None (nao informado), nunca escolhido por aproximacao.

    Retorna (pmp_por_nome, uf_por_nome).
    """
    if not os.path.exists(path):
        print(f"AVISO: complemento de fornecedores nao encontrado em '{path}' — "
              f"coluna de PMP e aba de Regionalizacao ficarao vazias (sem UF).")
        return {}, {}

    comp = pd.read_excel(path)
    missing = [c for c in (COMPLEMENTO_COL_RAZAO, COMPLEMENTO_COL_FANTASIA, COMPLEMENTO_COL_UF, COMPLEMENTO_COL_PMP)
               if c not in comp.columns]
    if missing:
        print(f"AVISO: complemento de fornecedores '{path}' nao tem as colunas esperadas: {missing}. "
              f"Coluna de PMP e aba de Regionalizacao ficarao vazias.")
        return {}, {}

    comp['_norm_razao'] = comp[COMPLEMENTO_COL_RAZAO].apply(norm_nome_fornecedor)
    comp['_norm_fantasia'] = comp[COMPLEMENTO_COL_FANTASIA].apply(norm_nome_fornecedor)

    linhas_por_nome = {}
    for _, row in comp.iterrows():
        for chave in {row['_norm_razao'], row['_norm_fantasia']}:
            if chave:
                linhas_por_nome.setdefault(chave, []).append(row)

    def resolver_media_pmp(linhas):
        # PMP e' numero -> varias filiais viram a media entre as que tem
        # PMP registrado (ignora as sem PMP, nao conta como 0).
        valores = [float(linha[COMPLEMENTO_COL_PMP]) for linha in linhas
                   if isinstance(linha[COMPLEMENTO_COL_PMP], (int, float)) and pd.notna(linha[COMPLEMENTO_COL_PMP])]
        return sum(valores) / len(valores) if valores else None

    def resolver_uf_unanime(linhas):
        # UF e' categorico -> so retorna quando TODAS as filiais concordam;
        # caso contrario fica None de proposito (nunca escolhido por
        # aproximacao entre estados diferentes).
        valores = set()
        for linha in linhas:
            v = linha[COMPLEMENTO_COL_UF]
            if pd.notna(v) and str(v).strip():
                valores.add(str(v).strip().upper())
        return valores.pop() if len(valores) == 1 else None

    pmp_por_nome = {}
    uf_por_nome = {}
    for nome, linhas in linhas_por_nome.items():
        pmp_por_nome[nome] = resolver_media_pmp(linhas)
        uf_por_nome[nome] = resolver_uf_unanime(linhas)

    return pmp_por_nome, uf_por_nome


def compute_regionalizacao_uf(scope, uf_por_nome):
    """
    Regionalizacao de fornecedores por Estado (UF) REAL — vem do complemento
    de fornecedores (raw-data/complemento_fornecedores.xlsx), substituindo o
    proxy antigo (regiao da casa que compra). Fornecedores cujo nome nao bate
    com nenhuma linha do complemento, ou bate com linhas de UF conflitante
    entre filiais, entram no grupo 'NAO_INFORMADO' — nunca inferidos.

    Para cada UF, calcula uma curva ABC PROPRIA (rank e classe calculados
    sobre o valor comprado so dos fornecedores daquele estado) — nao e' um
    recorte da curva ABC geral do modulo.
    """
    valor_por_forn = scope.groupby(FORN_COL)['VALOR_CONTABIL'].sum()
    total_geral = float(valor_por_forn.sum())

    uf_de_cada_forn = {}
    for forn in valor_por_forn.index:
        uf = uf_por_nome.get(norm_nome_fornecedor(forn))
        uf_de_cada_forn[forn] = uf if uf else 'NAO_INFORMADO'

    estados_presentes = sorted({uf for uf in uf_de_cada_forn.values() if uf != 'NAO_INFORMADO'})

    def montar_bloco(nome_grupo, fornecedores_grupo):
        """Ranking + curva ABC PROPRIA para um grupo de fornecedores (um
        estado, ou o grupo 'Nao informado') — mesma forma para os dois, o
        front-end nao precisa tratar 'Nao informado' como caso especial."""
        sub_valor = valor_por_forn.loc[fornecedores_grupo].sort_values(ascending=False)
        total_grupo = float(sub_valor.sum())
        n = len(sub_valor)

        rank_df = pd.DataFrame({'Fornecedor': sub_valor.index, 'Valor': sub_valor.values})
        rank_df['Rank'] = rank_df.index + 1
        rank_df['Part. %'] = rank_df['Valor'] / total_grupo if total_grupo else 0.0
        rank_df['Acum. %'] = rank_df['Part. %'].cumsum() * 100
        rank_df['Classe'] = rank_df['Acum. %'].apply(classify_abc)
        rank_df['Valor'] = rank_df['Valor'].round(2)
        rank_df['Part. %'] = rank_df['Part. %'].round(4)
        rank_df['Acum. %'] = rank_df['Acum. %'].round(2)

        ranking = rank_df[['Rank', 'Fornecedor', 'Valor', 'Part. %', 'Acum. %', 'Classe']].to_dict('records')
        abc_curve = [[int(r[0]), round(float(r[1]), 2), r[2]] for r in rank_df[['Rank', 'Acum. %', 'Classe']].values.tolist()]

        classe_counts = rank_df['Classe'].value_counts()
        classe_valores = rank_df.groupby('Classe')['Valor'].sum()

        return {
            'uf': nome_grupo,
            'regiao': UF_TO_REGIAO.get(nome_grupo, 'Não informado' if nome_grupo == 'NAO_INFORMADO' else 'Outra'),
            'valor_total': round(total_grupo, 2),
            'fornecedores_count': int(n),
            'ranking': ranking,
            'abc_curve': abc_curve,
            'abc_class_summary': [
                {'classe': c, 'fornecedores': int(classe_counts.get(c, 0)), 'valor': round(float(classe_valores.get(c, 0.0)), 2)}
                for c in ['A', 'B', 'C']
            ],
            'cauda_longa_fornecedores_pct': round(100 * classe_counts.get('C', 0) / n, 1) if n else 0.0,
            'cauda_longa_valor_pct': round(100 * classe_valores.get('C', 0.0) / total_grupo, 1) if total_grupo else 0.0,
            'ticket_medio_fornecedor': round(total_grupo / n, 2) if n else 0.0,
            'top_fornecedor': rank_df.iloc[0]['Fornecedor'] if n else None,
        }

    por_uf = {}
    for uf in estados_presentes:
        fornecedores_uf = [f for f, u in uf_de_cada_forn.items() if u == uf]
        por_uf[uf] = montar_bloco(uf, fornecedores_uf)

    fornecedores_nao_informado = [f for f, u in uf_de_cada_forn.items() if u == 'NAO_INFORMADO']
    nao_informado_bloco = montar_bloco('NAO_INFORMADO', fornecedores_nao_informado) if fornecedores_nao_informado else None

    macro_regioes = {}
    for uf, dados in por_uf.items():
        macro = dados['regiao']
        acc = macro_regioes.setdefault(macro, {'valor_total': 0.0, 'fornecedores_count': 0, 'estados': []})
        acc['valor_total'] += dados['valor_total']
        acc['fornecedores_count'] += dados['fornecedores_count']
        acc['estados'].append(uf)
    for macro in macro_regioes:
        macro_regioes[macro]['valor_total'] = round(macro_regioes[macro]['valor_total'], 2)
        macro_regioes[macro]['estados'] = sorted(macro_regioes[macro]['estados'])

    return {
        'fonte': 'complemento_fornecedores.xlsx — coluna Estado(UF)',
        'estados': estados_presentes,
        'por_uf': por_uf,
        'macro_regioes': macro_regioes,
        'nao_informado': nao_informado_bloco,
        'total_fornecedores': int(len(valor_por_forn)),
        'valor_total_geral': round(total_geral, 2),
    }


def compute_period(scope, pmp_por_nome, uf_por_nome, item_idx_ranking):
    total_geral = round(float(scope['VALOR_CONTABIL'].sum()), 2)

    grp = scope.groupby(FORN_COL)
    valor_total = grp['VALOR_CONTABIL'].sum()
    pedidos = grp.size()
    itens_unicos = grp['DESCRICAO_ITEM'].nunique()
    meses_ativos = grp['MES'].nunique()
    grupos_atend = grp['GRUPO'].nunique()
    qtd_comprada = grp['QDE_COMPRADA'].sum()

    grupo_valor = scope.groupby([FORN_COL, 'GRUPO'])['VALOR_CONTABIL'].sum().reset_index()
    # empate de valor entre dois grupos: vence o primeiro na ordem de chave_ordem_grupo (idxmax pega o primeiro da lista)
    grupo_valor = grupo_valor.sort_values([FORN_COL, 'GRUPO'], key=lambda c: c.map(chave_ordem_grupo) if c.name == 'GRUPO' else c, kind='stable').reset_index(drop=True)
    idx = grupo_valor.groupby(FORN_COL)['VALOR_CONTABIL'].idxmax()
    grupo_principal = grupo_valor.loc[idx].set_index(FORN_COL)['GRUPO']

    # Detalhe (fornecedor, grupo) -> valor e (fornecedor, segmento) -> valor,
    # e a lista de itens distintos por fornecedor (como indices no dicionario
    # global `item_idx_ranking`) — junto com Valor Total/Pedidos (ja aditivos
    # acima), isso e' o que permite ao front-end recalcular corretamente
    # Grupo Principal, Valor Princ., Grupos Atend., Itens Unicos e a matriz
    # Fornecedor x Vertical quando o usuario seleciona mais de um mes ao
    # mesmo tempo (Ctrl+clique) — sem isso so daria pra reconstituir com
    # precisao os campos puramente aditivos (Valor Total, Pedidos).
    grupos_valor_por_forn = {}
    for _, r in grupo_valor.iterrows():
        grupos_valor_por_forn.setdefault(r[FORN_COL], {})[r['GRUPO']] = round(float(r['VALOR_CONTABIL']), 2)

    grupo_pedidos = scope.groupby([FORN_COL, 'GRUPO']).size().reset_index(name='PEDIDOS')
    grupos_pedidos_por_forn = {}
    for _, r in grupo_pedidos.iterrows():
        grupos_pedidos_por_forn.setdefault(r[FORN_COL], {})[r['GRUPO']] = int(r['PEDIDOS'])

    segmento_valor = scope.groupby([FORN_COL, 'SEGMENTO'])['VALOR_CONTABIL'].sum().reset_index()
    segmentos_valor_por_forn = {}
    for _, r in segmento_valor.iterrows():
        segmentos_valor_por_forn.setdefault(r[FORN_COL], {})[r['SEGMENTO']] = round(float(r['VALOR_CONTABIL']), 2)

    itens_idx_por_forn = grp['DESCRICAO_ITEM'].apply(
        lambda s: sorted({item_idx_ranking[nome] for nome in s.unique()})
    )

    segmentos_lista = scope.groupby(FORN_COL)['SEGMENTO'].apply(lambda s: ', '.join(sorted(s.unique())))

    rank_df = pd.DataFrame({'Fornecedor': valor_total.index, 'Valor Total': valor_total.values})
    rank_df = rank_df.sort_values('Valor Total', ascending=False).reset_index(drop=True)
    rank_df['Rank'] = rank_df.index + 1
    rank_df['Part. %'] = rank_df['Valor Total'] / total_geral
    rank_df['Acum. %'] = rank_df['Part. %'].cumsum() * 100
    rank_df['Classe'] = rank_df['Acum. %'].apply(classify_abc)
    rank_df['Grupo Principal'] = rank_df['Fornecedor'].map(grupo_principal)
    rank_df['Segmentos'] = rank_df['Fornecedor'].map(segmentos_lista)
    rank_df['Pedidos'] = rank_df['Fornecedor'].map(pedidos)
    rank_df['Itens Únicos'] = rank_df['Fornecedor'].map(itens_unicos)
    rank_df['Ticket Médio'] = rank_df['Valor Total'] / rank_df['Pedidos']
    rank_df['Meses Ativos'] = rank_df['Fornecedor'].map(meses_ativos)
    rank_df['Média Mensal'] = rank_df['Valor Total'] / rank_df['Meses Ativos']
    rank_df['Grupos Atend.'] = rank_df['Fornecedor'].map(grupos_atend)
    rank_df['Qtd. Comprada'] = rank_df['Fornecedor'].map(qtd_comprada)
    rank_df['PMP'] = rank_df['Fornecedor'].map(lambda f: pmp_por_nome.get(norm_nome_fornecedor(f)))
    rank_df['grupos_valor'] = rank_df['Fornecedor'].map(grupos_valor_por_forn)
    rank_df['grupos_pedidos'] = rank_df['Fornecedor'].map(grupos_pedidos_por_forn)
    rank_df['segmentos_valor'] = rank_df['Fornecedor'].map(segmentos_valor_por_forn)
    rank_df['itens_idx'] = rank_df['Fornecedor'].map(itens_idx_por_forn)

    for c in ['Valor Total', 'Ticket Médio', 'Média Mensal', 'Qtd. Comprada']:
        rank_df[c] = rank_df[c].round(2)
    rank_df['Acum. %'] = rank_df['Acum. %'].round(3)

    ranking_full = rank_df[['Rank', 'Fornecedor', 'Classe', 'Grupo Principal', 'Segmentos', 'Valor Total',
                             'Part. %', 'Acum. %', 'Pedidos', 'Itens Únicos', 'Ticket Médio',
                             'Meses Ativos', 'Média Mensal', 'Grupos Atend.', 'PMP',
                             'grupos_valor', 'grupos_pedidos', 'segmentos_valor', 'itens_idx']].to_dict('records')
    # .map() com dict que retorna None vira NaN (coerção de dtype do pandas) —
    # troca de volta por None explicitamente, senão vira "NaN" no JS gerado
    # (literal invalido/confuso), nao um null tratavel no front-end.
    for rec in ranking_full:
        if isinstance(rec['PMP'], float) and pd.isna(rec['PMP']):
            rec['PMP'] = None
        elif rec['PMP'] is not None:
            rec['PMP'] = round(rec['PMP'])

    classe_counts = rank_df['Classe'].value_counts()
    classe_valores = rank_df.groupby('Classe')['Valor Total'].sum()
    top_fornecedor = rank_df.iloc[0]['Fornecedor'] if len(rank_df) else None

    kpis = {
        'total_geral': total_geral,
        'total_fornecedores': int(len(rank_df)),
        'classe_a_qtd': int(classe_counts.get('A', 0)),
        'classe_a_valor': round(float(classe_valores.get('A', 0.0)), 2),
        'classe_b_qtd': int(classe_counts.get('B', 0)),
        'classe_b_valor': round(float(classe_valores.get('B', 0.0)), 2),
        'classe_c_qtd': int(classe_counts.get('C', 0)),
        'classe_c_valor': round(float(classe_valores.get('C', 0.0)), 2),
        'top_fornecedor': top_fornecedor,
    }

    abc_curve = rank_df[['Rank', 'Acum. %', 'Classe']].values.tolist()
    abc_curve = [[int(r[0]), round(float(r[1]), 2), r[2]] for r in abc_curve]

    abc_class_summary = [
        {'Classe': c, 'fornecedores': int(classe_counts.get(c, 0)), 'valor': round(float(classe_valores.get(c, 0.0)), 2)}
        for c in ['A', 'B', 'C']
    ]

    g_valor = scope.groupby('GRUPO')['VALOR_CONTABIL'].sum().sort_values(ascending=False)
    g_fornecedores = scope.groupby('GRUPO')[FORN_COL].nunique()
    g_itens = scope.groupby('GRUPO')['DESCRICAO_ITEM'].nunique()
    g_pedidos = scope.groupby('GRUPO').size()
    g_forn_valor = scope.groupby(['GRUPO', FORN_COL])['VALOR_CONTABIL'].sum().reset_index()
    idxg = g_forn_valor.groupby('GRUPO')['VALOR_CONTABIL'].idxmax()
    g_principal = g_forn_valor.loc[idxg].set_index('GRUPO')
    total_scope = g_valor.sum()

    grupo_rows = []
    cum = 0.0
    for grupo, valor in g_valor.items():
        cum += valor / total_scope * 100
        grupo_rows.append({
            'Grupo': grupo,
            'Valor Total': round(float(valor), 2),
            'Part. %': round(float(valor / total_scope), 4),
            'Acum. %': round(cum, 2),
            'Fornecedores': int(g_fornecedores[grupo]),
            'Itens Únicos': int(g_itens[grupo]),
            'Pedidos': int(g_pedidos[grupo]),
            'Principal Forn.': g_principal.loc[grupo, FORN_COL],
            'Valor Princ.': round(float(g_principal.loc[grupo, 'VALOR_CONTABIL']), 2),
        })

    top20_forn = rank_df.head(20)['Fornecedor'].tolist()
    seg_cols = sorted(scope['SEGMENTO'].unique())
    sub20 = scope[scope[FORN_COL].isin(top20_forn)]
    pivot = sub20.pivot_table(index=FORN_COL, columns='SEGMENTO', values='VALOR_CONTABIL', aggfunc='sum', fill_value=0)
    pivot = pivot.reindex(index=top20_forn, columns=seg_cols, fill_value=0)
    pivot['TOTAL GERAL'] = pivot.sum(axis=1)
    pivot = pivot.reset_index().rename(columns={FORN_COL: 'FORNECEDOR'})
    for c in seg_cols + ['TOTAL GERAL']:
        pivot[c] = pivot[c].round(2)
    seg_matrix = pivot.to_dict('records')

    seg_total = scope.groupby('SEGMENTO')['VALOR_CONTABIL'].sum().round(2).sort_values(ascending=False).reset_index()
    seg_total.columns = ['SEGMENTO', 'VALOR_CONTABIL']
    segmento_total = seg_total.to_dict('records')

    return {
        'kpis': kpis, 'abc_curve': abc_curve, 'abc_class_summary': abc_class_summary,
        'ranking': ranking_full, 'grupo_data': grupo_rows,
        'seg_matrix': seg_matrix, 'seg_cols': seg_cols, 'segmento_total': segmento_total,
        'regionalizacao_uf': compute_regionalizacao_uf(scope, uf_por_nome),
    }


def load_inflacao(kpis_path, months):
    """Serie de inflacao mensal, para referencia no grafico de Evolucao de
    Preco. Vem de base-KPIs.xlsx (mesma fonte do modulo de Indicadores
    Estrategicos) — hoje so tem valor a partir de Abr/2026, entao
    'meses_cobertos' pode nao cobrir o periodo inteiro da base de
    fornecedores. O front-end decide exibir a linha de referencia so
    quando o periodo filtrado esta INTEIRAMENTE dentro de meses_cobertos."""
    if not os.path.exists(kpis_path):
        print(f"AVISO: planilha de KPIs nao encontrada em '{kpis_path}' — serie de inflacao ficara indisponivel.")
        return {'disponivel': False, 'valores': {}, 'meses_cobertos': []}
    xls = pd.ExcelFile(kpis_path)
    kdf = pd.read_excel(kpis_path, sheet_name=xls.sheet_names[0])
    kdf.columns = ['MES', 'INFLACAO', 'PMP', 'DIO', 'COTACAO', 'CONTRATOS', 'CMV']
    kdf['MES'] = pd.to_datetime(kdf['MES']).dt.strftime('%Y-%m')
    valores = {}
    for _, r in kdf.iterrows():
        if pd.notna(r['INFLACAO']) and r['MES'] in months:
            valores[r['MES']] = round(float(r['INFLACAO']) * 100, 2)
    return {'disponivel': len(valores) > 0, 'valores': valores, 'meses_cobertos': sorted(valores.keys())}


def compute_melhor_preco(df, itens_relevantes, item_unidade_canonica):
    """Para cada item relevante, por mes, o menor preco medio ponderado
    entre fornecedores que QUALIFICAM como referencia (>= SAVING_MIN_COMPRAS
    compras e >= SAVING_MIN_DIAS dias de janela, no historico completo do
    par fornecedor+item, usando so linhas na unidade canonica do item).
    Retorna {(cod_item, mes): (preco, fornecedor)}."""
    sub = df[df[ITEM_COL].isin(itens_relevantes) & df['_IS_CANONICAL']]
    if sub.empty:
        return {}

    qg = sub.groupby([ITEM_COL, FORN_COL])
    n_compras = qg.size()
    span_dias = qg['DATA_LANCAMENTO'].agg(lambda s: (s.max() - s.min()).days)
    qualifica = (n_compras >= SAVING_MIN_COMPRAS) & (span_dias >= SAVING_MIN_DIAS)
    qualifica_set = set(qualifica[qualifica].index)
    if not qualifica_set:
        return {}

    sub_idx = sub.set_index([ITEM_COL, FORN_COL]).index
    sub2 = sub[sub_idx.isin(qualifica_set)]
    mg = sub2.groupby([ITEM_COL, 'MES', FORN_COL]).agg(
        valor=('VALOR_CONTABIL', 'sum'), qtd=('QDE_COMPRADA', 'sum')
    ).reset_index()
    mg = mg[mg['qtd'] > 0]
    mg['preco'] = mg['valor'] / mg['qtd']

    melhor = {}
    for (cod, mes), grupo in mg.groupby([ITEM_COL, 'MES']):
        row = grupo.loc[grupo['preco'].idxmin()]
        melhor[(cod, mes)] = (float(row['preco']), row[FORN_COL])
    return melhor


def compute_itens_fornecedor(df, months, month_labels, kpis_path, ranking_all):
    """Pre-computo completo da aba 'Itens por Fornecedor'. Tudo pesado
    acontece aqui — o front-end so filtra/agrega o que ja vem pronto."""
    print("\n--- Itens por Fornecedor: pre-computo ---")
    valor_total_df = float(df['VALOR_CONTABIL'].sum())

    # ---- 1) Unidade canonica por item ----
    vi = df.groupby([ITEM_COL, 'UM'])['VALOR_CONTABIL'].sum().reset_index()
    valor_item_total = df.groupby(ITEM_COL)['VALOR_CONTABIL'].sum()
    vi['share'] = vi.apply(lambda r: r['VALOR_CONTABIL'] / valor_item_total[r[ITEM_COL]], axis=1)
    dominante = vi.loc[vi.groupby(ITEM_COL)['share'].idxmax()].set_index(ITEM_COL)

    item_unidade_canonica = {}
    itens_sem_dominante = set()
    for cod, row in dominante.iterrows():
        if row['share'] >= UM_DOMINANCIA_MINIMA:
            item_unidade_canonica[cod] = row['UM']
        else:
            itens_sem_dominante.add(cod)

    df = df.copy()
    df['_UNIDADE_CANONICA_ITEM'] = df[ITEM_COL].map(item_unidade_canonica)
    df['_IS_CANONICAL'] = df['UM'] == df['_UNIDADE_CANONICA_ITEM']

    n_itens_total = int(df[ITEM_COL].nunique())
    valor_sem_metrica = float(df[df[ITEM_COL].isin(itens_sem_dominante)]['VALOR_CONTABIL'].sum())
    valor_minoria_excluida = float(df[(~df['_IS_CANONICAL']) & (df[ITEM_COL].isin(item_unidade_canonica.keys()))]['VALOR_CONTABIL'].sum())

    # ---- 2) Universo de fornecedores (uniao dos top N por criterio) ----
    g = df.groupby(FORN_COL)
    resumo_forn_full = pd.DataFrame({
        'valor': g['VALOR_CONTABIL'].sum(),
        'nfs': g['N. NOTA'].nunique(),
        'casas': g['FANTASIA'].nunique(),
        'itens': g[ITEM_COL].nunique(),
    })
    uniao = set()
    for col in ['valor', 'nfs', 'casas', 'itens']:
        uniao |= set(resumo_forn_full.sort_values(col, ascending=False).head(TOP_N_UNIAO).index)
    uniao = sorted(uniao)
    forn_idx = {f: i for i, f in enumerate(uniao)}

    classe_by_forn = {r['Fornecedor']: r['Classe'] for r in ranking_all}

    mensal_forn = df[df[FORN_COL].isin(uniao)].groupby([FORN_COL, 'MES'])['VALOR_CONTABIL'].sum()
    fornecedores_resumo = []
    for forn in uniao:
        sparkline = [round(float(mensal_forn.get((forn, m), 0.0)), 2) for m in months]
        fornecedores_resumo.append({
            'fornecedor': forn,
            'valor': round(float(resumo_forn_full.loc[forn, 'valor']), 2),
            'nfs': int(resumo_forn_full.loc[forn, 'nfs']),
            'casas': int(resumo_forn_full.loc[forn, 'casas']),
            'itens': int(resumo_forn_full.loc[forn, 'itens']),
            'classe': classe_by_forn.get(forn, 'C'),
            'sparkline': sparkline,
        })

    # ---- 3) Itens relevantes (vendidos por algum fornecedor da uniao) ----
    itens_relevantes = sorted(df[df[FORN_COL].isin(uniao)][ITEM_COL].unique().tolist())
    item_idx = {c: i for i, c in enumerate(itens_relevantes)}
    unidades_set = sorted(set(item_unidade_canonica.values()))
    unidade_idx = {u: i for i, u in enumerate(unidades_set)}

    n_forn_por_item_all = df.groupby(ITEM_COL)[FORN_COL].nunique().to_dict()
    desc_por_item = df.groupby(ITEM_COL)['DESCRICAO_ITEM'].agg(lambda s: s.value_counts().idxmax()).to_dict()
    grupo_por_item = df.groupby(ITEM_COL)['GRUPO'].agg(lambda s: s.value_counts().idxmax()).to_dict()

    # ---- 4) Melhor preco praticado (global, entre TODOS os fornecedores) ----
    melhor_por_item_mes = compute_melhor_preco(df, set(itens_relevantes), item_unidade_canonica)

    # ---- 5) Estatisticas full-history por par (forn,item), so linhas canonicas ----
    df_canon = df[df['_IS_CANONICAL']].copy()
    df_canon['PRECO_UNITARIO'] = df_canon['VALOR_CONTABIL'] / df_canon['QDE_COMPRADA']
    df_canon_pairs = df_canon[df_canon[FORN_COL].isin(uniao)]

    stats_grp = df_canon_pairs.groupby([FORN_COL, ITEM_COL])['PRECO_UNITARIO']
    preco_mediana_d = stats_grp.median().to_dict()
    preco_min_d = stats_grp.min().to_dict()
    preco_max_d = stats_grp.max().to_dict()
    preco_mean_d = stats_grp.mean().to_dict()
    preco_std_d = stats_grp.std().to_dict()

    def calc_tendencia(sub):
        sub = sub.sort_values('DATA_LANCAMENTO')
        n = len(sub)
        if n < 2:
            return None
        idx1 = max(1, n // 3)
        idx2 = max(idx1 + 1, n - n // 3)
        primeiro, ultimo = sub.iloc[:idx1], sub.iloc[idx2:]
        if primeiro.empty or ultimo.empty:
            return None
        q1, q2 = primeiro['QDE_COMPRADA'].sum(), ultimo['QDE_COMPRADA'].sum()
        if q1 <= 0 or q2 <= 0:
            return None
        p1, p2 = primeiro['VALOR_CONTABIL'].sum() / q1, ultimo['VALOR_CONTABIL'].sum() / q2
        if p1 <= 0:
            return None
        return round(100 * (p2 - p1) / p1, 1)

    tendencia_by_pair = {(forn, cod): calc_tendencia(sub) for (forn, cod), sub in df_canon_pairs.groupby([FORN_COL, ITEM_COL])}

    # ---- 6) Series mensais por par (valor/nfs/casas de TODAS as linhas; qtd/preco so canonicas) ----
    pairs_all = df[df[FORN_COL].isin(uniao) & df[ITEM_COL].isin(itens_relevantes)]
    valor_mensal_d = pairs_all.groupby([FORN_COL, ITEM_COL, 'MES'])['VALOR_CONTABIL'].sum().to_dict()
    nfs_mensal_d = pairs_all.groupby([FORN_COL, ITEM_COL, 'MES'])['N. NOTA'].nunique().to_dict()
    casas_mensal_d = pairs_all.groupby([FORN_COL, ITEM_COL, 'MES'])['FANTASIA'].nunique().to_dict()
    canon_mensal = df_canon_pairs.groupby([FORN_COL, ITEM_COL, 'MES']).agg(
        valor_c=('VALOR_CONTABIL', 'sum'), qtd_c=('QDE_COMPRADA', 'sum')
    )
    canon_valor_d = canon_mensal['valor_c'].to_dict()
    canon_qtd_d = canon_mensal['qtd_c'].to_dict()

    # Casas que compraram cada par, ao longo de todo o periodo disponivel (nao
    # so do mes) — usado pelo filtro de Casa/Unidade no front-end. E' uma
    # lista de casas (nao um detalhe mes a mes), entao filtrar por casa
    # restringe a QUAIS pares aparecem, mas os valores/quantidades exibidos
    # continuam sendo do fornecedor/item inteiro (todas as casas), nao so da
    # casa selecionada — essa limitacao fica no rodape de metodologia.
    casas_relevantes = sorted(pairs_all['FANTASIA'].unique().tolist())
    casa_idx_map = {c: i for i, c in enumerate(casas_relevantes)}
    casas_por_par = pairs_all.groupby([FORN_COL, ITEM_COL])['FANTASIA'].agg(lambda s: sorted(set(s))).to_dict()

    # ---- 7) Monta os pares ----
    pares = []
    pares_com_preco = 0
    saving_total_teorico = 0.0
    itens_single_source = set()

    for forn, cod in sorted(pairs_all.groupby([FORN_COL, ITEM_COL]).groups.keys()):
        tem_preco = cod in item_unidade_canonica
        n_forn_item = int(n_forn_por_item_all.get(cod, 1))
        if n_forn_item <= 1:
            itens_single_source.add(cod)

        pmed = preco_mediana_d.get((forn, cod))
        pmin = preco_min_d.get((forn, cod))
        pmax = preco_max_d.get((forn, cod))
        pmean = preco_mean_d.get((forn, cod))
        pstd = preco_std_d.get((forn, cod))
        volat = round(pstd / pmean, 3) if (pstd is not None and pmean and pmean > 0 and pd.notna(pstd)) else None

        mensal = []
        for mi, mes in enumerate(months):
            valor_m = valor_mensal_d.get((forn, cod, mes))
            if valor_m is None:
                continue
            nfs_m = int(nfs_mensal_d.get((forn, cod, mes), 0))
            casas_m = int(casas_mensal_d.get((forn, cod, mes), 0))
            qtd_m = preco_m = melhor_m = saving_m = None
            if tem_preco:
                qc = canon_qtd_d.get((forn, cod, mes))
                vc = canon_valor_d.get((forn, cod, mes))
                if qc and qc > 0:
                    qtd_m = round(float(qc), 3)
                    preco_m = round(float(vc / qc), 4)
                    bm = melhor_por_item_mes.get((cod, mes))
                    if bm is not None:
                        melhor_preco_val, _melhor_forn = bm
                        melhor_m = round(melhor_preco_val, 4)
                        saving_m = round(max(0.0, (preco_m - melhor_preco_val)) * qc, 2)
                        saving_total_teorico += saving_m
            mensal.append([mi, round(float(valor_m), 2), qtd_m, preco_m, nfs_m, casas_m, melhor_m, saving_m])

        if not mensal:
            continue
        if tem_preco:
            pares_com_preco += 1

        casas_idx = [casa_idx_map[c] for c in casas_por_par.get((forn, cod), [])]

        # Formato compacto (array, nao dict) — ordem documentada em PARES_COLS.
        pares.append([
            forn_idx[forn], item_idx[cod],
            1 if tem_preco else 0,
            unidade_idx[item_unidade_canonica[cod]] if tem_preco else None,
            round(pmed, 4) if pmed is not None and pd.notna(pmed) else None,
            round(pmin, 4) if pmin is not None and pd.notna(pmin) else None,
            round(pmax, 4) if pmax is not None and pd.notna(pmax) else None,
            volat,
            tendencia_by_pair.get((forn, cod)),
            n_forn_item,
            casas_idx,
            mensal,
        ])

    melhor_preco_detalhe = []
    for (cod, mes), (preco, forn) in melhor_por_item_mes.items():
        if cod in item_idx and mes in months:
            melhor_preco_detalhe.append([item_idx[cod], months.index(mes), round(preco, 4), forn])

    itens_meta = []
    for cod in itens_relevantes:
        itens_meta.append({
            'cod_item': int(cod),
            'descricao': desc_por_item.get(cod, ''),
            'grupo': grupo_por_item.get(cod, ''),
            'unidade_idx': unidade_idx.get(item_unidade_canonica.get(cod)) if cod in item_unidade_canonica else None,
            'tem_preco': cod in item_unidade_canonica,
            'n_fornecedores': int(n_forn_por_item_all.get(cod, 1)),
        })

    inflacao = load_inflacao(kpis_path, months)

    qualidade = {
        'itens_total_base': n_itens_total,
        'itens_com_unidade_dominante': len(item_unidade_canonica),
        'itens_sem_unidade_dominante': len(itens_sem_dominante),
        'valor_sem_metrica_preco': round(valor_sem_metrica, 2),
        'valor_sem_metrica_preco_pct': round(100 * valor_sem_metrica / valor_total_df, 1) if valor_total_df else 0.0,
        'valor_minoria_excluida': round(valor_minoria_excluida, 2),
        'valor_minoria_excluida_pct': round(100 * valor_minoria_excluida / valor_total_df, 3) if valor_total_df else 0.0,
        'fornecedores_uniao': len(uniao),
        'itens_relevantes': len(itens_relevantes),
        'itens_single_source': len(itens_single_source),
        'pares_totais': len(pares),
        'pares_com_preco': pares_com_preco,
        'pares_sem_preco': len(pares) - pares_com_preco,
        'saving_total_teorico': round(saving_total_teorico, 2),
        'agrupamentos_por_descricao': 0,
    }

    print(f"Itens: {n_itens_total} | com unidade dominante: {len(item_unidade_canonica)} | "
          f"sem unidade dominante (preco suprimido): {len(itens_sem_dominante)} "
          f"({qualidade['valor_sem_metrica_preco_pct']}% do valor)")
    print(f"Valor em linhas minoritarias excluidas (itens com unidade dominante): "
          f"R$ {valor_minoria_excluida:,.2f} ({qualidade['valor_minoria_excluida_pct']}% do valor)")
    print(f"Fornecedores na uniao (top {TOP_N_UNIAO} por 4 criterios): {len(uniao)} | "
          f"itens relevantes: {len(itens_relevantes)} | pares fornecedor-item: {len(pares)} "
          f"(com preco: {pares_com_preco} | sem preco: {len(pares) - pares_com_preco})")
    print(f"Itens single-source (1 fornecedor so): {len(itens_single_source)}")
    print(f"Saving potencial teorico (soma de todos os pares/meses): R$ {saving_total_teorico:,.2f}")
    print(f"Serie de inflacao: {'disponivel' if inflacao['disponivel'] else 'indisponivel'} "
          f"(meses cobertos: {inflacao['meses_cobertos']})")

    return {
        'meses': months,
        'month_labels': month_labels,
        'dict_fornecedores': uniao,
        'dict_itens_cod': [int(c) for c in itens_relevantes],
        'dict_unidades': unidades_set,
        'itens_meta': itens_meta,
        'fornecedores_resumo': fornecedores_resumo,
        'valor_total_grupo': round(valor_total_df, 2),
        'total_fornecedores_grupo': int(df[FORN_COL].nunique()),
        'dict_casas': casas_relevantes,
        'pares': pares,
        'pares_cols': ['forn_idx', 'item_idx', 'tem_preco', 'unidade_idx', 'preco_mediana', 'preco_min',
                       'preco_max', 'volatilidade', 'tendencia_pct', 'n_fornecedores_item', 'casas_idx', 'mensal'],
        'pares_mensal_cols': ['mes_idx', 'valor', 'qtd', 'preco', 'nfs', 'casas', 'melhor_preco', 'saving'],
        'melhor_preco_detalhe': melhor_preco_detalhe,
        'melhor_preco_detalhe_cols': ['item_idx', 'mes_idx', 'preco', 'fornecedor'],
        'inflacao': inflacao,
        'qualidade': qualidade,
        'config': {
            'um_dominancia_minima': UM_DOMINANCIA_MINIMA,
            'top_n_uniao': TOP_N_UNIAO,
            'saving_min_compras': SAVING_MIN_COMPRAS,
            'saving_min_dias': SAVING_MIN_DIAS,
        },
    }


def main():
    input_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE_DIR, 'base-raw-compras.xlsx')
    complemento_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(BASE_DIR, 'complemento_fornecedores.xlsx')
    kpis_path = sys.argv[3] if len(sys.argv) > 3 else os.path.join(BASE_DIR, 'base-KPIs.xlsx')
    if not os.path.exists(input_path):
        print(f"ERRO: arquivo nao encontrado: {input_path}")
        print('Uso: python build_data.py "caminho/para/base-raw-compras.xlsx" '
              '["caminho/para/complemento_fornecedores.xlsx"] ["caminho/para/base-KPIs.xlsx"]')
        sys.exit(1)

    print(f"Lendo (planilha bruta): {input_path}")
    base = raw_to_consolidada(input_path, extra_columns=['N. NOTA', 'COD ITEM', 'UM'])
    print(f"Transformado em base consolidada: {len(base)} linhas")

    exclude_norm = set(norm(g) for g in EXCLUDE_GRUPOS_RAW)
    base['_grupo_norm'] = base['GRUPO'].apply(norm)
    excluded_real = sorted(base[base['_grupo_norm'].isin(exclude_norm)]['GRUPO'].unique().tolist())
    df = base[~base['_grupo_norm'].isin(exclude_norm)].copy().drop(columns=['_grupo_norm'])

    # ---- Complemento de fornecedores (PMP + Estado/UF), por nome ----
    print(f"Lendo complemento de fornecedores: {complemento_path}")
    pmp_por_nome, uf_por_nome = load_complemento_fornecedores(complemento_path)

    fornecedores_do_grupo = sorted(df[FORN_COL].unique().tolist())
    n_forn = len(fornecedores_do_grupo)
    com_pmp = sum(1 for f in fornecedores_do_grupo if pmp_por_nome.get(norm_nome_fornecedor(f)) is not None)
    com_uf = sum(1 for f in fornecedores_do_grupo if uf_por_nome.get(norm_nome_fornecedor(f)) is not None)
    valor_por_forn_total = df.groupby(FORN_COL)['VALOR_CONTABIL'].sum()
    valor_total_geral = float(valor_por_forn_total.sum())
    valor_com_pmp = float(sum(v for f, v in valor_por_forn_total.items() if pmp_por_nome.get(norm_nome_fornecedor(f)) is not None))
    valor_com_uf = float(sum(v for f, v in valor_por_forn_total.items() if uf_por_nome.get(norm_nome_fornecedor(f)) is not None))
    complemento_qualidade = {
        'fonte': 'raw-data/complemento_fornecedores.xlsx',
        'fornecedores_total': n_forn,
        'fornecedores_com_pmp': com_pmp,
        'fornecedores_sem_pmp': n_forn - com_pmp,
        'valor_com_pmp_pct': round(100 * valor_com_pmp / valor_total_geral, 1) if valor_total_geral else 0.0,
        'fornecedores_com_uf': com_uf,
        'fornecedores_sem_uf': n_forn - com_uf,
        'valor_com_uf_pct': round(100 * valor_com_uf / valor_total_geral, 1) if valor_total_geral else 0.0,
    }
    print(f"Complemento de fornecedores: {com_pmp}/{n_forn} fornecedores com PMP "
          f"({complemento_qualidade['valor_com_pmp_pct']}% do valor), "
          f"{com_uf}/{n_forn} com UF confiavel ({complemento_qualidade['valor_com_uf_pct']}% do valor).")

    months = sorted(df['MES'].astype(str).unique())
    month_labels = {m: month_label(m) for m in months}

    print(f"Meses encontrados: {months}")
    print(f"Grupos excluidos: {excluded_real}")

    # Dicionario global de itens (nome -> indice), construido uma unica vez
    # sobre TODA a base — garante que o mesmo item tenha sempre o mesmo
    # indice em qualquer periodo, para o front-end poder cruzar `itens_idx`
    # de meses diferentes na selecao multipla de periodo.
    dict_itens_ranking = sorted(df['DESCRICAO_ITEM'].dropna().unique().tolist())
    item_idx_ranking = {nome: i for i, nome in enumerate(dict_itens_ranking)}

    # Mapa fornecedor -> UF (ou 'NAO_INFORMADO'), period-independente (a UF
    # de um fornecedor nao muda de mes para mes) — construido uma unica vez
    # sobre todo o universo de fornecedores do grupo, para o front-end poder
    # recalcular a Regionalizacao para qualquer selecao de meses sem precisar
    # de uma copia da logica por periodo.
    forn_uf_map = {f: (uf_por_nome.get(norm_nome_fornecedor(f)) or 'NAO_INFORMADO') for f in fornecedores_do_grupo}

    periods = {'ALL': compute_period(df, pmp_por_nome, uf_por_nome, item_idx_ranking)}
    for m in months:
        periods[m] = compute_period(df[df['MES'].astype(str) == m], pmp_por_nome, uf_por_nome, item_idx_ranking)

    itens_fornecedor = compute_itens_fornecedor(df, months, month_labels, kpis_path, periods['ALL']['ranking'])

    monthly_total = df.groupby('MES')['VALOR_CONTABIL'].sum().round(2).reset_index().sort_values('MES').to_dict('records')

    top_grupos = df.groupby('GRUPO')['VALOR_CONTABIL'].sum().sort_values(ascending=False).head(8).index.tolist()
    mg = df.groupby(['MES', 'GRUPO'])['VALOR_CONTABIL'].sum().reset_index()
    mg['GRUPO2'] = mg['GRUPO'].where(mg['GRUPO'].isin(top_grupos), 'OUTROS')
    mg_agg = mg.groupby(['MES', 'GRUPO2'])['VALOR_CONTABIL'].sum().round(2).reset_index()
    mg_pivot = mg_agg.pivot(index='MES', columns='GRUPO2', values='VALOR_CONTABIL').fillna(0).reset_index()
    monthly_grupo_records = mg_pivot.to_dict('records')
    monthly_grupo_cols = sorted((c for c in mg_pivot.columns if c != 'MES'), key=chave_ordem_grupo)

    ms = df.groupby(['MES', 'SEGMENTO'])['VALOR_CONTABIL'].sum().reset_index()
    ms_pivot = ms.pivot(index='MES', columns='SEGMENTO', values='VALOR_CONTABIL').fillna(0).round(2).reset_index()
    monthly_segmento_records = ms_pivot.to_dict('records')
    monthly_segmento_cols = [c for c in ms_pivot.columns if c != 'MES']

    from datetime import datetime
    data = {
        'month_labels': month_labels,
        'months_order': months,
        'periods': periods,
        'monthly_total': monthly_total,
        'monthly_grupo_records': monthly_grupo_records,
        'monthly_grupo_cols': monthly_grupo_cols,
        'monthly_segmento_records': monthly_segmento_records,
        'monthly_segmento_cols': monthly_segmento_cols,
        'gerado_em': datetime.now().strftime('%d/%m/%Y'),
        'excluded_grupos': excluded_real,
        'complemento_fornecedores_qualidade': complemento_qualidade,
        'itens_fornecedor': itens_fornecedor,
        'dict_itens_ranking': dict_itens_ranking,
        'forn_uf_map': forn_uf_map,
    }

    out_path = os.path.join(BASE_DIR, 'data.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('// Dados gerados automaticamente por build_data.py — NAO EDITAR MANUALMENTE\n')
        f.write(f"// Gerado em: {data['gerado_em']} | Fonte: {os.path.basename(input_path)}\n")
        f.write('const DASHBOARD_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'), default=str) + ';\n')

    print(f"OK -> {out_path} atualizado com sucesso.")
    print(f"Total geral (todos os meses): R$ {data['periods']['ALL']['kpis']['total_geral']:,.2f}")
    print(f"Fornecedores (todos os meses): {data['periods']['ALL']['kpis']['total_fornecedores']}")


if __name__ == '__main__':
    main()

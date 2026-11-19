"""
Modulo compartilhado de ETL do Portal de Compras.

Transforma a planilha bruta de notas fiscais (uma linha por item de nota,
com CNPJ, numero de nota, impostos, CFOP etc — tipicamente chamada
"base-raw-compras.xlsx" ou similar) na "base consolidada" que os modulos
de Fornecedores, Indicadores e Analise de Itens usam para
calcular suas metricas.

Isso elimina o passo manual que existia antes (rodar um script a parte para
gerar uma "base-consolidada" e so entao alimentar os modulos): agora cada
modulo chama `raw_to_consolidada()` diretamente sobre a planilha bruta.

Mapeamento de colunas (bruto -> consolidado), confirmado empiricamente
comparando os totais agregados com a base consolidada anterior (diferenca
< 0.01% no valor total e na contagem de linhas do mesmo periodo):

    CASAS               -> FANTASIA
    SEGMENTO            -> SEGMENTO
    GRUPO               -> GRUPO
    SUBGRUPO            -> SUBGRUPO
    DESCRICAO ITEM      -> DESCRICAO_ITEM
    RAZAO FORNECEDOR    -> RAZAO FORNECEDOR
    DATA LANCAMENTO     -> DATA_LANCAMENTO (tambem usada para derivar MES)
    QDE. COMPRADA       -> QDE_COMPRADA
    V. CONTABIL NF      -> VALOR_CONTABIL

Se a planilha de origem mudar de layout, ajuste apenas o dicionario
COLUMN_MAP e, se necessario, o nome da aba em `RAW_SHEET_CANDIDATES` abaixo.

Alem do mapeamento de colunas, `raw_to_consolidada()` tambem aplica — nessa
ordem, SEMPRE, antes de devolver o DataFrame para qualquer modulo — as
seguintes etapas:

  1. `padronizar_fornecedores()` — consolida variacoes de nome do mesmo
     fornecedor (ex: "DISTRIB. VETAMON LTDA" -> "DISTRIBUIDORA VETAMON LTDA") na coluna RAZAO FORNECEDOR.
  2. Remove os fornecedores em `FORNECEDORES_EXCLUIDOS` (ex: "QUINTALUZ
     CENTRAL DE PRODUCAO LTDA" — a central de producao do proprio grupo,
     transacao intercompany, nao fornecedor externo real).
  3. `tratar_dados_pre_analise()` — pequenos ajustes de categorizacao
     (GRUPOS_RENOMEADOS: GRUPO "MERCEARIA SECA" -> "MERCEARIA"; item "POLVO" reclassificado
     para GRUPO "PROTEINAS" / SUBGRUPO "PESCADOS"; itens com nomes diferentes
     que sao o mesmo item sao unificados sob um unico nome — ver
     `ITENS_UNIFICADOS`).

Isso garante que Fornecedores, Indicadores e Analise de Itens
sempre enxerguem os mesmos nomes/categorias padronizados, sem precisar
repetir esse tratamento em cada `build_data.py`.
"""
import json
import os
import re
import pandas as pd

COLUMN_MAP = {
    'CASAS': 'FANTASIA',
    'SEGMENTO': 'SEGMENTO',
    'GRUPO': 'GRUPO',
    'SUBGRUPO': 'SUBGRUPO',
    'DESCRICAO ITEM': 'DESCRICAO_ITEM',
    'RAZAO FORNECEDOR': 'RAZAO FORNECEDOR',
    'DATA LANCAMENTO': 'DATA_LANCAMENTO',
    'QDE. COMPRADA': 'QDE_COMPRADA',
    'V. CONTABIL NF': 'VALOR_CONTABIL',
}

REQUIRED_RAW_COLUMNS = list(COLUMN_MAP.keys())


# ============================================================
# PADRONIZACAO DE FORNECEDORES
# ============================================================
# Executada SEMPRE dentro de raw_to_consolidada(), antes de qualquer
# agrupamento, calculo, ranking, dashboard ou geracao de abas nos modulos
# que consomem essa base. Opera sobre valores ja em maiusculas (o proprio
# raw_to_consolidada aplica .str.upper().str.strip() na coluna
# RAZAO FORNECEDOR antes de chamar padronizar_fornecedores()).
# ============================================================
_MAPA_EXATO = {
    # Variantes de grafia dos fornecedores ficticios da base sintetica (scripts/gerar_dados_sinteticos.py, ANCORAS)
    "FRIGORIFICO BARILO S A": "FRIGORIFICO BARILO S/A",
    "FRIGORIFICO BARILO SA - FILIAL 2": "FRIGORIFICO BARILO S/A",
    "DISTRIB. VETAMON LTDA": "DISTRIBUIDORA VETAMON LTDA",
    "DISTRIBUIDORA VETAMON LTDA.": "DISTRIBUIDORA VETAMON LTDA",
    "LATICINIOS QUIRANA LTDA - MATRIZ": "LATICINIOS QUIRANA LTDA",
}


# ============================================================
# FORNECEDORES EXCLUIDOS DE TODAS AS ANALISES
# ============================================================
# Fornecedores que na verdade sao a propria marca (transacoes intercompany),
# nao fornecedores externos reais — nao devem contar em nenhuma analise de
# compras do portal. Removidos aqui (apos padronizar_fornecedores(), com o
# nome ja normalizado) para que a exclusao valha automaticamente para todos
# os modulos que chamam raw_to_consolidada(), sem precisar repetir em cada
# build_data.py.
FORNECEDORES_EXCLUIDOS = [
    'QUINTALUZ CENTRAL DE PRODUCAO LTDA',
]


def padronizar_fornecedores(df):
    """
    Consolida variacoes de nome na coluna RAZAO FORNECEDOR.
    Regras (aplicadas em ordem):
      1. Qualquer nome que contenha a substring "LUPULAR" (filiais e
         distribuidoras da mesma cervejaria) e substituido integralmente
         por "CERVEJARIA LUPULAR S/A".
      2. Nomes com correspondencia exata no _MAPA_EXATO sao substituidos
         pelo valor mapeado.
    Retorna o DataFrame com a coluna corrigida.
    """
    col = "RAZAO FORNECEDOR"
    if col not in df.columns:
        return df
    mascara_lupular = df[col].str.contains(r"LUPULAR", case=False, na=False)
    df.loc[mascara_lupular, col] = "CERVEJARIA LUPULAR S/A"
    df[col] = df[col].replace(_MAPA_EXATO)
    return df


# ============================================================
# NOME EXIBIDO DAS CATEGORIAS (GRUPO)
# ============================================================
# nome como vem na planilha bruta -> nome exibido em TODO o portal. E o unico ponto onde o nome de uma categoria e
# definido: para renomear outra, acrescente uma entrada aqui e reconstrua os modulos (ver README, "Rotina semanal").
# Varias origens podem apontar para o mesmo nome (a base traz "MERCEARIA" e "MERCEARIA SECA" para a mesma categoria).
GRUPOS_RENOMEADOS = {
    'MERCEARIA': 'MERCEARIA',
    'MERCEARIA SECA': 'MERCEARIA',
}

# Ordem das categorias que dependem do nome so para ordenar (series e cores do grafico de evolucao mensal, desempate de
# "Grupo Principal"): categoria renomeada -> nome que ela tinha antes, para a renomeacao nao trocar cor nem desempate.
GRUPOS_ORDEM_ANTERIOR = {}


def chave_ordem_grupo(nome):
    return GRUPOS_ORDEM_ANTERIOR.get(nome, nome)


# ============================================================
# ITENS COM NOMES DIFERENTES QUE SAO O MESMO ITEM
# ============================================================
# nome canonico -> lista de nomes (como vem na planilha bruta) que passam a se chamar assim em TODAS as analises.
# Para unificar mais itens, acrescente uma entrada aqui e reconstrua os modulos (ver README, "Rotina semanal").
# A comparacao ignora caixa e espacos extras. Quando a coluna 'COD ITEM' foi pedida (extra_columns), os nomes
# unificados tambem passam a usar o codigo do item canonico, para o item nao aparecer com dois codigos.
ITENS_UNIFICADOS = {
    'FILE MIGNON BOVINO PECA': [
        'FILE MIGNON BOVINO',
        '(MP) FILE MIGNON BOVINO PECA',
    ],
}


def _chave_item(x):
    return re.sub(r'\s+', ' ', str(x).upper().strip())


def unificar_itens(df):
    """Renomeia, em DESCRICAO_ITEM, os itens de `ITENS_UNIFICADOS` para o nome canonico (e alinha 'COD ITEM', se houver).
    Nao altera valores, quantidades nem GRUPO/SUBGRUPO das linhas."""
    if 'DESCRICAO_ITEM' not in df.columns:
        return df
    chaves = df['DESCRICAO_ITEM'].map(_chave_item)
    for canonico, nomes in ITENS_UNIFICADOS.items():
        alvo = {_chave_item(n) for n in nomes} | {_chave_item(canonico)}
        mascara = chaves.isin(alvo)
        if not mascara.any():
            continue
        if 'COD ITEM' in df.columns:
            ja_canonico = df.loc[chaves == _chave_item(canonico), 'COD ITEM'].dropna()
            if len(ja_canonico):
                df.loc[mascara, 'COD ITEM'] = ja_canonico.mode().iloc[0]
        df.loc[mascara, 'DESCRICAO_ITEM'] = canonico
        chaves = df['DESCRICAO_ITEM'].map(_chave_item)
    return df


# ============================================================
# TRATAMENTOS DE DADOS PRE-ANALISE
# ============================================================
def tratar_dados_pre_analise(df):
    """
    Aplica tratamentos especificos nos dados antes de qualquer analise.
    Regras:
      1. Atualiza a coluna 'GRUPO' conforme GRUPOS_RENOMEADOS: 'MERCEARIA' e 'MERCEARIA SECA'
         (variantes encontradas na base bruta) -> 'MERCEARIA' (nome exibido no portal).
      2. Trata o item 'POLVO': se 'DESCRICAO_ITEM' == 'POLVO', define
         'GRUPO' = 'PROTEINAS' e 'SUBGRUPO' = 'PESCADOS'. Sobrescreve
         valores existentes.
      3. Unifica itens com nomes diferentes que sao o mesmo item
         (`ITENS_UNIFICADOS`, ex.: os tres nomes do file mignon em peca).
    """
    df = unificar_itens(df)
    if "GRUPO" in df.columns:
        df["GRUPO"] = df["GRUPO"].replace(GRUPOS_RENOMEADOS)

    if "DESCRICAO_ITEM" in df.columns and "GRUPO" in df.columns and "SUBGRUPO" in df.columns:
        mascara_polvo = df["DESCRICAO_ITEM"] == "POLVO"
        if mascara_polvo.any():
            df.loc[mascara_polvo, "GRUPO"] = "PROTEINAS"
            df.loc[mascara_polvo, "SUBGRUPO"] = "PESCADOS"

    return df


def _pick_sheet(path):
    """Escolhe a aba a usar: se so houver uma aba, usa ela; caso contrario,
    procura por um nome que contenha as colunas esperadas."""
    xls = pd.ExcelFile(path)
    if len(xls.sheet_names) == 1:
        return xls.sheet_names[0]
    for name in xls.sheet_names:
        cols = pd.read_excel(path, sheet_name=name, nrows=0).columns.tolist()
        if all(c in cols for c in REQUIRED_RAW_COLUMNS):
            return name
    # fallback: primeira aba
    return xls.sheet_names[0]


_MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
PORTAL_META_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shared', 'portal-meta.js')


def _rotulo_periodo(primeiro, ultimo):
    """'2026-01','2026-08' -> 'Jan – Ago 2026'; anos diferentes -> 'Nov 2025 – Ago 2026'."""
    ay, am = int(primeiro[:4]), int(primeiro[5:7])
    by, bm = int(ultimo[:4]), int(ultimo[5:7])
    if (ay, am) == (by, bm):
        return f"{_MESES_ABREV[bm - 1]} {by}"
    if ay == by:
        return f"{_MESES_ABREV[am - 1]} – {_MESES_ABREV[bm - 1]} {by}"
    return f"{_MESES_ABREV[am - 1]} {ay} – {_MESES_ABREV[bm - 1]} {by}"


def registrar_periodo_base(df):
    """
    Grava em shared/portal-meta.js o periodo coberto pela base consolidada
    (primeiro e ultimo mes). O menu principal le esse arquivo para mostrar
    "Base consolidada <periodo>" — por isso o texto se atualiza sozinho a cada
    vez que algum modulo e reconstruido com uma base nova. So reescreve o
    arquivo se o periodo mudou, e nunca derruba o build se nao conseguir gravar.
    """
    try:
        meses = sorted(df['MES'].dropna().unique())
        if not meses:
            return
        primeiro, ultimo = meses[0], meses[-1]
        meta = {'base_consolidada': {
            'primeiro_mes': primeiro,
            'ultimo_mes': ultimo,
            'rotulo': _rotulo_periodo(primeiro, ultimo),
        }}
        conteudo = (
            '// Gerado automaticamente por shared_py/etl_common.py (registrar_periodo_base) — NAO EDITAR MANUALMENTE\n'
            'const PORTAL_META = ' + json.dumps(meta, ensure_ascii=False) + ';\n'
        )
        atual = None
        if os.path.exists(PORTAL_META_PATH):
            with open(PORTAL_META_PATH, encoding='utf-8') as f:
                atual = f.read()
        if atual != conteudo:
            with open(PORTAL_META_PATH, 'w', encoding='utf-8', newline='\n') as f:
                f.write(conteudo)
            print(f"Periodo da base registrado para o menu: {meta['base_consolidada']['rotulo']}")
    except OSError as e:
        print(f"AVISO: nao foi possivel atualizar shared/portal-meta.js ({e}) — o menu mantera o texto anterior.")


def raw_to_consolidada(path, sheet_name=None, extra_columns=None):
    """
    Le a planilha bruta (NF-level) e devolve um DataFrame no formato
    consolidado padrao: FANTASIA, SEGMENTO, GRUPO, SUBGRUPO, DESCRICAO_ITEM,
    RAZAO FORNECEDOR, DATA_LANCAMENTO, QDE_COMPRADA, VALOR_CONTABIL, MES.

    `extra_columns`: lista opcional de colunas ADICIONAIS da planilha bruta
    para incluir sem renomear (ex: ['UM']), usada por modulos que precisam
    de algum campo bruto que nao faz parte do esquema consolidado padrao
    (ex: Analise de Itens). Nao afeta os modulos que nao passam esse
    parametro.
    """
    sheet = sheet_name or _pick_sheet(path)
    raw = pd.read_excel(path, sheet_name=sheet)

    missing = [c for c in REQUIRED_RAW_COLUMNS if c not in raw.columns]
    if missing:
        raise ValueError(
            f"A planilha bruta '{path}' (aba '{sheet}') nao tem as colunas esperadas: {missing}. "
            f"Se o layout da planilha de origem mudou, atualize COLUMN_MAP em shared_py/etl_common.py."
        )

    cols_to_read = list(REQUIRED_RAW_COLUMNS)
    extra_columns = extra_columns or []
    for c in extra_columns:
        if c not in raw.columns:
            raise ValueError(f"Coluna extra '{c}' nao encontrada na planilha bruta '{path}' (aba '{sheet}').")
        if c not in cols_to_read:
            cols_to_read.append(c)

    df = raw[cols_to_read].rename(columns=COLUMN_MAP).copy()
    df['DATA_LANCAMENTO'] = pd.to_datetime(df['DATA_LANCAMENTO'])
    df['MES'] = df['DATA_LANCAMENTO'].dt.strftime('%Y-%m')

    # Normaliza caixa/espacos antes de padronizar (a planilha bruta traz nomes
    # de fornecedor em capitalizacoes inconsistentes — "Hortifruti Sarvedo Ltda" vs "HORTIFRUTI SARVEDO LTDA").
    df['RAZAO FORNECEDOR'] = df['RAZAO FORNECEDOR'].astype(str).str.upper().str.strip()

    df = padronizar_fornecedores(df)
    df = df[~df['RAZAO FORNECEDOR'].isin(FORNECEDORES_EXCLUIDOS)].copy()
    df = tratar_dados_pre_analise(df)

    registrar_periodo_base(df)
    return df

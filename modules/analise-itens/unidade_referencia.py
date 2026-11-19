"""
Unidade de medida (UM) de referencia por item — regra unica das analises de PRECO UNITARIO
do modulo Analise de Itens.

O mesmo item aparece na base com unidades diferentes (KG, UNID, CX, PACOTE...) e o preco
(valor / quantidade) so e' comparavel dentro de uma unidade. Por isso cada item passa a ter
UMA unidade de referencia e as analises de preco usam somente os registros nela.

Regra (definir_unidade_referencia):
  1. a UM com MAIOR VALOR COMPRADO (soma do valor contabil) em toda a base;
  2. empate de valor (em centavos): a UM com MAIS REGISTROS; ainda empatado: ordem alfabetica
     (so' para o resultado ser sempre o mesmo).
Considera apenas registros com quantidade > 0 (sem quantidade nao existe preco unitario).

Registros suspeitos (marcar_suspeitos) — NUNCA sao corrigidos nem convertidos; ficam fora das
analises de preco e vao para a planilha de validacao (gerar_relatorio):
  A. preco unitario maior que 3x ou menor que 1/3 da mediana do item na mesma UM
     (so' quando o item tem pelo menos 5 registros na UM de referencia — mediana confiavel);
  B. UM "UNID" e descricao do item do fornecedor indicando caixa/fardo/multipack ("CX", "FD",
     "C/12", "12X1"...) COM preco acima de 1,5x a mediana — i.e. o preco se comporta como o da
     embalagem, nao o da unidade. Descricao de caixa com preco normal e' coerente e nao e' marcada;
  C. UM "KG"/"LITRO" e descricao indicando embalagem pequena ("PCT", "500G", "200 ML") — so'
     entra junto com a regra A (a gramatura na descricao e' so' informativa quando o preco e' normal).

Conversao dos casos CLAROS (converter_casos_claros) — unica excecao a "suspeito fica fora da analise":
  um grupo (mesmo item + mesma descricao do fornecedor, na UM de referencia) e' convertido quando
    1. tem pelo menos 2 registros e TODOS sao suspeitos (a descricao sempre vem com a escala errada);
    2. a descricao traz um fator de embalagem explicito (padroes C/12, CX 24, 6X5KG, FARDO 5X5KG,
       CX 18KG...; peso/volume avulso como "900ML" nao conta);
    3. em CADA registro, aplicar esse fator (preco x fator se o preco esta abaixo da mediana, preco / fator
       se esta acima) deixa o preco a +-10% da mediana limpa do item, e o fator e' o MESMO e o unico que
       fecha em todos os registros do grupo (e a direcao acima/abaixo da mediana tambem e' a mesma);
    4. o item tem >= 5 registros limpos (mediana confiavel);
    5. salvaguarda: se a QUANTIDADE do registro ja' bate (+-3%) com o conteudo da embalagem na UM (ex.: "C/20" de
       900 ML = 18 L e a qtde registrada e' 18), o registro ja' esta correto na unidade e o GRUPO nao e' convertido
       — nesse caso a mediana do item e' que estaria errada, e a validacao pela mediana nao serve.
  A conversao so' muda a QUANTIDADE usada no calculo do preco (qtde / fator ou qtde x fator); valor, UM
  e a linha na Tabela Detalhada nao mudam. Teste de controle (fatores embaralhados entre grupos): ~1 falso
  positivo para 28 grupos convertidos. Todo caso convertido sai na aba "Conversoes aplicadas" da planilha.
  Os demais suspeitos continuam fora da analise ate' validacao.

Nada aqui altera a planilha original: tudo e' aplicado so' no tratamento (build_data.py).
"""
import re
import pandas as pd

def _brl(v):
    """Formata em reais no padrao brasileiro (R$ 1.939,57)."""
    return 'R$ ' + f"{v:,.2f}".replace(',', '_').replace('.', ',').replace('_', '.')


def _dec(v):
    return f"{v:.2f}".replace('.', ',')


MIN_REGISTROS_MEDIANA = 5
TOLERANCIA_CONVERSAO = 0.10
MIN_REGISTROS_GRUPO = 2
TOLERANCIA_CONTEUDO = 0.03
FATOR_MIN, FATOR_MAX = 2, 1000
LIMITE_ACIMA = 3.0
LIMITE_ABAIXO = 1 / 3
LIMITE_PACOTE = 1.5

# descricao do item do fornecedor que fala de caixa / fardo / multipack
_RE_MULTIPACK = re.compile(r'\b(?:CX|CAIXA|FD|FARDO)\b|\bC/\s*\d+|\bCOM\s+\d+\s*(?:UN|UND|UNID)\b|\b\d+\s*X\s*\d+')
# padroes de FATOR DE EMBALAGEM (so' os explicitos; peso/volume avulso nao e' fator)
_RE_C_BARRA = re.compile(r'\bC/\s*(\d+(?:\.\d+)?)')
_RE_CX_N = re.compile(r'\bCX\s*(\d+(?:\.\d+)?)\b')
_RE_COM_N = re.compile(r'\bCOM\s+(\d+)\s*(?:UN|UND|UNID)\b')
_RE_N_X_Q = re.compile(r'\b(\d+)\s*X\s*(\d+(?:\.\d+)?)\s*(KG|G|GR|GRS|L|LT|ML)?\b')
_RE_TOTAL = re.compile(r'\b(?:CX|CAIXA|FD|FARDO)\s*(?:COM\s*)?(\d+(?:\.\d+)?)\s*(KG|KGS|L|LT|LTS)\b')
# descricao que fala de embalagem pequena (pacote, gramas, mililitros)
_RE_EMB_PEQUENA = re.compile(r'\b(?:PCT|PACOTE)\b|\b\d+\s*(?:G|GR|GRS|ML)\b')


def definir_unidade_referencia(df):
    """
    DataFrame indexado por DESCRICAO_ITEM com a UM de referencia de cada item:
    um_ref, valor_ref, registros_ref, um_freq (mais frequente), valor_freq, registros_freq,
    n_ums, ums_descartadas, divergente (maior valor != mais frequente) e valor_total.
    """
    base = df[df['QDE_COMPRADA'] > 0]
    g = base.groupby(['DESCRICAO_ITEM', 'UM']).agg(
        valor=('VALOR_CONTABIL', 'sum'), registros=('VALOR_CONTABIL', 'size')).reset_index()
    g['valor_c'] = g['valor'].round(2)

    por_valor = (g.sort_values(['DESCRICAO_ITEM', 'valor_c', 'registros', 'UM'], ascending=[True, False, False, True])
                  .drop_duplicates('DESCRICAO_ITEM').set_index('DESCRICAO_ITEM'))
    por_freq = (g.sort_values(['DESCRICAO_ITEM', 'registros', 'valor_c', 'UM'], ascending=[True, False, False, True])
                 .drop_duplicates('DESCRICAO_ITEM').set_index('DESCRICAO_ITEM'))

    def descartadas(sub):
        sub = sub.sort_values(['valor_c', 'registros'], ascending=False).iloc[1:]
        return '; '.join(f"{r.UM} ({_brl(r.valor)}, {int(r.registros)} reg.)" for r in sub.itertuples())

    resumo = pd.DataFrame({
        'um_ref': por_valor['UM'], 'valor_ref': por_valor['valor'], 'registros_ref': por_valor['registros'],
        'um_freq': por_freq['UM'], 'valor_freq': por_freq['valor'], 'registros_freq': por_freq['registros'],
    })
    resumo['n_ums'] = g.groupby('DESCRICAO_ITEM')['UM'].nunique()
    resumo['valor_total'] = g.groupby('DESCRICAO_ITEM')['valor'].sum()
    resumo['divergente'] = resumo['um_ref'] != resumo['um_freq']
    multi = g[g['DESCRICAO_ITEM'].isin(resumo.index[resumo['n_ums'] > 1])]
    resumo['ums_descartadas'] = ''
    if len(multi):
        resumo.loc[multi['DESCRICAO_ITEM'].unique(), 'ums_descartadas'] = \
            multi.groupby('DESCRICAO_ITEM').apply(descartadas)
    return resumo


def marcar_suspeitos(df, um_ref):
    """
    `um_ref`: Series item -> UM de referencia. Devolve (mask, detalhe):
    mask = Series booleana alinhada a df.index (True = registro suspeito);
    detalhe = DataFrame dos suspeitos com mediana, razao e motivo (para o relatorio).
    So' olha registros que ja estao na UM de referencia (os demais estao fora das analises).
    """
    ref = df['DESCRICAO_ITEM'].map(um_ref)
    na_ref = (df['QDE_COMPRADA'] > 0) & (df['UM'] == ref)
    c = df.loc[na_ref, ['DESCRICAO_ITEM', 'UM', 'QDE_COMPRADA', 'VALOR_CONTABIL', 'DESCRICAO ITEM FORNECEDOR']].copy()
    c['pu'] = c['VALOR_CONTABIL'] / c['QDE_COMPRADA']
    grp = c.groupby('DESCRICAO_ITEM')['pu']
    c['mediana'] = grp.transform('median')
    c['n'] = grp.transform('size')
    c['razao'] = c['pu'] / c['mediana']
    desc = c['DESCRICAO ITEM FORNECEDOR'].fillna('').astype(str).str.upper()

    confiavel = c['n'] >= MIN_REGISTROS_MEDIANA
    fora_faixa = confiavel & ((c['razao'] > LIMITE_ACIMA) | (c['razao'] < LIMITE_ABAIXO))
    pacote = confiavel & (c['UM'] == 'UNID') & desc.str.contains(_RE_MULTIPACK) & (c['razao'] > LIMITE_PACOTE)
    emb_peq = fora_faixa & c['UM'].isin(['KG', 'LITRO']) & desc.str.contains(_RE_EMB_PEQUENA)

    suspeito = fora_faixa | pacote
    c = c[suspeito].copy()
    f = fora_faixa[suspeito]
    p = pacote[suspeito]
    e = emb_peq[suspeito]

    def motivo(i):
        r = c.loc[i]
        partes = []
        if f[i]:
            partes.append(f"preço unitário {_brl(r['pu'])} = {_dec(r['razao'])}x a mediana do item em {r['UM']} ({_brl(r['mediana'])})")
        if p[i]:
            partes.append(f"UM UNID, mas a descrição indica caixa/fardo/multipack e o preço é {_dec(r['razao'])}x a mediana (parece preço da embalagem)")
        if e[i]:
            partes.append(f"descrição indica embalagem menor (PCT/g/ml) com UM {r['UM']}")
        return '; '.join(partes)

    c['motivo'] = [motivo(i) for i in c.index]
    mask = pd.Series(False, index=df.index)
    mask.loc[c.index] = True
    return mask, c


def fatores_embalagem(descricao, um):
    """Fatores de embalagem lidos da descricao do fornecedor (conjunto de numeros entre FATOR_MIN e FATOR_MAX)."""
    d = str(descricao).upper().replace(',', '.')
    f = set()
    for rg in (_RE_C_BARRA, _RE_CX_N, _RE_COM_N):
        for m in rg.finditer(d):
            f.add(float(m.group(1)))
    for m in _RE_N_X_Q.finditer(d):
        n, q, u = float(m.group(1)), float(m.group(2)), m.group(3)
        f.add(n)
        if um == 'KG' and u == 'KG':
            f.add(n * q)
        elif um == 'KG' and u in ('G', 'GR', 'GRS'):
            f.add(n * q / 1000)
        elif um == 'LITRO' and u in ('L', 'LT'):
            f.add(n * q)
        elif um == 'LITRO' and u == 'ML':
            f.add(n * q / 1000)
    for m in _RE_TOTAL.finditer(d):
        u = m.group(2)
        if (um == 'KG' and u.startswith('KG')) or (um == 'LITRO' and u.startswith('L')):
            f.add(float(m.group(1)))
    return {x for x in f if FATOR_MIN <= x <= FATOR_MAX}


_RE_TAMANHO = re.compile(r'\b(\d+(?:\.\d+)?)\s*(KG|G|GR|GRS|L|LT|ML)\b')


def conteudos_embalagem(descricao, um, fatores):
    """Conteudos totais possiveis da embalagem na UM (n x tamanho avulso, ou o proprio fator quando ele ja' e' peso/volume)."""
    d = str(descricao).upper().replace(',', '.')
    tamanhos = set()
    for m in _RE_TAMANHO.finditer(d):
        q, u = float(m.group(1)), m.group(2)
        if um == 'KG' and u == 'KG':
            tamanhos.add(q)
        elif um == 'KG' and u in ('G', 'GR', 'GRS'):
            tamanhos.add(q / 1000)
        elif um == 'LITRO' and u in ('L', 'LT'):
            tamanhos.add(q)
        elif um == 'LITRO' and u == 'ML':
            tamanhos.add(q / 1000)
    return set(fatores) | {n * t for n in fatores for t in tamanhos}


def converter_casos_claros(df, um_ref, mask_suspeito):
    """
    Converte so' os casos claros (criterio no cabecalho do arquivo). Devolve (qde_preco, conversoes):
    qde_preco = Series alinhada a df.index com a QUANTIDADE a usar no preco (= QDE_COMPRADA, exceto nos registros
    convertidos); conversoes = DataFrame (indexado como df) com fator, operacao, preco original/convertido e mediana.
    """
    qde_preco = df['QDE_COMPRADA'].astype(float).copy()
    ref = df['DESCRICAO_ITEM'].map(um_ref)
    base = df.loc[(df['QDE_COMPRADA'] > 0) & (df['UM'] == ref),
                  ['DESCRICAO_ITEM', 'UM', 'QDE_COMPRADA', 'VALOR_CONTABIL', 'DESCRICAO ITEM FORNECEDOR']].copy()
    base['pu'] = base['VALOR_CONTABIL'] / base['QDE_COMPRADA']
    base['susp'] = mask_suspeito.loc[base.index]
    base['desc'] = base['DESCRICAO ITEM FORNECEDOR'].fillna('').astype(str).str.upper()
    limpo = base[~base['susp']]
    base['med'] = base['DESCRICAO_ITEM'].map(limpo.groupby('DESCRICAO_ITEM')['pu'].median())
    base['n_limpo'] = base['DESCRICAO_ITEM'].map(limpo.groupby('DESCRICAO_ITEM').size())
    base = base[(base['n_limpo'] >= MIN_REGISTROS_MEDIANA) & base['med'].notna()]

    linhas = []
    for (item, desc), g in base.groupby(['DESCRICAO_ITEM', 'desc']):
        if len(g) < MIN_REGISTROS_GRUPO or not g['susp'].all():
            continue
        fs = fatores_embalagem(desc, g['UM'].iloc[0])
        if not fs:
            continue
        conteudos = conteudos_embalagem(desc, g['UM'].iloc[0], fs)
        if any(abs(q / c - 1) <= TOLERANCIA_CONTEUDO for q in g['QDE_COMPRADA'] for c in conteudos):
            continue                      # quantidade ja' igual ao conteudo da embalagem: registro correto, nao converter
        acima = g['pu'] > g['med']
        if acima.nunique() != 1:          # a direcao (acima/abaixo da mediana) tem que ser a mesma no grupo
            continue
        dividir = bool(acima.iloc[0])
        comum = None
        for pu, med in zip(g['pu'], g['med']):
            ok = {x for x in fs if abs((pu / x if dividir else pu * x) / med - 1) <= TOLERANCIA_CONVERSAO}
            if len(ok) != 1:
                comum = set()
                break
            comum = ok if comum is None else (comum & ok)
        if comum is None or len(comum) != 1:
            continue
        fator = next(iter(comum))
        for i, r in g.iterrows():
            novo = r['pu'] / fator if dividir else r['pu'] * fator
            qde_preco.loc[i] = r['QDE_COMPRADA'] * fator if dividir else r['QDE_COMPRADA'] / fator
            linhas.append((i, fator, 'preço ÷ fator' if dividir else 'preço × fator', r['pu'], novo, r['med']))
    conv = pd.DataFrame(linhas, columns=['idx', 'fator', 'operacao', 'pu_original', 'pu_convertido', 'mediana']).set_index('idx')
    return qde_preco, conv


def base_de_preco(df):
    """
    Monta a base de PRECO em uma chamada (a mesma composicao usada por Analise de Itens): devolve
    (um_ref, usa_preco, qde_preco) — `um_ref` = Series item -> UM de referencia; `usa_preco` = Series booleana
    alinhada a df.index (True = linha na UM de referencia e fora dos suspeitos, ou suspeita convertida num caso claro);
    `qde_preco` = Series com a quantidade a usar no preco (ajustada nos casos convertidos). `df` precisa de indice unico.
    """
    um_ref = definir_unidade_referencia(df)['um_ref']
    mask_suspeito, _ = marcar_suspeitos(df, um_ref)
    qde_preco, conversoes = converter_casos_claros(df, um_ref, mask_suspeito)
    na_ref = (df['QDE_COMPRADA'] > 0) & (df['UM'] == df['DESCRICAO_ITEM'].map(um_ref))
    usa_preco = na_ref & (~mask_suspeito | df.index.isin(conversoes.index))
    return um_ref, usa_preco, qde_preco


def gerar_relatorio(caminho, df, resumo, suspeitos, conversoes):
    """Planilha para a revisao manual: suspeitos, UM por item, divergencias valor x frequencia e resumo."""
    s = df.loc[suspeitos.index, ['FANTASIA', 'DATA_LANCAMENTO', 'N. NOTA', 'RAZAO FORNECEDOR']].join(
        suspeitos[['DESCRICAO_ITEM', 'UM', 'DESCRICAO ITEM FORNECEDOR', 'QDE_COMPRADA', 'VALOR_CONTABIL', 'pu', 'mediana', 'razao', 'motivo']])
    s['DATA_LANCAMENTO'] = pd.to_datetime(s['DATA_LANCAMENTO']).dt.date
    s['situacao'] = [f"Convertido (fator {conversoes.loc[i, 'fator']:g})" if i in conversoes.index
                     else 'Fora da análise (aguarda validação)' for i in s.index]
    s = s.sort_values(['VALOR_CONTABIL'], ascending=False)[[
        'situacao', 'DESCRICAO_ITEM', 'UM', 'DESCRICAO ITEM FORNECEDOR', 'pu', 'mediana', 'razao', 'motivo',
        'QDE_COMPRADA', 'VALOR_CONTABIL', 'FANTASIA', 'RAZAO FORNECEDOR', 'DATA_LANCAMENTO', 'N. NOTA']]
    s.columns = ['Situação', 'Item', 'Unidade (UM)', 'Descrição item fornecedor', 'Preço unitário (R$)', 'Mediana do item na UM (R$)',
                 'Preço ÷ mediana', 'Motivo da suspeita', 'Qtde', 'Valor contábil (R$)', 'Casa', 'Fornecedor', 'Data lançamento', 'NF']

    c = df.loc[conversoes.index, ['DESCRICAO_ITEM', 'UM', 'DESCRICAO ITEM FORNECEDOR', 'QDE_COMPRADA', 'VALOR_CONTABIL',
                                  'FANTASIA', 'RAZAO FORNECEDOR', 'DATA_LANCAMENTO', 'N. NOTA']].join(conversoes)
    c['DATA_LANCAMENTO'] = pd.to_datetime(c['DATA_LANCAMENTO']).dt.date
    c['qde_nova'] = [q * f if o.startswith('preço ÷') else q / f for q, f, o in zip(c['QDE_COMPRADA'], c['fator'], c['operacao'])]
    c = c.sort_values(['DESCRICAO_ITEM', 'DESCRICAO ITEM FORNECEDOR', 'VALOR_CONTABIL'], ascending=[True, True, False])[[
        'DESCRICAO_ITEM', 'UM', 'DESCRICAO ITEM FORNECEDOR', 'fator', 'operacao', 'QDE_COMPRADA', 'qde_nova', 'pu_original',
        'pu_convertido', 'mediana', 'VALOR_CONTABIL', 'FANTASIA', 'RAZAO FORNECEDOR', 'DATA_LANCAMENTO', 'N. NOTA']]
    c.columns = ['Item', 'Unidade (UM)', 'Descrição item fornecedor', 'Fator aplicado', 'Operação', 'Qtde original', 'Qtde usada no preço',
                 'Preço original (R$)', 'Preço convertido (R$)', 'Mediana limpa do item (R$)', 'Valor contábil (R$)', 'Casa', 'Fornecedor',
                 'Data lançamento', 'NF']

    r = resumo.reset_index()
    ums = r[['DESCRICAO_ITEM', 'um_ref', 'valor_ref', 'registros_ref', 'n_ums', 'ums_descartadas', 'valor_total']].copy()
    ums.columns = ['Item', 'UM de referência', 'Valor na UM de referência (R$)', 'Registros na UM de referência',
                   'Nº de UMs', 'UMs descartadas', 'Valor total do item (R$)']
    ums = ums.sort_values('Valor total do item (R$)', ascending=False)

    d = r[r['divergente']][['DESCRICAO_ITEM', 'um_ref', 'valor_ref', 'registros_ref', 'um_freq', 'valor_freq', 'registros_freq', 'valor_total']].copy()
    d.columns = ['Item', 'UM de maior valor (escolhida)', 'Valor (R$)', 'Registros', 'UM mais frequente', 'Valor (R$) ',
                 'Registros ', 'Valor total do item (R$)']
    d = d.sort_values('Valor total do item (R$)', ascending=False)

    with pd.ExcelWriter(caminho, engine='openpyxl') as xw:
        c.to_excel(xw, sheet_name='Conversões aplicadas', index=False)
        s.to_excel(xw, sheet_name='Registros suspeitos', index=False)
        d.to_excel(xw, sheet_name='UM valor x frequência', index=False)
        ums.to_excel(xw, sheet_name='UM por item', index=False)
        for ws in xw.book.worksheets:
            ws.freeze_panes = 'A2'
            for col in ws.columns:
                largura = max(len(str(c.value)) if c.value is not None else 0 for c in list(col)[:200])
                ws.column_dimensions[col[0].column_letter].width = min(max(10, largura + 2), 60)

"""
Ferramentas do Assistente: consultas determinísticas sobre os dados do Portal de Compras.

O Claude NÃO recebe os dados nem "lembra" de números: ele chama estas ferramentas, que leem os mesmos
`data.js` que o portal usa, calculam e devolvem o resultado (com os valores já formatados e a fonte).
A resposta final é redigida a partir do que as ferramentas devolveram.

Cada ferramenta devolve um dict serializável; erros esperados viram `ToolError` (o Claude recebe a
mensagem e pode reformular a chamada ou pedir esclarecimento ao usuário).
"""
import difflib
import json
import os
import re
import threading
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# nome interno -> (caminho do data.js, nome da constante JS)
FONTES_DE_DADOS = {
    'categorias': ('modules/categorias/data.js', 'CATEGORIAS_DATA'),
    'fornecedores': ('modules/fornecedores/data.js', 'DASHBOARD_DATA'),
    'indicadores': ('modules/indicadores/data.js', 'INDICADORES_DATA'),
    'analise_itens': ('modules/analise-itens/data.js', 'ANALISE_ITENS_DATA'),
}

TOP_MAX = 30


class ToolError(Exception):
    """Erro esperado de ferramenta (parâmetro inválido, nada encontrado, ambiguidade...)."""


# ============================== carga dos dados ==============================
class _Store:
    """Lê cada data.js sob demanda e recarrega sozinho quando o arquivo muda (rebuild do módulo)."""

    def __init__(self):
        self._cache = {}
        self._lock = threading.Lock()

    def get(self, nome):
        caminho, constante = FONTES_DE_DADOS[nome]
        arq = ROOT / caminho
        try:
            mtime = arq.stat().st_mtime
        except FileNotFoundError:
            raise ToolError(f"Os dados de '{nome}' não foram encontrados ({caminho}).")
        with self._lock:
            hit = self._cache.get(nome)
            if hit and hit[0] == mtime:
                return hit[1]
            texto = arq.read_text(encoding='utf-8')
            m = re.search(r'const\s+' + re.escape(constante) + r'\s*=\s*', texto)
            if not m:
                raise ToolError(f"Formato inesperado em {caminho}.")
            dados = json.loads(texto[m.end():].rstrip().rstrip(';'))
            if nome == 'analise_itens':
                dados.pop('rows', None)   # ~290 mil linhas que o Assistente não usa: não ocupar memória
            self._cache[nome] = (mtime, dados)
            return dados


_store = _Store()


def dados(nome):
    return _store.get(nome)


# ============================== utilitários ==============================
def _norm(txt):
    s = ''.join(c for c in unicodedata.normalize('NFD', str(txt)) if unicodedata.category(c) != 'Mn')
    return ' '.join(s.upper().split())


def _fmt_num(v, casas=0):
    s = f"{v:,.{casas}f}"
    return s.replace(',', 'X').replace('.', ',').replace('X', '.')


def brl(v, casas=0):
    return None if v is None else 'R$ ' + _fmt_num(v, casas)


def pct(v, casas=1):
    """v em fração (0.3465) -> '34,7%'."""
    return None if v is None else _fmt_num(v * 100, casas) + '%'


def pct_ja(v, casas=1):
    """v já em pontos percentuais (34.65) -> '34,7%'."""
    return None if v is None else _fmt_num(v, casas) + '%'


def _top(n, padrao=10):
    try:
        n = int(n) if n is not None else padrao
    except (TypeError, ValueError):
        n = padrao
    return max(1, min(n, TOP_MAX))


def _meses_validos():
    return dados('categorias')['months_order']


def _rotulo_mes(m):
    return dados('categorias')['month_labels'].get(m, m)


def _resolver_periodo(meses):
    """None / [] / ['ALL'] -> ['ALL']; lista de 'YYYY-MM' -> a própria lista (validada)."""
    if meses is None:
        return ['ALL']
    if isinstance(meses, str):
        meses = [meses]
    meses = [str(m).strip() for m in meses if str(m).strip()]
    if not meses or meses == ['ALL']:
        return ['ALL']
    validos = _meses_validos()
    ruins = [m for m in meses if m not in validos]
    if ruins:
        raise ToolError(f"Mês(es) inválido(s): {ruins}. Meses disponíveis: {validos} (formato AAAA-MM).")
    return sorted(set(meses), key=validos.index)


def _rotulo_periodo(chaves):
    if chaves == ['ALL']:
        v = _meses_validos()
        return f"{_rotulo_mes(v[0])} a {_rotulo_mes(v[-1])} (todo o período)"
    return ', '.join(_rotulo_mes(m) for m in chaves)


def _buscar(consulta, nomes, peso=None, limite=8):
    """Busca por nome: todos os termos presentes (sem acento/caixa); fallback aproximado para erros de digitação.
    Devolve [(nome, indice)] ordenado por `peso(indice)` (maior primeiro)."""
    termos = _norm(consulta).split()
    if not termos:
        raise ToolError('Informe o nome (ou parte do nome) a procurar.')
    normalizados = [_norm(n) for n in nomes]
    achados = [i for i, n in enumerate(normalizados) if all(t in n for t in termos)]
    if not achados:
        q = ' '.join(termos)
        for n in difflib.get_close_matches(q, normalizados, n=limite, cutoff=0.6):
            achados.append(normalizados.index(n))
    if peso:
        achados.sort(key=lambda i: -(peso(i) or 0))
    return [(nomes[i], i) for i in achados[:limite]]


def _gerado(*modulos):
    return {m: dados(m).get('gerado_em') for m in modulos}


# ============================== ferramentas ==============================
def resumo_geral():
    ind = dados('indicadores')
    kp = ind['kpis_gerais']
    cat = dados('categorias')['periods']['ALL']['kpis']
    mensal = [{
        'mes': _rotulo_mes(r['MES']), 'valor_comprado': brl(r['valor_total']), 'pedidos': r['pedidos'],
        'fornecedores': r['fornecedores'], 'itens_unicos': r['itens_unicos'], 'ticket_medio': brl(r['ticket_medio']),
    } for r in ind['monthly_exec']]
    ext = ind['external_kpis'][-1] if ind['external_kpis'] else {}
    return {
        'periodo': _rotulo_periodo(['ALL']),
        'total_comprado': brl(kp['total_geral']), 'fornecedores_ativos': kp['total_fornecedores'],
        'itens_distintos': kp['total_itens'], 'pedidos': kp['total_pedidos'],
        'categoria_de_maior_valor': cat.get('top_categoria'),
        'mensal': mensal,
        'indicadores_do_ultimo_mes': {
            'mes': _rotulo_mes(ext.get('MES', '')) if ext else None,
            'cmv_pct': ext.get('cmv'), 'pmp_dias': ext.get('pmp'), 'dio_dias': ext.get('dio'), 'inflacao_pct_mes': ext.get('inflacao'),
        },
        'fonte': 'Indicadores → Visão Geral; Categorias → Visão Geral',
        'dados_gerados_em': _gerado('indicadores', 'categorias'),
    }


def _ranking_categorias_agregado(chaves):
    """Soma o ranking de categorias de vários meses (valor e pedidos são aditivos; contagens únicas, não)."""
    cat = dados('categorias')['periods']
    if chaves == ['ALL']:
        return cat['ALL']['ranking'], False
    if len(chaves) == 1:
        return cat[chaves[0]]['ranking'], False
    soma = {}
    for k in chaves:
        for r in cat[k]['ranking']:
            a = soma.setdefault(r['Categoria'], {'Categoria': r['Categoria'], 'Valor Total': 0.0, 'Pedidos': 0})
            a['Valor Total'] += r['Valor Total']
            a['Pedidos'] += r['Pedidos']
    return sorted(soma.values(), key=lambda x: -x['Valor Total']), True


def categorias(meses=None, top=None):
    chaves = _resolver_periodo(meses)
    ranking, multi = _ranking_categorias_agregado(chaves)
    total = sum(r['Valor Total'] for r in ranking)
    linhas = []
    for i, r in enumerate(ranking[:_top(top, 12)], 1):
        linha = {'posicao': i, 'categoria': r['Categoria'], 'valor': brl(r['Valor Total']),
                 'participacao': pct(r['Valor Total'] / total if total else 0), 'pedidos': r['Pedidos']}
        if not multi:
            linha.update({'classe_abc': r['Classe'], 'itens_unicos': r['Itens Únicos'], 'fornecedores': r['Fornecedores'],
                          'fornecedor_principal': r['Principal Forn.']})
        linhas.append(linha)
    out = {'periodo': _rotulo_periodo(chaves), 'total_do_periodo': brl(total), 'categorias': linhas,
           'fonte': 'Categorias → Ranking de Categorias', 'dados_gerados_em': _gerado('categorias')}
    if multi:
        out['observacao'] = 'Para vários meses só valor, participação e pedidos são somáveis; contagens de itens/fornecedores e classe ABC ficam de fora.'
    return out


def _treemap_agregado(chaves):
    cat = dados('categorias')['periods']
    grupos = {}
    for k in chaves:
        for g in cat[k]['treemap_data']:
            subs = grupos.setdefault(g['name'], {})
            for c in g['children']:
                forn = subs.setdefault(c['name'], {})
                for f in c.get('fornecedores', []):
                    forn[f['nome']] = forn.get(f['nome'], 0.0) + f['valor']
    return grupos


def detalhar_categoria(categoria, meses=None):
    chaves = _resolver_periodo(meses)
    ranking, multi = _ranking_categorias_agregado(chaves)
    nomes = [r['Categoria'] for r in ranking]
    achados = _buscar(categoria, nomes, limite=5)
    if not achados:
        raise ToolError(f"Categoria '{categoria}' não encontrada. Categorias existentes: {', '.join(nomes)}.")
    if len(achados) > 1 and _norm(achados[0][0]) != _norm(categoria):
        raise ToolError(f"'{categoria}' é ambíguo: {', '.join(n for n, _ in achados)}. Pergunte ao usuário qual deles.")
    nome, i = achados[0]
    r = ranking[i]
    total = sum(x['Valor Total'] for x in ranking)
    subs = _treemap_agregado(chaves).get(nome, {})
    sub_linhas = []
    for sn, forn in sorted(subs.items(), key=lambda kv: -sum(kv[1].values())):
        v = sum(forn.values())
        sub_linhas.append({
            'subcategoria': sn, 'valor': brl(v),
            'principais_fornecedores': [{'fornecedor': n, 'valor': brl(x)} for n, x in sorted(forn.items(), key=lambda kv: -kv[1])[:5]],
        })
    out = {'periodo': _rotulo_periodo(chaves), 'categoria': nome, 'valor': brl(r['Valor Total']),
           'participacao_no_total': pct(r['Valor Total'] / total if total else 0), 'pedidos': r['Pedidos'],
           'subcategorias': sub_linhas[:12],
           'fonte': f'Categorias → Composição → {nome}', 'dados_gerados_em': _gerado('categorias')}
    if not multi:
        out.update({'classe_abc': r['Classe'], 'itens_unicos': r['Itens Únicos'], 'fornecedores_unicos': r['Fornecedores'],
                    'fornecedor_principal': r['Principal Forn.'], 'valor_do_principal': brl(r['Valor Princ.'])})
    return out


def _fornecedores_agregado(chaves):
    forn = dados('fornecedores')['periods']
    if len(chaves) == 1:
        return forn[chaves[0]]['ranking'], False
    soma = {}
    for k in chaves:
        for r in forn[k]['ranking']:
            a = soma.setdefault(r['Fornecedor'], {'Fornecedor': r['Fornecedor'], 'Valor Total': 0.0, 'Pedidos': 0,
                                                  'grupos_valor': {}, 'segmentos_valor': {}, 'Grupo Principal': None})
            a['Valor Total'] += r['Valor Total']
            a['Pedidos'] += r['Pedidos']
            for g, v in r.get('grupos_valor', {}).items():
                a['grupos_valor'][g] = a['grupos_valor'].get(g, 0.0) + v
            for s, v in r.get('segmentos_valor', {}).items():
                a['segmentos_valor'][s] = a['segmentos_valor'].get(s, 0.0) + v
    lista = sorted(soma.values(), key=lambda x: -x['Valor Total'])
    for a in lista:
        if a['grupos_valor']:
            a['Grupo Principal'] = max(a['grupos_valor'].items(), key=lambda kv: kv[1])[0]
    return lista, True


def ranking_fornecedores(categoria=None, segmento=None, meses=None, top=None):
    if categoria and segmento:
        raise ToolError('Os dados não permitem cruzar categoria e segmento ao mesmo tempo; escolha um dos dois filtros.')
    chaves = _resolver_periodo(meses)
    lista, multi = _fornecedores_agregado(chaves)
    filtro_nome = None
    if categoria or segmento:
        campo, termo = ('grupos_valor', categoria) if categoria else ('segmentos_valor', segmento)
        existentes = sorted({k for r in lista for k in r.get(campo, {})})
        achados = _buscar(termo, existentes, limite=5)
        if not achados:
            raise ToolError(f"'{termo}' não encontrado. Opções: {', '.join(existentes)}.")
        if len(achados) > 1 and _norm(achados[0][0]) != _norm(termo):
            raise ToolError(f"'{termo}' é ambíguo: {', '.join(n for n, _ in achados)}. Pergunte ao usuário qual deles.")
        filtro_nome = achados[0][0]
        valores = [(r['Fornecedor'], r[campo].get(filtro_nome, 0.0), r) for r in lista if r[campo].get(filtro_nome, 0.0) > 0]
        base_rotulo = f"{'categoria' if categoria else 'segmento'} {filtro_nome}"
    else:
        valores = [(r['Fornecedor'], r['Valor Total'], r) for r in lista]
        base_rotulo = 'todas as compras'
    valores.sort(key=lambda t: -t[1])
    total = sum(v for _, v, _ in valores)
    linhas = []
    for i, (nome, v, r) in enumerate(valores[:_top(top, 10)], 1):
        linha = {'posicao': i, 'fornecedor': nome, 'valor': brl(v), 'participacao': pct(v / total if total else 0)}
        if not filtro_nome:
            linha['grupo_principal'] = r.get('Grupo Principal')
            if not multi:
                linha['classe_abc'] = r['Classe']
        linhas.append(linha)
    return {'periodo': _rotulo_periodo(chaves), 'base': base_rotulo, 'total_da_base': brl(total),
            'fornecedores_na_base': len(valores), 'ranking': linhas,
            'fonte': 'Fornecedores → Ranking de Fornecedores' + (' / Análise por Categoria' if categoria else ' / Fornecedor × Vertical' if segmento else ''),
            'dados_gerados_em': _gerado('fornecedores')}


def detalhar_fornecedor(fornecedor):
    F = dados('fornecedores')
    ranking = F['periods']['ALL']['ranking']
    achados = _buscar(fornecedor, [r['Fornecedor'] for r in ranking], peso=lambda i: ranking[i]['Valor Total'], limite=6)
    if not achados:
        raise ToolError(f"Fornecedor '{fornecedor}' não encontrado.")
    exato = [a for a in achados if _norm(a[0]) == _norm(fornecedor)]
    if len(achados) > 1 and not exato:
        raise ToolError("Mais de um fornecedor corresponde: " + '; '.join(n for n, _ in achados) + ". Pergunte ao usuário qual deles.")
    nome, i = (exato or achados)[0]
    r = ranking[i]
    mensal = []
    for k in F['months_order']:
        pr = next((x for x in F['periods'][k]['ranking'] if x['Fornecedor'] == nome), None)
        if pr:
            mensal.append({'mes': _rotulo_mes(k), 'valor': brl(pr['Valor Total']), 'pedidos': pr['Pedidos']})
    out = {
        'fornecedor': nome, 'valor_total': brl(r['Valor Total']), 'participacao_no_total': pct(r['Part. %'], 2),
        'posicao_no_ranking': r['Rank'], 'classe_abc': r['Classe'], 'pedidos': r['Pedidos'], 'itens_unicos': r['Itens Únicos'],
        'ticket_medio': brl(r['Ticket Médio']), 'meses_ativos': r['Meses Ativos'], 'media_mensal': brl(r['Média Mensal']),
        'prazo_medio_pagamento_dias': r.get('PMP'), 'grupo_principal': r['Grupo Principal'],
        'valor_por_categoria': {g: brl(v) for g, v in sorted(r['grupos_valor'].items(), key=lambda kv: -kv[1])},
        'valor_por_segmento': {s: brl(v) for s, v in sorted(r['segmentos_valor'].items(), key=lambda kv: -kv[1])},
        'estado_uf': F['forn_uf_map'].get(nome),
        'evolucao_mensal': mensal,
        'fonte': 'Fornecedores → Ranking de Fornecedores', 'dados_gerados_em': _gerado('fornecedores'),
    }
    # principais itens, se o fornecedor está entre os ~100 analisados em "Itens por Fornecedor"
    IF = F['itens_fornecedor']
    if nome in IF['dict_fornecedores']:
        fi = IF['dict_fornecedores'].index(nome)
        pares = [p for p in IF['pares'] if p[0] == fi]
        pares.sort(key=lambda p: -sum(m[1] for m in p[11]))
        itens = []
        for p in pares[:8]:
            meta = IF['itens_meta'][p[1]]
            itens.append({'item': meta['descricao'], 'valor': brl(sum(m[1] for m in p[11])),
                          'preco_mediano': brl(p[4], 2) if p[2] else None})
        out['principais_itens'] = itens
        out['fonte'] += '; Itens por Fornecedor'
    return out


def buscar_itens(texto, top=None):
    ranking = dados('analise_itens')['periods_intel']['ALL']['ranking_itens']
    achados = _buscar(texto, [r['item'] for r in ranking], peso=lambda i: ranking[i]['valor_total'], limite=_top(top, 8))
    if not achados:
        raise ToolError(f"Nenhum item encontrado para '{texto}'.")
    series = dados('analise_itens')['item_monthly_series']
    return {
        'consulta': texto, 'candidatos': [{
            'item': n, 'categoria': ranking[i]['grupo'], 'valor_comprado': brl(ranking[i]['valor_total']),
            'classe_abc': ranking[i]['classe'], 'tem_historico_de_preco_mensal': n in series,
        } for n, i in achados],
        'observacao': 'Se houver mais de um candidato plausível, peça ao usuário para escolher antes de detalhar preços.',
        'fonte': 'Análise de Itens → Curva ABC (ranking de itens)', 'dados_gerados_em': _gerado('analise_itens'),
    }


def preco_item(item):
    A = dados('analise_itens')
    ranking = A['periods_intel']['ALL']['ranking_itens']
    nomes = [r['item'] for r in ranking]
    achados = _buscar(item, nomes, peso=lambda i: ranking[i]['valor_total'], limite=5)
    if not achados:
        raise ToolError(f"Item '{item}' não encontrado.")
    exato = [a for a in achados if _norm(a[0]) == _norm(item)]
    if len(achados) > 1 and not exato:
        raise ToolError("Mais de um item corresponde: " + '; '.join(n for n, _ in achados) + ". Pergunte ao usuário qual deles (use buscar_itens).")
    nome, i = (exato or achados)[0]
    out = {'item': nome, 'categoria': ranking[i]['grupo'], 'valor_comprado': brl(ranking[i]['valor_total']),
           'fonte': 'Análise de Itens → Histórico de Preços', 'dados_gerados_em': _gerado('analise_itens', 'fornecedores')}
    serie = A['item_monthly_series'].get(nome)
    if serie and serie['meses']:
        precos = serie['precos']
        out['preco_medio_mensal'] = [{'mes': _rotulo_mes(m), 'preco': brl(p, 2)} for m, p in zip(serie['meses'], precos)]
        if precos[0]:
            out['variacao_primeiro_ao_ultimo_mes'] = pct_ja((precos[-1] / precos[0] - 1) * 100)
    else:
        out['historico_mensal'] = 'indisponível: o histórico mensal só existe para os 60 itens de maior valor.'
    flag = next((f for f in A['quality_flags'] if f['item'] == nome), None)
    if flag:
        out['alerta_de_qualidade'] = ('A quantidade comprada muda de ordem de grandeza entre meses (possível troca de unidade de medida); '
                                      'a variação de preço deste item não é confiável.')
    # preço por fornecedor (itens comprados pelos ~100 fornecedores analisados em "Itens por Fornecedor")
    F = dados('fornecedores')['itens_fornecedor']
    cods = [k for k, m in enumerate(F['itens_meta']) if _norm(m['descricao']) == _norm(nome)]
    por_forn = []
    for k in cods:
        for p in F['pares']:
            if p[1] == k and p[2]:
                por_forn.append({'fornecedor': F['dict_fornecedores'][p[0]], 'preco_mediano': brl(p[4], 2), 'minimo': brl(p[5], 2),
                                 'maximo': brl(p[6], 2), 'unidade': F['dict_unidades'][p[3]] if p[3] is not None else None,
                                 'valor_comprado': brl(sum(m[1] for m in p[11])), '_v': sum(m[1] for m in p[11])})
    if por_forn:
        por_forn.sort(key=lambda x: -x['_v'])
        for x in por_forn:
            x.pop('_v')
        out['preco_por_fornecedor'] = por_forn[:8]
        out['fonte'] += '; Fornecedores → Itens por Fornecedor'
    return out


def variacao_precos(sentido='altas', top=None, categoria=None):
    A = dados('analise_itens')
    if sentido not in ('altas', 'reducoes'):
        raise ToolError("sentido deve ser 'altas' ou 'reducoes'.")
    lista = A['top_aumentos'] if sentido == 'altas' else A['top_reducoes']
    if categoria:
        lista = [x for x in lista if _norm(categoria) in _norm(x['grupo'])]
    if not lista:
        raise ToolError('Nenhum item na lista para esse filtro (a lista traz apenas os 15 maiores de cada sentido).')
    return {
        'sentido': 'maiores aumentos de preço' if sentido == 'altas' else 'maiores reduções de preço',
        'itens': [{'item': x['item'], 'categoria': x['grupo'], 'de': f"{_rotulo_mes(x['mes_inicial'])}: {brl(x['preco_inicial'], 2)}",
                   'para': f"{_rotulo_mes(x['mes_final'])}: {brl(x['preco_final'], 2)}", 'variacao': pct_ja(x['var_pct']),
                   'valor_comprado': brl(x['valor_total'])} for x in lista[:_top(top, 10)]],
        'observacao': 'Compara o primeiro e o último mês de compra do item, entre itens materiais (≈85% do valor comprado); '
                      'itens com possível troca de unidade de medida são excluídos.',
        'fonte': 'Análise de Itens → Histórico de Preços', 'dados_gerados_em': _gerado('analise_itens'),
    }


def evolucao_mensal(categoria=None):
    C = dados('categorias')
    if categoria:
        cols = C['monthly_grupo_cols']
        achados = _buscar(categoria, cols, limite=3)
        if not achados:
            raise ToolError(f"Categoria '{categoria}' não encontrada na série mensal. Opções: {', '.join(cols)}.")
        col = achados[0][0]
        serie = [{'mes': _rotulo_mes(r['MES']), 'valor': brl(r.get(col, 0))} for r in C['monthly_grupo_records']]
        return {'categoria': col, 'serie_mensal': serie,
                'observacao': 'A série mostra as 8 maiores categorias; as demais estão agrupadas em OUTROS.',
                'fonte': 'Categorias → Evolução Mensal', 'dados_gerados_em': _gerado('categorias')}
    ind = dados('indicadores')['monthly_exec']
    return {'categoria': 'todas', 'serie_mensal': [{'mes': _rotulo_mes(r['MES']), 'valor': brl(r['valor_total']), 'pedidos': r['pedidos']} for r in ind],
            'fonte': 'Indicadores → Visão Geral', 'dados_gerados_em': _gerado('indicadores')}


def indicadores_executivos():
    I = dados('indicadores')
    return {
        'serie_mensal': [{'mes': _rotulo_mes(r['MES']), 'cmv_pct': r.get('cmv'), 'pmp_dias': r.get('pmp'), 'dio_dias': r.get('dio'),
                          'inflacao_pct_no_mes': r.get('inflacao')} for r in I['external_kpis']],
        'metas': {'pmp_dias': I.get('meta_pmp'), 'dio_dias': I.get('meta_dio')},
        'cmv_2026_vs_2025': [{'mes': r['mes_label'], 'cmv_2025_pct': r['cmv_2025'], 'cmv_2026_pct': r['cmv_2026'],
                              'melhora_pct': r['melhora_pct']} for r in I['cmv_comparativo']],
        'observacao': 'PMP = prazo médio de pagamento; DIO = dias de estoque. A inflação existe só como série única da empresa (não por categoria ou item).',
        'fonte': 'Indicadores → CMV × Inflação e PMP × DIO', 'dados_gerados_em': _gerado('indicadores'),
    }


def regionalizacao(uf=None):
    R = dados('fornecedores')['periods']['ALL']['regionalizacao_uf']
    if uf:
        sigla = str(uf).strip().upper()
        d = R['por_uf'].get(sigla)
        if not d:
            raise ToolError(f"UF '{uf}' sem fornecedores. UFs com dados: {', '.join(sorted(R['por_uf']))}.")
        return {'uf': sigla, 'regiao': d['regiao'], 'valor_total': brl(d['valor_total']), 'fornecedores': d['fornecedores_count'],
                'maiores_fornecedores': [{'fornecedor': x['Fornecedor'], 'valor': brl(x['Valor']), 'participacao': pct(x['Part. %'])} for x in d['ranking'][:8]],
                'fonte': 'Fornecedores → Regionalização', 'dados_gerados_em': _gerado('fornecedores')}
    return {'macro_regioes': {n: {'valor_total': brl(v['valor_total']), 'fornecedores': v['fornecedores_count'], 'estados': v['estados']}
                              for n, v in R['macro_regioes'].items()},
            'sem_estado_informado': {'valor_total': brl(R['nao_informado']['valor_total']), 'fornecedores': R['nao_informado']['fornecedores_count']},
            'fonte': 'Fornecedores → Regionalização', 'dados_gerados_em': _gerado('fornecedores')}


# ============================== registro / definição para o Claude ==============================
_MESES_PARAM = {
    'type': 'array', 'items': {'type': 'string'},
    'description': "Meses no formato AAAA-MM (ex.: ['2026-03','2026-04']). Omita para usar todo o período disponível.",
}
_TOP_PARAM = {'type': 'integer', 'description': f'Quantos itens listar (máx. {TOP_MAX}).'}

FERRAMENTAS = {
    'resumo_geral': (resumo_geral, {
        'description': 'Panorama geral das compras: total comprado, nº de fornecedores/itens/pedidos, série mensal e indicadores do último mês (CMV, PMP, DIO, inflação).',
        'input_schema': {'type': 'object', 'properties': {}}}),
    'categorias': (categorias, {
        'description': 'Ranking das categorias de compra por valor, com participação, classe ABC, nº de itens e fornecedores e fornecedor principal.',
        'input_schema': {'type': 'object', 'properties': {'meses': _MESES_PARAM, 'top': _TOP_PARAM}}}),
    'detalhar_categoria': (detalhar_categoria, {
        'description': 'Detalhe de UMA categoria: valor, participação, subcategorias e principais fornecedores de cada uma.',
        'input_schema': {'type': 'object', 'properties': {'categoria': {'type': 'string', 'description': 'Nome (ou parte) da categoria, ex.: PROTEINAS.'}, 'meses': _MESES_PARAM},
                         'required': ['categoria']}}),
    'ranking_fornecedores': (ranking_fornecedores, {
        'description': 'Ranking de fornecedores por valor comprado, no geral ou dentro de UMA categoria OU de UM segmento (não os dois). Use para "quais os maiores fornecedores de X".',
        'input_schema': {'type': 'object', 'properties': {
            'categoria': {'type': 'string', 'description': 'Filtrar por categoria (ex.: PROTEINAS, ALCOOLICOS).'},
            'segmento': {'type': 'string', 'description': 'Filtrar por segmento/vertical (ex.: BAR, RESTAURANTE, CAFETERIA).'},
            'meses': _MESES_PARAM, 'top': _TOP_PARAM}}}),
    'detalhar_fornecedor': (detalhar_fornecedor, {
        'description': 'Perfil de UM fornecedor: valor total, posição, classe ABC, PMP, categorias e segmentos atendidos, evolução mensal e principais itens.',
        'input_schema': {'type': 'object', 'properties': {'fornecedor': {'type': 'string', 'description': 'Nome ou parte do nome do fornecedor.'}}, 'required': ['fornecedor']}}),
    'buscar_itens': (buscar_itens, {
        'description': 'Procura itens (produtos) pelo nome e devolve candidatos com categoria e valor comprado. Use antes de preco_item quando o nome for vago.',
        'input_schema': {'type': 'object', 'properties': {'texto': {'type': 'string', 'description': 'Parte do nome do item.'}, 'top': _TOP_PARAM}, 'required': ['texto']}}),
    'preco_item': (preco_item, {
        'description': 'Preço de UM item: média mensal ponderada e variação no período, e preço por fornecedor (quando disponível). Informa as limitações de cobertura.',
        'input_schema': {'type': 'object', 'properties': {'item': {'type': 'string', 'description': 'Nome do item (idealmente exatamente como devolvido por buscar_itens).'}}, 'required': ['item']}}),
    'variacao_precos': (variacao_precos, {
        'description': 'Itens com os maiores aumentos ou as maiores reduções de preço no período (top 15 de cada sentido).',
        'input_schema': {'type': 'object', 'properties': {
            'sentido': {'type': 'string', 'enum': ['altas', 'reducoes']}, 'top': _TOP_PARAM,
            'categoria': {'type': 'string', 'description': 'Filtrar por categoria do item (opcional).'}}, 'required': ['sentido']}}),
    'evolucao_mensal': (evolucao_mensal, {
        'description': 'Série mensal do valor comprado: total da empresa ou de uma categoria.',
        'input_schema': {'type': 'object', 'properties': {'categoria': {'type': 'string', 'description': 'Categoria (opcional; sem ela devolve o total).'}}}}),
    'indicadores_executivos': (indicadores_executivos, {
        'description': 'CMV, PMP (prazo médio de pagamento), DIO (dias de estoque) e inflação por mês, metas de PMP/DIO e CMV 2026 vs 2025.',
        'input_schema': {'type': 'object', 'properties': {}}}),
    'regionalizacao': (regionalizacao, {
        'description': 'Fornecedores por região/UF: valor e quantidade por macro-região, ou o detalhe de uma UF.',
        'input_schema': {'type': 'object', 'properties': {'uf': {'type': 'string', 'description': 'Sigla da UF (ex.: SP). Omita para o resumo por macro-região.'}}}}),
}


def definicoes_para_claude():
    return [{'name': nome, **definicao} for nome, (_, definicao) in FERRAMENTAS.items()]


def executar(nome, argumentos):
    """Executa uma ferramenta. Devolve (texto_json, erro:bool)."""
    if nome not in FERRAMENTAS:
        return json.dumps({'erro': f"Ferramenta desconhecida: {nome}"}, ensure_ascii=False), True
    funcao = FERRAMENTAS[nome][0]
    try:
        resultado = funcao(**(argumentos or {}))
        return json.dumps(resultado, ensure_ascii=False), False
    except ToolError as e:
        return json.dumps({'erro': str(e)}, ensure_ascii=False), True
    except TypeError as e:
        return json.dumps({'erro': f"Parâmetros inválidos para {nome}: {e}"}, ensure_ascii=False), True

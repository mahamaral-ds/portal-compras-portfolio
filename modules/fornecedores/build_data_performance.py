"""
Gera o performance-data.js da aba "Performance de Compras" (OTIF e performance
logistica de fornecedores), dentro do modulo "Analise de Fornecedores", a
partir da planilha "OTIF_base.xlsx" (aba "BASE").

Essa aba foi originalmente um modulo proprio ("modules/performance/"), depois
consolidada em uma unica visao e movida para dentro de "Analise de
Fornecedores" (logo apos a aba "Fornecedor x Vertical"). Continua com script
de build proprio, separado de build_data.py deste modulo, porque le uma
planilha de origem completamente diferente (OTIF_base.xlsx, dados de entrega/
prazo) da usada pelo restante do modulo (base-raw-compras.xlsx, notas
fiscais de compra) — sao dois pipelines de dado independentes que apenas
compartilham a mesma pagina no portal.

Metodologia confirmada com a planilha de referencia da area (aba "OTIF 2026
(FORNECEDORES)"):
    PRAZO ("ON TIME")  = OK quando Atraso (Dias) <= 0
    STATUS ("IN FULL") = OK quando Situacao Entrega = "Entrega Concluida (Todos os Produtos)"
    OTIF               = OK somente quando PRAZO=OK E STATUS=OK (ON TIME x IN FULL)

A demanda "CPQ" (pedidos da central de producao, abastecimento interno) fica
fora do calculo: o indicador mede a entrega dos fornecedores para as casas.

Uso:
    python build_data_performance.py "caminho/para/OTIF_base.xlsx"

Gera: performance-data.js (na mesma pasta deste script)
"""
import sys
import os
import re
import json
import unicodedata
import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

EXCLUDE_DEMANDA = ['CPQ']  # ver nota de metodologia acima

# Compradores exibidos na analise "Desempenho por comprador" (lista FIXA — e' o
# unico ponto a editar para incluir/remover alguem). Todo comprador da base que
# nao corresponder a algum item da lista fica fora SO' dessa tabela; os pedidos
# dele continuam contabilizados nos demais visuais e totais da aba.
#
# Chave   = como identificar o comprador na base. A comparacao ignora
#           maiusculas/minusculas, acentos e espacos extras, e aceita o nome
#           exato OU o nome seguido de mais palavras (ex.: a chave "BRUNO"
#           cobre "BRUNO COSTA"; "CARLA" cobre "CARLA MENDES").
#           Use mais de uma palavra quando o primeiro nome sozinho for ambiguo.
# Valor   = nome exibido na tabela.
# Quem ainda nao existe na base (ex.: FABIO) simplesmente nao aparece — e passa
# a aparecer sozinho, apos regenerar este arquivo, quando surgir nos dados.
# (Nomes ficticios da base sintetica.)
COMPRADORES_PERMITIDOS = {
    'ANA PAULA': 'ANA PAULA',
    'BRUNO': 'BRUNO',
    'CARLA': 'CARLA',
    'DIEGO': 'DIEGO',
    'ELISA': 'ELISA',
    'GABRIEL': 'GABRIEL',
    'FABIO': 'FABIO',
}


def normaliza_nome(txt):
    """MAIUSCULAS, sem acentos e com espacos colapsados/aparados."""
    if txt is None or (isinstance(txt, float) and np.isnan(txt)):
        return ''
    sem_acento = ''.join(c for c in unicodedata.normalize('NFD', str(txt)) if unicodedata.category(c) != 'Mn')
    return ' '.join(sem_acento.upper().split())


_CHAVES_COMPRADOR = sorted(
    ((normaliza_nome(k), v) for k, v in COMPRADORES_PERMITIDOS.items()),
    key=lambda kv: -len(kv[0]),  # chave mais especifica (mais longa) primeiro
)


def comprador_exibicao(nome):
    """Nome de exibicao se o comprador esta na lista permitida; None caso contrario."""
    n = normaliza_nome(nome)
    for chave, exibicao in _CHAVES_COMPRADOR:
        if n == chave or n.startswith(chave + ' '):
            return exibicao
    return None


META_OTIF = 0.95  # meta de referencia sugerida (padrao de mercado p/ OTIF); ajustavel

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


def classifica_causa(row):
    """Classifica a causa raiz da nao-conformidade combinando PRAZO (atraso) e
    STATUS (completude) — a coluna 'Situacao Entrega' sozinha so descreve
    completude, entao um pedido atrasado-mas-completo nao pode ser rotulado
    apenas pela Situacao Entrega (isso classificaria errado como conforme)."""
    late = row['PRAZO'] == 'NOK'
    incomplete = row['STATUS'] == 'NOK'
    detalhe = str(row['Situação Entrega']).strip()
    if late and incomplete:
        return f"Atraso + {detalhe}"
    if late:
        return "Atraso (entrega completa)"
    if incomplete:
        return detalhe
    return "Conforme"


def parse_valor(v):
    if pd.isna(v):
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace('R$', '').strip()
    s = s.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except Exception:
        return 0.0


def pct(numer, denom):
    return float(numer) / float(denom) if denom else 0.0


def compute_scope(scope, min_pedidos_material=5):
    """Calcula todos os indicadores/analises para um recorte (periodo) da base."""
    total_pedidos = int(len(scope))
    if total_pedidos == 0:
        return None

    ontime_ok = int((scope['PRAZO'] == 'OK').sum())
    infull_ok = int((scope['STATUS'] == 'OK').sum())
    otif_ok = int((scope['OTIF'] == 'OK').sum())

    ontime_pct = pct(ontime_ok, total_pedidos)
    infull_pct = pct(infull_ok, total_pedidos)
    otif_pct = pct(otif_ok, total_pedidos)

    kpis = {
        'pedidos': total_pedidos,
        'entregas_prazo': ontime_ok,
        'entregas_fora_prazo': total_pedidos - ontime_ok,
        'entregas_completas': infull_ok,
        'entregas_incompletas': total_pedidos - infull_ok,
        'ocorrencias': total_pedidos - otif_ok,
        'ontime_pct': round(ontime_pct * 100, 2),
        'infull_pct': round(infull_pct * 100, 2),
        'otif_pct': round(otif_pct * 100, 2),
        'conformidade_pct': round(otif_pct * 100, 2),
    }

    # ---- Ranking de fornecedores ----
    grp = scope.groupby('Fornecedor')
    forn_df = pd.DataFrame({
        'pedidos': grp.size(),
        'ontime_ok': grp.apply(lambda g: (g['PRAZO'] == 'OK').sum()),
        'infull_ok': grp.apply(lambda g: (g['STATUS'] == 'OK').sum()),
        'otif_ok': grp.apply(lambda g: (g['OTIF'] == 'OK').sum()),
        'valor': grp['Vol. Preço Custo_num'].sum(),
    }).reset_index()
    # Lista completa (todo fornecedor com >=1 pedido, sem corte de volume
    # minimo nem top-15) com os contadores brutos — usada pelo front-end para
    # recombinar corretamente o ranking quando o usuario seleciona mais de um
    # mes ao mesmo tempo (Ctrl+clique): soma pedidos/ontime_ok/infull_ok/
    # otif_ok/valor entre os meses escolhidos, refaz o filtro de volume
    # minimo e os top-15 só depois de somar. Para 1 mes (ou 'ALL') o front-end
    # usa direto ranking_melhores/piores/atrasos/incompletos abaixo, sem
    # precisar desta lista.
    forn_full_df = forn_df.rename(columns={'Fornecedor': 'fornecedor'}).copy()
    forn_full_df['valor'] = forn_full_df['valor'].round(2)
    forn_full = forn_full_df[
        ['fornecedor', 'pedidos', 'ontime_ok', 'infull_ok', 'otif_ok', 'valor']
    ].to_dict('records')

    forn_df = forn_df[forn_df['pedidos'] >= min_pedidos_material].copy()
    forn_df['ontime_pct'] = (forn_df['ontime_ok'] / forn_df['pedidos'] * 100).round(2)
    forn_df['infull_pct'] = (forn_df['infull_ok'] / forn_df['pedidos'] * 100).round(2)
    forn_df['otif_pct'] = (forn_df['otif_ok'] / forn_df['pedidos'] * 100).round(2)
    forn_df['atrasos'] = forn_df['pedidos'] - forn_df['ontime_ok']
    forn_df['incompletos'] = forn_df['pedidos'] - forn_df['infull_ok']
    forn_df['valor'] = forn_df['valor'].round(2)

    ranking_melhores = forn_df.sort_values(['otif_pct', 'pedidos'], ascending=[False, False]).head(15)
    ranking_piores = forn_df.sort_values(['otif_pct', 'pedidos'], ascending=[True, False]).head(15)
    ranking_atrasos = forn_df.sort_values(['atrasos', 'pedidos'], ascending=[False, False]).head(15)
    ranking_incompletos = forn_df.sort_values(['incompletos', 'pedidos'], ascending=[False, False]).head(15)

    cols = ['Fornecedor', 'pedidos', 'ontime_pct', 'infull_pct', 'otif_pct', 'atrasos', 'incompletos', 'valor']

    def to_records(d):
        return d[cols].rename(columns={'Fornecedor': 'fornecedor'}).to_dict('records')

    # ---- Performance por categoria (Demanda) ----
    cat_grp = scope.groupby('Demanda')
    cat_df = pd.DataFrame({
        'pedidos': cat_grp.size(),
        'ontime_ok': cat_grp.apply(lambda g: (g['PRAZO'] == 'OK').sum()),
        'infull_ok': cat_grp.apply(lambda g: (g['STATUS'] == 'OK').sum()),
        'otif_ok': cat_grp.apply(lambda g: (g['OTIF'] == 'OK').sum()),
    }).reset_index()
    cat_df['ontime_pct'] = (cat_df['ontime_ok'] / cat_df['pedidos'] * 100).round(2)
    cat_df['infull_pct'] = (cat_df['infull_ok'] / cat_df['pedidos'] * 100).round(2)
    cat_df['otif_pct'] = (cat_df['otif_ok'] / cat_df['pedidos'] * 100).round(2)
    cat_df = cat_df.sort_values('pedidos', ascending=False)
    # inclui os contadores brutos (ontime_ok/infull_ok/otif_ok), ao lado dos
    # percentuais ja calculados, para permitir somar corretamente entre
    # varios meses selecionados no front-end (ver forn_full acima)
    by_categoria = cat_df[['Demanda', 'pedidos', 'ontime_ok', 'infull_ok', 'otif_ok', 'ontime_pct', 'infull_pct', 'otif_pct']].rename(
        columns={'Demanda': 'categoria'}
    ).to_dict('records')

    # ---- Performance por comprador ----
    # So' os compradores de COMPRADORES_PERMITIDOS (ver topo do arquivo), com o
    # nome de exibicao da lista; afeta somente esta tabela, os pedidos continuam
    # contabilizados nas demais analises.
    scope_comp = scope.copy()
    scope_comp['Comprador'] = scope_comp['Comprador'].map(comprador_exibicao)
    scope_comp = scope_comp[scope_comp['Comprador'].notna()]
    scope_comp = scope_comp.assign(_otif_ok=(scope_comp['OTIF'] == 'OK'))
    comp_df = scope_comp.groupby('Comprador', as_index=False).agg(
        pedidos=('OTIF', 'size'), otif_ok=('_otif_ok', 'sum')
    )
    # lista completa (sem corte de volume minimo nem top-15), com o contador
    # bruto otif_ok — mesma logica de forn_full, para recombinar entre varios
    # meses selecionados no front-end
    by_comprador_full = comp_df[['Comprador', 'pedidos', 'otif_ok']].rename(
        columns={'Comprador': 'comprador'}
    ).to_dict('records')

    comp_df = comp_df[comp_df['pedidos'] >= 5]
    comp_df['otif_pct'] = (comp_df['otif_ok'] / comp_df['pedidos'] * 100).round(2)
    comp_df = comp_df.sort_values('pedidos', ascending=False).head(15)
    by_comprador = comp_df[['Comprador', 'pedidos', 'otif_pct']].rename(
        columns={'Comprador': 'comprador'}
    ).to_dict('records')

    # ---- Nao conformidades: tipos de ocorrencia (causa combinada PRAZO+STATUS) ----
    nok = scope[scope['OTIF'] == 'NOK'].copy()
    total_nok = len(nok)
    if total_nok:
        nok['causa'] = nok.apply(classifica_causa, axis=1)
        sit_counts = nok['causa'].value_counts()
    else:
        sit_counts = pd.Series(dtype=int)
    nonconformance_types = [
        {'tipo': str(k), 'ocorrencias': int(v), 'part_pct': round(100 * v / total_nok, 1) if total_nok else 0}
        for k, v in sit_counts.items()
    ]

    # Impacto por categoria (Demanda) das nao-conformidades
    nc_by_cat = nok.groupby('Demanda').size().sort_values(ascending=False)
    nonconformance_by_categoria = [{'categoria': k, 'ocorrencias': int(v)} for k, v in nc_by_cat.items()]

    # Top fornecedores em ocorrencias (impacto absoluto)
    nc_by_forn = nok.groupby('Fornecedor').size().sort_values(ascending=False).head(15)
    nonconformance_by_fornecedor = [{'fornecedor': k, 'ocorrencias': int(v)} for k, v in nc_by_forn.items()]

    return {
        'kpis': kpis,
        'ranking_melhores': to_records(ranking_melhores),
        'ranking_piores': to_records(ranking_piores),
        'ranking_atrasos': to_records(ranking_atrasos),
        'ranking_incompletos': to_records(ranking_incompletos),
        'by_categoria': by_categoria,
        'by_comprador': by_comprador,
        'forn_full': forn_full,
        'by_comprador_full': by_comprador_full,
        'nonconformance_types': nonconformance_types,
        'nonconformance_by_categoria': nonconformance_by_categoria,
        'nonconformance_by_fornecedor': nonconformance_by_fornecedor,
        'forn_scatter': forn_df[['Fornecedor', 'pedidos', 'otif_pct', 'valor']].rename(
            columns={'Fornecedor': 'fornecedor'}
        ).to_dict('records'),
    }


def main():
    input_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE_DIR, 'OTIF_base.xlsx')
    if not os.path.exists(input_path):
        print(f"ERRO: arquivo nao encontrado: {input_path}")
        sys.exit(1)

    print(f"Lendo: {input_path}")
    base = pd.read_excel(input_path, sheet_name='BASE')

    excluded_count = int(base['Demanda'].isin(EXCLUDE_DEMANDA).sum())
    df = base[~base['Demanda'].isin(EXCLUDE_DEMANDA)].copy()
    df['Vol. Preço Custo_num'] = df['Vol. Preço Custo'].apply(parse_valor)

    # normaliza MES para "YYYY-MM"
    month_map = {'Jan': '01', 'Fev': '02', 'Mar': '03', 'Abr': '04', 'Mai': '05', 'Jun': '06',
                 'Jul': '07', 'Ago': '08', 'Set': '09', 'Out': '10', 'Nov': '11', 'Dez': '12'}
    df['MES'] = df.apply(lambda r: f"{r['Ano']}-{month_map.get(r['Mês'], '00')}", axis=1)
    months = sorted(df['MES'].unique())
    month_labels = {m: month_label(m) for m in months}
    print(f"Meses: {months}")
    print(f"Linhas excluidas (Demanda em {EXCLUDE_DEMANDA}): {excluded_count}")
    print(f"Total de pedidos apos exclusao: {len(df)}")

    # =========================================================================
    # PERIODOS (ALL + cada mes) — usados nas paginas com filtro de periodo
    # =========================================================================
    periods = {'ALL': compute_scope(df)}
    for m in months:
        periods[m] = compute_scope(df[df['MES'] == m])

    # ---- Comparativo mes a mes (MoM) para os KPIs executivos ----
    mom_fields = ['otif_pct', 'ontime_pct', 'infull_pct', 'pedidos', 'ocorrencias']
    for i, m in enumerate(months):
        if i == 0 or periods[m] is None:
            continue
        prev_m = months[i - 1]
        if periods[prev_m] is None:
            continue
        mom = {}
        for f in mom_fields:
            cur, prev = periods[m]['kpis'][f], periods[prev_m]['kpis'][f]
            if f in ('pedidos', 'ocorrencias'):
                mom[f + '_mom'] = round(100 * (cur - prev) / prev, 1) if prev else None
            else:
                mom[f + '_mom'] = round(cur - prev, 1)  # variacao em pontos percentuais
        periods[m]['kpis'].update(mom)

    # =========================================================================
    # EVOLUCAO TEMPORAL (serie completa, sempre jan-jun — usada na aba
    # "Evolucao Temporal", independente do filtro de periodo)
    # =========================================================================
    monthly_trend = []
    for m in months:
        p = periods[m]
        monthly_trend.append({
            'MES': m,
            'ontime_pct': p['kpis']['ontime_pct'],
            'infull_pct': p['kpis']['infull_pct'],
            'otif_pct': p['kpis']['otif_pct'],
            'pedidos': p['kpis']['pedidos'],
        })
    # media movel de 3 meses do OTIF
    otif_series = [r['otif_pct'] for r in monthly_trend]
    for i, r in enumerate(monthly_trend):
        window = otif_series[max(0, i - 2):i + 1]
        r['otif_media_movel'] = round(sum(window) / len(window), 2)
        r['meta'] = META_OTIF * 100

    # ---- Heatmap fornecedor (top 15) x mes -> OTIF% ----
    top15_forn = df.groupby('Fornecedor').size().sort_values(ascending=False).head(15).index.tolist()
    heatmap_rows = []
    for forn in top15_forn:
        row = []
        for m in months:
            sub = df[(df['MES'] == m) & (df['Fornecedor'] == forn)]
            row.append(round(100 * (sub['OTIF'] == 'OK').mean(), 1) if len(sub) else None)
        heatmap_rows.append({'fornecedor': forn, 'valores': row})

    # =========================================================================
    # TENDENCIA POR FORNECEDOR (1ª metade vs 2ª metade do periodo)
    # =========================================================================
    half = len(months) // 2
    meses_h1, meses_h2 = months[:half], months[half:]
    trend_rows = []
    for forn, g in df.groupby('Fornecedor'):
        if len(g) < 10:
            continue
        g1 = g[g['MES'].isin(meses_h1)]
        g2 = g[g['MES'].isin(meses_h2)]
        if len(g1) < 3 or len(g2) < 3:
            continue
        otif1 = 100 * (g1['OTIF'] == 'OK').mean()
        otif2 = 100 * (g2['OTIF'] == 'OK').mean()
        trend_rows.append({
            'fornecedor': forn, 'pedidos': int(len(g)),
            'otif_h1': round(otif1, 1), 'otif_h2': round(otif2, 1),
            'variacao_pp': round(otif2 - otif1, 1),
        })
    trend_df = pd.DataFrame(trend_rows)
    piorando = trend_df.sort_values('variacao_pp').head(10).to_dict('records') if len(trend_df) else []
    melhorando = trend_df.sort_values('variacao_pp', ascending=False).head(10).to_dict('records') if len(trend_df) else []
    # consistentes: alto OTIF nas duas metades E baixa variacao absoluta
    consistentes = trend_df[(trend_df['otif_h1'] >= 95) & (trend_df['otif_h2'] >= 95)].copy()
    consistentes['abs_var'] = consistentes['variacao_pp'].abs()
    consistentes = consistentes.sort_values(['abs_var', 'pedidos'], ascending=[True, False]).head(10)
    consistentes = consistentes.drop(columns=['abs_var']).to_dict('records')

    # =========================================================================
    # WATERFALL: DE PEDIDOS TOTAIS A PEDIDOS 100% CONFORMES (perdas por causa)
    # =========================================================================
    total_pedidos_all = len(df)
    atraso_e_incompleto = int(((df['PRAZO'] == 'NOK') & (df['STATUS'] == 'NOK')).sum())
    so_atraso = int(((df['PRAZO'] == 'NOK') & (df['STATUS'] == 'OK')).sum())
    so_incompleto = int(((df['PRAZO'] == 'OK') & (df['STATUS'] == 'NOK')).sum())
    perfeitos = int(((df['PRAZO'] == 'OK') & (df['STATUS'] == 'OK')).sum())
    waterfall = {
        'baseline': total_pedidos_all,
        'steps': [
            {'label': 'Só atraso', 'value': -so_atraso},
            {'label': 'Só incompleto', 'value': -so_incompleto},
            {'label': 'Atraso + incompleto', 'value': -atraso_e_incompleto},
        ],
        'final': perfeitos,
    }

    # =========================================================================
    # PARETO DE OCORRENCIAS (causas de nao-conformidade, base completa)
    # =========================================================================
    nok_all = df[df['OTIF'] == 'NOK'].copy()
    nok_all['causa'] = nok_all.apply(classifica_causa, axis=1)
    sit_counts_all = nok_all['causa'].value_counts()
    total_nok_all = len(nok_all)
    pareto = []
    cum = 0
    for tipo, cnt in sit_counts_all.items():
        cum += cnt
        pareto.append({
            'tipo': str(tipo), 'ocorrencias': int(cnt),
            'acum_pct': round(100 * cum / total_nok_all, 1) if total_nok_all else 0,
        })

    # =========================================================================
    # INSIGHTS AUTOMATICOS
    # =========================================================================
    insights = []
    otif_all = periods['ALL']['kpis']['otif_pct']
    insights.append({
        'tipo': 'info' if otif_all >= META_OTIF * 100 else 'atencao',
        'texto': f"OTIF geral do período foi {otif_all:.1f}%, "
                 f"{'acima' if otif_all >= META_OTIF*100 else 'abaixo'} da meta de referência de {META_OTIF*100:.0f}%."
    })
    if len(piorando):
        pior = piorando[0]
        insights.append({
            'tipo': 'alerta',
            'texto': f"{pior['fornecedor']} teve queda de {abs(pior['variacao_pp']):.1f} p.p. no OTIF entre a 1ª e a 2ª metade do período — candidato a ação de recuperação."
        })
    if len(melhorando):
        mel = melhorando[0]
        insights.append({
            'tipo': 'oportunidade',
            'texto': f"{mel['fornecedor']} melhorou {mel['variacao_pp']:.1f} p.p. no OTIF entre a 1ª e a 2ª metade do período."
        })
    if len(nonconformance_by_categoria := periods['ALL']['nonconformance_by_categoria']):
        top_nc_cat = nonconformance_by_categoria[0]
        insights.append({
            'tipo': 'atencao',
            'texto': f"A categoria {top_nc_cat['categoria']} concentra o maior número de ocorrências de não conformidade ({top_nc_cat['ocorrencias']})."
        })
    if so_atraso > so_incompleto:
        insights.append({
            'tipo': 'info',
            'texto': f"Atraso de entrega é a causa mais frequente de não conformidade isolada ({so_atraso} pedidos), à frente de entregas incompletas ({so_incompleto})."
        })
    else:
        insights.append({
            'tipo': 'info',
            'texto': f"Entregas incompletas são a causa mais frequente de não conformidade isolada ({so_incompleto} pedidos), à frente de atrasos ({so_atraso})."
        })

    # =========================================================================
    # MONTAGEM FINAL
    # =========================================================================
    data = {
        'month_labels': month_labels,
        'months_order': months,
        'periods': periods,
        'monthly_trend': monthly_trend,
        'heatmap_fornecedor_mes': {'fornecedores': top15_forn, 'meses': months, 'linhas': heatmap_rows},
        'tendencia_piorando': piorando,
        'tendencia_melhorando': melhorando,
        'tendencia_consistentes': consistentes,
        'waterfall': waterfall,
        'pareto_ocorrencias': pareto,
        'insights': insights,
        'meta_otif': META_OTIF * 100,
        'excluded_demanda': EXCLUDE_DEMANDA,
        'gerado_em': pd.Timestamp.now().strftime('%d/%m/%Y'),
    }

    out_path = os.path.join(BASE_DIR, 'performance-data.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('// Dados gerados automaticamente por build_data_performance.py — NAO EDITAR MANUALMENTE\n')
        f.write(f"// Gerado em: {data['gerado_em']} | Fonte: {os.path.basename(input_path)}\n")
        f.write('const PERFORMANCE_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'), default=str) + ';\n')

    print(f"OK -> {out_path} atualizado.")
    print(f"OTIF geral: {periods['ALL']['kpis']['otif_pct']}% | Pedidos: {periods['ALL']['kpis']['pedidos']}")


if __name__ == '__main__':
    main()

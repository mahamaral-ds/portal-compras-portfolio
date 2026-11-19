"""
Gera o data.js do modulo "Compliance" (aba "NF Sequencial") a partir da
planilha BRUTA de notas fiscais (mesma base usada em Fornecedores e
Indicadores — ex: "base-raw-compras.xlsx").

Nao e' necessario gerar uma "base-consolidada" a parte: este script chama
shared_py/etl_common.py, que transforma a planilha bruta diretamente no
formato consolidado (e ja aplica a padronizacao de nomes de fornecedor e a
exclusao de transacoes intercompany) antes de calcular qualquer metrica.

Analise "NF Sequencial": para cada fornecedor, compara a quantidade de NFs
distintas emitidas para a empresa com o intervalo numerico entre a menor e
a maior NF emitida (mesmo periodo, ou seja, todos os dados disponiveis na
planilha bruta — nao ha filtro de mes nesta analise). Um percentual alto
indica que as NFs emitidas para a empresa ocupam uma fatia concentrada da
numeracao do fornecedor.

Diferente dos modulos de Fornecedores/Indicadores, esta analise NAO aplica
EXCLUDE_GRUPOS_RAW nem o filtro de QDE_COMPRADA > 0: o objetivo aqui e'
contar numeros de NF realmente emitidos, e qualquer linha (de qualquer
grupo/quantidade) e' evidencia valida de que aquela NF existe. Filtrar por
categoria de produto reduziria artificialmente o universo de NFs e
distorceria o intervalo menor/maior NF sem justificativa de negocio.

So entram na listagem fornecedores com pelo menos MIN_NFS_PARA_LISTA NFs no
periodo (volume minimo para o percentual de sequencia ser minimamente
representativo) — ver constante abaixo.

Uso:
    python build_data.py "caminho/para/base-raw-compras.xlsx"

Se nenhum caminho for passado, tenta usar "base-raw-compras.xlsx" em
raw-data/ na raiz do projeto.

Gera/sobrescreve: data.js (na mesma pasta deste script)
"""
import sys
import os
import json
from datetime import datetime
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, '..', '..', 'shared_py'))
from etl_common import raw_to_consolidada  # noqa: E402

FORN_COL = 'RAZAO FORNECEDOR'
NF_COL = 'N. NOTA'

MONTH_LABELS_PT = {
    '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
    '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
    '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
}

# Faixas do farol de alerta (limite INFERIOR de cada faixa, sem sobreposicao):
#   < 30%           -> normal
#   >= 30% e < 50%  -> atencao
#   >= 50% e < 70%  -> alto
#   >= 70%          -> critico
LIMIAR_ATENCAO = 30.0
LIMIAR_ALTO = 50.0
LIMIAR_CRITICO = 70.0

# Volume minimo de NFs distintas no periodo para o fornecedor entrar na
# listagem — abaixo disso o percentual de sequencia (Total NFs / Diferenca)
# nao e' representativo o bastante para avaliar concentracao. O pedido
# original definiu esse minimo como "entre 10 e 15" sem um numero unico;
# adotado o limite inferior (10) por ser a opcao mais inclusiva — ajuste
# aqui se um corte diferente for preferido.
MIN_NFS_PARA_LISTA = 10


def month_label(mes_str):
    try:
        ano, mes = str(mes_str).split('-')
        return f"{MONTH_LABELS_PT.get(mes, mes)}/{ano[-2:]}"
    except Exception:
        return str(mes_str)


def nivel_alerta(pct):
    if pct is None:
        return 'sem_dado'
    if pct < LIMIAR_ATENCAO:
        return 'normal'
    if pct < LIMIAR_ALTO:
        return 'atencao'
    if pct < LIMIAR_CRITICO:
        return 'alto'
    return 'critico'


def main():
    raw_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        BASE_DIR, '..', '..', 'raw-data', 'base-raw-compras.xlsx')
    if not os.path.exists(raw_path):
        print(f"ERRO: arquivo nao encontrado: {raw_path}")
        print('Uso: python build_data.py "base-raw-compras.xlsx"')
        sys.exit(1)

    print(f"Lendo base bruta: {raw_path}")
    df = raw_to_consolidada(raw_path, extra_columns=[NF_COL])
    print(f"Transformado em base consolidada: {len(df)} linhas")

    # Conversao defensiva: a planilha bruta ja traz N. NOTA como inteiro,
    # mas se algum valor vier como texto/vazio ele e' descartado aqui (nunca
    # inventado) e reportado.
    df[NF_COL] = pd.to_numeric(df[NF_COL], errors='coerce')
    n_invalidas = int(df[NF_COL].isna().sum())
    if n_invalidas:
        print(f"AVISO: {n_invalidas} linha(s) com N. NOTA invalido/ausente — descartadas da analise.")
    df = df[df[NF_COL].notna()].copy()
    df[NF_COL] = df[NF_COL].astype('int64')

    months = sorted(df['MES'].astype(str).unique())
    if months:
        periodo_label = month_label(months[0]) if len(months) == 1 else f"{month_label(months[0])}–{month_label(months[-1])}"
    else:
        periodo_label = 'sem dados'
    print(f"Periodo coberto pela base: {periodo_label} ({len(months)} mes(es))")

    # ---- Agregacao por fornecedor ----
    g = df.groupby(FORN_COL)[NF_COL].agg(total_nfs='nunique', menor_nf='min', maior_nf='max')
    g['diferenca'] = g['maior_nf'] - g['menor_nf']

    # Valor monetario total (soma de todas as NFs do fornecedor no periodo).
    valor_total_por_forn = df.groupby(FORN_COL)['VALOR_CONTABIL'].sum()

    # Categoria do fornecedor = GRUPO de maior valor comprado daquele
    # fornecedor (mesma logica de "Grupo Principal" ja usada no modulo de
    # Fornecedores — coluna GRUPO e' categoria de produto/servico, nao ha
    # cadastro separado de "categoria de fornecedor" na base).
    grupo_valor = df.groupby([FORN_COL, 'GRUPO'])['VALOR_CONTABIL'].sum().reset_index()
    idx_categoria = grupo_valor.groupby(FORN_COL)['VALOR_CONTABIL'].idxmax()
    categoria_por_forn = grupo_valor.loc[idx_categoria].set_index(FORN_COL)['GRUPO']

    n_abaixo_minimo = 0
    fornecedores = []
    for forn, row in g.iterrows():
        total_nfs = int(row['total_nfs'])
        if total_nfs < MIN_NFS_PARA_LISTA:
            n_abaixo_minimo += 1
            continue
        menor = int(row['menor_nf'])
        maior = int(row['maior_nf'])
        diferenca = int(row['diferenca'])
        if diferenca > 0:
            pct = round(total_nfs / diferenca * 100, 2)
        else:
            # menor NF == maior NF (uma unica NF, ou todas as NFs com o
            # mesmo numero): nao ha intervalo para comparar — N/A, nunca 0%
            # nem um percentual artificial.
            pct = None
        fornecedores.append({
            'fornecedor': str(forn),
            'categoria': str(categoria_por_forn.get(forn, 'NAO INFORMADO')),
            'total_nfs': total_nfs,
            'menor_nf': menor,
            'maior_nf': maior,
            'diferenca': diferenca,
            'valor_total': round(float(valor_total_por_forn.get(forn, 0.0)), 2),
            'pct_sequencia': pct,
            'alerta': nivel_alerta(pct),
        })

    print(f"Fornecedores abaixo do minimo de {MIN_NFS_PARA_LISTA} NFs (fora da lista): {n_abaixo_minimo}")

    # Ordenacao padrao: maior percentual primeiro; fornecedores sem
    # percentual valido (N/A) vao para o final, desempatados pelo total de
    # NFs (mais NFs primeiro).
    fornecedores.sort(key=lambda f: (
        f['pct_sequencia'] is None,
        -(f['pct_sequencia'] if f['pct_sequencia'] is not None else 0),
        -f['total_nfs'],
    ))

    resumo = {
        'total_fornecedores': len(fornecedores),
        'normal': sum(1 for f in fornecedores if f['alerta'] == 'normal'),
        'atencao': sum(1 for f in fornecedores if f['alerta'] == 'atencao'),
        'alto': sum(1 for f in fornecedores if f['alerta'] == 'alto'),
        'critico': sum(1 for f in fornecedores if f['alerta'] == 'critico'),
        'sem_dado': sum(1 for f in fornecedores if f['alerta'] == 'sem_dado'),
    }
    print(f"Fornecedores analisados: {resumo['total_fornecedores']} | "
          f"atencao={resumo['atencao']} alto={resumo['alto']} critico={resumo['critico']} "
          f"sem_dado={resumo['sem_dado']}")

    output = {
        'gerado_em': datetime.now().strftime('%d/%m/%Y %H:%M'),
        'periodo_label': periodo_label,
        'months_order': months,
        'limiares': {
            'atencao': LIMIAR_ATENCAO,
            'alto': LIMIAR_ALTO,
            'critico': LIMIAR_CRITICO,
        },
        'min_nfs_para_lista': MIN_NFS_PARA_LISTA,
        'resumo': resumo,
        'fornecedores': fornecedores,
    }

    out_path = os.path.join(BASE_DIR, 'data.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('const COMPLIANCE_DATA = ')
        json.dump(output, f, ensure_ascii=False, indent=2)
        f.write(';\n')
    print(f"Gerado: {out_path}")


if __name__ == '__main__':
    main()

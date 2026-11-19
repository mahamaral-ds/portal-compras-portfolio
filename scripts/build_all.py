"""
Regenera todo o portal a partir dos dados sinteticos, em um unico comando:

    1. scripts/gerar_dados_sinteticos.py  -> planilhas em raw-data/ (semente fixa, sempre identicas)
    2. build_data.py de cada modulo         -> data.js de cada pagina (e shared/portal-meta.js)

Uso (na raiz do projeto):
    python scripts/build_all.py            # gera os dados e reconstroi todos os modulos
    python scripts/build_all.py --so-build # reconstroi os modulos com as planilhas que ja estao em raw-data/
"""
import os
import subprocess
import sys
import time

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
RAW = os.path.join(RAIZ, 'raw-data')


def raw(nome):
    return os.path.join(RAW, nome)


BUILDS = [
    ('modules/overview-compras/build_data.py', [raw('base-raw-compras.xlsx'), raw('base-KPIs.xlsx')]),
    ('modules/indicadores/build_data.py', [raw('base-raw-compras.xlsx'), raw('base-KPIs.xlsx')]),
    ('modules/fornecedores/build_data.py', [raw('base-raw-compras.xlsx'), raw('complemento_fornecedores.xlsx'), raw('base-KPIs.xlsx')]),
    ('modules/fornecedores/build_data_performance.py', [raw('OTIF_base.xlsx')]),
    ('modules/cmc/build_data.py', [raw('base-CMC.xlsx'), raw('cmv-casas.xlsx')]),
    ('modules/analise-itens/build_data.py', [raw('base-raw-compras.xlsx'), raw('base-CMC.xlsx'), raw('cmv-casas.xlsx')]),
    ('modules/categorias/build_data.py', [raw('base-raw-compras.xlsx')]),
    ('modules/commodities/build_data.py', [raw('base-raw-compras.xlsx'), raw('indices-mercado.json')]),
    ('modules/compliance/build_data.py', [raw('base-raw-compras.xlsx')]),
]


def rodar(script, args):
    inicio = time.time()
    print(f'\n=== {script}', flush=True)
    r = subprocess.run([sys.executable, os.path.join(RAIZ, script)] + args, cwd=RAIZ)
    if r.returncode != 0:
        sys.exit(f'FALHOU: {script} (codigo {r.returncode})')
    print(f'--- ok em {time.time() - inicio:.0f}s', flush=True)


def main():
    if '--so-build' not in sys.argv:
        rodar('scripts/gerar_dados_sinteticos.py', [])
    for script, args in BUILDS:
        rodar(script, args)
    print('\nPortal regenerado. Abra index.html no navegador.')


if __name__ == '__main__':
    main()

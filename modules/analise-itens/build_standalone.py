"""
Gera o arquivo HTML unico (autocontido) do modulo "Analise de Itens" a partir
dos arquivos separados (index.html, style.css, dashboard.js, data.js,
xlsx.full.min.js). Remove a topbar do Portal (nao faz sentido em um arquivo
compartilhado sozinho, fora do contexto do Portal).

Uso:
    python build_standalone.py

Gera: dist/analise_itens_quintaluz.html

Atencao: por conter a base linha a linha (~250 mil registros), o arquivo
gerado fica bem maior que o dos outros modulos (dezenas de MB). Para
compartilhar por e-mail, prefira a Opcao B do README (link para a pasta do
Portal) em vez deste arquivo unico.
"""
import os
import re
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE_DIR, 'dist')


def read(fname):
    with open(os.path.join(BASE_DIR, fname), encoding='utf-8') as f:
        return f.read()


def read_shared(fname):
    with open(os.path.join(BASE_DIR, '..', '..', 'shared', fname), encoding='utf-8') as f:
        return f.read()


def main():
    html = read('index.html')
    css = read('style.css')
    xlsx_lib = read('xlsx.full.min.js')
    chartjs = read('chart.umd.min.js')
    period_filter_js = read_shared('portal-period-filter.js')
    data_js = read('data.js')
    dashboard_js = read('dashboard.js')

    html = html.replace('<link rel="stylesheet" href="../../shared/portal-style.css">\n', '')
    html = html.replace('<link rel="stylesheet" href="../../shared/portal-print.css">\n', '')
    html = html.replace('<div id="portalTopbar"></div>\n\n', '')
    html = re.sub(
        r'<script src="\.\./\.\./shared/portal-topbar\.js"></script>\s*'
        r'<script>\s*renderPortalTopbar\(\{.*?\}\);\s*</script>\s*',
        '',
        html,
        flags=re.S
    )

    html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')
    html = html.replace('<script src="xlsx.full.min.js"></script>', '<script>\n' + xlsx_lib + '\n</script>')
    html = html.replace('<script src="chart.umd.min.js"></script>', '<script>\n' + chartjs + '\n</script>')
    html = html.replace('<script src="../../shared/portal-period-filter.js"></script>', '<script>\n' + period_filter_js + '\n</script>')
    html = html.replace('<script src="data.js"></script>', '<script>\n' + data_js + '\n</script>')
    html = html.replace('<script src="dashboard.js"></script>', '<script>\n' + dashboard_js + '\n</script>')

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, 'analise_itens_quintaluz.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"OK -> {out_path} ({size_mb:.2f} MB) gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')}")


if __name__ == '__main__':
    main()

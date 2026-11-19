"""
Gera o arquivo HTML unico (autocontido) a partir dos arquivos separados do modulo
(index.html, style.css, dashboard.js, data.js, chart.umd.min.js — mais
performance-data.js e performance-dashboard.js, da aba "Performance de Compras").

Este arquivo standalone NAO inclui a topbar do Portal (logo + "Voltar ao menu"),
ja que ele se destina a ser compartilhado sozinho, fora do contexto do Portal.

Uso:
    python build_standalone.py

Gera: dist/dashboard_fornecedores_quintaluz.html
"""
import os
import re
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE_DIR, 'dist')

def read(fname):
    with open(os.path.join(BASE_DIR, fname), encoding='utf-8') as f:
        return f.read()

def main():
    html = read('index.html')
    css = read('style.css')
    chartjs = read('chart.umd.min.js')
    data_js = read('data.js')
    dashboard_js = read('dashboard.js')
    perf_data_js = read('performance-data.js')
    perf_dashboard_js = read('performance-dashboard.js')

    # Remove a topbar do Portal (link de CSS compartilhado, placeholder da topbar,
    # script + chamada de inicializacao) — nao faz sentido em um arquivo distribuido sozinho.
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

    html = html.replace(
        '<link rel="stylesheet" href="style.css">',
        '<style>\n' + css + '\n</style>'
    )
    html = html.replace(
        '<script src="chart.umd.min.js"></script>',
        '<script>\n' + chartjs + '\n</script>'
    )
    html = html.replace(
        '<script src="data.js"></script>',
        '<script>\n' + data_js + '\n</script>'
    )
    html = html.replace(
        '<script src="dashboard.js"></script>',
        '<script>\n' + dashboard_js + '\n</script>'
    )
    html = html.replace(
        '<script src="performance-data.js"></script>',
        '<script>\n' + perf_data_js + '\n</script>'
    )
    html = html.replace(
        '<script src="performance-dashboard.js"></script>',
        '<script>\n' + perf_dashboard_js + '\n</script>'
    )

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, 'dashboard_fornecedores_quintaluz.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"OK -> {out_path} ({size_mb:.2f} MB) gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')}")

if __name__ == '__main__':
    main()


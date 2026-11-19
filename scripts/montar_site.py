"""
Monta a pasta que vai para o GitHub Pages (padrao: _site/), so com o que o navegador precisa.

Entra:   index.html, 404.html, .nojekyll, assets/, shared/ e modules/ (HTML, CSS, JS, imagens e PDF)
Fica de fora: scripts Python (build_data.py etc.), server/, scripts/, shared_py/, raw-data/, planilhas,
              caches e qualquer arquivo de configuracao.

Uso (na raiz do projeto):
    python scripts/montar_site.py            # gera _site/
    python scripts/montar_site.py saida/     # gera em outra pasta
"""
import os
import shutil
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

ARQUIVOS_RAIZ = ['index.html', '404.html', '.nojekyll']
PASTAS = ['assets', 'shared', 'modules']

# Somente estes tipos sao publicados (lista de permissao: o que nao estiver aqui nao sai da maquina)
EXTENSOES_PERMITIDAS = {'.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif',
                        '.ico', '.pdf', '.woff', '.woff2'}
PASTAS_IGNORADAS = {'__pycache__', 'dist', 'node_modules', '.venv'}


def main():
    destino = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, '_site'))
    # a pasta e' apagada e recriada: nunca aceitar a propria raiz do projeto (ou uma pasta acima dela)
    if (RAIZ + os.sep).startswith(destino + os.sep):
        sys.exit(f'Destino invalido: {destino}')
    if os.path.isdir(destino):
        shutil.rmtree(destino)
    os.makedirs(destino)

    total = 0
    for nome in ARQUIVOS_RAIZ:
        origem = os.path.join(RAIZ, nome)
        if not os.path.isfile(origem):
            sys.exit(f'ERRO: arquivo obrigatorio ausente: {nome}')
        shutil.copy2(origem, os.path.join(destino, nome))
        total += 1

    for pasta in PASTAS:
        for dirpath, dirnames, filenames in os.walk(os.path.join(RAIZ, pasta)):
            dirnames[:] = [d for d in dirnames if d not in PASTAS_IGNORADAS]
            for f in filenames:
                if os.path.splitext(f)[1].lower() not in EXTENSOES_PERMITIDAS:
                    continue
                origem = os.path.join(dirpath, f)
                rel = os.path.relpath(origem, RAIZ)
                alvo = os.path.join(destino, rel)
                os.makedirs(os.path.dirname(alvo), exist_ok=True)
                shutil.copy2(origem, alvo)
                total += 1

    tamanho = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(destino) for f in fs)
    print(f'Site montado em {os.path.relpath(destino, RAIZ)}/: {total} arquivos, {tamanho / 1e6:.1f} MB')


if __name__ == '__main__':
    main()

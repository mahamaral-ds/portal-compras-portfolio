"""
Verificacao de vazamento: bloqueia a publicacao se encontrar credenciais ou termos sensiveis.

O que e' verificado
  1. Arquivos versionados (git ls-files) ou uma pasta informada (ex.: _site/, o que vai para o ar).
  2. --historico: TODO o historico do Git — conteudo de cada versao de cada arquivo, mensagens de commit e
     nome/e-mail de autor e de quem fez o commit (o historico de um repositorio publico tambem e' publico).

O que e' procurado
  - Termos sensiveis (nome real da empresa, marcas, casas, pessoas, dominios internos...). A lista NAO fica no
    repositorio, porque ela mesma revelaria o que se quer esconder. Ela vem de:
        * variavel de ambiente TERMOS_SENSIVEIS (um termo por linha) — no GitHub, um "secret" do repositorio;
        * arquivo local .termos-sensiveis.txt na raiz (um termo por linha, '#' comenta) — fica fora do Git.
    Maiusculas e acentos sao ignorados, e os separadores entre as palavras do termo sao opcionais: o termo
    "Empresa Modelo" casa com "EMPRESA MODELO", "Empresa.Modelo", "empresa-modelo" e "empresamodelo".
    O termo precisa aparecer inteiro (nao casa dentro de outra palavra).
  - Padroes de credenciais (chaves de API, tokens, chaves privadas), caminhos de rede/maquina local e
    endereços internos (SharePoint, intranet).
  - Tipos de arquivo que nunca devem ser publicados (planilhas, .env, chaves).

Uso (na raiz do projeto):
    python scripts/verificar_vazamento.py                  # arquivos versionados
    python scripts/verificar_vazamento.py --historico      # arquivos versionados + historico completo
    python scripts/verificar_vazamento.py --pasta _site    # o site montado
    python scripts/verificar_vazamento.py --exigir-termos  # falha se a lista de termos estiver vazia (CI)

Saida: codigo 0 = nada encontrado; 1 = encontrou algo (a publicacao deve ser bloqueada).
Os trechos encontrados sao mostrados MASCARADOS, para o proprio log do Actions nao expor o termo.
"""
import os
import re
import subprocess
import sys
import unicodedata

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ARQ_TERMOS_LOCAL = os.path.join(RAIZ, '.termos-sensiveis.txt')

# ---------------------------------------------------------------- padroes de credenciais e enderecos
PADROES = [
    ('chave Anthropic', r'sk-ant-[A-Za-z0-9_\-]{20,}'),
    ('chave OpenAI', r'\bsk-(?:proj-)?[A-Za-z0-9]{32,}'),
    ('chave AWS', r'\b(?:AKIA|ASIA)[0-9A-Z]{16}\b'),
    ('token GitHub', r'\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}'),
    ('token Slack', r'\bxox[abposr]-[A-Za-z0-9-]{10,}'),
    ('chave Google', r'\bAIza[0-9A-Za-z_\-]{35}\b'),
    ('chave Stripe', r'\b[sr]k_live_[0-9a-zA-Z]{20,}'),
    ('chave privada', r'-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY'),
    ('JWT', r'\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'),
    ('string de conexao', r'\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|mssql)://[^\s:@/]+:[^\s@/]+@'),
    ('segredo atribuido', r'''(?i)\b(?:api[_-]?key|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|passwd|password|senha)\b["']?\s*[:=]\s*["'][^"'\s]{12,}["']'''),
    ('caminho de usuario', r'(?i)\b[a-z]:[\\/]+(?:users|usuarios|documents and settings)[\\/]+[^\\/\s"\']+'),
    ('caminho de rede (UNC)', r'(?<![\\\w])\\\\[A-Za-z0-9][A-Za-z0-9._-]{1,62}\\[A-Za-z0-9$._ -]{1,80}'),
    ('OneDrive/SharePoint', r'(?i)onedrive\s*-\s*\w|\.sharepoint\.com|-my\.sharepoint'),
    ('endereco interno', r'(?i)https?://[a-z0-9.-]+\.(?:local|lan|corp|intranet|internal)\b'),
]
PADROES = [(nome, re.compile(p)) for nome, p in PADROES]

EXTENSOES_PROIBIDAS = {'.xlsx', '.xlsm', '.xls', '.csv', '.pem', '.key', '.p12', '.pfx', '.env'}
NOMES_PROIBIDOS = {'.env', 'id_rsa', 'id_ed25519', 'credentials.json', '.termos-sensiveis.txt'}

# Trechos que casam com os padroes acima mas sao legitimos (documentacao, exemplos)
PERMITIDOS = [
    re.compile(r'ANTHROPIC_API_KEY'),
]

LIMITE_BYTES = 50 * 1024 * 1024   # arquivos maiores nao sao lidos (nao devem existir no site)


# ---------------------------------------------------------------- termos sensiveis
def sem_acento(texto):
    """minusculas e sem acento: 'Emprésa' -> 'empresa'."""
    t = unicodedata.normalize('NFKD', texto)
    return ''.join(c for c in t if not unicodedata.combining(c)).lower()


def regex_do_termo(termo):
    """'Empresa Modelo' -> casa 'empresa modelo', 'empresa.modelo', 'empresamodelo'... como palavra inteira."""
    palavras = re.findall(r'[a-z0-9]+', sem_acento(termo))
    return re.compile(r'(?<![a-z0-9])' + r'[^a-z0-9\n]{0,3}'.join(map(re.escape, palavras)) + r'(?![a-z0-9])')


def carregar_termos():
    linhas = os.environ.get('TERMOS_SENSIVEIS', '').splitlines()
    if os.path.isfile(ARQ_TERMOS_LOCAL):
        with open(ARQ_TERMOS_LOCAL, encoding='utf-8') as f:
            linhas += f.read().splitlines()
    termos = {}
    for linha in linhas:
        linha = linha.split('#', 1)[0].strip()
        chave = ' '.join(re.findall(r'[a-z0-9]+', sem_acento(linha)))
        if len(chave.replace(' ', '')) >= 3:   # termos muito curtos dariam falso positivo em todo lugar
            termos[chave] = regex_do_termo(chave)
    return sorted(termos.items())


def mascarar(s):
    s = s.strip()
    if len(s) <= 4:
        return '*' * len(s)
    return s[:2] + '*' * (len(s) - 4) + s[-2:]


# ---------------------------------------------------------------- leitura
_RE_TRECHO_ASCII = re.compile(rb'[\x20-\x7e\t]{6,}')            # como o comando `strings`
_RE_TRECHO_UTF16 = re.compile(rb'(?:[\x20-\x7e]\x00|\x00[\x20-\x7e]){6,}')


def eh_binario(dados):
    try:
        dados[:65536].decode('utf-8')
        return b'\x00' in dados[:65536]
    except UnicodeDecodeError:
        return True


def textos_de(dados):
    """Texto para busca. Em binarios (PDF, imagens) so os trechos legiveis, em ASCII e UTF-16 (metadados de PDF),
    como o comando `strings`: ler os bytes crus como texto daria falsos positivos aleatorios."""
    if not eh_binario(dados):
        yield dados.decode('utf-8', errors='ignore')
        return
    yield '\n'.join(m.group(0).decode('ascii') for m in _RE_TRECHO_ASCII.finditer(dados))
    yield '\n'.join(m.group(0).replace(b'\x00', b'').decode('ascii') for m in _RE_TRECHO_UTF16.finditer(dados))


# Bibliotecas de terceiros minificadas (Chart.js, SheetJS): contem strings que parecem caminhos/segredos
# (ex.: comandos RTF "\trowd"). Nelas so os termos sensiveis sao procurados, nao os padroes.
def eh_biblioteca(origem):
    return origem.lower().split(' @')[0].endswith('.min.js')


def verificar_conteudo(origem, dados, termos, achados):
    if len(dados) > LIMITE_BYTES:
        achados.append((origem, 'arquivo grande demais para verificar', f'{len(dados) / 1e6:.0f} MB'))
        return
    vistos = set()
    for texto in textos_de(dados):
        for nome, rx in ([] if eh_biblioteca(origem) else PADROES):
            for m in rx.finditer(texto):
                trecho = m.group(0)
                if any(p.search(trecho) for p in PERMITIDOS) or (nome, trecho) in vistos:
                    continue
                vistos.add((nome, trecho))
                achados.append((origem, nome, mascarar(trecho)))
        if termos:
            normal = sem_acento(texto)
            for termo, rx in termos:
                if ('termo', termo) not in vistos and rx.search(normal):
                    vistos.add(('termo', termo))
                    achados.append((origem, 'termo sensivel', mascarar(termo)))


def verificar_nome(caminho, termos, achados):
    base = os.path.basename(caminho).lower()
    if os.path.splitext(base)[1] in EXTENSOES_PROIBIDAS or base in NOMES_PROIBIDOS or base.startswith('.env'):
        achados.append((caminho, 'tipo de arquivo proibido', base))
    n = sem_acento(caminho)
    for termo, rx in termos:
        if rx.search(n):
            achados.append((caminho, 'termo sensivel no nome do arquivo', mascarar(termo)))


def git(*args):
    return subprocess.run(['git', *args], cwd=RAIZ, capture_output=True, check=True).stdout


# ---------------------------------------------------------------- modos
def verificar_pasta(pasta, termos, achados):
    n = 0
    for dirpath, dirnames, filenames in os.walk(pasta):
        dirnames[:] = [d for d in dirnames if d != '.git']
        for f in filenames:
            caminho = os.path.join(dirpath, f)
            rel = os.path.relpath(caminho, pasta).replace(os.sep, '/')
            verificar_nome(rel, termos, achados)
            with open(caminho, 'rb') as fh:
                verificar_conteudo(rel, fh.read(), termos, achados)
            n += 1
    return n


def verificar_versionados(termos, achados):
    arquivos = [a for a in git('ls-files', '-z', '--cached', '--others', '--exclude-standard').decode().split('\0') if a]
    for rel in arquivos:
        caminho = os.path.join(RAIZ, rel)
        verificar_nome(rel, termos, achados)
        if os.path.isfile(caminho):
            with open(caminho, 'rb') as fh:
                verificar_conteudo(rel, fh.read(), termos, achados)
    return len(arquivos)


def verificar_historico(termos, achados):
    try:
        git('rev-parse', '--verify', 'HEAD')
    except subprocess.CalledProcessError:
        return 0, 0   # repositorio ainda sem commits
    # metadados: autor, e-mail, quem fez o commit e mensagem
    log = git('log', '--all', '--format=%H%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x1e').decode('utf-8', errors='ignore')
    commits = [c for c in log.split('\x1e') if c.strip()]
    for c in commits:
        partes = c.strip('\n').split('\x00')
        sha = partes[0][:10]
        verificar_conteudo(f'commit {sha} (autor/e-mail/mensagem)', '\n'.join(partes[1:]).encode(), termos, achados)
    # conteudo: cada versao de cada arquivo que ja existiu (blobs unicos)
    objetos = git('rev-list', '--all', '--objects').decode('utf-8', errors='ignore').splitlines()
    caminho_de = {}
    for linha in objetos:
        sha, _, caminho = linha.partition(' ')
        if caminho:
            caminho_de.setdefault(sha, caminho)
    blobs = []
    if caminho_de:
        r = subprocess.run(['git', 'cat-file', '--batch-check=%(objectname) %(objecttype)'], cwd=RAIZ,
                           input='\n'.join(caminho_de).encode(), capture_output=True, check=True)
        blobs = [l.split()[0] for l in r.stdout.decode().splitlines() if l.endswith(' blob')]
    for sha in blobs:
        caminho = caminho_de[sha]
        verificar_nome(f'historico: {caminho}', termos, achados)
        dados = git('cat-file', 'blob', sha)
        verificar_conteudo(f'historico: {caminho} @{sha[:10]}', dados, termos, achados)
    return len(commits), len(blobs)


def main():
    args = sys.argv[1:]
    termos = carregar_termos()
    if '--exigir-termos' in args and not termos:
        print('ERRO: a lista de termos sensiveis esta vazia.')
        print('      Cadastre o secret TERMOS_SENSIVEIS no repositorio (Settings > Secrets and variables > Actions).')
        return 1
    print(f'Termos sensiveis carregados: {len(termos)} (os termos nao sao exibidos)')

    achados = []
    if '--pasta' in args:
        pasta = os.path.abspath(args[args.index('--pasta') + 1])
        n = verificar_pasta(pasta, termos, achados)
        print(f'Pasta verificada: {os.path.relpath(pasta, RAIZ)}/ ({n} arquivos)')
    else:
        n = verificar_versionados(termos, achados)
        print(f'Arquivos do repositorio verificados: {n}')
        if '--historico' in args:
            nc, nb = verificar_historico(termos, achados)
            print(f'Historico verificado: {nc} commits, {nb} versoes de arquivos')

    if achados:
        print(f'\nBLOQUEADO: {len(achados)} ocorrencia(s) encontrada(s):')
        for origem, tipo, trecho in achados[:200]:
            print(f'  - {origem}: {tipo} [{trecho}]')
        if len(achados) > 200:
            print(f'  ... e mais {len(achados) - 200}')
        return 1
    print('OK: nenhuma credencial ou termo sensivel encontrado.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

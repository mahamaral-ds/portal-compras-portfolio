"""
Servidor local do Portal de Compras + Assistente (protótipo).

Serve os arquivos estáticos do portal e a API do Assistente na MESMA origem (sem CORS):

    GET  /api/health   -> {"ok": true, "claude": true|false, "modelo": "..."}
    POST /api/chat     -> {"messages": [{"role": "user", "content": "..."}, ...]}
                          <- {"resposta": "...", "fontes": [...], "ferramentas": [...], "uso": {...}}

A chave da API fica só neste processo (variável de ambiente ANTHROPIC_API_KEY); o navegador nunca a vê.

Uso (na pasta do projeto):
    server\\.venv\\Scripts\\python server\\app.py            # http://localhost:8765
    ...app.py --porta 9000
Protótipo local: escuta apenas em 127.0.0.1 (não é acessível por outras máquinas).
"""
import argparse
import json
import logging
import os
import sys
import threading
import time
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import anthropic

import assistente
import portal_tools

RAIZ = portal_tools.ROOT
PASTA_LOGS = Path(__file__).resolve().parent / 'logs'
MAX_CORPO = 64 * 1024
# pastas que nunca devem ser servidas pelo servidor estático
BLOQUEADAS = ('raw-data', 'server', '.git', '.claude', '.venv')
_limite_simultaneas = threading.Semaphore(4)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
log = logging.getLogger('app')


def registrar_conversa(ip, pergunta, saida=None, erro=None):
    """Guarda cada pergunta/resposta (para avaliar a qualidade e o custo); a pasta logs/ não é versionada."""
    try:
        PASTA_LOGS.mkdir(exist_ok=True)
        item = {'quando': datetime.now().isoformat(timespec='seconds'), 'ip': ip, 'pergunta': pergunta}
        if saida:
            item.update({'resposta': saida['resposta'], 'ferramentas': [(f['ferramenta'], f['argumentos'], f['erro']) for f in saida['ferramentas']],
                         'uso': saida['uso'], 'modelo': saida['modelo'], 'duracao_s': saida['duracao_s']})
        if erro:
            item['erro'] = erro
        with open(PASTA_LOGS / 'assistente.jsonl', 'a', encoding='utf-8') as f:
            f.write(json.dumps(item, ensure_ascii=False, default=str) + '\n')
    except OSError as e:
        log.warning('Não foi possível gravar o log: %s', e)


class Handler(SimpleHTTPRequestHandler):
    server_version = 'PortalCompras/0.1'

    # ---- estático (com pastas sensíveis bloqueadas) ----
    def translate_path(self, path):
        caminho = super().translate_path(path)
        try:
            relativo = Path(caminho).resolve().relative_to(RAIZ)
        except ValueError:
            return str(RAIZ / '__bloqueado__')
        if relativo.parts and relativo.parts[0] in BLOQUEADAS:
            return str(RAIZ / '__bloqueado__')
        return caminho

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.path.startswith('/api/'):
            log.info('%s %s', self.client_address[0], fmt % args)

    # ---- API ----
    def _json(self, status, corpo):
        dados = json.dumps(corpo, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_GET(self):
        if self.path.split('?')[0] == '/api/health':
            return self._json(200, {'ok': True, 'claude': assistente.claude_configurado(), 'modelo': assistente.MODELO})
        return super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] != '/api/chat':
            return self._json(404, {'erro': 'Rota não encontrada.'})
        if not assistente.claude_configurado():
            return self._json(503, {'erro': 'O Assistente com Claude está desligado neste servidor (ASSISTENTE_ATIVO e ANTHROPIC_API_KEY).'})
        try:
            tamanho = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            tamanho = 0
        if tamanho <= 0 or tamanho > MAX_CORPO:
            return self._json(413, {'erro': 'Corpo da requisição inválido ou grande demais.'})
        try:
            corpo = json.loads(self.rfile.read(tamanho).decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return self._json(400, {'erro': 'JSON inválido.'})

        ip = self.client_address[0]
        mensagens = corpo.get('messages') if isinstance(corpo, dict) else None
        pergunta = ''
        if isinstance(mensagens, list) and mensagens and isinstance(mensagens[-1], dict):
            pergunta = str(mensagens[-1].get('content', ''))[:500]

        if not _limite_simultaneas.acquire(blocking=False):
            return self._json(429, {'erro': 'O assistente está ocupado. Tente novamente em instantes.'})
        try:
            saida = assistente.responder(mensagens)
            registrar_conversa(ip, pergunta, saida=saida)
            return self._json(200, saida)
        except assistente.PedidoInvalido as e:
            return self._json(400, {'erro': str(e)})
        except anthropic.AuthenticationError:
            registrar_conversa(ip, pergunta, erro='autenticacao')
            return self._json(502, {'erro': 'A chave da API foi recusada. Verifique ANTHROPIC_API_KEY no servidor.'})
        except anthropic.RateLimitError:
            registrar_conversa(ip, pergunta, erro='limite')
            return self._json(429, {'erro': 'Limite de uso da API atingido. Tente novamente em alguns minutos.'})
        except (anthropic.APIConnectionError, anthropic.APITimeoutError):
            registrar_conversa(ip, pergunta, erro='conexao')
            return self._json(502, {'erro': 'Não consegui falar com o Claude agora. Tente novamente.'})
        except anthropic.APIStatusError as e:
            registrar_conversa(ip, pergunta, erro=f'api {e.status_code}')
            log.error('Erro da API: %s', e)
            return self._json(502, {'erro': 'A API do Claude devolveu um erro. Tente novamente.'})
        except Exception:  # noqa: BLE001 - nunca derrubar o servidor por uma pergunta
            log.exception('Falha inesperada no assistente')
            registrar_conversa(ip, pergunta, erro='interno')
            return self._json(500, {'erro': 'Erro interno ao consultar os dados.'})
        finally:
            _limite_simultaneas.release()


def main():
    ap = argparse.ArgumentParser(description='Servidor local do Portal de Compras + Assistente')
    ap.add_argument('--porta', type=int, default=8765)
    args = ap.parse_args()
    handler = partial(Handler, directory=str(RAIZ))
    servidor = ThreadingHTTPServer(('127.0.0.1', args.porta), handler)
    print(f'Portal:      http://localhost:{args.porta}/index.html')
    if assistente.claude_configurado():
        estado = f'Claude LIGADO ({assistente.MODELO}) — as perguntas geram custo na API'
    elif assistente.claude_ativo():
        estado = 'ligado, mas SEM chave (ANTHROPIC_API_KEY) — o chat usa o motor local'
    else:
        estado = 'DESLIGADO — o chat usa o motor local, sem custo. Para ligar: ASSISTENTE_ATIVO=1 e ANTHROPIC_API_KEY'
    print(f'Assistente:  {estado}')
    print('Ctrl+C para parar.')
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print('\nEncerrado.')


if __name__ == '__main__':
    main()

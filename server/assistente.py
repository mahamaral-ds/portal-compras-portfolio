"""
Assistente de Compras: laço de conversa com o Claude + ferramentas do portal.

Fluxo de cada pergunta:
  1. recebe o histórico (só texto) vindo do navegador;
  2. chama o Claude com as ferramentas de `portal_tools`;
  3. enquanto o Claude pedir ferramentas, executa-as sobre os data.js do portal e devolve os resultados;
  4. devolve o texto final + as fontes (extraídas das próprias ferramentas, não escritas pelo modelo).

Configuração por variáveis de ambiente (nenhuma chave fica no código):
  ASSISTENTE_ATIVO        1 liga o modo Claude. DESLIGADO por padrão: sem isso o servidor nunca chama a API
                          (e, portanto, não gera cobrança), mesmo que exista uma chave no ambiente
  ANTHROPIC_API_KEY       chave da API (obrigatória para o modo Claude)
  ASSISTENTE_MODELO       padrão: claude-opus-5-5
  ASSISTENTE_ESFORCO      low | medium | high  (padrão: medium)
  ASSISTENTE_FALLBACK     1 (padrão) usa o fallback server-side em caso de recusa; 0 desliga
  ASSISTENTE_MAX_ITER     máximo de rodadas de ferramentas por pergunta (padrão: 8)
"""
import json
import logging
import os
import time

import anthropic

import portal_tools

log = logging.getLogger('assistente')

MODELO = os.environ.get('ASSISTENTE_MODELO', 'claude-opus-5-5')
ESFORCO = os.environ.get('ASSISTENTE_ESFORCO', 'medium')
USAR_FALLBACK = os.environ.get('ASSISTENTE_FALLBACK', '1') != '0'
MAX_ITER = int(os.environ.get('ASSISTENTE_MAX_ITER', '8'))
MAX_TOKENS = 8000
MAX_TURNOS_HISTORICO = 12
MAX_CHARS_USUARIO = 2000
MAX_CHARS_ASSISTENTE = 6000


class PedidoInvalido(Exception):
    pass


def claude_ativo():
    """Chave geral: o modo Claude só existe se for ligado de propósito (ASSISTENTE_ATIVO=1)."""
    return os.environ.get('ASSISTENTE_ATIVO', '0') == '1'


def claude_configurado():
    """True só se o modo Claude está ligado E há credencial. É o que decide se alguma chamada à API pode acontecer."""
    return claude_ativo() and bool(os.environ.get('ANTHROPIC_API_KEY') or os.environ.get('ANTHROPIC_AUTH_TOKEN'))


def _prompt_do_sistema():
    meses = portal_tools.dados('categorias')['months_order']
    periodo = f"{portal_tools._rotulo_mes(meses[0])} a {portal_tools._rotulo_mes(meses[-1])}"
    return f"""Você é o Assistente de Compras do Portal de Compras do Grupo Quintaluz Gastronomia (empresa fictícia, dados sintéticos). Responde, em português do Brasil, perguntas do time sobre as compras do grupo: categorias, fornecedores, itens, preços, indicadores (CMV, PMP, DIO), inflação e regionalização.

Os dados do portal cobrem {periodo}. Cada ferramenta informa em `dados_gerados_em` quando os dados daquele módulo foram gerados.

REGRAS DE OURO
1. Todo número, nome e fato sobre as compras vem das ferramentas. Nunca use memória, estimativa ou conhecimento geral para valores do portal. Se nenhuma ferramenta responde à pergunta, diga com clareza que o portal não tem esse dado e ofereça o que você consegue consultar.
2. Reproduza os valores exatamente como a ferramenta devolveu (ex.: "R$ 31.826.946", "34,7%"): não recalcule, não arredonde de novo e não troque o formato. Só faça contas simples quando precisar (por exemplo, somar dois valores) e deixe claro que é uma soma dos números consultados.
3. Se a pergunta for ambígua (vários itens, fornecedores ou categorias possíveis), pergunte ao usuário qual ele quer, listando as opções, em vez de adivinhar.
4. Respeite as limitações que as ferramentas informam e mencione-as quando afetarem a resposta, por exemplo: a inflação existe só para a empresa inteira (nunca por categoria ou item); o histórico mensal de preço cobre apenas os itens de maior valor; o preço por fornecedor cobre só os fornecedores analisados em "Itens por Fornecedor"; saving potencial é oportunidade teórica, não meta.
5. Se uma ferramenta devolver erro, tente reformular a chamada uma vez; se continuar sem resposta, explique o que não foi possível consultar.
6. Seja objetivo: responda primeiro o que foi perguntado, depois acrescente só o contexto que ajuda a decidir. Indique o período a que os números se referem.

FORMATO
Texto simples em parágrafos curtos. Para listas, use linhas começando com "- ". Use **negrito** apenas para destacar o essencial. Não use tabelas, títulos (#) nem emojis. Não escreva a linha de fonte: o sistema acrescenta automaticamente as fontes consultadas.

ESCOPO
Responda apenas sobre os dados e indicadores do portal. Para assuntos fora disso, explique gentilmente que só consegue ajudar com as compras do grupo."""


def validar_historico(mensagens):
    """Valida e limita o histórico recebido do navegador (somente texto)."""
    if not isinstance(mensagens, list) or not mensagens:
        raise PedidoInvalido('Envie ao menos uma mensagem.')
    limpas = []
    for m in mensagens:
        if not isinstance(m, dict) or m.get('role') not in ('user', 'assistant') or not isinstance(m.get('content'), str):
            raise PedidoInvalido('Formato de mensagem inválido.')
        texto = m['content'].strip()
        if not texto:
            continue
        limite = MAX_CHARS_USUARIO if m['role'] == 'user' else MAX_CHARS_ASSISTENTE
        if m['role'] == 'user' and len(texto) > limite:
            raise PedidoInvalido(f'A pergunta passa de {limite} caracteres.')
        limpas.append({'role': m['role'], 'content': texto[:limite]})
    limpas = limpas[-MAX_TURNOS_HISTORICO:]
    while limpas and limpas[0]['role'] != 'user':
        limpas.pop(0)
    # papéis precisam alternar; mensagens seguidas do mesmo papel são fundidas
    fundidas = []
    for m in limpas:
        if fundidas and fundidas[-1]['role'] == m['role']:
            fundidas[-1]['content'] += '\n' + m['content']
        else:
            fundidas.append(dict(m))
    if not fundidas or fundidas[-1]['role'] != 'user':
        raise PedidoInvalido('A última mensagem precisa ser do usuário.')
    return fundidas


_cliente = None


def _obter_cliente():
    global _cliente
    if _cliente is None:
        _cliente = anthropic.Anthropic(max_retries=2, timeout=120.0)
    return _cliente


def _criar_mensagem(cliente, **params):
    """Chama a API. Com fallback ligado usa o endpoint beta (server-side fallback em recusa); se a API recusar
    a forma, repete sem o fallback."""
    global USAR_FALLBACK
    if USAR_FALLBACK:
        try:
            return cliente.beta.messages.create(betas=['server-side-fallback-2026-07-01'], fallbacks='default', **params)
        except (anthropic.BadRequestError, TypeError) as e:
            log.warning('Fallback server-side indisponível (%s); seguindo sem ele.', e)
            USAR_FALLBACK = False
    return cliente.messages.create(**params)


def responder(mensagens, cliente=None):
    """Roda uma pergunta completa. `cliente` permite injetar um cliente falso nos testes."""
    mensagens = validar_historico(mensagens)
    cliente = cliente or _obter_cliente()
    sistema = _prompt_do_sistema()
    ferramentas = portal_tools.definicoes_para_claude()
    conversa = [dict(m) for m in mensagens]

    fontes, usadas = [], []
    uso = {'entrada': 0, 'saida': 0, 'cache_lido': 0}
    inicio = time.time()
    resposta = None

    for _ in range(MAX_ITER):
        resposta = _criar_mensagem(
            cliente, model=MODELO, max_tokens=MAX_TOKENS, system=sistema, tools=ferramentas, messages=conversa,
            thinking={'type': 'adaptive'}, output_config={'effort': ESFORCO},
        )
        u = getattr(resposta, 'usage', None)
        if u:
            uso['entrada'] += getattr(u, 'input_tokens', 0) or 0
            uso['saida'] += getattr(u, 'output_tokens', 0) or 0
            uso['cache_lido'] += getattr(u, 'cache_read_input_tokens', 0) or 0

        if resposta.stop_reason == 'refusal':
            return _saida('Não consegui responder a essa pergunta. Tente reformulá-la com foco nas compras do grupo.',
                          fontes, usadas, uso, inicio, recusa=True)
        if resposta.stop_reason != 'tool_use':
            break

        conversa.append({'role': 'assistant', 'content': resposta.content})
        resultados = []
        for bloco in resposta.content:
            if bloco.type != 'tool_use':
                continue
            texto, erro = portal_tools.executar(bloco.name, bloco.input)
            usadas.append({'ferramenta': bloco.name, 'argumentos': bloco.input, 'erro': erro})
            if not erro:
                try:
                    f = json.loads(texto).get('fonte')
                    if f:
                        for parte in f.split(';'):
                            parte = parte.strip()
                            if parte and parte not in fontes:
                                fontes.append(parte)
                except ValueError:
                    pass
            r = {'type': 'tool_result', 'tool_use_id': bloco.id, 'content': texto}
            if erro:
                r['is_error'] = True
            resultados.append(r)
        conversa.append({'role': 'user', 'content': resultados})
    else:
        return _saida('A consulta ficou longa demais e foi interrompida. Tente uma pergunta mais específica.',
                      fontes, usadas, uso, inicio, interrompido=True)

    if resposta.stop_reason == 'max_tokens':
        log.warning('Resposta truncada por max_tokens.')
    texto = ''.join(b.text for b in resposta.content if b.type == 'text').strip()
    if not texto:
        texto = 'Não consegui montar uma resposta para essa pergunta. Tente reformulá-la.'
    return _saida(texto, fontes, usadas, uso, inicio)


def _saida(texto, fontes, usadas, uso, inicio, **extra):
    return {'resposta': texto, 'fontes': fontes, 'ferramentas': usadas, 'uso': uso, 'modelo': MODELO,
            'duracao_s': round(time.time() - inicio, 2), **extra}

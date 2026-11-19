# Servidor local do Assistente (protótipo)

Liga o **Claude** à página **Assistente** (Supply Chat) do portal. O portal continua sendo arquivos estáticos;
este servidor serve os mesmos arquivos **e** a API do Assistente, na mesma origem.

```
navegador ──► /api/chat ──► assistente.py ──► Claude (API)
                                  │  ▲
                                  ▼  │ resultados
                            portal_tools.py ──► data.js dos módulos
```

- **Desligado por padrão**: o servidor só chama o Claude (e, portanto, só gera custo) se `ASSISTENTE_ATIVO=1` **e** houver
  `ANTHROPIC_API_KEY`. Sem isso, o chat usa o motor local, sem custo.
- A **chave da API fica só neste processo** (variável de ambiente). O navegador nunca a recebe.
- O Claude **não recebe os dados nem "lembra" de números**: ele chama ferramentas (`portal_tools.py`) que leem os
  `data.js`, calculam e devolvem os valores já formatados e a fonte. A resposta é redigida só a partir disso.
- As **fontes** mostradas no chat vêm das próprias ferramentas usadas, não do texto do modelo.
- Sem servidor, sem chave ou com falha de conexão, a página usa o motor local (`modules/supply-chat/engine.js`).
  Um selo no topo informa o modo: **Claude conectado** ou **Modo local**.

## Como rodar

Na pasta do projeto (PowerShell):

```powershell
python -m venv server\.venv
server\.venv\Scripts\pip install -r server\requirements.txt
$env:ASSISTENTE_ATIVO = "1"                     # liga o modo Claude (desligado por padrão)
$env:ANTHROPIC_API_KEY = "sk-ant-..."          # a sua chave; não coloque no código nem no repositório
server\.venv\Scripts\python server\app.py       # abre em http://localhost:8765/index.html
```

Abra o portal por **http://localhost:8765/index.html** (e não pelo arquivo direto) para o Assistente usar o Claude.
Escuta só em `127.0.0.1` — outras máquinas não acessam.

## Configuração (variáveis de ambiente)

| Variável | Padrão | O que faz |
|---|---|---|
| `ASSISTENTE_ATIVO` | `0` | `1` liga o modo Claude; qualquer outro valor mantém desligado |
| `ANTHROPIC_API_KEY` | — | Chave da API (obrigatória para o modo Claude) |
| `ASSISTENTE_MODELO` | `claude-opus-5-5` | Modelo. `claude-sonnet-5-5` é mais barato e costuma bastar para consultas |
| `ASSISTENTE_ESFORCO` | `medium` | `low` / `medium` / `high` — quanto o modelo "pensa" antes de responder |
| `ASSISTENTE_FALLBACK` | `1` | Fallback server-side em caso de recusa do modelo; `0` desliga (se a API recusar o formato, ele se desliga sozinho) |
| `ASSISTENTE_MAX_ITER` | `8` | Máximo de rodadas de ferramentas por pergunta |

## Ferramentas (o que o Assistente consegue consultar)

`resumo_geral`, `categorias`, `detalhar_categoria`, `ranking_fornecedores` (geral, por categoria ou por segmento),
`detalhar_fornecedor`, `buscar_itens`, `preco_item`, `variacao_precos`, `evolucao_mensal`,
`indicadores_executivos` (CMV, PMP, DIO, inflação) e `regionalizacao`. Para acrescentar uma pergunta nova,
escreva uma função em `portal_tools.py` e registre-a em `FERRAMENTAS`.

## Atualização dos dados

As ferramentas leem os `data.js` dos módulos e **recarregam sozinhas quando o arquivo muda** (basta rodar o
`build_data.py` do módulo). Cada resposta da ferramenta traz `dados_gerados_em`. Atenção: o Assistente só enxerga
o que já foi gerado nos `data.js` — uma planilha bruta nova só aparece depois de reconstruir os módulos.

## Testes

```powershell
server\.venv\Scripts\python -m unittest discover -s server/tests -v
```

Rodam sem chamar a API (o Claude é substituído por um cliente falso). Um teste extra compara categorias e
fornecedores com a soma direta da planilha bruta; ele só roda se `raw-data/base-raw-compras.xlsx` existir e o
ambiente tiver `pandas` e `openpyxl`.

## Registro de uso

Cada pergunta é gravada em `server/logs/assistente.jsonl` (pergunta, ferramentas usadas, tokens, tempo). A pasta
não é versionada. Serve para avaliar a qualidade das respostas e estimar o custo por pergunta.

## Limites deste protótipo (o que falta para liberar ao grupo todo)

- **Sem login**: qualquer pessoa que alcance o servidor usa a chave. Hoje ele só escuta em `127.0.0.1`.
- **Sem limite de uso por pessoa** (só no máximo de 4 perguntas simultâneas) e sem teto de gasto próprio — configure
  um limite mensal na conta da Anthropic.
- **Hospedagem**: precisa de um lugar onde o servidor rode continuamente e onde os `data.js` estejam disponíveis.
- **Dados sensíveis**: perguntas e resultados das ferramentas passam pela API da Anthropic; confirme com TI/jurídico.

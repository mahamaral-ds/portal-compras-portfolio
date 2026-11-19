# Portal de Compras — Business Intelligence (projeto de portfólio)

**🔗 Site publicado: <https://mahamaral-ds.github.io/portal-compras-portfolio/>**

[![Publicar no GitHub Pages](https://github.com/mahamaral-ds/portal-compras-portfolio/actions/workflows/pages.yml/badge.svg)](https://github.com/mahamaral-ds/portal-compras-portfolio/actions/workflows/pages.yml)

Portal de BI para a área de Compras de uma rede de restaurantes: um menu central dá acesso a onze módulos
(dashboards independentes) com gasto, fornecedores, preços, custo da mercadoria, desempenho de entrega,
compliance, projetos e capacitação.

> **Todos os dados deste repositório são sintéticos.** A empresa, o **Grupo Quintaluz Gastronomia**, é fictícia, assim
> como as marcas, casas, fornecedores, compradores, itens, notas fiscais, valores, notícias e projetos. Os números
> são gerados por um script com semente fixa (veja [Dados sintéticos](#dados-sintéticos)) e não representam nenhuma
> empresa real.

O portal é **100% estático** (HTML, CSS e JavaScript puros, sem backend e sem etapa de build no front-end). Um script
Python por módulo (`build_data.py`) transforma as planilhas de origem em um `data.js` pronto para o navegador.

---

## Páginas e funcionalidades

O menu principal (`index.html`) organiza os módulos em **grupos recolhíveis** (o estado fica salvo no navegador),
exibidos em grade de cards. Ele mostra o período da base e destaca o módulo de onde o usuário acabou de voltar.

| Módulo | Abas e destaques |
|---|---|
| **Overview Compras** | Panorama do setor: gasto, pedidos, fornecedores, ticket médio, inflação interna, histórico de CMV e principais fornecedores e categorias. |
| **Indicadores** | KPIs executivos mês a mês, CMV 2025 × 2026 com inflação, PMP × DIO com metas. |
| **Fornecedores e Performance** | Visão Geral, Curva ABC, Ranking, Análise por Categoria, Fornecedor × Vertical, **OTIF** (no prazo e completo, por fornecedor, comprador e categoria), Regionalização por UF e **Itens por Fornecedor** (preço, melhor preço e saving potencial). |
| **CMV e CMC** | Indicador alternável CMV/CMC por casa, vertical e região: Visão Geral, Ranking de Casas (média e mediana) e Geolocalização. |
| **Análise de Itens** | Histórico de Preços, Preços por Geolocalização (heatmap por região), Curva ABC, Top Itens por Categoria e Tabela Detalhada linha a linha com exportação para Excel. As análises de preço usam a **unidade de referência** de cada item. |
| **Categorias** | Visão Geral, Ranking, Composição (treemap proporcional ao valor) e Evolução Mensal. |
| **Commodities e Insights** | Painel de Commodities (índice de preço pago × IPCA e dólar) e Notícias de Mercado com filtros por tema, impacto e período. |
| **Pipeline de Projetos** | Kanban de projetos (filtros, detalhes, criação e edição) e **Planejamento de RFPs** (calendário de rodadas por categoria), com modo de edição. |
| **Gestão do Conhecimento** | Biblioteca de materiais e Guia de Strategic Sourcing em 8 etapas, com carrosséis de slides e PDF para download. |
| **Compliance** | NF Sequencial: concentração da numeração de notas por fornecedor, com farol (normal, atenção, alto, crítico) e cards de status clicáveis. |
| **Supply Chat** | Busca em linguagem natural sobre os dados do portal (motor local; opcionalmente ligado ao Claude pelo servidor em `server/`). |

Componentes compartilhados (`shared/`), usados em todas as páginas:

- **Topbar** com logo, trilha de navegação e "Voltar ao menu".
- **Filtros suspensos** com checkboxes e busca, inclusive no modo de seleção única (`portal-filters.js`).
- **Calendário de período**, por dia ou por mês, e chips de mês com **seleção múltipla por Ctrl+clique**. As métricas
  são recalculadas por união de identidades: um item ou fornecedor que aparece em vários meses é contado uma vez só.
- **Barra de rolagem superior** nas tabelas largas e padrão visual único de gráficos (`portal-charts.js`).
- Tema visual (`portal-style.css`, `portal-theme.css`) e higiene de impressão (`portal-print.css`).

Na **demonstração**, a edição do Pipeline (projetos e RFPs) fica habilitada. O botão "Habilitar edição" pede a senha
de demonstração **`demo`**, que aparece na própria janela. Como o site é estático, as edições ficam salvas só no
`localStorage` do navegador de quem visita: um aviso na página explica isso, e o botão "Restaurar dados de exemplo"
volta aos dados originais. No site publicado, o **Supply Chat** usa sempre o motor local (o modo com Claude depende do
servidor em `server/`, que só roda na sua máquina).

## Tecnologias

- **Front-end:** HTML5, CSS3 e JavaScript puro (sem framework), [Chart.js](https://www.chartjs.org/) para os gráficos
  e [SheetJS](https://sheetjs.com/) para a exportação em Excel. As duas bibliotecas estão incluídas em `modules/*/`.
- **Dados e ETL:** Python 3 com pandas, NumPy e openpyxl.
- **Material gráfico:** Pillow; os slides usam a fonte DejaVu Sans, que vem com o matplotlib.
- **Assistente (opcional):** servidor local em Python com a API do Claude (`server/`, ver `server/README.md`).
- **Publicação:** GitHub Pages, com deploy automático pelo GitHub Actions (`.github/workflows/pages.yml`).

## Estrutura

```
projeto_portal_compras_portfolio/
├── index.html                 menu principal
├── 404.html                   página de "não encontrada" do site publicado
├── .nojekyll                  faz o GitHub Pages servir os arquivos como estão (sem Jekyll)
├── .github/workflows/pages.yml  deploy automático no GitHub Pages
├── assets/                    logo (quintaluz-logo.svg) e favicon (svg/png), originais do projeto
├── shared/                    topbar, filtros, calendário, gráficos, tema e metadados do período (portal-meta.js)
├── shared_py/
│   ├── etl_common.py          planilha bruta de notas -> base consolidada (padronização de fornecedores, categorias, itens)
│   ├── catalogo_ficticio.py   casas, verticais e regiões do grupo fictício
│   └── casa_geo_map.py        casa (nome por extenso) -> código das bases de CMC/CMV
├── modules/<módulo>/          index.html + style.css + dashboard.js + data.js (+ build_data.py)
├── scripts/
│   ├── gerar_dados_sinteticos.py   gera todas as planilhas de origem em raw-data/
│   ├── build_all.py                gera os dados e reconstrói todos os módulos
│   ├── gerar_material_treinamento.py  slides e PDF da Gestão do Conhecimento
│   ├── gerar_favicon_png.py        favicon.png a partir das formas do favicon.svg
│   ├── montar_site.py              monta _site/ só com o que vai para o ar (HTML, CSS, JS, imagens, PDF)
│   └── verificar_vazamento.py      bloqueia a publicação se achar credenciais ou termos sensíveis
├── server/                    protótipo do Assistente com Claude (opcional)
└── raw-data/                  planilhas geradas (fora do Git; recriadas pelo gerador)
```

## Como executar localmente

Os `data.js` já estão no repositório, então não é preciso instalar nada para **ver** o portal:

1. Abra `index.html` direto no navegador (duplo clique). A navegação usa links relativos e funciona via `file://`.
2. Se preferir um servidor local:

   ```bash
   python -m http.server 8743
   ```

   Depois acesse <http://localhost:8743/index.html>.

## Publicação e deploy automático

O site é publicado no **GitHub Pages** pelo workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml).
Todo `git push` na branch `main` dispara o workflow, que:

1. **Verifica vazamentos** no código e em todo o histórico do Git (conteúdo, mensagens, autor e e-mail dos commits):
   chaves de API, tokens, chaves privadas, caminhos da máquina ou de rede, endereços internos, planilhas e os termos
   sensíveis cadastrados no secret `TERMOS_SENSIVEIS`;
2. **Gera os dados sintéticos** e reconstrói os `data.js` (`scripts/build_all.py`, semente fixa);
3. **Monta a pasta do site** (`scripts/montar_site.py` → `_site/`), só com HTML, CSS, JS, imagens e PDF.
   Scripts Python, servidor e planilhas não vão para o ar;
4. **Verifica de novo** a pasta `_site/`, que é exatamente o que será publicado;
5. **Publica** no GitHub Pages.

Se qualquer etapa falhar, nada é publicado e o site continua na versão anterior. O andamento fica na aba
**Actions** do repositório.

A lista de termos sensíveis **não fica no repositório** (ela própria revelaria o que se quer proteger). No GitHub ela
fica no secret `TERMOS_SENSIVEIS`; na sua máquina, em `.termos-sensiveis.txt` (ignorado pelo Git), um termo por linha.
Para rodar a mesma verificação antes de um push:

```bash
python scripts/verificar_vazamento.py --historico
```

## Dados sintéticos

### Como regenerar

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # Windows (Linux/macOS: .venv/bin/pip)
.venv/Scripts/python scripts/build_all.py          # gera raw-data/ e reconstrói todos os data.js (~10 min)
```

- `python scripts/gerar_dados_sinteticos.py` gera só as planilhas de `raw-data/`.
- `python scripts/build_all.py --so-build` reconstrói os módulos a partir das planilhas que já existem.
- `python scripts/gerar_material_treinamento.py` gera de novo os slides e o PDF da Gestão do Conhecimento.

A semente é fixa (`SEED = 20261030` no topo do gerador): rodar de novo produz exatamente os mesmos dados. Para outro
conjunto de dados, basta trocar a semente.

### O que é gerado

Todas as planilhas seguem exatamente o esquema (abas, colunas e tipos) que os `build_data.py` leem. Por isso nenhuma
página precisou de mudança de lógica.

| Arquivo | Conteúdo |
|---|---|
| `base-raw-compras.xlsx` | ~60 mil linhas de itens de nota fiscal (jan–ago/2026), 24 casas e a central de produção, ~170 fornecedores e ~265 itens |
| `complemento_fornecedores.xlsx` | CNPJ, UF e prazo médio de pagamento de cada fornecedor (alguns sem cadastro ou com filiais em UFs diferentes) |
| `OTIF_base.xlsx` | Pedidos com previsão, entrega, atraso e completude; compradores fictícios |
| `base-CMC.xlsx` / `cmv-casas.xlsx` | Vendas, compras, CMC e CMV por casa e mês |
| `base-KPIs.xlsx` | Inflação interna, PMP, DIO, cotações, contratos e CMV (jan/2025–ago/2026) |
| `indices-mercado.json` | IPCA por grupo e dólar, séries simuladas no formato das séries públicas |

### Como os dados ficam realistas e coerentes

- **Concentração de gasto:** popularidade dos itens com distribuição lognormal e porte dos fornecedores com
  distribuição de Pareto, o que produz uma Curva ABC realista. Casas têm portes diferentes e mix de compra por
  vertical (bares compram mais bebidas; cafeterias, mais café, padaria e laticínios).
- **Preços no tempo:** cada item tem uma tendência (alta, queda ou estabilidade) com ruído, mais um choque mensal da
  sua família de commodity (bovinos, aves, café…) e sazonalidade no hortifrúti. Há também diferenças regionais e
  por fornecedor.
- **Sazonalidade de volume:** fatores mensais (alta em janeiro e julho, baixa em fevereiro).
- **Unidades de medida:** parte dos itens é comprada também em caixa (`CX`). Há registros suspeitos de propósito
  (caixa faturada como unidade, erros de preço), o que exercita a regra de unidade de referência e as conversões.
- **NF Sequencial:** a numeração das notas de cada fornecedor é gerada com intervalos médios diferentes, cobrindo
  todos os níveis do farol, de normal a crítico.
- **Coerência entre bases:**
  - as compras da base de CMC são a soma das notas de cada casa e mês;
  - os pedidos do OTIF são as próprias notas;
  - o CMV dos KPIs vem da base de CMV;
  - a inflação interna é o índice de preço pago calculado sobre as notas;
  - o IPCA sintético de cada família acompanha o choque de preço usado nas notas.
- **Casos de borda:** variações de grafia de fornecedores (unificadas pelo ETL), uma transação intercompany
  (excluída), itens com nomes diferentes para o mesmo produto (unificados), uma casa inaugurada no meio do período,
  uma casa sem código nas bases de CMC e linhas sem quantidade.

Nenhum nome ou valor real foi usado como base. Os nomes de fornecedores são formados por sílabas sorteadas, e os
CNPJs têm dígitos verificadores válidos, mas a raiz fica na faixa 90.000.000–99.999.999, reservada aqui para dados
fictícios.

## Identidade visual

| Token | Valor | Uso |
|---|---|---|
| `--brand` | `#2453A6` | Azul-anil: ações, abas e filtros ativos, foco |
| `--brand-deep` | `#15306A` | Tons escuros e gradientes |
| `--brand-light` | `#6E9BF0` | Tons claros e detalhes do logo |
| `--ink` | `#121A2B` | Texto principal, topbar e painel do menu |
| `--paper` | `#F6F7FA` | Fundo das páginas |
| `--line` | `#E1E5EE` | Bordas |
| `--muted` | `#6B7385` | Texto secundário |

O logo (um prato com a linha do horizonte) e o favicon são formas geométricas simples, desenhadas para este
projeto. As cores semânticas dos gráficos (verde, âmbar e vermelho de status, classes A/B/C) não mudam com a marca.

# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa
[Versionamento Semântico](https://semver.org/lang/pt-BR/) de forma leve.

## [Unreleased]

### Adicionado
- Publicação no GitHub Pages com deploy automático a cada push na `main` (`.github/workflows/pages.yml`).
- Verificação de vazamento (`scripts/verificar_vazamento.py`) no código, no histórico do Git e no site montado,
  que bloqueia a publicação ao encontrar credenciais ou termos sensíveis.
- Montagem do site só com os arquivos do front-end (`scripts/montar_site.py`), `404.html` e `.nojekyll`.
- Pipeline de Projetos: aviso de demonstração e botão "Restaurar dados de exemplo".

### Alterado
- Supply Chat: só procura o servidor do assistente quando aberto em `localhost` (sem requisições 404 no site estático).
- `requirements.txt` com versões fixas, para o workflow gerar os mesmos dados da máquina local.

## [1.0.0] - 2026-10-30

### Adicionado
- Versão de portfólio do Portal de Compras, com a empresa fictícia **Grupo Quintaluz Gastronomia**.
- Gerador de dados 100% sintéticos com semente fixa (`scripts/gerar_dados_sinteticos.py`) e reconstrução de todo o
  portal em um comando (`scripts/build_all.py`).
- Identidade visual própria: logo, favicon e paleta azul-anil.
- Guia de Strategic Sourcing com texto, slides e PDF originais (`scripts/gerar_material_treinamento.py`).
- Notícias de mercado, projetos e RFPs fictícios para as páginas de Commodities e Pipeline.

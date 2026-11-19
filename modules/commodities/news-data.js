/*
 * Notícias de Mercado — Café, Panificação e Food Service (CONTEÚDO FICTÍCIO)
 * --------------------------------------------------------------------------
 * Versão de demonstração do portal: todas as notícias abaixo foram escritas para
 * o projeto de portfólio. Fontes, números e acontecimentos são fictícios e não
 * devem ser lidos como informação de mercado. Por isso os itens não têm link
 * externo (link '#'): o card mostra só o resumo na própria página.
 *
 * Schema de cada item:
 *   id       - string única
 *   titulo   - string
 *   fonte    - string (veículo fictício)
 *   data     - 'YYYY-MM-DD'
 *   tema     - uma das chaves de NEWS_TEMAS abaixo (granularidade fina, usada nos filtros)
 *   secao    - uma das chaves de NEWS_SECOES abaixo (agrupamento editorial da página)
 *   destaque - boolean; true = aparece na área de "Principais notícias" no topo
 *   resumo   - string objetiva (3-5 frases)
 *   impacto  - { direcao: 'alta'|'baixa'|'atencao'|null, texto: string }
 *              'alta' = possível aumento de preço, 'baixa' = possível redução,
 *              'atencao' = impacto misto/incerto que merece acompanhamento
 *   link     - URL da matéria ('#' nos itens fictícios)
 */

const NEWS_TEMAS = {
  cafe: 'Café',
  laticinios: 'Lácteos',
  cacau: 'Cacau e Chocolate',
  trigo: 'Trigo e Panificação',
  embalagens: 'Embalagens',
  clima: 'Clima e Safra',
  inflacao: 'Inflação',
  cambio: 'Câmbio',
  juros: 'Juros e Crédito',
};

const NEWS_SECOES = {
  mercado_precos: { titulo: 'Mercado e Preços', sub: 'Preços de café, lácteos, cacau e insumos de padaria, inflação e movimentos de oferta e demanda' },
  producao_agricultura: { titulo: 'Produção e Agricultura', sub: 'Safras de café, clima, captação de leite e oferta de matérias-primas' },
  economia_impactos: { titulo: 'Economia e Impactos no Setor', sub: 'Câmbio, juros e custos que afetam cafeterias e o food service' },
};

const CATEGORIAS_NEWS = {
  atualizado_em: '2026-10-20',
  itens: [
    {
      id: "arabica-alta-out26",
      titulo: "Arábica volta a subir com estoques certificados no menor nível em dois anos",
      fonte: "Boletim Grão & Xícara (fictício)",
      data: '2026-10-16',
      tema: 'cafe',
      secao: 'mercado_precos',
      destaque: true,
      resumo: "O café arábica acumulou alta de 11% desde setembro no levantamento semanal do boletim. Os estoques certificados nas bolsas caíram ao menor nível em dois anos, enquanto a demanda de torrefadoras segue firme. Corretores relatam que os prêmios para cafés de qualidade superior também subiram.",
      impacto: { direcao: 'alta', texto: "Torrefações devem repassar o aumento nos próximos contratos; vale antecipar a renegociação dos blends de espresso e travar volume para o primeiro semestre." },
      link: '#',
    },
    {
      id: "safra-cafe-out26",
      titulo: "Florada uniforme anima produtores, mas a colheita só reflete o clima em 2027",
      fonte: "Revista Lavoura Hoje (fictício)",
      data: '2026-10-09',
      tema: 'clima',
      secao: 'producao_agricultura',
      destaque: true,
      resumo: "As chuvas de setembro garantiram uma florada uniforme nas principais regiões produtoras de arábica. Agrônomos ouvidos pela revista lembram que o pegamento dos frutos ainda depende do regime de chuvas até dezembro. A expectativa de safra maior tende a pesar nos preços futuros, mas não no curto prazo.",
      impacto: { direcao: 'atencao', texto: "Sinal positivo para a oferta de 2027; no curto prazo, os preços seguem guiados pelos estoques baixos." },
      link: '#',
    },
    {
      id: "leite-entressafra-ago26",
      titulo: "Fim da entressafra devolve parte da alta do leite ao produtor",
      fonte: "Painel do Leite (fictício)",
      data: '2026-08-28',
      tema: 'laticinios',
      secao: 'mercado_precos',
      destaque: true,
      resumo: "O preço do leite pago ao produtor recuou em agosto, depois de três meses de alta na entressafra. Laticínios relatam captação maior com a volta das chuvas nas regiões de pastagem. O leite UHT e o creme de leite devem acompanhar a queda com algumas semanas de atraso.",
      impacto: { direcao: 'baixa', texto: "Janela para renegociar leite integral e leite barista; queijos e manteiga costumam reagir mais devagar." },
      link: '#',
    },
    {
      id: "cacau-recuo-set26",
      titulo: "Cacau recua com melhora das lavouras na África Ocidental",
      fonte: "Agência Commodities em Foco (fictício)",
      data: '2026-09-22',
      tema: 'cacau',
      secao: 'mercado_precos',
      destaque: false,
      resumo: "As cotações do cacau caíram pelo terceiro mês seguido com a recuperação das lavouras nos maiores países produtores. Mesmo assim, o preço segue bem acima da média histórica. Fabricantes de chocolate em pó e coberturas indicam que as tabelas só devem ser revistas no início do ano.",
      impacto: { direcao: 'baixa', texto: "Tendência de alívio para chocolate em pó, cacau e gotas, mas o repasse às tabelas deve demorar." },
      link: '#',
    },
    {
      id: "trigo-importacao-set26",
      titulo: "Trigo importado mais caro pressiona farinhas de panificação",
      fonte: "Jornal do Moinho (fictício)",
      data: '2026-09-15',
      tema: 'trigo',
      secao: 'mercado_precos',
      destaque: false,
      resumo: "Os moinhos reajustaram as farinhas para panificação e confeitaria depois da alta do trigo importado. A safra nacional atrasou a colheita no Sul por causa das chuvas, o que aumentou a dependência de importação no trimestre. O aumento chega primeiro às farinhas especiais e depois às massas congeladas.",
      impacto: { direcao: 'alta', texto: "Pães, croissants e massas congeladas devem ficar mais caros; confira os contratos com as panificadoras parceiras." },
      link: '#',
    },
    {
      id: "ipca-alimentacao-set26",
      titulo: "Alimentação fora do lar desacelera, mas café e lanches seguem acima do índice geral",
      fonte: "Observatório de Preços (fictício)",
      data: '2026-10-10',
      tema: 'inflacao',
      secao: 'mercado_precos',
      destaque: false,
      resumo: "A inflação da alimentação fora do lar perdeu força em setembro na leitura do observatório. Ainda assim, cafezinho, lanches e salgados subiram acima do índice geral pelo quarto mês seguido. O movimento reflete custos de café e de mão de obra repassados aos cardápios.",
      impacto: { direcao: 'atencao', texto: "Espaço limitado para novos reajustes de cardápio; o ganho de margem precisa vir das negociações com fornecedores." },
      link: '#',
    },
    {
      id: "embalagens-papel-set26",
      titulo: "Celulose em alta encarece copos e embalagens de papel",
      fonte: "Revista Embalagem & Cia (fictício)",
      data: '2026-09-30',
      tema: 'embalagens',
      secao: 'economia_impactos',
      destaque: false,
      resumo: "Fabricantes de copos e embalagens de papel anunciaram reajustes de 6% a 9% para o último trimestre. A alta da celulose e do papel cartão revestido é a principal justificativa. Distribuidores recomendam programar compras maiores antes da virada do ano.",
      impacto: { direcao: 'alta', texto: "Copos de 240 a 480 ml e tampas pesam no custo do café para levar; vale consolidar volume em um único fornecedor." },
      link: '#',
    },
    {
      id: "dolar-alta-set26",
      titulo: "Dólar sobe e encarece máquinas, peças e cafés importados",
      fonte: "Jornal Economia Viva (fictício)",
      data: '2026-09-18',
      tema: 'cambio',
      secao: 'economia_impactos',
      destaque: false,
      resumo: "O dólar voltou a subir em setembro com a piora do cenário externo. Para o setor de cafeterias, o efeito aparece em máquinas de espresso, moedores e peças de reposição, quase todos importados. O café também é cotado em dólar, o que torna a alta mais sensível.",
      impacto: { direcao: 'alta', texto: "Antecipe as compras de peças de reposição e reveja o cronograma de troca de equipamentos." },
      link: '#',
    },
    {
      id: "juros-credito-ago26",
      titulo: "Juros altos encarecem a expansão de redes de food service",
      fonte: "Portal Varejo em Pauta (fictício)",
      data: '2026-08-12',
      tema: 'juros',
      secao: 'economia_impactos',
      destaque: false,
      resumo: "Com a taxa básica de juros estável em patamar elevado, o crédito para abertura de lojas segue caro. Redes de cafeterias têm priorizado formatos compactos, como quiosques, que exigem menos investimento. Fornecedores também alongaram menos os prazos de pagamento.",
      impacto: { direcao: 'atencao', texto: "Prazo médio de pagamento vira moeda de negociação; vale trocar desconto por prazo nos fornecedores com margem." },
      link: '#',
    },
    {
      id: "acucar-safra-ago26",
      titulo: "Moagem forte de cana derruba preço do açúcar cristal",
      fonte: "Agência Commodities em Foco (fictício)",
      data: '2026-08-05',
      tema: 'clima',
      secao: 'producao_agricultura',
      destaque: false,
      resumo: "A moagem de cana no Centro-Sul superou as expectativas em julho, com tempo seco favorecendo a colheita. As usinas direcionaram mais cana para o açúcar, o que aumentou a oferta e derrubou os preços no atacado. Analistas veem espaço para nova queda até o fim da safra.",
      impacto: { direcao: 'baixa', texto: "Bom momento para fechar contrato de açúcar refinado, demerara e sachês para o semestre." },
      link: '#',
    },
    {
      id: "leite-vegetal-jul26",
      titulo: "Bebidas vegetais ganham espaço e fabricantes ampliam linhas para baristas",
      fonte: "Revista Food Service Hoje (fictício)",
      data: '2026-07-21',
      tema: 'laticinios',
      secao: 'mercado_precos',
      destaque: false,
      resumo: "As vendas de bebidas de aveia, amêndoas e coco para cafeterias cresceram 18% no semestre, segundo a revista. Fabricantes lançaram versões barista, que espumam como o leite de vaca. A concorrência maior começa a reduzir a diferença de preço em relação ao leite tradicional.",
      impacto: { direcao: 'baixa', texto: "Concorrência maior entre fabricantes abre espaço para cotação com mais de um fornecedor de bebida vegetal." },
      link: '#',
    },
    {
      id: "frutas-inverno-jul26",
      titulo: "Geada no Sul afeta morango e frutas vermelhas",
      fonte: "Boletim Hortifrúti Semanal (fictício)",
      data: '2026-07-08',
      tema: 'clima',
      secao: 'producao_agricultura',
      destaque: false,
      resumo: "Uma sequência de geadas atingiu áreas produtoras de morango e frutas vermelhas no Sul. Os preços no atacado subiram mais de 30% em duas semanas. Produtores esperam normalização em cerca de um mês, com a entrada de lotes de outras regiões.",
      impacto: { direcao: 'alta', texto: "Confeitaria e bowls com frutas vermelhas ficam mais caros no curto prazo; avalie usar polpa congelada." },
      link: '#',
    },
    {
      id: "conilon-oferta-jun26",
      titulo: "Safra recorde de conilon alivia preço dos cafés tradicionais",
      fonte: "Boletim Grão & Xícara (fictício)",
      data: '2026-06-18',
      tema: 'cafe',
      secao: 'producao_agricultura',
      destaque: false,
      resumo: "A colheita de conilon caminha para um recorde, com clima favorável nas principais regiões produtoras. A oferta maior derrubou o preço do café usado nos blends tradicionais e no solúvel. O arábica, usado nos cafés especiais, não acompanhou a queda.",
      impacto: { direcao: 'baixa', texto: "Cafés tradicionais e solúvel podem ser renegociados; cafés especiais seguem em outro patamar de preço." },
      link: '#',
    },
    {
      id: "energia-tarifa-jun26",
      titulo: "Bandeira tarifária mais cara pesa no custo de lojas com fornos e vitrines",
      fonte: "Jornal Economia Viva (fictício)",
      data: '2026-06-03',
      tema: 'inflacao',
      secao: 'economia_impactos',
      destaque: false,
      resumo: "A bandeira tarifária de energia subiu um nível em junho por causa do nível baixo dos reservatórios. Para cafeterias, o impacto vem de máquinas de espresso, fornos e vitrines refrigeradas, que ficam ligados o dia todo. Fornecedores de equipamentos destacam modelos mais eficientes.",
      impacto: { direcao: 'atencao', texto: "Considere o consumo de energia no custo total de propriedade ao trocar máquinas e vitrines." },
      link: '#',
    },
  ],
};

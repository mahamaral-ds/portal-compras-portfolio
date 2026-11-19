/*
 * Notícias de Mercado — Setor Alimentar (CONTEÚDO FICTÍCIO)
 * ---------------------------------------------------------
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
  proteina: 'Proteína Animal',
  hortifruti: 'Hortifrúti',
  cafe: 'Café',
  laticinios: 'Lácteos',
  clima: 'Clima e Safra',
  custos: 'Custos e Insumos',
  inflacao: 'Inflação',
  cambio: 'Câmbio',
  juros: 'Juros e Crédito',
  tarifas: 'Tarifas e Comércio Exterior',
};

const NEWS_SECOES = {
  mercado_precos: { titulo: 'Mercado e Preços', sub: 'Preços de alimentos, inflação, commodities e movimentos de oferta e demanda' },
  producao_agricultura: { titulo: 'Produção e Agricultura', sub: 'Safras, clima, condições de plantio/colheita e oferta de matérias-primas' },
  economia_impactos: { titulo: 'Economia e Impactos no Setor', sub: 'Câmbio, juros e custos que afetam o setor alimentar direta ou indiretamente' },
};

const CATEGORIAS_NEWS = {
  atualizado_em: '2026-10-20',
  itens: [
    {
      id: "arroba-alta-out26",
      titulo: "Arroba do boi sobe pela sexta semana seguida com oferta curta de animais",
      fonte: "Boletim Campo & Mesa (fictício)",
      data: '2026-10-16',
      tema: 'proteina',
      secao: 'mercado_precos',
      destaque: true,
      resumo: "O preço da arroba acumulou alta de 9% desde setembro no levantamento semanal do boletim. A combinação de entressafra, retenção de fêmeas e exportação firme reduziu a oferta de animais prontos para abate. Frigoríficos relatam escalas de abate mais curtas e repasse gradual aos cortes nobres no atacado.",
      impacto: { direcao: 'alta', texto: "Cortes bovinos devem seguir pressionados nas próximas semanas; vale antecipar a negociação de contratos de picanha e contrafilé." },
      link: '#',
    },
    {
      id: "ipca-alimentos-set26",
      titulo: "Alimentação fora do lar desacelera em setembro, mas proteínas seguem em alta",
      fonte: "Jornal Economia Viva (fictício)",
      data: '2026-10-09',
      tema: 'inflacao',
      secao: 'mercado_precos',
      destaque: true,
      resumo: "A inflação de alimentação fora do lar desacelerou no mês, ajudada por hortaliças e frutas mais baratas. Em sentido oposto, carnes e laticínios continuaram subindo. Analistas esperam que a média dos alimentos fique estável até o fim do ano, com variação entre os grupos.",
      impacto: { direcao: 'atencao', texto: "Cesta mista: hortifrúti alivia, proteínas pressionam o CMV." },
      link: '#',
    },
    {
      id: "frango-competitivo-out26",
      titulo: "Frango ganha competitividade frente ao suíno e à carne bovina",
      fonte: "Revista Granja Moderna (fictício)",
      data: '2026-10-14',
      tema: 'proteina',
      secao: 'mercado_precos',
      destaque: false,
      resumo: "Com a carne bovina e o suíno mais caros, a diferença de preço para o frango aumentou. Produtores ampliaram o alojamento de pintinhos, o que indica oferta maior no fim do ano. A demanda do varejo também cresceu.",
      impacto: { direcao: 'baixa', texto: "Bom momento para revisar cardápios e porções com frango, com preços mais estáveis." },
      link: '#',
    },
    {
      id: "tomate-chuva-set26",
      titulo: "Chuvas atrasam colheita e tomate sobe nos atacados do Sudeste",
      fonte: "Portal Hortifruti Hoje (fictício)",
      data: '2026-09-29',
      tema: 'hortifruti',
      secao: 'producao_agricultura',
      destaque: true,
      resumo: "O excesso de chuva nas principais regiões produtoras atrasou a colheita do tomate e reduziu a qualidade dos lotes. Os preços nos atacados subiram cerca de 25% em duas semanas. A expectativa é de normalização em quatro a seis semanas, com o avanço da nova safra.",
      impacto: { direcao: 'alta', texto: "Alta temporária: avaliar tomate pelado em conserva para molhos enquanto durar a escassez." },
      link: '#',
    },
    {
      id: "batata-oferta-out26",
      titulo: "Oferta de batata se normaliza e preços recuam",
      fonte: "Portal Hortifruti Hoje (fictício)",
      data: '2026-10-06',
      tema: 'hortifruti',
      secao: 'producao_agricultura',
      destaque: false,
      resumo: "Depois de um inverno de preços altos, a entrada da safra das águas aumentou a oferta de batata. Os preços recuaram pela terceira semana consecutiva. Cebola segue estável.",
      impacto: { direcao: 'baixa', texto: "Momento favorável para negociar volume de batata para o fim do ano." },
      link: '#',
    },
    {
      id: "cafe-safra-out26",
      titulo: "Café arábica oscila com clima seco na florada",
      fonte: "Informativo Grão & Xícara (fictício)",
      data: '2026-10-02',
      tema: 'cafe',
      secao: 'producao_agricultura',
      destaque: false,
      resumo: "A florada da próxima safra começou irregular por causa do tempo seco, o que trouxe volatilidade às cotações. Estoques baixos nas bolsas internacionais sustentam os preços. Torrefadoras sinalizam reajuste moderado para o trimestre.",
      impacto: { direcao: 'alta', texto: "Possível reajuste no café em grãos; verificar a cláusula de reajuste com as torrefações." },
      link: '#',
    },
    {
      id: "leite-entressafra-set26",
      titulo: "Fim da entressafra reduz preço do leite ao produtor",
      fonte: "Revista Lácteos Brasil (fictício)",
      data: '2026-09-22',
      tema: 'laticinios',
      secao: 'mercado_precos',
      destaque: false,
      resumo: "Com a volta das chuvas e das pastagens, a captação de leite aumentou e o preço pago ao produtor caiu pelo segundo mês. Queijos e manteiga devem acompanhar com algum atraso. A mussarela já mostra estabilidade no atacado.",
      impacto: { direcao: 'baixa', texto: "Abrir negociação de mussarela e creme de leite nas próximas semanas." },
      link: '#',
    },
    {
      id: "trigo-cambio-set26",
      titulo: "Trigo importado fica mais caro com dólar firme",
      fonte: "Boletim Campo & Mesa (fictício)",
      data: '2026-09-18',
      tema: 'custos',
      secao: 'economia_impactos',
      destaque: false,
      resumo: "O trigo importado ficou mais caro com a alta recente do dólar e com frete marítimo maior. Moinhos avaliam repassar parte do custo às farinhas no próximo mês. A safra nacional, em colheita, pode compensar parte do efeito.",
      impacto: { direcao: 'atencao', texto: "Farinhas e massas podem ter reajuste; comparar o preço por kg entre fornecedores antes de aceitar." },
      link: '#',
    },
    {
      id: "dolar-out26",
      titulo: "Dólar sobe com cenário externo e encarece importados",
      fonte: "Jornal Economia Viva (fictício)",
      data: '2026-10-12',
      tema: 'cambio',
      secao: 'economia_impactos',
      destaque: true,
      resumo: "A moeda americana fechou a semana em alta, refletindo juros altos no exterior e incerteza fiscal. Produtos importados — vinhos, azeite e alguns queijos — tendem a ficar mais caros nas próximas reposições. Importadores falam em reajustes escalonados.",
      impacto: { direcao: 'alta', texto: "Antecipar compras de vinhos e azeite com preço travado, se houver espaço em estoque." },
      link: '#',
    },
    {
      id: "juros-estaveis-out26",
      titulo: "Juros seguem estáveis e capital de giro continua caro",
      fonte: "Jornal Economia Viva (fictício)",
      data: '2026-10-01',
      tema: 'juros',
      secao: 'economia_impactos',
      destaque: false,
      resumo: "A taxa básica foi mantida e o comunicado indicou cautela. O custo do capital de giro para pequenos fornecedores segue alto, o que aumenta a procura por prazos de pagamento menores. Grandes distribuidores mantêm as condições.",
      impacto: { direcao: 'atencao', texto: "Fornecedores menores podem pedir prazo menor; equilibrar o PMP com o risco de abastecimento." },
      link: '#',
    },
    {
      id: "azeite-safra-set26",
      titulo: "Nova safra europeia de azeite promete preços menores em 2027",
      fonte: "Informativo Importados & Cia (fictício)",
      data: '2026-09-12',
      tema: 'custos',
      secao: 'mercado_precos',
      destaque: false,
      resumo: "Estimativas iniciais apontam colheita de oliva maior na Europa, depois de dois anos fracos. Se confirmada, a safra deve reduzir os preços do azeite extra virgem a partir do primeiro trimestre. O câmbio pode limitar parte do ganho no Brasil.",
      impacto: { direcao: 'baixa', texto: "Evitar contratos longos de azeite agora; renegociar no início de 2027." },
      link: '#',
    },
    {
      id: "clima-safra-verao-set26",
      titulo: "Aquecimento do Pacífico acende alerta para a safra de verão",
      fonte: "Boletim Clima Agro (fictício)",
      data: '2026-09-08',
      tema: 'clima',
      secao: 'producao_agricultura',
      destaque: false,
      resumo: "Modelos climáticos indicam aquecimento moderado do Pacífico no verão, com chuva acima da média no Sul e calor no Centro-Oeste. Produtores de grãos e hortaliças acompanham o risco de perdas pontuais. O efeito nos preços ainda é incerto.",
      impacto: { direcao: 'atencao', texto: "Acompanhar hortifrúti e grãos; manter fornecedores alternativos de regiões diferentes." },
      link: '#',
    },
    {
      id: "embalagens-celulose-ago26",
      titulo: "Papel e celulose em alta pressionam embalagens de delivery",
      fonte: "Revista Food Service Pro (fictício)",
      data: '2026-08-28',
      tema: 'custos',
      secao: 'economia_impactos',
      destaque: false,
      resumo: "Fabricantes de embalagens de papel anunciaram reajustes entre 6% e 9% por causa da celulose mais cara. Embalagens plásticas seguem estáveis. Redes de restaurantes avaliam padronizar tamanhos para ganhar escala.",
      impacto: { direcao: 'alta', texto: "Padronizar embalagens entre as marcas e cotar em volume para diluir o reajuste." },
      link: '#',
    },
    {
      id: "tarifas-exportacao-ago26",
      titulo: "Acordo comercial reduz tarifa para exportação de carnes",
      fonte: "Jornal Economia Viva (fictício)",
      data: '2026-08-20',
      tema: 'tarifas',
      secao: 'economia_impactos',
      destaque: false,
      resumo: "Um novo acordo bilateral reduziu tarifas para carnes brasileiras, o que deve aumentar as exportações nos próximos meses. Com mais carne indo para fora, a oferta no mercado interno pode ficar mais apertada. O efeito depende do ritmo dos embarques.",
      impacto: { direcao: 'alta', texto: "Exportação maior tende a sustentar os preços de proteínas no mercado interno." },
      link: '#',
    },
  ],
};

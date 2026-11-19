/* =========================================================================
   Supply Chat — motor de busca inteligente (sem LLM)
   =========================================================================
   Não é um chatbot genérico: interpreta a pergunta por padrões/entidades,
   consulta os data.js reais dos módulos (carregados sob demanda) e monta a
   resposta a partir do cálculo — nunca de um texto gerado livremente.
   Módulos cobertos nesta v1: Categorias, Fornecedores, Indicadores, Análise de Itens.
   ========================================================================= */
const SupplyChatEngine = (function(){

/* ===================== Carregamento sob demanda dos data.js ===================== */
const MODULES = {
  categorias:   {src: '../categorias/data.js',    global: 'CATEGORIAS_DATA'},
  fornecedores: {src: '../fornecedores/data.js',  global: 'DASHBOARD_DATA'},
  indicadores:  {src: '../indicadores/data.js',   global: 'INDICADORES_DATA'},
  analiseItens: {src: '../analise-itens/data.js', global: 'ANALISE_ITENS_DATA'},
};
const loaded = {};

// data.js declara "const NOME_DATA = {...}" no topo do script — isso cria um
// binding de escopo de script, NÃO uma propriedade em window (diferente de
// var/global implícito). Por isso a leitura precisa referenciar o
// identificador pelo nome, não window[nome].
function readGlobal(name){
  try {
    return new Function('return (typeof ' + name + " !== 'undefined') ? " + name + ' : undefined;')();
  } catch(e){ return undefined; }
}

function loadModule(key){
  if(loaded[key]) return Promise.resolve(readGlobal(MODULES[key].global));
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = MODULES[key].src;
    s.onload = () => {
      const data = readGlobal(MODULES[key].global);
      if(!data){ reject(new Error('empty_data:' + key)); return; }
      loaded[key] = true;
      resolve(data);
    };
    s.onerror = () => reject(new Error('load_error:' + key));
    document.head.appendChild(s);
  });
}

/* ===================== Formatação ===================== */
const fmtBRL = (v) => v==null ? '—' : new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:0}).format(v);
const fmtBRL2 = (v) => v==null ? '—' : new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', minimumFractionDigits:2, maximumFractionDigits:2}).format(v);
const fmtNum = (v) => v==null ? '—' : new Intl.NumberFormat('pt-BR').format(Math.round(v));
const fmtPct1 = (v) => v==null ? '—' : v.toFixed(1).replace('.', ',') + '%';

/* ===================== Normalização e correspondência de entidades ===================== */
function norm(s){
  return String(s||'').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const STOPWORDS = new Set(('quais qual quanto quantos quantas quantidade liste listar mostre mostra existe existem '
  + 'temos tem fornecedor fornecedores categoria categorias subcategoria subcategorias item itens produto produtos '
  + 'preco preços preço media medio médio ponderado para de da do das dos em com como que foi sao e ou a o as os '
  + 'esse essa esses essas nesse nessa deles delas dele dela mais menor maior barato caro nos ultimos ultimo meses '
  + 'mes ano atende atendem possui possuem qual e a do da').split(' ').map(norm));

function keywords(text){
  return norm(text).split(' ').filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

// candidata (nome curto e conhecido) aparece dentro do texto do usuário —
// usado para categoria/subcategoria/fornecedor/região.
function findKnownEntity(text, candidates){
  const nt = ' ' + norm(text) + ' ';
  let best = null;
  for(const c of candidates){
    const nc = norm(c);
    if(!nc) continue;
    if(nt.includes(' ' + nc + ' ') || nt.includes(nc)){
      if(!best || nc.length > best.score) best = {value: c, score: nc.length};
    }
  }
  return best ? best.value : null;
}

// texto do usuário contém palavras-chave que aparecem dentro da descrição
// do item (direção oposta — descrições são longas, o usuário digita só parte).
function findItemByKeywords(text, itemsMeta){
  const kws = keywords(text);
  if(!kws.length) return {match: null, alternatives: []};
  const scored = [];
  for(const it of itemsMeta){
    const nd = norm(it.descricao);
    let hits = 0;
    for(const k of kws) if(nd.includes(k)) hits++;
    if(hits > 0) scored.push({item: it, hits, len: nd.length});
  }
  if(!scored.length) return {match: null, alternatives: []};
  scored.sort((a,b) => b.hits - a.hits || a.len - b.len);
  const top = scored[0];
  const tied = scored.filter(s => s.hits === top.hits);
  if(tied.length === 1 || tied[0].hits >= 2){
    return {match: top.item, alternatives: scored.slice(0,5).map(s=>s.item)};
  }
  return {match: null, alternatives: scored.slice(0,5).map(s=>s.item)};
}

const REGIAO_SYNONYMS = {
  SP: ['SAO PAULO', 'SP', 'SAMPA'],
  RJ: ['RIO DE JANEIRO', 'RJ', 'RIO'],
  BR: ['BRASIL', 'DEMAIS REGIOES', 'INTERIOR', 'OUTRAS REGIOES'],
};
const REGIAO_LABELS = {SP:'SP', RJ:'RJ', BR:'BR (demais regiões)'};
function findRegiao(text){
  const nt = ' ' + norm(text) + ' ';
  for(const [key, syns] of Object.entries(REGIAO_SYNONYMS)){
    for(const s of syns) if(nt.includes(' ' + norm(s) + ' ') || nt.includes(norm(s))) return key;
  }
  return null;
}

function hasAny(text, words){
  const nt = norm(text);
  return words.some(w => nt.includes(norm(w)));
}

function hasPronounReferencia(text){
  return hasAny(text, ['deles','delas','desses','dessas','esses','essas','ele','ela']);
}

/* ===================== Contexto de conversa ===================== */
function newContext(){
  return {
    lastIntent: null,
    focus: {
      categoria: null,
      subcategoria: null,
      fornecedor: null,
      fornecedorList: null, // {label, nomes:[...]}
      item: null,
      regiao: null,
    },
  };
}

/* ===================== Categorias / Subcategorias ===================== */
async function getCategoriasData(){ return loadModule('categorias'); }

function findCategoriaOrSub(text, CAT){
  const treemap = CAT.periods.ALL.treemap_data;
  const categorias = treemap.map(g => g.name);
  const subcategorias = [];
  treemap.forEach(g => g.children.forEach(c => subcategorias.push(c.name)));

  const subMatch = findKnownEntity(text, subcategorias);
  const catMatch = findKnownEntity(text, categorias);

  if(subMatch && catMatch){
    // prefere o mais especifico se a pergunta menciona "subcategoria" explicitamente
    if(hasAny(text, ['subcategoria'])) return {tipo:'subcategoria', nome: subMatch};
    if(hasAny(text, ['categoria']) && !hasAny(text, ['subcategoria'])) return {tipo:'categoria', nome: catMatch};
    // caso ambiguo real (nomes parecidos) — prefere subcategoria (mais especifica)
    return {tipo:'subcategoria', nome: subMatch};
  }
  if(subMatch) return {tipo:'subcategoria', nome: subMatch};
  if(catMatch) return {tipo:'categoria', nome: catMatch};
  return null;
}

function subcategoriaFornecedores(CAT, nomeSub){
  const treemap = CAT.periods.ALL.treemap_data;
  for(const g of treemap){
    const child = g.children.find(c => c.name === nomeSub);
    if(child) return {grupo: g.name, subcategoria: child.name, valor: child.value, fornecedores: child.fornecedores};
  }
  return null;
}

function categoriaFornecedores(CAT, nomeCat){
  const treemap = CAT.periods.ALL.treemap_data;
  const g = treemap.find(g => g.name === nomeCat);
  if(!g) return null;
  const map = {};
  g.children.forEach(c => c.fornecedores.forEach(f => {
    map[f.nome] = (map[f.nome] || 0) + f.valor;
  }));
  const fornecedores = Object.entries(map)
    .map(([nome, valor]) => ({nome, valor, part: valor / g.value}))
    .sort((a,b) => b.valor - a.valor);
  return {grupo: g.name, valor: g.value, fornecedores};
}

/* ===================== Fornecedores ===================== */
async function getFornecedoresData(){ return loadModule('fornecedores'); }

function fornecedorRanking(DASHBOARD){ return DASHBOARD.periods.ALL.ranking; }

function findFornecedor(text, DASHBOARD){
  const nomes = DASHBOARD.periods.ALL.ranking.map(r => r.Fornecedor);
  return findKnownEntity(text, nomes);
}

/* ===================== Intents ===================== */
const INTENTS = [];
function intent(name, test, run){ INTENTS.push({name, test, run}); }

// ---- saudação ----
intent('saudacao',
  (t) => /^(oi|ola|bom dia|boa tarde|boa noite|ei|e ai)[\s!.,]*$/i.test(norm(t).toLowerCase()) || /^(oi|ola)\b/i.test(t.trim()),
  async () => ({
    type: 'answer',
    text: 'Olá! Posso buscar fornecedores, categorias, preços e a inflação da empresa nos dados do portal. O que você quer saber?',
    suggestions: defaultSuggestions(),
  })
);

// ---- quais categorias existem ----
intent('listar_categorias',
  (t) => hasAny(t, ['categoria']) && hasAny(t, ['quais','existem','disponiveis','lista']) && !hasAny(t, ['subcategoria']),
  async () => {
    const CAT = await getCategoriasData();
    const ranking = CAT.periods.ALL.ranking;
    return {
      type: 'answer',
      text: `O portal tem **${ranking.length} categorias** cadastradas.`,
      list: {
        title: 'Categorias por valor comprado',
        items: ranking.map(r => ({primary: r.Categoria, secondary: fmtBRL(r['Valor Total']), extra: `${fmtNum(r.Fornecedores)} fornecedores`})),
      },
      source: 'Categorias → Ranking de Categorias',
      navLink: {label: 'Ver categorias', href: '../categorias/index.html'},
    };
  }
);

// ---- qual categoria tem mais fornecedores ----
intent('categoria_mais_fornecedores',
  (t) => hasAny(t, ['categoria']) && hasAny(t, ['mais fornecedores']),
  async () => {
    const CAT = await getCategoriasData();
    const ranking = CAT.periods.ALL.ranking.slice().sort((a,b) => b.Fornecedores - a.Fornecedores);
    const top = ranking[0];
    return {
      type: 'answer',
      text: `**${top.Categoria}** é a categoria com mais fornecedores: **${fmtNum(top.Fornecedores)}** fornecedores, somando ${fmtBRL(top['Valor Total'])}.`,
      list: {title: 'Top 5 categorias por nº de fornecedores', items: ranking.slice(0,5).map(r => ({primary: r.Categoria, secondary: fmtNum(r.Fornecedores) + ' forn.'}))},
      source: 'Categorias → Ranking de Categorias',
      navLink: {label: 'Ver categorias', href: '../categorias/index.html'},
    };
  }
);

// ---- quais subcategorias de X ----
intent('listar_subcategorias',
  (t) => hasAny(t, ['subcategoria']) && hasAny(t, ['quais','liste','existem']),
  async (t, ctx) => {
    const CAT = await getCategoriasData();
    const categorias = CAT.periods.ALL.treemap_data.map(g => g.name);
    const nome = findKnownEntity(t, categorias) || ctx.focus.categoria;
    if(!nome){
      return {type: 'clarify', text: 'De qual categoria você quer ver as subcategorias?', suggestions: categorias.slice(0,5)};
    }
    const g = CAT.periods.ALL.treemap_data.find(g => g.name === nome);
    ctx.focus.categoria = nome;
    return {
      type: 'answer',
      text: `**${nome}** tem **${g.children.length} subcategorias**.`,
      list: {title: `Subcategorias de ${nome}`, items: g.children.map(c => ({primary: c.name, secondary: fmtBRL(c.value), extra: `${c.fornecedores.length} fornecedores`}))},
      source: 'Categorias → Composição',
      navLink: {label: 'Ver composição', href: '../categorias/index.html'},
    };
  }
);

// ---- quantos fornecedores em categoria/subcategoria (contagem) ----
intent('contar_fornecedores_categoria',
  (t) => hasAny(t, ['quantos fornecedores','quantidade de fornecedores']) && hasAny(t, ['categoria','subcategoria']),
  async (t, ctx) => {
    const CAT = await getCategoriasData();
    const alvo = findCategoriaOrSub(t, CAT);
    if(!alvo){
      return {type: 'clarify', text: 'De qual categoria ou subcategoria?', suggestions: CAT.periods.ALL.treemap_data.slice(0,5).map(g=>g.name)};
    }
    const info = alvo.tipo === 'subcategoria' ? subcategoriaFornecedores(CAT, alvo.nome) : categoriaFornecedores(CAT, alvo.nome);
    ctx.focus[alvo.tipo] = alvo.nome;
    ctx.focus.fornecedorList = {label: alvo.nome, nomes: info.fornecedores.map(f=>f.nome)};
    return {
      type: 'answer',
      text: `Encontrei **${fmtNum(info.fornecedores.length)} fornecedores** em **${alvo.nome}**, somando ${fmtBRL(info.valor)}.`,
      source: `Categorias → Composição → ${alvo.nome}`,
      navLink: {label: 'Ver categorias', href: '../categorias/index.html'},
      suggestions: [`Quais são os fornecedores de ${alvo.nome}?`],
    };
  }
);

// ---- quais fornecedores para categoria/subcategoria/item ----
intent('listar_fornecedores_categoria',
  (t) => hasAny(t, ['fornecedor']) && hasAny(t, ['quais','liste','temos','atende','atendem','mostre','mostra']),
  async (t, ctx) => {
    const CAT = await getCategoriasData();
    const alvo = findCategoriaOrSub(t, CAT);
    if(!alvo){
      if(hasPronounReferencia(t) && ctx.focus.fornecedorList){
        return listaFocoAtual(ctx);
      }
      return {type: 'clarify', text: 'Fornecedores de qual categoria, subcategoria ou item? Você também pode perguntar por região (ex.: "quais fornecedores estão em São Paulo?").', suggestions: defaultSuggestions()};
    }
    const info = alvo.tipo === 'subcategoria' ? subcategoriaFornecedores(CAT, alvo.nome) : categoriaFornecedores(CAT, alvo.nome);
    ctx.focus[alvo.tipo] = alvo.nome;
    ctx.focus.fornecedorList = {label: alvo.nome, nomes: info.fornecedores.map(f=>f.nome)};
    if(!info.fornecedores.length){
      return {type: 'empty', text: `Não encontrei fornecedores para **${alvo.nome}** no período disponível.`};
    }
    return {
      type: 'answer',
      text: `Encontrei **${fmtNum(info.fornecedores.length)} fornecedores** para **${alvo.nome}**.${info.fornecedores.length>10 ? ' Os principais:' : ''}`,
      list: {
        title: `Fornecedores — ${alvo.nome}`,
        items: info.fornecedores.slice(0,10).map(f => ({primary: f.nome, secondary: fmtBRL(f.valor), extra: fmtPct1(100*f.part) + ' do gasto'})),
        totalCount: info.fornecedores.length,
      },
      source: `Categorias → Composição → ${alvo.nome}`,
      navLink: {label: 'Ver categorias', href: '../categorias/index.html'},
    };
  }
);

function listaFocoAtual(ctx){
  const nomes = ctx.focus.fornecedorList.nomes;
  return {
    type: 'answer',
    text: `Você está falando dos ${fmtNum(nomes.length)} fornecedores de **${ctx.focus.fornecedorList.label}**.`,
    list: {title: ctx.focus.fornecedorList.label, items: nomes.slice(0,10).map(n => ({primary: n}))},
  };
}

// ---- follow-up: "quais deles estão em [região]" ----
intent('fornecedores_lista_por_regiao',
  (t, ctx) => findRegiao(t) && (hasPronounReferencia(t) || hasAny(t, ['fornecedor'])),
  async (t, ctx) => {
    const regiao = findRegiao(t);
    const DASHBOARD = await getFornecedoresData();
    const porRegiao = DASHBOARD.periods.ALL.regionalizacao;
    if(!porRegiao || !porRegiao.por_regiao[regiao]){
      return {type: 'empty', text: 'Não encontrei dado de regionalização suficiente para responder isso.'};
    }
    const nomesRegiao = new Set(porRegiao.por_regiao[regiao].ranking.map(r => r.Fornecedor));
    ctx.focus.regiao = regiao;

    if(hasPronounReferencia(t) && ctx.focus.fornecedorList){
      const base = ctx.focus.fornecedorList;
      const intersecao = base.nomes.filter(n => nomesRegiao.has(n));
      return {
        type: intersecao.length ? 'answer' : 'empty',
        text: intersecao.length
          ? `Dos ${fmtNum(base.nomes.length)} fornecedores de **${base.label}**, **${fmtNum(intersecao.length)}** têm operação em **${REGIAO_LABELS[regiao]}**.`
          : `Nenhum dos fornecedores de **${base.label}** aparece em **${REGIAO_LABELS[regiao]}** (proxy pela região da casa que compra — não é o endereço real do fornecedor).`,
        list: intersecao.length ? {title: `${base.label} em ${REGIAO_LABELS[regiao]}`, items: intersecao.slice(0,10).map(n=>({primary:n}))} : null,
        source: 'Fornecedores → Regionalização (proxy: região da casa que compra)',
        navLink: {label: 'Ver regionalização', href: '../fornecedores/index.html'},
      };
    }

    const lista = porRegiao.por_regiao[regiao].ranking;
    ctx.focus.fornecedorList = {label: `região ${REGIAO_LABELS[regiao]}`, nomes: lista.map(r=>r.Fornecedor)};
    return {
      type: 'answer',
      text: `Encontrei **${fmtNum(lista.length)} fornecedores** com compras associadas a casas da região **${REGIAO_LABELS[regiao]}** (proxy pela região da casa — o portal não tem o endereço real do fornecedor).`,
      list: {title: `Fornecedores — ${REGIAO_LABELS[regiao]}`, items: lista.slice(0,10).map(r => ({primary: r.Fornecedor, secondary: fmtBRL(r.Valor)})), totalCount: lista.length},
      source: 'Fornecedores → Regionalização',
      navLink: {label: 'Ver regionalização', href: '../fornecedores/index.html'},
    };
  }
);

// ---- qual fornecedor possui mais itens ----
intent('fornecedor_mais_itens',
  (t) => hasAny(t, ['fornecedor']) && hasAny(t, ['mais itens']),
  async () => {
    const DASHBOARD = await getFornecedoresData();
    const ranking = DASHBOARD.periods.ALL.ranking.slice().sort((a,b) => b['Itens Únicos'] - a['Itens Únicos']);
    const top = ranking[0];
    return {
      type: 'answer',
      text: `**${top.Fornecedor}** é o fornecedor com mais itens únicos: **${fmtNum(top['Itens Únicos'])} itens**.`,
      list: {title: 'Top 5 fornecedores por itens únicos', items: ranking.slice(0,5).map(r => ({primary: r.Fornecedor, secondary: fmtNum(r['Itens Únicos']) + ' itens'}))},
      source: 'Fornecedores → Ranking de Fornecedores',
      navLink: {label: 'Ver fornecedores', href: '../fornecedores/index.html'},
    };
  }
);

// ---- ranking geral / maior valor ----
intent('fornecedor_maior_valor',
  (t) => hasAny(t, ['fornecedor']) && hasAny(t, ['maior valor','top fornecedores','maior compra','ranking de fornecedores']),
  async () => {
    const DASHBOARD = await getFornecedoresData();
    const ranking = DASHBOARD.periods.ALL.ranking;
    const top = ranking[0];
    return {
      type: 'answer',
      text: `**${top.Fornecedor}** é o fornecedor com maior valor comprado: ${fmtBRL(top['Valor Total'])} (${fmtPct1(100*top['Part. %'])} do total).`,
      list: {title: 'Top 10 fornecedores por valor', items: ranking.slice(0,10).map(r => ({primary: r.Fornecedor, secondary: fmtBRL(r['Valor Total'])}))},
      source: 'Fornecedores → Ranking de Fornecedores',
      navLink: {label: 'Ver fornecedores', href: '../fornecedores/index.html'},
    };
  }
);

/* ===================== Preços (itens_fornecedor) ===================== */
function aggregatePrecoItem(IF, itemIdx){
  let valor = 0, qtd = 0;
  const porMes = {}; // mes_idx -> {valor, qtd}
  IF.pares.forEach(par => {
    const [fornIdx, itIdx, temPreco] = par;
    if(itIdx !== itemIdx || !temPreco) return;
    const mensal = par[11];
    mensal.forEach(m => {
      const [mesIdx, v, q] = m;
      if(q == null) return;
      valor += v; qtd += q;
      if(!porMes[mesIdx]) porMes[mesIdx] = {valor:0, qtd:0};
      porMes[mesIdx].valor += v; porMes[mesIdx].qtd += q;
    });
  });
  const mesesOrdenados = Object.keys(porMes).map(Number).sort((a,b)=>a-b);
  return {
    precoMedio: qtd > 0 ? valor/qtd : null,
    valorTotal: valor,
    qtdTotal: qtd,
    mesesOrdenados,
    porMes,
  };
}

function precoNoMes(porMes, mesIdx){
  const m = porMes[mesIdx];
  return m && m.qtd > 0 ? m.valor/m.qtd : null;
}

intent('preco_medio_item',
  (t) => hasAny(t, ['preco medio','preço médio','media de preco']),
  async (t, ctx) => {
    const DASHBOARD = await getFornecedoresData();
    const IF = DASHBOARD.itens_fornecedor;
    const found = findItemByKeywords(t, IF.itens_meta);
    if(!found.match){
      return itemNaoEncontrado(found, 'preco_medio');
    }
    const itemIdx = IF.itens_meta.indexOf(found.match);
    ctx.focus.item = found.match.descricao;
    if(!found.match.tem_preco){
      return itemSemPreco(found.match);
    }
    const agg = aggregatePrecoItem(IF, itemIdx);
    if(agg.qtdTotal <= 0) return itemSemPreco(found.match);
    return {
      type: 'answer',
      text: `O preço médio ponderado de **${found.match.descricao}** é **${fmtBRL2(agg.precoMedio)}** por ${IF.dict_unidades[found.match.unidade_idx] || 'unidade'}, considerando todo o período disponível e todos os fornecedores.`,
      source: `Fornecedores → Itens por Fornecedor → ${found.match.descricao}`,
      navLink: {label: 'Ver detalhes do item', href: '../fornecedores/index.html'},
    };
  }
);

intent('menor_preco_item',
  (t) => hasAny(t, ['menor preco','mais barato']) && hasAny(t, ['fornecedor','item','preco']),
  async (t, ctx) => {
    const DASHBOARD = await getFornecedoresData();
    const IF = DASHBOARD.itens_fornecedor;
    const found = findItemByKeywords(t, IF.itens_meta);
    if(!found.match) return itemNaoEncontrado(found, 'menor_preco');
    ctx.focus.item = found.match.descricao;
    if(!found.match.tem_preco) return itemSemPreco(found.match);
    const itemIdx = IF.itens_meta.indexOf(found.match);
    const detalhes = IF.melhor_preco_detalhe.filter(d => d[0] === itemIdx);
    if(!detalhes.length) return itemNaoEncontrado(found, 'menor_preco');
    detalhes.sort((a,b) => b[1] - a[1]); // mes_idx desc — mais recente primeiro
    const [, mesIdx, preco, fornecedor] = detalhes[0];
    const mesLabel = IF.month_labels[IF.meses[mesIdx]] || IF.meses[mesIdx];
    return {
      type: 'answer',
      text: `O menor preço de **${found.match.descricao}** foi praticado por **${fornecedor}**: **${fmtBRL2(preco)}** em ${mesLabel} (só considera fornecedores com histórico suficiente para comparação confiável — ≥3 compras e ≥30 dias).`,
      source: `Fornecedores → Itens por Fornecedor → ${found.match.descricao}`,
      navLink: {label: 'Ver fornecedor', href: '../fornecedores/index.html'},
    };
  }
);

intent('evolucao_preco_item',
  (t) => hasAny(t, ['como o preco','evolucao','variacao do preco','mudou']) && hasAny(t, ['preco','item']),
  async (t, ctx) => {
    const DASHBOARD = await getFornecedoresData();
    const IF = DASHBOARD.itens_fornecedor;
    const found = findItemByKeywords(t, IF.itens_meta);
    if(!found.match) return itemNaoEncontrado(found, 'evolucao');
    ctx.focus.item = found.match.descricao;
    if(!found.match.tem_preco) return itemSemPreco(found.match);
    const itemIdx = IF.itens_meta.indexOf(found.match);
    const agg = aggregatePrecoItem(IF, itemIdx);
    if(agg.mesesOrdenados.length < 2) return {type:'empty', text: `Não há histórico suficiente de meses para mostrar a evolução de preço de **${found.match.descricao}**.`};
    const primeiro = agg.mesesOrdenados[0], ultimo = agg.mesesOrdenados[agg.mesesOrdenados.length-1];
    const pInicial = precoNoMes(agg.porMes, primeiro), pFinal = precoNoMes(agg.porMes, ultimo);
    const varPct = pInicial ? 100*(pFinal-pInicial)/pInicial : null;
    const mesInicialLabel = IF.month_labels[IF.meses[primeiro]] || IF.meses[primeiro];
    const mesFinalLabel = IF.month_labels[IF.meses[ultimo]] || IF.meses[ultimo];
    return {
      type: 'answer',
      text: `O preço médio de **${found.match.descricao}** foi de ${fmtBRL2(pInicial)} em ${mesInicialLabel} para ${fmtBRL2(pFinal)} em ${mesFinalLabel}` +
            (varPct != null ? ` — variação de **${varPct>=0?'+':''}${varPct.toFixed(1).replace('.',',')}%**.` : '.'),
      list: {title: `Preço médio mensal — ${found.match.descricao}`, items: agg.mesesOrdenados.map(mi => ({primary: IF.month_labels[IF.meses[mi]] || IF.meses[mi], secondary: fmtBRL2(precoNoMes(agg.porMes, mi))}))},
      source: `Fornecedores → Itens por Fornecedor → ${found.match.descricao}`,
      navLink: {label: 'Ver evolução completa', href: '../fornecedores/index.html'},
    };
  }
);

intent('maior_aumento_reducao_preco',
  (t) => hasAny(t, ['maior aumento','subiu mais','mais aumentou','maior reducao','maior redução','caiu mais','mais caiu','maior queda']),
  async (t) => {
    const ANALISE = await loadModule('analiseItens');
    const isAumento = hasAny(t, ['aumento','subiu','mais caro']);
    const lista = isAumento ? ANALISE.top_aumentos : ANALISE.top_reducoes;
    if(!lista || !lista.length) return {type:'empty', text:'Não encontrei dados de variação de preço suficientes para responder.'};
    const top = lista[0];
    return {
      type: 'answer',
      text: `O item com maior ${isAumento?'aumento':'redução'} de preço foi **${top.item}** (categoria ${top.grupo}): ` +
            `de ${fmtBRL2(top.preco_inicial)} para ${fmtBRL2(top.preco_final)}, variação de **${top.var_pct>=0?'+':''}${top.var_pct.toFixed(1).replace('.',',')}%**.`,
      list: {title: `Top itens — maior ${isAumento?'aumento':'redução'} de preço`, items: lista.slice(0,10).map(r => ({primary: r.item, secondary: `${r.var_pct>=0?'+':''}${r.var_pct.toFixed(1).replace('.',',')}%`, extra: r.grupo}))},
      source: 'Análise de Itens → Histórico de Preços',
      navLink: {label: 'Ver Análise de Itens', href: '../analise-itens/index.html'},
    };
  }
);

const CONTEXTO_LABELS = {
  preco_medio: 'preço médio',
  menor_preco: 'menor preço',
  evolucao: 'evolução de preço',
};
const CONTEXTO_TEMPLATES = {
  preco_medio: (desc) => `Qual o preço médio de ${desc}?`,
  menor_preco: (desc) => `Qual fornecedor tem o menor preço de ${desc}?`,
  evolucao: (desc) => `Como o preço de ${desc} mudou nos últimos meses?`,
};
function itemNaoEncontrado(found, contexto){
  if(found.alternatives && found.alternatives.length){
    const tpl = CONTEXTO_TEMPLATES[contexto] || ((d) => d);
    return {
      type: 'clarify',
      text: `Não encontrei exatamente esse item para ${CONTEXTO_LABELS[contexto] || contexto}. Você quis dizer um desses?`,
      suggestions: found.alternatives.slice(0,5).map(it => tpl(it.descricao)),
    };
  }
  return {type: 'empty', text: `Não encontrei esse item nos dados de preço disponíveis (a base cobre os itens comprados pelos principais fornecedores do grupo).`};
}
function itemSemPreco(item){
  return {
    type: 'empty',
    text: `**${item.descricao}** não tem métrica de preço confiável nos dados — a unidade de medida registrada varia demais entre as compras desse item pra comparar com segurança (evita mostrar um preço errado).`,
  };
}

/* ===================== Inflação ===================== */
intent('inflacao',
  (t) => hasAny(t, ['inflacao', 'inflação']),
  async (t, ctx) => {
    const INDICADORES = await loadModule('indicadores');
    const serie = INDICADORES.external_kpis.filter(k => k.inflacao != null);
    if(!serie.length) return {type:'empty', text: 'Não encontrei dados de inflação disponíveis no portal.'};

    const CAT = await getCategoriasData().catch(()=>null);
    const item = CAT ? findCategoriaOrSub(t, CAT) : null;
    if(item){
      return {
        type: 'answer',
        text: `O portal não tem inflação calculada por categoria ou item — só existe uma série única de inflação para a empresa toda. ` +
              `Para **${item.nome}**, o mais próximo que tenho é a variação de preço dos itens dessa categoria (posso te mostrar os itens com maior alta/queda, se quiser).`,
        suggestions: ['Quais itens tiveram maior aumento de preço?', 'Qual foi a inflação da empresa?'],
      };
    }

    const meses = serie.map(k => k.MES);
    const labelPeriodo = `${INDICADORES.month_labels[meses[0]] || meses[0]} a ${INDICADORES.month_labels[meses[meses.length-1]] || meses[meses.length-1]}`;
    const ultima = serie[serie.length-1];
    return {
      type: 'answer',
      text: `A inflação mais recente (${INDICADORES.month_labels[ultima.MES] || ultima.MES}) foi de **${fmtPct1(ultima.inflacao)}**. ` +
            `A base cobre o período de ${labelPeriodo} — não tenho dado de inflação de anos anteriores.`,
      list: {title: `Inflação mensal (${labelPeriodo})`, items: serie.map(k => ({primary: INDICADORES.month_labels[k.MES] || k.MES, secondary: fmtPct1(k.inflacao)}))},
      source: 'Indicadores → KPIs',
      navLink: {label: 'Ver indicadores', href: '../indicadores/index.html'},
    };
  }
);

/* ===================== Comparar fornecedores ===================== */
intent('comparar_fornecedores',
  (t) => hasAny(t, ['compare','comparar','compara']) && hasAny(t, ['fornecedor']),
  async (t, ctx) => {
    const CAT = await getCategoriasData();
    const alvo = findCategoriaOrSub(t, CAT);
    if(!alvo) return {type:'clarify', text:'Comparar fornecedores de qual categoria ou subcategoria?', suggestions: CAT.periods.ALL.treemap_data.slice(0,5).map(g=>g.name)};
    const info = alvo.tipo === 'subcategoria' ? subcategoriaFornecedores(CAT, alvo.nome) : categoriaFornecedores(CAT, alvo.nome);
    if(!info.fornecedores.length) return {type:'empty', text:`Não encontrei fornecedores para comparar em ${alvo.nome}.`};
    return {
      type: 'answer',
      text: `Comparando os fornecedores de **${alvo.nome}** por valor comprado:`,
      table: {
        cols: ['Fornecedor', 'Valor', '% do total'],
        rows: info.fornecedores.slice(0,8).map(f => [f.nome, fmtBRL(f.valor), fmtPct1(100*f.part)]),
      },
      source: `Categorias → Composição → ${alvo.nome}`,
      navLink: {label: 'Ver categorias', href: '../categorias/index.html'},
    };
  }
);

/* ===================== Sugestões padrão ===================== */
function defaultSuggestions(){
  return [
    'Quais fornecedores temos para proteínas?',
    'Quantos fornecedores existem nessa categoria?',
    'Qual foi a inflação nos últimos meses?',
    'Quais itens tiveram maior aumento de preço?',
    'Quais fornecedores estão em São Paulo?',
  ];
}

/* ===================== Orquestrador ===================== */
async function ask(userText, ctx){
  const text = String(userText || '').trim();
  if(!text) return {type: 'clarify', text: 'Pode perguntar alguma coisa? Por exemplo: "quais fornecedores temos para café?"'};

  for(const it of INTENTS){
    try{
      if(it.test(text, ctx)){
        ctx.lastIntent = it.name;
        const resp = await it.run(text, ctx);
        return resp;
      }
    } catch(err){
      console.error('Erro no intent ' + it.name + ':', err);
      return {
        type: 'error',
        text: 'Não consegui consultar essas informações agora. Tente novamente.',
        retry: text,
      };
    }
  }

  return {
    type: 'clarify',
    text: 'Não entendi bem essa pergunta. Posso ajudar com fornecedores, categorias, preços e inflação — por exemplo:',
    suggestions: defaultSuggestions(),
  };
}

return {ask, newContext, defaultSuggestions};
})();

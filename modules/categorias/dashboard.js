try {
/* ===================== Setup ===================== */
const DATA = CATEGORIAS_DATA;

const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:0}).format(v);
const fmtNum = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(v));
const fmtPct = (v) => (v*100).toFixed(1).replace('.', ',') + '%';
const fmtPct1 = (v) => v.toFixed(1).replace('.', ',') + '%';

const CLASS_COLORS = {A:'#0E6E6E', B:'#C98A3B', C:'#94A0AF'};
const CHART_PALETTE = ['#0E6E6E','#C98A3B','#5B7FBF','#8A5AC9','#2F8F5B','#C0442C','#3E5C76','#94A0AF','#B8895A'];

Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
Chart.defaults.font.size = 11.5;
Chart.defaults.color = '#5B6472';

/* ===================== Period state ===================== */
let currentPeriod = ['ALL'];
const monthsOrder = DATA.months_order;
const monthLabels = DATA.month_labels;

function classifyAbcJs(cumPct){
  if(cumPct <= 80) return 'A';
  if(cumPct <= 95) return 'B';
  return 'C';
}

/* Mescla o treemap Categoria -> Subcategoria -> Fornecedor de varios meses:
   estrutura ja aditiva (soma de valor por fornecedor dentro de cada
   subcategoria), entao basta somar as celulas em comum entre os meses
   selecionados — sem cortes/rankings a recalcular aqui. */
function aggregateTreemap(keys){
  const grupoMap = new Map();
  keys.forEach(k => {
    const p = DATA.periods[k];
    if(!p) return;
    (p.treemap_data || []).forEach(g => {
      if(!grupoMap.has(g.name)) grupoMap.set(g.name, new Map());
      const subMap = grupoMap.get(g.name);
      (g.children || []).forEach(c => {
        if(!subMap.has(c.name)) subMap.set(c.name, new Map());
        const fornMap = subMap.get(c.name);
        (c.fornecedores || []).forEach(f => {
          fornMap.set(f.nome, (fornMap.get(f.nome) || 0) + f.valor);
        });
      });
    });
  });

  return Array.from(grupoMap.entries()).map(([grupo, subMap]) => {
    const children = Array.from(subMap.entries()).map(([subgrupo, fornMap]) => {
      const subValor = Array.from(fornMap.values()).reduce((a,v) => a+v, 0);
      const fornecedores = Array.from(fornMap.entries())
        .map(([nome, valor]) => ({nome, valor: Math.round(valor*100)/100, part: subValor ? Math.round((valor/subValor)*10000)/10000 : 0}))
        .sort((a,b) => b.valor - a.valor);
      return {name: subgrupo, value: Math.round(subValor*100)/100, fornecedores};
    }).sort((a,b) => b.value - a.value);
    const value = Math.round(children.reduce((a,c) => a+c.value, 0)*100)/100;
    return {name: grupo, value, children};
  }).sort((a,b) => b.value - a.value);
}

/* Mescla o ranking de categorias de varios meses: Valor Total/Pedidos sao
   aditivos, mas Itens Unicos/Fornecedores/Subcategorias
   precisam da UNIAO das identidades brutas de cada mes (itens_idx/
   forn_valor/subgrupos_lista), e o Fornecedor Principal precisa ser
   recalculado sobre o valor por fornecedor somado entre os meses — o
   "principal" de um mes isolado pode nao ser mais o principal quando os
   meses selecionados sao combinados. */
function aggregateCategoriasPeriod(keys){
  const catMap = new Map();
  keys.forEach(k => {
    const p = DATA.periods[k];
    if(!p) return;
    (p.ranking || []).forEach(r => {
      if(!catMap.has(r.Categoria)){
        catMap.set(r.Categoria, {
          Categoria: r.Categoria,
          valorTotal: 0, pedidos: 0,
          itensSet: new Set(), subSet: new Set(), segSet: new Set(),
          fornValor: new Map(),
        });
      }
      const acc = catMap.get(r.Categoria);
      acc.valorTotal += r['Valor Total'];
      acc.pedidos += r.Pedidos;
      (r.itens_idx || []).forEach(i => acc.itensSet.add(i));
      (r.subgrupos_lista || []).forEach(s => acc.subSet.add(s));
      (r.segmentos_raw || []).forEach(s => acc.segSet.add(s));
      Object.entries(r.forn_valor || {}).forEach(([forn, v]) => {
        acc.fornValor.set(forn, (acc.fornValor.get(forn) || 0) + v);
      });
    });
  });

  const totalGeral = Array.from(catMap.values()).reduce((a,c) => a + c.valorTotal, 0);
  const rows = Array.from(catMap.values()).sort((a,b) => b.valorTotal - a.valorTotal);

  const totalItens = new Set(), totalFornecedores = new Set();
  let acum = 0;
  const ranking = rows.map((c, i) => {
    c.itensSet.forEach(v => totalItens.add(v));
    c.fornValor.forEach((v, f) => totalFornecedores.add(f));

    const partPct = totalGeral ? c.valorTotal / totalGeral : 0;
    acum += partPct * 100;
    const classe = classifyAbcJs(acum);

    let principalForn = null, principalValor = 0;
    c.fornValor.forEach((v, forn) => { if(v > principalValor){ principalValor = v; principalForn = forn; } });

    return {
      Rank: i + 1, Categoria: c.Categoria, Classe: classe,
      'Valor Total': Math.round(c.valorTotal*100)/100,
      'Part. %': partPct,
      'Acum. %': Math.round(acum*1000)/1000,
      'Itens Únicos': c.itensSet.size,
      'Fornecedores': c.fornValor.size,
      'Subcategorias': c.subSet.size,
      'Pedidos': c.pedidos,
      'Ticket Médio': c.pedidos ? Math.round((c.valorTotal/c.pedidos)*100)/100 : 0,
      'Segmentos': Array.from(c.segSet).sort().join(', '),
      'Principal Forn.': principalForn,
      'Valor Princ.': Math.round(principalValor*100)/100,
      'Concentração Princ. %': c.valorTotal ? Math.round((principalValor/c.valorTotal)*10000)/10000 : 0,
    };
  });

  const classeCounts = {A:0,B:0,C:0}, classeValores = {A:0,B:0,C:0};
  ranking.forEach(r => { classeCounts[r.Classe]++; classeValores[r.Classe] += r['Valor Total']; });

  const kpis = {
    total_geral: Math.round(totalGeral*100)/100,
    total_categorias: ranking.length,
    total_itens: totalItens.size,
    total_fornecedores: totalFornecedores.size,
    classe_a_qtd: classeCounts.A, classe_a_valor: Math.round(classeValores.A*100)/100,
    classe_b_qtd: classeCounts.B, classe_b_valor: Math.round(classeValores.B*100)/100,
    classe_c_qtd: classeCounts.C, classe_c_valor: Math.round(classeValores.C*100)/100,
    top_categoria: ranking.length ? ranking[0].Categoria : null,
  };

  return {
    kpis, ranking,
    abc_curve: ranking.map(r => [r.Rank, r['Acum. %'], r.Classe]),
    abc_class_summary: ['A','B','C'].map(c => ({Classe: c, categorias: classeCounts[c], valor: Math.round(classeValores[c]*100)/100})),
    treemap_data: aggregateTreemap(keys),
  };
}

function periodData(){
  const isAll = currentPeriod.length === 1 && currentPeriod[0] === 'ALL';
  if(isAll) return DATA.periods['ALL'];
  if(currentPeriod.length === 1) return DATA.periods[currentPeriod[0]] || DATA.periods['ALL'];
  return aggregateCategoriasPeriod(currentPeriod);
}
function periodLabel(){
  return formatMultiPeriodLabel(currentPeriod, monthLabels) ||
    ((currentPeriod.length === 1 && currentPeriod[0] === 'ALL') ? 'Todos os meses' : (monthLabels[currentPeriod[0]] || currentPeriod[0]));
}

/* ===================== Tabs ===================== */
const tabButtons = document.querySelectorAll('#tabNav button');

function setActiveView(viewKey){
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === viewKey));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewKey).classList.add('active');
  // Evolução Mensal (série completa) não usa o filtro de período: a barra some só nela
  document.getElementById('periodBar').hidden = (viewKey === 'evolucao');
  window.dispatchEvent(new Event('resize'));
}
tabButtons.forEach(btn => btn.addEventListener('click', () => setActiveView(btn.dataset.view)));

/* ===================== Period chips ===================== */
initPeriodFilter({
  containerId: 'periodChips',
  months: monthsOrder,
  monthLabels: monthLabels,
  onChange: (selected) => {
    currentPeriod = selected;
    renderAll();
  },
});
document.getElementById('periodNote').textContent = 'Ctrl+clique para selecionar vários meses';

/* ===================== Header meta ===================== */
document.getElementById('genDate').textContent = DATA.gerado_em;

/* ===================== Chart instances ===================== */
let chartClasseDonut, chartSpend, chartItens, chartFornecedores, chartEvolucao;

/* ===================== KPI Grid ===================== */
function renderKPIs(){
  const k = periodData().kpis;
  const items = [
    {label:'Total Geral de Compras', value: fmtBRL(k.total_geral), sub: periodLabel(), cls:''},
    {label:'Total de Categorias', value: fmtNum(k.total_categorias), sub:'Categorias ativas no período', cls:''},
    {label:'Categoria #1', value: k.top_categoria || '—', sub:'Maior valor de compra no período', cls:''},
    {label:'Classe A', value: fmtNum(k.classe_a_qtd) + ' categ.', sub: fmtBRL(k.classe_a_valor) + ' · ' + fmtPct1(100*k.classe_a_valor/k.total_geral), cls:'accent-a'},
    {label:'Classe B', value: fmtNum(k.classe_b_qtd) + ' categ.', sub: fmtBRL(k.classe_b_valor) + ' · ' + fmtPct1(100*k.classe_b_valor/k.total_geral), cls:'accent-b'},
    {label:'Classe C', value: fmtNum(k.classe_c_qtd) + ' categ.', sub: fmtBRL(k.classe_c_valor) + ' · ' + fmtPct1(100*k.classe_c_valor/k.total_geral), cls:'accent-c'},
  ];
  document.getElementById('kpiGrid').innerHTML = items.map(it => `
    <div class="kpi-card ${it.cls}">
      <div class="label">${it.label}</div>
      <div class="value">${it.value}</div>
      <div class="sub">${it.sub}</div>
    </div>
  `).join('');

  document.getElementById('genTotal').textContent = 'Total (' + periodLabel() + '): ' + fmtBRL(k.total_geral);
  document.getElementById('brandSub').textContent =
    'Painel central de acompanhamento das categorias de produto · ' + fmtNum(k.total_categorias) + ' categorias · ' +
    fmtNum(k.total_itens) + ' itens · ' + fmtNum(k.total_fornecedores) + ' fornecedores (' + periodLabel() + ')';
  document.getElementById('rankingTitle').textContent = 'Ranking de categorias — ' + periodLabel() + ' (' + fmtNum(k.total_categorias) + ' categorias)';
  document.getElementById('spendSub').textContent = 'Valor total comprado, por categoria — ' + periodLabel();
  document.getElementById('itensSub').textContent = fmtNum(k.total_itens) + ' itens únicos no total — ' + periodLabel();
  document.getElementById('fornSub').textContent = fmtNum(k.total_fornecedores) + ' fornecedores únicos no total — ' + periodLabel();
}

/* ===================== Hero stat ===================== */
function renderHero(){
  const curve = periodData().abc_curve;
  const total = curve.length;
  let crossRank = curve.find(r => r[1] >= 80);
  crossRank = crossRank ? crossRank[0] : total;
  const pctCateg = total ? (100*crossRank/total) : 0;
  document.getElementById('heroBig').innerHTML = pctCateg.toFixed(0) + '<span>% das categorias</span>';
  document.getElementById('heroDesc').innerHTML =
    `<b>${crossRank} de ${total} categorias</b> (top ranking por valor, ${periodLabel()}) já respondem por <b>80% de todo o valor comprado</b> no período selecionado.
     São as categorias prioritárias para negociação de contrato, revisão de fornecedor principal e acompanhamento de preço.`;
}

/* ===================== Donut: Classe distribution ===================== */
function renderDonut(){
  if(chartClasseDonut) chartClasseDonut.destroy();
  const summary = periodData().abc_class_summary;
  chartClasseDonut = new Chart(document.getElementById('chartClasseDonut'), {
    type:'doughnut',
    data:{
      labels: summary.map(d => 'Classe ' + d.Classe + ' (' + d.categorias + ')'),
      datasets:[{
        data: summary.map(d => d.valor),
        backgroundColor: summary.map(d => CLASS_COLORS[d.Classe]),
        borderWidth:2,
        borderColor:'#fff'
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{position:'bottom', labels:{boxWidth:10, padding:14}},
        tooltip:{callbacks:{label: (ctx) => ' ' + ctx.label + ': ' + fmtBRL(ctx.parsed)}}
      },
      cutout:'62%'
    }
  });
}

/* ===================== Spend / Itens / Fornecedores por categoria ===================== */
function renderTopCharts(){
  const rows = periodData().ranking.slice().sort((a,b) => b['Valor Total'] - a['Valor Total']);

  if(chartSpend) chartSpend.destroy();
  chartSpend = new Chart(document.getElementById('chartSpend'), {
    type:'bar',
    data:{
      labels: rows.map(r => r.Categoria),
      datasets:[{ data: rows.map(r => r['Valor Total']), backgroundColor:'#0E6E6E', borderRadius:4 }]
    },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=> ' ' + fmtBRL(ctx.parsed.x)}} },
      scales:{ x:{ ticks:{callback:(v)=>fmtBRL(v)}, grid:{color:'#EEF0F3'} }, y:{ grid:{display:false}, ticks:{font:{size:10.5}} } }
    }
  });

  const byItens = rows.slice().sort((a,b) => b['Itens Únicos'] - a['Itens Únicos']);
  if(chartItens) chartItens.destroy();
  chartItens = new Chart(document.getElementById('chartItens'), {
    type:'bar',
    data:{
      labels: byItens.map(r => r.Categoria),
      datasets:[{ data: byItens.map(r => r['Itens Únicos']), backgroundColor:'#C98A3B', borderRadius:4 }]
    },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=> ' ' + fmtNum(ctx.parsed.x) + ' itens'}} },
      scales:{ x:{ ticks:{callback:(v)=>fmtNum(v)}, grid:{color:'#EEF0F3'} }, y:{ grid:{display:false}, ticks:{font:{size:10.5}} } }
    }
  });

  const byForn = rows.slice().sort((a,b) => b['Fornecedores'] - a['Fornecedores']);
  if(chartFornecedores) chartFornecedores.destroy();
  chartFornecedores = new Chart(document.getElementById('chartFornecedores'), {
    type:'bar',
    data:{
      labels: byForn.map(r => r.Categoria),
      datasets:[{ data: byForn.map(r => r['Fornecedores']), backgroundColor:'#5B7FBF', borderRadius:4 }]
    },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=> ' ' + fmtNum(ctx.parsed.x) + ' fornecedores'}} },
      scales:{ x:{ ticks:{callback:(v)=>fmtNum(v)}, grid:{color:'#EEF0F3'} }, y:{ grid:{display:false}, ticks:{font:{size:10.5}} } }
    }
  });
}

/* ===================== Ranking table (sortable + filter + search) ===================== */
const rankingCols = [
  {key:'Rank', label:'#', num:true},
  {key:'Categoria', label:'Categoria'},
  {key:'Classe', label:'Classe'},
  {key:'Valor Total', label:'Valor Total', num:true, fmt:fmtBRL},
  {key:'Part. %', label:'Part.%', num:true, fmt:fmtPct},
  {key:'Itens Únicos', label:'Itens Únicos', num:true, fmt:fmtNum},
  {key:'Fornecedores', label:'Fornecedores', num:true, fmt:fmtNum},
  {key:'Subcategorias', label:'Subcateg.', num:true, fmt:fmtNum},
  {key:'Pedidos', label:'Pedidos', num:true, fmt:fmtNum},
  {key:'Ticket Médio', label:'Ticket Médio', num:true, fmt:fmtBRL},
  {key:'Principal Forn.', label:'Fornecedor Principal'},
  {key:'Concentração Princ. %', label:'Conc. no Princ.', num:true, fmt:fmtPct},
];
let rankSortKey = 'Rank', rankSortDir = 1;
let rankClasseFilter = 'ALL';
let rankSearchTerm = '';

function renderRankingHead(){
  const thead = document.querySelector('#rankingTable thead');
  thead.innerHTML = '<tr>' + rankingCols.map(c => {
    let cls = c.num ? 'num' : '';
    if(c.key === rankSortKey) cls += (rankSortDir===1 ? ' sorted-asc' : ' sorted-desc');
    return `<th class="${cls}" data-key="${c.key}">${c.label}</th>`;
  }).join('') + '</tr>';
  thead.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if(rankSortKey === key){ rankSortDir *= -1; } else { rankSortKey = key; rankSortDir = 1; }
      renderRankingHead(); renderRankingBody();
    });
  });
}

function renderRankingBody(){
  const tbody = document.querySelector('#rankingTable tbody');
  let rows = periodData().ranking.filter(r => {
    if(rankClasseFilter !== 'ALL' && r.Classe !== rankClasseFilter) return false;
    if(rankSearchTerm){
      const hay = (r.Categoria + ' ' + r['Principal Forn.']).toLowerCase();
      if(!hay.includes(rankSearchTerm)) return false;
    }
    return true;
  });
  rows = rows.slice().sort((a,b) => {
    const va = a[rankSortKey], vb = b[rankSortKey];
    if(typeof va === 'number') return (va - vb) * rankSortDir;
    return String(va).localeCompare(String(vb)) * rankSortDir;
  });
  document.getElementById('rankResultCount').textContent = fmtNum(rows.length) + ' de ' + fmtNum(periodData().ranking.length) + ' categorias';
  tbody.innerHTML = rows.map(r => `
    <tr>
      ${rankingCols.map(c => {
        let val = r[c.key];
        if(c.key === 'Classe'){ return `<td><span class="pill pill-${val}">${val}</span></td>`; }
        if(c.fmt) val = c.fmt(val);
        return `<td class="${c.num?'num':''}">${val}</td>`;
      }).join('')}
    </tr>
  `).join('') || '<tr><td colspan="'+rankingCols.length+'" style="text-align:center;color:var(--text-faint);padding:20px;">Nenhuma categoria encontrada.</td></tr>';
}

document.getElementById('rankSearch').addEventListener('input', (e) => {
  rankSearchTerm = e.target.value.trim().toLowerCase();
  renderRankingBody();
});
document.getElementById('rankFilters').querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('rankFilters').querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    rankClasseFilter = chip.dataset.classe;
    renderRankingBody();
  });
});

function renderRanking(){
  renderRankingHead();
  renderRankingBody();
}

/* ===================== Composição (treemap Categoria -> Subcategoria) =====================
   Treemap de verdade (algoritmo "squarified"): a ÁREA de cada quadro é proporcional ao valor acumulado dele, na mesma
   escala para todos os quadros da aba (o dobro do valor ocupa o dobro da área), preenchendo todo o espaço disponível.
   Dois níveis: categorias (blocos, área ~ valor total da categoria) e, dentro de cada uma, TODAS as subcategorias — cada
   uma é um quadro clicável (sem agrupar em "demais").
   Produção Central, Refeição de Funcionários e CPQ - Produção (juntas, menos de 1% do total) formam um único bloco.
   Área mínima: só os quadros que, pela proporção exata, ficariam menores que o necessário para ver e clicar (24x24 px)
   recebem esse mínimo; a diferença sai, proporcionalmente, dos demais. O layout é recalculado quando o período muda e
   quando a largura da área muda (inclusive ao abrir a aba). */
let selectedSubcategoria = null; // {grupo, subgrupo} | null — reseta a cada re-render (troca de período)

const TM_LADO_MIN = 28;                       // lado (px) reservado para cada quadro minimo: sobram >= 24x24 px visiveis depois das folgas
const TM_AREA_MIN = TM_LADO_MIN * TM_LADO_MIN;
const TM_ALTURA_CAB = 22;                     // faixa com o nome da categoria
const TM_GRUPO_JUNTO = ['PRODUCAO CENTRAL', 'REFEICAO FUNCIONARIOS', 'CPQ - PRODUCAO'];
const TM_GRUPO_JUNTO_NOME = 'PRODUCAO CENTRAL / FUNCIONARIOS / CPQ';
let tmBlocos = null, tmTotal = 0, tmLarguraUsada = 0;

// monta os blocos (categorias) e seus quadros (subcategorias) a partir de treemap_data
function tmPrepararBlocos(treemapData){
  const blocos = [];
  const junto = {nome: TM_GRUPO_JUNTO_NOME, value: 0, celulas: [], origens: 0};
  let unico = null;
  treemapData.forEach(g => {
    const celulas = g.children.map(c => ({grupo: g.name, child: c, nome: c.name, value: c.value}));
    const bloco = {nome: g.name, value: g.value, celulas};
    if(TM_GRUPO_JUNTO.includes(g.name)){
      junto.value += g.value; junto.origens++; unico = bloco;
      celulas.forEach(c => junto.celulas.push(Object.assign({}, c, {origem: g.name})));
    } else {
      blocos.push(bloco);
    }
  });
  if(junto.origens === 1) blocos.push(unico);          // so' uma das tres existe neste periodo: segue com o nome dela
  else if(junto.origens > 1) blocos.push(junto);
  blocos.sort((a, b) => b.value - a.value);
  blocos.forEach(b => b.celulas.sort((x, y) => y.value - x.value));
  return blocos;
}

// "squarified treemap" (Bruls et al.): itens ordenados por area decrescente; devolve {item, x, y, w, h} preenchendo o retangulo
function tmSquarify(itens, x, y, w, h){
  const out = [];
  let resto = itens.slice();
  const pior = (linha, soma, lado) => {
    let mx = 0, mn = Infinity;
    linha.forEach(it => { if(it.area > mx) mx = it.area; if(it.area < mn) mn = it.area; });
    return Math.max(lado * lado * mx / (soma * soma), (soma * soma) / (lado * lado * mn));
  };
  while(resto.length){
    const lado = Math.min(w, h);
    let linha = [resto[0]], soma = resto[0].area, ruim = pior(linha, soma, lado), k = 1;
    while(k < resto.length){
      const nSoma = soma + resto[k].area;
      const nRuim = pior(linha.concat(resto[k]), nSoma, lado);
      if(nRuim <= ruim){ linha.push(resto[k]); soma = nSoma; ruim = nRuim; k++; } else break;
    }
    if(w >= h){                                          // coluna a esquerda
      const cw = soma / h; let cy = y;
      linha.forEach(it => { const ch = it.area / cw; out.push({item: it, x, y: cy, w: cw, h: ch}); cy += ch; });
      x += cw; w -= cw;
    } else {                                             // faixa no topo
      const rh = soma / w; let cx = x;
      linha.forEach(it => { const cw = it.area / rh; out.push({item: it, x: cx, y, w: cw, h: rh}); cx += cw; });
      y += rh; h -= rh;
    }
    resto = resto.slice(linha.length);
  }
  return out;
}

function tmElemento(cls, texto){
  const el = document.createElement('div');
  el.className = cls;
  if(texto != null) el.textContent = texto;
  return el;
}

// calcula o layout (em px) para a largura/altura dadas; cada quadro pode ter uma area minima propria (c.areaMin)
function tmCalcular(W, H){
  const area = W * H;
  const blocos = tmBlocos;
  // escala (px² por R$) tal que a soma das demandas (quadros, com o minimo, + faixa da categoria) preencha a area.
  // Demanda de um quadro = max(valor*escala, minimo); a faixa da categoria custa ALTURA * largura do bloco (estimada,
  // e refinada pelas larguras reais do layout anterior).
  const cabCusto = blocos.map(b => TM_ALTURA_CAB * Math.sqrt(Math.max(b.value, 1) * area / tmTotal * 1.4));
  let layoutBlocos = null;
  for(let passo = 0; passo < 4; passo++){
    const demanda = (s) => blocos.map((b, i) => {
      const d = b.celulas.reduce((a, c) => a + Math.max(c.value * s, c.areaMin), 0);
      return d + (d > 6000 ? cabCusto[i] : 0);
    });
    let lo = 0, hi = area / tmTotal * 1.5;
    for(let it = 0; it < 50; it++){
      const mid = (lo + hi) / 2;
      if(demanda(mid).reduce((a, d) => a + d, 0) > area) hi = mid; else lo = mid;
    }
    const s = lo;
    const dem = demanda(s);
    const soma = dem.reduce((a, d) => a + d, 0);
    const itens = blocos.map((b, i) => ({bloco: b, area: dem[i] * area / soma, s, idx: i}));
    itens.sort((a, b) => b.area - a.area);
    layoutBlocos = tmSquarify(itens, 0, 0, W, H);
    layoutBlocos.forEach(r => { cabCusto[r.item.idx] = TM_ALTURA_CAB * r.w; });
  }
  // dentro de cada bloco: faixa da categoria (se couber) + quadros com area proporcional (com o minimo), preenchendo o bloco
  return layoutBlocos.map(r => {
    const bloco = r.item.bloco, s = r.item.s;
    const bx = r.x + 1, by = r.y + 1, bw = r.w - 2, bh = r.h - 2;
    const comCab = bw >= 90 && bh >= TM_ALTURA_CAB + 40;
    const iy = by + (comCab ? TM_ALTURA_CAB : 0), ih = bh - (comCab ? TM_ALTURA_CAB : 0);
    const dem = bloco.celulas.map(c => Math.max(c.value * s, c.areaMin));
    const somaDem = dem.reduce((a, d) => a + d, 0);
    const itens = bloco.celulas.map((c, i) => ({cel: c, area: dem[i] * (bw * ih) / somaDem, ci: i}));
    return {bloco, bx, by, bw, bh, comCab, quadros: tmSquarify(itens, bx, iy, bw, ih)};
  });
}

function tmDesenhar(){
  const container = document.getElementById('treemapContainer');
  if(!tmBlocos) return;
  const W = Math.floor(container.clientWidth);
  if(W < 50){ tmLarguraUsada = 0; return; }            // aba oculta: desenha quando a area ficar visivel
  const H = Math.round(Math.min(640, Math.max(420, W * 0.48)));
  container.style.position = 'relative';
  container.style.height = H + 'px';
  container.innerHTML = '';

  // quadro cujo formato ficaria fino demais (lado visivel < 24 px) ganha area minima maior, ate caber — so' esses
  tmBlocos.forEach(b => b.celulas.forEach(c => { c.areaMin = TM_AREA_MIN; }));
  let layout = tmCalcular(W, H);
  for(let rodada = 0; rodada < 12; rodada++){
    let mudou = false;
    layout.forEach(bl => bl.quadros.forEach(q => {
      const menor = Math.min(q.w, q.h) - 2;
      if(menor < 24){
        // faixa fina: a espessura e' area/comprimento, entao a area necessaria e' ~ (espessura minima) x (comprimento)
        const necessaria = 27.5 * Math.max(q.w, q.h);
        if(necessaria > q.item.cel.areaMin * 1.001){ q.item.cel.areaMin = necessaria; mudou = true; }
      }
    }));
    if(!mudou) break;
    layout = tmCalcular(W, H);
  }

  const fmtPart = (v) => fmtPct(v / tmTotal);
  layout.forEach(bl => {
    const bloco = bl.bloco, gi = tmBlocos.indexOf(bloco);
    if(bl.comCab){
      const cab = tmElemento('treemap-cab', bl.bw >= 200 ? `${bloco.nome} — ${fmtBRL(bloco.value)}` : bloco.nome);
      cab.style.cssText = `left:${bl.bx}px;top:${bl.by}px;width:${bl.bw}px;height:${TM_ALTURA_CAB}px;`;
      cab.title = `${bloco.nome}\n${fmtBRL(bloco.value)} · ${fmtPart(bloco.value)} do total`;
      container.appendChild(cab);
    }
    bl.quadros.forEach(q => {
      const c = q.item.cel;
      const cx = q.x + 1, cy = q.y + 1, cw = Math.max(q.w - 2, 1), ch = Math.max(q.h - 2, 1);
      const cell = tmElemento('treemap-cell');
      cell.style.cssText = `left:${cx}px;top:${cy}px;width:${cw}px;height:${ch}px;`;
      cell.style.background = CHART_PALETTE[gi % CHART_PALETTE.length];
      cell.style.opacity = (0.55 + 0.45 * (1 - q.item.ci / bloco.celulas.length)).toFixed(2);
      cell.dataset.grupo = c.grupo;
      cell.dataset.subgrupo = c.child.name;
      cell.addEventListener('click', () => selectSubcategoria(c.grupo, c.child));
      // rotulo conforme o tamanho: grande (nome, valor e %), medio (nome e valor), pequeno (nome abreviado) ou sem texto
      const nomeCel = c.nome;
      const largValor = fmtBRL(c.value).length * 8.2 + 18;   // largura que o valor (fonte mono) precisa para nao ser cortado
      if(cw >= Math.max(150, largValor) && ch >= 86){
        cell.classList.add('tm-g');
        cell.appendChild(tmElemento('name', nomeCel));
        if(c.origem) cell.appendChild(tmElemento('origem', c.origem));
        cell.appendChild(tmElemento('value', fmtBRL(c.value)));
        cell.appendChild(tmElemento('part', fmtPart(c.value)));
      } else if(cw >= largValor && ch >= 50){
        cell.classList.add('tm-m');
        cell.appendChild(tmElemento('name', nomeCel));
        cell.appendChild(tmElemento('value', fmtBRL(c.value)));
      } else if(cw >= (fmtBRL(c.value).split(/\s/).pop().length * 8.2 + 16) && ch >= 64){
        // quadro estreito: o valor ("R$" e numero) quebra em duas linhas, na mesma fonte, em vez de sumir
        cell.classList.add('tm-m');
        cell.appendChild(tmElemento('name', nomeCel));
        cell.appendChild(tmElemento('value quebra', fmtBRL(c.value).split(/\s/).join('\n')));
      } else if(cw >= 46 && ch >= 24){
        cell.classList.add('tm-p');
        cell.appendChild(tmElemento('name', c.nome));
      }
      cell.title = `${c.grupo} › ${nomeCel}\n${fmtBRL(c.value)} · ${fmtPart(c.value)} do total`;
      container.appendChild(cell);
    });
  });
  tmLarguraUsada = W;
  if(selectedSubcategoria){
    container.querySelectorAll('.treemap-cell').forEach(c => {
      c.classList.toggle('selected', c.dataset.grupo === selectedSubcategoria.grupo && c.dataset.subgrupo === selectedSubcategoria.subgrupo);
    });
  }
}

function renderTreemap(){
  const treemapData = periodData().treemap_data;
  const total = treemapData.reduce((a,d)=>a+d.value,0);
  const container = document.getElementById('treemapContainer');
  container.innerHTML = '';
  container.style.height = '';
  selectedSubcategoria = null;
  tmBlocos = null; tmLarguraUsada = 0;
  if(!treemapData.length || total <= 0){
    container.innerHTML = '<p style="color:var(--text-faint);font-size:12.5px;padding:20px 0;text-align:center;">Sem dado de categoria no período selecionado.</p>';
    renderSubcategoriaFornecedores();
    return;
  }
  tmBlocos = tmPrepararBlocos(treemapData);
  tmTotal = total;
  tmDesenhar();            // se a aba estiver oculta (largura 0), desenha quando ela abrir (ResizeObserver abaixo)
  renderSubcategoriaFornecedores();
}

// recalcula o layout quando a largura da area muda (abrir a aba, redimensionar a janela)
{
  const cont = document.getElementById('treemapContainer');
  const aoRedimensionar = () => {
    const w = Math.floor(cont.clientWidth);
    if(tmBlocos && w >= 50 && w !== tmLarguraUsada) tmDesenhar();
  };
  if(window.ResizeObserver) new ResizeObserver(aoRedimensionar).observe(cont);
  window.addEventListener('resize', aoRedimensionar);
}

function selectSubcategoria(grupoName, child){
  selectedSubcategoria = {grupo: grupoName, subgrupo: child.name};
  document.querySelectorAll('#treemapContainer .treemap-cell').forEach(c => {
    c.classList.toggle('selected', c.dataset.grupo === grupoName && c.dataset.subgrupo === child.name);
  });
  renderSubcategoriaFornecedores(grupoName, child);
  // scroll manual (nao scrollIntoView) porque o header e' sticky e esconderia o topo do card
  const card = document.getElementById('subcatFornCard');
  const headerHeight = document.querySelector('header').getBoundingClientRect().height;
  const cardTop = card.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({top: cardTop - headerHeight - 12, behavior:'smooth'});
}

function renderSubcategoriaFornecedores(grupoName, child){
  const title = document.getElementById('subcatFornTitle');
  const sub = document.getElementById('subcatFornSub');
  const thead = document.querySelector('#subcatFornTable thead');
  const tbody = document.querySelector('#subcatFornTable tbody');
  const cols = [
    {key:'rank', label:'#'},
    {key:'nome', label:'FORNECEDOR'},
    {key:'valor', label:'VALOR', num:true},
    {key:'part', label:'PART.%', num:true},
  ];
  thead.innerHTML = '<tr>' + cols.map(c => `<th class="${c.num?'num':''}">${c.label}</th>`).join('') + '</tr>';

  if(!child){
    title.textContent = 'Fornecedores da subcategoria';
    sub.textContent = 'Clique em uma subcategoria acima para ver os fornecedores vinculados a ela.';
    tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--text-faint);padding:20px;">Nenhuma subcategoria selecionada.</td></tr>`;
    return;
  }

  title.textContent = `Fornecedores — ${child.name}`;
  sub.textContent = `${grupoName} · ${fmtBRL(child.value)} no período · ${fmtNum(child.fornecedores.length)} fornecedor(es)`;

  if(!child.fornecedores.length){
    tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--text-faint);padding:20px;">Nenhum fornecedor encontrado para esta subcategoria no período selecionado.</td></tr>`;
    return;
  }

  tbody.innerHTML = child.fornecedores.map((f, i) => `
    <tr>
      <td class="num">${i+1}</td>
      <td>${f.nome}</td>
      <td class="num">${fmtBRL(f.valor)}</td>
      <td class="num">${fmtPct(f.part)}</td>
    </tr>
  `).join('');
}

/* ===================== Evolução mensal (toggle valor/itens/fornecedores) — sempre serie completa ===================== */
(function evolucaoModule(){
  let currentMode = 'valor';

  function buildDatasets(mode){
    const records = mode === 'valor' ? DATA.monthly_grupo_records
      : mode === 'itens' ? DATA.monthly_itens_records
      : DATA.monthly_fornecedores_records;
    const cols = DATA.monthly_grupo_cols;
    const labels = records.map(r => monthLabels[r.MES] || r.MES);
    const datasets = cols.map((c, i) => ({
      label: c,
      data: records.map(r => r[c] || 0),
      backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
      stack:'s1'
    }));
    return {labels, datasets};
  }

  function tooltipFmt(mode, value){
    if(mode === 'valor') return fmtBRL(value);
    return fmtNum(value) + (mode === 'itens' ? ' itens' : ' fornecedores');
  }

  function render(mode){
    const {labels, datasets} = buildDatasets(mode);
    if(chartEvolucao) chartEvolucao.destroy();
    chartEvolucao = new Chart(document.getElementById('chartEvolucao'), {
      type:'bar',
      data:{labels, datasets},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{position:'bottom', labels:{boxWidth:10, padding:12, font:{size:11}}},
          tooltip:{callbacks:{label:(ctx)=> ' ' + ctx.dataset.label + ': ' + tooltipFmt(mode, ctx.parsed.y)}}
        },
        scales:{
          x:{ stacked:true, grid:{display:false} },
          y:{ stacked:true, ticks:{callback:(v)=> mode==='valor' ? fmtBRL(v) : fmtNum(v)}, grid:{color:'#EEF0F3'} }
        }
      }
    });
  }

  document.getElementById('evoToggle').querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('evoToggle').querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      render(currentMode);
    });
  });

  render(currentMode);
})();

/* ===================== Render orchestrator ===================== */
function renderAll(){
  renderKPIs();
  renderHero();
  renderDonut();
  renderTopCharts();
  renderRanking();
  renderTreemap();
}

renderAll();

} catch(err) {
  console.error('Erro ao montar o dashboard:', err);
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="background:#C0442C;color:#fff;padding:14px 24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;">' +
    '<strong>Erro ao carregar o dashboard:</strong> ' + (err && err.message ? err.message : err) +
    '. Tente recarregar a página; se persistir, verifique se o arquivo foi aberto/baixado corretamente.' +
    '</div>');
}

try {
/* ===================== Setup ===================== */
/* Config por indicador — parametriza tudo que muda entre CMV e CMC; o resto
   do dashboard (KPIs, evolucao, composicao, categoria, insights, ranking,
   heatmap, scatter, geo) e' generico e le sempre daqui, nao de "CMC"/"CMV"
   escritos diretamente no meio do codigo. CMV e' o indicador padrao. */
const INDICATOR_CONFIG = {
  cmv: {
    key: 'cmv',
    label: 'CMV',
    labelFull: 'Custo da Mercadoria Vendida',
    data: (typeof CMV_DATA !== 'undefined') ? CMV_DATA : null,
    meta: null, // sem meta de referencia definida para CMV
    subcats: (typeof CMV_DATA !== 'undefined' && CMV_DATA && CMV_DATA.subcats) ? CMV_DATA.subcats : [],
    formula: 'CMV = CMV ÷ Receita Líquida',
    semDadoTexto: 'nenhum CMV registrado',
  },
  cmc: {
    key: 'cmc',
    label: 'CMC',
    labelFull: 'Custo da Mercadoria Consumida',
    data: (typeof CMC_DATA !== 'undefined') ? CMC_DATA : null,
    meta: 31,
    subcats: [
      {key:'alimentos', label:'Alimentos'},
      {key:'vinhos', label:'Vinhos'},
      {key:'bebidas', label:'Bebidas'},
    ],
    formula: 'CMC = Custo líquido de mercadoria ÷ Vendas',
    semDadoTexto: 'nenhum custo de compra registrado',
  },
};

let activeIndicador = (INDICATOR_CONFIG.cmv.data) ? 'cmv' : 'cmc';
let cfg = INDICATOR_CONFIG[activeIndicador];
let DATA = cfg.data;
let META = cfg.meta;
let monthLabels = DATA.month_labels;

const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:0}).format(v);
const fmtNum = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(v));
const fmtPct1 = (v) => (v===null||v===undefined) ? '—' : v.toFixed(1).replace('.', ',') + '%';

const CHART_PALETTE = ['#0E6E6E','#C98A3B','#5B7FBF','#8A5AC9','#2F8F5B','#C0442C','#3E5C76','#94A0AF','#B8895A','#6B8F3E'];
const SUBCAT_COLORS = ['#C98A3B','#8A5AC9','#5B7FBF'];

Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
Chart.defaults.font.size = 11.5;
Chart.defaults.color = '#5B6472';

function cmcClass(v){
  if(META===null||META===undefined) return 'warn'; // sem meta: badge neutro (unica cor), sem julgamento de bom/ruim
  if(v===null||v===undefined) return 'warn';
  // arredonda na mesma precisao exibida nos badges (1 casa decimal), para que
  // um valor mostrado como "31,0%" seja tratado como "dentro da meta"
  const r = Math.round(v*10)/10;
  if(r<META) return 'good';       // abaixo da meta: bom/positivo
  if(r===META) return 'warn';     // igual a meta: dentro da meta (nao e alerta negativo)
  return 'bad';                       // acima da meta: ruim/negativo
}
function cmcBadge(v){
  return `<span class="cmc-badge ${cmcClass(v)}">${fmtPct1(v)}</span>`;
}

/* ===================== Nível 1: Indicador (CMV | CMC) ===================== */
const indicatorButtons = document.querySelectorAll('#indicatorNav button');
function setActiveIndicador(key){
  if(!INDICATOR_CONFIG[key] || !INDICATOR_CONFIG[key].data) return;
  activeIndicador = key;
  cfg = INDICATOR_CONFIG[activeIndicador];
  DATA = cfg.data;
  META = cfg.meta;
  monthLabels = DATA.month_labels;
  indicatorButtons.forEach(b => b.classList.toggle('active', b.dataset.indicador === key));

  currentPeriod = ['ALL'];
  initPeriodFilter({
    containerId: 'periodChips',
    months: DATA.months_order,
    monthLabels: monthLabels,
    onChange: (selected) => { currentPeriod = selected; renderAllPeriodDependent(); },
  });

  document.getElementById('genTotal').textContent = `Vendas (${fullPeriodLabel()}): ` + fmtBRL(DATA.periods['ALL'].kpis.vendas_total);
  document.querySelectorAll('.ind-label').forEach(el => { el.textContent = cfg.label; });
  applyIndicadorTexts();

  renderAllPeriodDependent();
  renderEvolucao();
  renderHeatmap();
}
indicatorButtons.forEach(btn => btn.addEventListener('click', () => setActiveIndicador(btn.dataset.indicador)));

/* ===================== Tabs (Nível 2: análise) ===================== */
const tabButtons = document.querySelectorAll('#tabNav button');
function setActiveView(viewKey){
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === viewKey));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewKey).classList.add('active');
  window.dispatchEvent(new Event('resize'));
}
tabButtons.forEach(btn => btn.addEventListener('click', () => setActiveView(btn.dataset.view)));

/* ===================== Header meta ===================== */
function fullPeriodLabel(){
  const meses = DATA.months_order;
  if(!meses.length) return 'Todos os meses';
  const ini = monthLabels[meses[0]] || meses[0];
  const fim = monthLabels[meses[meses.length-1]] || meses[meses.length-1];
  return ini === fim ? ini : `${ini}–${fim}`;
}
document.getElementById('genDate').textContent = DATA.gerado_em;

/* Textos estaticos do HTML que dependem do indicador ativo (frases inteiras,
   nao so a palavra "CMC"/"CMV" — essas trocam via .ind-label em cada
   setActiveIndicador). */
function applyIndicadorTexts(){
  const subLabels = cfg.subcats.map(s => s.label).join(', ');
  document.getElementById('evoSub').textContent =
    `${cfg.label} Geral, ${subLabels} · esta aba sempre exibe a série completa (${fullPeriodLabel()}), independente do filtro de período`;
  document.getElementById('heatmapSub').textContent =
    `Todas as casas, ordenadas por volume de vendas (decrescente) · esta aba sempre exibe a série completa (${fullPeriodLabel()}), independente do filtro de período`;
  document.getElementById('footerText').textContent =
    `${cfg.label} calculado a partir da base de ${activeIndicador==='cmv'?'receita líquida e CMV':'vendas e compras'} por casa (${fullPeriodLabel()}). Metodologia: ${cfg.formula}. Dados sintéticos — empresa fictícia, projeto de portfólio.`;
}

/* ===================== Period chips (seleção múltipla, estilo Power BI) ===================== */
let currentPeriod = ['ALL'];
initPeriodFilter({
  containerId: 'periodChips',
  months: DATA.months_order,
  monthLabels: monthLabels,
  onChange: (selected) => { currentPeriod = selected; renderAllPeriodDependent(); },
});

function periodLabel(){
  const multi = formatMultiPeriodLabel(currentPeriod, monthLabels);
  if(multi) return multi;
  if(currentPeriod.length === 1 && currentPeriod[0] !== 'ALL') return monthLabels[currentPeriod[0]] || currentPeriod[0];
  return fullPeriodLabel();
}

/* Reconstrói, no cliente, um objeto de período no mesmo formato de
   DATA.periods[mes] a partir de vários meses selecionados ao mesmo tempo —
   usada só quando 2+ meses específicos estão selecionados (para 1 mês ou
   'ALL', o objeto pré-computado de DATA.periods já serve, sem trabalho
   extra). Reconstrói ranking/geo a partir do ranking por casa mesclado
   (soma vendas_total/custo_total, que são aditivos) em vez de tentar
   mesclar as tabelas geo já agregadas — assim qtd_casas/cmc_pct saem
   corretos (união de casas, nunca duplicada) para qualquer combinação de
   meses, mesmo não contíguos. media_cmc/mediana_cmc já são estatísticas de
   todo o histórico da casa (period-independent), então não precisam ser
   recalculadas aqui. Generico para CMV/CMC via cfg.subcats. */
function aggregatePeriod(keys){
  const casaMap = new Map();
  keys.forEach(k => {
    const p = DATA.periods[k];
    if(!p) return;
    (p.ranking || []).forEach(r => {
      if(!casaMap.has(r.casa)){
        casaMap.set(r.casa, {casa:r.casa, vendas_total:0, custo_total:0, segmento:r.segmento, regiao:r.regiao, media_cmc:r.media_cmc, mediana_cmc:r.mediana_cmc});
      }
      const acc = casaMap.get(r.casa);
      acc.vendas_total += r.vendas_total;
      acc.custo_total += r.custo_total;
    });
    (p.sem_dado_custo || []).forEach(casa => {
      if(!casaMap.has(casa)) casaMap.set(casa, {casa, vendas_total:0, custo_total:0, segmento:null, regiao:null, media_cmc:null, mediana_cmc:null});
    });
  });

  const ranking = [], semDado = [];
  casaMap.forEach(acc => {
    if(acc.custo_total > 0 && acc.vendas_total > 0){
      acc.cmc_pct = acc.custo_total / acc.vendas_total * 100;
      ranking.push(acc);
    } else {
      semDado.push(acc.casa);
    }
  });
  ranking.sort((a,b) => a.cmc_pct - b.cmc_pct);
  const melhores = ranking.slice(0, 15);
  const piores = ranking.slice(-15).reverse();

  const subFields = cfg.subcats.flatMap(s => ['vendas_'+s.key, 'custo_'+s.key]);
  const kSum = sumPeriodFields(DATA.periods, keys, ['vendas_total','custo_total'].concat(subFields), 'kpis');
  const pct = (num, den) => den ? num/den*100 : null;
  const kpis = Object.assign({}, kSum, { cmc_geral_pct: pct(kSum.custo_total, kSum.vendas_total), qtd_casas: ranking.length });
  cfg.subcats.forEach(s => { kpis[`cmc_${s.key}_pct`] = pct(kSum[`custo_${s.key}`], kSum[`vendas_${s.key}`]); });
  // sem os campos *_mom: variação mês a mês não se aplica a uma seleção de vários meses

  const scatter = ranking.map(r => ({vendas_total:r.vendas_total, cmc_pct:r.cmc_pct, casa:r.casa}));

  const byRegiao = new Map(), matrix = new Map(), bySegmento = new Map();
  ranking.forEach(r => {
    if(!r.regiao || !r.segmento) return;
    if(!byRegiao.has(r.regiao)) byRegiao.set(r.regiao, {regiao:r.regiao, vendas_total:0, custo_total:0, qtd_casas:0});
    Object.assign(byRegiao.get(r.regiao), {
      vendas_total: byRegiao.get(r.regiao).vendas_total + r.vendas_total,
      custo_total: byRegiao.get(r.regiao).custo_total + r.custo_total,
      qtd_casas: byRegiao.get(r.regiao).qtd_casas + 1,
    });
    const mk = r.segmento + '|' + r.regiao;
    if(!matrix.has(mk)) matrix.set(mk, {segmento:r.segmento, regiao:r.regiao, vendas_total:0, custo_total:0, qtd_casas:0});
    const mc = matrix.get(mk);
    mc.vendas_total += r.vendas_total; mc.custo_total += r.custo_total; mc.qtd_casas += 1;
    if(!bySegmento.has(r.segmento)) bySegmento.set(r.segmento, {segmento:r.segmento, vendas_total:0, custo_total:0, qtd_casas:0});
    const bs = bySegmento.get(r.segmento);
    bs.vendas_total += r.vendas_total; bs.custo_total += r.custo_total; bs.qtd_casas += 1;
  });
  [byRegiao, matrix, bySegmento].forEach(m => m.forEach(v => { v.cmc_pct = pct(v.custo_total, v.vendas_total); }));

  const treemap = Array.from(byRegiao.values()).map(br => ({
    name: br.regiao,
    value: br.vendas_total,
    children: Array.from(matrix.values()).filter(m => m.regiao === br.regiao)
      .map(m => ({name:m.segmento, value:m.vendas_total})).sort((a,b)=>b.value-a.value),
  })).sort((a,b)=>b.value-a.value);

  return {
    kpis, ranking, melhores, piores, scatter,
    sem_dado_custo: semDado,
    geo: {
      by_regiao: Array.from(byRegiao.values()).sort((a,b)=>b.vendas_total-a.vendas_total),
      by_segmento: Array.from(bySegmento.values()).sort((a,b)=>b.vendas_total-a.vendas_total),
      matrix: Array.from(matrix.values()),
      treemap,
    },
  };
}

function periodData(){
  if(currentPeriod.length === 1) return DATA.periods[currentPeriod[0]] || DATA.periods['ALL'];
  return aggregatePeriod(currentPeriod);
}

/* ===================== Visão Geral ===================== */
let chartEvolucao, chartComposicao, chartCategoria;

function trendBadge(momValue, invertGoodDirection){
  if(momValue === null || momValue === undefined) return '<div class="no-data">sem comparativo</div>';
  const up = momValue > 0;
  let colorCls;
  if(Math.abs(momValue) < 0.05){ colorCls = 'flat'; }
  else if(invertGoodDirection){ colorCls = up ? 'down' : 'up'; }
  else { colorCls = up ? 'up' : 'down'; }
  const arrow = up ? '&uarr;' : (momValue < 0 ? '&darr;' : '&rarr;');
  return `<div class="trend ${colorCls}">${arrow} ${Math.abs(momValue).toFixed(1).replace('.', ',')}</div>`;
}

function renderKPIs(){
  const k = periodData().kpis;
  const cards = [
    {label:`${cfg.label} Geral`, value: fmtPct1(k.cmc_geral_pct), mom: k.cmc_geral_pct_mom, invert:true, cls:'accent-a'},
  ].concat(cfg.subcats.map(s => ({
    label: `${cfg.label} ${s.label}`,
    value: fmtPct1(k[`cmc_${s.key}_pct`]),
    mom: k[`cmc_${s.key}_pct_mom`],
    invert: true, cls: '',
  })));
  document.getElementById('kpiGrid').innerHTML = cards.map(c => `
    <div class="kpi-card ${c.cls}">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
      ${trendBadge(c.mom, c.invert)}
    </div>
  `).join('');

  document.getElementById('brandSub').textContent = `${cfg.labelFull} por casa do grupo · ${periodLabel()}`;
}

function renderEvolucao(){
  if(chartEvolucao) chartEvolucao.destroy();
  const serie = DATA.monthly_trend;
  const datasets = [
    {label:`${cfg.label} Geral`, data: serie.map(r=>r.cmc_geral_pct), borderColor:'#0E6E6E', backgroundColor:'rgba(14,110,110,0.08)', fill:true, tension:.3, pointRadius:4, pointBackgroundColor:'#0E6E6E'},
  ].concat(cfg.subcats.map((s,i) => ({
    label: s.label,
    data: serie.map(r => r[`cmc_${s.key}_pct`]),
    borderColor: SUBCAT_COLORS[i % SUBCAT_COLORS.length],
    borderDash:[4,3], fill:false, tension:.3, pointRadius:3,
  })));
  chartEvolucao = new Chart(document.getElementById('chartEvolucao'), {
    type:'line',
    data:{ labels: serie.map(r => monthLabels[r.MES]), datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'bottom', labels:{boxWidth:10}}, tooltip:{callbacks:{label:(ctx)=>' '+ctx.dataset.label+': '+ctx.parsed.y.toFixed(1)+'%'}}},
      scales:{ y:{ ticks:{callback:(v)=>v+'%'}, grid:{color:'#EEF0F3'} }, x:{ grid:{display:false} } }
    }
  });
}

function renderComposicao(){
  if(chartComposicao) chartComposicao.destroy();
  const k = periodData().kpis;
  chartComposicao = new Chart(document.getElementById('chartComposicao'), {
    type:'doughnut',
    data:{
      labels: cfg.subcats.map(s=>s.label),
      datasets:[{ data: cfg.subcats.map(s=>k[`vendas_${s.key}`]), backgroundColor: SUBCAT_COLORS, borderWidth:2, borderColor:'#fff' }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom', labels:{boxWidth:10}}, tooltip:{callbacks:{label:(ctx)=>' '+ctx.label+': '+fmtBRL(ctx.parsed)}} },
      cutout:'60%'
    }
  });
}

function renderCategoria(){
  if(chartCategoria) chartCategoria.destroy();
  const k = periodData().kpis;
  const cats = cfg.subcats.map(s => ({label:s.label, v:k[`cmc_${s.key}_pct`]})).filter(c => c.v !== null);
  chartCategoria = new Chart(document.getElementById('chartCategoria'), {
    type:'bar',
    data:{ labels: cats.map(c=>c.label), datasets:[{ data: cats.map(c=>c.v), backgroundColor:SUBCAT_COLORS, borderRadius:5, maxBarThickness:60 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=>' '+ctx.parsed.y.toFixed(1)+'%'}} },
      scales:{ y:{ ticks:{callback:(v)=>v+'%'}, grid:{color:'#EEF0F3'} }, x:{ grid:{display:false} } }
    }
  });
}

/* Classifica um valor contra a meta unica do indicador ativo (mesmo
   arredondamento de cmcClass, mas mapeado para os tipos de insight-card:
   oportunidade/atencao/alerta em vez de good/warn/bad). Sem meta definida
   (CMV), classifica como 'info' — sem julgamento de bom/ruim. */
function metaInsightClass(v){
  if(META===null||META===undefined) return 'info';
  if(v===null||v===undefined) return 'info';
  const r = Math.round(v*10)/10;
  if(r<META) return 'oportunidade';
  if(r===META) return 'atencao';
  return 'alerta';
}

/* ===================== Mural de Insights =====================
   Insights fixos, recalculados a cada troca de filtro de periodo a partir
   de periodData() (ranking/melhores/piores/kpis do periodo selecionado) e
   de DATA.monthly_trend (para a evolucao). Os 2 insights que comparam
   contra uma meta (3 e 5) só aparecem quando o indicador ativo tem meta
   definida (hoje, só CMC — CMV não tem meta de referência). */
function renderInsights(){
  const p = periodData();
  const insights = [];
  document.getElementById('insightSub').textContent = `Gerados a partir do período selecionado · ${periodLabel()}`;

  // 1) Pior casa (maior indicador no periodo selecionado)
  const pior = p.piores && p.piores[0];
  if(pior){
    insights.push({
      tipo: metaInsightClass(pior.cmc_pct),
      label: 'Pior Casa',
      texto: `${pior.casa} — ${cfg.label} de ${fmtPct1(pior.cmc_pct)}`,
    });
  }

  // 2) Melhor casa (menor indicador no periodo selecionado)
  const melhor = p.melhores && p.melhores[0];
  if(melhor){
    insights.push({
      tipo: metaInsightClass(melhor.cmc_pct),
      label: 'Melhor Casa',
      texto: `${melhor.casa} — ${cfg.label} de ${fmtPct1(melhor.cmc_pct)}`,
    });
  }

  // 3) Quantidade de casas acima da meta (só com meta definida)
  if(META !== null && META !== undefined){
    const ranking = (p.ranking || []).filter(r => r.cmc_pct !== null && r.cmc_pct !== undefined);
    const acimaMeta = ranking.filter(r => r.cmc_pct > META);
    insights.push({
      tipo: acimaMeta.length ? 'alerta' : 'oportunidade',
      label: 'Casas Acima da Meta',
      texto: `${fmtNum(acimaMeta.length)} de ${fmtNum(ranking.length)} casas`,
    });
  }

  // 4) Evolucao do indicador geral: primeiro x ultimo mes DENTRO do periodo
  // selecionado (com "Todos os meses" = toda a serie; um mes especifico
  // selecionado = primeiro e ultimo mes coincidem, entao a evolucao fica
  // "estavel" por definicao, respeitando o filtro).
  const scopeMonths = currentPeriod.length === 1 && currentPeriod[0] === 'ALL'
    ? DATA.months_order
    : currentPeriod.slice().sort();
  const trendByMes = {};
  DATA.monthly_trend.forEach(t => { trendByMes[t.MES] = t.cmc_geral_pct; });
  const firstMes = scopeMonths[0], lastMes = scopeMonths[scopeMonths.length - 1];
  const firstV = trendByMes[firstMes], lastV = trendByMes[lastMes];
  if(firstV !== undefined && lastV !== undefined){
    const delta = lastV - firstV;
    let tipo, direcao;
    if(Math.abs(delta) < 0.05){ tipo = 'info'; direcao = 'estável'; }
    else if(delta < 0){ tipo = 'oportunidade'; direcao = `redução de ${Math.abs(delta).toFixed(1).replace('.', ',')} p.p.`; }
    else { tipo = 'alerta'; direcao = `aumento de ${delta.toFixed(1).replace('.', ',')} p.p.`; }
    insights.push({
      tipo,
      label: `Evolução do ${cfg.label}`,
      texto: firstMes === lastMes
        ? `${direcao} (${monthLabels[firstMes] || firstMes})`
        : `${direcao} — de ${fmtPct1(firstV)} para ${fmtPct1(lastV)}`,
    });
  }

  // 5) Indicador geral do grupo vs. meta (só com meta definida)
  const geral = p.kpis ? p.kpis.cmc_geral_pct : null;
  if(META !== null && META !== undefined && geral !== null && geral !== undefined){
    const tipo = metaInsightClass(geral);
    const diff = Math.abs(geral - META).toFixed(1).replace('.', ',');
    let texto;
    if(tipo === 'atencao') texto = `${fmtPct1(geral)} — dentro da meta de ${META}%`;
    else if(tipo === 'alerta') texto = `${fmtPct1(geral)} — ${diff} p.p. acima da meta de ${META}%`;
    else texto = `${fmtPct1(geral)} — ${diff} p.p. abaixo da meta de ${META}%`;
    insights.push({ tipo, label: `${cfg.label} Geral vs. Meta`, texto });
  }

  const iconMap = {alerta:'Alerta', oportunidade:'Oportunidade', atencao:'Atenção', info:'Info'};
  document.getElementById('insightList').innerHTML = insights.map(i => `
    <div class="insight-card ${i.tipo}">
      <div class="dot"></div>
      <p><span class="insight-tag">${iconMap[i.tipo]||i.tipo}</span><b>${i.label}:</b> ${i.texto}</p>
    </div>
  `).join('');
}

function renderDataQualityNote(){
  const semDado = periodData().sem_dado_custo || [];
  const block = document.getElementById('dqBlock');
  if(semDado.length){
    block.style.display = 'block';
    document.getElementById('dqText').textContent =
      `${semDado.length} casa(s) com ${cfg.semDadoTexto} no período selecionado (${semDado.join(', ')}) — `+
      `foram excluídas do ranking e dos gráficos de ${cfg.label} por casa, já que sem custo lançado o percentual calculado não é representativo.`;
  } else {
    block.style.display = 'none';
  }
}

/* ===================== Ranking de Casas ===================== */
function renderTopTables(){
  const p = periodData();
  const rowHtml = (r) => `<tr><td>${r.casa}</td><td class="num">${fmtBRL(r.vendas_total)}</td><td class="num">${fmtPct1(r.media_cmc)}</td><td class="num">${fmtPct1(r.mediana_cmc)}</td><td class="num">${cmcBadge(r.cmc_pct)}</td></tr>`;
  document.querySelector('#tableMelhores tbody').innerHTML = p.melhores.map(rowHtml).join('') ||
    '<tr><td colspan="5" style="text-align:center;color:var(--text-faint);padding:16px;">Sem casas com custo registrado no período.</td></tr>';
  document.querySelector('#tablePiores tbody').innerHTML = p.piores.map(rowHtml).join('') ||
    '<tr><td colspan="5" style="text-align:center;color:var(--text-faint);padding:16px;">Sem casas com custo registrado no período.</td></tr>';
}

function getRankingCols(){
  return [
    {key:'casa', label:'Casa'},
    {key:'segmento', label:'Segmento'},
    {key:'regiao', label:'Região'},
    {key:'vendas_total', label:'Vendas', num:true, fmt:fmtBRL},
    {key:'custo_total', label:'Custo', num:true, fmt:fmtBRL},
    {key:'media_cmc', label:'Média '+cfg.label, num:true, fmt:fmtPct1},
    {key:'mediana_cmc', label:'Mediana '+cfg.label, num:true, fmt:fmtPct1},
    {key:'cmc_pct', label:cfg.label, num:true, fmt:(v)=>cmcBadge(v)},
  ];
}
let rankSortKey = 'cmc_pct', rankSortDir = 1;
let rankSearchTerm = '';

function renderRankingHead(){
  const rankingCols = getRankingCols();
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
  const rankingCols = getRankingCols();
  const tbody = document.querySelector('#rankingTable tbody');
  let rows = periodData().ranking.filter(r => {
    if(rankSearchTerm && !r.casa.toLowerCase().includes(rankSearchTerm)) return false;
    return true;
  });
  rows = rows.slice().sort((a,b) => {
    const va = a[rankSortKey], vb = b[rankSortKey];
    if(typeof va === 'number') return (va - vb) * rankSortDir;
    return String(va).localeCompare(String(vb)) * rankSortDir;
  });
  document.getElementById('rankResultCount').textContent = fmtNum(rows.length) + ' de ' + fmtNum(periodData().ranking.length) + ' casas';
  tbody.innerHTML = rows.map(r => `
    <tr>${rankingCols.map(c => {
      let val = r[c.key];
      if(c.fmt) val = c.fmt(val);
      return `<td class="${c.num?'num':''}">${val}</td>`;
    }).join('')}</tr>
  `).join('') || '<tr><td colspan="'+rankingCols.length+'" style="text-align:center;color:var(--text-faint);padding:20px;">Nenhuma casa encontrada.</td></tr>';
}

document.getElementById('rankSearch').addEventListener('input', (e) => {
  rankSearchTerm = e.target.value.trim().toLowerCase();
  renderRankingBody();
});

function renderRanking(){
  renderRankingHead();
  renderRankingBody();
}

/* ===================== Heatmap (fixo, sempre serie completa) ===================== */
let heatmapSearchTerm = '';

function heatmapCellStyle(v){
  if(v===null||v===undefined) return {bg:'#FAFBFC', color:'var(--text-faint)', text:'—'};
  const t = Math.max(0, Math.min(1, (v-15)/25)); // 15%=claro, 40%+=vermelho forte
  const r = Math.round(243 + (192-243)*t);
  const g = Math.round(244 + (68-244)*t);
  const b = Math.round(247 + (44-247)*t);
  return {bg:`rgb(${r},${g},${b})`, color: t>0.5 ? '#fff':'var(--text)', text: v.toFixed(0)+'%'};
}

function renderHeatmapBody(){
  const {meses, linhas} = DATA.heatmap_casa_mes;
  const rows = heatmapSearchTerm
    ? linhas.filter(row => row.casa.toLowerCase().includes(heatmapSearchTerm))
    : linhas;

  document.getElementById('heatmapResultCount').textContent =
    fmtNum(rows.length) + ' de ' + fmtNum(linhas.length) + ' casas';

  let html = '';
  rows.forEach(row => {
    html += `<tr><td class="fname">${row.casa}</td>`;
    row.valores.forEach(v => {
      const st = heatmapCellStyle(v);
      html += `<td style="background:${st.bg};color:${st.color};">${st.text}</td>`;
    });
    html += '</tr>';
  });
  document.querySelector('#heatmapCasaMes tbody').innerHTML = html ||
    `<tr><td colspan="${meses.length+1}" style="text-align:center;color:var(--text-faint);padding:16px;">Nenhuma casa encontrada.</td></tr>`;
}

function renderHeatmap(){
  const {meses} = DATA.heatmap_casa_mes;
  let head = '<thead><tr><th style="position:sticky;left:0;background:#fff;">Casa</th>';
  meses.forEach(m => head += `<th class="num">${monthLabels[m]}</th>`);
  head += '</tr></thead><tbody></tbody>';
  document.getElementById('heatmapCasaMes').innerHTML = head;
  renderHeatmapBody();
}

document.getElementById('heatmapSearch').addEventListener('input', (e) => {
  heatmapSearchTerm = e.target.value.trim().toLowerCase();
  renderHeatmapBody();
});

/* ===================== Scatter (sensivel ao periodo) ===================== */
let chartScatter;
function renderScatter(){
  if(chartScatter) chartScatter.destroy();
  const items = periodData().scatter;
  chartScatter = new Chart(document.getElementById('chartScatter'), {
    type:'scatter',
    data:{
      datasets:[{
        label:'Casas',
        data: items.map(it => ({x: it.vendas_total, y: it.cmc_pct, casa: it.casa})),
        backgroundColor: items.map(it => cmcClass(it.cmc_pct)==='good' ? '#0E6E6ECC' : cmcClass(it.cmc_pct)==='warn' ? '#C98A3BCC' : '#C0442CCC'),
        pointRadius:6, pointHoverRadius:9,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:(ctx)=> ctx.raw.casa + ': ' + fmtBRL(ctx.raw.x) + ' · ' + cfg.label + ' ' + ctx.raw.y.toFixed(1)+'%'}}
      },
      scales:{
        x:{ title:{display:true,text:'Vendas totais (R$)'}, ticks:{callback:(v)=>fmtBRL(v)}, grid:{color:'#EEF0F3'} },
        y:{ title:{display:true,text:cfg.label+' (%)'}, grid:{color:'#EEF0F3'} }
      }
    }
  });
}

/* ===================== Geolocalização (sensivel ao periodo) ===================== */
const REGIAO_LABELS = {SP: 'São Paulo', RJ: 'Rio de Janeiro', BR: 'Outras cidades (Brasil)'};
let chartGeoBar;

function renderGeoRegionCards(){
  const geo = periodData().geo;
  const wrap = document.getElementById('geoRegionCards');
  if(!geo){ wrap.innerHTML = ''; return; }
  wrap.innerHTML = geo.by_regiao.map(r => `
    <div class="geo-region-card">
      <div class="name">${REGIAO_LABELS[r.regiao] || r.regiao} (${r.regiao})</div>
      <div class="cmc-value">${cmcBadge(r.cmc_pct)}</div>
      <div class="details">${fmtBRL(r.vendas_total)} em vendas · ${r.qtd_casas} casas</div>
    </div>
  `).join('');
}

function renderGeoMatrix(){
  const geo = periodData().geo;
  const table = document.getElementById('geoMatrix');
  if(!geo){ table.innerHTML = ''; return; }

  const segmentos = [...new Set(geo.matrix.map(r => r.segmento))].sort();
  const regioes = ['SP', 'RJ', 'BR'].filter(r => geo.matrix.some(m => m.regiao === r));
  const cellMap = {};
  geo.matrix.forEach(r => { cellMap[r.segmento + '|' + r.regiao] = r; });
  const totalByRegiao = {};
  geo.by_regiao.forEach(r => { totalByRegiao[r.regiao] = r; });

  let html = '<thead><tr><th>Segmento</th>' + regioes.map(r => `<th>${r}</th>`).join('') + '</tr></thead><tbody>';
  segmentos.forEach(seg => {
    html += `<tr><td class="geo-label">${seg}</td>`;
    regioes.forEach(reg => {
      const cell = cellMap[seg + '|' + reg];
      if(!cell || cell.cmc_pct === null || cell.cmc_pct === undefined){
        html += '<td class="geo-empty">—</td>';
      } else {
        const st = cmcClass(cell.cmc_pct);
        const bg = st === 'good' ? 'var(--accent-soft)' : st === 'warn' ? 'var(--amber-soft)' : '#FBEAE6';
        const color = st === 'good' ? 'var(--accent-dark)' : st === 'warn' ? '#8A5A20' : 'var(--red)';
        html += `<td style="background:${bg};color:${color};">${fmtPct1(cell.cmc_pct)}<span class="geo-sub">${fmtBRL(cell.vendas_total)}</span></td>`;
      }
    });
    html += '</tr>';
  });
  html += `<tr class="geo-total"><td class="geo-label" style="background:var(--accent-dark);color:#fff;">TOTAL</td>` +
    regioes.map(reg => `<td>${totalByRegiao[reg] ? fmtPct1(totalByRegiao[reg].cmc_pct) : '—'}</td>`).join('') +
    '</tr></tbody>';
  table.innerHTML = html;
}

function renderGeoBar(){
  const geo = periodData().geo;
  if(chartGeoBar) chartGeoBar.destroy();
  if(!geo) return;
  const segmentos = [...new Set(geo.matrix.map(r => r.segmento))].sort();
  const regioes = ['SP', 'RJ', 'BR'];
  const cellMap = {};
  geo.matrix.forEach(r => { cellMap[r.segmento + '|' + r.regiao] = r.cmc_pct; });

  chartGeoBar = new Chart(document.getElementById('chartGeoBar'), {
    type: 'bar',
    data: {
      labels: segmentos,
      datasets: regioes.map((reg, i) => ({
        label: reg,
        data: segmentos.map(seg => cellMap[seg + '|' + reg] ?? null),
        backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
        borderRadius: 4,
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {position: 'bottom', labels: {boxWidth: 10}},
        tooltip: {callbacks: {label: (ctx) => ctx.parsed.y === null ? ' sem dado' : ' ' + ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%'}}
      },
      scales: {
        y: {ticks: {callback: (v) => v + '%'}, grid: {color: '#EEF0F3'}},
        x: {grid: {display: false}}
      }
    }
  });
}

function renderGeoTreemap(){
  const geo = periodData().geo;
  const container = document.getElementById('geoTreemap');
  container.innerHTML = '';
  if(!geo || !geo.treemap.length) return;

  const total = geo.treemap.reduce((a, d) => a + d.value, 0);
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexWrap = 'wrap';
  wrap.style.gap = '3px';
  geo.treemap.forEach((regiao, gi) => {
    const gShare = regiao.value / total;
    const gWidthPct = Math.max(gShare * 100, 20);
    const outer = document.createElement('div');
    outer.style.cssText = 'flex:1 1 ' + gWidthPct + '%; min-width:160px;';
    const label = document.createElement('div');
    label.style.cssText = 'width:100%;font-size:11px;font-weight:800;color:var(--text-soft);margin:0 0 4px 0;text-transform:uppercase;letter-spacing:.03em;';
    label.textContent = `${regiao.name} — ${fmtBRL(regiao.value)}`;
    outer.appendChild(label);

    const inner = document.createElement('div');
    inner.style.display = 'flex';
    inner.style.flexWrap = 'wrap';
    inner.style.gap = '3px';
    const childTotal = regiao.children.reduce((a, c) => a + c.value, 0);
    regiao.children.forEach((child, ci) => {
      const cShare = childTotal ? child.value / childTotal : 0;
      const cell = document.createElement('div');
      cell.className = 'treemap-cell' + (cShare < 0.15 ? ' small' : '');
      cell.style.flex = `1 1 ${Math.max(cShare * 100, 28)}%`;
      cell.style.minHeight = (40 + cShare * 90) + 'px';
      cell.style.background = CHART_PALETTE[gi % CHART_PALETTE.length];
      cell.style.opacity = (0.55 + 0.45 * (1 - ci / regiao.children.length)).toFixed(2);
      cell.innerHTML = `<div class="name">${child.name}</div><div class="value">${fmtBRL(child.value)}</div>`;
      inner.appendChild(cell);
    });
    outer.appendChild(inner);
    wrap.appendChild(outer);
  });
  container.appendChild(wrap);
}

function renderGeo(){
  renderGeoRegionCards();
  renderGeoMatrix();
  renderGeoBar();
  renderGeoTreemap();
}

function renderAllPeriodDependent(){
  renderKPIs();
  renderComposicao();
  renderCategoria();
  renderDataQualityNote();
  renderTopTables();
  renderRanking();
  renderScatter();
  renderGeo();
  renderInsights();
}

/* ===================== Init ===================== */
document.getElementById('genTotal').textContent = `Vendas (${fullPeriodLabel()}): ` + fmtBRL(DATA.periods['ALL'].kpis.vendas_total);
document.querySelectorAll('.ind-label').forEach(el => { el.textContent = cfg.label; });
applyIndicadorTexts();
renderAllPeriodDependent();
renderEvolucao();
renderHeatmap();

} catch(err) {
  console.error('Erro ao montar o modulo de CMC:', err);
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="background:#C0442C;color:#fff;padding:14px 24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;">' +
    '<strong>Erro ao carregar o módulo:</strong> ' + (err && err.message ? err.message : err) +
    '</div>');
}

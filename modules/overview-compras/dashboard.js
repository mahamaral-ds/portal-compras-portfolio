try {
/* ===================== Setup ===================== */
const DATA = OVERVIEW_DATA;

const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:0}).format(v);
const fmtNum = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(v));
const fmtPct2 = (v) => (v===null || v===undefined) ? '—' : v.toFixed(2).replace('.', ',') + '%';
const fmtDias = (v) => (v===null || v===undefined) ? '—' : v.toFixed(2).replace('.', ',');
const fmtMi = (v) => (v===null || v===undefined) ? '—' : (v/1e6).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' Mi';
const fmtMil = (v) => (v===null || v===undefined) ? '—' : (v/1e3).toLocaleString('pt-BR', {minimumFractionDigits:3, maximumFractionDigits:3}) + ' Mil';

/* Padrão visual dos gráficos (GFX, criarGrafico, fmtValor, rótulos, tooltip): shared/portal-charts.js, compartilhado com
   a página Indicadores. Aqui fica só o que depende dos dados desta página. */

// cor de uma categoria (grupo): fixa pelo nome — a ordem vem do período completo, então não muda com o filtro
const corCategoria = (() => {
  const ordem = (DATA.periods['ALL'].top_grupos || []).map(r => r.grupo);
  return (nome) => {
    const i = ordem.indexOf(nome);
    return GFX.paleta[(i < 0 ? ordem.length : i) % GFX.paleta.length];
  };
})();

/* ===================== Period state ===================== */
let currentPeriod = ['ALL'];
const monthsOrder = DATA.months_order;
const monthLabels = DATA.month_labels;
const TOP_N_FORNECEDORES = 15, TOP_N_GRUPOS = 5, TOP_N_SEGMENTOS = 3, TOP_N_ITENS = 20;

/* Reconstrói, no cliente, um objeto de período no mesmo formato de
   DATA.periods[mes] a partir de vários meses selecionados ao mesmo tempo —
   soma o valor de cada fornecedor/grupo/segmento entre os meses escolhidos
   (build_data.py já manda as listas completas, sem corte de top-N, para
   isso funcionar corretamente) e refaz a união de itens distintos (SKUs)
   a partir de itens_idx, para não contar duas vezes um item comprado em
   mais de um mês selecionado. */
function aggregateOverviewPeriod(keys){
  const fornMap = new Map(), grupoMap = new Map(), segMap = new Map(), itemValMap = new Map();
  const itensSet = new Set();
  let gasto = 0;
  keys.forEach(k => {
    const p = DATA.periods[k];
    if(!p) return;
    gasto += p.kpis.gasto;
    (p.top_fornecedores||[]).forEach(r => fornMap.set(r.fornecedor, (fornMap.get(r.fornecedor)||0) + r.valor));
    (p.top_grupos||[]).forEach(r => grupoMap.set(r.grupo, (grupoMap.get(r.grupo)||0) + r.valor));
    (p.top_segmentos||[]).forEach(r => segMap.set(r.segmento, (segMap.get(r.segmento)||0) + r.valor));
    (p.itens_idx||[]).forEach(i => itensSet.add(i));
    (p.itens_valor||[]).forEach(([i, v]) => itemValMap.set(i, (itemValMap.get(i)||0) + v));
  });
  const toSortedArr = (map, keyName) => Array.from(map.entries())
    .map(([kk,v]) => ({[keyName]:kk, valor: Math.round(v*100)/100}))
    .sort((a,b) => b.valor - a.valor);
  return {
    kpis: { gasto: Math.round(gasto*100)/100, skus: itensSet.size, fornecedores: fornMap.size },
    top_fornecedores: toSortedArr(fornMap, 'fornecedor'),
    top_grupos: toSortedArr(grupoMap, 'grupo'),
    top_segmentos: toSortedArr(segMap, 'segmento'),
    itens_valor: Array.from(itemValMap.entries()).map(([i, v]) => [i, Math.round(v*100)/100]).sort((a, b) => b[1] - a[1]),
  };
}

function periodData(){
  if(currentPeriod.length === 1) return DATA.periods[currentPeriod[0]] || DATA.periods['ALL'];
  return aggregateOverviewPeriod(currentPeriod);
}
function periodLabel(){
  const multi = formatMultiPeriodLabel(currentPeriod, monthLabels);
  if(multi) return multi;
  if(currentPeriod.length === 1 && currentPeriod[0] !== 'ALL') return monthLabels[currentPeriod[0]] || currentPeriod[0];
  return 'Todos os meses';
}
function externalRowFor(periodArr){
  if(periodArr.length === 1 && periodArr[0] === 'ALL'){
    const rows = DATA.external_kpis;
    return rows.length ? rows[rows.length - 1] : null; // mais recente disponível
  }
  // 1 mês ou vários: usa o mês mais recente dentre os selecionados que tenha
  // KPI disponível — CMV/Inflação/PMP/DIO/Cotação não são aditivos entre
  // meses, então "somar" a seleção não faria sentido aqui.
  const sorted = periodArr.slice().sort();
  for(let i = sorted.length - 1; i >= 0; i--){
    const row = DATA.external_kpis.find(r => r.MES === sorted[i]);
    if(row) return row;
  }
  return null;
}

/* ===================== Period chips (seleção múltipla, estilo Power BI) ===================== */
initPeriodFilter({
  containerId: 'periodChips',
  months: monthsOrder,
  monthLabels: monthLabels,
  onChange: (selected) => { currentPeriod = selected; renderAll(); },
});

/* ===================== Header ===================== */
document.getElementById('genDate').textContent = DATA.gerado_em;

/* ===================== KPI Grid ===================== */
function renderKPIs(){
  const k = periodData().kpis;
  const ext = externalRowFor(currentPeriod);
  const extLabel = ext ? monthLabels[ext.MES] : 'sem KPI no período';

  // Quantidade de Pedidos: mesma regra e mesma funcao de Indicadores (shared/portal-pedidos.js)
  const pedidos = contarPedidos(currentPeriod, (mes) => DATA.periods[mes] && DATA.periods[mes].pedido_ids, DATA.periods['ALL'].kpis.pedidos);

  const items = [
    {label:'Gasto no Período', value: fmtMi(k.gasto), sub: periodLabel(), cls:'accent-a'},
    {label:'Quantidade de Pedidos', value: fmtNum(pedidos), sub: periodLabel(), cls:'accent-a'},
    {label:'CMV', value: ext ? fmtPct2(ext.cmv) : '—', sub: extLabel, cls:'accent-b'},
    {label:'SKUs', value: fmtMil(k.skus), sub: periodLabel(), cls:'accent-a'},
    {label:'Inflação interna', value: ext ? fmtPct2(ext.inflacao) : '—', sub: extLabel, cls:'accent-b'},
    {label:'PMP', value: ext ? fmtDias(ext.pmp) : '—', sub: 'dias · ' + extLabel, cls:'accent-b'},
    {label:'DIO', value: ext ? fmtDias(ext.dio) : '—', sub: 'dias · ' + extLabel, cls:'accent-b'},
    {label:'Fornecedores', value: fmtNum(k.fornecedores), sub: periodLabel(), cls:'accent-a'},
    {label:'Cotação', value: (ext && ext.cotacao!==null) ? fmtNum(ext.cotacao) : '—', sub: extLabel, cls:'accent-b'},
  ];
  document.getElementById('kpiGrid').innerHTML = items.map(it => `
    <div class="kpi-card ${it.cls}">
      <div class="label">${it.label}</div>
      <div class="value">${it.value}</div>
      <div class="sub">${it.sub}</div>
    </div>
  `).join('');

  document.getElementById('brandSub').textContent =
    `Panorama geral do setor de compras · ${periodLabel()}`;
}

/* ===================== Top 15 Fornecedores (barra horizontal) ===================== */
let chartTopFornecedores, chartGrupo, chartSegmento, chartTopItens;

function renderTopFornecedores(){
  document.getElementById('topFornecedoresSub').textContent = 'Maior valor comprado — ' + periodLabel();
  const rows = periodData().top_fornecedores.slice(0, TOP_N_FORNECEDORES);
  if(chartTopFornecedores) chartTopFornecedores.destroy();
  chartTopFornecedores = criarGrafico({
    canvas: 'chartTopFornecedores', horizontal: true,
    rotulos: rows.map(r => r.fornecedor), valores: rows.map(r => r.valor),
    cor: GFX.cor.valor, tituloSerie: 'Valor comprado',
    formato: fmtValor, formatoTooltip: fmtBRL,
    eixoValor: { maxTicks: 5 }, rotuloCategoria: truncarRotulo,
  });
}

/* ===================== Histórico CMV (últimos 4 meses) — painel de tendência fixo ===================== */
function renderCmvHistorico(){
  const series = DATA.cmv_historico_series;
  criarGrafico({
    canvas: 'chartCmvHistorico',
    rotulos: series.map(r => r.mes_label), valores: series.map(r => r.cmv),
    cor: GFX.cor.indicador, tituloSerie: 'CMV',
    formato: fmtPercentual, formatoTooltip: (v) => 'CMV: ' + fmtPercentual(v),
    eixoValor: { min: 20, max: 35, titulo: 'CMV %', maxTicks: 4 },
  });
}

/* ===================== Top Categorias (GRUPO) ===================== */
function renderTopGrupos(){
  document.getElementById('topGruposSub').textContent = 'Maior valor comprado — ' + periodLabel();
  const rows = periodData().top_grupos.slice(0, TOP_N_GRUPOS);
  if(chartGrupo) chartGrupo.destroy();
  chartGrupo = criarGrafico({
    canvas: 'chartGrupo', horizontal: true,
    rotulos: rows.map(r => r.grupo), valores: rows.map(r => r.valor),
    cores: rows.map(r => corCategoria(r.grupo)), tituloSerie: 'Valor comprado',
    formato: fmtValor, formatoTooltip: fmtBRL,
    eixoValor: { ticks: false }, rotuloCategoria: quebrarRotulo,
  });
}

/* ===================== Top Verticais (SEGMENTO) ===================== */
function renderTopSegmentos(){
  document.getElementById('topSegmentosSub').textContent = 'Maior valor comprado — ' + periodLabel();
  const rows = periodData().top_segmentos.slice(0, TOP_N_SEGMENTOS);
  if(chartSegmento) chartSegmento.destroy();
  chartSegmento = criarGrafico({
    canvas: 'chartSegmento',
    rotulos: rows.map(r => r.segmento), valores: rows.map(r => r.valor),
    cor: GFX.cor.valor, tituloSerie: 'Valor comprado',
    formato: fmtValor, formatoTooltip: fmtBRL,
    eixoValor: { ticks: false }, rotuloCategoria: quebrarRotulo,
  });
}

/* ===================== Top 20 Itens (barra horizontal) — acompanha o filtro de período ===================== */
function renderTopItens(){
  document.getElementById('topItensSub').textContent = 'Maior valor comprado — ' + periodLabel();
  const rows = periodData().itens_valor.slice(0, TOP_N_ITENS).map(([i, v]) => ({item: DATA.dict_itens_overview[i], valor: v}));
  if(chartTopItens) chartTopItens.destroy();
  chartTopItens = criarGrafico({
    canvas: 'chartTopItens', horizontal: true,
    rotulos: rows.map(r => r.item), valores: rows.map(r => r.valor),
    cor: GFX.cor.valor, tituloSerie: 'Valor comprado',
    formato: fmtValor, formatoTooltip: fmtBRL,
    eixoValor: { maxTicks: 5 }, rotuloCategoria: truncarRotulo,
  });
}

/* ===================== Render orchestrator ===================== */
// Sensíveis ao período: recalculados a cada troca de filtro
function renderAll(){
  renderKPIs();
  renderTopFornecedores();
  renderTopGrupos();
  renderTopSegmentos();
  renderTopItens();
}
renderAll();

// Painel de tendência fixo (independe do filtro de período): renderizado uma única vez
renderCmvHistorico();

} catch(err) {
  console.error('Erro ao montar o dashboard:', err);
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="background:#C0442C;color:#fff;padding:14px 24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;">' +
    '<strong>Erro ao carregar o dashboard:</strong> ' + (err && err.message ? err.message : err) +
    '. Tente recarregar a página; se persistir, verifique se o arquivo foi aberto/baixado corretamente.' +
    '</div>');
}

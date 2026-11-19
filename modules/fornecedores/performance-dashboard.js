/* ===================================================================
   Aba "Performance de Compras" (OTIF) dentro de Analise de Fornecedores.
   Isolado em IIFE de proposito: evita qualquer colisao de nomes de
   funcao/variavel com dashboard.js (o script principal do modulo), que
   roda no mesmo documento HTML.
=================================================================== */
(function(){
try {
/* ===================== Setup ===================== */
const DATA = PERFORMANCE_DATA;

const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:0}).format(v);
const fmtNum = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(v));
const fmtPct1 = (v) => (v===null||v===undefined) ? '—' : v.toFixed(1).replace('.', ',') + '%';

const monthLabels = DATA.month_labels;

// Estilo dos gráficos (fontes, cores, grade, eixos, rótulos, tooltip, legenda, formatação): shared/portal-charts.js

function otifClass(v){
  if(v>=95) return 'good';
  if(v>=85) return 'warn';
  return 'bad';
}
function otifBadge(v){
  return `<span class="otif-badge ${otifClass(v)}">${fmtPct1(v)}</span>`;
}

/* ===================== Header meta ===================== */
function fullPeriodLabel(){
  const meses = DATA.months_order;
  if(!meses.length) return 'Todos os meses';
  const ini = monthLabels[meses[0]] || meses[0];
  const fim = monthLabels[meses[meses.length-1]] || meses[meses.length-1];
  return ini === fim ? ini : `${ini}–${fim}`;
}
document.getElementById('perfGenInfo').textContent = `Dados de OTIF gerados em ${DATA.gerado_em} · Pedidos (${fullPeriodLabel()}): ${fmtNum(DATA.periods['ALL'].kpis.pedidos)}`;

/* ===================== Period state ===================== */
// Sem filtro proprio: reaproveita o filtro de periodo global do modulo
// (mesmos meses em DASHBOARD_DATA e PERFORMANCE_DATA). dashboard.js
// dispara 'fornecedores:period-change' a cada clique num chip do filtro
// global; DATA.periods[period] cai de volta em 'ALL' se a chave nao existir.
let currentPeriod = ['ALL'];
window.addEventListener('fornecedores:period-change', (e) => {
  currentPeriod = e.detail.period; // array de chaves — ver dashboard.js
  renderAllPeriodDependent();
});

function periodLabel(){
  const multi = formatMultiPeriodLabel(currentPeriod, monthLabels);
  if(multi) return multi;
  if(currentPeriod.length === 1 && currentPeriod[0] !== 'ALL') return monthLabels[currentPeriod[0]] || currentPeriod[0];
  return fullPeriodLabel();
}

/* Reconstrói, no cliente, um objeto de período (mesmo formato de
   DATA.periods[mes]) a partir de vários meses selecionados ao mesmo tempo —
   usa forn_full/by_comprador_full (listas completas, sem corte de volume
   mínimo nem top-15) para poder refazer os rankings corretamente depois de
   somar os meses escolhidos, em vez de tentar combinar diretamente os
   top-15 já cortados de cada mês (que podem trazer fornecedores diferentes
   a cada mês). */
function aggregatePerformancePeriod(keys){
  const MIN_PEDIDOS = 5;
  const kSum = sumPeriodFields(DATA.periods, keys, ['pedidos','entregas_prazo','entregas_fora_prazo','entregas_completas','entregas_incompletas','ocorrencias'], 'kpis');
  const pct = (num, den) => den ? Math.round(num/den*10000)/100 : null;
  const kpis = Object.assign({}, kSum, {
    ontime_pct: pct(kSum.entregas_prazo, kSum.pedidos),
    infull_pct: pct(kSum.entregas_completas, kSum.pedidos),
    otif_pct: pct(kSum.pedidos - kSum.ocorrencias, kSum.pedidos),
    conformidade_pct: pct(kSum.pedidos - kSum.ocorrencias, kSum.pedidos),
    // sem os campos *_mom: variação mês a mês não se aplica a uma seleção de vários meses
  });

  const fornMerged = mergePeriodRows(DATA.periods, keys, 'forn_full', 'fornecedor', ['pedidos','ontime_ok','infull_ok','otif_ok','valor'])
    .filter(r => r.pedidos >= MIN_PEDIDOS)
    .map(r => Object.assign({}, r, {
      ontime_pct: pct(r.ontime_ok, r.pedidos),
      infull_pct: pct(r.infull_ok, r.pedidos),
      otif_pct: pct(r.otif_ok, r.pedidos),
      atrasos: r.pedidos - r.ontime_ok,
      incompletos: r.pedidos - r.infull_ok,
    }));

  const ranking_melhores = fornMerged.slice().sort((a,b) => (b.otif_pct-a.otif_pct) || (b.pedidos-a.pedidos)).slice(0,15);
  const ranking_piores = fornMerged.slice().sort((a,b) => (a.otif_pct-b.otif_pct) || (b.pedidos-a.pedidos)).slice(0,15);
  const ranking_atrasos = fornMerged.slice().sort((a,b) => (b.atrasos-a.atrasos) || (b.pedidos-a.pedidos)).slice(0,15);
  const ranking_incompletos = fornMerged.slice().sort((a,b) => (b.incompletos-a.incompletos) || (b.pedidos-a.pedidos)).slice(0,15);

  const by_comprador = mergePeriodRows(DATA.periods, keys, 'by_comprador_full', 'comprador', ['pedidos','otif_ok'])
    .filter(r => r.pedidos >= MIN_PEDIDOS)
    .map(r => Object.assign({}, r, {otif_pct: pct(r.otif_ok, r.pedidos)}))
    .sort((a,b) => b.pedidos - a.pedidos)
    .slice(0, 15);

  return { kpis, ranking_melhores, ranking_piores, ranking_atrasos, ranking_incompletos, by_comprador };
}

function periodData(){
  if(currentPeriod.length === 1) return DATA.periods[currentPeriod[0]] || DATA.periods['ALL'];
  return aggregatePerformancePeriod(currentPeriod);
}

/* ===================== Visão Geral ===================== */
function trendBadge(momValue, invertGoodDirection){
  if(momValue === null || momValue === undefined) return '<div class="no-data">sem comparativo</div>';
  const up = momValue > 0;
  let colorCls;
  if(Math.abs(momValue) < 0.05){ colorCls = 'flat'; }
  else if(invertGoodDirection){ colorCls = up ? 'down' : 'up'; }
  else { colorCls = up ? 'up' : 'down'; }
  const arrow = up ? '&uarr;' : (momValue < 0 ? '&darr;' : '&rarr;');
  return `<div class="trend ${colorCls}">${arrow} ${Math.abs(momValue).toFixed(1).replace('.', ',')}${'pp' === '' ? '' : ''}</div>`;
}

function renderKPIs(){
  const k = periodData().kpis;
  const pct = (v, mom) => trendBadge(mom, false);

  document.getElementById('perfKpiGrid').innerHTML = [
    {label:'OTIF Geral', value: fmtPct1(k.otif_pct), mom: k.otif_pct_mom, cls:'accent-a'},
    {label:'Entregas no Prazo', value: fmtPct1(k.ontime_pct), mom: k.ontime_pct_mom, cls:''},
    {label:'Entregas Completas', value: fmtPct1(k.infull_pct), mom: k.infull_pct_mom, cls:''},
    {label:'Quantidade de Pedidos', value: fmtNum(k.pedidos), mom: k.pedidos_mom, cls:''},
  ].map(c => `
    <div class="kpi-card ${c.cls}">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
      ${trendBadge(c.mom, false)}
    </div>
  `).join('');

  document.getElementById('perfKpiGrid2').innerHTML = [
    {label:'Entregas Fora do Prazo', value: fmtNum(k.entregas_fora_prazo), mom: null},
    {label:'Entregas Incompletas', value: fmtNum(k.entregas_incompletas), mom: null},
    {label:'Total de Ocorrências', value: fmtNum(k.ocorrencias), mom: k.ocorrencias_mom},
  ].map(c => `
    <div class="kpi-card accent-c">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
      ${c.mom!==null && c.mom!==undefined ? trendBadge(c.mom, c.label==='Total de Ocorrências') : `<div class="sub">${periodLabel()}</div>`}
    </div>
  `).join('');
}

/* ===================== Evolução Temporal (fixo, sempre serie completa) ===================== */
let perfChartEvolucaoOtif;

function renderEvolucaoOtif(){
  if(perfChartEvolucaoOtif) perfChartEvolucaoOtif.destroy();
  const serie = DATA.monthly_trend;
  const verde = '#4C9F70';
  perfChartEvolucaoOtif = new Chart(document.getElementById('perfChartEvolucaoOtif'), {
    data:{
      labels: serie.map(r => monthLabels[r.MES]),
      datasets:[
        // OTIF (azul, com o valor em cada mês), ON TIME (âmbar) e IN FULL (verde) tracejadas, média móvel e meta
        estiloLinha(GFX.cor.valor, {type:'line', label:'OTIF', data: serie.map(r=>r.otif_pct), rotulos: fmtPercentual, order:1}),
        estiloLinha(GFX.cor.indicador, {type:'line', label:'ON TIME', data: serie.map(r=>r.ontime_pct), borderDash:[6,4], pointRadius:3, order:2}),
        estiloLinha(verde, {type:'line', label:'IN FULL', data: serie.map(r=>r.infull_pct), borderDash:[6,4], pointRadius:3, order:2}),
        estiloLinha(GFX.cor.extra, {type:'line', label:'Média móvel (3m)', data: serie.map(r=>r.otif_media_movel), borderWidth:2, pointRadius:0, order:1}),
        estiloLinha('#9AA0A6', {type:'line', label:'Meta', data: serie.map(r=>r.meta), borderWidth:1.5, borderDash:[2,3], pointRadius:0, order:3}),
      ]
    },
    plugins:[pluginRotulos],
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      layout:{ padding:{top:8, right:16, bottom:4} },
      plugins:{
        legend: legendaPadrao(),
        tooltip: tooltipPadrao({title:(it)=>it[0].label, label:(ctx)=> ctx.parsed.y === null ? null : ' ' + ctx.dataset.label + ': ' + fmtPercentual(ctx.parsed.y)})
      },
      scales:{
        y: escalaValor({min:90, max:100, formato:(v)=>fmtPercentual(v), maxTicks:6}),
        x: escalaCategoria()
      }
    }
  });
}

/* ===================== Performance de Fornecedores (sensivel ao periodo) ===================== */
let perfChartAtrasos, perfChartIncompletos;

function renderRankingTables(){
  const p = periodData();
  const rowHtml = (r) => `<tr><td>${r.fornecedor}</td><td class="num">${fmtNum(r.pedidos)}</td><td class="num">${otifBadge(r.otif_pct)}</td></tr>`;
  document.querySelector('#perfTableMelhores tbody').innerHTML = p.ranking_melhores.map(rowHtml).join('') ||
    '<tr><td colspan="3" style="text-align:center;color:var(--text-faint);padding:16px;">Sem fornecedores com volume mínimo no período.</td></tr>';
  document.querySelector('#perfTablePiores tbody').innerHTML = p.ranking_piores.map(rowHtml).join('') ||
    '<tr><td colspan="3" style="text-align:center;color:var(--text-faint);padding:16px;">Sem fornecedores com volume mínimo no período.</td></tr>';

  document.querySelector('#perfTableComprador tbody').innerHTML = p.by_comprador.map(r =>
    `<tr><td>${r.comprador}</td><td class="num">${fmtNum(r.pedidos)}</td><td class="num">${otifBadge(r.otif_pct)}</td></tr>`
  ).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-faint);padding:16px;">Sem compradores com volume mínimo no período.</td></tr>';
}

function renderAtrasosIncompletos(){
  const p = periodData();
  if(perfChartAtrasos) perfChartAtrasos.destroy();
  const at = p.ranking_atrasos.filter(r=>r.atrasos>0).slice(0,12);
  perfChartAtrasos = criarGrafico({
    canvas: 'perfChartAtrasos', horizontal: true,
    rotulos: at.map(r => r.fornecedor), valores: at.map(r => r.atrasos),
    cor: GFX.cor.indicador, tituloSerie: 'Pedidos atrasados',
    formato: fmtInteiro, formatoTooltip: (v) => fmtNum(v) + ' pedidos atrasados',
    eixoValor: {maxTicks: 5, inteiro: true}, rotuloCategoria: truncarRotulo,
  });

  if(perfChartIncompletos) perfChartIncompletos.destroy();
  const inc = p.ranking_incompletos.filter(r=>r.incompletos>0).slice(0,12);
  perfChartIncompletos = criarGrafico({
    canvas: 'perfChartIncompletos', horizontal: true,
    rotulos: inc.map(r => r.fornecedor), valores: inc.map(r => r.incompletos),
    cor: GFX.paleta[4], tituloSerie: 'Pedidos incompletos',          // dourado da paleta complementar
    formato: fmtInteiro, formatoTooltip: (v) => fmtNum(v) + ' pedidos incompletos',
    eixoValor: {maxTicks: 5, inteiro: true}, rotuloCategoria: truncarRotulo,
  });
}

/* ===================== Não Conformidades ===================== */
let perfChartPareto;

function renderPareto(){
  if(perfChartPareto) perfChartPareto.destroy();
  const pareto = DATA.pareto_ocorrencias;
  perfChartPareto = new Chart(document.getElementById('perfChartPareto'), {
    data:{
      labels: pareto.map(p=>p.tipo),
      datasets:[
        {type:'bar', label:'Ocorrências', data: pareto.map(p=>p.ocorrencias), backgroundColor: GFX.cor.indicador, borderRadius: GFX.barra.raio, maxBarThickness: 48, yAxisID:'y', order:2, rotulos: fmtInteiro},
        estiloLinha(GFX.cor.valor, {type:'line', label:'% Acumulado', data: pareto.map(p=>p.acum_pct), yAxisID:'y1', order:1, rotulos: fmtPercentual}),
      ]
    },
    plugins:[pluginRotulos],
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      layout:{ padding:{top:8, right:8, bottom:4} },
      plugins:{
        legend: legendaPadrao(),
        tooltip: tooltipPadrao({title:(it)=>it[0].label, label:(ctx)=> ctx.dataset.label==='% Acumulado' ? ' ' + fmtPercentual(ctx.parsed.y) : ' ' + fmtNum(ctx.parsed.y) + ' ocorrências'})
      },
      scales:{
        y: escalaValor({position:'left', titulo:'Ocorrências', inteiro:true, formato:fmtInteiro}),
        y1: escalaValor({position:'right', min:0, max:100, titulo:'% acumulado', semGrade:true, formato:(v)=>fmtPercentual(v)}),
        x: escalaCategoria({rotulo: quebrarRotulo})
      }
    }
  });
}

function renderTendencias(){
  const rowHtml = (r) => `<tr><td>${r.fornecedor}</td><td class="num">${fmtPct1(r.otif_h1)}</td><td class="num">${fmtPct1(r.otif_h2)}</td><td class="num"><span class="var-badge ${r.variacao_pp>=0?'neg':'pos'}">${r.variacao_pp>=0?'+':''}${r.variacao_pp.toFixed(1)}pp</span></td></tr>`;
  document.querySelector('#perfTablePiorando tbody').innerHTML = DATA.tendencia_piorando.map(rowHtml).join('') ||
    '<tr><td colspan="4" style="text-align:center;color:var(--text-faint);padding:16px;">Nenhum fornecedor com volume suficiente para essa análise.</td></tr>';
  document.querySelector('#perfTableMelhorando tbody').innerHTML = DATA.tendencia_melhorando.map(rowHtml).join('') ||
    '<tr><td colspan="4" style="text-align:center;color:var(--text-faint);padding:16px;">Nenhum fornecedor com volume suficiente para essa análise.</td></tr>';
}

/* ===================== Orquestracao ===================== */
function renderAllPeriodDependent(){
  renderKPIs();
  renderRankingTables();
  renderAtrasosIncompletos();
}

/* ===================== Init ===================== */
renderAllPeriodDependent();
renderEvolucaoOtif();
renderPareto();
renderTendencias();

} catch(err) {
  console.error('Erro ao montar a aba de Performance:', err);
  (document.getElementById('view-performance') || document.body).insertAdjacentHTML('afterbegin',
    '<div style="background:#C0442C;color:#fff;padding:14px 24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;border-radius:8px;margin-bottom:16px;">' +
    '<strong>Erro ao carregar a aba de Performance:</strong> ' + (err && err.message ? err.message : err) +
    '</div>');
}
})();

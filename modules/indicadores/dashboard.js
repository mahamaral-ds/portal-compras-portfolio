try {
/* ===================== Setup ===================== */
const DATA = INDICADORES_DATA;

const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:0}).format(v);
const fmtBRL2 = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:2}).format(v);
const fmtNum = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(v));
const fmtPct1 = (v) => (v===null || v===undefined) ? '—' : v.toFixed(1).replace('.', ',') + '%';
const fmtPct2 = (v) => (v===null || v===undefined) ? '—' : v.toFixed(2).replace('.', ',') + '%';

const monthLabels = DATA.month_labels;

// Estilo dos gráficos (fontes, cores, grade, eixos, rótulos de dados, tooltip, legenda): shared/portal-charts.js

/* ===================== Tabs (paginas do modulo) ===================== */
const tabButtons = document.querySelectorAll('#tabNav button');
function setActiveView(viewKey){
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === viewKey));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewKey).classList.add('active');
  document.getElementById('periodBar').style.display = (viewKey === 'visao') ? 'flex' : 'none';
  window.dispatchEvent(new Event('resize'));
}
tabButtons.forEach(btn => btn.addEventListener('click', () => setActiveView(btn.dataset.view)));

/* ===================== Header meta ===================== */
document.getElementById('genDate').textContent = DATA.gerado_em;
document.getElementById('genTotal').textContent = 'Total (' + fullPeriodLabel() + '): ' + fmtBRL(DATA.kpis_gerais.total_geral);

/* ===================== Period chips ===================== */
let currentPeriod = ['ALL'];
initPeriodFilter({
  containerId: 'periodChips',
  months: DATA.months_order,
  monthLabels: monthLabels,
  onChange: (selected) => {
    currentPeriod = selected;
    renderVisaoGeral();
  },
});

function fullPeriodLabel(){
  const months = DATA.months_order;
  if(!months.length) return 'Todos os meses';
  const first = monthLabels[months[0]] || months[0];
  const last = monthLabels[months[months.length-1]] || months[months.length-1];
  return first === last ? first : (first + '–' + last);
}
function periodLabelText(keys){
  return formatMultiPeriodLabel(keys, monthLabels) ||
    ((keys.length === 1 && keys[0] === 'ALL') ? fullPeriodLabel() : (monthLabels[keys[0]] || keys[0]));
}

/* ===================== Helpers de dado por periodo (Visao Geral) ===================== */
function execRowFor(keys){
  const isAll = keys.length === 1 && keys[0] === 'ALL';
  if(isAll){
    // soma/derivacao simples para o periodo completo
    const rows = DATA.monthly_exec;
    const valor_total = rows.reduce((a,r)=>a+r.valor_total,0);
    // pedidos = contagem global de NF distintas (kpis_gerais), nao soma dos
    // meses: uma NF cujos itens foram lancados em datas de meses diferentes
    // contaria 2x na soma mensal, mas e' o mesmo pedido.
    const pedidos = DATA.kpis_gerais.total_pedidos;
    return {
      valor_total, pedidos,
      itens_unicos: DATA.kpis_gerais.total_itens,
      fornecedores: DATA.kpis_gerais.total_fornecedores,
      ticket_medio: valor_total/pedidos,
      valor_total_mom:null, pedidos_mom:null, itens_unicos_mom:null, fornecedores_mom:null, ticket_medio_mom:null
    };
  }
  if(keys.length === 1){
    return DATA.monthly_exec.find(r => r.MES === keys[0]);
  }
  // varios meses selecionados: valor_total e' aditivo, mas pedidos/itens
  // unicos/fornecedores precisam da UNIAO das identidades brutas de cada
  // mes (pedido_ids/itens_idx/fornecedores_lista) — um pedido, item ou
  // fornecedor presente em mais de um mes selecionado nao pode ser
  // contado 2x, como aconteceria somando as contagens de cada mes.
  const rows = keys.map(k => DATA.monthly_exec.find(r => r.MES === k)).filter(Boolean);
  const valor_total = rows.reduce((a,r) => a + r.valor_total, 0);
  const pedidoSet = new Set(), itensSet = new Set(), fornSet = new Set();
  rows.forEach(r => {
    (r.pedido_ids || []).forEach(id => pedidoSet.add(id));
    (r.itens_idx || []).forEach(idx => itensSet.add(idx));
    (r.fornecedores_lista || []).forEach(f => fornSet.add(f));
  });
  const pedidos = pedidoSet.size;
  return {
    valor_total, pedidos,
    itens_unicos: itensSet.size,
    fornecedores: fornSet.size,
    ticket_medio: pedidos ? valor_total/pedidos : 0,
    valor_total_mom:null, pedidos_mom:null, itens_unicos_mom:null, fornecedores_mom:null, ticket_medio_mom:null
  };
}
function externalRowFor(keys){
  const isAll = keys.length === 1 && keys[0] === 'ALL';
  if(isAll){
    const rows = DATA.external_kpis;
    if(!rows.length) return null;
    return rows[rows.length-1]; // mais recente disponivel
  }
  if(keys.length === 1){
    return DATA.external_kpis.find(r => r.MES === keys[0]) || null;
  }
  // CMV/Inflacao/PMP/DIO nao sao aditivos entre meses: usa o mes mais
  // recente dentre os selecionados que tiver KPI externo disponivel
  const sortedKeys = keys.slice().sort();
  for(let i = sortedKeys.length - 1; i >= 0; i--){
    const row = DATA.external_kpis.find(r => r.MES === sortedKeys[i]);
    if(row) return row;
  }
  return null;
}

function trendBadge(momValue, invert){
  if(momValue === null || momValue === undefined) return '<div class="no-data">sem comparativo</div>';
  const up = momValue > 0;
  const cls = Math.abs(momValue) < 0.05 ? 'flat' : ((up && !invert) || (!up && invert) ? (invert ? (up?'down':'up') : (up?'up':'down')) : (up?'up':'down'));
  // logica simplificada: para a maioria das metricas "up" e bom (verde); quando invert=true (ex: inflacao), "up" e ruim (vermelho)
  let colorCls;
  if(Math.abs(momValue) < 0.05){ colorCls='flat'; }
  else if(invert){ colorCls = up ? 'down' : 'up'; }
  else { colorCls = up ? 'up' : 'down'; }
  const arrow = up ? '&uarr;' : (momValue < 0 ? '&darr;' : '&rarr;');
  return `<div class="trend ${colorCls}">${arrow} ${Math.abs(momValue).toFixed(1).replace('.', ',')}%</div>`;
}

/* ===================== Visao Geral ===================== */
let chartGastoMensal, chartCmvInflacao;

function renderVisaoGeral(){
  const exec = execRowFor(currentPeriod);
  const ext = externalRowFor(currentPeriod);
  const periodLabel = periodLabelText(currentPeriod);

  document.getElementById('kpiGrid').innerHTML = [
    {label:'Valor Total Comprado', value:fmtBRL(exec.valor_total), mom:exec.valor_total_mom},
    {label:'Quantidade de Pedidos', value:fmtNum(exec.pedidos), mom:exec.pedidos_mom},
    {label:'Quantidade de Itens (SKUs)', value:fmtNum(exec.itens_unicos), mom:exec.itens_unicos_mom},
    {label:'Ticket Médio', value:fmtBRL2(exec.ticket_medio), mom:exec.ticket_medio_mom},
  ].map(k => `
    <div class="kpi-card">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
      ${trendBadge(k.mom, false)}
    </div>
  `).join('');

  const extItems = ext ? [
    {label:'CMV', value: ext.cmv!==null ? fmtPct1(ext.cmv) : '—'},
    {label:'Inflação de Compras', value: ext.inflacao!==null ? fmtPct2(ext.inflacao) : '—'},
    {label:'PMP (dias)', value: ext.pmp!==null ? fmtNum(ext.pmp) : '—'},
    {label:'DIO (dias)', value: ext.dio!==null ? fmtNum(ext.dio) : '—'},
  ] : [
    {label:'CMV', value:'—'}, {label:'Inflação de Compras', value:'—'},
    {label:'PMP (dias)', value:'—'}, {label:'DIO (dias)', value:'—'},
  ];
  document.getElementById('kpiGridExterno').innerHTML = extItems.map(k => `
    <div class="kpi-card accent-b">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
      <div class="sub">${ext ? monthLabels[ext.MES] : 'Sem dado no período'}</div>
    </div>
  `).join('');

  document.getElementById('brandSub').textContent =
    `KPIs executivos, CMV × inflação e PMP × DIO · ${periodLabel}`;

  const fullRangeLabel = DATA.months_order.length > 1
    ? `${monthLabels[DATA.months_order[0]]}–${monthLabels[DATA.months_order[DATA.months_order.length - 1]]}`
    : monthLabels[DATA.months_order[0]];
  document.getElementById('gastoMensalSub').textContent = `Valor total comprado por mês, ${fullRangeLabel}`;
  document.getElementById('footerPeriodo').textContent = fullRangeLabel;

  // ---- Gasto mensal (sempre serie completa) ----
  if(chartGastoMensal) chartGastoMensal.destroy();
  chartGastoMensal = new Chart(document.getElementById('chartGastoMensal'), {
    type:'line',
    data:{
      labels: DATA.monthly_exec.map(r => monthLabels[r.MES]),
      datasets:[ estiloLinha(GFX.cor.valor, {label:'Gasto total', data: DATA.monthly_exec.map(r => r.valor_total), rotulos: fmtValor}) ]
    },
    plugins:[pluginRotulos],
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      layout:{ padding:{top:28, right:18, bottom:4} },
      plugins:{legend:{display:false}, tooltip:tooltipPadrao({title:(it)=>it[0].label, label:(ctx)=>' '+fmtBRL(ctx.parsed.y)})},
      scales:{
        y: escalaValor({min:0, max:20000000, passo:5000000, formato:fmtValor}),
        x: escalaCategoria()
      }
    }
  });

  // ---- CMV 2025 x 2026 x Inflacao (combo) ----
  if(chartCmvInflacao) chartCmvInflacao.destroy();
  const cmvComp = DATA.cmv_comparativo; // 12 meses (Jan..Dez), cmv_2025/cmv_2026/melhora_pct
  const inflacaoByMM = {};
  DATA.external_kpis.forEach(r => { inflacaoByMM[r.MES.slice(5,7)] = r.inflacao; });

  chartCmvInflacao = new Chart(document.getElementById('chartCmvInflacao'), {
    data:{
      labels: cmvComp.map(r => r.mes_label),
      datasets:[
        // 2025 (mais claro, só no tooltip) à ESQUERDA e 2026 (sólido, com o valor na barra) à direita — no Chart.js a posição
        // da barra no grupo segue o `order` (menor = mais à esquerda); a linha de inflação (order 1) é desenhada por cima
        {
          type:'bar', label:'CMV 2025', data: cmvComp.map(r => r.cmv_2025),
          backgroundColor: corAlfa(GFX.cor.indicador, 0.35), borderRadius:GFX.barra.raio, yAxisID:'y', order:2, maxBarThickness:34
        },
        {
          type:'bar', label:'CMV 2026', data: cmvComp.map(r => r.cmv_2026),
          backgroundColor: GFX.cor.indicador, borderRadius:GFX.barra.raio, yAxisID:'y', order:3, maxBarThickness:34, rotulos: fmtPercentual
        },
        estiloLinha(GFX.cor.extra, {
          type:'line', label:'Inflação', data: cmvComp.map(r => (r.mm in inflacaoByMM) ? inflacaoByMM[r.mm] : null),
          yAxisID:'y1', order:1, spanGaps:false, rotulos: fmtPercentual2, rotuloCor:'#4A4540'   // rótulos da inflação em preto fosco (grafite do tema)
        })
      ]
    },
    // os pontos da inflação ficam sobre as barras de CMV 2026 (x da barra de 2026), e não no centro do grupo de barras
    plugins:[{
      id:'inflacaoSobreBarras2026',
      // reaplicado a cada desenho, porque a animação do Chart.js reposiciona os pontos a cada quadro
      beforeDatasetsDraw(chart){
        const barras = chart.getDatasetMeta(1), linha = chart.getDatasetMeta(2);
        linha.data.forEach((pt, i) => { if(barras.data[i]) pt.x = barras.data[i].x; });
      }
    }, pluginRotulos],
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      layout:{ padding:{top:8, right:8, bottom:4} },
      plugins:{
        legend: legendaPadrao(),
        tooltip: tooltipPadrao({
          title:(it)=>it[0].label,
          label:(ctx)=>{
            if(ctx.parsed.y === null) return null;
            if(ctx.dataset.label === 'Inflação') return ' Inflação: ' + fmtPercentual2(ctx.parsed.y);
            let extra = '';
            if(ctx.dataset.label === 'CMV 2026'){
              const m = cmvComp[ctx.dataIndex];
              if(m.melhora_pct !== null) extra = ' (' + (m.melhora_pct>=0?'−':'+') + Math.abs(m.melhora_pct).toFixed(1).replace('.', ',') + '% vs 2025)';
            }
            return ' ' + ctx.dataset.label + ': ' + fmtPercentual(ctx.parsed.y) + extra;
          }
        })
      },
      scales:{
        // Min 20 padronizado com os demais gráficos "CMV x Inflação"; máx 37 (em vez de 35)
        // porque a série de referência CMV 2025 tem um mês (Jan/25) em 36,1% — 35 cortaria essa barra.
        y:  escalaValor({position:'left', min:20, max:37, titulo:'CMV %', formato:(v)=>fmtPercentual(v), maxTicks:5}),
        // a inflação está negativa (deflação): a faixa mínima de -2% a +2% leva a linha para a metade de baixo do gráfico,
        // longe dos rótulos do topo das barras de CMV
        y1: escalaValor({position:'right', titulo:'Inflação %', semGrade:true, sugeridoMin:-2, sugeridoMax:2, formato:(v)=>fmtPercentual(v), maxTicks:5}),
        x:  escalaCategoria()
      }
    }
  });

  const melhoraValues = cmvComp.map(r=>r.melhora_pct).filter(v => v !== null && v !== undefined);
  if(melhoraValues.length){
    const media = melhoraValues.reduce((a,b)=>a+b,0)/melhoraValues.length;
    document.getElementById('cmvMelhoraTag').innerHTML =
      `<span class="sw" style="background:${media>=0?'var(--accent)':'var(--red)'};width:8px;height:8px;border-radius:50%;"></span>`+
      `CMV ${media>=0?'melhorou (caiu)':'piorou (subiu)'} em média <b>${Math.abs(media).toFixed(1)}%</b> em 2026 vs. mesmo mês de 2025 (meses com os dois anos disponíveis)`;
  }

  // ---- PMP x DIO ----
  renderPmpDio();
}

const fmtDiasNum = (v) => (v===null||v===undefined) ? '—' : v.toFixed(1).replace('.', ',');
const fmtDiaLabel = (v) => (v===null||v===undefined) ? '—' : (Math.abs(v)===1 ? 'dia' : 'dias');
const fmtDelta = (v) => (v===null||v===undefined) ? '—' : (v>0?'+':(v<0?'−':'')) + fmtDiasNum(Math.abs(v)) + ' ' + fmtDiaLabel(v);

/* Texto de destaques (canto inferior do card): descreve a tendencia do PMP
   e do estoque no periodo (subiu/caiu/estavel, de-para) e, se as duas
   series se cruzarem em algum mes, aponta o primeiro cruzamento. */
function pmpDioDestaquesTexto(pd, firstIdx, lastIdx){
  const pmpFirst = pd[firstIdx].pmp, pmpLast = pd[lastIdx].pmp;
  const dioFirst = pd[firstIdx].dio, dioLast = pd[lastIdx].dio;

  function trendFrase(label, first, last){
    if(first===null||first===undefined||last===null||last===undefined) return null;
    const delta = last - first;
    if(Math.abs(delta) < 1){
      return `${label} ficou estável (${fmtDiasNum(first)} → ${fmtDiasNum(last)})`;
    }
    return `${label} ${delta>0?'subiu':'caiu'} de ${fmtDiasNum(first)} para ${fmtDiasNum(last)} dias no período`;
  }

  const partes = [trendFrase('PMP', pmpFirst, pmpLast), trendFrase('o estoque', dioFirst, dioLast)]
    .filter(Boolean);
  let texto = partes.length===2 ? `${partes[0]}, enquanto ${partes[1]}` : (partes[0] || '');

  // Primeiro cruzamento entre as duas series dentro do periodo exibido
  let prevSign = null, cruzamento = null;
  for(let i=firstIdx; i<=lastIdx; i++){
    const p = pd[i].pmp, d = pd[i].dio;
    if(p===null||p===undefined||d===null||d===undefined) continue;
    const sign = p > d ? 1 : (p < d ? -1 : 0);
    if(prevSign !== null && sign !== 0 && sign !== prevSign){
      cruzamento = {mes: monthLabels[pd[i].MES], direcao: sign};
      break;
    }
    if(sign !== 0) prevSign = sign;
  }
  if(cruzamento){
    texto += cruzamento.direcao === 1
      ? ` · Em ${cruzamento.mes}, o PMP chegou a superar o estoque.`
      : ` · Em ${cruzamento.mes}, o estoque voltou a superar o PMP.`;
  } else {
    texto += '.';
  }
  return texto;
}

let chartPmpDio;
function renderPmpDio(){
  if(chartPmpDio) chartPmpDio.destroy();
  const pd = DATA.pmp_dio_series;

  // Grafico e "Destaques": sempre a serie completa, independente do filtro
  // de periodo da pagina (ver section-sub do card).
  let firstIdxFull = 0, lastIdxFull = pd.length - 1;
  for(let i=0;i<pd.length;i++){ if(pd[i].pmp!=null && pd[i].dio!=null){ firstIdxFull=i; break; } }
  for(let i=pd.length-1;i>=0;i--){ if(pd[i].pmp!=null && pd[i].dio!=null){ lastIdxFull=i; break; } }

  // Painel lateral: reage ao filtro de periodo — mostra o ultimo mes
  // selecionado (ou o unico, se so um estiver marcado) e compara contra o
  // primeiro mes da selecao. Com "Todos os meses" (selecao = serie inteira)
  // o resultado e' identico ao comportamento anterior (ultimo vs. primeiro
  // mes da serie completa).
  const idxByMes = {};
  pd.forEach((r,i) => { idxByMes[r.MES] = i; });
  const selMeses = (currentPeriod.length===1 && currentPeriod[0]==='ALL')
    ? DATA.months_order
    : currentPeriod.slice().sort();
  const selIdxs = selMeses.map(m => idxByMes[m]).filter(i => i!==undefined);
  const sideLastIdx = selIdxs.length ? selIdxs[selIdxs.length-1] : lastIdxFull;
  const sideFirstIdx = selIdxs.length ? selIdxs[0] : firstIdxFull;
  const semComparativo = selIdxs.length <= 1 && !(currentPeriod.length===1 && currentPeriod[0]==='ALL');

  const pmpLast = pd[sideLastIdx].pmp, dioLast = pd[sideLastIdx].dio;
  const pmpFirst = pd[sideFirstIdx].pmp, dioFirst = pd[sideFirstIdx].dio;
  const gapLast = (pmpLast!=null && dioLast!=null) ? dioLast - pmpLast : null;
  const gapFirst = (pmpFirst!=null && dioFirst!=null) ? dioFirst - pmpFirst : null;
  const mesFirstLabel = monthLabels[pd[sideFirstIdx].MES];

  document.getElementById('pmpDioSideMonth').textContent = (monthLabels[pd[sideLastIdx].MES] || '').toUpperCase();
  document.getElementById('pmpDioValPmp').textContent = fmtDiasNum(pmpLast) + ' ' + fmtDiaLabel(pmpLast);
  document.getElementById('pmpDioDeltaPmp').textContent = (!semComparativo && pmpFirst!=null && pmpLast!=null)
    ? `${fmtDelta(pmpLast - pmpFirst)} vs. ${mesFirstLabel}` : 'sem comparativo';
  document.getElementById('pmpDioValDio').textContent = fmtDiasNum(dioLast) + ' ' + fmtDiaLabel(dioLast);
  document.getElementById('pmpDioDeltaDio').textContent = (!semComparativo && dioFirst!=null && dioLast!=null)
    ? `${fmtDelta(dioLast - dioFirst)} vs. ${mesFirstLabel}` : 'sem comparativo';
  document.getElementById('pmpDioValGap').textContent = gapLast!=null ? fmtDiasNum(Math.abs(gapLast)) + ' dia' : '—';
  document.getElementById('pmpDioDeltaGap').textContent = (!semComparativo && gapFirst!=null)
    ? `era ${fmtDiasNum(Math.abs(gapFirst))} em ${mesFirstLabel}` : '';

  document.getElementById('pmpDioDestaques').textContent =
    'Destaques: ' + pmpDioDestaquesTexto(pd, firstIdxFull, lastIdxFull);

  const diasTxt = (v) => fmtDiasNum(v) + ' ' + fmtDiaLabel(v);
  chartPmpDio = new Chart(document.getElementById('chartPmpDio'), {
    type:'line',
    data:{
      labels: pd.map(r => monthLabels[r.MES]),
      datasets:[
        // a faixa cinza entre as duas séries e o valor em cada ponto (a série que está por cima leva o rótulo acima)
        estiloLinha(GFX.cor.valor, {label:'PMP', data: pd.map(r=>r.pmp), rotulos: fmtDecimal1, fill:{target:1, above:GFX.cor.faixa, below:GFX.cor.faixa}}),
        estiloLinha(GFX.cor.indicador, {label:'Estoque Dias', data: pd.map(r=>r.dio), rotulos: fmtDecimal1}),
      ]
    },
    plugins:[pluginRotulos],
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      layout:{ padding:{top:8, bottom:6, right:12} },
      plugins:{
        legend: legendaPadrao(),
        tooltip: tooltipPadrao({title:(it)=>it[0].label, label:(ctx)=> ctx.parsed.y === null ? null : ' ' + ctx.dataset.label + ': ' + diasTxt(ctx.parsed.y)})
      },
      scales:{
        y: escalaValor({min:20, max:30, titulo:'dias', formato:(v)=>v, maxTicks:6}),
        x: escalaCategoria()
      }
    }
  });
}

/* ===================== Init ===================== */
renderVisaoGeral();

} catch(err) {
  console.error('Erro ao montar o modulo de Indicadores:', err);
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="background:#C0442C;color:#fff;padding:14px 24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;">' +
    '<strong>Erro ao carregar o módulo:</strong> ' + (err && err.message ? err.message : err) +
    '</div>');
}

try {
/* ===================== Setup ===================== */
const DATA = DASHBOARD_DATA;

const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:0}).format(v);
const fmtNum = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(v));
const fmtNumOrDash = (v) => v==null ? '—' : fmtNum(v);
const fmtPct = (v) => (v*100).toFixed(1).replace('.', ',') + '%';
const fmtPct1 = (v) => v.toFixed(1).replace('.', ',') + '%';

// Estilo dos gráficos (fontes, cores, grade, eixos, rótulos de dados, tooltip, legenda, formatação): shared/portal-charts.js
const CLASS_COLORS = {A: GFX.cor.valor, B: GFX.cor.indicador, C: '#9AA0A6'};   // classe ABC: azul, âmbar, cinza (as mesmas cores dos selos A/B/C)

// categoria (grupo): cor fixa pelo nome — a ordem vem do período completo, então não muda com o filtro
const corCategoria = (() => {
  const ordem = (DATA.periods['ALL'].grupo_data || []).slice().sort((a, b) => b['Valor Total'] - a['Valor Total']).map(g => g.Grupo);
  return (nome) => { const i = ordem.indexOf(nome); return GFX.paleta[(i < 0 ? ordem.length : i) % GFX.paleta.length]; };
})();

/* ===================== Period state ===================== */
let currentPeriod = ['ALL'];
const monthsOrder = DATA.months_order;
const monthLabels = DATA.month_labels;

function periodData(){
  if(currentPeriod.length === 1) return DATA.periods[currentPeriod[0]] || DATA.periods['ALL'];
  return aggregateFornecedoresPeriod(currentPeriod);
}

/* ===================== Agregação para seleção de múltiplos meses =====================
   Reconstrói, no cliente, um objeto de período no mesmo formato de
   DATA.periods[mes] a partir de vários meses selecionados ao mesmo tempo.
   Usa os componentes brutos por fornecedor que build_data.py passou a
   expor especificamente para isso — grupos_valor/grupos_pedidos (valor e
   pedidos por GRUPO), segmentos_valor (valor por SEGMENTO) e itens_idx
   (itens distintos comprados, como índices em DATA.dict_itens_ranking) —
   ao lado de Valor Total/Pedidos, que já eram aditivos. Com isso dá pra
   refazer corretamente: ranking geral + curva ABC, Análise por Categoria,
   Fornecedor × Vertical e Regionalização — a única exceção documentada é
   "Itens Únicos" por GRUPO (não por fornecedor), que não tem componente
   bruto suficiente para recompor com exatidão entre vários meses; nesse
   caso específico a tabela mostra "—" em vez de arriscar um número errado. */
function classifyAbcJs(cumPct){
  if(cumPct <= 80) return 'A';
  if(cumPct <= 95) return 'B';
  return 'C';
}
const UF_TO_REGIAO_JS = {
  AC:'Norte', AP:'Norte', AM:'Norte', PA:'Norte', RO:'Norte', RR:'Norte', TO:'Norte',
  AL:'Nordeste', BA:'Nordeste', CE:'Nordeste', MA:'Nordeste', PB:'Nordeste',
  PE:'Nordeste', PI:'Nordeste', RN:'Nordeste', SE:'Nordeste',
  DF:'Centro-Oeste', GO:'Centro-Oeste', MT:'Centro-Oeste', MS:'Centro-Oeste',
  ES:'Sudeste', MG:'Sudeste', RJ:'Sudeste', SP:'Sudeste',
  PR:'Sul', RS:'Sul', SC:'Sul',
};

/* Ordena por Valor Total desc e preenche Rank/Part.%/Acum.%/Classe — mesma
   lógica de classify_abc()/rank_df em build_data.py, reaproveitada tanto
   para o ranking geral quanto para cada bloco de UF na Regionalização. */
function buildRankingAbc(fornecedoresValor){
  const arr = fornecedoresValor.slice().sort((a,b) => b['Valor Total'] - a['Valor Total']);
  const totalGeral = arr.reduce((s,r) => s + r['Valor Total'], 0);
  let acum = 0;
  arr.forEach((r, i) => {
    r.Rank = i + 1;
    r['Part. %'] = totalGeral ? r['Valor Total'] / totalGeral : 0;
    acum += r['Part. %'] * 100;
    r['Acum. %'] = Math.round(acum * 1000) / 1000;
    r.Classe = classifyAbcJs(r['Acum. %']);
  });
  return {arr, totalGeral};
}

function aggregateFornecedoresPeriod(keys){
  // ---- 1) Mescla o ranking por fornecedor ----
  const fornMap = new Map();
  keys.forEach(k => {
    const p = DATA.periods[k];
    if(!p) return;
    (p.ranking || []).forEach(r => {
      let acc = fornMap.get(r.Fornecedor);
      if(!acc){
        acc = {
          Fornecedor: r.Fornecedor, valorTotal:0, pedidos:0,
          gruposValor:{}, gruposPedidos:{}, segmentosValor:{},
          itensIdx: new Set(), mesesAtivos: new Set(),
          PMP: r.PMP, Segmentos: r.Segmentos,
        };
        fornMap.set(r.Fornecedor, acc);
      }
      acc.valorTotal += r['Valor Total'];
      acc.pedidos += r.Pedidos;
      acc.mesesAtivos.add(k);
      Object.entries(r.grupos_valor || {}).forEach(([g,v]) => { acc.gruposValor[g] = (acc.gruposValor[g]||0) + v; });
      Object.entries(r.grupos_pedidos || {}).forEach(([g,v]) => { acc.gruposPedidos[g] = (acc.gruposPedidos[g]||0) + v; });
      Object.entries(r.segmentos_valor || {}).forEach(([s,v]) => { acc.segmentosValor[s] = (acc.segmentosValor[s]||0) + v; });
      (r.itens_idx || []).forEach(i => acc.itensIdx.add(i));
      if(acc.PMP == null && r.PMP != null) acc.PMP = r.PMP;
    });
  });

  const fornArr = Array.from(fornMap.values()).map(acc => {
    let grupoPrincipal = null, valorPrinc = 0;
    Object.entries(acc.gruposValor).forEach(([g,v]) => { if(v > valorPrinc){ valorPrinc = v; grupoPrincipal = g; } });
    const nGrupos = Object.keys(acc.gruposValor).length;
    const nMeses = acc.mesesAtivos.size;
    return {
      Fornecedor: acc.Fornecedor,
      'Valor Total': Math.round(acc.valorTotal * 100) / 100,
      Pedidos: acc.pedidos,
      'Itens Únicos': acc.itensIdx.size,
      'Ticket Médio': acc.pedidos ? Math.round(acc.valorTotal/acc.pedidos * 100) / 100 : 0,
      'Meses Ativos': nMeses,
      'Média Mensal': nMeses ? Math.round(acc.valorTotal/nMeses * 100) / 100 : 0,
      'Grupos Atend.': nGrupos,
      'Grupo Principal': grupoPrincipal,
      Segmentos: acc.Segmentos,
      PMP: acc.PMP,
      grupos_valor: acc.gruposValor,
      grupos_pedidos: acc.gruposPedidos,
      segmentos_valor: acc.segmentosValor,
      itens_idx: Array.from(acc.itensIdx),
    };
  });

  const {arr: ranking, totalGeral} = buildRankingAbc(fornArr);

  const classeCounts = {A:0,B:0,C:0}, classeValores = {A:0,B:0,C:0};
  ranking.forEach(r => { classeCounts[r.Classe]++; classeValores[r.Classe] += r['Valor Total']; });
  const kpis = {
    total_geral: Math.round(totalGeral * 100) / 100,
    total_fornecedores: ranking.length,
    classe_a_qtd: classeCounts.A, classe_a_valor: Math.round(classeValores.A * 100) / 100,
    classe_b_qtd: classeCounts.B, classe_b_valor: Math.round(classeValores.B * 100) / 100,
    classe_c_qtd: classeCounts.C, classe_c_valor: Math.round(classeValores.C * 100) / 100,
    top_fornecedor: ranking.length ? ranking[0].Fornecedor : null,
  };
  const abc_curve = ranking.map(r => [r.Rank, r['Acum. %'], r.Classe]);
  const abc_class_summary = ['A','B','C'].map(c => ({Classe:c, fornecedores:classeCounts[c], valor: Math.round(classeValores[c]*100)/100}));

  // ---- 2) grupo_data: reagrupa grupos_valor/grupos_pedidos por GRUPO ----
  const grupoMap = new Map();
  ranking.forEach(r => {
    Object.entries(r.grupos_valor).forEach(([g,v]) => {
      let acc = grupoMap.get(g);
      if(!acc){ acc = {Grupo:g, valor:0, pedidos:0, fornecedoresSet:new Set(), principalForn:null, principalValor:0}; grupoMap.set(g, acc); }
      acc.valor += v;
      acc.pedidos += (r.grupos_pedidos[g] || 0);
      acc.fornecedoresSet.add(r.Fornecedor);
      if(v > acc.principalValor){ acc.principalValor = v; acc.principalForn = r.Fornecedor; }
    });
  });
  const totalScopeGrupo = Array.from(grupoMap.values()).reduce((s,g) => s + g.valor, 0);
  const grupoArr = Array.from(grupoMap.values()).sort((a,b) => b.valor - a.valor);
  let cumG = 0;
  const grupo_data = grupoArr.map(g => {
    cumG += totalScopeGrupo ? g.valor/totalScopeGrupo*100 : 0;
    return {
      Grupo: g.Grupo,
      'Valor Total': Math.round(g.valor * 100) / 100,
      'Part. %': totalScopeGrupo ? g.valor/totalScopeGrupo : 0,
      'Acum. %': Math.round(cumG * 100) / 100,
      Fornecedores: g.fornecedoresSet.size,
      'Itens Únicos': null, // ver nota de limitação no topo desta função
      Pedidos: g.pedidos,
      'Principal Forn.': g.principalForn,
      'Valor Princ.': Math.round(g.principalValor * 100) / 100,
    };
  });

  // ---- 3) Fornecedor × Vertical (top 20 por Valor Total já mesclado) ----
  const segColsSet = new Set();
  const segTotalMap = new Map();
  ranking.forEach(r => {
    Object.entries(r.segmentos_valor).forEach(([s,v]) => {
      segColsSet.add(s);
      segTotalMap.set(s, (segTotalMap.get(s)||0) + v);
    });
  });
  const seg_cols = Array.from(segColsSet).sort();
  const segmento_total = Array.from(segTotalMap.entries())
    .map(([SEGMENTO, VALOR_CONTABIL]) => ({SEGMENTO, VALOR_CONTABIL: Math.round(VALOR_CONTABIL*100)/100}))
    .sort((a,b) => b.VALOR_CONTABIL - a.VALOR_CONTABIL);
  const seg_matrix = ranking.slice(0, 20).map(r => {
    const row = {FORNECEDOR: r.Fornecedor};
    let total = 0;
    seg_cols.forEach(s => { const v = r.segmentos_valor[s] || 0; row[s] = Math.round(v*100)/100; total += v; });
    row['TOTAL GERAL'] = Math.round(total*100)/100;
    return row;
  });

  // ---- 4) Regionalização: reagrupa o ranking mesclado por UF (mapa
  // period-independente DATA.forn_uf_map) e roda a mesma curva ABC por UF ----
  function montarBlocoUf(nomeGrupo, fornecedoresGrupo){
    if(!fornecedoresGrupo.length) return null;
    const valores = fornecedoresGrupo.map(f => ({Fornecedor: f.Fornecedor, 'Valor Total': f['Valor Total']}));
    const {arr, totalGeral: tg} = buildRankingAbc(valores);
    const cc = {A:0,B:0,C:0}, cv = {A:0,B:0,C:0};
    arr.forEach(r => { cc[r.Classe]++; cv[r.Classe] += r['Valor Total']; });
    const n = arr.length;
    return {
      uf: nomeGrupo,
      regiao: UF_TO_REGIAO_JS[nomeGrupo] || (nomeGrupo === 'NAO_INFORMADO' ? 'Não informado' : 'Outra'),
      valor_total: Math.round(tg * 100) / 100,
      fornecedores_count: n,
      ranking: arr.map(r => ({Rank:r.Rank, Fornecedor:r.Fornecedor, Valor:Math.round(r['Valor Total']*100)/100, 'Part. %':Math.round(r['Part. %']*10000)/10000, 'Acum. %':r['Acum. %'], Classe:r.Classe})),
      abc_curve: arr.map(r => [r.Rank, r['Acum. %'], r.Classe]),
      abc_class_summary: ['A','B','C'].map(c => ({classe:c, fornecedores:cc[c], valor:Math.round(cv[c]*100)/100})),
      cauda_longa_fornecedores_pct: n ? Math.round(cc.C/n*1000)/10 : 0,
      cauda_longa_valor_pct: tg ? Math.round(cv.C/tg*1000)/10 : 0,
      ticket_medio_fornecedor: n ? Math.round(tg/n*100)/100 : 0,
      top_fornecedor: n ? arr[0].Fornecedor : null,
    };
  }
  const fornPorUf = new Map();
  ranking.forEach(r => {
    const uf = (DATA.forn_uf_map && DATA.forn_uf_map[r.Fornecedor]) || 'NAO_INFORMADO';
    if(!fornPorUf.has(uf)) fornPorUf.set(uf, []);
    fornPorUf.get(uf).push(r);
  });
  const estadosPresentes = Array.from(fornPorUf.keys()).filter(u => u !== 'NAO_INFORMADO').sort();
  const porUf = {};
  estadosPresentes.forEach(uf => { porUf[uf] = montarBlocoUf(uf, fornPorUf.get(uf) || []); });
  const naoInformadoBloco = fornPorUf.has('NAO_INFORMADO') ? montarBlocoUf('NAO_INFORMADO', fornPorUf.get('NAO_INFORMADO')) : null;

  const macroRegioes = {};
  estadosPresentes.forEach(uf => {
    const dados = porUf[uf];
    if(!macroRegioes[dados.regiao]) macroRegioes[dados.regiao] = {valor_total:0, fornecedores_count:0, estados:[]};
    const m = macroRegioes[dados.regiao];
    m.valor_total = Math.round((m.valor_total + dados.valor_total) * 100) / 100;
    m.fornecedores_count += dados.fornecedores_count;
    m.estados.push(uf);
  });
  Object.values(macroRegioes).forEach(m => m.estados.sort());

  const regionalizacao_uf = {
    fonte: 'complemento_fornecedores.xlsx — coluna Estado(UF)',
    estados: estadosPresentes,
    por_uf: porUf,
    macro_regioes: macroRegioes,
    nao_informado: naoInformadoBloco,
    total_fornecedores: ranking.length,
    valor_total_geral: kpis.total_geral,
  };

  return {kpis, abc_curve, abc_class_summary, ranking, grupo_data, seg_matrix, seg_cols, segmento_total, regionalizacao_uf};
}

/* ===================== Tabs ===================== */
const tabButtons = document.querySelectorAll('#tabNav button');

function setActiveView(viewKey){
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === viewKey));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewKey).classList.add('active');
  // Itens por Fornecedor e Ranking tem filtros proprios: a barra de periodo do topo some so' nestas abas
  document.getElementById('periodBar').hidden = (viewKey === 'itens-forn' || viewKey === 'ranking');
  if(viewKey === 'ranking') rkCarregar();   // a base de itens dos filtros so' e' carregada quando esta aba abre
  window.dispatchEvent(new Event('resize'));
}

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => setActiveView(btn.dataset.view));
});

/* ===================== Period chips (seleção múltipla, estilo Power BI) ===================== */
initPeriodFilter({
  containerId: 'periodChips',
  months: monthsOrder,
  monthLabels: monthLabels,
  onChange: (selected) => {
    currentPeriod = selected;
    renderAll();
    // notifica a aba OTIF (script isolado, com sua propria base de dados)
    // do novo periodo, ja que ela reaproveita este mesmo filtro global.
    window.dispatchEvent(new CustomEvent('fornecedores:period-change', {detail:{period: currentPeriod}}));
  },
});

/* ===================== Header meta ===================== */
document.getElementById('genDate').textContent = DATA.gerado_em;

/* ===================== Chart instances (kept for destroy/recreate) ===================== */
let chartClasseDonut, chartMonthlyTotalMini, chartABC, chartGrupo, chartSegmentoTotal;
let chartRegioCount, chartRegioTicket, chartRegioABC;

/* ===================== KPI Grid ===================== */
function renderKPIs(){
  const k = periodData().kpis;
  const items = [
    {label:'Total Geral de Compras', value: fmtBRL(k.total_geral), sub: periodLabel(), cls:''},
    {label:'Total de Fornecedores', value: fmtNum(k.total_fornecedores), sub:'Fornecedores ativos no período', cls:''},
    {label:'Fornecedor #1', value: k.top_fornecedor || '—', sub:'Maior valor de compra no período', cls:''},
    {label:'Classe A', value: fmtNum(k.classe_a_qtd) + ' forn.', sub: fmtBRL(k.classe_a_valor) + ' · ' + fmtPct1(100*k.classe_a_valor/k.total_geral), cls:'accent-a'},
    {label:'Classe B', value: fmtNum(k.classe_b_qtd) + ' forn.', sub: fmtBRL(k.classe_b_valor) + ' · ' + fmtPct1(100*k.classe_b_valor/k.total_geral), cls:'accent-b'},
    {label:'Classe C', value: fmtNum(k.classe_c_qtd) + ' forn.', sub: fmtBRL(k.classe_c_valor) + ' · ' + fmtPct1(100*k.classe_c_valor/k.total_geral), cls:'accent-c'},
  ];
  document.getElementById('kpiGrid').innerHTML = items.map(it => `
    <div class="kpi-card ${it.cls}">
      <div class="label">${it.label}</div>
      <div class="value">${it.value}</div>
      <div class="sub">${it.sub}</div>
    </div>
  `).join('');

  document.getElementById('genTotal').textContent = 'Total (' + periodLabel() + '): ' + fmtBRL(k.total_geral);
  document.getElementById('brandSub').textContent = `Base consolidada · ${fullPeriodLabel()} · ` + fmtNum(k.total_fornecedores) + ' fornecedores ativos (' + periodLabel() + ')';
  document.getElementById('abcSectionSub').textContent = 'Participação acumulada no valor total de compras, ordenada por fornecedor (' + fmtNum(k.total_fornecedores) + ' fornecedores — ' + periodLabel() + ')';
  document.getElementById('rankingTitle').textContent = 'Ranking de fornecedores — Base completa (' + fmtNum(DATA.periods['ALL'].kpis.total_fornecedores) + ' fornecedores)';
}

function fullPeriodLabel(){
  if(!monthsOrder.length) return 'Todos os meses';
  const ini = monthLabels[monthsOrder[0]] || monthsOrder[0];
  const fim = monthLabels[monthsOrder[monthsOrder.length-1]] || monthsOrder[monthsOrder.length-1];
  return ini === fim ? ini : `${ini}–${fim}`;
}
function periodLabel(){
  const multi = formatMultiPeriodLabel(currentPeriod, monthLabels);
  if(multi) return multi;
  if(currentPeriod.length === 1 && currentPeriod[0] !== 'ALL') return monthLabels[currentPeriod[0]] || currentPeriod[0];
  return fullPeriodLabel();
}

/* ===================== Hero stat ===================== */
function renderHero(){
  const curve = periodData().abc_curve;
  const total = curve.length;
  let crossRank = curve.find(r => r[1] >= 80);
  crossRank = crossRank ? crossRank[0] : total;
  const pctForn = total ? (100*crossRank/total) : 0;
  document.getElementById('heroBig').innerHTML = pctForn.toFixed(0) + '<span>% dos fornecedores</span>';
  document.getElementById('heroDesc').innerHTML =
    `<b>${crossRank} de ${total} fornecedores</b> (top ranking por valor, ${periodLabel()}) já respondem por <b>80% de todo o valor comprado</b> no período selecionado.
     Concentrar esforço de negociação e acompanhamento nesse grupo tem o maior retorno possível sobre o CMV.`;
}

/* ===================== Donut: Classe distribution ===================== */
function renderDonut(){
  if(chartClasseDonut) chartClasseDonut.destroy();
  const summary = periodData().abc_class_summary;
  chartClasseDonut = criarRosca({
    canvas: 'chartClasseDonut',
    rotulos: summary.map(d => 'Classe ' + d.Classe + ' (' + d.fornecedores + ')'),
    valores: summary.map(d => d.valor), cores: summary.map(d => CLASS_COLORS[d.Classe]),
    formatoTooltip: fmtBRL,
  });
}

/* ===================== Mini monthly total line (always full range, highlights selection) ===================== */
function renderMiniMonthly(){
  if(chartMonthlyTotalMini) chartMonthlyTotalMini.destroy();
  const monthly = DATA.monthly_total;
  const isAll = currentPeriod.length === 1 && currentPeriod[0] === 'ALL';
  const pointColors = monthly.map(d => (isAll || currentPeriod.includes(d.MES)) ? GFX.cor.valor : corAlfa(GFX.cor.valor, 0.3));
  const pointRadii = monthly.map(d => (!isAll && currentPeriod.includes(d.MES)) ? 7 : GFX.linha.ponto);
  chartMonthlyTotalMini = new Chart(document.getElementById('chartMonthlyTotalMini'), {
    type:'line',
    data:{
      labels: monthly.map(d => monthLabels[d.MES] || d.MES),
      datasets:[ estiloLinha(GFX.cor.valor, {label:'Total mensal', data: monthly.map(d => d.VALOR_CONTABIL), rotulos: fmtValor,
        pointRadius: pointRadii, pointBackgroundColor: pointColors}) ]
    },
    plugins:[pluginRotulos],
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      layout:{ padding:{top:28, right:18, bottom:4} },
      plugins:{ legend:{display:false}, tooltip:tooltipPadrao({title:(it)=>it[0].label, label:(ctx)=>' ' + fmtBRL(ctx.parsed.y)}) },
      scales:{
        y: escalaValor({min:0, max:20000000, passo:5000000, formato:fmtValor}),
        x: escalaCategoria()
      }
    }
  });
}

/* ===================== Top 10 table ===================== */
function renderTop5(){
  const top5 = periodData().ranking.slice(0,10);
  const tbody = document.querySelector('#top5Table tbody');
  tbody.innerHTML = top5.map(r => `
    <tr>
      <td>${r.Rank}</td>
      <td>${r.Fornecedor}</td>
      <td class="num">${fmtBRL(r['Valor Total'])}</td>
      <td class="num">${fmtPct(r['Part. %'])}</td>
    </tr>
  `).join('');
}

/* ===================== ABC full chart ===================== */
function renderABCChart(){
  if(chartABC) chartABC.destroy();
  const curve = periodData().abc_curve;
  const labels = curve.map(r => r[0]);
  const cumData = curve.map(r => r[1]);

  const eixoRank = escalaCategoria();
  eixoRank.ticks.autoSkip = true; eixoRank.ticks.maxTicksLimit = 12;      // centenas de fornecedores: só algumas marcas
  eixoRank.title = {display:true, text:'Ranking de fornecedores (1 = maior valor) — ' + periodLabel(), color:GFX.cor.suave, font:{size:GFX.tamanho, weight:400}};
  chartABC = new Chart(document.getElementById('chartABC'), {
    type:'line',
    data:{
      labels,
      datasets:[ estiloLinha(GFX.cor.valor, {label:'% acumulado do valor', data:cumData, pointRadius:0, pointHoverRadius:4, borderWidth:2}) ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      layout:{ padding:{top:8, right:12, bottom:4} },
      plugins:{
        legend:{display:false},
        tooltip: tooltipPadrao({
          title: (items) => 'Rank #' + items[0].label,
          label: (ctx) => {
            const classe = curve[ctx.dataIndex][2];
            return ['Acumulado: ' + fmtPct1(ctx.parsed.y), 'Classe: ' + classe];
          }
        })
      },
      scales:{
        y: escalaValor({min:0, max:100, titulo:'% acumulado do valor', formato:(v)=>fmtPercentual(v), maxTicks:6}),
        x: eixoRank
      }
    }
  });

  const total = periodData().kpis.total_geral;
  const cards = periodData().abc_class_summary.map(d => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F0F1F3;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="pill pill-${d.Classe}">Classe ${d.Classe}</span>
        <span style="font-size:12.5px;color:var(--text-soft);">${d.fornecedores} fornecedores</span>
      </div>
      <div style="text-align:right;">
        <div style="font-family:var(--mono);font-weight:700;">${fmtBRL(d.valor)}</div>
        <div style="font-size:11px;color:var(--text-faint);">${total ? fmtPct1(100*d.valor/total) : '0,0%'} do total</div>
      </div>
    </div>
  `).join('');
  document.getElementById('abcClassCards').innerHTML =
    '<div class="section-title" style="font-size:13px;">Resumo por classe — ' + periodLabel() + '</div>' + cards;
}

/* ===================== Filtros do Ranking (mesmo padrão da Tabela Detalhada, Análise de Itens) =====================
   Data de lançamento, Casa, Grupo, Segmento, Segmento × Região, Fornecedor, Descrição do item e Descrição item
   fornecedor (sem a NF) — as mesmas opções e a mesma lógica (dentro de um filtro vale OU; entre filtros, E).
   Os filtros agem sobre os registros item a item, que vêm de ../analise-itens/data.js (a mesma base tratada da
   Tabela Detalhada). Esse arquivo é grande e só serve a esta aba, então é carregado na primeira vez que ela abre.
   Sem nenhum filtro novo ativo, o ranking é exatamente o pré-calculado (build_data.py). Com filtro ativo, o ranking
   é recalculado no navegador com as mesmas regras do build_data.py (mesmos grupos excluídos, Pedidos = linhas,
   Itens Únicos = itens distintos, Grupo Principal = grupo de maior valor) sobre os registros que passam nos filtros
   (a barra de período do topo não é usada nesta aba: o recorte de datas é o filtro Data de lançamento);
   Part.%, Acum.% e Classe ABC são refeitos dentro do conjunto filtrado e o PMP segue sendo o do fornecedor
   (não depende dos registros). */
const RK_FONTE = '../analise-itens/data.js';
const RK_COL = { CASA:1, SEG:2, GRUPO:3, FORN:5, ITEM:6, DIA:7, VALOR:9, DESC_FORN:14 };
let rkEstado = 'idle';       // idle | carregando | pronto | erro
let rkBase = null;           // ANALISE_ITENS_DATA, depois de carregado
let rkFiltros = null;        // {data, casa, grupo, segmento, segReg}
let rkGrupoIdx = [];         // opção do filtro Grupo -> índice em rkBase.dict_grupos (sem os grupos excluídos do ranking)
let rkLinhas = null;         // ranking recalculado; null = nenhum filtro novo ativo
let rkPmp = null;            // fornecedor -> PMP (do ranking geral pré-calculado)
let rkBaseDate = null;
const rkEl = (id) => document.getElementById(id);

function rkMensagem(txt, erro){
  const el = rkEl('rkStatus');
  el.textContent = txt;
  el.classList.toggle('rk-erro', !!erro);
}

function rkCarregar(){
  if(rkEstado !== 'idle') return;
  rkEstado = 'carregando';
  rkMensagem('Carregando a base de itens para os filtros…');
  const s = document.createElement('script');
  s.src = RK_FONTE;
  s.onload = () => {
    try{ rkMontar(); }
    catch(e){ console.error('Filtros do Ranking:', e); rkEstado = 'erro'; rkMensagem('Não foi possível montar os filtros do ranking.', true); }
  };
  s.onerror = () => {
    rkEstado = 'erro';
    rkMensagem('Filtros indisponíveis: não foi possível carregar a base de itens (analise-itens/data.js). O ranking continua sem eles.', true);
  };
  document.head.appendChild(s);
}

function rkMontar(){
  if(typeof ANALISE_ITENS_DATA === 'undefined') throw new Error('ANALISE_ITENS_DATA indefinido');
  rkBase = ANALISE_ITENS_DATA;
  rkBaseDate = new Date(rkBase.base_date + 'T00:00:00');
  const excluidos = new Set(DATA.excluded_grupos || []);
  rkGrupoIdx = [];
  rkBase.dict_grupos.forEach((g, i) => { if(!excluidos.has(g)) rkGrupoIdx.push(i); });

  const dia = (off) => { const d = new Date(rkBaseDate); d.setDate(d.getDate() + off); return d; };
  let maxDia = 0;
  for(let i = 0; i < rkBase.rows.length; i++){ if(rkBase.rows[i][RK_COL.DIA] > maxDia) maxDia = rkBase.rows[i][RK_COL.DIA]; }
  const onChange = () => { renderRanking(); };
  rkFiltros = {
    data: createDateRangeFilter({containerId:'rkData', granularity:'day', minOff:0, maxOff:maxDia,
      toDate:dia,
      toOffset:(y, m, d) => Math.round((Date.UTC(y, m, d) - Date.UTC(rkBaseDate.getFullYear(), rkBaseDate.getMonth(), rkBaseDate.getDate())) / 86400000),
      format:(off) => dia(off).toLocaleDateString('pt-BR'), onChange}),
    casa: createDropdownFilter({containerId:'rkCasa', labels:rkBase.dict_casas, ariaLabel:'Loja', onChange}),
    grupo: createDropdownFilter({containerId:'rkGrupo', labels:rkGrupoIdx.map(i => rkBase.dict_grupos[i]), ariaLabel:'Grupo', onChange}),
    segmento: createDropdownFilter({containerId:'rkSegmento', labels:rkBase.dict_segmentos, ariaLabel:'Segmento', onChange}),
    segReg: createDropdownFilter({containerId:'rkSegReg', labels:rkBase.dict_segmento_regiao || [], ariaLabel:'Segmento × Região', onChange}),
  };
  if(!(rkBase.dict_segmento_regiao && rkBase.dict_segmento_regiao.length)) rkEl('rkSegRegField').hidden = true;

  let t;
  ['rkForn', 'rkItem', 'rkDescForn'].forEach(id => {
    const el = rkEl(id);
    el.disabled = false;
    el.addEventListener('input', () => { clearTimeout(t); t = setTimeout(onChange, 250); });
  });
  rkEl('rkLimpar').disabled = false;
  rkEl('rkLimpar').addEventListener('click', () => {
    Object.values(rkFiltros).forEach(f => f.clear(true));
    ['rkForn', 'rkItem', 'rkDescForn'].forEach(id => { rkEl(id).value = ''; });
    rankPmpFaixa = null; pmpAtualizarTag();   // a faixa de PMP escolhida no grafico tambem sai
    onChange();
  });
  rkEstado = 'pronto';
  const aviso = (rkBase.gerado_em !== DATA.gerado_em) ? ' · atenção: a base de itens foi gerada em ' + rkBase.gerado_em + ', diferente deste painel (' + DATA.gerado_em + ')' : '';
  rkMensagem('Sem filtros adicionais — mostrando o ranking completo' + aviso + '.', !!aviso);
  renderRanking();
}

// recalcula rkLinhas conforme os filtros e o período do topo (null quando nenhum filtro novo está ativo)
function rkRecalcular(){
  rkLinhas = null;
  if(rkEstado !== 'pronto') return;
  const f = rkFiltros;
  const casaSet = f.casa.getSet(), segSet = f.segmento.getSet(), dataRange = f.data.getRange();
  const grupoOpc = f.grupo.getSet();
  const grupoSet = grupoOpc ? new Set([...grupoOpc].map(o => rkGrupoIdx[o])) : null;
  const segRegSet = f.segReg.getSet();
  const casaOkSegReg = segRegSet ? rkBase.casa_segmento_regiao.map(o => segRegSet.has(o)) : null;
  const termo = (id) => rkEl(id).value.trim().toLowerCase();
  const fornT = termo('rkForn'), itemT = termo('rkItem'), descT = termo('rkDescForn');
  const casar = (dict, t) => { if(!t) return null; const s = new Set(); dict.forEach((v, i) => { if(v.toLowerCase().includes(t)) s.add(i); }); return s; };
  const fornSet = casar(rkBase.dict_fornecedores, fornT), itemSet = casar(rkBase.dict_itens, itemT), descSet = casar(rkBase.dict_desc_item_fornecedor, descT);
  const ativo = !!(casaSet || segSet || dataRange || grupoSet || casaOkSegReg || fornSet || itemSet || descSet);
  const msgBase = 'Sem filtros adicionais — mostrando o ranking completo.';
  if(!ativo){ if(rkEl('rkStatus').dataset.ativo === '1'){ rkEl('rkStatus').dataset.ativo = ''; rkMensagem(msgBase); } return; }

  const excluidos = new Set(DATA.excluded_grupos || []);
  const grupoExcl = rkBase.dict_grupos.map(g => excluidos.has(g));

  const por = new Map();
  const rows = rkBase.rows;
  for(let i = 0; i < rows.length; i++){
    const r = rows[i];
    if(grupoExcl[r[RK_COL.GRUPO]]) continue;
    if(dataRange && (r[RK_COL.DIA] < dataRange.start || r[RK_COL.DIA] > dataRange.end)) continue;
    if(casaSet && !casaSet.has(r[RK_COL.CASA])) continue;
    if(grupoSet && !grupoSet.has(r[RK_COL.GRUPO])) continue;
    if(segSet && !segSet.has(r[RK_COL.SEG])) continue;
    if(casaOkSegReg && !casaOkSegReg[r[RK_COL.CASA]]) continue;
    if(fornSet && !fornSet.has(r[RK_COL.FORN])) continue;
    if(itemSet && !itemSet.has(r[RK_COL.ITEM])) continue;
    if(descSet && !descSet.has(r[RK_COL.DESC_FORN])) continue;
    let a = por.get(r[RK_COL.FORN]);
    if(!a){ a = {valor:0, pedidos:0, itens:new Set(), grupos:new Map()}; por.set(r[RK_COL.FORN], a); }
    const v = r[RK_COL.VALOR];
    a.valor += v; a.pedidos++; a.itens.add(r[RK_COL.ITEM]);
    a.grupos.set(r[RK_COL.GRUPO], (a.grupos.get(r[RK_COL.GRUPO]) || 0) + v);
  }

  if(!rkPmp){
    rkPmp = new Map();
    (DATA.periods['ALL'].ranking || []).forEach(x => rkPmp.set(x.Fornecedor, x.PMP));
  }
  const arr = [];
  por.forEach((a, forn) => {
    let gp = null, gv = -Infinity;
    a.grupos.forEach((v, g) => { if(v > gv){ gv = v; gp = g; } });
    const nome = rkBase.dict_fornecedores[forn];
    arr.push({
      'Fornecedor': nome,
      'Valor Total': Math.round(a.valor * 100) / 100,
      'Grupo Principal': rkBase.dict_grupos[gp],
      'Pedidos': a.pedidos,
      'Itens Únicos': a.itens.size,
      'Ticket Médio': a.pedidos ? a.valor / a.pedidos : 0,
      'Grupos Atend.': a.grupos.size,
      'PMP': rkPmp.has(nome) ? rkPmp.get(nome) : null,
    });
  });
  rkLinhas = buildRankingAbc(arr).arr;
  const total = rkLinhas.reduce((s, r) => s + r['Valor Total'], 0);
  rkEl('rkStatus').dataset.ativo = '1';
  rkMensagem('Filtros ativos — ' + fmtNum(rkLinhas.length) + (rkLinhas.length === 1 ? ' fornecedor · ' : ' fornecedores · ') + fmtBRL(total) + ' em compras (Classe ABC refeita dentro deste conjunto).');
}

/* ===================== Ranking table (sortable + filter + search, full base) ===================== */
const rankingCols = [
  {key:'Rank', label:'#', num:true},
  {key:'Fornecedor', label:'Fornecedor'},
  {key:'Classe', label:'Classe'},
  {key:'Grupo Principal', label:'Categoria Principal'},
  {key:'Valor Total', label:'Valor Total', num:true, fmt:fmtBRL},
  {key:'Part. %', label:'Part.%', num:true, fmt:fmtPct},
  {key:'Pedidos', label:'Pedidos', num:true, fmt:fmtNum},
  {key:'Itens Únicos', label:'Itens Únicos', num:true, fmt:fmtNum},
  {key:'Ticket Médio', label:'Ticket Médio', num:true, fmt:fmtBRL},
  {key:'Grupos Atend.', label:'Categorias Atend.', num:true, fmt:fmtNum},
  {key:'PMP', label:'PMP (dias)', num:true, fmt:fmtNumOrDash},
];
let rankSortKey = 'Rank', rankSortDir = 1;
let rankClasseFilter = 'ALL';
let rankPmpFaixa = null;   // {ini, fim} em dias, escolhida clicando numa barra do grafico de PMP (so' filtra a tabela)

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

// ranking sem filtro novo: o geral (todos os meses) — esta aba nao usa a barra de periodo do topo
function rkRankingGeral(){ return DATA.periods['ALL'].ranking; }

function rankFilteredRows(comFaixa = true){
  return (rkLinhas || rkRankingGeral()).filter(r => {
    if(comFaixa && rankPmpFaixa && (r.PMP == null || r.PMP < rankPmpFaixa.ini || r.PMP > rankPmpFaixa.fim)) return false;
    if(rankClasseFilter !== 'ALL' && r.Classe !== rankClasseFilter) return false;
    return true;
  });
}

function renderRankingBody(){
  const tbody = document.querySelector('#rankingTable tbody');
  let rows = rankFilteredRows();
  rows = rows.slice().sort((a,b) => {
    const va = a[rankSortKey], vb = b[rankSortKey];
    if(va==null && vb==null) return 0;
    if(va==null) return 1;   // sem dado (ex: PMP) sempre no fim, nas duas direcoes
    if(vb==null) return -1;
    if(typeof va === 'number') return (va - vb) * rankSortDir;
    return String(va).localeCompare(String(vb)) * rankSortDir;
  });
  document.getElementById('rankResultCount').textContent = fmtNum(rows.length) + ' de ' + fmtNum(rkRankingGeral().length) + ' fornecedores';
  tbody.innerHTML = rows.map(r => `
    <tr>
      ${rankingCols.map(c => {
        let val = r[c.key];
        if(c.key === 'Classe'){ return `<td><span class="pill pill-${val}">${val}</span></td>`; }
        if(c.key === 'Fornecedor'){ return `<td class="rank-forn-cell" title="${String(val).replace(/"/g,'&quot;')}">${val}</td>`; }
        if(c.fmt) val = c.fmt(val);
        return `<td class="${c.num?'num':''}">${val}</td>`;
      }).join('')}
    </tr>
  `).join('') || '<tr><td colspan="'+rankingCols.length+'" style="text-align:center;color:var(--text-faint);padding:20px;">Nenhum fornecedor encontrado.</td></tr>';
}

document.getElementById('rankFilters').querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('rankFilters').querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    rankClasseFilter = chip.dataset.classe;
    renderRankingBody();
    renderPmpDistribution();
  });
});

function renderRanking(){
  rkRecalcular();
  renderRankingHead();
  renderRankingBody();
  renderPmpDistribution();
}

/* ===================== Distribuição do PMP ===================== */
function median(sortedVals){
  const n = sortedVals.length;
  if(!n) return null;
  const mid = Math.floor(n/2);
  return n % 2 ? sortedVals[mid] : (sortedVals[mid-1] + sortedVals[mid]) / 2;
}

function pmpAtualizarTag(){
  const tag = document.getElementById('pmpFaixaTag');
  tag.hidden = !rankPmpFaixa;
  if(rankPmpFaixa) tag.textContent = 'PMP de ' + rankPmpFaixa.ini + ' a ' + rankPmpFaixa.fim + ' dias  ×';
}
function pmpEscolherFaixa(ini, fim){
  const mesma = rankPmpFaixa && rankPmpFaixa.ini === ini;
  rankPmpFaixa = mesma ? null : {ini, fim};
  pmpAtualizarTag();
  renderRankingBody();
  renderPmpDistribution();   // destaca a barra escolhida
  if(!mesma){                // leva direto para a lista (descontando o cabecalho fixo)
    const alvo = document.getElementById('rankingTitle');
    const topo = alvo.getBoundingClientRect().top + window.scrollY - document.querySelector('header').getBoundingClientRect().height - 12;
    window.scrollTo({top: Math.max(0, topo), behavior: 'smooth'});
  }
}
document.getElementById('pmpFaixaTag').addEventListener('click', () => { rankPmpFaixa = null; pmpAtualizarTag(); renderRankingBody(); renderPmpDistribution(); });

let chartPmpDist;
function renderPmpDistribution(){
  const rows = rankFilteredRows(false);   // o grafico mostra todas as faixas; a faixa clicada so' filtra a tabela
  const vals = rows.map(r => r.PMP).filter(v => v!=null).sort((a,b) => a-b);
  const semDado = rows.length - vals.length;

  const sub = document.getElementById('pmpDistSub');
  if(!vals.length){
    sub.textContent = 'Nenhum fornecedor com PMP registrado no filtro atual.';
  } else {
    sub.textContent = `${fmtNum(vals.length)} de ${fmtNum(rows.length)} fornecedores com PMP registrado (${fmtNum(semDado)} sem dado) · mediana ${fmtNum(median(vals))} dias · faixas de 7 dias · respeita os filtros de classe e busca abaixo`;
  }

  if(chartPmpDist) chartPmpDist.destroy();
  if(!vals.length) return;

  const width = 7;
  const nBuckets = Math.floor(vals[vals.length-1] / width) + 1;
  const counts = new Array(nBuckets).fill(0);
  vals.forEach(v => { counts[Math.floor(v / width)]++; });
  const labels = counts.map((_, i) => `${i*width}–${i*width+width-1}`);

  chartPmpDist = criarGrafico({
    canvas: 'chartPmpDist', rotulos: labels, valores: counts,
    cores: counts.map((_, i) => (!rankPmpFaixa || rankPmpFaixa.ini === i*width) ? GFX.cor.valor : corAlfa(GFX.cor.valor, 0.3)),
    tituloSerie: 'Fornecedores', formato: fmtInteiro,
    formatoTooltip: (v) => fmtNum(v) + (v === 1 ? ' fornecedor' : ' fornecedores'),
    eixoValor: {titulo: 'Fornecedores', maxTicks: 6, inteiro: true}, tituloCategoria: 'PMP (dias)',
    tooltip: { title: (items) => items[0].label + ' dias', afterLabel: () => 'Clique para ver a lista' },
    opcoes: {
      // clique numa barra: a tabela abaixo passa a listar so' os fornecedores dessa faixa de PMP (clicar de novo na mesma barra remove)
      // (o gráfico é recriado ao escolher a faixa: adia para depois do tratamento do clique, para o Chart.js não notificar um gráfico já destruído)
      onClick: (_e, els) => { if(els.length){ const i = els[0].index; setTimeout(() => pmpEscolherFaixa(i * width, i * width + width - 1), 0); } },
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
    },
  });
}

/* ===================== Grupo chart + table ===================== */
function renderGrupo(){
  if(chartGrupo) chartGrupo.destroy();
  const grupos = periodData().grupo_data.slice().sort((a,b) => b['Valor Total'] - a['Valor Total']);
  chartGrupo = criarGrafico({
    canvas: 'chartGrupo', horizontal: true,
    rotulos: grupos.map(g => g.Grupo), valores: grupos.map(g => g['Valor Total']),
    cores: grupos.map(g => corCategoria(g.Grupo)), tituloSerie: 'Valor comprado',
    formato: fmtValor, formatoTooltip: fmtBRL,
    eixoValor: {maxTicks: 4}, rotuloCategoria: truncarRotulo,
  });

  const tbody = document.querySelector('#grupoTable tbody');
  tbody.innerHTML = grupos.map(g => `
    <tr>
      <td>${g.Grupo}</td>
      <td class="num">${fmtBRL(g['Valor Total'])}</td>
      <td class="num">${fmtPct(g['Part. %'])}</td>
      <td>${g['Principal Forn.']}</td>
    </tr>
  `).join('');
}

/* ===================== Fornecedor x Segmento heatmap ===================== */
function renderHeatmap(){
  const cols = periodData().seg_cols;
  const rows = periodData().seg_matrix.slice().sort((a,b) => b['TOTAL GERAL'] - a['TOTAL GERAL']);
  const maxVal = rows.length ? Math.max(...rows.flatMap(r => cols.map(c => r[c] || 0)), 1) : 1;

  function cellColor(v){
    if(!v) return '#FAFBFC';
    const t = Math.sqrt(v / maxVal);
    const r1=243,g1=244,b1=247, r2=14,g2=110,b2=110;
    const r = Math.round(r1 + (r2-r1)*t);
    const g = Math.round(g1 + (g2-g1)*t);
    const b = Math.round(b1 + (b2-b1)*t);
    return `rgb(${r},${g},${b})`;
  }
  function textColor(v){
    const t = Math.sqrt(v / maxVal);
    return t > 0.55 ? '#fff' : 'var(--text)';
  }

  let html = '<thead><tr><th style="position:sticky;left:0;background:#fff;">Fornecedor</th>';
  cols.forEach(c => html += `<th class="num">${c}</th>`);
  html += '<th class="num">Total</th></tr></thead><tbody>';
  rows.forEach(r => {
    html += `<tr><td class="fname">${r.FORNECEDOR}</td>`;
    cols.forEach(c => {
      const v = r[c] || 0;
      const bg = cellColor(v);
      const tc = textColor(v);
      html += `<td style="background:${bg};color:${tc};">${v ? fmtBRL(v) : '—'}</td>`;
    });
    html += `<td class="num" style="font-weight:700;">${fmtBRL(r['TOTAL GERAL'])}</td></tr>`;
  });
  html += '</tbody>';
  document.getElementById('heatmapTable').innerHTML = html;
}

/* ===================== Segmento total chart ===================== */
function renderSegmentoTotal(){
  if(chartSegmentoTotal) chartSegmentoTotal.destroy();
  const segTotal = periodData().segmento_total;
  chartSegmentoTotal = criarGrafico({
    canvas: 'chartSegmentoTotal',
    rotulos: segTotal.map(s => s.SEGMENTO), valores: segTotal.map(s => s.VALOR_CONTABIL),
    cor: GFX.cor.valor, tituloSerie: 'Valor comprado',
    formato: fmtValor, formatoTooltip: fmtBRL,
    eixoValor: {maxTicks: 5}, rotuloCategoria: quebrarRotulo,
  });
}

/* ===================== Regionalização (Estado/UF real do fornecedor) ===================== */
const MACRO_REGIAO_ORDEM = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
const MACRO_REGIAO_COLORS = {   // azul e âmbar do padrão de gráficos + paleta complementar (cor fixa por macro-região)
  'Sudeste':GFX.cor.valor, 'Nordeste':GFX.cor.indicador, 'Sul':'#7E5BA6',
  'Centro-Oeste':'#E0B13A', 'Norte':'#4C9F70', 'Não informado':'#9AA0A6',
};
let regioFiltro = null; // UF ou 'NAO_INFORMADO' — definido no primeiro render do período
let regioSearchTerm = '';
let regioSortKey = 'Rank', regioSortDir = 1;

function renderRegioNote(){
  const el = document.getElementById('regioCoverageNote');
  const q = DATA.complemento_fornecedores_qualidade;
  el.innerHTML = `Estado (UF) identificado para <b>${fmtNum(q.fornecedores_com_uf)}</b> de ${fmtNum(q.fornecedores_total)} fornecedores do grupo ` +
    `(${fmtPct1(q.valor_com_uf_pct)} do valor comprado). Fonte: <code>complemento_fornecedores.xlsx</code>.`;
}

function renderRegioKPIs(){
  const r = periodData().regionalizacao_uf;
  const grid = document.getElementById('regioKpiGrid');
  if(!r){ grid.innerHTML = '<p class="section-sub">Sem dado de regionalização suficiente neste período.</p>'; return; }
  const naoInformado = r.nao_informado;
  const topEstado = r.estados.slice().sort((a,b) => r.por_uf[b].fornecedores_count - r.por_uf[a].fornecedores_count)[0];
  const items = [
    {label:'Estados mapeados', value: fmtNum(r.estados.length), sub: 'estados distintos entre os fornecedores do período'},
    {label:'Fornecedores com UF', value: fmtNum(r.total_fornecedores - (naoInformado ? naoInformado.fornecedores_count : 0)), sub: 'de ' + fmtNum(r.total_fornecedores) + ' fornecedores no período'},
    {label:'Fornecedores não informados', value: fmtNum(naoInformado ? naoInformado.fornecedores_count : 0), sub: 'sem UF confiável no complemento — não inferidos'},
    {label:'Estado com mais fornecedores', value: topEstado || '—', sub: topEstado ? fmtNum(r.por_uf[topEstado].fornecedores_count) + ' fornecedores' : 'sem dado'},
  ];
  grid.innerHTML = items.map(k => `
    <div class="kpi-card">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
      <div class="sub">${k.sub}</div>
    </div>
  `).join('');
}

function regioGruposParaComparar(r){
  // grupos na ordem oficial de macro-regiao (so as presentes), + Nao informado por ultimo
  const grupos = MACRO_REGIAO_ORDEM
    .filter(m => r.macro_regioes[m])
    .map(m => ({label: m, ...r.macro_regioes[m]}));
  if(r.nao_informado && r.nao_informado.fornecedores_count){
    grupos.push({label:'Não informado', valor_total: r.nao_informado.valor_total, fornecedores_count: r.nao_informado.fornecedores_count, _naoInformado: true});
  }
  return grupos;
}

function renderRegioCompareTable(){
  const r = periodData().regionalizacao_uf;
  const tbody = document.querySelector('#regioCompareTable tbody');
  if(!r){ tbody.innerHTML = ''; return; }
  const grupos = regioGruposParaComparar(r);
  const valorGrupo = grupos.reduce((a,g) => a + g.valor_total, 0);
  tbody.innerHTML = grupos.map(g => {
    const ticket = g.fornecedores_count ? g.valor_total / g.fornecedores_count : 0;
    const classeC = g._naoInformado
      ? (r.nao_informado.abc_class_summary.find(c=>c.classe==='C'))
      : (() => {
          // soma classe C de todos os UFs dessa macro-regiao
          const ufsDaMacro = (g.estados || []);
          let forn = 0, valor = 0;
          ufsDaMacro.forEach(uf => {
            const c = r.por_uf[uf].abc_class_summary.find(x=>x.classe==='C');
            forn += c.fornecedores; valor += c.valor;
          });
          return {fornecedores: forn, valor};
        })();
    return `<tr>
      <td><b>${g.label}</b></td>
      <td class="num">${fmtNum(g.fornecedores_count)}</td>
      <td class="num">${fmtBRL(g.valor_total)}</td>
      <td class="num">${valorGrupo ? fmtPct1(100*g.valor_total/valorGrupo) : '—'}</td>
      <td class="num">${fmtBRL(ticket)}</td>
      <td class="num">${fmtNum(classeC.fornecedores)} forn. · ${g.valor_total ? fmtPct1(100*classeC.valor/g.valor_total) : '—'} do valor</td>
    </tr>`;
  }).join('');
}

function renderRegioCountChart(){
  const r = periodData().regionalizacao_uf;
  if(chartRegioCount) chartRegioCount.destroy();
  if(!r) return;
  const grupos = regioGruposParaComparar(r);
  chartRegioCount = criarGrafico({
    canvas: 'chartRegioCount',
    rotulos: grupos.map(g => g.label), valores: grupos.map(g => g.fornecedores_count),
    cores: grupos.map(g => MACRO_REGIAO_COLORS[g.label] || '#9AA0A6'), tituloSerie: 'Fornecedores',
    formato: fmtInteiro, formatoTooltip: (v) => fmtNum(v) + ' fornecedores',
    eixoValor: {maxTicks: 5, inteiro: true}, rotuloCategoria: quebrarRotulo,
  });
}

function renderRegioTicketChart(){
  const r = periodData().regionalizacao_uf;
  if(chartRegioTicket) chartRegioTicket.destroy();
  if(!r) return;
  const grupos = regioGruposParaComparar(r);
  chartRegioTicket = criarGrafico({
    canvas: 'chartRegioTicket',
    rotulos: grupos.map(g => g.label), valores: grupos.map(g => g.fornecedores_count ? g.valor_total/g.fornecedores_count : 0),
    cores: grupos.map(g => MACRO_REGIAO_COLORS[g.label] || '#9AA0A6'), tituloSerie: 'Ticket médio por fornecedor',
    formato: fmtValor, formatoTooltip: fmtBRL,
    eixoValor: {maxTicks: 5}, rotuloCategoria: quebrarRotulo,
  });
}

function renderRegioABCChart(){
  const r = periodData().regionalizacao_uf;
  if(chartRegioABC) chartRegioABC.destroy();
  if(!r) return;
  // curva ABC por macro-regiao: agrega os pares fornecedor+valor de todos os
  // UFs da macro-regiao e recalcula o acumulado — nao e' so concatenar as
  // curvas independentes de cada UF (que tem escalas de rank proprias).
  const macros = MACRO_REGIAO_ORDEM.filter(m => r.macro_regioes[m]);
  const curvas = macros.map(m => {
    const ufs = r.macro_regioes[m].estados;
    let pares = [];
    ufs.forEach(uf => r.por_uf[uf].ranking.forEach(row => pares.push(row.Valor)));
    pares.sort((a,b) => b-a);
    const total = pares.reduce((a,v)=>a+v, 0);
    let acum = 0;
    const curva = pares.map(v => { acum += v; return total ? 100*acum/total : 0; });
    return {label:m, curva};
  });
  const maxLen = Math.max(...curvas.map(c => c.curva.length), 0);
  const eixoRankR = escalaCategoria();
  eixoRankR.ticks.autoSkip = true; eixoRankR.ticks.maxTicksLimit = 12;
  eixoRankR.title = {display:true, text:'Ranking de fornecedores dentro da macro-região', color:GFX.cor.suave, font:{size:GFX.tamanho, weight:400}};
  chartRegioABC = new Chart(document.getElementById('chartRegioABC'), {
    type:'line',
    data:{
      labels: Array.from({length:maxLen}, (_,i) => i+1),
      datasets: curvas.map(c => estiloLinha(MACRO_REGIAO_COLORS[c.label], {label:c.label, data:c.curva, pointRadius:0, pointHoverRadius:4, borderWidth:2}))
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      layout:{ padding:{top:8, right:12, bottom:4} },
      plugins:{
        legend: legendaPadrao(),
        tooltip: tooltipPadrao({title:(it)=>'Posição ' + it[0].label, label:(ctx)=> ctx.parsed.y === null ? null : ' ' + ctx.dataset.label + ': ' + fmtPercentual(ctx.parsed.y)})
      },
      scales:{
        y: escalaValor({min:0, max:100, titulo:'% acumulado do valor (curva própria de cada macro-região)', formato:(v)=>fmtPercentual(v), maxTicks:6}),
        x: eixoRankR
      }
    }
  });
}

const regioRankingCols = [
  {key:'Rank', label:'#', num:true},
  {key:'Fornecedor', label:'Fornecedor'},
  {key:'Classe', label:'Classe'},
  {key:'Valor', label:'Valor no estado', num:true, fmt:fmtBRL},
  {key:'Part. %', label:'Part.%', num:true, fmt:fmtPct},
];

function renderRegioFilters(){
  const r = periodData().regionalizacao_uf;
  const wrap = document.getElementById('regioFilters');
  if(!r || !r.estados.length){ wrap.innerHTML = ''; return; }

  if(!regioFiltro || (regioFiltro !== 'NAO_INFORMADO' && !r.por_uf[regioFiltro])){
    regioFiltro = r.estados.slice().sort((a,b) => r.por_uf[b].fornecedores_count - r.por_uf[a].fornecedores_count)[0];
  }

  const chips = r.estados.map(uf => ({key: uf, label: uf}));
  if(r.nao_informado && r.nao_informado.fornecedores_count){
    chips.push({key:'NAO_INFORMADO', label:'Não informado'});
  }
  wrap.innerHTML = chips.map(c => `<div class="chip${c.key===regioFiltro?' active':''}" data-uf="${c.key}">${c.label}</div>`).join('');
  wrap.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      wrap.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      regioFiltro = chip.dataset.uf;
      renderRegioRankingBody();
    });
  });
}

function regioGrupoAtivo(r){
  if(!r) return null;
  if(regioFiltro === 'NAO_INFORMADO') return r.nao_informado;
  return r.por_uf[regioFiltro];
}

function renderRegioRankingHead(){
  const thead = document.querySelector('#regioRankingTable thead');
  thead.innerHTML = '<tr>' + regioRankingCols.map(c => {
    let cls = c.num ? 'num' : '';
    if(c.key === regioSortKey) cls += (regioSortDir===1 ? ' sorted-asc' : ' sorted-desc');
    return `<th class="${cls}" data-key="${c.key}">${c.label}</th>`;
  }).join('') + '</tr>';
  thead.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if(regioSortKey === key){ regioSortDir *= -1; } else { regioSortKey = key; regioSortDir = 1; }
      renderRegioRankingHead(); renderRegioRankingBody();
    });
  });
}

function renderRegioRankingBody(){
  const tbody = document.querySelector('#regioRankingTable tbody');
  const r = periodData().regionalizacao_uf;
  const p = regioGrupoAtivo(r);
  if(!p){
    tbody.innerHTML = '<tr><td colspan="'+regioRankingCols.length+'" style="text-align:center;color:var(--text-faint);padding:20px;">Sem dado neste estado/período.</td></tr>';
    document.getElementById('regioRankCount').textContent = '';
    return;
  }
  let rows = p.ranking.filter(row => {
    if(regioSearchTerm && !row.Fornecedor.toLowerCase().includes(regioSearchTerm)) return false;
    return true;
  });
  rows = rows.slice().sort((a,b) => {
    const va = a[regioSortKey], vb = b[regioSortKey];
    if(typeof va === 'number') return (va - vb) * regioSortDir;
    return String(va).localeCompare(String(vb)) * regioSortDir;
  });
  const label = regioFiltro === 'NAO_INFORMADO' ? 'Não informado' : regioFiltro;
  document.getElementById('regioRankCount').textContent = fmtNum(rows.length) + ' de ' + fmtNum(p.ranking.length) + ' fornecedores em ' + label;
  tbody.innerHTML = rows.map(row => `
    <tr>
      ${regioRankingCols.map(c => {
        let val = row[c.key];
        if(c.key === 'Classe'){ return `<td><span class="pill pill-${val}">${val}</span></td>`; }
        if(c.fmt) val = c.fmt(val);
        return `<td class="${c.num?'num':''}">${val}</td>`;
      }).join('')}
    </tr>
  `).join('') || '<tr><td colspan="'+regioRankingCols.length+'" style="text-align:center;color:var(--text-faint);padding:20px;">Nenhum fornecedor encontrado.</td></tr>';
}

document.getElementById('regioRankSearch').addEventListener('input', (e) => {
  regioSearchTerm = e.target.value.trim().toLowerCase();
  renderRegioRankingBody();
});

function renderRegioInsights(){
  const r = periodData().regionalizacao_uf;
  const wrap = document.getElementById('regioInsights');
  if(!r || !r.estados.length){
    wrap.innerHTML = '<div class="insight-card info"><span class="dot"></span><p>Dados insuficientes de UF neste período — tente "Todos os meses".</p></div>';
    return;
  }

  const grupos = regioGruposParaComparar(r);
  const porTicket = grupos.map(g => ({...g, ticket: g.fornecedores_count ? g.valor_total/g.fornecedores_count : 0})).sort((a,b)=>a.ticket-b.ticket);
  const porValor = grupos.slice().sort((a,b)=>b.valor_total-a.valor_total);
  const estadoMaisForn = r.estados.slice().sort((a,b) => r.por_uf[b].fornecedores_count - r.por_uf[a].fornecedores_count)[0];
  const estadoTopUf = r.por_uf[estadoMaisForn];

  const naoInformadoPct = r.total_fornecedores ? 100 * (r.nao_informado ? r.nao_informado.fornecedores_count : 0) / r.total_fornecedores : 0;

  const items = [
    {
      tipo:'info',
      texto:`<b>${estadoMaisForn}</b> é o estado com mais fornecedores identificados: ${fmtNum(estadoTopUf.fornecedores_count)} fornecedores, somando ${fmtBRL(estadoTopUf.valor_total)} (${fmtPct1(estadoTopUf.cauda_longa_valor_pct)} em Classe C).`
    },
    {
      tipo:'atencao',
      texto: naoInformadoPct > 0
        ? `${fmtPct1(naoInformadoPct)} dos fornecedores do período (${fmtBRL(r.nao_informado ? r.nao_informado.valor_total : 0)} em valor) não têm UF confiável no complemento de cadastro — não entram em nenhum estado ou macro-região nesta análise.`
        : `Todos os fornecedores do período têm UF identificado no complemento de cadastro.`
    },
    {
      tipo:'oportunidade',
      texto:`<b>${porTicket[0].label}</b> é a macro-região/grupo com maior efeito de pulverização: menor ticket médio por fornecedor (${fmtBRL(porTicket[0].ticket)}), com ${fmtNum(porTicket[0].fornecedores_count)} ${porTicket[0].fornecedores_count===1?'fornecedor':'fornecedores'}.`
    },
    {
      tipo:'info',
      texto:`<b>${porValor[0].label}</b> concentra o maior valor comprado entre os grupos comparados: ${fmtBRL(porValor[0].valor_total)}, com ${fmtNum(porValor[0].fornecedores_count)} fornecedores.`
    },
  ];

  wrap.innerHTML = items.map(i => `
    <div class="insight-card ${i.tipo}">
      <span class="dot"></span>
      <p>${i.texto}</p>
    </div>
  `).join('');
}

function renderRegionalizacao(){
  renderRegioNote();
  renderRegioKPIs();
  renderRegioCompareTable();
  renderRegioCountChart();
  renderRegioTicketChart();
  renderRegioABCChart();
  renderRegioFilters();
  renderRegioRankingHead();
  renderRegioRankingBody();
  renderRegioInsights();
}

/* ===================== Itens por Fornecedor (aba independente — filtro proprio) ===================== */
(function itensFornecedorModule(){
  const IF = DATA.itens_fornecedor;
  if(!IF){ console.warn('itens_fornecedor ausente no data.js — aba fica vazia.'); return; }

  const fmtBRL2 = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:2}).format(v);

  // Colunas dos arrays compactos — espelham pares_cols/pares_mensal_cols do build_data.py
  const PC = {FORN:0, ITEM:1, TEM_PRECO:2, UNIDADE:3, MEDIANA:4, MIN:5, MAX:6, VOLAT:7, TENDENCIA:8, NFORN:9, CASAS:10, MENSAL:11};
  const MC = {MES:0, VALOR:1, QTD:2, PRECO:3, NFS:4, CASAS:5, MELHOR:6, SAVING:7};

  const ifForn = IF.dict_fornecedores;
  const ifItemCod = IF.dict_itens_cod;
  const ifUnid = IF.dict_unidades;
  const ifCasas = IF.dict_casas;
  const ifItemMeta = IF.itens_meta;
  const ifFornResumo = IF.fornecedores_resumo;
  const ifMonths = IF.meses;
  const ifMonthLabels = IF.month_labels;

  const parsByForn = {}, parsByItem = {};
  IF.pares.forEach(p => {
    (parsByForn[p[PC.FORN]] = parsByForn[p[PC.FORN]] || []).push(p);
    (parsByItem[p[PC.ITEM]] = parsByItem[p[PC.ITEM]] || []).push(p);
  });

  let ifMesIniIdx = 0, ifMesFimIdx = ifMonths.length - 1;
  let ifCasaSet = null, ifGrupoSet = null, ifBusca = '';   // Set de indices de casa / Set de nomes de grupo (null = todos)
  let ifCriterioForn = 'valor';
  let ifSelectedFornIdx = null;
  let ifItemCriterio = 'valor';
  let ifTblSearchTerm = '', ifTblSortKey = 'valor', ifTblSortDir = -1, ifTblPage = 1;
  let ifConsolidatedCache = [];
  const IF_TBL_PAGE_SIZE = 50;
  const IF_TBL_MAX_ROWS = 500;

  function ifMonthInRange(mi){ return mi >= ifMesIniIdx && mi <= ifMesFimIdx; }

  /* Soma um par (forn,item) dentro do intervalo de meses selecionado. Preco
     medio do periodo e' recomputado como soma(valor canonico)/soma(qtd), nao
     media das medias mensais — sempre ponderado. Mediana/min/max/volatilidade/
     tendencia NAO entram aqui: sao full-history, vem direto do array pares. */
  function ifAggregatePair(par){
    let valor = 0, valorCanon = 0, qtd = 0, nfs = 0, casasMax = 0, saving = null, hasMonth = false;
    par[PC.MENSAL].forEach(m => {
      if(!ifMonthInRange(m[MC.MES])) return;
      hasMonth = true;
      valor += m[MC.VALOR];
      nfs += m[MC.NFS];
      if(m[MC.CASAS] > casasMax) casasMax = m[MC.CASAS];
      if(par[PC.TEM_PRECO] && m[MC.QTD] != null){
        qtd += m[MC.QTD];
        valorCanon += m[MC.PRECO] * m[MC.QTD];
      }
      if(m[MC.SAVING] != null){ saving = (saving||0) + m[MC.SAVING]; }
    });
    return {
      valor, qtd, nfs, casasMax, hasMonth, saving,
      precoMedioPeriodo: qtd > 0 ? valorCanon/qtd : null,
    };
  }

  function ifPairPassesFilters(par){
    if(ifCasaSet && !par[PC.CASAS].some(c => ifCasaSet.has(c))) return false;
    if(ifGrupoSet && !ifGrupoSet.has(ifItemMeta[par[PC.ITEM]].grupo)) return false;
    if(ifBusca){
      const meta = ifItemMeta[par[PC.ITEM]];
      const hay = (ifForn[par[PC.FORN]] + ' ' + meta.descricao + ' ' + meta.cod_item).toLowerCase();
      if(!hay.includes(ifBusca)) return false;
    }
    return true;
  }

  function ifFornecedoresFiltrados(){
    const aggByForn = {};
    IF.pares.forEach(par => {
      if(!ifPairPassesFilters(par)) return;
      const agg = ifAggregatePair(par);
      if(!agg.hasMonth) return;
      const f = par[PC.FORN];
      if(!aggByForn[f]) aggByForn[f] = {valor:0, nfs:0, casas:new Set(), itens:new Set()};
      aggByForn[f].valor += agg.valor;
      aggByForn[f].nfs += agg.nfs;
      par[PC.CASAS].forEach(c => aggByForn[f].casas.add(c));
      aggByForn[f].itens.add(par[PC.ITEM]);
    });
    let list = Object.keys(aggByForn).map(Number).map(idx => ({
      idx, nome: ifForn[idx], resumo: ifFornResumo[idx],
      valorPeriodo: aggByForn[idx].valor, nfsPeriodo: aggByForn[idx].nfs,
      casasPeriodo: aggByForn[idx].casas.size, itensPeriodo: aggByForn[idx].itens.size,
    }));
    const critKey = {valor:'valorPeriodo', nfs:'nfsPeriodo', casas:'casasPeriodo', itens:'itensPeriodo'}[ifCriterioForn];
    list.sort((a,b) => b[critKey]-a[critKey]);
    return list.slice(0, IF.config.top_n_uniao);
  }

  function ifSparkline(values, opts){
    opts = opts || {};
    const w = opts.width||70, h = opts.height||22, color = opts.color||'#0E6E6E';
    if(!values || values.length < 2 || values.every(v => !v)){
      return `<svg class="if-sparkline" width="${w}" height="${h}"></svg>`;
    }
    const max = Math.max(...values), min = Math.min(...values, 0);
    const range = (max-min) || 1;
    const stepX = w/(values.length-1);
    const pts = values.map((v,i) => [i*stepX, h - ((v-min)/range)*h]);
    const path = pts.map((p,i) => (i===0?'M':'L')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
    return `<svg class="if-sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <path class="area" d="${path} L${w},${h} L0,${h} Z" fill="${color}" opacity="0.12"></path>
      <path class="line" d="${path}" stroke="${color}"></path>
    </svg>`;
  }

  function ifSparklinePrice(par){
    const vals = par[PC.MENSAL].filter(m => ifMonthInRange(m[MC.MES]) && m[MC.PRECO]!=null).map(m => m[MC.PRECO]);
    if(vals.length < 2) return '<span style="color:var(--text-faint);font-size:11px;">—</span>';
    return ifSparkline(vals, {color:'#5B7FBF'});
  }

  /* ---------- KPIs ---------- */
  function ifRenderKPIs(){
    const fornList = ifFornecedoresFiltrados();
    let valorTop = 0;
    fornList.forEach(f => valorTop += f.valorPeriodo);
    const pctGrupo = IF.valor_total_grupo ? 100*valorTop/IF.valor_total_grupo : 0;

    const itensSet = new Set(), itensSingleSourceSet = new Set();
    let savingTotal = 0, hasSavingAny = false, concSum = 0, concCount = 0;

    fornList.forEach(f => {
      const pares = (parsByForn[f.idx]||[]).filter(ifPairPassesFilters);
      const aggs = pares.map(p => ({par:p, agg: ifAggregatePair(p)})).filter(x => x.agg.hasMonth);
      aggs.forEach(({par, agg}) => {
        itensSet.add(par[PC.ITEM]);
        if(agg.saving != null){ savingTotal += agg.saving; hasSavingAny = true; }
        if(par[PC.NFORN] <= 1) itensSingleSourceSet.add(par[PC.ITEM]);
      });
      const valoresOrd = aggs.map(x => x.agg.valor).sort((a,b) => b-a);
      const totalForn = valoresOrd.reduce((a,b) => a+b, 0);
      if(totalForn > 0){
        concSum += 100*valoresOrd.slice(0,10).reduce((a,b) => a+b, 0)/totalForn;
        concCount++;
      }
    });

    const items = [
      {label:'Fornecedores no recorte', value: fmtNum(fornList.length), sub: fmtPct1(pctGrupo)+' do gasto total do grupo'},
      {label:'Itens distintos', value: fmtNum(itensSet.size), sub: 'entre os fornecedores do recorte'},
      {label:'Concentração média do Top 10', value: concCount?fmtPct1(concSum/concCount):'—', sub:'do valor de cada fornecedor, nos 10 maiores itens'},
      {label:'Saving potencial', value: hasSavingAny?fmtBRL(savingTotal):'—', sub:'oportunidade teórica, não meta', cls:'accent-atencao'},
      {label:'Itens single-source', value: fmtNum(itensSingleSourceSet.size), sub:'só 1 fornecedor em toda a base', cls:'accent-alerta'},
    ];
    document.getElementById('ifKpiGrid').innerHTML = items.map(it => `
      <div class="kpi-card ${it.cls||''}">
        <div class="label">${it.label}</div>
        <div class="value">${it.value}</div>
        <div class="sub">${it.sub}</div>
      </div>`).join('');
  }

  /* ---------- Lista mestre ---------- */
  function ifRenderFornList(){
    const fornList = ifFornecedoresFiltrados();
    const wrap = document.getElementById('ifFornList');
    if(!fornList.length){
      wrap.innerHTML = '<p class="section-sub" style="padding:12px;">Nenhum fornecedor no filtro atual.</p>';
      ifSelectedFornIdx = null;
      document.getElementById('ifDetailHeader').innerHTML = '';
      document.getElementById('ifCoverageNote').innerHTML = '';
      document.querySelector('#ifItemsTable thead').innerHTML = '';
      document.querySelector('#ifItemsTable tbody').innerHTML = '<tr><td style="padding:16px;color:var(--text-faint);">Sem fornecedor selecionado.</td></tr>';
      return;
    }
    if(ifSelectedFornIdx === null || !fornList.some(f => f.idx === ifSelectedFornIdx)){
      ifSelectedFornIdx = fornList[0].idx;
    }
    wrap.innerHTML = fornList.map(f => `
      <div class="if-forn-row ${f.idx===ifSelectedFornIdx?'active':''}" data-forn="${f.idx}">
        <div class="if-forn-info">
          <div class="if-forn-name">${f.nome}</div>
          <div class="if-forn-sub">${fmtBRL(f.valorPeriodo)} · <span class="pill pill-${f.resumo.classe}">${f.resumo.classe}</span></div>
        </div>
        <div class="if-forn-spark">${ifSparkline(f.resumo.sparkline, {color: CLASS_COLORS[f.resumo.classe]||'#0E6E6E'})}</div>
      </div>
    `).join('');
    wrap.querySelectorAll('.if-forn-row').forEach(row => {
      row.addEventListener('click', () => {
        ifSelectedFornIdx = +row.dataset.forn;
        wrap.querySelectorAll('.if-forn-row').forEach(r => r.classList.toggle('active', +r.dataset.forn===ifSelectedFornIdx));
        ifRenderDetail();
      });
    });
  }

  /* ---------- Painel de detalhe ---------- */
  const IF_ITEM_CRIT_GETTER = {
    valor: x => x.agg.valor,
    qtd: x => x.agg.qtd || 0,
    freq: x => x.agg.nfs,
    variacao: x => Math.abs(x.par[PC.TENDENCIA] || 0),
  };

  function ifRenderDetail(){
    if(ifSelectedFornIdx === null) return;
    const forn = ifForn[ifSelectedFornIdx];
    const resumo = ifFornResumo[ifSelectedFornIdx];
    const pares = (parsByForn[ifSelectedFornIdx]||[]).filter(ifPairPassesFilters);
    const linhas = pares.map(p => ({par:p, agg: ifAggregatePair(p), meta: ifItemMeta[p[PC.ITEM]]})).filter(x => x.agg.hasMonth);

    document.getElementById('ifDetailHeader').innerHTML = `
      <div>
        <h4>${forn} <span class="pill pill-${resumo.classe}">${resumo.classe}</span></h4>
        <div class="if-detail-meta">${fmtNum(linhas.length)} itens no recorte · ${fmtBRL(linhas.reduce((a,x)=>a+x.agg.valor,0))} no período</div>
      </div>`;

    const totalForn = linhas.reduce((a,x) => a+x.agg.valor, 0);
    const top10Valor = linhas.slice().sort((a,b) => b.agg.valor-a.agg.valor).slice(0,10).reduce((a,x) => a+x.agg.valor, 0);
    const coberturaPct = totalForn>0 ? 100*top10Valor/totalForn : 0;
    const covEl = document.getElementById('ifCoverageNote');
    covEl.className = 'if-coverage-note' + (coberturaPct<50 && linhas.length>10 ? ' baixa' : '');
    covEl.innerHTML = linhas.length
      ? `Os itens exibidos abaixo (top ${Math.min(10,linhas.length)} de ${linhas.length}) representam <b>${fmtPct1(coberturaPct)}</b> do valor comprado deste fornecedor no período` +
        (coberturaPct<50 && linhas.length>10 ? ' — cauda longa relevante: o top 10 não conta toda a história.' : '.')
      : 'Nenhum item elegível para este fornecedor no filtro atual.';

    ifRenderItemsTable(linhas, totalForn);
    ifRenderMultiSourceHeatmap(linhas);
  }

  function ifRenderItemsTable(linhas, totalForn){
    const getter = IF_ITEM_CRIT_GETTER[ifItemCriterio];
    const top10 = linhas.slice().sort((a,b) => getter(b)-getter(a)).slice(0,10);

    document.querySelector('#ifItemsTable thead').innerHTML = `<tr>
      <th>Item</th><th>Unidade</th><th class="num">Valor</th><th class="num">Share no forn.</th>
      <th class="num">Preço médio</th><th class="num">Tendência</th><th>Histórico</th><th>Sinais</th>
    </tr>`;
    const tbody = document.querySelector('#ifItemsTable tbody');
    tbody.innerHTML = top10.map(x => {
      const share = totalForn ? 100*x.agg.valor/totalForn : 0;
      const precoTxt = x.par[PC.TEM_PRECO]
        ? (x.agg.precoMedioPeriodo!=null ? fmtBRL2(x.agg.precoMedioPeriodo) : '—')
        : '<span class="if-badge if-badge-nopreco">sem unidade confiável</span>';
      const tendTxt = (x.par[PC.TEM_PRECO] && x.par[PC.TENDENCIA]!=null)
        ? (x.par[PC.TENDENCIA]>=0?'+':'')+x.par[PC.TENDENCIA].toFixed(1).replace('.',',')+'%' : '—';
      const hist = x.par[PC.TEM_PRECO] ? ifSparklinePrice(x.par) : '';
      const flags = x.par[PC.NFORN]<=1 ? '<span class="if-badge if-badge-single">Single-source</span>' : '';
      return `<tr>
        <td>${x.meta.descricao} <span style="color:var(--text-faint);font-family:var(--mono);font-size:10.5px;">#${x.meta.cod_item}</span></td>
        <td>${x.par[PC.UNIDADE]!=null ? ifUnid[x.par[PC.UNIDADE]] : '—'}</td>
        <td class="num">${fmtBRL(x.agg.valor)}</td>
        <td class="num">${fmtPct1(share)}</td>
        <td class="num">${precoTxt}</td>
        <td class="num">${tendTxt}</td>
        <td>${hist}</td>
        <td>${flags}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--text-faint);padding:20px;">${IF.dict_fornecedores.length?'Nenhum item elegível para este fornecedor no filtro atual.':''}</td></tr>`;
  }

  /* ---------- Matriz de multi-sourcing ---------- */
  function ifRenderMultiSourceHeatmap(linhas){
    const itensDoForn = linhas.filter(x => x.par[PC.TEM_PRECO]).map(x => x.par[PC.ITEM]);
    if(!itensDoForn.length){
      document.getElementById('ifMultiSourceHeatmap').innerHTML =
        '<thead><tr><th>Item</th></tr></thead><tbody><tr><td style="padding:16px;color:var(--text-faint);">Sem itens com preço confiável para montar a matriz.</td></tr></tbody>';
      return;
    }
    const fornShare = {};
    itensDoForn.forEach(itemIdx => (parsByItem[itemIdx]||[]).forEach(p => { fornShare[p[PC.FORN]] = (fornShare[p[PC.FORN]]||0)+1; }));
    const fornCols = Object.keys(fornShare).map(Number).sort((a,b) => fornShare[b]-fornShare[a]).slice(0,15);
    const itensRows = itensDoForn.slice(0,20);

    let html = '<thead><tr><th class="fname">Item</th>' +
      fornCols.map(f => `<th>${ifForn[f].length>14?ifForn[f].slice(0,14)+'…':ifForn[f]}</th>`).join('') + '</tr></thead><tbody>';
    itensRows.forEach(itemIdx => {
      html += `<tr><td class="fname">${ifItemMeta[itemIdx].descricao}</td>`;
      fornCols.forEach(f => {
        const par = (parsByItem[itemIdx]||[]).find(p => p[PC.FORN]===f);
        if(!par || !par[PC.TEM_PRECO]){
          html += '<td style="color:var(--text-faint);">—</td>';
        } else {
          const isSel = f === ifSelectedFornIdx;
          html += `<td style="background:${isSel?'var(--accent-soft)':'#F3FBF9'};font-weight:${isSel?'700':'400'};">${fmtBRL2(par[PC.MEDIANA])}</td>`;
        }
      });
      html += '</tr>';
    });
    html += '</tbody>';
    document.getElementById('ifMultiSourceHeatmap').innerHTML = html;
  }

  /* ---------- Tabela consolidada ---------- */
  function ifConsolidatedRows(){
    const fornSet = new Set(ifFornecedoresFiltrados().map(f => f.idx));
    let rows = [];
    IF.pares.forEach(par => {
      if(!fornSet.has(par[PC.FORN]) || !ifPairPassesFilters(par)) return;
      const agg = ifAggregatePair(par);
      if(!agg.hasMonth) return;
      rows.push({par, agg, forn: ifForn[par[PC.FORN]], meta: ifItemMeta[par[PC.ITEM]]});
    });
    if(ifTblSearchTerm){
      rows = rows.filter(r => r.forn.toLowerCase().includes(ifTblSearchTerm) ||
        r.meta.descricao.toLowerCase().includes(ifTblSearchTerm) || String(r.meta.cod_item).includes(ifTblSearchTerm));
    }
    const getter = {
      fornecedor: r=>r.forn, item: r=>r.meta.descricao, valor: r=>r.agg.valor,
      qtd: r=>r.agg.qtd||0, preco: r=>r.agg.precoMedioPeriodo||0, saving: r=>r.agg.saving||0,
    }[ifTblSortKey] || (r => r.agg.valor);
    rows.sort((a,b) => {
      const va=getter(a), vb=getter(b);
      if(typeof va === 'number') return (va-vb)*ifTblSortDir;
      return String(va).localeCompare(String(vb))*ifTblSortDir;
    });
    return rows.slice(0, IF_TBL_MAX_ROWS);
  }

  function ifRenderConsolidatedHead(){
    const cols = [
      {key:'fornecedor', label:'Fornecedor'}, {key:'item', label:'Item'},
      {key:'valor', label:'Valor', num:true}, {key:'qtd', label:'Qtd.', num:true},
      {key:'preco', label:'Preço médio', num:true}, {key:'saving', label:'Saving', num:true},
    ];
    const thead = document.querySelector('#ifConsolidatedTable thead');
    thead.innerHTML = '<tr>' + cols.map(c => {
      let cls = c.num?'num':'';
      if(c.key===ifTblSortKey) cls += (ifTblSortDir===1?' sorted-asc':' sorted-desc');
      return `<th class="${cls}" data-key="${c.key}">${c.label}</th>`;
    }).join('') + '</tr>';
    thead.querySelectorAll('th').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if(ifTblSortKey===key) ifTblSortDir*=-1; else { ifTblSortKey=key; ifTblSortDir=-1; }
        ifTblPage=1;
        ifRenderConsolidatedHead(); ifRenderConsolidatedBody();
      });
    });
  }

  function ifRenderConsolidatedBody(){
    const rows = ifConsolidatedRows();
    ifConsolidatedCache = rows;
    document.getElementById('ifTblResultCount').textContent =
      fmtNum(rows.length) + (rows.length>=IF_TBL_MAX_ROWS ? ` (limitado a ${IF_TBL_MAX_ROWS})` : '') + ' pares';
    const totalPages = Math.max(1, Math.ceil(rows.length/IF_TBL_PAGE_SIZE));
    if(ifTblPage>totalPages) ifTblPage = totalPages;
    const page = rows.slice((ifTblPage-1)*IF_TBL_PAGE_SIZE, ifTblPage*IF_TBL_PAGE_SIZE);
    document.querySelector('#ifConsolidatedTable tbody').innerHTML = page.map(r => `
      <tr>
        <td>${r.forn}</td>
        <td>${r.meta.descricao}</td>
        <td class="num">${fmtBRL(r.agg.valor)}</td>
        <td class="num">${r.par[PC.TEM_PRECO] && r.agg.qtd!=null ? fmtNum(r.agg.qtd) : '—'}</td>
        <td class="num">${r.par[PC.TEM_PRECO] && r.agg.precoMedioPeriodo!=null ? fmtBRL2(r.agg.precoMedioPeriodo) : '—'}</td>
        <td class="num">${r.agg.saving!=null ? fmtBRL(r.agg.saving) : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-faint);padding:20px;">Nenhum par encontrado.</td></tr>';
    ifRenderPagination(totalPages);
  }

  function ifRenderPagination(totalPages){
    const el = document.getElementById('ifTblPagination');
    if(totalPages<=1){ el.innerHTML=''; return; }
    let html = `<button ${ifTblPage===1?'disabled':''} data-p="${ifTblPage-1}">‹</button>`;
    let start = Math.max(1, ifTblPage-3), end = Math.min(totalPages, start+6);
    start = Math.max(1, end-6);
    for(let p=start; p<=end; p++) html += `<button class="${p===ifTblPage?'active':''}" data-p="${p}">${p}</button>`;
    html += `<button ${ifTblPage===totalPages?'disabled':''} data-p="${ifTblPage+1}">›</button>`;
    el.innerHTML = html;
    el.querySelectorAll('button[data-p]').forEach(b => b.addEventListener('click', () => { ifTblPage = +b.dataset.p; ifRenderConsolidatedBody(); }));
  }

  document.getElementById('ifBtnExportCsv').addEventListener('click', () => {
    const header = ['Fornecedor','Item','CodigoItem','Valor','Quantidade','PrecoMedio','Saving'];
    const lines = [header.join(';')];
    ifConsolidatedCache.forEach(r => {
      lines.push([
        '"'+r.forn.replace(/"/g,'""')+'"',
        '"'+r.meta.descricao.replace(/"/g,'""')+'"',
        r.meta.cod_item,
        r.agg.valor.toFixed(2).replace('.',','),
        r.par[PC.TEM_PRECO] && r.agg.qtd!=null ? r.agg.qtd.toFixed(3).replace('.',',') : '',
        r.par[PC.TEM_PRECO] && r.agg.precoMedioPeriodo!=null ? r.agg.precoMedioPeriodo.toFixed(4).replace('.',',') : '',
        r.agg.saving!=null ? r.agg.saving.toFixed(2).replace('.',',') : '',
      ].join(';'));
    });
    const blob = new Blob(['﻿'+lines.join('\n')], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'itens_por_fornecedor.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  /* ---------- Filtros: componentes compartilhados (shared/portal-filters.js) ----------
     Período: calendário em granularidade de MÊS (os dados desta aba são mensais), início e fim inclusivos.
     Casa/Unidade e Grupo de item: lista suspensa com checkboxes (OU dentro do filtro, E entre filtros). */
  const ifGruposUnicos = Array.from(new Set(ifItemMeta.map(m => m.grupo))).sort();
  function ifReadSelectionFilters(){
    const r = ifPeriodoFilter.getRange();
    ifMesIniIdx = r ? r.start : 0;
    ifMesFimIdx = r ? r.end : ifMonths.length - 1;
    ifCasaSet = ifCasaFilter.getSet();
    const g = ifGrupoFilter.getSet();
    ifGrupoSet = g ? new Set(Array.from(g).map(i => ifGruposUnicos[i])) : null;
  }
  const ifOnSelectionChange = () => { ifReadSelectionFilters(); ifTblPage = 1; ifOnFilterChange(); };
  const ifPeriodoFilter = createDateRangeFilter({
    containerId:'ifPeriodo', granularity:'month', months: ifMonths, minOff:0, maxOff: ifMonths.length - 1,
    format: off => ifMonthLabels[ifMonths[off]] || ifMonths[off], onChange: ifOnSelectionChange,
  });
  const ifCasaFilter = createDropdownFilter({containerId:'ifCasa', labels: ifCasas, ariaLabel:'Loja/Unidade', onChange: ifOnSelectionChange});
  const ifGrupoFilter = createDropdownFilter({containerId:'ifGrupo', labels: ifGruposUnicos, ariaLabel:'Grupo de item', onChange: ifOnSelectionChange});

  document.getElementById('ifCriterio').addEventListener('change', e => { ifCriterioForn = e.target.value; ifOnFilterChange(); });
  document.getElementById('ifBusca').addEventListener('input', e => { ifBusca = e.target.value.trim().toLowerCase(); ifTblPage=1; ifOnFilterChange(); });
  document.getElementById('ifBtnLimpar').addEventListener('click', () => {
    ifPeriodoFilter.clear(true); ifCasaFilter.clear(true); ifGrupoFilter.clear(true);
    ifReadSelectionFilters();
    ifBusca=''; ifCriterioForn='valor'; ifTblPage=1;
    document.getElementById('ifCriterio').value = 'valor';
    document.getElementById('ifBusca').value = '';
    ifOnFilterChange();
  });
  document.getElementById('ifItemCriterioChips').querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#ifItemCriterioChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      ifItemCriterio = chip.dataset.crit;
      ifRenderDetail();
    });
  });
  document.getElementById('ifTblSearch').addEventListener('input', e => {
    ifTblSearchTerm = e.target.value.trim().toLowerCase(); ifTblPage=1; ifRenderConsolidatedBody();
  });

  function ifUpdateActiveFilterNote(){
    const parts = [];
    if(ifMesIniIdx!==0 || ifMesFimIdx!==ifMonths.length-1) parts.push('período: '+ifMonthLabels[ifMonths[ifMesIniIdx]]+' a '+ifMonthLabels[ifMonths[ifMesFimIdx]]);
    const resumo = (nomes) => nomes.length <= 3 ? nomes.join(', ') : nomes.slice(0,3).join(', ')+' +'+(nomes.length-3);
    if(ifCasaSet) parts.push('loja: '+resumo(Array.from(ifCasaSet).sort((a,b)=>a-b).map(i => ifCasas[i])));
    if(ifGrupoSet) parts.push('grupo: '+resumo(Array.from(ifGrupoSet).sort()));
    if(ifBusca) parts.push('busca: "'+ifBusca+'"');
    const note = document.getElementById('ifActiveFilterNote');
    if(parts.length){ note.hidden=false; note.textContent = 'Filtros ativos: '+parts.join(' · '); }
    else note.hidden = true;
  }

  function ifOnFilterChange(){
    ifUpdateActiveFilterNote();
    ifRenderKPIs();
    ifRenderFornList();
    ifRenderDetail();
    ifRenderConsolidatedHead();
    ifRenderConsolidatedBody();
  }

  /* ---------- Nota de escopo + rodape de metodologia ---------- */
  function ifRenderScopeNote(){
    const q = IF.qualidade;
    document.getElementById('ifScopeNote').innerHTML =
      `<b>${fmtPct1(q.valor_sem_metrica_preco_pct)}</b> do valor comprado (${fmtNum(q.itens_sem_unidade_dominante)} itens) não tem unidade de medida confiável e por isso não mostra preço/quantidade — só valor total. Detalhes completos no rodapé de metodologia.`;
  }

  function ifRenderMethodology(){
    const q = IF.qualidade, c = IF.config;
    const items = [
      `<b>Agrupamento sempre por código do item</b> (não por descrição) — o código está preenchido em 100% das linhas da base, então não foi preciso nenhum agrupamento por descrição nem fuzzy matching.`,
      `<b>Unidade de medida:</b> não existe conversão segura entre unidades diferentes nesta base (nenhum par de unidades é conversível sem inventar peso/densidade de embalagem). Cada item usa a unidade que concentra pelo menos ${fmtPct1(c.um_dominancia_minima*100)} do seu valor como "unidade canônica"; linhas em unidades minoritárias ficam de fora de preço/quantidade (${fmtBRL(q.valor_minoria_excluida)}, ${fmtPct1(q.valor_minoria_excluida_pct)} do valor). ${fmtNum(q.itens_sem_unidade_dominante)} itens não têm unidade dominante — preço e quantidade ficam totalmente suprimidos (badge "sem unidade confiável"), representando ${fmtBRL(q.valor_sem_metrica_preco)} (${fmtPct1(q.valor_sem_metrica_preco_pct)} do valor total).`,
      `<b>Preço médio é sempre ponderado</b> (Σ valor ÷ Σ quantidade), nunca média simples de preços unitários.`,
      `<b>Mediana, mínimo, máximo, volatilidade e tendência</b> usam o histórico completo disponível e não mudam com o filtro de período — só valor, quantidade, preço médio do período e saving respeitam o filtro de mês.`,
      `<b>Saving potencial é oportunidade teórica, não meta.</b> Só é calculado quando o fornecedor de referência (quem oferece o "melhor preço") tem, no histórico completo do item, pelo menos ${c.saving_min_compras} compras e ${c.saving_min_dias} dias de janela — sempre comparando dentro do mesmo mês (nunca janeiro contra julho).`,
      `<b>"Lojas atendidas"</b>, quando o período filtrado cobre mais de um mês, mostra o maior valor observado num único mês do intervalo — não é a união exata de lojas distintas ao longo de vários meses.`,
      `<b>Matriz de multi-sourcing</b> compara apenas entre os ${fmtNum(q.fornecedores_uniao)} fornecedores do recorte atual (união dos top ${c.top_n_uniao} por valor/NFs/lojas/itens distintos) — já o "melhor preço" usado no cálculo de saving é sempre contra TODOS os fornecedores da base, não só esses ${fmtNum(q.fornecedores_uniao)}.`,
      `Recorte analisado: ${fmtNum(q.fornecedores_uniao)} fornecedores, ${fmtNum(q.itens_relevantes)} itens, ${fmtNum(q.pares_totais)} pares fornecedor×item (${fmtNum(q.pares_com_preco)} com métrica de preço, ${fmtNum(q.pares_sem_preco)} sem).`,
      `${fmtNum(q.itens_single_source)} itens são comprados de um único fornecedor em toda a base — risco de dependência.`,
      `Processado em ${DATA.gerado_em}, cobrindo ${ifMonthLabels[ifMonths[0]]} a ${ifMonthLabels[ifMonths[ifMonths.length-1]]}.`,
    ];
    document.getElementById('ifMethodologyList').innerHTML = items.map(t => `<li>${t}</li>`).join('');
  }

  /* ---------- Init ---------- */
  ifRenderScopeNote();
  ifRenderMethodology();
  ifOnFilterChange();
})();

/* ===================== Render orchestrator ===================== */
function renderAll(){
  renderKPIs();
  renderHero();
  renderDonut();
  renderMiniMonthly();
  renderTop5();
  renderABCChart();
  renderRanking();
  renderGrupo();
  renderHeatmap();
  renderSegmentoTotal();
  renderRegionalizacao();
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
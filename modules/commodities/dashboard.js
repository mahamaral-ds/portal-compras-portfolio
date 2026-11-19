try {
/* ===================== Setup ===================== */
const fmtNum = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(v));   // usado também pelas Notícias

/* @@PAINEL-INICIO */
/* O Painel de Commodities (aba ainda em desenvolvimento) fica entre os comentários de início e fim do Painel (os que
   levam dois arrobas antes de PAINEL-INICIO e PAINEL-FIM). Os marcadores permitem gerar uma cópia só com Notícias de
   Mercado, removendo esses trechos, a aba, o data.js e o Chart.js. Mantenha tudo que é do Painel dentro deles. */
const DATA = COMMODITIES_DATA;

const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:0}).format(v);
const fmtBRL2 = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:2}).format(v);
const fmtBRL4 = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', minimumFractionDigits:4, maximumFractionDigits:4}).format(v);
const fmtPct1 = (v) => v.toFixed(1).replace('.', ',') + '%';
// variacao em fracao (0.124 -> "+12,4%")
const fmtVar = (f) => (f === null || f === undefined) ? '—' : (f > 0 ? '+' : '') + (f * 100).toFixed(1).replace('.', ',') + '%';
const fmtPP = (f) => (f === null || f === undefined) ? '—' : (f > 0 ? '+' : '') + (f * 100).toFixed(1).replace('.', ',') + ' p.p.';
const varClass = (f) => (f === null || f === undefined || Math.abs(f) < 0.0005) ? 'cm-flat' : (f > 0 ? 'cm-up' : 'cm-down');
const varHtml = (f) => `<span class="${varClass(f)}">${fmtVar(f)}</span>`;

const CHART_PALETTE = ['#0E6E6E','#C98A3B','#5B7FBF','#8A5AC9','#2F8F5B','#C0442C','#3E5C76','#94A0AF','#B8895A'];

Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
Chart.defaults.font.size = 11.5;
Chart.defaults.color = '#5B6472';
/* @@PAINEL-FIM */

/* ===================== Tabs ===================== */
const tabButtons = document.querySelectorAll('#tabNav button');
function setActiveView(viewKey){
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === viewKey));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewKey).classList.add('active');
  window.dispatchEvent(new Event('resize'));
}
tabButtons.forEach(btn => btn.addEventListener('click', () => setActiveView(btn.dataset.view)));

/* @@PAINEL-INICIO */
/* ===================== Cabeçalho ===================== */
const MESES = DATA.months_order, NM = MESES.length, FAM = DATA.familias;
const mesLabel = (m) => DATA.month_labels[MESES[m]];
document.getElementById('genDate').textContent = DATA.gerado_em;
{
  const [a, mm, d] = DATA.ptax.ultimo.data.split('-');
  document.getElementById('genFontes').textContent = `Compras ${mesLabel(0)}–${mesLabel(NM - 1)} · dólar até ${d}/${mm}/${a}`;
}

/* ===================== Painel de Commodities =====================
   Tudo calculado aqui a partir do data.js (gerado por build_data.py com dados SINTETICOS: notas fiscais do grupo ficticio, IPCA e dolar simulados
   e dólar PTAX do Banco Central). Filtros no padrao do Portal: Commodity (lista suspensa com checkboxes) e Periodo
   (calendario de meses). Sem selecao = todas as commodities / todos os meses.
   Indice de preco pago: build_data.py guarda, por mes, a razao entre o preco do mes e o do mes anterior (indice
   encadeado, so' com itens na unidade de referencia e fora dos suspeitos); aqui o indice e' refeito com base 100 no
   primeiro mes do periodo. Entre varias commodities, a razao composta pondera cada uma pelo gasto dela no mes anterior. */
const cmComm = createDropdownFilter({containerId:'cmComm', labels:FAM.map(f => f.nome), ariaLabel:'Commodity', onChange: () => renderPainel()});
const cmPeriodo = createDateRangeFilter({containerId:'cmPeriodo', granularity:'month', minOff:0, maxOff:NM - 1, months:MESES,
  format:(off) => mesLabel(off), onChange: () => renderPainel()});
let chartIndice = null, chartPtax = null;

// indice base 100 em `s`, encadeando as razoes ate `e`; para na primeira razao ausente (nunca inventa o mes)
function encadear(razoes, s, e){
  const out = new Array(NM).fill(null);
  let v = 100; out[s] = 100;
  for(let m = s + 1; m <= e; m++){
    if(razoes[m] === null || razoes[m] === undefined) break;
    v *= razoes[m]; out[m] = v;
  }
  return out;
}
const ultimoValor = (arr) => { for(let i = arr.length - 1; i >= 0; i--) if(arr[i] !== null) return arr[i]; return null; };
const variacaoDe = (arr) => { const u = ultimoValor(arr); return u === null ? null : u / 100 - 1; };
const razoesIpca = (ipca) => ipca.var_mensal.map(v => v === null ? null : 1 + v / 100);

// razao composta das commodities escolhidas (pondera pelo gasto de cada uma no mes anterior)
function razaoComposta(fams){
  return MESES.map((_, m) => {
    if(m === 0) return null;
    let num = 0, den = 0;
    fams.forEach(f => { const r = f.razao_preco_mensal[m]; if(r !== null && r !== undefined){ num += f.gasto_mensal[m - 1] * r; den += f.gasto_mensal[m - 1]; } });
    return den > 0 ? num / den : null;
  });
}

function renderPainel(){
  const selSet = cmComm.getSet();
  const fams = FAM.filter((_, i) => !selSet || selSet.has(i));
  const rng = cmPeriodo.getRange();
  const s = rng ? rng.start : 0, e = rng ? rng.end : NM - 1;
  const labels = MESES.slice(s, e + 1).map((_, k) => mesLabel(s + k));
  const periodoTxt = s === e ? mesLabel(s) : mesLabel(s) + ' a ' + mesLabel(e);
  const soma = (arr) => arr.slice(s, e + 1).reduce((a, v) => a + v, 0);

  document.getElementById('cmResumo').textContent =
    `${fams.length} de ${FAM.length} commodities · ${periodoTxt} (${e - s + 1} ${e - s === 0 ? 'mês' : 'meses'})`;

  /* ---- séries ---- */
  const gastoTotalPeriodo = soma(DATA.gasto_total_mensal);
  const gastoSel = fams.reduce((a, f) => a + soma(f.gasto_mensal), 0);
  const idxFam = fams.map(f => encadear(f.razao_preco_mensal, s, e));
  const idxComposto = encadear(razaoComposta(fams), s, e);
  const ipcaFamIdx = fams.map(f => encadear(razoesIpca(f.ipca), s, e));
  const ipcaAliIdx = encadear(razoesIpca(DATA.ipca_alimentacao), s, e);
  // com um unico mes nao ha variacao (so' o ponto de partida): mostra "—" em vez de 0,0%
  const variacaoPeriodo = (arr) => s === e ? null : variacaoDe(arr);
  const varPreco = variacaoPeriodo(idxComposto);
  const unica = fams.length === 1 ? fams[0] : null;
  const ipcaRefIdx = unica ? ipcaFamIdx[0] : ipcaAliIdx;
  const ipcaRefNome = unica ? 'IPCA — ' + unica.ipca.nome : DATA.ipca_alimentacao.nome;
  const varIpca = variacaoPeriodo(ipcaRefIdx);
  const ptaxMeses = DATA.ptax.media_mensal.slice(s, e + 1);
  const ptaxVar = (s !== e && ptaxMeses[0] && ptaxMeses[ptaxMeses.length - 1]) ? ptaxMeses[ptaxMeses.length - 1] / ptaxMeses[0] - 1 : null;
  const ptaxFim = DATA.ptax.media_mensal[e];
  const semVar = s === e ? ' · escolha 2 ou mais meses para ver a variação' : '';

  /* ---- cartões ---- */
  const cards = [
    {label:'Gasto nas commodities', value: fmtBRL(gastoSel), sub: gastoTotalPeriodo ? fmtPct1(100 * gastoSel / gastoTotalPeriodo) + ' do gasto de compras no período' : '—', cls:'accent-a'},
    {label:'Preço pago (Quintaluz)', value: fmtVar(varPreco), sub: (varPreco === null ? 'sem comparação' : 'índice composto de ' + fams.length + (fams.length === 1 ? ' commodity' : ' commodities')) + semVar, cls:'accent-a'},
    {label:'IPCA de referência', value: fmtVar(varIpca), sub: ipcaRefNome + semVar, cls:'accent-b'},
    {label:'Dólar PTAX (venda)', value: ptaxFim ? fmtBRL2(ptaxFim) : '—', sub: `média de ${mesLabel(e)}` + (ptaxVar !== null ? ' · ' + fmtVar(ptaxVar) + ' no período' : ''), cls:'accent-b'},
  ];
  document.getElementById('cmKpis').innerHTML = cards.map(k => `
    <div class="kpi-card ${k.cls}">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
      <div class="sub">${k.sub}</div>
    </div>`).join('');

  /* ---- gráfico: índice de preço pago (base 100) ---- */
  document.getElementById('cmIndiceSub').textContent =
    `Base 100 em ${mesLabel(s)} · preço pago pelo grupo por commodity × IPCA${unica ? ' de referência' : ' de Alimentação e bebidas'} (tracejado)`;
  const dsFam = fams.map((f, k) => ({
    label: f.nome, data: idxFam[k].slice(s, e + 1),
    borderColor: CHART_PALETTE[FAM.indexOf(f) % CHART_PALETTE.length], backgroundColor: CHART_PALETTE[FAM.indexOf(f) % CHART_PALETTE.length],
    tension:.25, pointRadius:4, borderWidth:2.2, spanGaps:false,
  }));
  const dsRef = [{
    label: ipcaAliIdx.some(v => v !== null) ? DATA.ipca_alimentacao.nome : '', data: ipcaAliIdx.slice(s, e + 1),
    borderColor:'#5B6472', backgroundColor:'#5B6472', borderDash:[6, 4], tension:.25, pointRadius:3, borderWidth:1.8, spanGaps:false,
  }];
  if(unica) dsRef.push({
    label: 'IPCA — ' + unica.ipca.nome, data: ipcaFamIdx[0].slice(s, e + 1),
    borderColor:'#C98A3B', backgroundColor:'#C98A3B', borderDash:[2, 3], tension:.25, pointRadius:3, borderWidth:1.8, spanGaps:false,
  });
  if(chartIndice) chartIndice.destroy();
  chartIndice = new Chart(document.getElementById('chartCmIndice'), {
    type:'line', data:{labels, datasets: dsFam.concat(dsRef)},
    options:{
      responsive:true, maintainAspectRatio:false, interaction:{mode:'index', intersect:false},
      plugins:{ legend:{position:'bottom', labels:{boxWidth:10, usePointStyle:true}},
        tooltip:{callbacks:{label:(ctx) => ctx.parsed.y === null ? null : ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1).replace('.', ',')}`}} },
      scales:{ y:{ ticks:{callback:(v) => String(v).replace('.', ',')}, grid:{color:'#EEF0F3'}, title:{display:true, text:'Índice (base 100)'} }, x:{grid:{display:false}} }
    }
  });

  /* ---- gráfico: dólar ---- */
  document.getElementById('cmPtaxSub').textContent = `Média mensal em R$ · ${periodoTxt}` +
    ` · última cotação ${fmtBRL4(DATA.ptax.ultimo.valor)} em ${DATA.ptax.ultimo.data.split('-').reverse().join('/')}`;
  if(chartPtax) chartPtax.destroy();
  chartPtax = new Chart(document.getElementById('chartCmPtax'), {
    type:'line',
    data:{labels, datasets:[{ label:'Dólar PTAX (venda), média do mês', data: ptaxMeses, borderColor:'#0E6E6E', backgroundColor:'rgba(14,110,110,0.08)',
      fill:true, tension:.25, pointRadius:4, pointBackgroundColor:'#0E6E6E', spanGaps:false }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx) => ' Média do mês: ' + fmtBRL4(ctx.parsed.y)}} },
      scales:{ y:{ticks:{callback:(v) => fmtBRL2(v)}, grid:{color:'#EEF0F3'}}, x:{grid:{display:false}} }
    }
  });

  /* ---- tabela: resumo por commodity ---- */
  document.getElementById('cmResumoSub').textContent =
    `${periodoTxt} · variação do preço pago e do IPCA de referência de cada commodity (diferença = preço pago − IPCA, em pontos percentuais)`;
  const linhas = fams.map((f, k) => {
    const gasto = soma(f.gasto_mensal), vp = variacaoPeriodo(idxFam[k]), vi = variacaoPeriodo(ipcaFamIdx[k]);
    return {f, gasto, vp, vi, dif: (vp !== null && vi !== null) ? vp - vi : null};
  }).sort((a, b) => b.gasto - a.gasto);
  document.querySelector('#cmTabelaResumo tbody').innerHTML = linhas.map(r => `
    <tr>
      <td><strong>${r.f.nome}</strong><span class="cm-sub" title="${r.f.regra}">${r.f.n_itens} itens na base</span></td>
      <td class="num">${fmtBRL(r.gasto)}</td>
      <td class="num">${gastoTotalPeriodo ? fmtPct1(100 * r.gasto / gastoTotalPeriodo) : '—'}</td>
      <td class="num">${varHtml(r.vp)}</td>
      <td class="num">${varHtml(r.vi)}</td>
      <td class="num"><span class="${varClass(r.dif)}">${fmtPP(r.dif)}</span></td>
      <td>${r.f.ipca.nome}</td>
      <td class="num">${fmtPct1(r.f.cobertura_preco_pct)} do gasto</td>
    </tr>`).join('');

  /* ---- tabela: principais itens (maior gasto no período, entre as commodities escolhidas) ---- */
  const itens = [];
  fams.forEach(f => f.itens.forEach(it => {
    const gasto = soma(it.gasto_mensal);
    let ini = null, fim = null;
    for(let m = s; m <= e; m++){ if(it.preco_mensal[m] !== null){ if(ini === null) ini = m; fim = m; } }
    itens.push({f, it, gasto, ini, fim});
  }));
  itens.sort((a, b) => b.gasto - a.gasto);
  const topItens = itens.filter(x => x.gasto > 0).slice(0, 15);
  document.getElementById('cmItensSub').textContent =
    `${periodoTxt} · os ${topItens.length} itens de maior gasto entre os principais itens de cada commodity (preço na unidade de referência do item)`;
  document.querySelector('#cmTabelaItens tbody').innerHTML = topItens.map(x => {
    const p0 = x.ini === null ? null : x.it.preco_mensal[x.ini], p1 = x.fim === null ? null : x.it.preco_mensal[x.fim];
    const v = (p0 && p1 && x.ini !== x.fim) ? p1 / p0 - 1 : null;
    const fmtP = (p, m) => p === null ? '—' : `${fmtBRL2(p)} / ${x.it.um}<span class="cm-sub">${mesLabel(m)}</span>`;
    return `<tr><td>${x.f.nome}</td><td>${x.it.item}</td><td class="num">${fmtBRL(x.gasto)}</td>
      <td class="num">${fmtP(p0, x.ini)}</td><td class="num">${fmtP(p1, x.fim)}</td><td class="num">${varHtml(v)}</td></tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-faint);padding:18px;">Sem compras no período selecionado.</td></tr>';

  document.getElementById('cmNota').innerHTML =
    '<b>Como ler:</b> o preço pago é calculado com os registros de compra na unidade de referência de cada item (a de maior valor comprado), sem registros suspeitos — a mesma regra de Análise de Itens — ' +
    'e vira um índice encadeado mês a mês (itens com preço nos dois meses, ponderados pelo gasto do mês anterior; razões fora de 1/3 a 3 são ignoradas). ' +
    'Subir é custo maior para a compra (vermelho). O IPCA é preço ao consumidor, uma referência de mercado, não o preço de atacado. ' +
    '<b>Fontes:</b> notas fiscais sintéticas do Grupo Quintaluz (fictício); IPCA e dólar sintéticos, no formato das séries do IBGE (SIDRA 7060) e do Banco Central (SGS 10813). ' +
    'Cada commodity reúne os itens de uma regra fixa (passe o mouse sobre "itens na base" para ver); vinhos, cervejas e pescados não entram por não terem referência pública confiável.';
}
document.getElementById('cmClear').addEventListener('click', () => { cmComm.clear(true); cmPeriodo.clear(true); renderPainel(); });
renderPainel();
/* @@PAINEL-FIM */


/* ===================== Notícias de Mercado (fixo, independente de período) ===================== */
(function noticiasModule(){
  const IMPACTO = {
    alta:    {label:'Possível alta',  desc:'Pressão de alta nos preços'},
    baixa:   {label:'Possível baixa', desc:'Alívio de preços à vista'},
    atencao: {label:'Atenção',        desc:'Efeito misto ou incerto'},
  };
  const DIAS_NOVO = 3;        // selo "Novo"
  const DIAS_DESATUALIZADO = 14; // aviso de curadoria antiga
  const MAX_DESTAQUES = 4;    // 1 principal + 3 laterais

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = (u) => /^https?:\/\//i.test(u || '') ? u : '#';
  // notícias fictícias (link '#') não abrem nova aba
  const alvoLink = (u) => /^https?:\/\//i.test(u || '') ? 'target="_blank" rel="noopener noreferrer"' : 'onclick="return false"';
  const temaLabel = (t) => (typeof NEWS_TEMAS !== 'undefined' && NEWS_TEMAS[t]) || t || 'Geral';

  const filtros = {tema:'ALL', impacto:'ALL', janela:'ALL', q:''};
  let ITENS = [];
  let controlesMontados = false;

  /* ---------- datas ---------- */
  function parseDia(iso){
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function hoje(){ const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function diasAtras(d){ return Math.round((hoje() - d) / 86400000); }
  function dataCurta(d){ return d.toLocaleDateString('pt-BR'); }
  function relativo(d){
    const n = diasAtras(d);
    if(n <= 0) return 'hoje';
    if(n === 1) return 'ontem';
    if(n <= 30) return 'há ' + n + ' dias';
    return dataCurta(d);
  }

  /* ---------- filtros ---------- */
  function filtrosAtivos(){
    return filtros.tema !== 'ALL' || filtros.impacto !== 'ALL' || filtros.janela !== 'ALL' || !!filtros.q;
  }
  function passa(n, ignorarImpacto){
    if(filtros.tema !== 'ALL' && n.tema !== filtros.tema) return false;
    if(!ignorarImpacto && filtros.impacto !== 'ALL' && (!n.impacto || n.impacto.direcao !== filtros.impacto)) return false;
    if(filtros.janela !== 'ALL' && diasAtras(n._d) > Number(filtros.janela)) return false;
    if(filtros.q){
      const hay = (n.titulo + ' ' + n.fonte + ' ' + temaLabel(n.tema) + ' ' + n.resumo).toLowerCase();
      if(!hay.includes(filtros.q)) return false;
    }
    return true;
  }
  const porData = (a, b) => b.data.localeCompare(a.data);

  /* ---------- peças de HTML ---------- */
  function impactoHtml(n){
    const dir = n.impacto && n.impacto.direcao;
    if(!dir || !IMPACTO[dir]) return '';
    return `<div class="nw-impacto ${dir}"><span class="nw-imp-tag">${IMPACTO[dir].label}</span><span>${esc(n.impacto.texto)}</span></div>`;
  }
  function dataHtml(n){
    const novo = diasAtras(n._d) <= DIAS_NOVO ? '<b class="nw-new">Novo</b>' : '';
    return `<span class="nw-date">${novo}<time datetime="${esc(n.data)}" title="${dataCurta(n._d)}">${relativo(n._d)}</time></span>`;
  }
  function dirClass(n){ return n.impacto && IMPACTO[n.impacto.direcao] ? n.impacto.direcao : ''; }

  function cardHtml(n){
    return `
      <a class="nw-card ${dirClass(n)}" href="${esc(safeUrl(n.link))}" ${alvoLink(n.link)}>
        <div class="nw-card-top"><span class="nw-tema">${esc(temaLabel(n.tema))}</span>${dataHtml(n)}</div>
        <h4 class="nw-titulo">${esc(n.titulo)}</h4>
        <p class="nw-resumo">${esc(n.resumo)}</p>
        ${impactoHtml(n)}
        <div class="nw-card-foot"><span class="nw-fonte">${esc(n.fonte)}</span><span class="nw-open">Ler matéria ↗</span></div>
      </a>`;
  }
  function heroHtml(n){
    return `
      <a class="nw-hero-main" href="${esc(safeUrl(n.link))}" ${alvoLink(n.link)}>
        <div class="nw-hero-kicker"><span class="tag">Em destaque</span><span class="nw-tema">${esc(temaLabel(n.tema))}</span>${dataHtml(n)}</div>
        <h4 class="nw-titulo">${esc(n.titulo)}</h4>
        <p class="nw-resumo">${esc(n.resumo)}</p>
        ${impactoHtml(n)}
        <div class="nw-card-foot"><span class="nw-fonte">${esc(n.fonte)}</span><span class="nw-open">Ler matéria completa ↗</span></div>
      </a>`;
  }
  function sideHtml(n, i){
    return `
      <a class="nw-side-item ${dirClass(n)}" href="${esc(safeUrl(n.link))}" ${alvoLink(n.link)}>
        <span class="nw-side-n">${i + 2}</span>
        <div><h4>${esc(n.titulo)}</h4><div class="nw-side-meta">${esc(n.fonte)} · ${relativo(n._d)}</div></div>
      </a>`;
  }

  /* ---------- estados ---------- */
  function mostrarEstado(tipo, titulo, texto, acao){
    const box = $('newsState');
    box.className = 'nw-state' + (tipo === 'error' ? ' error' : '');
    box.hidden = false;
    box.innerHTML = `<strong>${esc(titulo)}</strong><p>${esc(texto)}</p>` +
      (acao ? `<button type="button" id="newsStateAction">${esc(acao.label)}</button>` : '');
    if(acao) $('newsStateAction').addEventListener('click', acao.fn);
    $('newsEditorial').hidden = true;
    $('newsGrid').hidden = true;
  }
  function esconderEstado(){ $('newsState').hidden = true; }

  /* ---------- radar de impacto ---------- */
  function renderRadar(){
    const base = ITENS.filter(n => passa(n, true));
    const cont = (d) => base.filter(n => n.impacto && n.impacto.direcao === d).length;
    const defs = [
      {key:'ALL', label:'Todas as notícias', desc:'Visão geral do período', n: base.length},
      ...Object.keys(IMPACTO).map(k => ({key:k, label:IMPACTO[k].label, desc:IMPACTO[k].desc, n: cont(k)})),
    ];
    $('newsRadar').innerHTML = defs.map(d => `
      <button type="button" class="nw-radar-btn${filtros.impacto === d.key ? ' active' : ''}" data-impacto="${d.key}" aria-pressed="${filtros.impacto === d.key}">
        <span class="nw-radar-n">${fmtNum(d.n)}</span>
        <span class="nw-radar-l">${d.label}</span>
        <span class="nw-radar-d">${d.desc}</span>
      </button>`).join('');
  }

  /* ---------- listas ---------- */
  function renderEditorial(){
    const destaques = ITENS.filter(n => n.destaque).sort(porData).slice(0, MAX_DESTAQUES);
    const usados = new Set(destaques.map(n => n.id));
    $('newsHero').hidden = !destaques.length;
    $('newsHero').innerHTML = destaques.length
      ? heroHtml(destaques[0]) +
        (destaques.length > 1
          ? `<div class="nw-side"><div class="nw-side-title">Também em destaque</div>${destaques.slice(1).map(sideHtml).join('')}</div>`
          : '')
      : '';

    const secoes = (typeof NEWS_SECOES !== 'undefined') ? NEWS_SECOES : {};
    $('newsSections').innerHTML = Object.keys(secoes).map(key => {
      const itens = ITENS.filter(n => n.secao === key && !usados.has(n.id)).sort(porData);
      if(!itens.length) return '';
      return `
        <div class="nw-section">
          <div class="nw-section-head">
            <h3>${esc(secoes[key].titulo)}</h3><span class="n">${itens.length} ${itens.length === 1 ? 'notícia' : 'notícias'}</span>
            <p>${esc(secoes[key].sub)}</p>
          </div>
          <div class="nw-grid">${itens.map(cardHtml).join('')}</div>
        </div>`;
    }).join('');
  }

  function renderLista(itens){
    $('newsGrid').innerHTML = itens.map(cardHtml).join('');
  }

  function render(){
    const total = ITENS.length;
    if(!total){
      $('newsRadar').innerHTML = '';
      $('newsResultCount').textContent = '';
      mostrarEstado('empty', 'Nenhuma notícia curada no momento', 'Assim que novas matérias forem adicionadas à curadoria, elas aparecem aqui.');
      return;
    }
    renderRadar();
    const ativo = filtrosAtivos();
    $('newsClear').hidden = !ativo;

    if(!ativo){
      esconderEstado();
      $('newsGrid').hidden = true;
      $('newsEditorial').hidden = false;
      renderEditorial();
      $('newsResultCount').textContent = fmtNum(total) + ' notícias curadas';
      return;
    }

    const itens = ITENS.filter(n => passa(n)).sort(porData);
    $('newsResultCount').textContent = fmtNum(itens.length) + ' de ' + fmtNum(total) + ' notícias';
    $('newsEditorial').hidden = true;
    if(!itens.length){
      mostrarEstado('empty', 'Nenhuma notícia encontrada', 'Nenhuma matéria corresponde aos filtros selecionados. Tente outro termo, tema ou janela de datas.',
        {label:'Limpar filtros', fn: limpar});
      return;
    }
    esconderEstado();
    $('newsGrid').hidden = false;
    renderLista(itens);
  }

  /* ---------- controles ---------- */
  function limpar(){
    filtros.tema = 'ALL'; filtros.impacto = 'ALL'; filtros.janela = 'ALL'; filtros.q = '';
    $('newsSearch').value = '';
    $('newsJanela').value = 'ALL';
    marcarTema();
    render();
  }
  function marcarTema(){
    $('newsTemaFilters').querySelectorAll('.chip').forEach(c => {
      const on = c.dataset.tema === filtros.tema;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', on);
    });
  }
  function montarControles(){
    if(controlesMontados) return;
    controlesMontados = true;

    $('newsRadar').addEventListener('click', (e) => {
      const b = e.target.closest('.nw-radar-btn');
      if(!b) return;
      filtros.impacto = (filtros.impacto === b.dataset.impacto) ? 'ALL' : b.dataset.impacto;
      render();
    });
    $('newsTemaFilters').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if(!c) return;
      filtros.tema = c.dataset.tema;
      marcarTema();
      render();
    });
    $('newsSearch').addEventListener('input', (e) => { filtros.q = e.target.value.trim().toLowerCase(); render(); });
    $('newsJanela').addEventListener('change', (e) => { filtros.janela = e.target.value; render(); });
    $('newsClear').addEventListener('click', limpar);
  }

  function montarTemas(){
    const presentes = [...new Set(ITENS.map(n => n.tema))]
      .sort((a, b) => temaLabel(a).localeCompare(temaLabel(b), 'pt-BR'));
    $('newsTemaFilters').innerHTML =
      '<div class="chip active" data-tema="ALL" role="button" tabindex="0" aria-pressed="true">Todos os temas</div>' +
      presentes.map(t => `<div class="chip" data-tema="${esc(t)}" role="button" tabindex="0" aria-pressed="false">${esc(temaLabel(t))}</div>`).join('');
    // chips são <div>: Enter/Espaço também ativam
    $('newsTemaFilters').onkeydown = (e) => {
      if((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('chip')){ e.preventDefault(); e.target.click(); }
    };
  }

  function renderFrescor(){
    const d = parseDia(CATEGORIAS_NEWS.atualizado_em);
    const box = $('newsFresh');
    if(!d){ $('newsUpdatedAt').textContent = '—'; $('newsFreshAgo').textContent = ''; return; }
    const n = diasAtras(d);
    $('newsUpdatedAt').textContent = dataCurta(d);
    box.classList.toggle('stale', n > DIAS_DESATUALIZADO);
    $('newsFreshAgo').textContent = n > DIAS_DESATUALIZADO
      ? '· curadoria há ' + n + ' dias sem atualização'
      : '· ' + relativo(d);
  }

  /* ---------- inicialização (com tratamento de erro e nova tentativa) ---------- */
  function iniciar(){
    mostrarEstado('loading', '', '');
    $('newsState').className = 'nw-state';
    $('newsState').innerHTML = '<div class="nw-skeleton" aria-hidden="true"><i></i><i></i><i></i></div><p>Carregando notícias…</p>';
    try{
      if(typeof CATEGORIAS_NEWS === 'undefined' || !CATEGORIAS_NEWS || !Array.isArray(CATEGORIAS_NEWS.itens)){
        throw new Error('o arquivo de notícias (news-data.js) não foi carregado');
      }
      ITENS = CATEGORIAS_NEWS.itens
        .filter(n => n && n.id && n.titulo && n.link && parseDia(n.data))
        .map(n => Object.assign({}, n, {_d: parseDia(n.data), resumo: n.resumo || '', fonte: n.fonte || ''}));
      renderFrescor();
      montarTemas();
      montarControles();
      marcarTema();
      render();
    } catch(err){
      console.error('Erro ao montar Notícias de Mercado:', err);
      $('newsRadar').innerHTML = '';
      $('newsResultCount').textContent = '';
      mostrarEstado('error', 'Não foi possível carregar as notícias',
        'Ocorreu um erro ao montar a página (' + (err && err.message ? err.message : err) + ').',
        {label:'Tentar novamente', fn: iniciar});
    }
  }

  iniciar();
})();

} catch(err) {
  console.error('Erro ao montar Commodities e Insights:', err);
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="background:#C0442C;color:#fff;padding:14px 24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;">' +
    '<strong>Erro ao carregar a página:</strong> ' + (err && err.message ? err.message : err) +
    '. Tente recarregar; se persistir, verifique se os arquivos foram abertos/baixados corretamente.' +
    '</div>');
}

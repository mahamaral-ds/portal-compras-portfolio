try {
/* ===================== Setup ===================== */
const DATA = COMPLIANCE_DATA;

const fmtNum = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(v));
const fmtPct1 = (v) => (v===null||v===undefined) ? 'N/A' : v.toFixed(1).replace('.', ',') + '%';
const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:0}).format(v);

/* ===================== Tabs ===================== */
const tabButtons = document.querySelectorAll('#tabNav button');
function setActiveView(viewKey){
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === viewKey));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewKey).classList.add('active');
}
tabButtons.forEach(btn => btn.addEventListener('click', () => setActiveView(btn.dataset.view)));

/* ===================== Farol de alerta ===================== */
const ALERTA_META = {
  normal:   {emoji:'🟢', label:'Normal'},
  atencao:  {emoji:'🟡', label:'Atenção'},
  alto:     {emoji:'🟠', label:'Alto'},
  critico:  {emoji:'🔴', label:'Crítico'},
  sem_dado: {emoji:'—',  label:'N/A'},
};
function farolBadge(alerta){
  const m = ALERTA_META[alerta] || ALERTA_META.sem_dado;
  return `<span class="farol-badge farol-${alerta}">${m.emoji} ${m.label}</span>`;
}

/* ===================== KPIs (cards de status = botoes de filtro) =====================
   Cada card de status filtra a tabela abaixo (um status por vez; clicar de novo no mesmo card remove o filtro). A
   quantidade e o valor total (soma de `valor_total`, o valor contabil das NFs do fornecedor) de cada status respeitam os
   demais filtros da aba (hoje, a busca por fornecedor); o primeiro card (total) soma todos os status e, ao ser clicado,
   remove o filtro de status. */
let nfStatusFiltro = null;   // null | 'normal' | 'atencao' | 'alto' | 'critico'

// valor abreviado: R$ 1,2 mi / R$ 350 mil / R$ 729
function fmtBRLabrev(v){
  const a = Math.abs(v);
  if(a >= 1e6) return 'R$ ' + (v / 1e6).toFixed(1).replace('.', ',') + ' mi';
  if(a >= 1e3) return 'R$ ' + fmtNum(v / 1e3) + ' mil';
  return 'R$ ' + fmtNum(v);
}

function renderKPIs(){
  const base = nfFiltrar(false);   // ja filtrado pelos demais filtros (busca), sem o filtro de status
  const soma = (rows) => ({n: rows.length, valor: rows.reduce((a, r) => a + (r.valor_total || 0), 0)});
  const por = (alerta) => soma(base.filter(r => r.alerta === alerta));
  document.getElementById('kpiGrid').innerHTML = [
    {status:null, label:'Fornecedores analisados', cls:'accent-a', ...soma(base)},
    {status:'normal', label:'Normal (' + ALERTA_META.normal.emoji + ')', cls:'', ...por('normal')},
    {status:'atencao', label:'Atenção (' + ALERTA_META.atencao.emoji + ')', cls:'', ...por('atencao')},
    {status:'alto', label:'Alto (' + ALERTA_META.alto.emoji + ')', cls:'', ...por('alto')},
    {status:'critico', label:'Crítico (' + ALERTA_META.critico.emoji + ')', cls:'accent-b', ...por('critico')},
  ].map(k => `
    <div class="kpi-card clicavel ${k.cls}${k.status && k.status === nfStatusFiltro ? ' selected' : ''}" role="button" tabindex="0"
         data-status="${k.status || ''}" aria-pressed="${k.status ? (k.status === nfStatusFiltro) : 'false'}"
         title="${k.status ? 'Filtrar a tabela pelos fornecedores com status ' + ALERTA_META[k.status].label + ' (clique de novo para remover o filtro)' : 'Mostrar todos os fornecedores'}">
      <div class="label">${k.label}</div>
      <div class="value">${fmtNum(k.n)}</div>
      <div class="valor" title="${fmtBRL(k.valor)}">${fmtBRLabrev(k.valor)}</div>
    </div>
  `).join('');
}

function nfAlternarStatus(status){
  nfStatusFiltro = (!status || status === nfStatusFiltro) ? null : status;
  renderKPIs();
  renderNfBody();
}
const kpiGridEl = document.getElementById('kpiGrid');
kpiGridEl.addEventListener('click', (e) => {
  const card = e.target.closest('.kpi-card[data-status]');
  if(card) nfAlternarStatus(card.dataset.status);
});
kpiGridEl.addEventListener('keydown', (e) => {
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.kpi-card[data-status]');
  if(card){ e.preventDefault(); nfAlternarStatus(card.dataset.status); }
});

/* ===================== Tabela NF Sequencial ===================== */
const nfCols = [
  {key:'fornecedor', label:'Fornecedor', title:true},
  {key:'categoria', label:'Categoria', title:true},
  {key:'total_nfs', label:'Total NFs', num:true, fmt:fmtNum},
  {key:'menor_nf', label:'Menor NF', num:true, fmt:fmtNum},
  {key:'maior_nf', label:'Maior NF', num:true, fmt:fmtNum},
  {key:'diferenca', label:'Diferença', num:true, fmt:fmtNum},
  {key:'valor_total', label:'Valor Total', num:true, fmt:fmtBRL},
  {key:'pct_sequencia', label:'% Sequência', num:true, fmt:fmtPct1},
  {key:'alerta', label:'Alerta', fmt:(v)=>farolBadge(v)},
];
let nfSortKey = 'pct_sequencia', nfSortDir = -1;
let nfSearchTerm = '';

function nfSortValue(row, key){
  const v = row[key];
  if(key === 'pct_sequencia' && (v === null || v === undefined)) return null;
  return v;
}

function renderNfHead(){
  const thead = document.querySelector('#nfTable thead');
  thead.innerHTML = '<tr>' + nfCols.map(c => {
    let cls = c.num ? 'num' : '';
    if(c.key === nfSortKey) cls += (nfSortDir===1 ? ' sorted-asc' : ' sorted-desc');
    return `<th class="${cls}" data-key="${c.key}">${c.label}</th>`;
  }).join('') + '</tr>';
  thead.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if(nfSortKey === key){ nfSortDir *= -1; } else { nfSortKey = key; nfSortDir = key === 'fornecedor' ? 1 : -1; }
      renderNfHead(); renderNfBody();
    });
  });
}

// filtros da tabela (E): busca por fornecedor e, se `comStatus`, o status escolhido nos cards
function nfFiltrar(comStatus){
  return DATA.fornecedores.filter(r => {
    if(nfSearchTerm && !r.fornecedor.toLowerCase().includes(nfSearchTerm)) return false;
    if(comStatus && nfStatusFiltro && r.alerta !== nfStatusFiltro) return false;
    return true;
  });
}

function renderNfBody(){
  const tbody = document.querySelector('#nfTable tbody');
  let rows = nfFiltrar(true);
  rows = rows.slice().sort((a,b) => {
    const va = nfSortValue(a, nfSortKey), vb = nfSortValue(b, nfSortKey);
    // valores N/A (null) sempre vao para o final, independente da direção
    if(va === null && vb === null) return 0;
    if(va === null) return 1;
    if(vb === null) return -1;
    if(typeof va === 'number') return (va - vb) * nfSortDir;
    return String(va).localeCompare(String(vb)) * nfSortDir;
  });
  document.getElementById('nfResultCount').textContent = fmtNum(rows.length) + ' de ' + fmtNum(DATA.fornecedores.length) + ' fornecedores';
  tbody.innerHTML = rows.map(r => `
    <tr>${nfCols.map(c => {
      let val = r[c.key];
      const rawVal = val;
      if(c.fmt) val = c.fmt(val);
      const titleAttr = c.title ? ` title="${String(rawVal).replace(/"/g,'&quot;')}"` : '';
      return `<td class="${c.num?'num':''}"${titleAttr}>${val}</td>`;
    }).join('')}</tr>
  `).join('') || '<tr><td colspan="'+nfCols.length+'" style="text-align:center;color:var(--text-faint);padding:20px;">Nenhum fornecedor encontrado.</td></tr>';
}

document.getElementById('nfSearch').addEventListener('input', (e) => {
  nfSearchTerm = e.target.value.trim().toLowerCase();
  renderKPIs();      // quantidade e valor dos cards acompanham a busca
  renderNfBody();
});

document.getElementById('tableSub').textContent =
  `Compara a quantidade de NFs emitidas com o intervalo entre a menor e a maior NF do fornecedor, no período disponível (${DATA.periodo_label}) · ` +
  `lista apenas fornecedores com ${DATA.min_nfs_para_lista}+ NFs no período · clique nos cabeçalhos para ordenar`;

/* ===================== Init ===================== */
renderKPIs();
renderNfHead();
renderNfBody();

} catch (err) {
  console.error('Erro ao carregar o dashboard de Compliance:', err);
}

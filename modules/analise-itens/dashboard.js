try {
/* ===================== Setup ===================== */
const DATA = ANALISE_ITENS_DATA;

const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:2}).format(v);
const fmtBRL0 = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:0}).format(v);
const fmtNum = (v) => new Intl.NumberFormat('pt-BR').format(v);

const monthLabels = DATA.month_labels;

Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
Chart.defaults.font.size = 11.5;
Chart.defaults.color = '#5B6472';

const baseDate = new Date(DATA.base_date + 'T00:00:00');
function dayOffsetToDate(offset){
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offset);
  return d;
}
function fmtDate(offset){
  const d = dayOffsetToDate(offset);
  return d.toLocaleDateString('pt-BR');
}

/* ===================== Tabs ===================== */
const tabButtons = document.querySelectorAll('#tabNav button');
function setActiveView(viewKey){
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === viewKey));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewKey).classList.add('active');
  document.getElementById('periodBar').style.display = (viewKey === 'inteligencia') ? 'flex' : 'none';
  window.dispatchEvent(new Event('resize'));
}
tabButtons.forEach(btn => btn.addEventListener('click', () => setActiveView(btn.dataset.view)));

// Indices das colunas dentro de cada linha de DATA.rows
// DIA = data de lancamento; EMISSAO = data de emissao (ambas em dias desde DATA.base_date); NF = numero da nota
const COL = { MES:0, CASA:1, SEG:2, GRUPO:3, SUBGRUPO:4, FORN:5, ITEM:6, DIA:7, QDE:8, VALOR:9, UM:10, PRECO_UNIT:11, EMISSAO:12, NF:13, DESC_FORN:14 };

const fmtPrecoUnit = (v) => (v===null || v===undefined) ? '—' : fmtBRL(v);
// Preco com a unidade de referencia do item ("R$ 4,50 / KG") — usado nos visuais de preco unitario
// (menos na Tabela Detalhada, que mostra a base como vem do sistema, uma linha por registro).
const fmtPrecoUM = (v, um) => um ? fmtBRL(v) + ' / ' + um : fmtBRL(v);

const TABLE_COLUMNS = [
  {label:'Casa', get:(r)=>DATA.dict_casas[r[COL.CASA]], sortKey:COL.CASA},
  {label:'Data Emissão', get:(r)=>fmtDate(r[COL.EMISSAO]), sortKey:COL.EMISSAO},
  {label:'Data Lançamento', get:(r)=>fmtDate(r[COL.DIA]), sortKey:COL.DIA},
  {label:'Segmento', get:(r)=>DATA.dict_segmentos[r[COL.SEG]], sortKey:COL.SEG},
  {label:'Grupo', get:(r)=>DATA.dict_grupos[r[COL.GRUPO]], sortKey:COL.GRUPO},
  {label:'Subgrupo', get:(r)=>DATA.dict_subgrupos[r[COL.SUBGRUPO]], sortKey:COL.SUBGRUPO},
  {label:'NF', get:(r)=>String(r[COL.NF]), sortKey:COL.NF},
  {label:'Descrição do Item', get:(r)=>DATA.dict_itens[r[COL.ITEM]], sortKey:COL.ITEM},
  {label:'Descrição Item Fornecedor', get:(r)=>DATA.dict_desc_item_fornecedor[r[COL.DESC_FORN]], sortKey:COL.DESC_FORN},
  {label:'Fornecedor', get:(r)=>DATA.dict_fornecedores[r[COL.FORN]], sortKey:COL.FORN},
  {label:'UM', get:(r)=>DATA.dict_uns[r[COL.UM]], sortKey:COL.UM},
  {label:'Qtde. Comprada', get:(r)=>fmtNum(r[COL.QDE]), sortKey:COL.QDE, num:true},
  {label:'Preço Unitário', get:(r)=>fmtPrecoUnit(r[COL.PRECO_UNIT]), sortKey:COL.PRECO_UNIT, num:true},
  {label:'Valor Contábil', get:(r)=>fmtBRL(r[COL.VALOR]), sortKey:COL.VALOR, num:true},
];

/* ===================== Header meta ===================== */
document.getElementById('genDate').textContent = DATA.gerado_em;
{ // periodo coberto pela base (primeiro e ultimo mes), em vez de texto fixo no HTML
  const ms = DATA.months_order, pIni = monthLabels[ms[0]] || ms[0], pFim = monthLabels[ms[ms.length-1]] || ms[ms.length-1];
  const periodo = pIni === pFim ? pIni : pIni + '–' + pFim;
  document.getElementById('brandSub').textContent = 'Base tratada de compras, item a item · ' + periodo;
  document.getElementById('footPeriodo').textContent = periodo;
}
document.getElementById('genTotal').textContent = fmtNum(DATA.total_linhas) + ' linhas na base';

/* ===================== Filtros suspensos da Tabela Detalhada =====================
   Casa, Grupo, Segmento e Segmento × Região usam createDropdownFilter, e Data de lançamento usa
   createDateRangeFilter — componentes compartilhados em shared/portal-filters.js (estilo em
   shared/portal-filters.css). Sem seleção (ou com tudo marcado) = sem filtro. Dentro do mesmo filtro
   vale OU; entre filtros, E. */
// opcao Segmento × Região de cada casa (-1 = sem vinculo) -> casa passa ou nao no filtro (null = sem filtro); usado
// pela Tabela Detalhada e pelo Historico de Precos
function casaPassaSegReg(segRegFilter){
  const set = segRegFilter.getSet();
  return set ? DATA.casa_segmento_regiao.map(o => set.has(o)) : null;
}
function offsetFromYMD(y, m, d){
  const b = baseDate;
  return Math.round((Date.UTC(y, m, d) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
}

const casaFilter = createDropdownFilter({containerId:'fCasa', labels:DATA.dict_casas, ariaLabel:'Casa', onChange: () => applyFilters()});
const grupoFilter = createDropdownFilter({containerId:'fGrupo', labels:DATA.dict_grupos, ariaLabel:'Grupo', onChange: () => applyFilters()});
const segmentoFilter = createDropdownFilter({containerId:'fSegmento', labels:DATA.dict_segmentos, ariaLabel:'Segmento', onChange: () => applyFilters()});
// Segmento × Região: opcoes e vinculo casa -> opcao vem da cmv-casas (build_data.py); sem a cmv-casas o campo some
const segRegFilter = createDropdownFilter({containerId:'fSegReg', labels:DATA.dict_segmento_regiao || [], ariaLabel:'Segmento × Região', onChange: () => applyFilters()});
if(!(DATA.dict_segmento_regiao && DATA.dict_segmento_regiao.length)) document.getElementById('fSegRegField').hidden = true;
// limites do calendario = menor e maior Data de lancamento da base
let _maxDia = 0;
for(let i = 0; i < DATA.rows.length; i++){ if(DATA.rows[i][COL.DIA] > _maxDia) _maxDia = DATA.rows[i][COL.DIA]; }
const dataFilter = createDateRangeFilter({containerId:'fData', granularity:'day', minOff:0, maxOff:_maxDia,
  toDate:dayOffsetToDate, toOffset:offsetFromYMD, format:fmtDate, onChange: () => applyFilters()});

/* ===================== Estado de filtro / ordenacao / paginacao ===================== */
let filteredRows = DATA.rows;
let sortKey = COL.DIA;
let sortDir = -1;
let currentPage = 1;
let pageSize = 50;

function debounce(fn, wait){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function applyFilters(){
  const casaSet = casaFilter.getSet();
  const grupoSet = grupoFilter.getSet();
  const segSet = segmentoFilter.getSet();
  const dataRange = dataFilter.getRange();
  const casaOkSegReg = casaPassaSegReg(segRegFilter);   // calculado uma vez por filtragem
  const fornTerm = document.getElementById('fFornecedor').value.trim().toLowerCase();
  const itemTerm = document.getElementById('fItem').value.trim().toLowerCase();
  const descFornTerm = document.getElementById('fDescForn').value.trim().toLowerCase();
  const nfTerm = document.getElementById('fNF').value.trim();

  // pre-resolve indices de fornecedor/item que batem com o termo de busca (evita
  // fazer .toLowerCase() do texto decodificado em cada uma das 250 mil linhas)
  let fornMatchSet = null;
  if(fornTerm){
    fornMatchSet = new Set();
    DATA.dict_fornecedores.forEach((f, i) => { if(f.toLowerCase().includes(fornTerm)) fornMatchSet.add(i); });
  }
  let descFornMatchSet = null;
  if(descFornTerm){
    descFornMatchSet = new Set();
    DATA.dict_desc_item_fornecedor.forEach((d, i) => { if(d.toLowerCase().includes(descFornTerm)) descFornMatchSet.add(i); });
  }
  let itemMatchSet = null;
  if(itemTerm){
    itemMatchSet = new Set();
    DATA.dict_itens.forEach((it, i) => { if(it.toLowerCase().includes(itemTerm)) itemMatchSet.add(i); });
  }

  filteredRows = DATA.rows.filter(r => {
    if(dataRange && (r[COL.DIA] < dataRange.start || r[COL.DIA] > dataRange.end)) return false;
    if(casaSet && !casaSet.has(r[COL.CASA])) return false;
    if(grupoSet && !grupoSet.has(r[COL.GRUPO])) return false;
    if(segSet && !segSet.has(r[COL.SEG])) return false;
    if(casaOkSegReg && !casaOkSegReg[r[COL.CASA]]) return false;
    if(fornMatchSet && !fornMatchSet.has(r[COL.FORN])) return false;
    if(itemMatchSet && !itemMatchSet.has(r[COL.ITEM])) return false;
    if(descFornMatchSet && !descFornMatchSet.has(r[COL.DESC_FORN])) return false;
    if(nfTerm && !String(r[COL.NF]).includes(nfTerm)) return false;
    return true;
  });

  sortRows();
  currentPage = 1;
  renderResultCount();
  renderTotals();
  renderTable();
}

function sortRows(){
  filteredRows = filteredRows.slice().sort((a,b) => (a[sortKey] - b[sortKey]) * sortDir);
}

function renderResultCount(){
  document.getElementById('resultCount').textContent =
    fmtNum(filteredRows.length) + ' de ' + fmtNum(DATA.total_linhas) + ' linhas';
}

/* ===================== Tabela ===================== */
function renderTableHead(){
  const thead = document.querySelector('#detailTable thead');
  thead.innerHTML = '<tr>' + TABLE_COLUMNS.map(c => {
    let cls = c.num ? 'num' : '';
    if(c.sortKey === sortKey) cls += (sortDir === 1 ? ' sorted-asc' : ' sorted-desc');
    return `<th class="${cls}" data-sort="${c.sortKey}">${c.label}</th>`;
  }).join('') + '</tr>';
  thead.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const key = +th.dataset.sort;
      if(sortKey === key){ sortDir *= -1; } else { sortKey = key; sortDir = 1; }
      sortRows();
      currentPage = 1;
      renderTableHead();
      renderTable();
    });
  });
}

function totalPages(){
  return Math.max(1, Math.ceil(filteredRows.length / pageSize));
}

function renderTotals(){
  let totalQde = 0, totalValor = 0;
  for(let i = 0; i < filteredRows.length; i++){
    totalQde += filteredRows[i][COL.QDE];
    totalValor += filteredRows[i][COL.VALOR];
  }
  const tfoot = document.querySelector('#detailTable tfoot');
  tfoot.innerHTML = '<tr>' + TABLE_COLUMNS.map((c, i) => {
    if(i === 0) return `<td>TOTAL (${fmtNum(filteredRows.length)} linhas)</td>`;
    if(c.sortKey === COL.QDE) return `<td class="num">${fmtNum(totalQde)}</td>`;
    if(c.sortKey === COL.VALOR) return `<td class="num">${fmtBRL(totalValor)}</td>`;
    return '<td></td>';
  }).join('') + '</tr>';
}

function renderTable(){
  const start = (currentPage - 1) * pageSize;
  const pageRows = filteredRows.slice(start, start + pageSize);
  const tbody = document.querySelector('#detailTable tbody');
  tbody.innerHTML = pageRows.map(r => '<tr>' + TABLE_COLUMNS.map(c => {
    return `<td class="${c.num?'num':''}" title="${c.get(r)}">${c.get(r)}</td>`;
  }).join('') + '</tr>').join('') ||
    `<tr><td colspan="${TABLE_COLUMNS.length}" style="text-align:center;color:var(--text-faint);padding:24px;">Nenhuma linha encontrada com os filtros atuais.</td></tr>`;
  renderPagination();
  syncTopScroll();
}

/* ===================== Barra de rolagem horizontal superior (espelha a de baixo) ===================== */
const xWrap = document.getElementById('detailWrap');
const xTop = document.getElementById('detailXScroll');
const xTopInner = document.getElementById('detailXScrollInner');
function syncTopScroll(){
  const table = document.getElementById('detailTable');
  xTopInner.style.width = table.scrollWidth + 'px';
  // so aparece quando a tabela e' mais larga que a area visivel
  xTop.hidden = !(xWrap.scrollWidth > xWrap.clientWidth + 1);
}
xTop.addEventListener('scroll', () => { if(xWrap.scrollLeft !== xTop.scrollLeft) xWrap.scrollLeft = xTop.scrollLeft; });
xWrap.addEventListener('scroll', () => { if(xTop.scrollLeft !== xWrap.scrollLeft) xTop.scrollLeft = xWrap.scrollLeft; });
if(window.ResizeObserver){
  const ro = new ResizeObserver(syncTopScroll);
  ro.observe(xWrap);
  ro.observe(document.getElementById('detailTable'));
}
window.addEventListener('resize', syncTopScroll);

function renderPagination(){
  const tp = totalPages();
  document.getElementById('pageInfo').textContent =
    filteredRows.length ? `Mostrando ${((currentPage-1)*pageSize)+1}–${Math.min(currentPage*pageSize, filteredRows.length)} de ${fmtNum(filteredRows.length)}` : 'Nenhum resultado';
  document.getElementById('pageIndicator').textContent = `Página ${currentPage} de ${tp}`;
  document.getElementById('btnFirstPage').disabled = currentPage <= 1;
  document.getElementById('btnPrevPage').disabled = currentPage <= 1;
  document.getElementById('btnNextPage').disabled = currentPage >= tp;
  document.getElementById('btnLastPage').disabled = currentPage >= tp;
}

/* ===================== Eventos ===================== */
document.getElementById('fFornecedor').addEventListener('input', debounce(applyFilters, 250));
document.getElementById('fItem').addEventListener('input', debounce(applyFilters, 250));
document.getElementById('fDescForn').addEventListener('input', debounce(applyFilters, 250));
document.getElementById('fNF').addEventListener('input', debounce(applyFilters, 250));

document.getElementById('btnClearFilters').addEventListener('click', () => {
  dataFilter.clear(true);
  casaFilter.clear(true);
  grupoFilter.clear(true);
  segmentoFilter.clear(true);
  segRegFilter.clear(true);
  document.getElementById('fFornecedor').value = '';
  document.getElementById('fItem').value = '';
  document.getElementById('fDescForn').value = '';
  document.getElementById('fNF').value = '';
  applyFilters();
});

document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
  pageSize = +e.target.value;
  currentPage = 1;
  renderTable();
});
document.getElementById('btnFirstPage').addEventListener('click', () => { currentPage = 1; renderTable(); });
document.getElementById('btnPrevPage').addEventListener('click', () => { currentPage = Math.max(1, currentPage-1); renderTable(); });
document.getElementById('btnNextPage').addEventListener('click', () => { currentPage = Math.min(totalPages(), currentPage+1); renderTable(); });
document.getElementById('btnLastPage').addEventListener('click', () => { currentPage = totalPages(); renderTable(); });

/* ===================== Exportar Excel ===================== */
document.getElementById('btnExportExcel').addEventListener('click', () => {
  const btn = document.getElementById('btnExportExcel');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Gerando arquivo…';

  setTimeout(() => {
    try {
      const header = ['Casa','Data Emissão','Data Lançamento','Segmento','Grupo','Subgrupo','NF','Descrição do Item','Descrição Item Fornecedor','Fornecedor','UM','Qtde. Comprada','Preço Unitário','Valor Contábil'];
      const aoa = [header];
      let totalQdeExp = 0, totalValorExp = 0;
      filteredRows.forEach(r => {
        aoa.push([
          DATA.dict_casas[r[COL.CASA]],
          dayOffsetToDate(r[COL.EMISSAO]).toLocaleDateString('pt-BR'),
          dayOffsetToDate(r[COL.DIA]).toLocaleDateString('pt-BR'),
          DATA.dict_segmentos[r[COL.SEG]],
          DATA.dict_grupos[r[COL.GRUPO]],
          DATA.dict_subgrupos[r[COL.SUBGRUPO]],
          r[COL.NF],
          DATA.dict_itens[r[COL.ITEM]],
          DATA.dict_desc_item_fornecedor[r[COL.DESC_FORN]],
          DATA.dict_fornecedores[r[COL.FORN]],
          DATA.dict_uns[r[COL.UM]],
          r[COL.QDE],
          r[COL.PRECO_UNIT],
          r[COL.VALOR],
        ]);
        totalQdeExp += r[COL.QDE];
        totalValorExp += r[COL.VALOR];
      });
      aoa.push(['TOTAL','','','','','','','','','','', Math.round(totalQdeExp*100)/100, '', Math.round(totalValorExp*100)/100]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{wch:22},{wch:14},{wch:14},{wch:16},{wch:16},{wch:16},{wch:12},{wch:34},{wch:38},{wch:34},{wch:8},{wch:14},{wch:14},{wch:14}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Análise de Itens');
      const dataStr = new Date().toISOString().slice(0,10);
      XLSX.writeFile(wb, `analise_itens_${dataStr}.xlsx`);
    } catch(e){
      console.error('Erro ao exportar Excel:', e);
      alert('Não foi possível gerar o arquivo Excel. Tente reduzir os filtros e tentar novamente.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }, 30);
});

/* ===================== Historico de Precos =====================
   Filtros no padrao da Tabela Detalhada (Data de lancamento, Casa, Segmento e Segmento × Regiao — sem Grupo e NF) e busca
   de item. Os graficos so' aparecem com um item selecionado e sao calculados aqui, no navegador, a partir das linhas da
   base (DATA.rows): valem para qualquer item e respeitam os filtros.
   Regra de preco = a de build_data.py / unidade_referencia.py: so' entram no preco as linhas na UM de referencia do item
   e fora dos suspeitos. DATA.rows_preco tem uma posicao por linha: 0 = fora do preco; 1 = usa a Qtde da linha; outro
   valor = Qtde ajustada (caso claro convertido pela descricao). Preco medio do mes = soma do valor / soma da quantidade.
   O grafico de gasto usa TODAS as linhas do item no recorte (qualquer UM). */
const fmtBRLCompact = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', notation:'compact', maximumFractionDigits:1}).format(v);
const normTxt = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const ITEM_NORM = DATA.dict_itens.map(normTxt);
const N_ITENS = DATA.dict_itens.length;
const $h = (id) => document.getElementById(id);

/* Filtros de recorte (Data de lancamento, Casa, Segmento e Segmento × Regiao — o padrao da Tabela Detalhada, sem Grupo e NF),
   usados pelo Historico de Precos e por Precos por Geolocalizacao. `ids` = ids dos containers da aba; `onChange` roda a cada
   mudanca. Devolve os componentes e: linhaPassa() -> funcao (linha) => bool (E entre filtros, OU dentro de cada um) e
   limpar() -> zera todos sem disparar onChange. */
function criarFiltrosDeRecorte(ids, onChange){
  const casa = createDropdownFilter({containerId:ids.casa, labels:DATA.dict_casas, ariaLabel:'Casa', onChange});
  const segmento = createDropdownFilter({containerId:ids.segmento, labels:DATA.dict_segmentos, ariaLabel:'Segmento', onChange});
  const segReg = createDropdownFilter({containerId:ids.segReg, labels:DATA.dict_segmento_regiao || [], ariaLabel:'Segmento × Região', onChange});
  if(!(DATA.dict_segmento_regiao && DATA.dict_segmento_regiao.length)) document.getElementById(ids.segRegField).hidden = true;
  const data = createDateRangeFilter({containerId:ids.data, granularity:'day', minOff:0, maxOff:_maxDia,
    toDate:dayOffsetToDate, toOffset:offsetFromYMD, format:fmtDate, onChange});
  return {
    casa, segmento, segReg, data,
    linhaPassa(){
      const casaSet = casa.getSet(), segSet = segmento.getSet(), range = data.getRange();
      const casaOkSegReg = casaPassaSegReg(segReg);
      return (r) => {
        if(range && (r[COL.DIA] < range.start || r[COL.DIA] > range.end)) return false;
        if(casaSet && !casaSet.has(r[COL.CASA])) return false;
        if(segSet && !segSet.has(r[COL.SEG])) return false;
        if(casaOkSegReg && !casaOkSegReg[r[COL.CASA]]) return false;
        return true;
      };
    },
    limpar(){ data.clear(true); casa.clear(true); segmento.clear(true); segReg.clear(true); },
  };
}
const hFiltros = criarFiltrosDeRecorte({data:'hData', casa:'hCasa', segmento:'hSegmento', segReg:'hSegReg', segRegField:'hSegRegField'}, () => hOnFiltros());

let hItem = -1;            // item selecionado (indice em DATA.dict_itens); -1 = nenhum
let hValorItem = null;     // por item: valor comprado no recorte dos filtros
let hRegsItem = null;      // por item: linhas no recorte dos filtros
let hLinhasPorItem = null; // por item: indices das linhas (montado na primeira vez que um item e' aberto)
let chartItemPreco, chartItemGasto;
let H_ITEM_PADRAO = -1;    // item de maior valor comprado na base inteira: e' o item que a aba mostra ao abrir

function hLinhasDoItem(item){
  if(!hLinhasPorItem){
    hLinhasPorItem = DATA.dict_itens.map(() => []);
    for(let i = 0; i < DATA.rows.length; i++) hLinhasPorItem[DATA.rows[i][COL.ITEM]].push(i);
  }
  return hLinhasPorItem[item];
}

function hOnFiltros(){
  const passa = hFiltros.linhaPassa();
  hValorItem = new Float64Array(N_ITENS);
  hRegsItem = new Int32Array(N_ITENS);
  let linhas = 0;
  for(let i = 0; i < DATA.rows.length; i++){
    const r = DATA.rows[i];
    if(!passa(r)) continue;
    hValorItem[r[COL.ITEM]] += r[COL.VALOR];
    hRegsItem[r[COL.ITEM]]++;
    linhas++;
  }
  let itens = 0;
  for(let i = 0; i < N_ITENS; i++) if(hRegsItem[i]) itens++;
  $h('hResumoRecorte').textContent = fmtNum(itens) + ' itens com compras no recorte · ' + fmtNum(linhas) + ' linhas';
  if(!$h('hItemList').hidden) hAtualizaSugestoes();
  hRender();
}

/* ---------- Busca de item (sem maiusculas, acentos e espacos extras; so' itens com compras no recorte) ---------- */
const hInput = $h('hItemSearch'), hLista = $h('hItemList'), hBtnLimpaItem = $h('hItemClear');
let hAtivo = -1;
let hSugestoes = [];

function hAtualizaSugestoes(){
  const q = normTxt(hInput.value);
  let achadosNaBase = 0;
  const noRecorte = [];
  for(let i = 0; i < N_ITENS; i++){
    if(q && !ITEM_NORM[i].includes(q)) continue;
    achadosNaBase++;
    if(hRegsItem[i]) noRecorte.push(i);
  }
  noRecorte.sort((a, b) => hValorItem[b] - hValorItem[a]);
  hSugestoes = noRecorte.slice(0, 12);
  hAtivo = hSugestoes.length ? 0 : -1;
  hLista.innerHTML = '';
  if(!hSugestoes.length){
    const li = document.createElement('li');
    li.className = 'msg';
    li.textContent = !q ? 'Nenhum item com compras para os filtros selecionados'
      : (achadosNaBase ? (achadosNaBase === 1 ? 'Nenhuma compra deste item para os filtros selecionados' : 'Nenhuma compra destes itens para os filtros selecionados')
                       : 'Nenhum item encontrado na base');
    hLista.appendChild(li);
  }
  hSugestoes.forEach((idx, pos) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    if(pos === hAtivo) li.classList.add('ativo');
    const nome = document.createElement('span'); nome.textContent = DATA.dict_itens[idx];
    const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = fmtNum(hRegsItem[idx]) + ' compras';
    li.append(nome, meta);
    li.addEventListener('mousedown', (e) => { e.preventDefault(); hEscolheItem(idx); });
    hLista.appendChild(li);
  });
}
function hAbreLista(){ hAtualizaSugestoes(); hLista.hidden = false; hInput.setAttribute('aria-expanded', 'true'); }
function hFechaLista(){ hLista.hidden = true; hInput.setAttribute('aria-expanded', 'false'); }
function hMarcaAtivo(novo){
  const lis = hLista.querySelectorAll('li[role=option]');
  if(!lis.length) return;
  hAtivo = (novo + lis.length) % lis.length;
  lis.forEach((li, k) => li.classList.toggle('ativo', k === hAtivo));
  lis[hAtivo].scrollIntoView({block:'nearest'});
}
function hEscolheItem(idx){
  hItem = idx;
  hInput.value = DATA.dict_itens[idx];
  hBtnLimpaItem.hidden = false;
  hFechaLista();
  hRender();
}
function hLimpaItem(){
  hItem = -1;
  hInput.value = '';
  hBtnLimpaItem.hidden = true;
  hRender();
}
hInput.addEventListener('input', () => {
  hBtnLimpaItem.hidden = !hInput.value;
  if(hItem >= 0 && hInput.value !== DATA.dict_itens[hItem]){ hItem = -1; hRender(); }   // editou o texto: volta a pedir um item
  hAbreLista();
});
hInput.addEventListener('focus', hAbreLista);
hInput.addEventListener('keydown', (e) => {
  if(e.key === 'ArrowDown'){ e.preventDefault(); if(hLista.hidden) hAbreLista(); else hMarcaAtivo(hAtivo + 1); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); hMarcaAtivo(hAtivo - 1); }
  else if(e.key === 'Enter'){ if(!hLista.hidden && hSugestoes[hAtivo] !== undefined){ e.preventDefault(); hEscolheItem(hSugestoes[hAtivo]); } }
  else if(e.key === 'Escape'){ hFechaLista(); }
});
hInput.addEventListener('blur', hFechaLista);
hBtnLimpaItem.addEventListener('click', () => { hLimpaItem(); hInput.focus(); });
$h('hBtnClear').addEventListener('click', () => {
  hFiltros.limpar();
  hOnFiltros();
  hEscolheItem(H_ITEM_PADRAO);   // volta ao estado de abertura: sem filtros e com o item mais comprado
});

/* ---------- Graficos do item selecionado ---------- */
function hMesesVisiveis(){
  // sem filtro de data: todos os meses da base; com filtro: so' os meses que o intervalo toca
  const range = hFiltros.data.getRange();
  const idx = [];
  DATA.dict_meses.forEach((m, k) => {
    if(range){
      const [y, mm] = m.split('-').map(Number);
      const ini = offsetFromYMD(y, mm - 1, 1), fim = offsetFromYMD(y, mm, 0);
      if(fim < range.start || ini > range.end) return;
    }
    idx.push(k);
  });
  return idx;
}

function hRender(){
  const placeholder = $h('hPlaceholder'), vazio = $h('hEmpty'), graficos = $h('hCharts');
  const esconder = () => {
    graficos.hidden = true;
    if(chartItemPreco){ chartItemPreco.destroy(); chartItemPreco = null; }
    if(chartItemGasto){ chartItemGasto.destroy(); chartItemGasto = null; }
  };
  if(hItem < 0){ placeholder.hidden = false; vazio.hidden = true; esconder(); return; }
  if(!hRegsItem[hItem]){ placeholder.hidden = true; vazio.hidden = false; esconder(); return; }
  placeholder.hidden = true; vazio.hidden = true; graficos.hidden = false;

  // agregados mensais do item no recorte
  const passa = hFiltros.linhaPassa();
  const nm = DATA.dict_meses.length;
  const valor = new Float64Array(nm), pValor = new Float64Array(nm), pQde = new Float64Array(nm);
  let compras = 0, comprasPreco = 0;
  for(const i of hLinhasDoItem(hItem)){
    const r = DATA.rows[i];
    if(!passa(r)) continue;
    const m = r[COL.MES];
    valor[m] += r[COL.VALOR];
    compras++;
    const k = DATA.rows_preco[i];
    if(k){ pValor[m] += r[COL.VALOR]; pQde[m] += (k === 1 ? r[COL.QDE] : k); comprasPreco++; }
  }
  const meses = hMesesVisiveis();
  const labels = meses.map(k => DATA.dict_meses_labels[k]);
  const umIdx = DATA.um_ref_item[hItem];
  const um = umIdx >= 0 ? DATA.dict_uns[umIdx] : '';

  /* Historico de preco por item */
  if(chartItemPreco){ chartItemPreco.destroy(); chartItemPreco = null; }
  $h('itemUmRef').innerHTML = um ? `Unidade de referência: <b>${um}</b> · preço médio em R$ / ${um}` : '';
  $h('hPrecoBase').textContent = `${fmtNum(compras)} compras no recorte · ${fmtNum(comprasPreco)} na unidade de referência e fora dos suspeitos (usadas no preço)`;
  $h('hPrecoSub').textContent = DATA.dict_itens[hItem] + ' · evolução mensal do preço médio';
  const precos = meses.map(k => pQde[k] > 0 ? pValor[k] / pQde[k] : null);
  const temPreco = precos.some(v => v !== null);
  $h('hPrecoWrap').hidden = !temPreco;
  const vz = $h('hPrecoVazio');
  vz.hidden = temPreco;
  if(!temPreco) vz.textContent = um ? `Nenhuma compra deste item na unidade de referência (${um}) para os filtros selecionados — não há preço para exibir.`
                                    : 'Este item não tem compras com quantidade registrada — não há preço para exibir.';
  if(temPreco){
    chartItemPreco = new Chart($h('chartItemPreco'), {
      type:'line',
      data:{ labels, datasets:[{ data:precos, spanGaps:true, borderColor:'#0E6E6E', backgroundColor:'rgba(14,110,110,0.08)', fill:true, tension:.25, pointRadius:5, pointBackgroundColor:'#0E6E6E' }] },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}, tooltip:{callbacks:{label:(ctx)=>' Preço médio: '+fmtPrecoUM(ctx.parsed.y, um)}}},
        scales:{ y:{ticks:{callback:(v)=>fmtBRL(v)}, title:{display:!!um, text:'Preço médio (R$ / ' + um + ')'}, grid:{color:'#EEF0F3'}}, x:{grid:{display:false}} }
      }
    });
  }

  /* Evolucao do gasto por item */
  if(chartItemGasto){ chartItemGasto.destroy(); chartItemGasto = null; }
  const valores = meses.map(k => Math.round(valor[k] * 100) / 100);
  const total = valores.reduce((a, v) => a + v, 0);
  const pico = valores.reduce((best, v, k) => v > valores[best] ? k : best, 0);
  $h('gastoItemResumo').textContent = `Total no período: ${fmtBRL0(total)} · Pico: ${labels[pico]} (${fmtBRL0(valores[pico])})`;
  chartItemGasto = new Chart($h('chartItemGasto'), {
    type:'line',
    data:{
      labels,
      datasets:[{
        label:'Valor gasto',
        data: valores,
        borderColor:'#0E6E6E', backgroundColor:'rgba(14,110,110,0.08)', fill:true,
        borderWidth:2.5, tension:0, pointRadius:5, pointHoverRadius:7, pointBackgroundColor:'#0E6E6E',
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:(ctx)=>' Valor gasto: '+fmtBRL(ctx.parsed.y)}}
      },
      scales:{
        y:{beginAtZero:true, title:{display:true, text:'Valor gasto (R$)'}, ticks:{callback:(v)=>fmtBRLCompact(v)}, grid:{color:'#EEF0F3'}},
        x:{title:{display:true, text:'Mês/ano'}, grid:{display:false}}
      }
    }
  });
}

function renderDataQualityNote(){
  const u = DATA.unidade_referencia;
  if(!u) return;
  const pct = (v) => v.toFixed(1).replace('.', ',') + '%';
  const txt = `Preço unitário e unidade de medida: cada item usa uma única unidade de referência — a de maior valor comprado (desempate pelo nº de registros). ` +
    `${fmtNum(u.itens_multi_um)} dos ${fmtNum(u.itens)} itens foram comprados em mais de uma unidade; os registros nas demais unidades ` +
    `(${fmtNum(u.registros_fora_um)} registros, ${pct(u.valor_fora_um_pct)} do valor comprado) ficam fora das análises de preço, assim como ` +
    `${fmtNum(u.registros_suspeitos - u.registros_convertidos)} registros suspeitos que aguardam validação. ` +
    `Em ${fmtNum(u.registros_convertidos)} registros suspeitos (${fmtNum(u.itens_convertidos)} itens) a descrição do fornecedor traz um fator de embalagem claro e ` +
    `confirmado pelo preço do próprio item (ex.: "FD C/10", "5X5KG"); neles só a quantidade usada no preço foi ajustada. ` +
    `Valor total, quantidade e Curva ABC usam todos os registros, e a Tabela Detalhada mostra a base como vem do sistema.`;
  $h('dqBlock').style.display = 'block';
  $h('dqText').textContent = txt;
}

/* ===================== Curva ABC (antiga Inteligencia de Compras; sensivel ao filtro de periodo) ===================== */
let chartABCItens;
let currentPeriod = ['ALL'];

function classifyAbcJs(cumPct){
  if(cumPct <= 80) return 'A';
  if(cumPct <= 95) return 'B';
  return 'C';
}

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

initPeriodFilter({
  containerId: 'periodChips',
  months: DATA.months_order,
  monthLabels: monthLabels,
  onChange: (selected) => {
    currentPeriod = selected;
    renderInteligencia();
  },
});

function aggregateIntelPeriod(keys){
  const itemMap = new Map(); // item -> {item, grupo, valor_total}
  keys.forEach(k => {
    const intel = DATA.periods_intel[k];
    if(!intel) return;
    (intel.ranking_itens || []).forEach(r => {
      if(!itemMap.has(r.item)){
        itemMap.set(r.item, {item: r.item, grupo: r.grupo, valor_total: 0});
      }
      itemMap.get(r.item).valor_total += r.valor_total;
    });
  });

  const items = Array.from(itemMap.values()).sort((a,b) => b.valor_total - a.valor_total);
  const totalValor = items.reduce((a,r) => a + r.valor_total, 0);
  let acum = 0;
  items.forEach((r, i) => {
    r.rank = i + 1;
    r.part_pct = totalValor ? r.valor_total / totalValor : 0;
    acum += r.part_pct * 100;
    r.acum_pct = acum;
    r.classe = classifyAbcJs(acum);
  });

  const abc_curve_items = items.map(r => [r.rank, Math.round(r.acum_pct*100)/100, r.classe]);
  const abc_class_summary_items = ['A','B','C'].map(c => {
    const sub = items.filter(r => r.classe === c);
    return {classe: c, itens: sub.length, valor: Math.round(sub.reduce((a,r)=>a+r.valor_total,0)*100)/100};
  });
  const ranking_itens = items.map(r => ({
    rank: r.rank, item: r.item, grupo: r.grupo,
    valor_total: Math.round(r.valor_total*100)/100,
    part_pct: Math.round(r.part_pct*10000)/10000,
    classe: r.classe,
  }));

  return {abc_curve_items, abc_class_summary_items, ranking_itens};
}

function intelDataFor(keys){
  const isAll = keys.length === 1 && keys[0] === 'ALL';
  if(isAll) return DATA.periods_intel['ALL'];
  if(keys.length === 1) return DATA.periods_intel[keys[0]] || DATA.periods_intel['ALL'];
  return aggregateIntelPeriod(keys);
}

function renderInteligencia(){
  const intel = intelDataFor(currentPeriod);
  const periodLabel = periodLabelText(currentPeriod);
  const curve = intel.abc_curve_items;

  if(chartABCItens) chartABCItens.destroy();
  chartABCItens = new Chart(document.getElementById('chartABCItens'), {
    type:'line',
    data:{
      labels: curve.map(r => r[0]),
      datasets:[{ label:'% acumulado do valor', data: curve.map(r => r[1]), borderColor:'#0E6E6E', backgroundColor:'rgba(14,110,110,0.06)', fill:true, pointRadius:0, borderWidth:2 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{
        title:(items)=>'Rank #'+items[0].label,
        label:(ctx)=>{ const idx=ctx.dataIndex; return ['Acumulado: '+curve[idx][1].toFixed(1)+'%', 'Classe: '+curve[idx][2]]; }
      }}},
      scales:{
        y:{min:0,max:100, ticks:{callback:(v)=>v+'%'}, grid:{color:'#EEF0F3'}, title:{display:true,text:'% acumulado do valor'}},
        x:{ticks:{maxTicksLimit:12}, grid:{display:false}, title:{display:true,text:'Ranking de itens (1 = maior valor) — ' + periodLabel}}
      }
    }
  });

  const total = intel.abc_class_summary_items.reduce((a,d)=>a+d.valor,0);
  const cards = intel.abc_class_summary_items.map(d => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F0F1F3;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="pill pill-${d.classe}">Classe ${d.classe}</span>
        <span style="font-size:12.5px;color:var(--text-soft);">${fmtNum(d.itens)} itens</span>
      </div>
      <div style="text-align:right;">
        <div style="font-family:var(--mono);font-weight:700;">${fmtBRL0(d.valor)}</div>
        <div style="font-size:11px;color:var(--text-faint);">${total ? (100*d.valor/total).toFixed(1) : '0.0'}% do total</div>
      </div>
    </div>
  `).join('');
  document.getElementById('abcItemClassCards').innerHTML = '<div class="section-title" style="font-size:13px;">Resumo por classe — ' + periodLabel + '</div>' + cards;

  document.querySelector('#rankingItensTable tbody').innerHTML = intel.ranking_itens.slice(0,30).map(r => `
    <tr>
      <td>${r.rank}</td><td>${r.item}</td><td>${r.grupo}</td>
      <td class="num">${fmtBRL0(r.valor_total)}</td>
      <td class="num">${(r.part_pct*100).toFixed(2)}%</td>
      <td><span class="pill pill-${r.classe}">${r.classe}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-faint);padding:16px;">Sem itens no período selecionado.</td></tr>';
}

/* ===================== Preços por Geolocalização ===================== */
function cmcClass(v, min, max){
  if(v===null || v===undefined) return null;
  const range = max - min;
  if(range <= 0) return 'warn';
  const t = (v - min) / range;
  if(t < 0.34) return 'good';
  if(t < 0.67) return 'warn';
  return 'bad';
}

/* Heatmap de preco medio por regiao (SP/RJ/BR), calculado aqui, no navegador, com os filtros da aba (mesmo padrao do
   Historico de Precos). Para os GEO.top_n itens de maior valor comprado NO RECORTE, preco medio de cada regiao = soma do
   valor / soma da quantidade das linhas da casa-regiao (DATA.geo.casa_regiao, da base de CMC) que estao na UM de referencia
   do item e fora dos suspeitos (DATA.rows_preco, a mesma regra do Historico de Precos). Item com preco em so' uma regiao
   aparece, mas sem variacao (precisa de >= 2 regioes para comparar). */
const gFiltros = criarFiltrosDeRecorte({data:'gData', casa:'gCasa', segmento:'gSegmento', segReg:'gSegReg', segRegField:'gSegRegField'}, () => geoOnFiltros());
let geoView = null;

function geoOnFiltros(){
  const geo = DATA.geo;
  if(!geo){ geoView = null; renderGeoKpis(); renderGeoPriceTable(); return; }
  const passa = gFiltros.linhaPassa();
  const R = geo.regioes.length;
  const valorItem = new Float64Array(N_ITENS);
  const pValor = new Float64Array(N_ITENS * R), pQde = new Float64Array(N_ITENS * R);
  const casasVistas = new Set(), casasMapeadas = new Set();
  let linhas = 0, valorTotal = 0, valorMapeado = 0;
  for(let i = 0; i < DATA.rows.length; i++){
    const r = DATA.rows[i];
    if(!passa(r)) continue;
    const v = r[COL.VALOR], it = r[COL.ITEM], reg = geo.casa_regiao[r[COL.CASA]];
    linhas++; valorTotal += v; valorItem[it] += v;
    casasVistas.add(r[COL.CASA]);
    if(reg >= 0){
      valorMapeado += v; casasMapeadas.add(r[COL.CASA]);
      const k = DATA.rows_preco[i];
      if(k){ pValor[it * R + reg] += v; pQde[it * R + reg] += (k === 1 ? r[COL.QDE] : k); }
    }
  }
  const top = [];
  for(let i = 0; i < N_ITENS; i++) if(valorItem[i] > 0) top.push(i);
  top.sort((a, b) => valorItem[b] - valorItem[a]);
  top.length = Math.min(top.length, geo.top_n);

  const itens = [];
  top.forEach(it => {
    const precos = geo.regioes.map((_, g) => pQde[it * R + g] > 0 ? Math.round(pValor[it * R + g] / pQde[it * R + g] * 100) / 100 : null);
    const validos = precos.filter(p => p !== null);
    if(!validos.length) return;
    const min = Math.min(...validos), max = Math.max(...validos);
    itens.push({
      item: DATA.dict_itens[it], um: DATA.dict_uns[DATA.um_ref_item[it]] || '', multiUm: DATA.um_n_item[it] > 1,
      valor_total: Math.round(valorItem[it] * 100) / 100, precos,
      variacao_pct: validos.length >= 2 && min > 0 ? Math.round((max - min) / min * 1000) / 10 : null,
    });
  });
  geoView = {
    regioes: geo.regioes, itens, topN: top.length,
    comComparacao: itens.filter(x => x.variacao_pct !== null).length,
    multiUm: itens.filter(x => x.multiUm).length,
    cobertura: valorTotal > 0 ? 100 * valorMapeado / valorTotal : 0,
    casasMapeadas: casasMapeadas.size, casasTotal: casasVistas.size,
  };
  document.getElementById('gResumoRecorte').textContent = fmtNum(linhas) + ' linhas · ' + fmtNum(casasVistas.size) + ' casas no recorte';
  renderGeoKpis();
  renderGeoPriceTable();
}

function renderGeoKpis(){
  const g = geoView;
  const wrap = document.getElementById('geoKpiRow');
  if(!g){ wrap.innerHTML = ''; return; }
  const cards = [
    {label:'Itens analisados', value: fmtNum(g.itens.length) + ' de ' + fmtNum(g.topN), sub: fmtNum(g.comComparacao) + ' com comparação entre regiões'},
    {label:'Cobertura de valor', value: g.cobertura.toFixed(1).replace('.',',') + '%'},
    {label:'Casas mapeadas', value: fmtNum(g.casasMapeadas) + ' de ' + fmtNum(g.casasTotal)},
    {label:'Regiões comparadas', value: g.regioes.join(' · ')},
  ];
  wrap.innerHTML = cards.map(c => `
    <div class="kpi-card">
      <div class="label">${c.label}</div>
      <div class="value" style="font-size:18px;">${c.value}</div>
      ${c.sub ? `<div class="sub">${c.sub}</div>` : ''}
    </div>
  `).join('');
}

let geoPriceSort = 'valor';   // classificacao padrao: Maior valor comprado
let geoPriceSearchTerm = '';

function renderGeoPriceTable(){
  const g = geoView;
  const thead = document.querySelector('#geoPriceTable thead');
  const tbody = document.querySelector('#geoPriceTable tbody');
  const dqNote = document.getElementById('geoDqNote');

  if(!g){
    thead.innerHTML = '';
    tbody.innerHTML = '<tr><td style="padding:20px;text-align:center;color:var(--text-faint);">Base de CMC não disponível — sem dados de região para cruzar com os itens.</td></tr>';
    dqNote.style.display = 'none';
    return;
  }

  thead.innerHTML = '<tr><th>Item</th><th class="num">Valor comprado</th>' +
    g.regioes.map(r => `<th class="num">${r}</th>`).join('') +
    '<th class="num">Variação</th></tr>';

  let itens = g.itens;
  if(geoPriceSearchTerm) itens = itens.filter(it => normTxt(it.item).includes(normTxt(geoPriceSearchTerm)));

  itens = itens.slice().sort((a,b) => {
    if(geoPriceSort === 'valor') return b.valor_total - a.valor_total;
    if(geoPriceSort === 'nome') return a.item.localeCompare(b.item);
    // variacao (padrao): itens sem variacao calculavel vao pro final
    if(a.variacao_pct === null && b.variacao_pct === null) return b.valor_total - a.valor_total;
    if(a.variacao_pct === null) return 1;
    if(b.variacao_pct === null) return -1;
    return b.variacao_pct - a.variacao_pct;
  });

  tbody.innerHTML = itens.map(it => {
    const validos = it.precos.filter(p => p !== null);
    const min = Math.min(...validos), max = Math.max(...validos);
    const cells = it.precos.map(p => {
      if(p === null) return '<td class="price-empty">—</td>';
      const cls = cmcClass(p, min, max);
      const bg = cls==='good' ? 'var(--accent-soft)' : cls==='warn' ? 'var(--amber-soft)' : '#FBEAE6';
      const color = cls==='good' ? 'var(--accent-dark)' : cls==='warn' ? '#8A5A20' : 'var(--red)';
      return `<td class="price-cell" style="background:${bg};color:${color};">${fmtBRL(p)}<span class="um-suffix"> / ${it.um}</span></td>`;
    }).join('');
    const varLabel = it.variacao_pct === null ? '—' : ('+' + it.variacao_pct.toFixed(1).replace('.',',') + '%');
    return `<tr><td class="item-name" title="${it.item} (unidade de referência: ${it.um})">${it.item}</td><td class="num">${fmtBRL(it.valor_total)}</td>${cells}<td class="num" style="font-weight:700;">${varLabel}</td></tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-faint);padding:20px;">Nenhum item encontrado para os filtros selecionados.</td></tr>';

  dqNote.style.display = 'block';
  dqNote.innerHTML = `<b>Nota de qualidade de dado:</b> o preço de cada item é calculado só com os registros na sua unidade de referência (a de maior valor comprado), exibida ao lado do preço — ` +
    `${fmtNum(g.multiUm)} dos ${fmtNum(g.itens.length)} itens exibidos foram comprados em mais de uma unidade e usam apenas a de referência; registros marcados como suspeitos ficam de fora até a validação. ` +
    `Item com preço em uma região só aparece sem variação. A análise cobre ${g.cobertura.toFixed(1).replace('.',',')}% do valor comprado no recorte, já que ${g.casasTotal - g.casasMapeadas} ` +
    `casa(s) não puderam ser identificadas com segurança na base de regiões (nomes usados nas duas planilhas não batem exatamente).`;
}

document.getElementById('geoPriceSearch').addEventListener('input', (e) => {
  geoPriceSearchTerm = e.target.value;
  renderGeoPriceTable();
});
document.getElementById('gBtnClear').addEventListener('click', () => {
  gFiltros.limpar();
  document.getElementById('geoPriceSearch').value = '';
  geoPriceSearchTerm = '';
  geoOnFiltros();
});
document.getElementById('geoSortChips').querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('geoSortChips').querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    geoPriceSort = chip.dataset.sort;
    renderGeoPriceTable();
  });
});

/* ===================== Top Itens por Categoria =====================
   Categoria = GRUPO (a mesma "categoria" do modulo Categorias) e Subcategoria = SUBGRUPO. A subcategoria e' opcional e
   DEPENDE da categoria (o mesmo nome de subcategoria existe em varias categorias — ex.: QUEIJOS em 4): o filtro de
   subcategoria so' lista as da categoria escolhida. Os 10 itens de maior valor comprado no escopo (categoria ou
   categoria + subcategoria) e no periodo (Data de lancamento), somando TODAS as unidades de medida — a regra de unidade de
   referencia vale so' para preco unitario. A participacao (%) e' sobre o total do escopo no periodo (todos os itens).
   Calculado no navegador a partir de DATA.rows; os filtros sao o createDropdownFilter em modo de selecao unica. */
const tCategoria = createDropdownFilter({containerId:'tCat', labels:DATA.dict_grupos, ariaLabel:'Categoria', single:true,
  placeholder:'Selecione uma categoria', onChange: () => aoMudarCategoriaTop()});
const tSubcategoria = createDropdownFilter({containerId:'tSub', labels:[], ariaLabel:'Subcategoria', single:true,
  placeholder:'Escolha uma categoria primeiro', onChange: () => renderTopItens()});
const tData = createDateRangeFilter({containerId:'tData', granularity:'day', minOff:0, maxOff:_maxDia,
  toDate:dayOffsetToDate, toOffset:offsetFromYMD, format:fmtDate, onChange: () => renderTopItens()});
const TOP_N_CATEGORIA = 10;
const N_UMS = DATA.dict_uns.length;
const fmtQtd = (v) => new Intl.NumberFormat('pt-BR', {maximumFractionDigits:2}).format(v);
const fmtPct1 = (v) => v.toFixed(1).replace('.', ',') + '%';
let chartTopItens = null;

// subcategorias de cada categoria (indices de DATA.dict_subgrupos, em ordem alfabetica), vistas nas linhas da base
const SUBS_POR_GRUPO = DATA.dict_grupos.map(() => new Set());
for(let i = 0; i < DATA.rows.length; i++) SUBS_POR_GRUPO[DATA.rows[i][COL.GRUPO]].add(DATA.rows[i][COL.SUBGRUPO]);
SUBS_POR_GRUPO.forEach((set, g) => { SUBS_POR_GRUPO[g] = [...set].sort((a, b) => DATA.dict_subgrupos[a].localeCompare(DATA.dict_subgrupos[b])); });
let subsDaCategoria = [];   // subcategorias oferecidas agora (alinhadas com as opcoes do filtro)

function aoMudarCategoriaTop(){
  const cat = tCategoria.getValue();
  subsDaCategoria = cat < 0 ? [] : SUBS_POR_GRUPO[cat];
  tSubcategoria.setLabels(subsDaCategoria.map(i => DATA.dict_subgrupos[i]), cat < 0 ? 'Escolha uma categoria primeiro' : 'Todas as subcategorias');
  renderTopItens();
}

// quebra o nome do item em linhas curtas (rotulo do eixo), sem cortar nenhuma palavra
function quebraRotulo(txt, max){
  const linhas = []; let atual = '';
  String(txt).split(' ').forEach(p => {
    if(atual && (atual + ' ' + p).length > max){ linhas.push(atual); atual = p; }
    else atual = atual ? atual + ' ' + p : p;
  });
  if(atual) linhas.push(atual);
  return linhas;
}
// valor em R$ ao fim de cada barra (Chart.js nao traz rotulos de dados sem plugin)
const topItensRotulos = {
  id: 'topItensRotulos',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    ctx.save();
    ctx.font = '600 11.5px ' + Chart.defaults.font.family;
    ctx.fillStyle = '#121A2B';
    ctx.textBaseline = 'middle';
    chart.getDatasetMeta(0).data.forEach((barra, i) => ctx.fillText(fmtBRL0(chart.data.datasets[0].data[i]), barra.x + 6, barra.y));
    ctx.restore();
  }
};

function renderTopItens(){
  const placeholder = $h('tPlaceholder'), vazio = $h('tEmpty'), resultado = $h('tResultado');
  const cat = tCategoria.getValue();
  const subPos = tSubcategoria.getValue();
  const sub = subPos >= 0 ? subsDaCategoria[subPos] : -1;       // -1 = categoria inteira
  const escopo = sub >= 0 ? 'subcategoria' : 'categoria';
  $h('tColPart').textContent = 'Participação na ' + escopo;
  if(chartTopItens){ chartTopItens.destroy(); chartTopItens = null; }
  if(cat < 0){
    placeholder.hidden = false; vazio.hidden = true; resultado.hidden = true;
    $h('tResumoRecorte').textContent = '—';
    return;
  }
  const range = tData.getRange();
  const valor = new Float64Array(N_ITENS);
  const qtdUm = new Float64Array(N_ITENS * N_UMS);   // quantidade por item e unidade de medida
  let total = 0, linhas = 0;
  for(let i = 0; i < DATA.rows.length; i++){
    const r = DATA.rows[i];
    if(r[COL.GRUPO] !== cat) continue;
    if(sub >= 0 && r[COL.SUBGRUPO] !== sub) continue;
    if(range && (r[COL.DIA] < range.start || r[COL.DIA] > range.end)) continue;
    valor[r[COL.ITEM]] += r[COL.VALOR];
    qtdUm[r[COL.ITEM] * N_UMS + r[COL.UM]] += r[COL.QDE];
    total += r[COL.VALOR];
    linhas++;
  }
  const comCompra = [];
  for(let i = 0; i < N_ITENS; i++) if(valor[i] !== 0) comCompra.push(i);
  $h('tResumoRecorte').textContent = fmtNum(comCompra.length) + ' itens · ' + fmtNum(linhas) + ' linhas no recorte';
  if(!comCompra.length){
    placeholder.hidden = true; vazio.hidden = false; resultado.hidden = true;
    $h('tEmpty').textContent = 'Nenhuma compra nesta ' + escopo + ' para o período selecionado';
    return;
  }
  comCompra.sort((a, b) => valor[b] - valor[a] || DATA.dict_itens[a].localeCompare(DATA.dict_itens[b]));
  const top = comCompra.slice(0, TOP_N_CATEGORIA);
  const somaTop = top.reduce((a, i) => a + valor[i], 0);
  const nomeEscopo = DATA.dict_grupos[cat] + (sub >= 0 ? ' › ' + DATA.dict_subgrupos[sub] : '');

  placeholder.hidden = true; vazio.hidden = true; resultado.hidden = false;
  $h('tTitulo').textContent = `Top ${top.length} itens por valor comprado — ${nomeEscopo}`;
  $h('tSubtitulo').textContent = `Total da ${escopo} no período: ${fmtBRL0(total)} · ${fmtNum(comCompra.length)} itens com compras · o Top ${top.length} concentra ${fmtPct1(100 * somaTop / total)} do total`
    + (comCompra.length < TOP_N_CATEGORIA ? ` · a ${escopo} tem menos de ${TOP_N_CATEGORIA} itens no período` : '');

  // grafico de barras horizontais (maior valor no topo)
  chartTopItens = new Chart($h('chartTopItens'), {
    type:'bar',
    data:{ labels: top.map(i => quebraRotulo(DATA.dict_itens[i], 34)),
      datasets:[{ data: top.map(i => Math.round(valor[i] * 100) / 100), backgroundColor:'#0E6E6E', hoverBackgroundColor:'#0A5555', borderRadius:4, barPercentage:.78, categoryPercentage:.9 }] },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      layout:{padding:{right:92}},
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{
        title:(it) => DATA.dict_itens[top[it[0].dataIndex]],
        label:(ctx) => ` Valor comprado: ${fmtBRL(ctx.parsed.x)} (${fmtPct1(100 * ctx.parsed.x / total)} da ${escopo})`,
      }}},
      scales:{ x:{ beginAtZero:true, ticks:{callback:(v) => fmtBRLCompact(v)}, grid:{color:'#EEF0F3'} }, y:{ grid:{display:false}, ticks:{font:{size:11.5}} } }
    },
    plugins:[topItensRotulos],
  });

  // tabela: mesmos itens, na mesma ordem
  document.querySelector('#topItensTable tbody').innerHTML = top.map((it, pos) => {
    const refUm = DATA.um_ref_item[it];
    const ums = [];
    for(let u = 0; u < N_UMS; u++) if(qtdUm[it * N_UMS + u] !== 0) ums.push(u);
    ums.sort((a, b) => (b === refUm) - (a === refUm) || qtdUm[it * N_UMS + b] - qtdUm[it * N_UMS + a]);
    const qtd = ums.map(u => `${fmtQtd(qtdUm[it * N_UMS + u])} ${DATA.dict_uns[u]}`).join(' · ') || '—';
    return `<tr><td class="num">${pos + 1}</td><td>${DATA.dict_itens[it]}</td><td class="num">${fmtBRL(valor[it])}</td>`
      + `<td class="num">${fmtPct1(100 * valor[it] / total)}</td><td>${qtd}</td></tr>`;
  }).join('');
}
$h('tBtnClear').addEventListener('click', () => { tCategoria.clear(true); tData.clear(true); aoMudarCategoriaTop(); });

/* ===================== Init ===================== */
hOnFiltros();
{ // padrao ao abrir: graficos do item de maior valor comprado (hValorItem ainda esta sem filtros)
  let melhor = 0;
  for(let i = 1; i < N_ITENS; i++) if(hValorItem[i] > hValorItem[melhor]) melhor = i;
  H_ITEM_PADRAO = melhor;
  hEscolheItem(H_ITEM_PADRAO);
}
renderDataQualityNote();
renderInteligencia();
geoOnFiltros();
renderTopItens();
renderResultCount();
renderTableHead();
renderTotals();
renderTable();

} catch(err) {
  console.error('Erro ao montar o modulo de Analise de Itens:', err);
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="background:#C0442C;color:#fff;padding:14px 24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;">' +
    '<strong>Erro ao carregar o módulo:</strong> ' + (err && err.message ? err.message : err) +
    '</div>');
}

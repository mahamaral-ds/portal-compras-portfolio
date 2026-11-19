/*
 * Filtros compartilhados do portal (estilo "segmentador" do Power BI)
 * ------------------------------------------------------------------
 *  - createDropdownFilter({containerId, labels, ariaLabel, onChange, single, placeholder})
 *      Lista suspensa de selecao multipla: campo de uma linha com resumo ("Todos", o nome do item ou
 *      "Multiplas selecoes"), busca, "Selecionar tudo", checkboxes e limpar. Sem selecao (ou com tudo
 *      marcado) = sem filtro. API: getSet() (Set de indices ou null) e clear(silent).
 *      Com `single: true` vira de selecao UNICA: mesmo campo e busca, mas sem "Selecionar tudo", com botoes
 *      de opcao (um clique escolhe e fecha) e o resumo mostra `placeholder` (padrao "Todos") enquanto nada
 *      esta escolhido. Alem do getSet(), tem getValue() (indice escolhido ou -1).
 *      setLabels(novasOpcoes, novoPlaceholder) troca a lista de opcoes (limpa a escolha, sem disparar
 *      onChange) — para filtros que dependem de outro, como subcategoria x categoria.
 *  - createDateRangeFilter({containerId, minOff, maxOff, onChange, granularity, ...})
 *      Calendario de periodo (inicio e fim inclusivos, em portugues), por dia ou por mes.
 *      API: getRange() ({start, end} ou null) e clear(silent).
 *  - makePopover(...)  comportamento comum de abrir/fechar (clique fora, Esc, saida de foco).
 *
 * O container (div.dd-filter#id) e a <label id="<id>Label"> ficam no HTML da pagina; o estilo
 * vem de shared/portal-filters.css. Usado por Analise de Itens (Tabela Detalhada) e
 * Analise de Fornecedores (Itens por Fornecedor).
 */
(function(global){
'use strict';

// Comportamento comum de popover: abrir/fechar no botão, clique fora, Esc e saída de foco.
function makePopover({root, trigger, panel, onOpen, onClose}){
  function open(){
    root.classList.add('open');
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    // alinha o painel a direita quando nao cabe a esquerda da borda da janela
    root.classList.remove('align-right');
    if(panel.getBoundingClientRect().right > window.innerWidth - 8) root.classList.add('align-right');
    if(onOpen) onOpen();
  }
  function close(){
    if(panel.hidden) return;
    root.classList.remove('open');
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if(onClose) onClose();
  }
  trigger.addEventListener('click', () => panel.hidden ? open() : close());
  document.addEventListener('mousedown', (e) => { if(!root.contains(e.target)) close(); });
  root.addEventListener('focusout', (e) => { if(e.relatedTarget && !root.contains(e.relatedTarget)) close(); });
  root.addEventListener('keydown', (e) => { if(e.key === 'Escape'){ close(); trigger.focus(); } });
  return {open, close};
}

function createDropdownFilter({containerId, labels, ariaLabel, onChange, single = false, placeholder = 'Todos'}){
  const root = document.getElementById(containerId);
  const panelId = containerId + 'Panel';
  const selected = new Set();
  let term = '';

  root.innerHTML = `
    <div class="dd-field">
      <button type="button" class="dd-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="${panelId}" aria-labelledby="${containerId}Label ${containerId}Summary">
        <span class="dd-summary" id="${containerId}Summary">Todos</span>
      </button>
      <button type="button" class="dd-x" aria-label="Limpar seleção" title="Limpar seleção" hidden>&times;</button>
      <svg class="dd-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
    </div>
    <div class="dd-panel" id="${panelId}" hidden>
      <input type="search" class="dd-search" placeholder="Buscar..." aria-label="Buscar em ${ariaLabel}" autocomplete="off">
      <label class="dd-item dd-all"><input type="checkbox" class="dd-all-box"><span>Selecionar tudo</span></label>
      <div class="dd-list" role="group" aria-label="${ariaLabel}"></div>
      <div class="dd-foot"><span class="dd-count"></span><button type="button" class="dd-reset">Limpar seleção</button></div>
    </div>`;

  const trigger = root.querySelector('.dd-trigger');
  const summary = root.querySelector('.dd-summary');
  const xBtn = root.querySelector('.dd-x');
  const panel = root.querySelector('.dd-panel');
  const search = root.querySelector('.dd-search');
  const allBox = root.querySelector('.dd-all-box');
  const list = root.querySelector('.dd-list');
  const count = root.querySelector('.dd-count');
  const reset = root.querySelector('.dd-reset');

  const visibleIdx = () => {
    const out = [];
    labels.forEach((l, i) => { if(!term || l.toLowerCase().includes(term)) out.push(i); });
    return out;
  };
  const isAll = () => single ? selected.size === 0 : (selected.size === 0 || selected.size === labels.length);

  function renderSummary(){
    summary.textContent = single ? (selected.size ? labels[[...selected][0]] : placeholder)
      : (isAll() ? 'Todos' : (selected.size === 1 ? labels[[...selected][0]] : 'Múltiplas seleções'));
    root.classList.toggle('has-selection', !isAll());
    xBtn.hidden = selected.size === 0;
    reset.disabled = selected.size === 0;
    count.textContent = single ? labels.length + ' opções'
      : (isAll() ? labels.length + ' itens' : selected.size + ' de ' + labels.length + ' selecionados');
  }
  function renderAllBox(){
    if(single) return;
    const vis = visibleIdx();
    const nSel = vis.filter(i => selected.has(i)).length;
    allBox.checked = vis.length > 0 && nSel === vis.length;
    allBox.indeterminate = nSel > 0 && nSel < vis.length;
    allBox.parentElement.lastElementChild.textContent = term ? 'Selecionar tudo (resultados)' : 'Selecionar tudo';
  }
  function renderList(){
    const vis = visibleIdx();
    list.innerHTML = vis.map(i =>
      `<label class="dd-item"><input type="${single ? 'radio' : 'checkbox'}"${single ? ' name="' + containerId + 'Opt"' : ''} data-i="${i}"${selected.has(i) ? ' checked' : ''}><span title="${labels[i]}">${labels[i]}</span></label>`
    ).join('') || '<div class="dd-empty">Nenhum valor encontrado.</div>';
    renderAllBox();
  }
  function changed(){ renderSummary(); renderAllBox(); onChange(); }

  const popover = makePopover({
    root, trigger, panel,
    onOpen: () => search.focus(),
    onClose: () => { if(term){ term = ''; search.value = ''; renderList(); } },
  });
  if(single) root.querySelector('.dd-all').hidden = true;
  xBtn.addEventListener('click', () => api.clear());
  reset.addEventListener('click', () => api.clear());
  search.addEventListener('input', () => { term = search.value.trim().toLowerCase(); renderList(); });
  list.addEventListener('change', (e) => {
    const i = +e.target.dataset.i;
    if(single){ selected.clear(); selected.add(i); changed(); popover.close(); trigger.focus(); return; }
    if(e.target.checked) selected.add(i); else selected.delete(i);
    changed();
  });
  allBox.addEventListener('change', () => {
    visibleIdx().forEach(i => { if(allBox.checked) selected.add(i); else selected.delete(i); });
    renderList();
    changed();
  });

  const api = {
    // Set de indices selecionados, ou null quando nao ha filtro (nenhum ou todos marcados)
    getSet: () => isAll() ? null : new Set(selected),
    // modo single: indice escolhido, ou -1 quando nada esta escolhido
    getValue: () => selected.size ? [...selected][0] : -1,
    // troca as opcoes (e, se vier, o texto do estado vazio); limpa a escolha sem disparar onChange
    setLabels(novasOpcoes, novoPlaceholder){
      labels = novasOpcoes;
      if(novoPlaceholder !== undefined) placeholder = novoPlaceholder;
      selected.clear(); term = ''; search.value = '';
      renderList(); renderSummary();
    },
    // silent = true: limpa sem disparar onChange (quem chama refaz a filtragem uma unica vez)
    clear(silent){ selected.clear(); renderList(); renderSummary(); if(!silent) onChange(); },
  };
  renderList();
  renderSummary();
  return api;
}

/* ---------- Calendário de período ----------
   Trabalha em "posições" inteiras (offsets): em 'day', dias desde uma data-base; em 'month', o índice do
   mês na lista `months`. O intervalo é inclusivo nas duas pontas. Primeiro clique = início, segundo = fim
   (posições anteriores ao início ficam desabilitadas, então o fim nunca é menor que o início).

   Opções comuns: containerId, minOff, maxOff, onChange, granularity ('day' padrão | 'month').
   - granularity 'day'  : toDate(off) -> Date, toOffset(y, m, d) -> off, format(off) -> 'dd/mm/aaaa'.
   - granularity 'month': months (['YYYY-MM', ...] em ordem; off = índice), format(off) -> rótulo do mês. */
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_ABREV_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const DIAS_SEMANA_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function createDateRangeFilter(opts){
  const {containerId, minOff, maxOff, onChange, format} = opts;
  const isMonth = opts.granularity === 'month';
  const root = document.getElementById(containerId);
  const panelId = containerId + 'Panel';
  let start = null, end = null;      // periodo aplicado
  let pendStart = null;              // inicio escolhido, aguardando o fim
  let hover = null;
  let viewY, viewM;

  root.innerHTML = `
    <div class="dd-field">
      <button type="button" class="dd-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="${panelId}" aria-labelledby="${containerId}Label ${containerId}Summary">
        <span class="dd-summary" id="${containerId}Summary">Todo o período</span>
      </button>
      <button type="button" class="dd-x" aria-label="Limpar período" title="Limpar período" hidden>&times;</button>
      <svg class="dd-caret dd-cal-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path></svg>
    </div>
    <div class="dd-panel cal-panel" id="${panelId}" role="dialog" aria-label="Escolher período" hidden>
      <div class="cal-head">
        <button type="button" class="cal-nav" data-dir="-1" aria-label="${isMonth ? 'Ano anterior' : 'Mês anterior'}">&lsaquo;</button>
        <span class="cal-title" aria-live="polite"></span>
        <button type="button" class="cal-nav" data-dir="1" aria-label="${isMonth ? 'Próximo ano' : 'Próximo mês'}">&rsaquo;</button>
      </div>
      ${isMonth ? '' : `<div class="cal-dow">${DIAS_SEMANA_PT.map(d => `<span>${d}</span>`).join('')}</div>`}
      <div class="cal-grid${isMonth ? ' cal-grid-months' : ''}"></div>
      <div class="cal-hint"></div>
      <div class="dd-foot"><span class="dd-count"></span><button type="button" class="dd-reset">Limpar período</button></div>
    </div>`;

  const trigger = root.querySelector('.dd-trigger');
  const summary = root.querySelector('.dd-summary');
  const xBtn = root.querySelector('.dd-x');
  const panel = root.querySelector('.dd-panel');
  const title = root.querySelector('.cal-title');
  const grid = root.querySelector('.cal-grid');
  const hint = root.querySelector('.cal-hint');
  const reset = root.querySelector('.dd-reset');
  const count = root.querySelector('.dd-count');
  const navPrev = root.querySelector('.cal-nav[data-dir="-1"]');
  const navNext = root.querySelector('.cal-nav[data-dir="1"]');

  // "periodo" de navegacao: mes (granularidade dia) ou ano (granularidade mes)
  function ymOf(off){
    if(isMonth){ const [y, m] = opts.months[off].split('-').map(Number); return {y, m: m - 1}; }
    const d = opts.toDate(off);
    return {y: d.getFullYear(), m: d.getMonth()};
  }
  const minYM = ymOf(minOff), maxYM = ymOf(maxOff);
  const navIdx = (y, m) => isMonth ? y : y * 12 + m;
  const minIdx = navIdx(minYM.y, minYM.m), maxIdx = navIdx(maxYM.y, maxYM.m);

  function renderSummary(){
    if(pendStart !== null) summary.textContent = format(pendStart) + ' – …';
    else if(start !== null) summary.textContent = format(start) + ' – ' + format(end);
    else summary.textContent = 'Todo o período';
    root.classList.toggle('has-selection', start !== null);
    xBtn.hidden = start === null && pendStart === null;
    reset.disabled = start === null && pendStart === null;
    const n = end - start + 1;
    const unit = isMonth ? (n === 1 ? ' mês' : ' meses') : (n === 1 ? ' dia' : ' dias');
    count.textContent = (start !== null && pendStart === null) ? n + unit : '';
    hint.textContent = pendStart !== null
      ? (isMonth ? 'Agora escolha o mês final (ou o mesmo mês para um único mês).' : 'Agora escolha a data de fim (ou o mesmo dia para um único dia).')
      : (isMonth ? 'Escolha o mês inicial e depois o final.' : 'Escolha a data de início e depois a de fim.');
  }

  function paint(){
    const a = pendStart !== null ? pendStart : start;
    let b = pendStart !== null ? hover : end;
    if(pendStart !== null && (b === null || b < pendStart)) b = null;
    grid.querySelectorAll('.cal-cell').forEach(btn => {
      const off = +btn.dataset.off;
      btn.classList.toggle('is-start', a !== null && off === a);
      btn.classList.toggle('is-end', b !== null && off === b);
      btn.classList.toggle('in-range', a !== null && b !== null && off > a && off < b);
      btn.setAttribute('aria-pressed', (a !== null && off === a) || (b !== null && off === b));
    });
  }

  function isDisabled(off){
    return off < minOff || off > maxOff || (pendStart !== null && off < pendStart);
  }

  function renderView(){
    const idx = navIdx(viewY, viewM);
    navPrev.disabled = idx <= minIdx;
    navNext.disabled = idx >= maxIdx;
    let html = '';
    if(isMonth){
      title.textContent = String(viewY);
      for(let m = 0; m < 12; m++){
        const off = opts.months.indexOf(viewY + '-' + String(m + 1).padStart(2, '0'));
        const disabled = off < 0 || isDisabled(off);
        html += `<button type="button" class="cal-cell cal-month" data-off="${off}"${disabled ? ' disabled' : ''}>${MESES_ABREV_PT[m]}</button>`;
      }
    } else {
      title.textContent = MESES_PT[viewM] + ' de ' + viewY;
      const firstDow = new Date(viewY, viewM, 1).getDay();
      const days = new Date(viewY, viewM + 1, 0).getDate();
      html = '<span class="cal-blank"></span>'.repeat(firstDow);
      for(let d = 1; d <= days; d++){
        const off = opts.toOffset(viewY, viewM, d);
        html += `<button type="button" class="cal-cell cal-day" data-off="${off}"${isDisabled(off) ? ' disabled' : ''}>${d}</button>`;
      }
    }
    grid.innerHTML = html;
    paint();
  }

  function showViewOf(off){
    const {y, m} = ymOf(off);
    viewY = y; viewM = m;
  }

  const popover = makePopover({
    root, trigger, panel,
    onOpen: () => { showViewOf(start !== null ? start : maxOff); renderView(); renderSummary(); },
    onClose: () => { if(pendStart !== null){ pendStart = null; hover = null; renderSummary(); } },
  });

  root.querySelectorAll('.cal-nav').forEach(btn => btn.addEventListener('click', () => {
    const dir = +btn.dataset.dir;
    if(isMonth){ viewY += dir; }
    else {
      viewM += dir;
      if(viewM < 0){ viewM = 11; viewY--; } else if(viewM > 11){ viewM = 0; viewY++; }
    }
    renderView();
  }));
  grid.addEventListener('mouseover', (e) => {
    const b = e.target.closest('.cal-cell');
    if(!b || b.disabled || pendStart === null) return;
    hover = +b.dataset.off;
    paint();
  });
  grid.addEventListener('mouseleave', () => { if(pendStart !== null){ hover = null; paint(); } });
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.cal-cell');
    if(!b || b.disabled) return;
    const off = +b.dataset.off;
    if(pendStart === null){
      pendStart = off; hover = null;
      renderView(); renderSummary();
    } else {
      start = pendStart; end = off; pendStart = null; hover = null;
      renderSummary();
      popover.close();
      onChange();
    }
  });
  const clear = (silent) => {
    const had = start !== null;
    start = end = null; pendStart = null; hover = null;
    renderSummary();
    if(!panel.hidden) renderView();
    if(had && !silent) onChange();
  };
  xBtn.addEventListener('click', () => clear());
  reset.addEventListener('click', () => clear());

  renderSummary();
  return {
    // {start, end} (posicoes inclusivas) ou null quando nao ha periodo
    getRange: () => start === null ? null : {start, end},
    clear,
  };
}


global.makePopover = makePopover;
global.createDropdownFilter = createDropdownFilter;
global.createDateRangeFilter = createDateRangeFilter;
})(window);

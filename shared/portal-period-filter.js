/**
 * Componente compartilhado: filtro de período com seleção múltipla, estilo Power BI.
 * Clique normal seleciona só aquele item (comportamento exclusivo, igual antes);
 * Ctrl+clique (Cmd+clique no Mac) adiciona ou remove um mês da seleção atual, sem
 * afetar os demais já selecionados. "Todos os meses" é sempre exclusivo — clicar
 * nele (com ou sem Ctrl) sempre reseta a seleção para só ele.
 *
 * Uso, no dashboard.js do módulo (substitui o antigo IIFE `buildPeriodChips`):
 *
 *   let currentPeriod = ['ALL'];
 *   const periodFilter = initPeriodFilter({
 *     containerId: 'periodChips',
 *     months: DATA.months_order,
 *     monthLabels: DATA.month_labels,
 *     onChange: (selected) => { currentPeriod = selected; renderAll(); }
 *   });
 *
 * `selected` (e `currentPeriod`) é sempre um array não vazio de chaves — ou
 * `['ALL']`, ou uma ou mais chaves de mês (ex: `['2026-01','2026-03']`). Nunca
 * mistura 'ALL' com meses específicos. Passe esse array para a função de
 * agregação do módulo (ver `shared/portal-period-agg.js`).
 *
 * API retornada: { getSelected(), setSelected(keys), rebuild(months, monthLabels) }
 */
function initPeriodFilter(opts){
  const containerId = opts.containerId;
  const monthLabels = Object.assign({}, opts.monthLabels || {});
  const onChange = opts.onChange || function(){};
  const allKey = opts.allKey || 'ALL';
  const allLabel = opts.allLabel || 'Todos os meses';
  let months = opts.months || [];
  let selected = new Set([allKey]);

  const wrap = document.getElementById(containerId);
  if(!wrap){
    console.warn('initPeriodFilter: elemento #' + containerId + ' não encontrado.');
    return { getSelected:()=>[allKey], setSelected(){}, rebuild(){} };
  }

  function render(){
    const items = [{key:allKey, label:allLabel}].concat(months.map(m => ({key:m, label:monthLabels[m] || m})));
    wrap.innerHTML = items.map(o =>
      `<div class="period-chip ${selected.has(o.key)?'active':''}" data-period="${o.key}">${o.label}</div>`
    ).join('');
    wrap.querySelectorAll('.period-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if(wrap.style.pointerEvents === 'none') return;
        const key = chip.dataset.period;
        const multi = e.ctrlKey || e.metaKey;
        if(key === allKey){
          selected = new Set([allKey]);
        } else if(!multi){
          selected = new Set([key]);
        } else {
          selected.delete(allKey);
          if(selected.has(key)){
            selected.delete(key);
            if(selected.size === 0) selected = new Set([allKey]);
          } else {
            selected.add(key);
          }
        }
        render();
        onChange(Array.from(selected));
      });
    });
  }

  function getSelected(){ return Array.from(selected); }
  function setSelected(keys){
    selected = (keys && keys.length) ? new Set(keys) : new Set([allKey]);
    render();
  }
  function rebuild(newMonths, newMonthLabels){
    months = newMonths || months;
    if(newMonthLabels) Object.assign(monthLabels, newMonthLabels);
    render();
  }

  render();
  return { getSelected, setSelected, rebuild };
}

/**
 * Formata a legenda da seleção atual para exibição (ex: no cabeçalho, em "sub"
 * de KPI cards). Devolve `null` quando a seleção é 'ALL' ou um único mês — nesses
 * casos o chamador deve usar sua própria lógica existente (ex: mostrar o range
 * completo "Jan/26–Ago/26", ou o nome do único mês). Só entra em ação quando há
 * 2+ meses específicos selecionados ao mesmo tempo.
 *
 *   formatMultiPeriodLabel(['2026-01','2026-03'], DATA.month_labels)
 *     -> "Jan/26 + Mar/26"
 *   formatMultiPeriodLabel(['2026-01','2026-02','2026-03','2026-05'], DATA.month_labels)
 *     -> "4 meses selecionados"
 */
function formatMultiPeriodLabel(selectedKeys, monthLabels, allKey){
  allKey = allKey || 'ALL';
  if(!selectedKeys || selectedKeys.length <= 1 || (selectedKeys.length === 1 && selectedKeys[0] === allKey)){
    return null;
  }
  const labels = selectedKeys.map(k => (monthLabels && monthLabels[k]) || k);
  if(labels.length <= 3) return labels.join(' + ');
  return `${labels.length} meses selecionados`;
}

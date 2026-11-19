/**
 * Helpers genéricos para combinar, no cliente, dados de múltiplos meses já
 * pré-computados por build_data.py em `DATA.periods[mes]` — usados junto com
 * `shared/portal-period-filter.js` para dar suporte à seleção de vários meses
 * ao mesmo tempo (estilo Power BI) sem precisar de um backend real.
 *
 * Só funcionam corretamente sobre campos genuinamente ADITIVOS (contagens de
 * linha, somas de valor). Nunca aplique sobre campos de contagem única
 * (nunique), percentuais já calculados, ou "escolha do mês" (ex: fornecedor
 * principal) — cada build_data.py foi ajustado para expor, ao lado desses
 * campos "de exibição", os componentes aditivos equivalentes (ex: em vez de
 * só `fornecedores: 42`, também a lista `fornecedores_ativos: [...]`, cuja
 * união entre os meses selecionados dá a contagem correta).
 */

/** Soma um conjunto de campos numéricos de `periodsObj[key][subPath]` (ou de
 * `periodsObj[key]` direto, se `subPath` for omitido) para cada `key` em
 * `keys`, devolvendo um objeto plano só com os campos somados. */
function sumPeriodFields(periodsObj, keys, fields, subPath){
  const out = {};
  fields.forEach(f => { out[f] = 0; });
  keys.forEach(k => {
    const p = periodsObj[k];
    if(!p) return;
    const src = subPath ? p[subPath] : p;
    if(!src) return;
    fields.forEach(f => { out[f] += (typeof src[f] === 'number' ? src[f] : 0); });
  });
  return out;
}

/** União de conjuntos (nomes/ids) vindos de `periodsObj[key][listField]` para
 * cada `key` em `keys` — usado para recalcular contagens "únicas" (nunique)
 * corretamente entre vários meses (ex: quantos fornecedores distintos
 * compraram em Jan+Mar, sem contar duas vezes quem comprou nos dois). */
function unionPeriodSets(periodsObj, keys, listField){
  const set = new Set();
  keys.forEach(k => {
    const p = periodsObj[k];
    const list = p && p[listField];
    if(!list) return;
    list.forEach(v => set.add(v));
  });
  return set;
}

/** Mescla listas de "linhas" (ex: ranking de fornecedores) de vários meses,
 * somando os campos aditivos indicados em `sumFields` e mantendo os demais
 * campos (metadados não aditivos, ex: nome) do primeiro mês em que a
 * entidade aparece. `idField` identifica a entidade (ex: 'Fornecedor'). */
function mergePeriodRows(periodsObj, keys, listField, idField, sumFields){
  const merged = new Map();
  keys.forEach(k => {
    const p = periodsObj[k];
    const rows = p && p[listField];
    if(!rows) return;
    rows.forEach(row => {
      const id = row[idField];
      if(!merged.has(id)){
        const base = Object.assign({}, row);
        sumFields.forEach(f => { base[f] = 0; });
        merged.set(id, base);
      }
      const acc = merged.get(id);
      sumFields.forEach(f => { acc[f] += (typeof row[f] === 'number' ? row[f] : 0); });
    });
  });
  return Array.from(merged.values());
}

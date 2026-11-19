/*
 * Quantidade de pedidos (regra compartilhada)
 * -------------------------------------------
 * Pedido = combinacao DISTINTA de fornecedor + numero da NF (o mesmo criterio do card "Quantidade de Pedidos" de
 * Indicadores: so' o numero da NF nao basta, pois a numeracao e' sequencial por fornecedor). Cada pagina recebe do
 * seu build_data.py, por mes, os identificadores dos pedidos (`pedido_ids`) e o total do periodo completo.
 *
 *   contarPedidos(chaves, idsDoMes, totalGeral)
 *     chaves     : periodo selecionado — ['ALL'] ou um ou mais meses (ex: ['2026-01','2026-03'])
 *     idsDoMes   : funcao (mes) => array de identificadores de pedido daquele mes
 *     totalGeral : total de pedidos distintos de TODOS os meses
 *
 * Periodo completo ('ALL') usa o total geral; um ou mais meses usam a UNIAO dos identificadores de cada mes — nunca a
 * soma das contagens mensais, porque uma NF cujos itens foram lancados em meses diferentes e' o mesmo pedido e
 * contaria duas vezes.
 */
(function(global){
'use strict';

function contarPedidos(chaves, idsDoMes, totalGeral){
  if(chaves.length === 1 && chaves[0] === 'ALL') return totalGeral;
  const unicos = new Set();
  chaves.forEach(k => (idsDoMes(k) || []).forEach(id => unicos.add(id)));
  return unicos.size;
}

global.contarPedidos = contarPedidos;
})(window);

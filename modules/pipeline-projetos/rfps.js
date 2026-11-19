/* =====================================================================
   Pipeline de Projetos — abas da pagina + aba "Planejamento de RFPs"
   ---------------------------------------------------------------------
   Quadro de planejamento das rodadas de concorrencia por categoria (modelo "Concorrencia para itens A, B"):
   uma linha por categoria, uma coluna por mes da janela, e em cada mes um marco (circulo com o status) ou o
   resultado da rodada anterior (check verde + valor em R$ mil).

   Dados: rfps-data.js (const RFPS_DATA). Filtros: os componentes compartilhados de shared/portal-filters.js.

   EDICAO — igual a aba Projetos (dashboard.js): sem servidor. Os registros editados ficam no localStorage deste
   navegador (STORAGE_KEY_RFPS) e a edicao (incluir, editar, excluir) so' aparece depois de "Habilitar edicao"
   no cabecalho — a mesma senha de demonstracao e o mesmo desbloqueio da aba Projetos (UNLOCK_KEY / EDIT_PASSWORD).
   "Exportar para publicacao" baixa o rfps-data.js com os registros atuais: salve-o em modules/pipeline-projetos/
   (substituindo o anterior) para que ele vire o ponto de partida da aba.

   MODO_EDICAO: liga a edicao. Mantido em true nesta versao de demonstracao; com false nada de edicao e' criado
   (botao, formulario, modal) e nada e' lido nem gravado no navegador — mostra exatamente o rfps-data.js.
   ===================================================================== */
const MODO_EDICAO = true;
const STORAGE_KEY_RFPS = 'quintaluz_pipeline_rfps_v1';
const UNLOCK_KEY_RFPS = 'quintaluz_pipeline_edit_unlocked';   // o mesmo desbloqueio da aba Projetos

(function planejamentoRfps(){
'use strict';
try {

/* ===================== Utilidades ===================== */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtNum = (v) => new Intl.NumberFormat('pt-BR').format(v);
const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const STATUS = [
  {id:'planejado',    nome:'Planejado'},
  {id:'nao_iniciado', nome:'Não iniciado'},
  {id:'em_andamento', nome:'Em andamento'},
  {id:'concluido',    nome:'Concluído'},
  {id:'atrasado',     nome:'Atrasado'},
];
const STATUS_NOME = Object.fromEntries(STATUS.map(s => [s.id, s.nome]));
const STATUS_POS = Object.fromEntries(STATUS.map((s, i) => [s.id, i]));
const ETAPAS = {1:'Dados e início', 2:'Negociação', 3:'Aprovação'};
const SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';

/* ===================== Abas da pagina ===================== */
const botoesAba = document.querySelectorAll('#tabNav button');
function ativarAba(view){
  botoesAba.forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.body.dataset.aba = view;                            // o CSS esconde o "Exportar" do Kanban na aba de RFPs
  window.dispatchEvent(new Event('resize'));
}
botoesAba.forEach(b => b.addEventListener('click', () => ativarAba(b.dataset.view)));

/* ===================== Dados ===================== */
// Registros de partida: os do rfps-data.js (publicados). No desenvolvimento, o que foi editado neste navegador
// (localStorage) tem prioridade — igual a aba Projetos. Em producao nada e' lido do navegador.
function carregarDados(){
  const base = JSON.parse(JSON.stringify(RFPS_DATA));
  if(!MODO_EDICAO) return base;
  try{
    const raw = localStorage.getItem(STORAGE_KEY_RFPS);
    if(raw){
      const salvo = JSON.parse(raw);
      if(salvo && Array.isArray(salvo.registros) && salvo.janela && salvo.janela.inicio === base.janela.inicio && salvo.janela.meses === base.janela.meses){
        base.registros = salvo.registros;
        base.atualizado_em = salvo.atualizado_em || base.atualizado_em;
      }
    }
  }catch(e){ console.warn('Falha ao ler localStorage (RFPs), usando os dados publicados.', e); }
  return base;
}
const DATA = carregarDados();                                // copia de trabalho (a edicao altera esta copia)

// edicao liberada = modo de edicao do codigo + senha digitada na aba Projetos/cabecalho
function editando(){
  if(!MODO_EDICAO) return false;
  try{ return localStorage.getItem(UNLOCK_KEY_RFPS) === '1'; }catch(e){ return false; }
}

function mesesDaJanela(j){
  const [ano, mes] = j.inicio.split('-').map(Number);
  return Array.from({length: j.meses}, (_, i) => {
    const t = ano * 12 + (mes - 1) + i;
    return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0');
  });
}
const MESES = mesesDaJanela(DATA.janela);
const mesAbrev = (m) => MESES_ABREV[Number(m.slice(5, 7)) - 1];
const mesCurto = (m) => mesAbrev(m) + '/' + m.slice(2, 4);

// os itens de um registro (marcos + resultado) como lista unica, por mes
function itensDe(r){
  const lista = r.marcos.map(m => ({tipo:'marco', mes:m.mes, status:m.status, etapa:m.etapa}));
  if(r.resultado) lista.push({tipo:'resultado', mes:r.resultado.mes, valor_k:r.resultado.valor_k});
  return lista;
}

/* ===================== Icones ===================== */
function iconeStatus(status, mini){
  const cls = 'rfp-ic ic-' + status + (mini ? ' mini' : '');
  if(status === 'planejado') return `<span class="${cls}">${SVG_CHECK}</span>`;
  if(status === 'concluido') return `<span class="${cls}">${SVG_CHECK}</span>`;
  return `<span class="${cls}"></span>`;
}
function celulaHtml(it){
  if(it.tipo === 'resultado'){
    const t = `Resultado da rodada anterior · ${mesCurto(it.mes)} · R$ ${fmtNum(it.valor_k)} mil`;
    return `<div class="rfp-item" title="${esc(t)}"><span class="rfp-ic ic-resultado">${SVG_CHECK}</span><span class="rfp-valor">${fmtNum(it.valor_k)} k</span></div>`;
  }
  const t = `Marco · ${mesCurto(it.mes)} · ${STATUS_NOME[it.status]}` + (it.etapa ? ` · Etapa ${it.etapa} – ${ETAPAS[it.etapa]}` : '');
  return `<div class="rfp-item" title="${esc(t)}">${iconeStatus(it.status)}</div>`;
}

/* ===================== Legenda ===================== */
$('rfpLegenda').innerHTML =
  '<ul>' + Object.entries(ETAPAS).map(([n, nome]) => `<li><b>${n}</b> – ${nome}</li>`).join('') + '</ul>' +
  '<ul>' + STATUS.map(s => `<li>${iconeStatus(s.id, true)} ${s.nome}</li>`).join('') +
  `<li><span class="rfp-ic ic-resultado mini">${SVG_CHECK}</span> Resultado da rodada anterior (R$ mil)</li></ul>`;
$('rfpTitulo').textContent = DATA.titulo;

/* ===================== Filtros (componentes compartilhados do Portal) ===================== */
let catLabels = [];
const categoriasDoQuadro = () => [...new Set(DATA.registros.map(r => r.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
catLabels = categoriasDoQuadro();
const filtroCat = createDropdownFilter({containerId:'rfpFCat', labels:catLabels, ariaLabel:'Categoria', onChange: () => render()});
const filtroStatus = createDropdownFilter({containerId:'rfpFStatus', labels:STATUS.map(s => s.nome), ariaLabel:'Status do marco', onChange: () => render()});
const filtroPeriodo = createDateRangeFilter({containerId:'rfpFPeriodo', granularity:'month', minOff:0, maxOff:MESES.length - 1,
  months:MESES, format:(off) => mesCurto(MESES[off]), onChange: () => render()});
$('rfpLimpar').addEventListener('click', () => { filtroCat.clear(true); filtroStatus.clear(true); filtroPeriodo.clear(true); render(); });

// meses exibidos: so' os do Periodo escolhido (sem selecao = todos); as colunas do quadro acompanham o filtro
function mesesVisiveis(){
  const rg = filtroPeriodo.getRange();
  return rg ? MESES.slice(rg.start, rg.end + 1) : MESES;
}

function registrosVisiveis(){
  const sc = filtroCat.getSet(), ss = filtroStatus.getSet(), rg = filtroPeriodo.getRange();
  return DATA.registros.filter(r => {
    if(sc && !sc.has(catLabels.indexOf(r.categoria))) return false;
    if(ss && !r.marcos.some(m => ss.has(STATUS_POS[m.status]))) return false;
    if(rg && !itensDe(r).some(it => { const i = MESES.indexOf(it.mes); return i >= rg.start && i <= rg.end; })) return false;
    return true;
  });
}

/* ===================== Quadro ===================== */
const board = $('rfpBoard');
function render(){
  const lista = registrosVisiveis();
  const meses = mesesVisiveis();
  const edita = editando();
  // poucos meses (filtro de periodo curto): colunas de largura limitada, em vez de esticar um unico mes pela tela toda
  const larguraMes = meses.length < 8 ? 'minmax(54px, 120px)' : 'minmax(54px, 1fr)';
  board.style.gridTemplateColumns = '210px repeat(' + meses.length + ', ' + larguraMes + ')' + (edita ? ' 84px' : '');
  let html = '<div class="rfp-canto"></div>' +
    meses.map(m => `<div class="rfp-mes"><b>${mesAbrev(m)}</b><i>${m.slice(0, 4)}</i></div>`).join('') +
    (edita ? '<div class="rfp-canto"></div>' : '');
  if(!lista.length){
    html += `<div class="rfp-vazio">${DATA.registros.length ? 'Nenhum registro para os filtros selecionados.'
      : (edita ? 'Nenhum registro ainda. Use "Novo registro" para começar.' : 'Nenhum registro cadastrado.')}</div>`;
  }
  lista.forEach(r => {
    const porMes = Object.fromEntries(itensDe(r).map(it => [it.mes, it]));
    html += `<div class="rfp-cat"><span>${esc(r.categoria)}</span></div>`;
    html += meses.map(m => `<div class="rfp-cel">${porMes[m] ? celulaHtml(porMes[m]) : ''}</div>`).join('');
    if(edita){
      html += `<div class="rfp-cel rfp-acoes"><button type="button" class="rfp-ab" data-acao="editar" data-id="${esc(r.id)}" title="Editar" aria-label="Editar ${esc(r.categoria)}">` +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg></button>' +
        `<button type="button" class="rfp-ab rfp-ab-del" data-acao="excluir" data-id="${esc(r.id)}" title="Excluir" aria-label="Excluir ${esc(r.categoria)}">` +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path></svg></button></div>';
    }
  });
  board.innerHTML = html;
  $('rfpContagem').textContent = `${fmtNum(lista.length)} de ${fmtNum(DATA.registros.length)} registros`;
}

/* ===================== Edicao (so' no desenvolvimento, depois da senha) ===================== */
if(MODO_EDICAO){
  // botoes "Novo registro" e "Exportar para publicacao" (criados so' aqui — a producao nao tem estes botoes);
  // ficam ocultos ate a edicao ser habilitada
  $('rfpAcoes').innerHTML = '<button type="button" class="btn btn-primary btn-sm" id="rfpNovo" hidden>' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg> Novo registro</button>' +
    '<button type="button" class="btn btn-secondary btn-sm" id="rfpExportar" hidden title="Gera o arquivo rfps-data.js para publicar esta versão do planejamento para o time">Exportar para publicação</button>';

  // modais (formulario e confirmacao de exclusao), gerados so' no modo de edicao
  const opcoesMes = '<option value="">—</option>' + MESES.map(m => `<option value="${m}">${mesCurto(m)}</option>`).join('');
  const opcoesStatus = STATUS.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
  const opcoesEtapa = '<option value="">—</option>' + Object.entries(ETAPAS).map(([n, nome]) => `<option value="${n}">${n} – ${nome}</option>`).join('');
  const X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>';
  document.body.insertAdjacentHTML('beforeend', `
  <div class="modal-overlay" id="rfpModalForm" hidden>
    <div class="modal-panel rfp-modal">
      <div class="modal-head"><h3 id="rfpFormTitulo">Novo registro</h3><button class="modal-close" data-rfp-fechar type="button" aria-label="Fechar">${X}</button></div>
      <div class="modal-body">
        <form id="rfpForm" novalidate>
          <input type="hidden" id="rfpFId">
          <div class="form-grid">
            <div class="form-field full"><label for="rfpFCategoria">Categoria *</label>
              <input type="text" id="rfpFCategoria" maxlength="80" list="rfpListaCategorias" autocomplete="off" placeholder="Ex.: Peixaria">
              <datalist id="rfpListaCategorias"></datalist></div>
            <div class="form-field"><label for="rfpFResMes">Resultado da rodada anterior — mês</label><select id="rfpFResMes">${opcoesMes}</select></div>
            <div class="form-field"><label for="rfpFResValor">Valor (R$ mil)</label><input type="text" id="rfpFResValor" inputmode="decimal" placeholder="Ex.: 312"></div>
            <div class="form-field full">
              <label>Marcos da rodada <span class="form-hint" style="display:inline;">(um por mês, no máximo)</span></label>
              <div id="rfpMarcosLista"></div>
              <button type="button" class="btn btn-light btn-sm" id="rfpAddMarco" style="align-self:flex-start;margin-top:6px;">+ Adicionar marco</button>
            </div>
          </div>
          <div class="rfp-erros" id="rfpErros" role="alert" hidden></div>
        </form>
      </div>
      <div class="modal-foot"><button class="btn btn-light" data-rfp-fechar type="button">Cancelar</button><span class="spacer"></span>
        <button class="btn btn-primary" id="rfpSalvar" type="button">Salvar</button></div>
    </div>
  </div>
  <div class="modal-overlay" id="rfpModalExcluir" hidden>
    <div class="modal-panel modal-sm">
      <div class="modal-head"><h3>Excluir registro</h3><button class="modal-close" data-rfp-fechar type="button" aria-label="Fechar">${X}</button></div>
      <div class="modal-body"><p style="font-size:13px;color:var(--text-soft);margin:0;">Tem certeza que deseja excluir <b id="rfpExcluirNome"></b>? Essa ação não pode ser desfeita.</p>
        <div class="rfp-erros" id="rfpErrosExcluir" role="alert" hidden></div></div>
      <div class="modal-foot"><button class="btn btn-light" data-rfp-fechar type="button">Cancelar</button><span class="spacer"></span>
        <button class="btn btn-danger" id="rfpConfirmarExcluir" type="button">Excluir definitivamente</button></div>
    </div>
  </div>`);
  const modalForm = $('rfpModalForm'), modalExcluir = $('rfpModalExcluir');
  const abrir = (m) => { m.hidden = false; };
  const fechar = (m) => { m.hidden = true; };
  [modalForm, modalExcluir].forEach(m => {
    m.addEventListener('click', (e) => { if(e.target === m) fechar(m); });
    m.querySelectorAll('[data-rfp-fechar]').forEach(b => b.addEventListener('click', () => fechar(m)));
  });

  /* ---- gravacao (localStorage deste navegador, como a aba Projetos) ---- */
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function gravar(novosRegistros){
    const anterior = {registros: DATA.registros, atualizado_em: DATA.atualizado_em};
    DATA.registros = novosRegistros;
    DATA.atualizado_em = hoje();
    try{ localStorage.setItem(STORAGE_KEY_RFPS, JSON.stringify(DATA)); }
    catch(e){
      DATA.registros = anterior.registros; DATA.atualizado_em = anterior.atualizado_em;
      throw new Error('Não foi possível salvar: armazenamento local indisponível ou cheio.');
    }
    atualizarFiltroCategorias();
    render();
  }

  // gera o rfps-data.js com os registros atuais: salve-o em modules/pipeline-projetos/ e rode o script de publicacao
  $('rfpExportar').addEventListener('click', () => {
    const conteudo = '// Dados da aba "Planejamento de RFPs" (pagina Pipeline).\n' +
      '// Gerado pelo botão "Exportar para publicação" em ' + new Date().toLocaleString('pt-BR') + '.\n' +
      '// Salve este arquivo em modules/pipeline-projetos/ (substituindo o anterior).\n' +
      'const RFPS_DATA = ' + JSON.stringify({titulo: DATA.titulo, janela: DATA.janela, atualizado_em: DATA.atualizado_em, registros: DATA.registros}, null, 2) + ';\n';
    const url = URL.createObjectURL(new Blob([conteudo], {type: 'text/javascript;charset=utf-8'}));
    const a = document.createElement('a');
    a.href = url; a.download = 'rfps-data.js';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  function atualizarFiltroCategorias(){
    const novas = categoriasDoQuadro();
    if(novas.join('|') !== catLabels.join('|')){ catLabels = novas; filtroCat.setLabels(novas); }
    $('rfpListaCategorias').innerHTML = novas.map(c => `<option value="${esc(c)}">`).join('');
  }

  /* ---- formulario ---- */
  const lista = $('rfpMarcosLista');
  function linhaMarco(m){
    const div = document.createElement('div');
    div.className = 'rfp-marco-row';
    div.innerHTML = `<div class="form-field"><label>Mês *</label><select data-f="mes">${opcoesMes}</select></div>
      <div class="form-field"><label>Status</label><select data-f="status">${opcoesStatus}</select></div>
      <div class="form-field"><label>Etapa</label><select data-f="etapa">${opcoesEtapa}</select></div>
      <button type="button" class="rfp-ab rfp-ab-del" data-remover title="Remover marco" aria-label="Remover marco">${X}</button>`;
    if(m){
      div.querySelector('[data-f=mes]').value = m.mes;
      div.querySelector('[data-f=status]').value = m.status;
      div.querySelector('[data-f=etapa]').value = m.etapa ? String(m.etapa) : '';
    }
    div.querySelector('[data-remover]').addEventListener('click', () => div.remove());
    lista.appendChild(div);
  }
  $('rfpAddMarco').addEventListener('click', () => { if(lista.children.length < 24) linhaMarco(null); });

  function abrirFormulario(id){
    const reg = id ? DATA.registros.find(r => r.id === id) : null;
    $('rfpFormTitulo').textContent = reg ? 'Editar registro' : 'Novo registro';
    $('rfpFId').value = reg ? reg.id : '';
    $('rfpFCategoria').value = reg ? reg.categoria : '';
    $('rfpFResMes').value = reg && reg.resultado ? reg.resultado.mes : '';
    $('rfpFResValor').value = reg && reg.resultado ? String(reg.resultado.valor_k).replace('.', ',') : '';
    lista.innerHTML = '';
    (reg ? reg.marcos : [null]).forEach(m => linhaMarco(m));
    $('rfpErros').hidden = true;
    abrir(modalForm);
    $('rfpFCategoria').focus();
  }

  // le e valida o formulario antes de gravar
  function lerFormulario(){
    const erros = [];
    const id = $('rfpFId').value;
    const categoria = $('rfpFCategoria').value.trim();
    if(!categoria) erros.push('Informe a categoria.');
    else if(categoria.length > 80) erros.push('A categoria pode ter até 80 caracteres.');
    else if(DATA.registros.some(r => r.id !== id && r.categoria.toLowerCase() === categoria.toLowerCase())) erros.push('Já existe um registro para essa categoria — edite o existente.');

    const resMes = $('rfpFResMes').value, resTxt = $('rfpFResValor').value.trim().replace(/\./g, '').replace(',', '.');
    let resultado = null;
    if(resMes || resTxt){
      const v = Number(resTxt);
      if(!resMes) erros.push('Escolha o mês do resultado da rodada anterior.');
      if(resTxt === '' || !isFinite(v) || v < 0) erros.push('O valor do resultado deve ser um número maior ou igual a zero (em R$ mil).');
      else if(resMes) resultado = {mes: resMes, valor_k: v};
    }
    const marcos = [];
    lista.querySelectorAll('.rfp-marco-row').forEach((row, i) => {
      const mes = row.querySelector('[data-f=mes]').value;
      if(!mes){ erros.push(`Marco ${i + 1}: escolha o mês (ou remova a linha).`); return; }
      const et = row.querySelector('[data-f=etapa]').value;
      marcos.push({mes, status: row.querySelector('[data-f=status]').value, etapa: et ? Number(et) : null});
    });
    const usados = marcos.map(m => m.mes).concat(resultado ? [resultado.mes] : []);
    const repetido = usados.find((m, i) => usados.indexOf(m) !== i);
    if(repetido) erros.push(`Há mais de um item em ${mesCurto(repetido)} — cada mês comporta um só.`);
    if(!marcos.length && !resultado && !erros.length) erros.push('Informe pelo menos um marco ou o resultado da rodada anterior.');
    marcos.sort((a, b) => a.mes.localeCompare(b.mes));
    return {erros, registro: {id: id || ('rfp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), categoria, resultado, marcos}};
  }
  const mostrarErros = (el, msgs) => { el.innerHTML = '<ul>' + msgs.map(m => `<li>${esc(m)}</li>`).join('') + '</ul>'; el.hidden = false; };

  $('rfpSalvar').addEventListener('click', () => {
    const {erros, registro} = lerFormulario();
    if(erros.length){ mostrarErros($('rfpErros'), erros); return; }
    const existe = DATA.registros.some(r => r.id === registro.id);
    const novos = existe ? DATA.registros.map(r => r.id === registro.id ? registro : r) : DATA.registros.concat([registro]);
    try{ gravar(novos); fechar(modalForm); }
    catch(e){ mostrarErros($('rfpErros'), [e.message]); }
  });

  /* ---- exclusao (com confirmacao) ---- */
  let excluirId = null;
  function pedirExclusao(id){
    const reg = DATA.registros.find(r => r.id === id);
    if(!reg) return;
    excluirId = id;
    $('rfpExcluirNome').textContent = reg.categoria;
    $('rfpErrosExcluir').hidden = true;
    abrir(modalExcluir);
  }
  $('rfpConfirmarExcluir').addEventListener('click', () => {
    try{ gravar(DATA.registros.filter(r => r.id !== excluirId)); fechar(modalExcluir); }
    catch(e){ mostrarErros($('rfpErrosExcluir'), [e.message]); }
  });

  /* ---- acoes do quadro ---- */
  $('rfpNovo').addEventListener('click', () => abrirFormulario(null));
  board.addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if(!b || b.disabled) return;
    if(b.dataset.acao === 'editar') abrirFormulario(b.dataset.id); else pedirExclusao(b.dataset.id);
  });

  /* ---- habilitar/bloquear edicao: o botao e a senha sao os da aba Projetos (dashboard.js roda antes e ja
         atualizou o estado quando estes ouvintes disparam) ---- */
  function aplicarEdicao(){
    const e = editando();
    $('rfpNovo').hidden = !e;
    $('rfpExportar').hidden = !e;
    if(!e){ [modalForm, modalExcluir].forEach(fechar); }
    render();
  }
  ['btnToggleLock', 'btnConfirmarSenha'].forEach(id => { const el = document.getElementById(id); if(el) el.addEventListener('click', aplicarEdicao); });
  window.addEventListener('storage', aplicarEdicao);
  aplicarEdicao();
  atualizarFiltroCategorias();
}

render();

} catch(err) {
  console.error('Erro ao montar o Planejamento de RFPs:', err);
  const box = document.getElementById('rfpBoard');
  if(box) box.innerHTML = '<div class="rfp-vazio">Não foi possível montar o quadro (' + (err && err.message ? err.message : err) + ').</div>';
}
})();

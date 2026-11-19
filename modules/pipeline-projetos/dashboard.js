try {

/* =====================================================================
   Pipeline de Projetos
   - Sem servidor/backend: os projetos ficam salvos no localStorage deste
     navegador (chave STORAGE_KEY). Cada pessoa que abrir a pagina ve os
     12 projetos iniciais (ficticios); edicoes feitas aqui NAO sincronizam
     para outros navegadores/pessoas.
   - "Modo de edicao": os botoes de Adicionar/Editar/Excluir ficam ocultos
     ate a senha ser digitada (EDIT_PASSWORD). Nesta versao de demonstracao
     a senha e' "demo" e aparece na propria janela de desbloqueio: e' so'
     para mostrar o fluxo, nao uma trava de seguranca.
   ===================================================================== */

const STORAGE_KEY = 'quintaluz_pipeline_projetos_v1';
const UNLOCK_KEY = 'quintaluz_pipeline_edit_unlocked';
const EDIT_PASSWORD = 'demo';   // senha de DEMONSTRACAO, exibida na propria janela de desbloqueio

/* Modo somente leitura: com `true` a página vira só visualização — sem senha, sem botões de edição, sem ler nem gravar
   o navegador — e mostra exatamente os projetos de projetos-publicados.js. Na demonstração fica `false` (edição ligada). */
const SOMENTE_LEITURA = false;

const STATUSES = ['Planejado', 'Em andamento', 'Em validação', 'Concluído'];

// Lista fixa de responsáveis selecionáveis (filtro e formulário). Um projeto
// pode ter mais de uma pessoa/time responsável (ex.: "Ana Paula" e "Bruno" no
// mesmo projeto) — por isso `responsavel` é sempre um array de valores desta
// lista, nunca texto livre.
const RESPONSAVEIS = ['Compradores', 'Compras e Dados', 'Ana Paula', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Gabriel'];
const COL_IDS = {
  'Planejado': 'colPlanejado',
  'Em andamento': 'colEmAndamento',
  'Em validação': 'colEmValidacao',
  'Concluído': 'colConcluido',
};
const COUNT_IDS = {
  'Planejado': 'countPlanejado',
  'Em andamento': 'countEmAndamento',
  'Em validação': 'countEmValidacao',
  'Concluído': 'countConcluido',
};

/* =====================================================================
   Dados iniciais — projetos FICTICIOS do Grupo Quintaluz (versao de
   demonstracao). Status, etapas, datas e savings foram escritos para o
   portfolio e servem de exemplo para todos os filtros e colunas do Kanban.
   ===================================================================== */
const SEED_PROJECTS = [
  {
    nome: 'RFP de embalagens de delivery',
    descricao: 'Padronizar tamanhos entre as marcas e cotar o volume do grupo com 5 fornecedores da lista curta.',
    responsavel: ['Elisa', 'Diego'],
    area: '',
    status: 'Planejado',
    etapa: 'RFP e prospecção',
    prioridade: 'Alta',
    dataInicio: '2026-11-03',
    dataPrevisao: '2027-01-29',
    percentualConclusao: 0,
    saving: 'R$ 48.000 – Potencial',
    ultimaAtualizacao: '2026-10-15',
    observacoes: '',
  },
  {
    nome: 'Consolidação da mercearia seca',
    descricao: 'Concentrar grãos, massas e conservas em dois atacadistas com tabela única para todas as casas.',
    responsavel: ['Diego'],
    area: '',
    status: 'Planejado',
    etapa: 'RFP e prospecção',
    prioridade: 'Média',
    dataInicio: '',
    dataPrevisao: '2027-02-26',
    percentualConclusao: 0,
    saving: 'R$ 62.000 – Potencial',
    ultimaAtualizacao: '2026-10-10',
    observacoes: '',
  },
  {
    nome: 'Contrato anual de cortes bovinos',
    descricao: 'Negociar preço com reajuste atrelado ao índice da arroba para picanha, contrafilé e fraldinha.',
    responsavel: ['Ana Paula', 'Bruno'],
    area: '',
    status: 'Em andamento',
    etapa: 'Negociações',
    prioridade: 'Alta',
    dataInicio: '2026-09-01',
    dataPrevisao: '2026-11-30',
    percentualConclusao: 55,
    saving: 'R$ 210.000 – Potencial',
    ultimaAtualizacao: '2026-10-18',
    observacoes: '',
  },
  {
    nome: 'Chopp em barril para os bares',
    descricao: 'Trocar long neck por chopp em barril nas casas de maior giro do Boteco Quintal.',
    responsavel: ['Gabriel'],
    area: '',
    status: 'Em andamento',
    etapa: 'Avaliação operacional',
    prioridade: 'Média',
    dataInicio: '2026-08-15',
    dataPrevisao: '2026-12-15',
    percentualConclusao: 40,
    saving: 'R$ 95.000 – Potencial',
    ultimaAtualizacao: '2026-10-08',
    observacoes: '',
  },
  {
    nome: 'Hortifrúti regional fora das capitais',
    descricao: 'Desenvolver produtores locais para as casas de Serra Alta, Porto Claro e Lagoa Bela.',
    responsavel: ['Carla'],
    area: '',
    status: 'Em andamento',
    etapa: 'Prospecção de fornecedores',
    prioridade: 'Média',
    dataInicio: '2026-09-10',
    dataPrevisao: '2027-01-15',
    percentualConclusao: 30,
    saving: 'R$ 36.000 – Potencial',
    ultimaAtualizacao: '2026-10-12',
    observacoes: '',
  },
  {
    nome: 'Porcionamento de proteínas na central',
    descricao: 'Receber peças inteiras na central de produção e porcionar para as casas, reduzindo perdas.',
    responsavel: ['Bruno', 'Compras e Dados'],
    area: '',
    status: 'Em validação',
    etapa: 'Piloto em 3 casas',
    prioridade: 'Alta',
    dataInicio: '2026-06-01',
    dataPrevisao: '2026-10-31',
    percentualConclusao: 80,
    saving: 'R$ 140.000 – Potencial',
    ultimaAtualizacao: '2026-10-20',
    observacoes: '',
  },
  {
    nome: 'Revisão de fornecedores de pescados',
    descricao: 'Rever a base de pescados com foco em OTIF e rastreabilidade para a marca Maré Quintaluz.',
    responsavel: ['Ana Paula'],
    area: '',
    status: 'Em validação',
    etapa: 'Introdução nas casas',
    prioridade: 'Média',
    dataInicio: '2026-07-01',
    dataPrevisao: '2026-11-15',
    percentualConclusao: 70,
    saving: 'R$ 28.000 – Potencial',
    ultimaAtualizacao: '2026-10-05',
    observacoes: '',
  },
  {
    nome: 'Café em grãos com torrefação única',
    descricao: 'Unificar o blend das cafeterias em uma torrefação, com treinamento de baristas incluso.',
    responsavel: ['Elisa'],
    area: '',
    status: 'Concluído',
    etapa: 'Realizado',
    prioridade: 'Média',
    dataInicio: '2026-03-02',
    dataPrevisao: '2026-06-30',
    percentualConclusao: 100,
    saving: 'R$ 31.000 – Real',
    ultimaAtualizacao: '2026-07-03',
    observacoes: '',
  },
  {
    nome: 'Laticínios: troca de mussarela',
    descricao: 'Homologar nova mussarela com rendimento igual e preço 8% menor.',
    responsavel: ['Carla', 'Diego'],
    area: '',
    status: 'Concluído',
    etapa: 'Realizado',
    prioridade: 'Média',
    dataInicio: '2026-02-10',
    dataPrevisao: '2026-05-29',
    percentualConclusao: 100,
    saving: 'R$ 44.000 – Real',
    ultimaAtualizacao: '2026-06-02',
    observacoes: '',
  },
  {
    nome: 'Azeite com preço travado',
    descricao: 'Contrato semestral de azeite extra virgem com preço fixo e entrega mensal.',
    responsavel: ['Diego'],
    area: '',
    status: 'Concluído',
    etapa: 'Realizado',
    prioridade: 'Baixa',
    dataInicio: '2026-01-12',
    dataPrevisao: '2026-03-31',
    percentualConclusao: 100,
    saving: 'R$ 18.000 – Real',
    ultimaAtualizacao: '2026-04-06',
    observacoes: '',
  },
  {
    nome: 'Painel de preços por unidade de referência',
    descricao: 'Usar a Análise de Itens para comparar preço por kg/litro entre casas e fornecedores toda semana.',
    responsavel: ['Compras e Dados'],
    area: '',
    status: 'Concluído',
    etapa: 'Realizado',
    prioridade: 'Média',
    dataInicio: '2026-04-01',
    dataPrevisao: '2026-08-31',
    percentualConclusao: 100,
    saving: 'Ganho de processo',
    ultimaAtualizacao: '2026-09-02',
    observacoes: '',
  },
  {
    nome: 'Mapa de fornecedores por região',
    descricao: 'Cruzar UF dos fornecedores com as regiões das casas para encontrar alternativas locais.',
    responsavel: ['Compras e Dados'],
    area: '',
    status: 'Planejado',
    etapa: 'Análise',
    prioridade: 'Baixa',
    dataInicio: '',
    dataPrevisao: '',
    percentualConclusao: 0,
    saving: 'R$ em análise',
    ultimaAtualizacao: '2026-10-01',
    observacoes: '',
  },
];

/* ===================== Storage ===================== */
// Normaliza `responsavel` para array (compatibilidade com dados salvos antes
// da mudança de texto livre -> lista fixa de responsáveis).
function normalizeResponsavel(p){
  if(Array.isArray(p.responsavel)) return p;
  const raw = p.responsavel || '';
  return Object.assign({}, p, { responsavel: raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [] });
}

// Projetos de partida: os "publicados" (projetos-publicados.js, gerado pelo botão "Exportar para publicação")
// ou, se esse arquivo estiver vazio, os projetos iniciais do código.
function projetosDePartida(){
  if(typeof PROJETOS_PUBLICADOS !== 'undefined' && Array.isArray(PROJETOS_PUBLICADOS) && PROJETOS_PUBLICADOS.length){
    return PROJETOS_PUBLICADOS.map(normalizeResponsavel);
  }
  return SEED_PROJECTS.map((p, i) => Object.assign({}, p, {
    id: 'seed-' + (i + 1),
    criadoEm: p.ultimaAtualizacao,
  }));
}

function loadProjects(){
  if(!SOMENTE_LEITURA){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        if(Array.isArray(parsed) && parsed.length) return parsed.map(normalizeResponsavel);
      }
    }catch(e){ console.warn('Falha ao ler localStorage, usando dados iniciais.', e); }
  }
  const lista = projetosDePartida();
  saveProjects(lista);
  return lista;
}
function saveProjects(list){
  if(SOMENTE_LEITURA) return;   // somente leitura: nada é gravado no navegador
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
  catch(e){ console.error('Falha ao salvar no localStorage.', e); alert('Não foi possível salvar: armazenamento local indisponível ou cheio.'); }
}

let projects = loadProjects();

/* ===================== Edit lock ===================== */
function isUnlocked(){
  if(SOMENTE_LEITURA) return false;
  try{ return localStorage.getItem(UNLOCK_KEY) === '1'; }catch(e){ return false; }
}
function setUnlocked(v){
  try{ localStorage.setItem(UNLOCK_KEY, v ? '1' : '0'); }catch(e){}
}
function applyLockUI(){
  const unlocked = isUnlocked();
  const lockStatus = document.getElementById('lockStatus');
  const btnToggle = document.getElementById('btnToggleLock');
  const btnNovo = document.getElementById('btnNovoProjeto');
  lockStatus.classList.toggle('unlocked', unlocked);
  lockStatus.innerHTML = unlocked
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><path d="M7 11V7a5 5 0 019.9-1"></path></svg> Modo de edição ativo'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path></svg> Somente visualização';
  // Estes botões podem não existir na página (versão somente leitura): tudo aqui precisa tolerar a ausência deles
  const btnExportar = document.getElementById('btnExportarProjetos');
  if(btnToggle){
    btnToggle.textContent = unlocked ? 'Bloquear edição' : 'Habilitar edição';
    btnToggle.hidden = SOMENTE_LEITURA;
  }
  if(btnNovo) btnNovo.hidden = !unlocked;
  if(btnExportar) btnExportar.hidden = !unlocked;
}

// Gera projetos-publicados.js com os projetos atuais: salve-o em modules/pipeline-projetos/ (substituindo o anterior)
// para que essa versão vire o ponto de partida da página.
document.getElementById('btnExportarProjetos')?.addEventListener('click', () => {
  const conteudo = '// Gerado pelo botão "Exportar para publicação" do Pipeline de Projetos em ' + new Date().toLocaleString('pt-BR') + '.\n' +
    '// Salve este arquivo em modules/pipeline-projetos/ (substituindo o anterior).\n' +
    'const PROJETOS_PUBLICADOS = ' + JSON.stringify(projects, null, 2) + ';\n';
  const url = URL.createObjectURL(new Blob([conteudo], {type: 'text/javascript;charset=utf-8'}));
  const a = document.createElement('a');
  a.href = url; a.download = 'projetos-publicados.js';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('btnToggleLock')?.addEventListener('click', () => {
  if(isUnlocked()){
    setUnlocked(false);
    applyLockUI();
    renderAll();
  } else {
    document.getElementById('fSenha').value = '';
    document.getElementById('lockError').style.display = 'none';
    openModal('modalLock');
  }
});
document.getElementById('btnConfirmarSenha').addEventListener('click', () => {
  const val = document.getElementById('fSenha').value;
  if(val === EDIT_PASSWORD){
    setUnlocked(true);
    closeModal('modalLock');
    applyLockUI();
    renderAll();
  } else {
    document.getElementById('lockError').style.display = 'block';
  }
});
document.getElementById('fSenha').addEventListener('keydown', (e) => {
  if(e.key === 'Enter') document.getElementById('btnConfirmarSenha').click();
});

/* ===================== Helpers ===================== */
const fmtNum = (v) => new Intl.NumberFormat('pt-BR').format(v);
function fmtDateISOToBR(iso){
  if(!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function todayISO(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function prazoSituacao(p){
  if(!p.dataPrevisao) return 'sem_prazo';
  if(p.status === 'Concluído') return 'no_prazo';
  return p.dataPrevisao < todayISO() ? 'atrasado' : 'no_prazo';
}
function isAtrasado(p){ return prazoSituacao(p) === 'atrasado'; }

function uid(){ return 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ===================== Modal generico ===================== */
function openModal(id){ document.getElementById(id).hidden = false; }
function closeModal(id){ document.getElementById(id).hidden = true; }
document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
});
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', (e) => { if(e.target === ov) closeModal(ov.id); });
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    document.querySelectorAll('.modal-overlay').forEach(ov => { if(!ov.hidden) closeModal(ov.id); });
  }
});

/* ===================== Filtros ===================== */
let filters = { status:'', responsavel:'', etapa:'', prioridade:'', periodo:'', prazo:'' };

function monthKey(iso){ return iso ? iso.slice(0,7) : ''; }
function monthLabelPt(key){
  const MESES = {'01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun','07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez'};
  const [y,m] = key.split('-');
  return `${MESES[m]||m}/${y.slice(2)}`;
}

// Todos os meses de Jan/2026 até o mês atual (calculado a partir da data real
// do dispositivo, sempre — não depende de quais meses já têm projeto
// cadastrado), do mais recente para o mais antigo.
function allMonthsFrom2026ToNow(){
  const now = new Date();
  const lastKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const months = [];
  let y = 2026, m = 1;
  while(`${y}-${String(m).padStart(2,'0')}` <= lastKey){
    months.push(`${y}-${String(m).padStart(2,'0')}`);
    m++; if(m > 12){ m = 1; y++; }
  }
  return months.reverse();
}

function populateFilterOptions(){
  const etapas = [...new Set(projects.map(p => p.etapa).filter(Boolean))].sort();
  const periodos = allMonthsFrom2026ToNow();

  const fill = (id, values, mapLabel) => {
    const sel = document.getElementById(id);
    const current = sel.value;
    sel.innerHTML = sel.querySelector('option[value=""]').outerHTML +
      values.map(v => `<option value="${v}">${mapLabel ? mapLabel(v) : v}</option>`).join('');
    if(values.includes(current)) sel.value = current;
  };
  fill('fltResponsavel', RESPONSAVEIS);
  fill('fltEtapa', etapas);
  fill('fltPeriodo', periodos, monthLabelPt);
}

['fltStatus','fltResponsavel','fltEtapa','fltPrioridade','fltPeriodo','fltPrazo'].forEach(id => {
  document.getElementById(id).addEventListener('change', (e) => {
    const key = id.replace('flt','').replace(/^./, c => c.toLowerCase());
    filters[key] = e.target.value;
    renderAll();
  });
});
document.getElementById('btnLimparFiltros').addEventListener('click', () => {
  filters = { status:'', responsavel:'', etapa:'', prioridade:'', periodo:'', prazo:'' };
  ['fltStatus','fltResponsavel','fltEtapa','fltPrioridade','fltPeriodo','fltPrazo'].forEach(id => { document.getElementById(id).value = ''; });
  renderAll();
});

function applyFilters(list){
  return list.filter(p => {
    if(filters.status && p.status !== filters.status) return false;
    if(filters.responsavel && !(p.responsavel||[]).includes(filters.responsavel)) return false;
    if(filters.etapa && p.etapa !== filters.etapa) return false;
    if(filters.prioridade && p.prioridade !== filters.prioridade) return false;
    if(filters.periodo && monthKey(p.ultimaAtualizacao) !== filters.periodo) return false;
    if(filters.prazo && prazoSituacao(p) !== filters.prazo) return false;
    return true;
  });
}

/* ===================== KPIs ===================== */
function renderKPIs(filtered){
  const total = filtered.length;
  const byStatus = (s) => filtered.filter(p => p.status === s).length;
  const atrasados = filtered.filter(isAtrasado).length;

  const items = [
    {label:'Total de Projetos', value: fmtNum(total), cls:'accent-a'},
    {label:'Planejados', value: fmtNum(byStatus('Planejado')), cls:'accent-a'},
    {label:'Em Andamento', value: fmtNum(byStatus('Em andamento')), cls:'accent-b'},
    {label:'Em Validação', value: fmtNum(byStatus('Em validação')), cls:'accent-c'},
    {label:'Concluídos', value: fmtNum(byStatus('Concluído')), cls:'accent-d'},
    {label:'Atrasados', value: fmtNum(atrasados), cls:'accent-e'},
  ];
  document.getElementById('kpiGrid').innerHTML = items.map(it => `
    <div class="kpi-card ${it.cls}">
      <div class="label">${it.label}</div>
      <div class="value">${it.value}</div>
    </div>
  `).join('');
}

/* ===================== Kanban ===================== */
function projectCardHTML(p){
  const atrasado = isAtrasado(p);
  const prioClass = 'badge-prio-' + (p.prioridade || 'média').toLowerCase().replace('í','i');
  return `
    <div class="project-card ${atrasado ? 'is-atrasado' : ''}" data-id="${p.id}">
      <h5>${escapeHtml(p.nome)}</h5>
      <div class="badges">
        <span class="badge ${prioClass}">${p.prioridade || 'Média'}</span>
        ${p.etapa ? `<span class="badge badge-etapa">${escapeHtml(p.etapa)}</span>` : ''}
        ${atrasado ? `<span class="badge badge-atraso">Atrasado</span>` : ''}
      </div>
      ${(p.responsavel||[]).length ? `
      <div class="meta-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        ${escapeHtml(p.responsavel.join(', '))}
      </div>` : ''}
      <div class="progress-track"><div class="progress-fill" style="width:${Math.max(0,Math.min(100,p.percentualConclusao||0))}%;"></div></div>
      <div class="footer-row">
        <span>${p.dataPrevisao ? 'Prazo: ' + fmtDateISOToBR(p.dataPrevisao) : 'Sem prazo definido'}</span>
        <span>${(p.percentualConclusao||0)}%</span>
      </div>
    </div>
  `;
}
function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderKanban(filtered){
  STATUSES.forEach(status => {
    const col = document.getElementById(COL_IDS[status]);
    const items = filtered.filter(p => p.status === status)
      .sort((a,b) => (b.ultimaAtualizacao||'').localeCompare(a.ultimaAtualizacao||''));
    document.getElementById(COUNT_IDS[status]).textContent = items.length;
    col.innerHTML = items.length
      ? items.map(projectCardHTML).join('')
      : '<div class="kanban-empty">Nenhum projeto</div>';
  });

  document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
  });
}

/* ===================== Detalhe (visualização) ===================== */
let currentDetailId = null;
function openDetail(id){
  const p = projects.find(x => x.id === id);
  if(!p) return;
  currentDetailId = id;
  document.getElementById('detailTitle').textContent = p.nome;
  const atrasado = isAtrasado(p);
  document.getElementById('detailBody').innerHTML = `
    ${p.descricao ? `<div class="detail-desc">${escapeHtml(p.descricao)}</div>` : ''}
    <dl>
      <div class="detail-row"><span class="k">Status</span><span class="v">${p.status}</span></div>
      <div class="detail-row"><span class="k">Etapa/Fase</span><span class="v">${escapeHtml(p.etapa) || '—'}</span></div>
      <div class="detail-row"><span class="k">Responsável</span><span class="v">${escapeHtml((p.responsavel||[]).join(', ')) || '—'}</span></div>
      <div class="detail-row"><span class="k">Área/Equipe</span><span class="v">${escapeHtml(p.area) || '—'}</span></div>
      <div class="detail-row"><span class="k">Prioridade</span><span class="v">${p.prioridade || '—'}</span></div>
      <div class="detail-row"><span class="k">% Conclusão</span><span class="v">${p.percentualConclusao||0}%</span></div>
      <div class="detail-row"><span class="k">Data de início</span><span class="v">${fmtDateISOToBR(p.dataInicio)}</span></div>
      <div class="detail-row"><span class="k">Data prevista de conclusão</span><span class="v">${fmtDateISOToBR(p.dataPrevisao)}${atrasado ? ' <span class="badge badge-atraso" style="margin-left:6px;">Atrasado</span>' : ''}</span></div>
      <div class="detail-row"><span class="k">Saving Potencial/Real</span><span class="v">${escapeHtml(p.saving) || '—'}</span></div>
      <div class="detail-row"><span class="k">Última atualização</span><span class="v">${fmtDateISOToBR(p.ultimaAtualizacao)}</span></div>
      ${p.observacoes ? `<div class="detail-row"><span class="k">Observações</span><span class="v">${escapeHtml(p.observacoes)}</span></div>` : ''}
    </dl>
  `;
  const unlocked = isUnlocked();
  document.getElementById('btnDetailEditar').hidden = !unlocked;
  document.getElementById('btnDetailExcluir').hidden = !unlocked;
  openModal('modalDetail');
}

document.getElementById('btnDetailEditar').addEventListener('click', () => {
  closeModal('modalDetail');
  openForm(currentDetailId);
});
document.getElementById('btnDetailExcluir').addEventListener('click', () => {
  closeModal('modalDetail');
  askDelete(currentDetailId);
});

/* ===================== Form (adicionar / editar) ===================== */
function renderResponsavelChips(selected){
  const sel = new Set(selected || []);
  const wrap = document.getElementById('fResponsavelChips');
  wrap.innerHTML = RESPONSAVEIS.map(name => `<button type="button" class="chip-toggle ${sel.has(name) ? 'active' : ''}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
  wrap.querySelectorAll('.chip-toggle').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
  });
}
function getSelectedResponsaveis(){
  return Array.from(document.querySelectorAll('#fResponsavelChips .chip-toggle.active')).map(c => c.dataset.name);
}

function openForm(id){
  const isEdit = !!id;
  document.getElementById('formTitle').textContent = isEdit ? 'Editar Projeto' : 'Novo Projeto';
  const p = isEdit ? projects.find(x => x.id === id) : null;

  document.getElementById('fId').value = id || '';
  document.getElementById('fNome').value = p ? p.nome : '';
  document.getElementById('fDescricao').value = p ? p.descricao : '';
  renderResponsavelChips(p ? p.responsavel : []);
  document.getElementById('fArea').value = p ? p.area : '';
  document.getElementById('fStatus').value = p ? p.status : 'Planejado';
  document.getElementById('fEtapa').value = p ? p.etapa : '';
  document.getElementById('fPrioridade').value = p ? (p.prioridade || 'Média') : 'Média';
  document.getElementById('fPercentual').value = p ? (p.percentualConclusao||0) : 0;
  document.getElementById('fDataInicio').value = p ? p.dataInicio : '';
  document.getElementById('fDataPrevisao').value = p ? p.dataPrevisao : '';
  document.getElementById('fSaving').value = p ? p.saving : '';
  document.getElementById('fUltimaAtualizacao').value = p ? p.ultimaAtualizacao : todayISO();
  document.getElementById('fObservacoes').value = p ? p.observacoes : '';

  openModal('modalForm');
}

document.getElementById('btnNovoProjeto')?.addEventListener('click', () => {
  if(!isUnlocked()) return;
  openForm(null);
});

document.getElementById('btnSalvarProjeto').addEventListener('click', () => {
  if(!isUnlocked()) return;
  const nome = document.getElementById('fNome').value.trim();
  if(!nome){ alert('Informe o nome do projeto.'); document.getElementById('fNome').focus(); return; }

  const id = document.getElementById('fId').value;
  const data = {
    nome,
    descricao: document.getElementById('fDescricao').value.trim(),
    responsavel: getSelectedResponsaveis(),
    area: document.getElementById('fArea').value.trim(),
    status: document.getElementById('fStatus').value,
    etapa: document.getElementById('fEtapa').value.trim(),
    prioridade: document.getElementById('fPrioridade').value,
    percentualConclusao: Math.max(0, Math.min(100, Number(document.getElementById('fPercentual').value) || 0)),
    dataInicio: document.getElementById('fDataInicio').value,
    dataPrevisao: document.getElementById('fDataPrevisao').value,
    saving: document.getElementById('fSaving').value.trim(),
    ultimaAtualizacao: document.getElementById('fUltimaAtualizacao').value || todayISO(),
    observacoes: document.getElementById('fObservacoes').value.trim(),
  };

  if(id){
    const idx = projects.findIndex(x => x.id === id);
    if(idx >= 0) projects[idx] = Object.assign({}, projects[idx], data);
  } else {
    projects.push(Object.assign({ id: uid(), criadoEm: todayISO() }, data));
  }
  saveProjects(projects);
  closeModal('modalForm');
  renderAll();
});

/* ===================== Excluir ===================== */
let pendingDeleteId = null;
function askDelete(id){
  const p = projects.find(x => x.id === id);
  if(!p) return;
  pendingDeleteId = id;
  document.getElementById('deleteProjectName').textContent = p.nome;
  openModal('modalConfirmDelete');
}
document.getElementById('btnConfirmarExclusao').addEventListener('click', () => {
  if(!isUnlocked() || !pendingDeleteId) return;
  projects = projects.filter(x => x.id !== pendingDeleteId);
  saveProjects(projects);
  pendingDeleteId = null;
  closeModal('modalConfirmDelete');
  renderAll();
});

/* ===================== Orquestração ===================== */
function renderAll(){
  populateFilterOptions();
  const filtered = applyFilters(projects);
  renderKPIs(filtered);
  renderKanban(filtered);
  document.getElementById('filterCount').textContent = `${fmtNum(filtered.length)} de ${fmtNum(projects.length)} projetos`;
}

applyLockUI();
renderAll();

} catch(err) {
  console.error('Erro ao montar o Pipeline de Projetos:', err);
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="background:#C0442C;color:#fff;padding:14px 24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;">' +
    '<strong>Erro ao carregar a página:</strong> ' + (err && err.message ? err.message : err) +
    '. Tente recarregar; se persistir, verifique se o arquivo foi aberto/baixado corretamente.' +
    '</div>');
}

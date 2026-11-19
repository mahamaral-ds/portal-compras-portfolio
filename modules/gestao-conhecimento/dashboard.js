try {

const viewHome = document.getElementById('view-home');
const viewDetail = document.getElementById('view-strategic-sourcing');

function showDetail(){
  viewHome.classList.remove('active');
  viewDetail.classList.add('active');
  window.scrollTo({top:0, behavior:'smooth'});
}
function showHome(){
  viewDetail.classList.remove('active');
  viewHome.classList.add('active');
  window.scrollTo({top:0, behavior:'smooth'});
}

document.getElementById('btnAbrirTreinamento').addEventListener('click', showDetail);
document.getElementById('btnVoltarHome').addEventListener('click', showHome);

// Card "Treinamentos" na home rola até a lista de materiais dessa categoria
document.getElementById('catTreinamentos').addEventListener('click', () => {
  document.getElementById('materiaisTreinamentos').scrollIntoView({behavior:'smooth', block:'start'});
});

/* ===================== Navegação por etapas (dentro do treinamento) ===================== */
const stepNav = document.getElementById('stepNav');
const stepButtons = stepNav.querySelectorAll('button');
const stepPanes = document.querySelectorAll('.step-pane');

function goToStep(key){
  stepButtons.forEach(b => b.classList.toggle('active', b.dataset.step === key));
  stepPanes.forEach(p => p.classList.toggle('active', p.id === 'pane-' + key));
  document.querySelector('.step-nav').scrollIntoView({behavior:'smooth', block:'start'});
}

stepButtons.forEach(btn => {
  btn.addEventListener('click', () => goToStep(btn.dataset.step));
});

document.getElementById('stepFlow').querySelectorAll('.step-flow-card').forEach(card => {
  card.addEventListener('click', () => goToStep(card.dataset.goto));
});

/* ===================== Carrossel de slides (por tópico) =====================
   Cada chave é o id de um <div> placeholder no HTML; o valor é a lista de imagens do tópico.
   As imagens são geradas por scripts/gerar_material_treinamento.py (o mesmo script gera o PDF para download). */
const CAROUSEL_DATA = {
  'car-visao-categorias': [{src:'slide-01-categorias.png', alt:'Árvore de categorias: do gasto total aos grupos e subgrupos'}],
  'car-visao-metodologia': [{src:'slide-02-metodologia.png', alt:'As 8 etapas da metodologia, da análise à execução'}],
  'car-e1-perfil': [{src:'slide-03-perfil.png', alt:'Seis perguntas para o perfil da categoria'}],
  'car-e1-swot': [{src:'slide-04-swot.png', alt:'SWOT da categoria Hortifrúti — exemplo fictício'}],
  'car-e2-perfil': [{src:'slide-05-mercado.png', alt:'Concentração do mercado fornecedor de laticínios — exemplo fictício'}],
  'car-e3-tco': [{src:'slide-06-tco.png', alt:'Custo total de propriedade de um quilo de proteína'}],
  'car-e4-matriz': [{src:'slide-07-kraljic.png', alt:'Matriz de posicionamento: alavancagem, estratégicos, não críticos e gargalo'}],
  'car-e5-funil': [{src:'slide-08-funil.png', alt:'Funil da RFI até a lista curta'}],
  'car-e6-indice': [{src:'slide-09-equalizacao.png', alt:'Equalização das propostas contra a baseline'}],
  'car-e7-estilos': [
    {src:'slide-10-estilos.png', alt:'Negociação posicional × baseada em fatos'},
    {src:'slide-02-metodologia.png', alt:'Onde a negociação entra na metodologia'}
  ],
  'car-e8-ipf': [{src:'slide-11-ipf.png', alt:'IPF — Índice de Performance do Fornecedor'}],
};

function renderCarousel(containerId, images){
  const el = document.getElementById(containerId);
  if(!el || !images || !images.length) return;
  const single = images.length === 1;
  el.classList.add('kc-carousel');
  if(single) el.classList.add('kc-car-single');
  let idx = 0;

  el.innerHTML = `
    <div class="kc-car-viewport">
      <div class="kc-car-track">
        ${images.map(img => `<div class="kc-car-slide"><img src="assets/slides/${img.src}" alt="${img.alt}" loading="lazy"></div>`).join('')}
      </div>
      ${!single ? `
        <button class="kc-car-btn prev" type="button" aria-label="Slide anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <button class="kc-car-btn next" type="button" aria-label="Próximo slide"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>
      ` : ''}
    </div>
    ${!single ? `
      <div class="kc-car-footer">
        <div class="kc-car-dots">${images.map((_,i) => `<button class="kc-car-dot ${i===0?'active':''}" type="button" aria-label="Ir para slide ${i+1}"></button>`).join('')}</div>
        <span class="kc-car-count">1/${images.length}</span>
      </div>
    ` : ''}
  `;

  const track = el.querySelector('.kc-car-track');
  const dots = el.querySelectorAll('.kc-car-dot');
  const countEl = el.querySelector('.kc-car-count');

  function goTo(i){
    idx = (i + images.length) % images.length;
    track.style.transform = `translateX(-${idx * 100}%)`;
    dots.forEach((d,di) => d.classList.toggle('active', di === idx));
    if(countEl) countEl.textContent = `${idx+1}/${images.length}`;
  }
  if(!single){
    el.querySelector('.prev').addEventListener('click', () => goTo(idx - 1));
    el.querySelector('.next').addEventListener('click', () => goTo(idx + 1));
    dots.forEach((d,i) => d.addEventListener('click', () => goTo(i)));
  }
}

Object.keys(CAROUSEL_DATA).forEach(id => renderCarousel(id, CAROUSEL_DATA[id]));

} catch(err) {
  console.error('Erro ao montar a página:', err);
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="background:#C0442C;color:#fff;padding:14px 24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;">' +
    '<strong>Erro ao carregar a página:</strong> ' + (err && err.message ? err.message : err) +
    '. Tente recarregar; se persistir, verifique se o arquivo foi aberto/baixado corretamente.' +
    '</div>');
}

/* =====================================================================
   PADRÃO VISUAL DOS GRÁFICOS DO PORTAL — única fonte de estilo (Chart.js)
   ---------------------------------------------------------------------
   Usado pelas páginas Overview Compras e Indicadores (carregar DEPOIS do chart.umd.min.js e ANTES do dashboard.js).
   Estrutura do gráfico de referência (analítico, limpo): eixos sem linha nem marcas, só a grade do eixo de valor,
   fina e clara; rótulo do valor em TODOS os pontos/barras (negrito, 12 px, na cor da série, sem sobreposição);
   legenda no topo à esquerda com traço; tooltip único; linhas de 3 px com marcador de borda branca.
   Fontes, textos, grade e espaçamentos vêm da própria página (variáveis CSS do tema); as cores dos DADOS são as do
   gráfico de referência (azul e âmbar), com uma paleta complementar quando há mais de duas.

   Cores por significado (as mesmas em todas as páginas):
     azul    GFX.cor.valor      valor comprado / gasto, PMP
     âmbar  GFX.cor.indicador  indicadores: CMV, estoque (DIO)
     roxo    GFX.cor.extra      terceira série (ex.: inflação)
   ===================================================================== */
const cssVar = (nome, padrao) => (getComputedStyle(document.documentElement).getPropertyValue(nome) || '').trim() || padrao;
const GFX = {
  fonte: getComputedStyle(document.body).fontFamily,
  tamanho: 12,                                   // fonte mínima de tudo que é texto no gráfico
  cor: {
    texto: cssVar('--text', '#121A2B'),
    suave: cssVar('--text-soft', '#5A6274'),     // rótulos de eixo
    grade: cssVar('--border', '#E1E5EE'),        // linhas de grade
    valor: '#186080',                            // azul do gráfico de referência
    indicador: '#D9962A',                        // âmbar do gráfico de referência
    extra: '#7E5BA6',                            // terceira cor (paleta complementar)
    faixa: 'rgba(23,27,36,0.06)',                // área entre duas séries de linha (cinza claro da referência)
    tooltipFundo: cssVar('--ink', '#121A2B'),
    tooltipTexto: cssVar('--on-ink', '#EEF1F7'),
  },
  // categorias: as duas primeiras cores são as do gráfico de referência (azul e âmbar); as demais completam a série
  // com tons distinguíveis entre si e dos dois primeiros (verde, roxo, dourado, rosa, ardósia, turquesa, marrom,
  // azul-claro, oliva, cinza) — 12 cores, uma para cada categoria da base, sem repetir
  paleta: ['#186080','#D9962A','#4C9F70','#7E5BA6','#E0B13A','#C8577E','#7A8CA0','#2AA3A3','#8C6D4F','#6FA8C9','#A3A83B','#9AA0A6'],
  barra: { raio: 4, maxHorizontal: 24, maxVertical: 48 },
  linha: { largura: 3, ponto: 5 },
};

// ---- formatação única de valores: "R$ 1,2 mi", "R$ 350 mil", "R$ 80", percentuais e dias com 1 casa ("27,7%", "26,8")
const fmtValor = (v) => {
  const a = Math.abs(v);
  if(a >= 1e6) return 'R$ ' + (v / 1e6).toFixed(1).replace('.', ',') + ' mi';
  if(a >= 1e3) return 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil';
  return 'R$ ' + Math.round(v).toLocaleString('pt-BR');
};
const fmtPercentual = (v) => v.toFixed(1).replace('.', ',') + '%';
const fmtDecimal1 = (v) => v.toFixed(1).replace('.', ',');
const fmtInteiro = (v) => Math.round(v).toLocaleString('pt-BR');
// percentual sem arredondar o dado (2 casas, como vem da base) — usado na inflação
const fmtPercentual2 = (v) => v.toFixed(2).replace('.', ',') + '%';

// cor com transparência a partir de #RRGGBB
const corAlfa = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

// texto do rótulo sobre fundo claro: a cor da série, exceto quando ela é clara demais para ler (usa o texto da página)
function corDoRotulo(cor){
  if(typeof cor !== 'string' || cor[0] !== '#') return GFX.cor.texto;
  const n = parseInt(cor.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); });
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) > 0.36 ? GFX.cor.texto : cor;
}

// rótulo de categoria muito longo (fornecedor/item): trunca no eixo para ocupar no máximo 38% da largura do gráfico;
// o nome completo fica no tooltip
const truncarRotulo = function(value){
  const label = this.getLabelForValue(value), ctx = this.chart.ctx, max = this.chart.width * 0.38;
  ctx.save(); ctx.font = `400 ${GFX.tamanho}px ${GFX.fonte}`;
  let t = label;
  if(ctx.measureText(t).width > max){
    while(t.length > 3 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
    t = t.trimEnd() + '…';
  }
  ctx.restore();
  return t;
};
// largura (px) de um texto com a fonte dos rótulos de dados (para reservar espaço ao lado das barras)
const medirTexto = (txt) => { const c = document.createElement('canvas').getContext('2d'); c.font = `700 ${GFX.tamanho}px ${GFX.fonte}`; return c.measureText(txt).width; };
// rótulo de eixo X em várias linhas (nomes longos), para não sobrepor
const quebrarRotulo = function(value){
  const palavras = this.getLabelForValue(value).split(' '), linhas = [''];
  palavras.forEach(p => { const u = linhas.length - 1; if((linhas[u] + ' ' + p).trim().length <= 12) linhas[u] = (linhas[u] + ' ' + p).trim(); else linhas.push(p); });
  return linhas;
};

Chart.defaults.font.family = GFX.fonte;
Chart.defaults.font.size = GFX.tamanho;
Chart.defaults.color = GFX.cor.suave;

/* Plugin: valor em cada barra/ponto. Habilita-se por série com `rotulos: (valor) => texto` no dataset
   (opcional `rotuloCor`). Barras: no fim da barra (dentro, em branco, se não couber). Linhas: acima do ponto — com
   várias séries de linha rotuladas, a que está por cima em cada mês leva o rótulo acima e as demais abaixo. Rótulos que
   se sobrepõem são empurrados e, se ainda assim colidirem, omitidos (o valor continua no tooltip). */
const pluginRotulos = {
  id: 'rotulosDeDados',
  afterDatasetsDraw(chart){
    const ctx = chart.ctx, horizontal = chart.options.indexAxis === 'y', H = GFX.tamanho;
    const ocupados = [];
    const livre = (r) => !ocupados.some(o => !(r.x2 < o.x1 || r.x1 > o.x2 || r.y2 < o.y1 || r.y1 > o.y2));
    const pinta = (txt, cx, cy, cor, alinhamento) => {
      const w = ctx.measureText(txt).width;
      const x1 = alinhamento === 'left' ? cx : alinhamento === 'right' ? cx - w : cx - w / 2;
      const r = {x1: x1 - 2, x2: x1 + w + 2, y1: cy - H / 2 - 1, y2: cy + H / 2 + 1};
      ocupados.push(r);
      ctx.textAlign = alinhamento || 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = cor;
      ctx.fillText(txt, cx, cy);
    };
    const cabe = (txt, cx, cy, alinhamento) => {
      const w = ctx.measureText(txt).width;
      const x1 = alinhamento === 'left' ? cx : alinhamento === 'right' ? cx - w : cx - w / 2;
      return {x1: x1 - 2, x2: x1 + w + 2, y1: cy - H / 2 - 1, y2: cy + H / 2 + 1};
    };
    ctx.save();
    ctx.font = `700 ${H}px ${GFX.fonte}`;
    const tipoDe = (ds) => ds.type || chart.config.type;
    const rotulados = chart.data.datasets.map((ds, i) => i).filter(i => chart.data.datasets[i].rotulos && chart.isDatasetVisible(i));

    // 1) barras
    rotulados.filter(i => tipoDe(chart.data.datasets[i]) === 'bar').forEach(di => {
      const ds = chart.data.datasets[di];
      chart.getDatasetMeta(di).data.forEach((el, i) => {
        const v = ds.data[i];
        if(v === null || v === undefined) return;
        const txt = ds.rotulos(v), w = ctx.measureText(txt).width;
        const fundo = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor;
        const cor = ds.rotuloCor || corDoRotulo(Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor);
        if(horizontal){
          if(el.x + 6 + w <= chart.width - 2) pinta(txt, el.x + 6, el.y, cor, 'left');
          else pinta(txt, el.x - 6, el.y, '#fff', 'right');
        } else {
          if(el.y - 6 - H >= 0) pinta(txt, el.x, el.y - 6 - H / 2, cor, 'center');
          else pinta(txt, el.x, el.y + 6 + H / 2, '#fff', 'center');
        }
      });
    });

    // 2) linhas
    const linhas = rotulados.filter(i => tipoDe(chart.data.datasets[i]) === 'line');
    if(linhas.length){
      const n = chart.data.labels.length;
      for(let i = 0; i < n; i++){
        const pontos = linhas.map(di => ({di, v: chart.data.datasets[di].data[i], el: chart.getDatasetMeta(di).data[i]}))
          .filter(p => p.v !== null && p.v !== undefined && p.el && !p.el.skip);
        pontos.sort((a, b) => b.v - a.v);
        pontos.forEach((p, rank) => {
          const ds = chart.data.datasets[p.di], txt = ds.rotulos(p.v);
          const cor = ds.rotuloCor || corDoRotulo(ds.borderColor);
          const acima = pontos.length === 1 || rank === 0;
          for(let tent = 0; tent < 4; tent++){
            const cy = acima ? p.el.y - 14 - tent * (H + 2) : p.el.y + 16 + tent * (H + 2);
            if(cy < H / 2 || cy > chart.height - H / 2) break;
            const r = cabe(txt, p.el.x, cy, 'center');
            if(livre(r)){ pinta(txt, p.el.x, cy, cor, 'center'); break; }
          }
        });
      }
    }
    ctx.restore();
  }
};

/* ---- blocos reutilizáveis de estilo (barras e linhas) ---- */
const estiloGrade = () => ({ color: GFX.cor.grade, lineWidth: 1, drawTicks: false });
function escalaValor(cfg = {}){
  const titulo = cfg.titulo ? { display: true, text: cfg.titulo, color: GFX.cor.suave, font: { size: GFX.tamanho, weight: 400 } } : { display: false };
  const esc = {
    beginAtZero: cfg.min === undefined, border: { display: false }, grid: cfg.semGrade ? { display: false } : estiloGrade(), title: titulo,
    ticks: { display: cfg.ticks !== false, color: GFX.cor.suave, font: { size: GFX.tamanho }, padding: 8, maxRotation: 0, maxTicksLimit: cfg.maxTicks || 5, callback: (v) => (cfg.formato ? cfg.formato(v) : v) },
  };
  ['min', 'max', 'position'].forEach(k => { if(cfg[k] !== undefined) esc[k] = cfg[k]; });
  if(cfg.sugeridoMin !== undefined) esc.suggestedMin = cfg.sugeridoMin;   // faixa mínima do eixo, que cresce se o dado pedir
  if(cfg.sugeridoMax !== undefined) esc.suggestedMax = cfg.sugeridoMax;
  if(cfg.passo) esc.ticks.stepSize = cfg.passo;
  if(cfg.inteiro) esc.ticks.precision = 0;                       // contagens: só números inteiros nas marcas
  return esc;
}
function escalaCategoria(cfg = {}){
  const esc = {
    border: { display: false }, grid: { display: false, drawTicks: false },
    ticks: { color: GFX.cor.suave, font: { size: GFX.tamanho, weight: 400 }, padding: 8, autoSkip: false, maxRotation: 0 },
  };
  if(cfg.rotulo) esc.ticks.callback = cfg.rotulo;   // sem callback, o eixo mostra o próprio nome (ex.: "Jul/26")
  return esc;
}
const tooltipPadrao = (callbacks) => ({
  backgroundColor: GFX.cor.tooltipFundo, titleColor: GFX.cor.tooltipTexto, bodyColor: GFX.cor.tooltipTexto,
  titleFont: { size: GFX.tamanho, weight: 700 }, bodyFont: { size: GFX.tamanho },
  padding: 10, cornerRadius: 8, displayColors: false, callbacks: callbacks || {},
});
// legenda no topo, à esquerda, com traço curto (como na referência); só para gráficos com mais de uma série
const legendaPadrao = () => ({
  display: true, position: 'top', align: 'start',
  labels: { usePointStyle: false, boxWidth: 22, boxHeight: 3, padding: 16, color: GFX.cor.suave, font: { size: GFX.tamanho, weight: 400 } },
});
// série de linha no padrão: 3 px, marcador circular com borda branca, sem suavização
const estiloLinha = (cor, extra = {}) => Object.assign({
  borderColor: cor, backgroundColor: cor, borderWidth: GFX.linha.largura, tension: 0, fill: false,
  pointRadius: GFX.linha.ponto, pointHoverRadius: GFX.linha.ponto + 1, pointBackgroundColor: cor, pointBorderColor: '#fff', pointBorderWidth: 2,
}, extra);

/* Gráfico de barras (uma série) no padrão.
   cfg: canvas, horizontal, rotulos[], valores[], cor (uma cor) ou cores[] (uma por barra), tituloSerie,
        formato (valor -> texto do rótulo e do eixo), formatoTooltip (valor -> texto completo, opcional),
        eixoValor {min, max, titulo, maxTicks, ticks:false}, rotuloCategoria (callback do eixo de categoria),
        tituloCategoria (título do eixo de categoria), tooltip {title, label, afterLabel} (substitui os padrões),
        opcoes (opções extras do Chart.js, ex.: onClick/onHover) */
function criarGrafico(cfg){
  const horizontal = !!cfg.horizontal;
  const cores = cfg.cores || cfg.valores.map(() => cfg.cor);
  const eixoValor = Object.assign({ formato: cfg.formato }, cfg.eixoValor || {});
  const reserva = Math.ceil(Math.max(0, ...cfg.valores.filter(v => v !== null && v !== undefined).map(v => medirTexto(cfg.formato(v))))) + 8;
  const eixoCat = escalaCategoria({ rotulo: cfg.rotuloCategoria });
  if(cfg.tituloCategoria) eixoCat.title = { display: true, text: cfg.tituloCategoria, color: GFX.cor.suave, font: { size: GFX.tamanho, weight: 400 } };
  return new Chart(document.getElementById(cfg.canvas), {
    type: 'bar',
    data: {
      labels: cfg.rotulos,
      datasets: [{
        label: cfg.tituloSerie || '', data: cfg.valores, backgroundColor: cores, borderRadius: GFX.barra.raio,
        maxBarThickness: horizontal ? GFX.barra.maxHorizontal : GFX.barra.maxVertical, rotulos: cfg.formato,
      }]
    },
    options: Object.assign({
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true, maintainAspectRatio: false,
      layout: { padding: horizontal ? { top: 4, right: reserva, bottom: 4, left: 0 } : { top: 26, right: 8, bottom: 4, left: 0 } },
      plugins: {
        legend: { display: false },          // série única: sem legenda (o título do cartão já nomeia a série)
        tooltip: tooltipPadrao(Object.assign({
          title: (it) => it[0].label,
          label: (ctx) => ' ' + (cfg.formatoTooltip || cfg.formato)(horizontal ? ctx.parsed.x : ctx.parsed.y),
        }, cfg.tooltip || {}))
      },
      scales: horizontal ? { x: escalaValor(eixoValor), y: eixoCat }
                         : { y: escalaValor(eixoValor), x: eixoCat }
    }, cfg.opcoes || {}),
    plugins: [pluginRotulos],
  });
}

/* Gráfico de rosca (distribuição) no padrão: legenda embaixo à esquerda, fatias separadas por borda branca, tooltip único.
   cfg: canvas, rotulos[], valores[], cores[], formatoTooltip (valor -> texto), corte (padrão '62%') */
function criarRosca(cfg){
  return new Chart(document.getElementById(cfg.canvas), {
    type: 'doughnut',
    data: { labels: cfg.rotulos, datasets: [{ data: cfg.valores, backgroundColor: cfg.cores, borderWidth: 2, borderColor: '#fff' }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: cfg.corte || '62%',
      layout: { padding: 4 },
      plugins: {
        legend: Object.assign(legendaPadrao(), { position: 'bottom' }),
        tooltip: tooltipPadrao({ label: (ctx) => ' ' + ctx.label + ': ' + cfg.formatoTooltip(ctx.parsed) }),
      }
    }
  });
}

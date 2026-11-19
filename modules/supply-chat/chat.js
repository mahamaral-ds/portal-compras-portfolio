/* =========================================================================
   Supply Chat — interface de conversa (usa SupplyChatEngine para as respostas)
   ========================================================================= */
try {

const messagesEl = document.getElementById('chatMessages');
const composerEl = document.getElementById('chatComposer');
const inputEl = document.getElementById('chatInput');
const sendBtn = document.getElementById('chatSendBtn');
const btnNovaConversa = document.getElementById('btnNovaConversa');

let ctx = SupplyChatEngine.newContext();
let busy = false;

/* ---- Modo Claude (opcional) ----
   Se o servidor do portal (server/app.py) estiver no ar com a chave configurada, as perguntas vão para o Claude
   através de /api/chat (a chave nunca chega ao navegador). Sem servidor, sem chave ou com qualquer falha de
   conexão, o chat usa o motor local (engine.js), como antes. */
let claudeMode = false;
let historico = [];   // [{role, content}] só texto — o servidor refaz as consultas às ferramentas a cada pergunta
const modeBadgeEl = document.getElementById('modeBadge');

function atualizarBadgeModo(){
  modeBadgeEl.hidden = false;
  modeBadgeEl.className = 'mode-badge' + (claudeMode ? ' ia' : '');
  modeBadgeEl.textContent = claudeMode ? 'Claude conectado' : 'Modo local';
  modeBadgeEl.title = claudeMode
    ? 'As respostas são redigidas pelo Claude a partir de consultas aos dados do portal.'
    : 'Respostas geradas pelo motor local do portal (sem IA).';
}

// O servidor do assistente (server/app.py) so existe rodando na maquina local. Em hospedagem estatica
// (GitHub Pages, file://) nao ha /api: nem tenta, para nao gerar requisicoes 404 no console.
const SERVIDOR_LOCAL = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);

async function detectarClaude(){
  if(!SERVIDOR_LOCAL){ claudeMode = false; atualizarBadgeModo(); return; }
  try {
    const r = await fetch('/api/health', {cache: 'no-store'});
    const j = r.ok ? await r.json() : null;
    claudeMode = !!(j && j.ok && j.claude);
  } catch(e){ claudeMode = false; }
  atualizarBadgeModo();
}

async function askClaude(text){
  const msgs = historico.concat([{role: 'user', content: text}]);
  let r;
  try {
    r = await fetch('/api/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({messages: msgs})});
  } catch(e){
    return {type: 'error', text: 'Não consegui falar com o servidor do assistente. Tente novamente.', retry: text};
  }
  let j = null;
  try { j = await r.json(); } catch(e){}
  if(r.status === 503){          // servidor sem chave: volta para o motor local nesta pergunta e nas próximas
    claudeMode = false; atualizarBadgeModo();
    return null;
  }
  if(!r.ok || !j || !j.resposta){
    return {type: 'error', text: (j && j.erro) || 'Não consegui consultar essas informações agora. Tente novamente.', retry: text};
  }
  historico = msgs.concat([{role: 'assistant', content: j.resposta}]);
  return {type: 'ia', text: j.resposta, source: (j.fontes || []).join(' · ')};
}

const ICON_BOT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8l.9 2.1L15 11l-2.1.9L12 14l-.9-2.1L9 11l2.1-.9L12 8z"></path><path d="M5 3l.6 1.4L7 5l-1.4.6L5 7l-.6-1.4L3 5l1.4-.6L5 3z"></path><path d="M19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6L19 13z"></path></svg>`;
const ICON_USER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"></path></svg>`;

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// **negrito** -> <b>negrito</b> (unico marcador suportado, texto sempre escapado antes)
function renderInlineMarkdown(text){
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

// Texto do Claude: parágrafos (linha em branco), listas ("- ") e **negrito**; tudo escapado antes
function renderAnswerText(text){
  const blocos = String(text).split(/\n{2,}/);
  return blocos.map(b => {
    const linhas = b.split('\n').filter(l => l.trim());
    if(linhas.length && linhas.every(l => /^\s*[-•]\s+/.test(l))){
      return '<ul class="sc-answer-list">' + linhas.map(l => '<li>' + renderInlineMarkdown(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') + '</ul>';
    }
    return '<p>' + linhas.map(renderInlineMarkdown).join('<br>') + '</p>';
  }).join('');
}

function scrollToBottom(){
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderWelcome(){
  messagesEl.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'chat-welcome';
  wrap.innerHTML = `
    <div class="chat-welcome-icon">${ICON_BOT}</div>
    <h2>Olá! Como posso ajudar?</h2>
    <p>Posso encontrar fornecedores, categorias, preços e a inflação da empresa a partir dos dados (sintéticos) do portal. Pergunte com suas palavras — não precisa de um formato especial.</p>
    <div class="chat-suggestions" id="welcomeSuggestions"></div>
  `;
  messagesEl.appendChild(wrap);
  renderSuggestionChips(wrap.querySelector('#welcomeSuggestions'), SupplyChatEngine.defaultSuggestions());
}

function renderSuggestionChips(container, suggestions){
  container.innerHTML = '';
  suggestions.forEach(s => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chat-suggestion-chip';
    chip.textContent = s;
    chip.addEventListener('click', () => sendMessage(s));
    container.appendChild(chip);
  });
}

function addUserBubble(text){
  const row = document.createElement('div');
  row.className = 'chat-msg user';
  row.innerHTML = `
    <div class="chat-avatar">${ICON_USER}</div>
    <div class="chat-bubble">${renderInlineMarkdown(text)}</div>
  `;
  messagesEl.appendChild(row);
  scrollToBottom();
}

function addTypingBubble(){
  const row = document.createElement('div');
  row.className = 'chat-msg assistant';
  row.id = 'typingBubble';
  row.innerHTML = `
    <div class="chat-avatar">${ICON_BOT}</div>
    <div class="chat-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>
  `;
  messagesEl.appendChild(row);
  scrollToBottom();
  return row;
}

function buildRichContent(resp){
  let html = '';
  if(resp.list && resp.list.items && resp.list.items.length){
    html += '<ul class="sc-result-list">';
    resp.list.items.forEach(it => {
      html += `<li><span class="primary">${escapeHtml(it.primary)}</span>` +
        (it.secondary ? `<span class="secondary">${escapeHtml(it.secondary)}</span>` : '') +
        (it.extra ? `<span class="extra">${escapeHtml(it.extra)}</span>` : '') +
        `</li>`;
    });
    html += '</ul>';
    if(resp.list.totalCount && resp.list.totalCount > resp.list.items.length){
      html += `<div class="sc-result-more">+ ${resp.list.totalCount - resp.list.items.length} outros — abra o módulo pra ver a lista completa.</div>`;
    }
  }
  if(resp.table && resp.table.rows && resp.table.rows.length){
    html += '<div class="sc-table-wrap"><table class="sc-table"><thead><tr>';
    resp.table.cols.forEach(c => html += `<th>${escapeHtml(c)}</th>`);
    html += '</tr></thead><tbody>';
    resp.table.rows.forEach(row => {
      html += '<tr>' + row.map(v => `<td>${escapeHtml(String(v))}</td>`).join('') + '</tr>';
    });
    html += '</tbody></table></div>';
  }
  if(resp.source){
    html += `<div class="sc-source">Fonte: ${escapeHtml(resp.source)}</div>`;
  }
  if(resp.navLink){
    html += `<a class="sc-navlink" href="${escapeHtml(resp.navLink.href)}">${escapeHtml(resp.navLink.label)} &rarr;</a>`;
  }
  return html;
}

function addAssistantBubble(resp){
  const row = document.createElement('div');
  row.className = 'chat-msg assistant' + (resp.type === 'error' ? ' error' : (resp.type === 'empty' ? ' empty' : ''));
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = (resp.type === 'ia' ? renderAnswerText(resp.text) : `<p>${renderInlineMarkdown(resp.text)}</p>`) + buildRichContent(resp);

  if(resp.type === 'error' && resp.retry){
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'chat-retry-btn';
    retryBtn.textContent = 'Tentar novamente';
    retryBtn.addEventListener('click', () => sendMessage(resp.retry));
    bubble.appendChild(retryBtn);
  }

  if(resp.suggestions && resp.suggestions.length){
    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'chat-followup-chips';
    resp.suggestions.forEach(s => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chat-followup-chip';
      chip.textContent = s;
      chip.addEventListener('click', () => sendMessage(s));
      chipsWrap.appendChild(chip);
    });
    bubble.appendChild(chipsWrap);
  }

  row.innerHTML = `<div class="chat-avatar">${ICON_BOT}</div>`;
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  scrollToBottom();
}

async function sendMessage(text){
  text = String(text || '').trim();
  if(!text || busy) return;
  busy = true;
  sendBtn.disabled = true;

  addUserBubble(text);
  inputEl.value = '';
  autoGrow();

  const typingRow = addTypingBubble();
  let resp = null;
  try{
    if(claudeMode) resp = await askClaude(text);
    if(!resp) resp = await SupplyChatEngine.ask(text, ctx);
  } catch(err){
    console.error('Erro no Supply Chat:', err);
    resp = {type: 'error', text: 'Não consegui consultar essas informações agora. Tente novamente.', retry: text};
  }
  typingRow.remove();
  addAssistantBubble(resp);

  busy = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

function autoGrow(){
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}

composerEl.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(inputEl.value);
});
inputEl.addEventListener('input', autoGrow);
inputEl.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});

btnNovaConversa.addEventListener('click', () => {
  ctx = SupplyChatEngine.newContext();
  historico = [];
  renderWelcome();
  inputEl.value = '';
  autoGrow();
  inputEl.focus();
});

renderWelcome();
inputEl.focus();
detectarClaude();

} catch(err) {
  console.error('Erro ao montar o Supply Chat:', err);
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="background:#C0442C;color:#fff;padding:14px 24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;">' +
    '<strong>Erro ao carregar o Supply Chat:</strong> ' + (err && err.message ? err.message : err) +
    '. Tente recarregar a página.' +
    '</div>');
}

/**
 * Componente compartilhado: barra superior dos modulos do Portal de Compras.
 * Uso, no <body> do modulo (logo apos a tag <body>):
 *
 *   <div id="portalTopbar"></div>
 *   <link rel="stylesheet" href="../../shared/portal-style.css">
 *   <script src="../../shared/portal-topbar.js"></script>
 *   <script>
 *     renderPortalTopbar({
 *       moduleName: 'Fornecedores',
 *       backHref: '../../index.html',
 *       logoHref: '../../assets/quintaluz-logo.svg'
 *     });
 *   </script>
 */
function renderPortalTopbar(opts){
  const moduleName = (opts && opts.moduleName) || 'Modulo';
  const backHref = (opts && opts.backHref) || '../../index.html';
  const logoHref = (opts && opts.logoHref) || '../../assets/quintaluz-logo.svg';

  const target = document.getElementById('portalTopbar');
  if(!target){
    console.warn('renderPortalTopbar: elemento #portalTopbar nao encontrado.');
    return;
  }

  target.className = 'portal-topbar';
  target.innerHTML = `
    <div class="brand-mini">
      <img src="${logoHref}" alt="Quintaluz">
      <span class="crumb"><a class="crumb-home-link" href="${backHref}">Portal de Compras</a> <strong>/ ${moduleName}</strong></span>
    </div>
    <div class="topbar-actions">
      <a class="portal-back-btn" href="${backHref}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
        Voltar ao menu
      </a>
    </div>
  `;
}

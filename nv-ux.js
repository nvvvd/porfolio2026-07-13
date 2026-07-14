/* ============================================================================
   NVUX — finitions transverses, chargées sur toutes les pages publiques.
   ----------------------------------------------------------------------------
   1. Fondu d'apparition des images : chaque <img> (y compris celles rendues
      par React après coup) démarre transparente puis se révèle au chargement.
      → plus de « flash » de fond gris uni. Les images déjà en cache restent
        visibles immédiatement (pas de re-fondu).
   2. Transitions de page : un clic sur un lien interne (*.dc.html) fait un court
      fondu sortant avant de naviguer ; chaque page entre en fondu (.nv-page).
      Respecte ⌘/Ctrl-clic, target=_blank, ancres et prefers-reduced-motion.
   Les variables CSS de thème + les styles de focus/fondu sont définis dans le
   <style> de chaque page (cohérent avec l'inline-styling du projet).
   ============================================================================ */
(function () {
  var reduce = false;
  try { reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* ---- 0. Mesure d'audience (Plausible, optionnelle) ---------------------- */
  // Chargée uniquement si un domaine est renseigné dans nv-config.js.
  try {
    var pd = window.NV_CONFIG && window.NV_CONFIG.analytics && window.NV_CONFIG.analytics.plausibleDomain;
    if (pd) {
      var ps = document.createElement('script');
      ps.defer = true; ps.setAttribute('data-domain', pd);
      ps.src = 'https://plausible.io/js/script.js';
      document.head.appendChild(ps);
    }
  } catch (e) {}

  /* ---- 1. Fondu des images ------------------------------------------------ */
  // Le fondu est piloté en style inline (qui l'emporte toujours sur la feuille
  // de styles) → révélation déterministe, jamais bloquée à 0. Les sources déjà
  // vues ne re-fondent pas (évite tout clignotement quand React re-rend un <img>).
  var seenSrc = Object.create(null);
  // Squelette de chargement : pulsation douce du conteneur tant que l'image charge.
  var skelCSS = false;
  function ensureSkelCSS() {
    if (skelCSS) return; skelCSS = true;
    try {
      var st = document.createElement('style');
      st.textContent = '@keyframes nvskel{0%{background-color:var(--ph,#EEE);}100%{background-color:color-mix(in srgb, var(--ph,#EEE) 72%, var(--bg,#FFF));}}';
      document.head.appendChild(st);
    } catch (e) {}
  }
  function prepImg(img) {
    if (!img || img.__nvFade) return;
    img.__nvFade = true;
    // Ne JAMAIS toucher une image dont l'opacité est déjà pilotée par l'auteur
    // (ex. aperçus flottants de l'accueil, qui empilent et font défiler les
    // photos via opacity 0/1). Sinon on écrase leur animation.
    if (img.hasAttribute('data-nv-nofade') || img.style.opacity !== '') return;
    var src = img.currentSrc || img.getAttribute('src') || '';
    // Déjà chargée (cache) ou déjà fondue une fois → on la laisse visible.
    if ((img.complete && img.naturalWidth > 0) || (src && seenSrc[src])) return;
    img.style.opacity = '0';
    img.style.transition = 'opacity .55s ease';
    // Pulsation du parent (les conteneurs d'images ont déjà un fond placeholder).
    ensureSkelCSS();
    var par = img.parentElement;
    if (par && !par.style.animation) {
      par.__nvSkel = (par.__nvSkel || 0) + 1;
      par.style.animation = 'nvskel 1.1s ease-in-out infinite alternate';
    } else { par = null; }
    var reveal = function () {
      var s = img.currentSrc || img.getAttribute('src') || src;
      if (s) seenSrc[s] = 1;
      img.style.opacity = '1';
      if (par) { par.__nvSkel--; if (par.__nvSkel <= 0) par.style.animation = ''; }
    };
    img.addEventListener('load', reveal, { once: true });
    img.addEventListener('error', reveal, { once: true });
    // Filet de sécurité : révèle même si l'évènement load tarde ou n'arrive pas.
    setTimeout(reveal, 1500);
  }
  function scan(root) {
    var imgs = (root || document).querySelectorAll ? (root || document).querySelectorAll('img') : [];
    for (var i = 0; i < imgs.length; i++) prepImg(imgs[i]);
  }
  function startImgFade() {
    if (reduce) return;
    scan(document);
    try {
      var mo = new MutationObserver(function (muts) {
        for (var m = 0; m < muts.length; m++) {
          var nodes = muts[m].addedNodes;
          for (var n = 0; n < nodes.length; n++) {
            var el = nodes[n];
            if (el.nodeType !== 1) continue;
            if (el.tagName === 'IMG') prepImg(el);
            else if (el.querySelectorAll) scan(el);
          }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  /* ---- 2. Transitions de page -------------------------------------------- */
  function markEntered() {
    requestAnimationFrame(function () { document.documentElement.setAttribute('data-nv-ready', '1'); });
  }
  function isInternal(a) {
    if (!a) return false;
    var href = a.getAttribute('href') || '';
    if (!/\.dc\.html(\b|#|\?|$)/.test(href) && !/^Accueil\.dc\.html/.test(href)) return false;
    if (a.target && a.target !== '' && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    // Même page + simple ancre → pas de transition.
    try {
      var u = new URL(a.href, location.href);
      if (u.pathname === location.pathname && u.hash && u.hash !== location.hash) return false;
    } catch (e) {}
    return true;
  }
  function startPageTransitions() {
    if (reduce) { document.documentElement.setAttribute('data-nv-ready', '1'); return; }
    // Fondu d'apparition de la page au premier chargement.
    try {
      var stIn = document.createElement('style');
      stIn.textContent = 'html:not([data-nv-ready]) body{opacity:0;}@keyframes nvpagein{from{opacity:0;}to{opacity:1;}}html[data-nv-ready] body{animation:nvpagein .5s ease;}';
      document.head.appendChild(stIn);
    } catch (e) {}
    markEntered();
    // Restaure la visibilité si la page est ré-affichée depuis le cache (retour navigateur).
    window.addEventListener('pageshow', function (e) { if (e.persisted) { document.documentElement.removeAttribute('data-nv-leaving'); markEntered(); } });
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || !isInternal(a)) return;
      e.preventDefault();
      var go = a.href;
      document.documentElement.setAttribute('data-nv-leaving', '1');
      setTimeout(function () { location.href = go; }, 200);
    }, true);
  }

  /* ---- 3. Protection des images ------------------------------------------ */
  // Décourage le téléchargement sauvage : pas de clic droit ni de glisser-déposer
  // sur les photos (le bouton de téléchargement officiel reste fonctionnel).
  function startImgGuard() {
    document.addEventListener('contextmenu', function (e) { var t = e.target; if (t && t.tagName === 'IMG') e.preventDefault(); });
    document.addEventListener('dragstart', function (e) { var t = e.target; if (t && t.tagName === 'IMG') e.preventDefault(); });
    try {
      var st = document.createElement('style');
      st.textContent = 'img{-webkit-user-drag:none;user-select:none;-webkit-user-select:none;}';
      document.head.appendChild(st);
    } catch (e) {}
  }

  function init() { startImgFade(); startPageTransitions(); startImgGuard(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

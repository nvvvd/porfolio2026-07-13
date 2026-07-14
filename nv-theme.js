/* ============================================================================
   NVTheme — bascule clair / sombre, partagée par toutes les pages.
   ----------------------------------------------------------------------------
   • Préférence persistée dans localStorage ('nv_theme'). Au premier passage, on
     respecte la préférence système (prefers-color-scheme).
   • Pose data-theme="dark" sur <html> ; les variables CSS (définies dans le
     <style> de chaque page) basculent toute la palette d'un coup.
   • NVTheme.theme / set(t) / toggle() / onChange(cb).
   • toggle() déclenche aussi NVStore.ping() pour re-rendre les pages abonnées
     (l'icône ☾/☀ du bouton se met à jour toute seule).
   ============================================================================ */
(function () {
  var KEY = 'nv_theme';
  var theme = 'light';
  var explicit = false;
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') { theme = saved; explicit = true; }
    else if (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) { theme = 'dark'; }
  } catch (e) {}

  function apply() { try { document.documentElement.setAttribute('data-theme', theme); } catch (e) {} }
  apply();

  var listeners = [];

  function set(t) {
    if (t !== 'light' && t !== 'dark') return;
    if (t === theme) return;
    theme = t; explicit = true;
    try { localStorage.setItem(KEY, t); } catch (e) {}
    apply();
    listeners.forEach(function (cb) { try { cb(theme); } catch (e) {} });
    // Re-render fiable des pages (même mécanisme que le changement de langue).
    try { if (window.NVStore && window.NVStore.ping) window.NVStore.ping(); } catch (e) {}
  }

  // Suit le système tant que l'utilisateur n'a pas choisi explicitement.
  try {
    if (window.matchMedia) {
      var mq = matchMedia('(prefers-color-scheme: dark)');
      var onSys = function (e) { if (!explicit) { theme = e.matches ? 'dark' : 'light'; apply(); listeners.forEach(function (cb) { try { cb(theme); } catch (x) {} }); try { if (window.NVStore && window.NVStore.ping) window.NVStore.ping(); } catch (x) {} } };
      if (mq.addEventListener) mq.addEventListener('change', onSys); else if (mq.addListener) mq.addListener(onSys);
    }
  } catch (e) {}

  window.NVTheme = {
    get theme() { return theme; },
    set: set,
    toggle: function () { set(theme === 'dark' ? 'light' : 'dark'); },
    onChange: function (cb) { listeners.push(cb); return function () { listeners = listeners.filter(function (x) { return x !== cb; }); }; }
  };
})();

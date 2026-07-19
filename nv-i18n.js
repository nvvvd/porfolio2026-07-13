/* ============================================================================
   NVI18n — bilingue FR / EN
   ----------------------------------------------------------------------------
   • Langue courante persistée dans localStorage ('nv_lang'), défaut 'fr'.
   • NVI18n.t(key)        -> chaîne d'interface dans la langue courante.
   • NVI18n.pick(fr, en)  -> contenu : renvoie l'anglais si dispo en mode EN.
   • NVI18n.setLang(l) / toggle() / onChange(cb)  -> change + notifie (re-render).
   • NVI18n.ui(active)    -> objet « chrome » partagé (nav + bouton FR/EN) que
                             chaque page étale dans renderVals(). `active` =
                             'home' | 'galleries' | 'client' | 'contact' pour
                             surligner l'onglet courant.
   ============================================================================ */
(function () {
  var KEY = 'nv_lang';
  var lang = 'fr';
  try { var saved = localStorage.getItem(KEY); if (saved === 'fr' || saved === 'en') lang = saved; } catch (e) {}
  try { document.documentElement.lang = lang; } catch (e) {}

  var listeners = [];

  var DICT = {
    // --- Navigation (chrome partagé) ---
    'nav.home':      { fr: 'accueil',  en: 'home' },
    'nav.galleries': { fr: 'galeries', en: 'galleries' },
    'nav.client':    { fr: 'client',   en: 'client' },
    'nav.contact':   { fr: 'contact',  en: 'contact' },
    'nav.menu':      { fr: 'menu',     en: 'menu' },
    'nav.site':      { fr: '← site',   en: '← site' },

    // --- Accueil ---
    'home.index':       { fr: 'index',  en: 'index' },
    'home.grid':        { fr: 'grid',   en: 'grid' },
    'home.photos':      { fr: 'photos', en: 'photos' },
    'home.available':   { fr: 'Disponible pour commandes', en: 'Available for commissions' },
    'home.workTogether':{ fr: 'Travaillons ensemble →', en: "Let's work together →" },
    'home.defaultCta':  { fr: 'voir la série', en: 'view the series' },

    // --- Portfolio ---
    'pf.galleries':   { fr: 'galeries', en: 'galleries' },
    'pf.h1':          { fr: 'galeries', en: 'galleries' },
    'pf.intro':       { fr: "",
                        en: '' },
    'pf.aSession':    { fr: 'Une séance en tête ?', en: 'Have a session in mind?' },
    'pf.getInTouch':  { fr: 'Prendre contact →', en: 'Get in touch →' },

    // --- Galerie ---
    'gal.label':        { fr: 'galerie', en: 'gallery' },
    'gal.images':       { fr: 'images', en: 'images' },
    'gal.allGalleries': { fr: '← toutes les galeries', en: '← all galleries' },
    'gal.book':         { fr: 'Réserver une séance →', en: 'Book a session →' },
    'gal.close':        { fr: 'Fermer', en: 'Close' },
    'gal.prev':         { fr: 'Précédent', en: 'Previous' },
    'gal.next':         { fr: 'Suivant', en: 'Next' },

    // --- Contact ---
    'ct.label':       { fr: 'contact & à propos', en: 'contact & about' },
    'ct.reply':       { fr: 'réponse sous 48 h', en: 'reply within 48 h' },
    'ct.formTitle':   { fr: 'Formulaire de contact', en: 'Contact form' },
    'ct.name':        { fr: 'Nom', en: 'Name' },
    'ct.namePh':      { fr: 'Votre nom', en: 'Your name' },
    'ct.email':       { fr: 'Courriel', en: 'Email' },
    'ct.projectType': { fr: 'Type de projet', en: 'Project type' },
    'ct.message':     { fr: 'Votre message', en: 'Your message' },
    'ct.messagePh':   { fr: 'Date, lieu, ambiance recherchée…', en: "Date, location, the mood you're after…" },
    'ct.send':        { fr: 'Envoyer la demande →', en: 'Send request →' },
    'ct.sending':     { fr: 'Envoi…', en: 'Sending…' },
    'ct.sent':        { fr: 'Merci — message envoyé ✓', en: 'Thank you — message sent ✓' },
    'ct.instagram':   { fr: 'Instagram', en: 'Instagram' },
    'ct.atWork':      { fr: 'au travail', en: 'at work' },
    'ct.errShort':    { fr: 'Votre message est un peu court — dites-m’en un peu plus.', en: 'Your message is a little short — tell me a bit more.' },
    'ct.errLong':     { fr: 'Message trop long (4000 caractères maximum).', en: 'Message too long (4000 characters maximum).' },
    'ct.errEmail':    { fr: 'Cette adresse courriel ne semble pas valide.', en: "That email address doesn't look valid." },
    'ct.errRate':     { fr: 'Merci de patienter un instant avant de renvoyer un message.', en: 'Please wait a moment before sending another message.' },
    'ct.errSend':     { fr: 'Envoi impossible pour le moment — réessayez plus tard.', en: 'Could not send right now — please try again later.' },

    // --- Types de projet (contact) ---
    'type.Portrait':   { fr: 'Portrait',   en: 'Portrait' },
    'type.Paysage':    { fr: 'Paysage',    en: 'Landscape' },
    'type.Évènements': { fr: 'Évènements', en: 'Events' },
    'type.Diary':      { fr: 'Diary',      en: 'Diary' },
    'type.Sport':      { fr: 'Sport',      en: 'Sport' },

    // --- Client ---
    'cl.private':       { fr: 'espace privé', en: 'private area' },
    'cl.h1':            { fr: 'espace client.', en: 'client area.' },
    'cl.loginIntro':    { fr: 'Accédez à vos galeries privées, vos factures et sélectionnez vos photos favorites.', en: 'Access your private galleries, invoices and pick your favourite photos.' },
    'cl.accessCode':    { fr: "Code d'accès", en: 'Access code' },
    'cl.signIn':        { fr: 'Se connecter →', en: 'Sign in →' },
    'cl.demo':          { fr: 'Démo — ', en: 'Demo — ' },
    'cl.badCreds':      { fr: 'Identifiants incorrects.', en: 'Incorrect credentials.' },
    'cl.space':         { fr: 'espace client', en: 'client area' },
    'cl.quit':          { fr: 'Quitter', en: 'Sign out' },
    'cl.tabGalleries':  { fr: 'galeries', en: 'galleries' },
    'cl.tabInvoices':   { fr: 'factures', en: 'invoices' },
    'cl.tabSelection':  { fr: 'sélection', en: 'selection' },
    'cl.yourGalleries': { fr: 'vos galeries', en: 'your galleries' },
    'cl.noGalleries':   { fr: 'Vos galeries apparaîtront ici dès qu\u2019elles seront prêtes \u2014 vous recevrez un mot du photographe.', en: 'Your galleries will appear here as soon as they are ready \u2014 the photographer will let you know.' },
    'cl.faceBadge':     { fr: 'recherche par visage', en: 'face search' },
    'cl.photos':        { fr: 'photos', en: 'photos' },
    'cl.likedSel':      { fr: '♥ sélectionnées', en: '♥ selected' },
    'cl.findMyPhotos':  { fr: 'Retrouver mes photos', en: 'Find my photos' },
    'cl.selection':     { fr: 'Sélection', en: 'Selection' },
    'cl.faceResults':   { fr: 'résultats', en: 'results' },
    'cl.limitReached1': { fr: 'Limite de ', en: 'Limit of ' },
    'cl.limitReached2': { fr: ' photos atteinte. Retirez une photo pour en choisir une autre.', en: ' photos reached. Remove one to pick another.' },
    'cl.faceEmpty':     { fr: 'Aucune photo trouvée pour ce visage dans cette galerie.', en: 'No photo found for this face in this gallery.' },
    'cl.invoices':      { fr: 'factures', en: 'invoices' },
    'cl.invoicesSub':   { fr: 'Vos documents et paiements.', en: 'Your documents and payments.' },
    'cl.noInvoices':    { fr: 'Aucune facture pour l\u2019instant \u2014 tout est en règle.', en: 'No invoices yet \u2014 you\u2019re all set.' },
    'cl.mySelection':   { fr: 'ma sélection', en: 'my selection' },
    'cl.send':          { fr: 'Transmettre au photographe →', en: 'Send to the photographer →' },
    'cl.sent':          { fr: 'Sélection transmise ✓', en: 'Selection sent ✓' },
    'cl.noSelTitle':    { fr: 'Aucune photo sélectionnée pour l\u2019instant.', en: 'No photos selected yet.' },
    'cl.noSelHint':     { fr: 'Ouvrez une galerie et touchez le ♥ sur vos préférées.', en: 'Open a gallery and tap the ♥ on your favourites.' },
    'cl.faceTitle':     { fr: 'reconnaissance faciale', en: 'face recognition' },
    'cl.faceHead':      { fr: 'Retrouvez-vous en un selfie.', en: 'Find yourself with a selfie.' },
    'cl.faceIntro1':    { fr: 'Importez une photo de votre visage : on compare instantanément aux ', en: 'Upload a photo of your face: we instantly compare it to the ' },
    'cl.faceIntro2':    { fr: ' photos déjà analysées de cette galerie.', en: ' already-analysed photos of this gallery.' },
    'cl.faceUpload':    { fr: 'Téléverser une photo / selfie', en: 'Upload a photo / selfie' },
    'cl.faceOrSample':  { fr: '— ou essayez avec un visage d\u2019exemple —', en: '— or try with a sample face —' },
    'cl.facePrivacy':   { fr: "Votre photo n'est jamais conservée — elle sert uniquement à la recherche.", en: 'Your photo is never stored — it is only used for the search.' },
    'cl.scanInit':      { fr: 'Initialisation du moteur…', en: 'Initialising the engine…' },
    'cl.scanFace':      { fr: 'Analyse de votre visage…', en: 'Analysing your face…' },
    'cl.scanSample':    { fr: 'Analyse du visage…', en: 'Analysing the face…' },
    'cl.noFaceTitle':   { fr: 'Aucun visage détecté', en: 'No face detected' },
    'cl.noFaceHint':    { fr: 'Essayez une photo plus nette, de face et bien éclairée.', en: 'Try a sharper, well-lit, front-facing photo.' },
    'cl.retry':         { fr: 'Réessayer', en: 'Try again' },
    'cl.faceFound':     { fr: 'photos trouvées', en: 'photos found' },
    'cl.faceNoMatch':   { fr: 'Aucune correspondance dans cette galerie.', en: 'No match in this gallery.' },
    'cl.faceClose':     { fr: 'Fermer', en: 'Close' }
  };

  function t(key) {
    var e = DICT[key];
    if (!e) { console.warn('NVI18n: clé inconnue', key); return key; }
    return e[lang] != null ? e[lang] : e.fr;
  }
  function pick(fr, en) { return (lang === 'en' && en) ? en : fr; }

  function setLang(l) {
    if (l !== 'fr' && l !== 'en') return;
    if (l === lang) return;
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    try { document.documentElement.lang = l; } catch (e) {}
    listeners.forEach(function (cb) { try { cb(l); } catch (e) {} });
    // Déclenche aussi un re-render via le store (mécanisme fiable qui survit aux
    // remontages de composants), au cas où une page n'écoute pas onChange.
    try { if (window.NVStore && window.NVStore.ping) window.NVStore.ping(); } catch (e) {}
  }

  // Objet « chrome » partagé : nav + bouton FR/EN. `active` surligne un onglet.
  function ui(active) {
    var on = 'var(--ink)', off = 'var(--muted)';
    function navStyle(key) { return 'text-decoration:none;color:' + (active === key ? on : off) + ';'; }
    var langBtn = function (l) {
      return 'border:none;background:none;cursor:pointer;font-family:inherit;font-size:13px;padding:0 2px;letter-spacing:-.01em;color:' + (lang === l ? on : 'var(--faint)') + ';font-weight:' + (lang === l ? '500' : '400') + ';';
    };
    return {
      lang: lang,
      navHome: t('nav.home'), navGalleries: t('nav.galleries'), navClient: t('nav.client'), navContact: t('nav.contact'),
      menuLabel: t('nav.menu'),
      navHomeStyle: navStyle('home'), navGalleriesStyle: navStyle('galleries'),
      navClientStyle: navStyle('client'), navContactStyle: navStyle('contact'),
      setFr: function () { setLang('fr'); }, setEn: function () { setLang('en'); },
      frBtn: langBtn('fr'), enBtn: langBtn('en'),
      langWrap: 'display:flex;align-items:center;gap:2px;'
    };
  }

  window.NVI18n = {
    get lang() { return lang; },
    t: t, pick: pick, setLang: setLang,
    toggle: function () { setLang(lang === 'fr' ? 'en' : 'fr'); },
    onChange: function (cb) { listeners.push(cb); return function () { listeners = listeners.filter(function (x) { return x !== cb; }); }; },
    ui: ui
  };
})();

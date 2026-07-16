/* ============================================================================
   NVBackend — adaptateur de base de données (Supabase)
   ----------------------------------------------------------------------------
   Sépare la PERSISTANCE de l'interface. store.js garde son API synchrone
   (get/subscribe/update) ; ce module se charge, en mode 'supabase', de :

     1. HYDRATER   le cache local depuis la base au démarrage (cache-then-network)
     2. POUSSER    les écritures vers la base (diff par lignes, optimiste)
     3. TEMPS RÉEL écouter les changements et réinjecter dans le cache

   En mode 'local', ce fichier ne fait rien (aucune lib chargée, aucun réseau).

   Schéma des tables : voir docs/SCHEMA.md.
   ----------------------------------------------------------------------------
   Mapping JS (camelCase) <-> base (snake_case) :
     site       -> 1 ligne { id:'main', data: jsonb }  (brand/hero/home/about/contact/settings/sampleFaces/version)
     galleries  -> 1 ligne / galerie
     photos     -> 1 ligne / photo  (src = URL externe ; les fichiers ne sont PAS en base)
     clients    -> 1 ligne / client (password_hash géré côté serveur, jamais lu ici)
     messages   -> 1 ligne / message
   ============================================================================ */
(function () {
  var LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  var SINGLETON_KEYS = ['brand', 'hero', 'home', 'about', 'contact', 'settings', 'sampleFaces', 'version'];
  var TABLES = ['site', 'galleries', 'photos', 'clients', 'messages'];

  var _client = null;       // client supabase-js (lazy)
  var _clientPromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve();
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('Chargement de supabase-js impossible')); };
      document.head.appendChild(s);
    });
  }

  function getClient() {
    if (_client) return Promise.resolve(_client);
    if (_clientPromise) return _clientPromise;
    var cfg = (window.NV_CONFIG || {}).supabase || {};
    if (!cfg.url || !cfg.anonKey) return Promise.reject(new Error('NV_CONFIG.supabase.url / anonKey manquants'));
    _clientPromise = loadScript(LIB).then(function () {
      _client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true } });
      return _client;
    });
    return _clientPromise;
  }

  /* ---------- Mapping ligne <-> objet JS ---------- */
  var MAP = {
    galleries: {
      toRow: function (g) {
        return { id: g.id, slug: g.slug, name: g.name, description: g.desc || '',
          photo_ids: g.photoIds || [], cover_id: g.coverId || null, private: !!g.private,
          client_id: g.clientId || null, face_search: !!g.faceSearch,
          total: (g.total != null ? g.total : null), sub: (g.sub != null ? g.sub : null) };
      },
      fromRow: function (r) {
        var g = { id: r.id, slug: r.slug, name: r.name, desc: r.description || '',
          photoIds: r.photo_ids || [], coverId: r.cover_id || null, private: !!r.private,
          clientId: r.client_id || null, faceSearch: !!r.face_search };
        if (r.total != null) g.total = r.total;
        if (r.sub != null) g.sub = r.sub;
        return g;
      }
    },
    photos: {
      toRow: function (p) {
        return { id: p.id, gallery: p.gallery || null, file: p.file || null, src: p.src || null,
          faces: p.faces || [], scanned: !!p.scanned, uploaded_at: p.uploadedAt || null };
      },
      fromRow: function (r) {
        return { id: r.id, gallery: r.gallery, file: r.file, src: r.src,
          faces: r.faces || [], scanned: !!r.scanned, uploadedAt: r.uploaded_at };
      }
    },
    clients: {
      // password_hash JAMAIS écrit ici : géré via RPC nv_set_client_password
      toRow: function (c) {
        return { id: c.id, name: c.name, email: c.email,
          gallery_ids: c.galleryIds || [], like_limit: c.likeLimit || 0,
          likes: c.likes || {}, invoices: c.invoices || [] };
      },
      fromRow: function (r) {
        return { id: r.id, name: r.name, email: r.email, password: '',
          galleryIds: r.gallery_ids || [], likeLimit: r.like_limit || 0,
          likes: r.likes || {}, invoices: r.invoices || [] };
      }
    },
    messages: {
      toRow: function (m) {
        return { id: m.id, name: m.name, email: m.email, type: m.type, body: m.body, date: m.date };
      },
      fromRow: function (r) {
        return { id: r.id, name: r.name, email: r.email, type: r.type, body: r.body, date: r.date };
      }
    }
  };

  function toMap(arr, key) { var m = {}; (arr || []).forEach(function (x) { m[x[key || 'id']] = x; }); return m; }
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  /* Diff générique d'une collection indexée par id -> { upserts, deletes } */
  function diff(prevMap, nextMap) {
    var upserts = [], deletes = [];
    Object.keys(nextMap).forEach(function (id) {
      if (!prevMap[id] || !eq(prevMap[id], nextMap[id])) upserts.push(nextMap[id]);
    });
    Object.keys(prevMap).forEach(function (id) { if (!nextMap[id]) deletes.push(id); });
    return { upserts: upserts, deletes: deletes };
  }

  /* ====================================================================== */
  function create(opts) {
    // opts: { config, getState, ingest, seed }
    var ingest = opts.ingest;
    var getState = opts.getState;
    var onStatus = opts.onStatus || function () {};
    var bootstrapIfEmpty = (opts.config || {}).bootstrapIfEmpty !== false;
    var wantRealtime = ((opts.config || {}).realtime) !== false;

    var last = null;          // dernier état connu côté base (pour differ)
    var hydrating = false;
    var rtChannel = null;
    var rtTimer = null;

    // --- Debounce + file de retry hors-ligne + anti-écho temps réel ---
    var DEBOUNCE_MS = 400;
    var flushTimer = null;
    var pushing = false;      // un push est en vol
    var dirty = false;        // l'état local diffère de `last`, à pousser
    var retryDelay = 0;       // backoff courant
    var lastPushAt = 0;       // horodatage du dernier push réussi (anti-écho)
    var ECHO_MS = 6000;       // fenêtre pendant laquelle on ignore nos propres échos (élargie : latence realtime)
    var LOCAL_EDIT_MS = 4000;   // on ne ré-hydrate pas si l'utilisateur a saisi dans cette fenêtre
    var lastLocalEditAt = 0;    // horodatage de la dernière écriture locale (saisie)

    /* ---- HYDRATER : lire toutes les tables -> assembler un state -> ingest ---- */
    function hydrate() {
      if (hydrating) return Promise.resolve();
      hydrating = true;
      return getClient().then(function (db) {
        return Promise.all([
          db.from('site').select('*').limit(1),
          db.from('galleries').select('*'),
          db.from('photos').select('*'),
          db.from('clients').select('id,name,email,gallery_ids,like_limit,likes,invoices'),
          db.from('messages').select('*').order('date', { ascending: false })
        ]);
      }).then(function (res) {
        res.forEach(function (r) { if (r.error) throw r.error; });
        var siteRow = res[0].data && res[0].data[0];
        var galleries = (res[1].data || []).map(MAP.galleries.fromRow);
        var photosArr = (res[2].data || []).map(MAP.photos.fromRow);
        var clients = (res[3].data || []).map(MAP.clients.fromRow);
        var messages = (res[4].data || []).map(MAP.messages.fromRow);

        var empty = !siteRow && galleries.length === 0 && photosArr.length === 0;
        if (empty && bootstrapIfEmpty) {
          // Base vierge : on y pousse le contenu de démo déjà chargé en local.
          hydrating = false;
          var seedState = getState();
          last = emptyState();           // force un diff complet -> tout est inséré
          return doPush(seedState);      // last <- seedState + lastPushAt mis à jour
        }

        var photos = {};
        photosArr.forEach(function (p) { photos[p.id] = p; });
        var data = (siteRow && siteRow.data) || {};
        var state = {
          version: data.version || 5,
          brand: data.brand, hero: data.hero, home: data.home,
          about: data.about, contact: data.contact, settings: data.settings,
          sampleFaces: data.sampleFaces || [],
          galleries: galleries, photos: photos, clients: clients, messages: messages
        };
        last = clone(state);
        hydrating = false;
        if (pushing || dirty) { console.warn('NVBackend: hydratation ignoree (edition locale en cours).'); onStatus('conflict'); return; }
        ingest(state);
        onStatus('saved');
      }).catch(function (e) {
        hydrating = false;
        console.warn('NVBackend: hydratation impossible, on reste sur le cache local.', e);
      });
    }

    function emptyState() {
      return { version: 0, galleries: [], photos: {}, clients: [], messages: [], sampleFaces: [] };
    }

    /* ---- POUSSER : diff state courant vs `last` -> upsert/delete par table ---- */
    function doPush(state) {
      return getClient().then(function (db) {
        var prev = last || emptyState();
        var ops = [];

        // -- site (singletons) : 1 ligne blob --
        var nextSingleton = {}, prevSingleton = {};
        SINGLETON_KEYS.forEach(function (k) { nextSingleton[k] = state[k]; prevSingleton[k] = prev[k]; });
        if (!eq(prevSingleton, nextSingleton)) {
          ops.push(db.from('site').upsert({ id: 'main', data: nextSingleton }));
        }

        // -- galleries --
        var gd = diff(toMap(prev.galleries), toMap(state.galleries));
        if (gd.upserts.length) ops.push(db.from('galleries').upsert(gd.upserts.map(MAP.galleries.toRow)));
        if (gd.deletes.length) ops.push(db.from('galleries').delete().in('id', gd.deletes));

        // -- photos (map id->photo) --
        var pd = diff(prev.photos || {}, state.photos || {});
        if (pd.upserts.length) ops.push(db.from('photos').upsert(pd.upserts.map(MAP.photos.toRow)));
        if (pd.deletes.length) ops.push(db.from('photos').delete().in('id', pd.deletes));

        // -- clients (mot de passe traité à part, via RPC serveur) --
        var prevC = toMap(prev.clients), nextC = toMap(state.clients);
        var cd = diff(prevC, nextC);
        if (cd.upserts.length) ops.push(db.from('clients').upsert(cd.upserts.map(MAP.clients.toRow)));
        if (cd.deletes.length) ops.push(db.from('clients').delete().in('id', cd.deletes));
        // changements de mot de passe -> hash côté serveur (APRÈS l'upsert de la
        // ligne client, sinon l'UPDATE pourrait précéder l'INSERT).
        var pwOps = [];
        Object.keys(nextC).forEach(function (id) {
          var nc = nextC[id], pc = prevC[id];
          var changed = nc.password && (!pc || pc.password !== nc.password);
          if (changed) pwOps.push({ id: id, password: nc.password });
        });

        // -- messages --
        var md = diff(toMap(prev.messages), toMap(state.messages));
        if (md.upserts.length) ops.push(db.from('messages').upsert(md.upserts.map(MAP.messages.toRow)));
        if (md.deletes.length) ops.push(db.from('messages').delete().in('id', md.deletes));

        if (!ops.length && !pwOps.length) return;
        return Promise.all(ops).then(function (results) {
          results.forEach(function (r) { if (r && r.error) throw r.error; });
          if (!pwOps.length) return;
          return Promise.all(pwOps.map(function (o) {
            return db.rpc('nv_set_client_password', { p_id: o.id, p_password: o.password });
          })).then(function (rs) { rs.forEach(function (r) { if (r && r.error) throw r.error; }); });
        }).then(function () { last = clone(state); lastPushAt = Date.now(); });
      });
    }

    /* ---- Orchestration : debounce + retry hors-ligne ----
       store.js appelle push() à chaque écriture ; on regroupe (debounce) puis on
       pousse le DERNIER état. En cas d'échec (réseau coupé), on réessaie en
       backoff et au retour en ligne, sans jamais perdre d'écriture. ---- */
    function flush() {
      flushTimer = null;
      if (pushing || !dirty) return;
      pushing = true;
      onStatus('syncing');
      var snapshot = getState();
      doPush(snapshot).then(function () {
        pushing = false;
        retryDelay = 0;
        // l'état a-t-il encore bougé pendant le push ? si oui, on repart.
        if (!eq(getState(), last)) { dirty = true; onStatus('syncing'); schedule(0); }
        else { dirty = false; onStatus('saved'); }
      }).catch(function (e) {
        pushing = false;
        retryDelay = Math.min(retryDelay ? retryDelay * 2 : 1000, 30000);
        console.warn('NVBackend: push échoué, nouvel essai dans ' + retryDelay + 'ms (les données restent en cache local).', e);
        onStatus('offline');
        schedule(retryDelay);   // dirty reste true -> sera rejoué
      });
    }

    function schedule(delay) {
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, delay == null ? DEBOUNCE_MS : delay);
    }

    function push(state) {
      dirty = true;
      lastLocalEditAt = Date.now();
      if (!pushing) schedule(DEBOUNCE_MS);
      return Promise.resolve();
    }

    function onOnline() { if (dirty) schedule(0); }

    /* ---- TEMPS RÉEL : tout changement -> ré-hydrate (debounce) ---- */
    function startRealtime() {
      if (!wantRealtime) return;
      getClient().then(function (db) {
        rtChannel = db.channel('nv-site');
        TABLES.forEach(function (t) {
          rtChannel.on('postgres_changes', { event: '*', schema: 'public', table: t }, function () {
            // Ignore nos propres échos : un push qu'on vient de faire revient en
            // notification ; inutile (et risqué pendant une saisie) de ré-hydrater.
            if (Date.now() - lastPushAt < ECHO_MS) return;   // notre propre écho
            if (Date.now() - lastLocalEditAt < LOCAL_EDIT_MS) return;   // saisie locale en cours : ne pas écraser le champ
            if (pushing || dirty) {
              // Changement distant CONCURRENT alors qu'on a des écritures locales
              // en attente : le prochain push écrasera ce changement. On prévient.
              console.warn('NVBackend: écriture distante concurrente détectée pendant une modification locale ; vos changements vont primer (last-write-wins).');
              onStatus('conflict');
              return;
            }
            clearTimeout(rtTimer);
            rtTimer = setTimeout(function () {
              if (pushing || dirty) return;   // une écriture locale a démarré entre-temps
              if (Date.now() - lastLocalEditAt < LOCAL_EDIT_MS) return;   // saisie locale récente
              hydrate();
            }, 250);
          });
        });
        rtChannel.subscribe();
      }).catch(function () {});
    }

    return {
      start: function () {
        if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', onOnline);
        hydrate().then(startRealtime);
      },
      push: function (state) { return push(state); },
      stop: function () {
        if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('online', onOnline);
        if (rtChannel && _client) { try { _client.removeChannel(rtChannel); } catch (e) {} }
      }
    };
  }

  window.NVBackend = {
    create: create,
    // RPC générique (utilisé par NVAuth) — renvoie data ou lève l'erreur.
    rpc: function (name, args) {
      return getClient().then(function (db) {
        return db.rpc(name, args || {}).then(function (r) { if (r.error) throw r.error; return r.data; });
      });
    },
    client: getClient
  };
})();

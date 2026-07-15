/* ============================================================================
   NVAuth — couche d'authentification isolée
   ----------------------------------------------------------------------------
   Les pages n'inspectent plus jamais un mot de passe : elles appellent NVAuth,
   qui choisit l'implémentation selon NV_CONFIG.backend.

   API (toujours asynchrone — renvoie des Promises) :
     NVAuth.loginClient(email, password) -> Promise<clientId | null>
     NVAuth.loginAdmin(pin)              -> Promise<boolean>
     NVAuth.logoutClient()               -> void
     NVAuth.currentClientId()            -> string | null
     NVAuth.isAdmin()                    -> boolean
     NVAuth.lockAdmin()                  -> void

   • Mode 'local'    : compare aux données du store (mots de passe en clair, démo).
   • Mode 'supabase' : vérification CÔTÉ SERVEUR via fonctions RPC qui hashent
                       avec pgcrypto/bcrypt. Aucun mot de passe en clair côté client.
                       (RPC définies dans docs/SCHEMA.md : nv_login_client, nv_check_admin)
   ============================================================================ */
(function () {
  var CFG = window.NV_CONFIG || {};
  var REMOTE = CFG.backend === 'supabase';
  var CLIENT_KEY = 'nv_client_id';
  var ADMIN_KEY = 'nv_admin';

  /* --- SHA-256 compact (synchrone, sans dépendance) ---------------------
     Sert à ne jamais stocker le code admin en clair (settings.adminPinHash).
     En mode Supabase, la vérification reste côté serveur (bcrypt). */
  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var maxWord = Math.pow(2, 32), result = '';
    var words = [], asciiBitLength = ascii.length * 8;
    var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [];
    var primeCounter = k.length, isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i2 = 0; i2 < 313; i2 += candidate) isComposite[i2] = candidate;
        hash[primeCounter] = (Math.pow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (var i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);
    for (var jj = 0; jj < words.length;) {
      var w = words.slice(jj, jj += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (var i3 = 0; i3 < 64; i3++) {
        var w15 = w[i3 - 15], w2 = w[i3 - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i3]
          + (w[i3] = (i3 < 16) ? w[i3] : (w[i3 - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i3 - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (var i4 = 0; i4 < 8; i4++) hash[i4] = (hash[i4] + oldHash[i4]) | 0;
    }
    for (var i5 = 0; i5 < 8; i5++) {
      for (var b = 3; b + 1; b--) {
        var byteN = (hash[i5] >> (b * 8)) & 255;
        result += ((byteN < 16) ? 0 : '') + byteN.toString(16);
      }
    }
    return result;
  }
  // Sel fixe côté client : évite les tables arc-en-ciel triviales sur un code court.
  function hashPin(pin) { return sha256('nv-admin::' + String(pin)); }

  function setClientSession(id) { try { sessionStorage.setItem(CLIENT_KEY, id); } catch (e) {} }
  function setAdminSession() { try { sessionStorage.setItem(ADMIN_KEY, '1'); } catch (e) {} }

  /* --- Implémentation LOCALE (démo) : compare aux données du store --- */
  var local = {
    loginClient: function (email, password) {
      var s = window.NVStore && window.NVStore.get();
      if (!s) return Promise.resolve(null);
      var m = (s.clients || []).find(function (c) {
        return c.email && c.email.toLowerCase() === String(email).trim().toLowerCase() && c.password === password;
      });
      if (m) { setClientSession(m.id); return Promise.resolve(m.id); }
      return Promise.resolve(null);
    },
    loginAdmin: function (pin) {
      var s = window.NVStore && window.NVStore.get();
      if (!s) return Promise.resolve(false);
      var st = s.settings || {};
      var ok;
      if (st.adminPinHash) ok = hashPin(pin) === st.adminPinHash;
      else ok = String(pin) === String(st.adminPin || '1234');
      if (ok) setAdminSession();
      return Promise.resolve(ok);
    }
  };

  /* --- Implémentation SUPABASE : vérification serveur (pgcrypto/bcrypt) --- */
  var remote = {
    loginClient: function (email, password) {
      if (!window.NVBackend || !window.NVBackend.rpc) return Promise.resolve(null);
      return window.NVBackend.rpc('nv_login_client', {
        p_email: String(email).trim().toLowerCase(),
        p_password: password
      }).then(function (rows) {
        var id = rows && rows[0] && rows[0].id;
        if (id) { setClientSession(id); return id; }
        return null;
      }).catch(function (e) { console.warn('NVAuth: échec login client', e); return null; });
    },
      loginAdmin: function (email, password) {
                 if (!window.NVBackend || !window.NVBackend.client) return Promise.resolve(false);
                 return window.NVBackend.client().then(function (db) {
                              return db.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password: password });
                 }).then(function (res) { var ok = !!(res && res.data && res.data.session && !res.error); if (ok) setAdminSession(); return ok; })
                   .catch(function (e) { console.warn('NVAuth: échec login admin', e); return false; });
    }
  };

  var impl = REMOTE ? remote : local;

  window.NVAuth = {
    loginClient: function (email, password) { return impl.loginClient(email, password); },
        loginAdmin: function (email, password) { return impl.loginAdmin(email, password); },
    logoutClient: function () { try { sessionStorage.removeItem(CLIENT_KEY); } catch (e) {} },
    currentClientId: function () { try { return sessionStorage.getItem(CLIENT_KEY); } catch (e) { return null; } },
    isAdmin: function () { try { return sessionStorage.getItem(ADMIN_KEY) === '1'; } catch (e) { return false; } },
        lockAdmin: function () { try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) {} if (REMOTE && window.NVBackend && window.NVBackend.client) { window.NVBackend.client().then(function (db) { db.auth.signOut(); }).catch(function () {}); } },
    // Hachage du code admin (utilisé par l'admin pour enregistrer un nouveau code).
    hashPin: hashPin
  };
})();

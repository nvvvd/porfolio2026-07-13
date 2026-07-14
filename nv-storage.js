/* ============================================================================
   NVStorage — téléversement des photos vers un stockage EXTERNE
   ----------------------------------------------------------------------------
   Garde les fichiers hors de la base : on n'y enregistre qu'une URL.

   NVStorage.upload(data, filename) -> Promise<url>
     • data : un dataURL ("data:image/jpeg;base64,…") OU un Blob.
     • Si NV_CONFIG.storage.uploadEndpoint est défini : POST multipart
       (champ "file") -> attend une réponse JSON { "url": "https://…" }.
     • Sinon (démo) : renvoie le dataURL tel quel (base64 en base) avec un
       avertissement unique dans la console.

   NVStorage.enabled() -> true si un endpoint distant est configuré.
   ============================================================================ */
(function () {
  var warned = false;

  function cfg() { return (window.NV_CONFIG && window.NV_CONFIG.storage) || {}; }

  function dataURLToBlob(dataURL) {
    var parts = String(dataURL).split(',');
    var mime = (parts[0].match(/:(.*?);/) || [null, 'image/jpeg'])[1];
    var bin = atob(parts[1] || '');
    var n = bin.length, u8 = new Uint8Array(n);
    while (n--) u8[n] = bin.charCodeAt(n);
    return new Blob([u8], { type: mime });
  }

  function blobToDataURL(blob) {
    return new Promise(function (resolve) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.readAsDataURL(blob);
    });
  }

  window.NVStorage = {
    enabled: function () { return !!cfg().uploadEndpoint; },

    upload: function (data, filename) {
      var endpoint = cfg().uploadEndpoint;
      if (!endpoint) {
        if (!warned) {
          warned = true;
          console.warn('NVStorage : aucun uploadEndpoint configuré — les photos restent en base64 (mode démo). Voir docs/MIGRATION.md, étape 4.');
        }
        return (typeof data === 'string') ? Promise.resolve(data) : blobToDataURL(data);
      }
      var blob = (typeof data === 'string') ? dataURLToBlob(data) : data;
      var fd = new FormData();
      fd.append('file', blob, filename || ('photo-' + Date.now() + '.jpg'));
      var headers = cfg().uploadToken ? { 'X-Upload-Token': cfg().uploadToken } : undefined;
      return fetch(endpoint, { method: 'POST', body: fd, headers: headers }).then(function (res) {
        if (!res.ok) throw new Error('Upload HTTP ' + res.status);
        return res.json();
      }).then(function (json) {
        if (!json || !json.url) throw new Error('Réponse d\'upload sans champ "url"');
        return json.url;
      });
    },

    /* ------------------------------------------------------------------------
       migrateBase64() — déplace vers le stockage externe les images encore en
       base64 dans la base (photos uploadées AVANT la config de l'endpoint).
       Parcourt tout l'état du store, repère les "data:image/…", les téléverse,
       puis remplace chaque src par son URL. Idempotent : relançable sans risque.

       Usage (console, connecté en admin, endpoint configuré) :
         await NVStorage.migrateBase64();
         await NVStorage.migrateBase64({ dryRun: true });   // simulation
       Renvoie { found, migrated, failed }.
       ------------------------------------------------------------------------ */
    migrateBase64: function (opts) {
      opts = opts || {};
      var self = this;
      if (!this.enabled() && !opts.dryRun) {
        return Promise.reject(new Error('Aucun uploadEndpoint configuré — rien à migrer. Voir docs/MIGRATION.md, étape 4.'));
      }
      if (!window.NVStore) return Promise.reject(new Error('NVStore indisponible.'));

      // Collecte des chemins menant à une string "data:image…".
      var targets = [];
      (function walk(node, path) {
        if (typeof node === 'string') {
          if (/^data:image\//i.test(node)) targets.push({ path: path.slice(), value: node });
          return;
        }
        if (Array.isArray(node)) { node.forEach(function (v, i) { walk(v, path.concat(i)); }); return; }
        if (node && typeof node === 'object') { Object.keys(node).forEach(function (k) { walk(node[k], path.concat(k)); }); }
      })(window.NVStore.get(), []);

      var result = { found: targets.length, migrated: 0, failed: 0 };
      if (opts.dryRun) { console.log('NVStorage.migrateBase64 (simulation) :', result.found, 'image(s) base64 à migrer.'); return Promise.resolve(result); }
      if (!targets.length) return Promise.resolve(result);

      // Upload séquentiel (évite de saturer l'endpoint), puis remplacement en place.
      var i = 0;
      function next() {
        if (i >= targets.length) {
          window.NVStore.save();   // persiste + push distant
          console.log('NVStorage.migrateBase64 terminé :', result);
          return result;
        }
        var t = targets[i++];
        return self.upload(t.value, 'migrated-' + i + '.jpg').then(function (url) {
          // pose la nouvelle valeur au chemin enregistré
          var node = window.NVStore.get();
          for (var k = 0; k < t.path.length - 1; k++) node = node[t.path[k]];
          node[t.path[t.path.length - 1]] = url;
          result.migrated++;
        }).catch(function (e) {
          result.failed++;
          console.warn('NVStorage.migrateBase64 : échec sur', t.path.join('.'), e);
        }).then(next);
      }
      return Promise.resolve().then(next);
    }
  };
})();

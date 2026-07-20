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

  /* Compression automatique avant upload : borne le grand côté à maxDim px et
     ré-encode en JPEG (q .82). Une photo 24 Mpx de 6 Mo devient ~350 Ko — le
     principal levier PageSpeed mobile. PNG avec transparence : conservé tel quel. */
  function compressBlob(blob) {
    var maxDim = cfg().maxDimension || 2000;
    var quality = cfg().jpegQuality || 0.82;
    if (!/^image\/(jpe?g|png|webp)/i.test(blob.type || '')) return Promise.resolve(blob);
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxDim / Math.max(w, h));
        // Déjà petite et déjà JPEG raisonnable → inutile de ré-encoder.
        if (scale === 1 && /jpe?g/i.test(blob.type) && blob.size < 600 * 1024) return resolve(blob);
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
        cv.toBlob(function (out) {
          // Sécurité : si la compression échoue ou grossit le fichier, on garde l'original.
          resolve(out && out.size < blob.size ? out : blob);
        }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(blob); };
      img.src = url;
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
      var raw = (typeof data === 'string') ? dataURLToBlob(data) : data;
      return compressBlob(raw).then(function (blob) {
      var fd = new FormData();
      fd.append('file', blob, (filename || ('photo-' + Date.now())).replace(/\.(png|webp)$/i, '.jpg'));
      var headers = cfg().uploadToken ? { 'X-Upload-Token': cfg().uploadToken } : undefined;
      return fetch(endpoint, { method: 'POST', body: fd, headers: headers }).then(function (res) {
        if (!res.ok) throw new Error('Upload HTTP ' + res.status);
        return res.json();
      }).then(function (json) {
        if (!json || !json.url) throw new Error('Réponse d\'upload sans champ "url"');
        return json.url;
      });
      });
    },

    /* ------------------------------------------------------------------------
       recompressAll() — migration en masse : re-télécharge chaque photo déjà
       en ligne (URL http/https), la compresse (2000px / JPEG q.82 via le même
       pipeline que l'upload), la re-téléverse et remplace l'URL en base.
       Nécessite que le bucket autorise la lecture (public) et l'endpoint d'upload.

       Usage (console du site, connecté en admin) :
         await NVStorage.recompressAll({ dryRun: true });   // simulation : liste ce qui serait fait
         await NVStorage.recompressAll();                   // migration réelle
         await NVStorage.recompressAll({ minKB: 800 });     // ne traite que les fichiers > 800 Ko
       Idempotent : les images déjà légères sont sautées ; relançable sans risque.
       Renvoie { found, done, skipped, failed, savedMB }.
       ------------------------------------------------------------------------ */
    recompressAll: function (opts) {
      opts = opts || {};
      var self = this, minBytes = (opts.minKB || 500) * 1024;
      if (!this.enabled()) return Promise.reject(new Error('Aucun uploadEndpoint configuré.'));
      if (!window.NVStore) return Promise.reject(new Error('NVStore indisponible.'));

      var targets = [];
      (function walk(node, path) {
        if (typeof node === 'string') {
          if (/^https?:\/\//i.test(node) && /(\.jpe?g|\.png|\.webp)(\?|$)/i.test(node)) targets.push({ path: path.slice(), url: node });
          else if (/^https?:\/\//i.test(node) && /\/uploads\//.test(node)) targets.push({ path: path.slice(), url: node });
          return;
        }
        if (Array.isArray(node)) { node.forEach(function (v, i) { walk(v, path.concat(i)); }); return; }
        if (node && typeof node === 'object') { Object.keys(node).forEach(function (k) { walk(node[k], path.concat(k)); }); }
      })(window.NVStore.get(), []);
      // Dé-doublonne par URL (une même URL peut apparaître à plusieurs endroits).
      var byUrl = {};
      targets.forEach(function (t) { (byUrl[t.url] = byUrl[t.url] || []).push(t.path); });
      var urls = Object.keys(byUrl);

      var result = { found: urls.length, done: 0, skipped: 0, failed: 0, savedMB: 0 };
      if (opts.dryRun) { console.log('NVStorage.recompressAll (simulation) :', urls.length, 'URL(s) candidates.', urls); return Promise.resolve(result); }

      var i = 0;
      function setUrl(paths, url) {
        paths.forEach(function (path) {
          var node = window.NVStore.get();
          for (var k = 0; k < path.length - 1; k++) node = node[path[k]];
          node[path[path.length - 1]] = url;
        });
      }
      function next() {
        if (i >= urls.length) {
          window.NVStore.save();
          result.savedMB = Math.round(result.savedMB * 10) / 10;
          console.log('NVStorage.recompressAll terminé :', result);
          return result;
        }
        var url = urls[i++];
        return fetch(url).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.blob();
        }).then(function (blob) {
          if (blob.size < minBytes) { result.skipped++; console.log('→ sauté (déjà léger, ' + Math.round(blob.size / 1024) + ' Ko) :', url); return; }
          return compressBlob(blob).then(function (small) {
            if (small.size >= blob.size * 0.9) { result.skipped++; return; }
            return self.upload(small, 'recompressed-' + Date.now() + '.jpg').then(function (newUrl) {
              setUrl(byUrl[url], newUrl);
              result.done++;
              result.savedMB += (blob.size - small.size) / 1048576;
              console.log('✓ ' + Math.round(blob.size / 1024) + ' Ko → ' + Math.round(small.size / 1024) + ' Ko :', url);
            });
          });
        }).catch(function (e) {
          result.failed++;
          console.warn('NVStorage.recompressAll : échec sur', url, e.message || e);
        }).then(next);
      }
      return Promise.resolve().then(next);
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

/* ============================================================================
   UPLOAD-WORKER.JS — Cloudflare Worker : upload direct de l'admin vers R2
   ----------------------------------------------------------------------------
   Reçoit un POST multipart (champ "file"), écrit le fichier dans le bucket R2
   et répond { "url": "https://…" } — exactement le contrat attendu par
   NV_CONFIG.storage.uploadEndpoint.

   MISE EN PLACE (5 minutes) :
   1. Cloudflare → Workers & Pages → Create → Worker (nom : ex. "nv-upload")
      → Deploy, puis "Edit code" → remplacez tout par CE fichier → Deploy.
   2. Worker → Settings → Bindings → Add → R2 bucket :
        Variable name : BUCKET      Bucket : nicolasvvd
   3. Worker → Settings → Variables and secrets → Add :
        PUBLIC_BASE_URL = https://pub-xxxxxxxx.r2.dev   (l'URL publique du bucket)
        UPLOAD_TOKEN    = un-secret-de-votre-choix      (type "Secret", recommandé)
   4. Dans nv-config.js :
        storage: {
          baseUrl: '',   // inutile : le worker renvoie des URLs absolues
          uploadEndpoint: 'https://nv-upload.VOTRE-SOUS-DOMAINE.workers.dev',
          uploadToken: 'un-secret-de-votre-choix',       // le même qu'à l'étape 3
        },
   ============================================================================ */

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Token',
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST attendu' }, 405);

    // Jeton simple : sans lui, n'importe qui pourrait remplir votre bucket.
    if (env.UPLOAD_TOKEN && request.headers.get('X-Upload-Token') !== env.UPLOAD_TOKEN) {
      return json({ error: 'Jeton invalide' }, 401);
    }

    let file;
    try { file = (await request.formData()).get('file'); } catch (e) { /* pas multipart */ }
    if (!file || typeof file === 'string') return json({ error: 'Champ "file" manquant' }, 400);
    if (!/^image\//.test(file.type || '')) return json({ error: 'Images uniquement' }, 415);

    // Clé unique : uploads/AAAA-MM/uuid.ext (le nom d'origine n'écrase jamais rien)
    const ext = ((file.name || '').match(/\.[a-z0-9]{2,5}$/i) || ['.jpg'])[0].toLowerCase();
    const key = 'uploads/' + new Date().toISOString().slice(0, 7) + '/' + crypto.randomUUID() + ext;

    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' },
    });

    const base = String(env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    return json({ url: base + '/' + key });
  },
};

/* ============================================================================
   UPLOAD-WORKER.JS — Cloudflare Worker : upload direct de l'admin vers R2
   ----------------------------------------------------------------------------
   Variables d'environnement attendues (Worker → Settings → Variables) :
     • PUBLIC_BASE_URL  URL publique du bucket (ex. https://images.nicolasvivaudou.com)
     • UPLOAD_TOKEN     (hérité, à supprimer) jeton statique X-Upload-Token
     • BUCKET           liaison R2
     • ALLOWED_ORIGINS  (optionnel) origines autorisées, séparées par des virgules
     • SUPABASE_URL     ex. https://xxxx.supabase.co  — active la vérification de session
     • SUPABASE_ANON_KEY clé publique "anon" du projet
     • REQUIRE_AUTH     'true' -> SEULE une session admin Supabase est acceptée
                        (le jeton statique X-Upload-Token est alors refusé)
   ============================================================================ */

const DEFAULT_ORIGINS = [
  'https://www.nicolasvivaudou.com',
  'https://nicolasvivaudou.com',
];

const MAX_BYTES = 25 * 1024 * 1024;   // 25 Mo par fichier

export default {
  async fetch(request, env) {
    const allowed = String(env.ALLOWED_ORIGINS || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const origins = allowed.length ? allowed : DEFAULT_ORIGINS;
    const origin = request.headers.get('Origin');

    // Une page tierce ne doit pas pouvoir téléverser dans le bucket : on
    // n'autorise que les origines connues. Une requête sans Origin (curl,
    // script serveur) reste possible mais exige le jeton.
    const originOk = !origin || origins.includes(origin);

    const cors = {
      'Access-Control-Allow-Origin': origin && originOk ? origin : origins[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      // « Authorization » doit figurer ici : sans lui, le navigateur refuse la
      // requête au moment du contrôle préalable (OPTIONS) et l'envoi n'a jamais
      // lieu — l'admin voit « téléversement impossible » sans autre explication.
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Upload-Token',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    /* La route GET /read a été retirée. Elle relayait N'IMPORTE QUEL objet du bucket
       vers n'importe quelle origine, factures PDF comprises. La lecture des images
       passe désormais par images.nicolasvivaudou.com, qui ne sert que le bucket
       public et applique sa propre politique CORS.
       Ce worker n'accepte plus que POST (téléversement authentifié). */
    if (request.method === 'GET') {
      return new Response('POST attendu', { status: 405, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    if (!originOk) return json({ error: 'Origine non autorisée' }, 403);
    if (request.method !== 'POST') return json({ error: 'POST attendu' }, 405);

    /* Autorisation. Deux voies :
       1. Session Supabase — l'admin connecté envoie « Authorization: Bearer <jeton> ».
          Le jeton est validé auprès de Supabase : il expire, il est révocable, et
          il n'est PAS lisible dans le code source du site. C'est la voie sûre.
       2. Jeton statique X-Upload-Token — hérité. Il vit dans nv-config.js, donc
          il est PUBLIC : n'importe qui peut le lire et téléverser. Ne le gardez
          que le temps de vérifier que la voie 1 fonctionne, puis passez
          REQUIRE_AUTH='true' pour le désactiver. */
    const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    let sessionOk = false;
    if (bearer && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
      try {
        const r = await fetch(String(env.SUPABASE_URL).replace(/\/+$/, '') + '/auth/v1/user', {
          headers: { Authorization: 'Bearer ' + bearer, apikey: env.SUPABASE_ANON_KEY },
        });
        sessionOk = r.ok;
      } catch (e) { sessionOk = false; }
    }
    const tokenOk = !!env.UPLOAD_TOKEN && request.headers.get('X-Upload-Token') === env.UPLOAD_TOKEN;
    const strict = String(env.REQUIRE_AUTH || '') === 'true';
    if (!(sessionOk || (tokenOk && !strict))) {
      return json({ error: strict ? 'Session administrateur requise' : 'Jeton invalide' }, 401);
    }

    let file;
    try { file = (await request.formData()).get('file'); } catch (e) { /* pas multipart */ }
    if (!file || typeof file === 'string') return json({ error: 'Champ "file" manquant' }, 400);
    if (!/^image\/|^application\/pdf$/.test(file.type || '')) return json({ error: 'Images ou PDF uniquement' }, 415);
    if (typeof file.size === 'number' && file.size > MAX_BYTES) {
      return json({ error: 'Fichier trop volumineux (max 25 Mo)' }, 413);
    }

    const ext = ((file.name || '').match(/\.[a-z0-9]{2,5}$/i) || [file.type === 'application/pdf' ? '.pdf' : '.jpg'])[0].toLowerCase();
    const key = 'uploads/' + new Date().toISOString().slice(0, 7) + '/' + crypto.randomUUID() + ext;

    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable', contentDisposition: file.type === 'application/pdf' ? 'inline' : undefined },
    });

    const base = String(env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    return json({ url: base + '/' + key });
  },
};

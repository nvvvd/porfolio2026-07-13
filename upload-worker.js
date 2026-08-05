/* ============================================================================
   UPLOAD-WORKER.JS — Cloudflare Worker : upload direct de l'admin vers R2
   ----------------------------------------------------------------------------
   Variables d'environnement attendues (Worker → Settings → Variables) :
     • SUPABASE_URL       URL du projet Supabase (ex. https://xxxx.supabase.co)
     • SUPABASE_ANON_KEY  clé anon du projet (publique, sans risque)
     • ADMIN_USER_IDS     uuid des comptes autorisés, séparés par des virgules
     • PUBLIC_BASE_URL    URL publique du bucket (ex. https://cdn.exemple.com)
     • BUCKET             liaison R2
     • ALLOWED_ORIGINS    (optionnel) origines autorisées, séparées par des virgules
   ----------------------------------------------------------------------------
   AUTHENTIFICATION — remplace l'ancien secret partagé UPLOAD_TOKEN. Celui-ci
   devait être écrit dans nv-config.js : il partait donc à chaque visiteur du
   site et se retrouvait publié dans le dépôt. Désormais le navigateur envoie
   le jeton de session Supabase de l'admin connecté :
       Authorization: Bearer <access_token>
   Le worker le vérifie auprès de Supabase, puis contrôle que le compte figure
   dans ADMIN_USER_IDS. Plus aucun secret ne circule dans le code du site, et
   les jetons de session expirent d'eux-mêmes (renouvelés par supabase-js).
============================================================================ */

const DEFAULT_ORIGINS = [
  'https://www.nicolasvivaudou.com',
  'https://nicolasvivaudou.com',
];

const MAX_BYTES = 25 * 1024 * 1024; // 25 Mo par fichier

/* Vérifie le porteur : session Supabase valide + compte explicitement autorisé.
   Renvoie { ok: true, userId } ou { ok: false, status, error }. */
async function verifyAdmin(request, env) {
  const header = request.headers.get('Authorization') || '';
  const jwt = header.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return { ok: false, status: 401, error: 'Session absente' };

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return { ok: false, status: 500, error: 'Worker mal configuré : SUPABASE_URL / SUPABASE_ANON_KEY' };
  }
  const allowed = String(env.ADMIN_USER_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.length) {
    return { ok: false, status: 500, error: 'Worker mal configuré : ADMIN_USER_IDS' };
  }

  let res;
  try {
    res = await fetch(String(env.SUPABASE_URL).replace(/\/+$/, '') + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + jwt, apikey: env.SUPABASE_ANON_KEY },
    });
  } catch (e) {
    return { ok: false, status: 503, error: 'Vérification de session impossible' };
  }
  if (!res.ok) return { ok: false, status: 401, error: 'Session invalide ou expirée' };

  const user = await res.json().catch(() => null);
  if (!user || !user.id) return { ok: false, status: 401, error: 'Session invalide' };
  if (!allowed.includes(user.id)) return { ok: false, status: 403, error: 'Compte non autorisé' };

  return { ok: true, userId: user.id };
}

export default {
  async fetch(request, env) {
    const allowed = String(env.ALLOWED_ORIGINS || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const origins = allowed.length ? allowed : DEFAULT_ORIGINS;
    const origin = request.headers.get('Origin');

    // Une page tierce ne doit pas pouvoir téléverser dans le bucket : on
    // n'autorise que les origines connues. Une requête sans Origin (curl,
    // script serveur) reste possible mais exige une session admin valide.
    const originOk = !origin || origins.includes(origin);

    const cors = {
      'Access-Control-Allow-Origin': origin && originOk ? origin : origins[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Vary': 'Origin',
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    /* Lecture d'un objet du bucket AVEC en-têtes CORS.
       L'URL publique pub-*.r2.dev ignore la politique CORS du bucket : le site ne
       peut donc pas relire ses propres images pour en fabriquer les vignettes.
       Ce relais sert l'objet depuis la liaison R2, avec les en-têtes nécessaires.
       Ouvert à toutes les origines : il ne fait que relire des images DÉJÀ publiques,
       en lecture seule (aucune écriture, aucune suppression possible ici). */
    if (request.method === 'GET') {
      const u = new URL(request.url);
      if (u.pathname === '/read') {
        const key = u.searchParams.get('key') || '';
        if (!key) return new Response('Paramètre "key" manquant', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
        const obj = await env.BUCKET.get(key);
        if (!obj) return new Response('Objet introuvable : ' + key, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
        return new Response(obj.body, { headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
          'Cache-Control': 'no-store'
        } });
      }
      return new Response('POST attendu', { status: 405, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    if (!originOk) return json({ error: 'Origine non autorisée' }, 403);
    if (request.method !== 'POST') return json({ error: 'POST attendu' }, 405);

    const gate = await verifyAdmin(request, env);
    if (!gate.ok) return json({ error: gate.error }, gate.status);

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

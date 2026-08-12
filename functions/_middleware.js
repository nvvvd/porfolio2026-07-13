/* ============================================================================
   functions/_middleware.js — Cloudflare Pages Function

   APERÇU DES LIENS PARTAGÉS, RÉGLABLE DEPUIS L'ADMIN

   Le titre, le texte et la photo qu'affichent iMessage, WhatsApp, Facebook,
   LinkedIn ou Slack sont lus dans le HTML brut renvoyé par le serveur : aucun
   de ces robots n'exécute le JavaScript de la page. Les changer depuis l'admin
   dans le navigateur ne suffit donc pas — il faut réécrire les balises avant
   que la page ne sorte du serveur.

   C'est ce que fait ce middleware : pour les quelques pages fixes du site, il
   lit `share` dans la ligne `site` de Supabase (renseignée par l'onglet Contenu
   de l'admin) et remplace les balises og:/twitter: à la volée. Une valeur vide
   laisse en place celle écrite dans le HTML : rien n'est jamais effacé.

   ⚠ LES GALERIES NE PASSENT PAS PAR ICI. /galerie/<slug> est traité par
   functions/galerie/[[path]].js, qui injecte le nom et la couverture de la
   galerie. Ce fichier ignore volontairement tout ce qui est sous /galerie/ :
   sinon il écraserait ces valeurs par celles, génériques, de la page Galeries.

   DIAGNOSTIC : ?_share_debug sur une de ces pages renvoie un rapport JSON —
   quelle page a été reconnue, quels réglages ont été lus, quelle erreur.
   ========================================================================== */

const SITE = 'https://www.nicolasvivaudou.com';
const RESIZE = 'https://nicolasvivaudou.com/cdn-cgi/image';
const PUBLIC_BASE = 'https://images.nicolasvivaudou.com';

/* Les seules adresses concernées. Tout le reste — fichiers, galeries, espaces
   clients, admin — traverse ce middleware sans un seul appel réseau. */
const PAGES = {
  '/': 'accueil', '/index.html': 'accueil',
  '/portfolio': 'portfolio', '/portfolio.html': 'portfolio',
  '/galerie': 'galerie', '/galerie.html': 'galerie',
  '/contact': 'contact', '/contact.html': 'contact'
};

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const debug = url.searchParams.has('_share_debug');

  let path = decodeURIComponent(url.pathname).replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/';
  const key = PAGES[path];
  if (!key) return next();

  let share = null, err = null;
  try { share = await readShare(env, url); }
  catch (e) { err = String((e && e.message) || e); }
  const entry = (share && share[key]) || null;

  if (debug) {
    return json({
      path, page: key,
      supabase: await describeConfig(env, url),
      reglages: entry,
      tags: entry ? buildTags(entry) : null,
      error: err
    });
  }

  const res = await next();
  const tags = entry ? buildTags(entry) : null;
  if (!tags || !Object.keys(tags).length) return res;
  if (!/text\/html/i.test(res.headers.get('content-type') || '')) return res;

  const out = new HTMLRewriter().on('meta', new Meta(tags)).transform(res);
  const done = new Response(out.body, out);
  /* Les robots relisent souvent la même adresse : cinq minutes de cache partagé
     évitent d'interroger Supabase à chaque partage, sans figer un changement
     plus d'une poignée de minutes. */
  done.headers.set('Cache-Control', 'public, max-age=0, s-maxage=300');
  return done;
}

function buildTags(entry) {
  const tags = {};
  const title = String(entry.title || '').trim();
  const desc = String(entry.desc || '').trim();
  const img = ogImage(entry.image || '');
  if (title) { tags['og:title'] = title; tags['twitter:title'] = title; }
  if (desc) { tags['og:description'] = desc; tags['twitter:description'] = desc; }
  if (img) {
    tags['og:image'] = img;
    tags['og:image:secure_url'] = img;
    tags['og:image:width'] = '1200';
    tags['og:image:height'] = '630';
    tags['twitter:image'] = img;
  }
  return tags;
}

/* ---------------------------------------------------------------------------
   Lecture des réglages : ligne `site` (id = 'main'), colonne data -> share.
   Même source que le site public, avec la clé « anon » déjà servie en clair
   dans /nv-config.js ; sa sécurité repose sur les règles RLS de la base.
   ------------------------------------------------------------------------- */
async function readShare(env, url) {
  const cfg = await supabase(env, url);
  if (!cfg) throw new Error('Configuration Supabase introuvable');
  const r = await fetch(cfg.url + '/rest/v1/site?id=eq.main&select=data&limit=1', {
    headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, Accept: 'application/json' },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!r.ok) throw new Error('Supabase ' + r.status + ' — ' + (await r.text()).slice(0, 160));
  const rows = await r.json();
  const data = (rows && rows[0] && rows[0].data) || {};
  return data.share || {};
}

let _cfg;
async function supabase(env, url) {
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    return { url: String(env.SUPABASE_URL).replace(/\/+$/, ''), key: env.SUPABASE_ANON_KEY, from: 'env' };
  }
  if (_cfg !== undefined) return _cfg;
  try {
    const r = await env.ASSETS.fetch(new URL('/nv-config.js', url).toString());
    const src = r.ok ? await r.text() : '';
    const u = src.match(/url:\s*'(https:\/\/[^']+\.supabase\.co)'/);
    const k = src.match(/anonKey:\s*'([A-Za-z0-9._-]{40,})'/);
    _cfg = (u && k) ? { url: u[1].replace(/\/+$/, ''), key: k[1], from: 'nv-config.js' } : null;
  } catch (e) { _cfg = null; }
  return _cfg;
}

async function describeConfig(env, url) {
  const c = await supabase(env, url);
  return c ? { source: c.from, url: c.url, key: c.key.slice(0, 12) + '…' } : null;
}

/* Une couverture d'aperçu doit être une image fixe, légère et au format attendu
   par les robots : Cloudflare la recadre en 1200 × 630 JPEG. « format=auto »
   servirait du WebP à un robot qui ne l'annonce pas, et l'aperçu resterait vide.
   Une photo choisie dans l'admin peut être une adresse complète (R2) ou un
   chemin du site (images/…) — les deux sont acceptés. */
function ogImage(src) {
  let u = String(src || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) {
    if (u.indexOf('data:') === 0) return '';
    u = SITE + '/' + u.replace(/^\/+/, '');
  }
  u = u.replace(/^https?:\/\/pub-[a-z0-9]+\.r2\.dev/i, PUBLIC_BASE);
  if (u.indexOf('/cdn-cgi/image/') !== -1) return u;
  return RESIZE + '/width=1200,height=630,fit=cover,quality=82,format=jpeg/' + u;
}

function json(o) {
  return new Response(JSON.stringify(o, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

class Meta {
  constructor(map) { this.map = map; this.seen = {}; }
  element(el) {
    const k = el.getAttribute('property') || el.getAttribute('name');
    if (k && this.map[k] != null) { el.setAttribute('content', this.map[k]); this.seen[k] = true; }
    /* Les balises og:image:* n'existent pas dans le HTML statique : on les
       accroche à la suite d'og:image, sinon iMessage affiche une vignette
       carrée au lieu de la grande image. */
    if (k === 'og:image' && this.map['og:image']) {
      for (const extra of ['og:image:secure_url', 'og:image:width', 'og:image:height']) {
        if (this.map[extra] != null && !this.seen[extra]) {
          this.seen[extra] = true;
          el.after('\n<meta property="' + extra + '" content="' + escAttr(this.map[extra]) + '">', { html: true });
        }
      }
    }
  }
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

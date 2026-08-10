/* ============================================================================
   functions/galerie/[[path]].js — Cloudflare Pages Function
   Aperçu de lien propre à chaque galerie.

   POURQUOI UNE FONCTION SERVEUR

   Facebook, iMessage, WhatsApp, LinkedIn, Slack et Signal lisent le HTML BRUT
   renvoyé par le serveur. Aucun n'exécute le JavaScript de la page. Or
   /galerie/mariage et /galerie/portrait sont le MÊME fichier statique : tous
   les partages affichaient donc la même photo, celle codée en dur dans les
   balises og: de galerie.html.

   Modifier ces balises depuis le navigateur ne change rien — le robot est déjà
   reparti. La seule correction possible est de réécrire le HTML avant qu'il ne
   sorte du serveur, ce que fait cette fonction avec HTMLRewriter : elle lit le
   slug dans l'URL, demande à Supabase le nom et la photo de couverture de cette
   galerie, et remplace les balises à la volée. Le HTML reçu par les visiteurs
   humains est identique — seules quelques balises <meta> diffèrent.

   ⚠ LA RÈGLE _redirects « /galerie/*  /galerie  200 » DOIT RESTER SUPPRIMÉE.
   Cloudflare Pages applique les règles de _redirects AVANT les fonctions : tant
   qu'elle existait, /galerie/mariage était réécrit en /galerie et servi comme
   fichier statique, sans que cette fonction soit jamais appelée. C'est elle qui
   assure désormais la même réécriture, en interne (fetchPage ci-dessous).

   AUCUNE CONFIGURATION : l'adresse et la clé publique Supabase sont lues dans
   /nv-config.js, que le site sert déjà à tous ses visiteurs. Les variables
   d'environnement SUPABASE_URL / SUPABASE_ANON_KEY restent prioritaires.

   DIAGNOSTIC : ajouter ?_debug à l'adresse renvoie un rapport JSON au lieu de
   la page — quelle galerie a été trouvée, quelle image, quelle erreur.
   ========================================================================== */

const SITE = 'https://www.nicolasvivaudou.com';
const RESIZE = 'https://nicolasvivaudou.com/cdn-cgi/image';
const PUBLIC_BASE = 'https://images.nicolasvivaudou.com';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const debug = url.searchParams.has('_debug');

  const slug = decodeURIComponent(url.pathname)
    .replace(/^\/galerie\/?/i, '').split('/')[0].trim().toLowerCase();

  /* Cette fonction remplace la réécriture _redirects : c'est elle qui sert
     désormais la page de galerie pour toute adresse /galerie/<slug>. */
  const page = await fetchPage(env, url);

  let meta = null, err = null;
  try { meta = slug ? await buildMeta(env, url, slug) : null; }
  catch (e) { err = String((e && e.message) || e); }

  if (debug) {
    return json({
      slug: slug || null,
      pageStatus: page ? page.status : null,
      pageType: page ? page.headers.get('content-type') : null,
      supabase: await describeConfig(env, url),
      found: !!meta,
      meta: meta || null,
      error: err
    });
  }

  if (!page) return new Response('Page indisponible', { status: 502 });
  if (!meta) return page;
  if (!/text\/html/i.test(page.headers.get('content-type') || '')) return page;

  const out = new HTMLRewriter()
    .on('title', new Title(meta.title))
    .on('meta', new Meta(meta.tags))
    .on('link[rel="canonical"]', new Canonical(meta.url))
    .transform(page);

  const res = new Response(out.body, out);
  /* Les robots relisent souvent la même URL : cinq minutes de cache partagé
     évitent d'interroger Supabase à chaque partage, sans figer un changement
     de photo de couverture plus d'une poignée de minutes. */
  res.headers.set('Cache-Control', 'public, max-age=0, s-maxage=300');
  return res;
}

/* Le HTML de la page de galerie, servi tel quel aux visiteurs. */
async function fetchPage(env, url) {
  try {
    const r = await env.ASSETS.fetch(new URL('/galerie', url).toString());
    return r && r.ok ? r : null;
  } catch (e) { return null; }
}

/* ---------------------------------------------------------------------------
   Adresse et clé Supabase.
   Ces deux valeurs vivent déjà dans /nv-config.js, servi en clair à chaque
   visiteur : la clé « anon » est publique par construction, sa sécurité repose
   entièrement sur les règles RLS de la base, pas sur son secret.
   ------------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------------
   Lecture Supabase — uniquement les galeries PUBLIQUES.
   Le filtre « private=is.false » est indispensable : sans lui, l'adresse d'une
   galerie privée devinée au hasard révélerait son nom et sa couverture dans
   l'aperçu, sans qu'aucun mot de passe soit demandé.
   ------------------------------------------------------------------------- */
async function buildMeta(env, url, slug) {
  const cfg = await supabase(env, url);
  if (!cfg) throw new Error('Configuration Supabase introuvable');

  const ask = async (path) => {
    const r = await fetch(cfg.url + '/rest/v1/' + path, {
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, Accept: 'application/json' },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!r.ok) throw new Error('Supabase ' + r.status + ' sur ' + path.split('?')[0] + ' — ' + (await r.text()).slice(0, 160));
    return r.json();
  };

  const gs = await ask('galleries?slug=eq.' + encodeURIComponent(slug) +
    '&private=is.false&select=id,slug,name,description,cover_id,photo_ids&limit=1');
  const g = gs && gs[0];
  if (!g) return null;

  /* La couverture, dans l'ordre : celle choisie dans l'admin, sinon la première
     photo de la galerie. Beaucoup de galeries n'ont pas de cover_id — s'arrêter
     là laissait l'aperçu sur l'image générique du site. */
  let img = '';
  const coverId = g.cover_id || (Array.isArray(g.photo_ids) ? g.photo_ids[0] : null);
  if (coverId) {
    const ps = await ask('photos?id=eq.' + encodeURIComponent(coverId) + '&select=src,thumb&limit=1');
    if (ps && ps[0]) img = ogImage(ps[0].src || ps[0].thumb || '');
  }
  if (!img) {
    const ps = await ask('photos?gallery=eq.' + encodeURIComponent(g.id) + '&select=src,thumb&limit=1');
    if (ps && ps[0]) img = ogImage(ps[0].src || ps[0].thumb || '');
  }

  const name = String(g.name || slug).trim();
  const title = name.charAt(0).toUpperCase() + name.slice(1) + ' — Nicolas Vivaudou';
  const desc = String(g.description || '').trim() ||
    ('Série photographique ' + name + ' par Nicolas Vivaudou, photographe à Québec.');
  const href = SITE + '/galerie/' + encodeURIComponent(g.slug || slug);

  const tags = {
    'description': desc,
    'og:title': title, 'og:description': desc, 'og:url': href,
    'twitter:title': title, 'twitter:description': desc
  };
  if (img) {
    tags['og:image'] = img;
    tags['og:image:secure_url'] = img;
    tags['og:image:width'] = '1200';
    tags['og:image:height'] = '630';
    tags['og:image:alt'] = name;
    tags['twitter:image'] = img;
  }

  return { title, tags, url: href, image: img || null, gallery: g.name };
}

/* Une couverture d'aperçu doit être une image fixe, raisonnablement légère et
   au format attendu par les robots. On demande donc à Cloudflare une édition
   1200 × 630 recadrée, en JPEG — « format=auto » servirait du WebP à un robot
   qui ne l'annonce pas et l'aperçu resterait vide. */
function ogImage(src) {
  let u = String(src || '');
  if (!/^https?:\/\//i.test(u)) return '';
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
      for (const extra of ['og:image:secure_url', 'og:image:width', 'og:image:height', 'og:image:alt']) {
        if (this.map[extra] != null && !this.seen[extra]) {
          this.seen[extra] = true;
          el.after('\n<meta property="' + extra + '" content="' + escAttr(this.map[extra]) + '">', { html: true });
        }
      }
    }
  }
}

class Title {
  constructor(t) { this.t = t; }
  element(el) { el.setInnerContent(this.t); }
}

/* Sans cette réécriture, chaque galerie déclarerait /galerie comme adresse
   canonique : Google les traiterait toutes comme des doublons d'une seule page
   et n'en indexerait aucune, quoi que dise le plan de site. */
class Canonical {
  constructor(href) { this.href = href; }
  element(el) { el.setAttribute('href', this.href); }
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

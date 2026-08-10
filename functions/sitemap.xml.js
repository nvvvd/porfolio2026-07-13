/* ============================================================================
   functions/sitemap.xml.js — Cloudflare Pages Function

   Le plan de site était un fichier figé de cinq lignes : Google n'y voyait que
   /galerie, une seule adresse pour l'ensemble des séries. Les galeries elles-
   mêmes (/galerie/sport, /galerie/portrait…) n'existaient pour lui nulle part,
   puisque aucun lien HTML ne les désigne — elles ne s'ouvrent qu'en JavaScript.

   Cette fonction lit les galeries publiques dans Supabase et les ajoute au plan
   de site, avec la photo de couverture déclarée en <image:image> (extension de
   Google) : les séries deviennent indexables et éligibles à Google Images.

   Aucune configuration : l'adresse et la clé publique Supabase sont lues dans
   /nv-config.js, que le site sert déjà à tous ses visiteurs. Si la base ne
   répond pas, le plan de site se limite aux pages fixes — soit exactement le
   fichier statique d'avant, jamais une erreur.
   ========================================================================== */

let _cfg = null;
async function supabase(env, url) {
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    return { url: String(env.SUPABASE_URL).replace(/\/+$/, ''), key: env.SUPABASE_ANON_KEY };
  }
  if (_cfg !== null) return _cfg;
  try {
    const r = await env.ASSETS.fetch(new URL('/nv-config.js', url).toString());
    const src = r.ok ? await r.text() : '';
    const u = src.match(/url:\s*'(https:\/\/[^']+\.supabase\.co)'/);
    const k = src.match(/anonKey:\s*'([A-Za-z0-9._-]{40,})'/);
    _cfg = (u && k) ? { url: u[1].replace(/\/+$/, ''), key: k[1] } : null;
  } catch (e) { _cfg = null; }
  return _cfg;
}

const SITE = 'https://www.nicolasvivaudou.com';
const RESIZE = 'https://nicolasvivaudou.com/cdn-cgi/image';
const PUBLIC_BASE = 'https://images.nicolasvivaudou.com';

const FIXED = [
  ['/', 'monthly', '1.0'],
  ['/portfolio', 'monthly', '0.9'],
  ['/galerie', 'weekly', '0.8'],
  ['/contact', 'yearly', '0.7'],
  ['/mentions', 'yearly', '0.2']
];

export async function onRequest({ env, request }) {
  let galleries = [];
  try { galleries = await publicGalleries(env, new URL(request.url)); } catch (e) { galleries = []; }

  const urls = FIXED.map(([p, freq, pri]) =>
    '  <url><loc>' + SITE + p + '</loc><changefreq>' + freq + '</changefreq><priority>' + pri + '</priority></url>');

  for (const g of galleries) {
    let x = '  <url><loc>' + SITE + '/galerie/' + esc(encodeURIComponent(g.slug)) + '</loc>' +
      '<changefreq>monthly</changefreq><priority>0.7</priority>';
    if (g.image) {
      x += '<image:image><image:loc>' + esc(g.image) + '</image:loc>' +
        '<image:title>' + esc(g.name) + '</image:title></image:image>';
    }
    urls.push(x + '</url>');
  }

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    urls.join('\n') + '\n</urlset>\n';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600'
    }
  });
}

async function publicGalleries(env, url) {
  const cfg = await supabase(env, url);
  if (!cfg) return [];

  const ask = async (path) => {
    const r = await fetch(cfg.url + '/rest/v1/' + path, {
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, Accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    return r.ok ? r.json() : null;
  };

  const gs = await ask('galleries?private=is.false&select=slug,name,cover_id,photo_ids&order=slug');
  if (!Array.isArray(gs) || !gs.length) return [];

  const coverIds = gs.map(g => g.cover_id || (Array.isArray(g.photo_ids) ? g.photo_ids[0] : null)).filter(Boolean);
  let byId = {};
  if (coverIds.length) {
    const list = '(' + coverIds.map(id => '"' + String(id).replace(/"/g, '') + '"').join(',') + ')';
    const ps = await ask('photos?id=in.' + encodeURIComponent(list) + '&select=id,src,thumb');
    (ps || []).forEach(p => { byId[p.id] = p; });
  }

  return gs.filter(g => g.slug).map(g => {
    const cid = g.cover_id || (Array.isArray(g.photo_ids) ? g.photo_ids[0] : null);
    const p = cid ? byId[cid] : null;
    return { slug: g.slug, name: g.name || g.slug, image: p ? sized(p.src || p.thumb || '') : '' };
  });
}

function sized(src) {
  let u = String(src || '');
  if (!/^https?:\/\//i.test(u)) return '';
  u = u.replace(/^https?:\/\/pub-[a-z0-9]+\.r2\.dev/i, PUBLIC_BASE);
  if (u.indexOf('/cdn-cgi/image/') !== -1) return u;
  return RESIZE + '/width=1600,quality=82,format=auto/' + u;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

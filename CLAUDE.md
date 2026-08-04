# Instructions projet — nicolasvivaudou.com

## À chaque modification
Toujours indiquer à la fin de la réponse **la liste exacte des fichiers à redéployer**
(modifiés / ajoutés / supprimés), avec la commande git correspondante.

## Déploiement
- Le site est déployé par **Cloudflare Pages depuis la racine du dépôt GitHub**
  (`nvvvd/porfolio2026-07-13`), pas depuis `deploiement/`.
- Les dossiers `deploiement/` et `site-nicolas-vivaudou/` sont des copies de secours :
  les resynchroniser après chaque modification.
- Les pages publiques sont servies par de **vrais fichiers aux noms propres**
  (`portfolio.html` → `/portfolio`). Les `.dc.html` sont les sources d'édition ;
  après avoir modifié un `.dc.html`, **recopier vers son équivalent propre** :
  Accueil→index.html, Portfolio→portfolio.html, Galerie→galerie.html,
  Client→client.html, Admin→admin.html, Contact→contact.html,
  Mentions→mentions.html, Guide client→guide.html
- Ne jamais utiliser de réécriture `200` dans `_redirects` vers un fichier `.dc.html`
  (Cloudflare Pages retire le `.html` et cela crée une boucle de redirection infinie).

## Chemins des scripts et assets : relatifs à la source, absolus en ligne
Les galeries et espaces client sont servis sur des URL imbriquées
(`/galerie/galerie-mabq` via la réécriture `/galerie/* → /galerie  200`).
Un chemin relatif (`src="support.js"`, `href="favicon.svg"`) y est cherché dans
`/galerie/…` et renvoie 404 : plus aucun JavaScript ne se charge et la page
affiche les `{{ }}` en clair.

Mais l'aperçu d'édition sert les fichiers sous un préfixe de chemin, où un chemin
absolu renvoie 404 à son tour. D'où deux régimes, à ne pas mélanger :

- **sources `.dc.html`** → chemins **relatifs** (`support.js`, `store.js`, `favicon.svg`)
- **pages publiées `.html` + `404.html`** → chemins **absolus** (`/support.js`, `/store.js`, `/favicon.svg`)

La copie `.dc.html` → `.html` n'est donc PAS une copie à l'identique : après avoir
recopié, réécrire les chemins des scripts et de `favicon.svg` en absolu.
Assets concernés : `support.js`, `doc-page.js`, `nv-*.js`, `store.js`, `favicon.svg`.

## Cache des scripts (ne pas oublier)
Les pages appellent leurs scripts avec un jeton de version : `nv-storage.js?v=20260804a`.
Les `.js` sont servis avec un cache d'un an (`immutable`) : **toute modification d'un
fichier `.js` exige de changer ce jeton dans TOUTES les pages** (sources `.dc.html`,
pages propres `.html` et `404.html`), sinon les visiteurs continuent d'exécuter
l'ancienne version pendant des jours.

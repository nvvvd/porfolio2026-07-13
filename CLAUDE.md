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

## Cache des scripts (ne pas oublier)
Les pages appellent leurs scripts avec un jeton de version : `nv-storage.js?v=20260803d`.
Les `.js` sont servis avec un cache d'un an (`immutable`) : **toute modification d'un
fichier `.js` exige de changer ce jeton dans TOUTES les pages** (sources `.dc.html`,
pages propres `.html` et `404.html`), sinon les visiteurs continuent d'exécuter
l'ancienne version pendant des jours.

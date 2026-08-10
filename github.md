repo: nvvvd/porfolio2026-07-13
branch: main

## Last sync
date: 2026-08-09T09:30:00Z

### Updated in this project
- L'aperçu de partage restait générique : la règle _redirects « /galerie/* → /galerie 200 » est appliquée AVANT les fonctions Cloudflare Pages, donc functions/galerie/[[path]].js n'était jamais appelée. Règle supprimée ; la fonction assure elle-même la réécriture, en interne.
- Couverture d'aperçu : repli sur la première photo de la galerie quand cover_id est vide (cas de la plupart des galeries), au lieu de laisser l'image générique du site.
- Balises og:image:width/height/alt/secure_url ajoutées à la volée : sans elles iMessage affiche une vignette carrée au lieu de la grande image.
- Diagnostic : ?_debug sur une adresse de galerie renvoie un rapport JSON (galerie trouvée, image retenue, erreur Supabase).

## Sync history
date: 2026-08-08T10:15:00Z

### Updated in this project
- Visionneuse mobile réparée : un glissement se terminait par un « click » sur le fond, dont le rôle est de fermer — tout swipe raté ou oblique refermait la photo. Les flèches, à 10 px du bord, tombaient dans la zone du geste « retour » d'iOS. Le corps de page continuait de défiler dessous, ce qui décalait les boutons quand la barre d'adresse se rétractait.
- Aperçu de lien par galerie : nouvelle fonction Cloudflare Pages functions/galerie/[[path]].js. Les robots de partage ne lisent pas le JavaScript et recevaient les balises og: figées de galerie.html, donc la même photo pour toutes les galeries. La fonction lit le slug, interroge Supabase et réécrit titre, description et image avant l'envoi. Galeries privées exclues.
- Les deux fonctions Pages lisent l'adresse et la clé publique Supabase dans /nv-config.js plutôt que dans des variables d'environnement à créer à la main : la clé anon est déjà servie en clair à chaque visiteur, la redemander n'ajoutait aucune protection.
- Plan de site dynamique : functions/sitemap.xml.js remplace le fichier figé de cinq lignes. Les galeries publiques y sont listées une à une avec leur couverture en <image:image>. Le canonical de chaque galerie, qui pointait vers /galerie, est réécrit vers sa propre adresse — sans cela Google les aurait traitées comme des doublons et n'en aurait indexé aucune.
- Recherche par visage retirée : elle était décrite dans les mentions légales (section « Données biométriques », consentement Loi 25) mais n'avait aucune interface — seules des valeurs mortes subsistaient dans Client.dc.html. Section supprimée, code nettoyé.
- Adresses de galerie lisibles : le slug était fabriqué en « galerie-a3f9 » et invisible dans l'admin. Il suit maintenant le nom (/galerie/sport) et reste modifiable à la main, avec garde-fou d'unicité.

## Sync history
date: 2026-08-07T13:05:00Z

### Updated in this project
- Space Mono supprimée : la police était chargée sur chaque page mais aucune règle CSS ne l'appelait. Plus aucun lien vers fonts.googleapis.com / fonts.gstatic.com, plus aucun fichier de police — deux connexions tierces en moins au chargement.
- Mentions légales actualisées : hébergement nommé (Cloudflare Pages, R2, Supabase) au lieu de « Netlify ou équivalent », transfert hors Québec explicité, mesure d'audience déclarée inactive (Plausible n'est pas configuré). Année ajoutée au pied de page.
- Accueil : le diaporama ne démarre plus après un délai fixe de 2,5 s mais après le chargement complet de la page (+1,5 s), et une seule photo réelle est chargée au montage au lieu de trois. Chaque photo qui apparaissait repoussait le LCP.
- Verification.dc.html : une source .dc.html servie par redirection n'est plus comptée comme une erreur de chemins. En ligne, /Accueil.dc.html est redirigé vers / et renvoyait index.html sous le nom de la source.
- Jeton statique X-Upload-Token retiré partout : worker, en-têtes CORS et nv-storage.js. Le téléversement n'accepte plus que la session Supabase de l'administrateur. Les variables UPLOAD_TOKEN et REQUIRE_AUTH ne servent plus.
- Route GET /read supprimée du worker : elle servait n'importe quel objet du bucket à n'importe quelle origine, factures PDF comprises. La lecture passe par images.nicolasvivaudou.com ; nv-storage.js n'a plus de repli vers ce relais.
- Image d'accueil : le srcset est désormais fabriqué par la transformation Cloudflare (640/1280/2000 px) au lieu de dépendre d'une vignette générée. Un téléphone ne télécharge plus l'original.
- Verification.dc.html contrôle aussi l'accès anonyme à la base : « clients » et « messages » doivent être muets sans session, « photos » et « galleries » lisibles.

## Sync history
### 2026-08-06
- Envoi de photos réparé : l'en-tête « Authorization » manquait dans les en-têtes CORS du worker, ce qui bloquait la requête avant l'envoi ; nv-storage.js renouvelle désormais une session Supabase expirée avant d'abandonner.
- nv-storage.js connaît sa propre version et la compare au jeton réclamé par la page : un fichier périmé servi sous une adresse neuve est signalé au lieu de rester muet.
- Jeton d'envoi public retiré de nv-config.js : l'autorisation repose sur la session administrateur vérifiée côté worker (REQUIRE_AUTH=true).
- Images manquantes : filet global dans nv-ux.js, plus aucune icône cassée ni texte alternatif affiché ; visionneuse en édition 1600 px avec repli sur l'original puis la vignette.
- Nouvelle page interne Verification.dc.html : charge chaque page, intercepte les erreurs JavaScript, contrôle chemins et jetons de cache.

### 2026-08-05
- Correction d'un ReferenceError fatal sur contact / à propos (variable lue avant sa déclaration).
- Correction d'une accolade en trop fermant la classe de l'espace client.
- Session admin Supabase vérifiée côté worker, jeton statique relégué en secours.

## Screen map
| Page publiée | Source d'édition | Scripts |
| --- | --- | --- |
| / (index.html) | Accueil.dc.html | nv-theme, nv-config, nv-i18n, nv-backend, nv-auth, store, nv-ux |
| /portfolio | Portfolio.dc.html | idem |
| /galerie | Galerie.dc.html | idem |
| /client | Client.dc.html | idem |
| /contact | Contact.dc.html | idem |
| /admin | Admin.dc.html | nv-config, nv-storage, nv-backend, nv-auth, store |
| /mentions | Mentions.dc.html | nv-theme, nv-ux |
| /guide | Guide client.dc.html | doc-page |
| (interne, non publiée) | Verification.dc.html | nv-config |
| Aperçu de lien /galerie/* | functions/galerie/[[path]].js | galeries, photos (Supabase) |
| Plan de site /sitemap.xml | functions/sitemap.xml.js | galeries, photos (Supabase) |

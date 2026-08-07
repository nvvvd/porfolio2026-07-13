repo: nvvvd/porfolio2026-07-13
branch: main

## Last sync
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

repo: nvvvd/porfolio2026-07-13
branch: main

## Last sync
date: 2026-08-06T13:10:00Z

### Updated in this project
- Envoi de photos réparé : l'en-tête « Authorization » manquait dans les en-têtes CORS du worker, ce qui bloquait la requête avant l'envoi ; nv-storage.js renouvelle désormais une session Supabase expirée avant d'abandonner.
- nv-storage.js connaît sa propre version et la compare au jeton réclamé par la page : un fichier périmé servi sous une adresse neuve est signalé au lieu de rester muet.
- Jeton d'envoi public retiré de nv-config.js : l'autorisation repose sur la session administrateur vérifiée côté worker (REQUIRE_AUTH=true).
- Images manquantes : filet global dans nv-ux.js, plus aucune icône cassée ni texte alternatif affiché ; visionneuse en édition 1600 px avec repli sur l'original puis la vignette.
- Nouvelle page interne Verification.dc.html : charge chaque page, intercepte les erreurs JavaScript, contrôle chemins et jetons de cache.

## Sync history
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
| (interne, non publiée) | Verification.dc.html | aucun |

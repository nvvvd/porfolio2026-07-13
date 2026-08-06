repo: nvvvd/porfolio2026-07-13
branch: main

## Last sync
date: 2026-08-06T12:05:00Z

### Updated in this project
- Photos manquantes : filet global dans nv-ux.js — une image qui n'arrive pas tente ses adresses de repli puis s'effface, au lieu d'afficher l'icône cassée et son texte alternatif (« sport », « évènement ») au milieu de la page.
- Visionneuse plein écran : charge désormais une édition 1600 px via la zone (comme les vignettes), avec l'original puis la vignette en repli.
- Envoi de photos réparé : le worker n'autorisait pas l'en-tête « Authorization » en CORS, ce qui bloquait la requête avant l'envoi.
- Nouvelle page interne Verification.dc.html : charge chaque page, intercepte les erreurs JavaScript, contrôle chemins et jetons de cache.
- Jetons de cache portés à v=20260806a pour store.js et nv-ux.js sur toutes les pages.

## Sync history
### 2026-08-05
- Correction d'un ReferenceError fatal sur contact / à propos (variable lue avant sa déclaration).
- Correction d'une accolade en trop fermant la classe de l'espace client.
- Envoi de photos : session admin Supabase vérifiée côté worker, jeton statique relégué en secours.

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

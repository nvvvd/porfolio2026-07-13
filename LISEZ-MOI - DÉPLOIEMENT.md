# Mise en ligne du site — Nicolas Vivaudou

Ce dossier contient le **site complet, prêt à déployer**. C'est un site
100 % statique : aucun serveur, aucune base de données, aucune installation
requise. Tout hébergeur capable de servir des fichiers HTML convient.

---

## Contenu du dossier

| Fichier / dossier | Rôle |
|---|---|
| `index.html` | Page d'entrée (SEO + redirection vers l'accueil) |
| `Accueil.dc.html`, `Portfolio.dc.html`, `Galerie.dc.html`, `Shot.dc.html` | Pages publiques |
| `Contact.dc.html` | Contact + page « à propos » |
| `Client.dc.html` | Espace client (galeries privées, sélection) |
| `Admin.dc.html` | Back-office (code par défaut : `1234` — à changer !) |
| `Mentions.dc.html`, `404.html` | Mentions légales, page introuvable |
| `nv-config.js` | **Le seul fichier à éditer** (email, backend, analytics) |
| `nv-*.js`, `store.js`, `face.js`, `support.js` | Moteur du site (ne pas modifier) |
| `images/` | Photos et logos |
| `robots.txt`, `sitemap.xml`, `favicon.svg` | SEO / icône |
| `docs/` | Guides détaillés (déploiement, migration Supabase, schéma) |

---

## Étape 1 — Mettre en ligne (5 minutes)

### Option A — Netlify (recommandé, gratuit)
1. Créez un compte sur https://app.netlify.com.
2. Onglet **Sites** → glissez-déposez CE dossier entier dans la zone
   « Drag and drop your site folder ».
3. 30 secondes plus tard le site est en ligne sur une adresse `*.netlify.app`.
4. **Domaine** : Site settings → Domain management → ajoutez
   `nicolasvivaudou.com` et suivez les instructions DNS (2 enregistrements
   à créer chez votre registrar). HTTPS est automatique.

### Option B — Cloudflare Pages (gratuit)
1. https://pages.cloudflare.com → **Create a project** → **Direct upload**.
2. Téléversez le dossier ; même principe que Netlify (domaine + HTTPS inclus).

### Option C — Hébergement classique (OVH, Ionos, FTP…)
1. Connectez-vous en FTP/SFTP (FileZilla par exemple).
2. Envoyez **tout le contenu** de ce dossier à la racine web
   (`www/` ou `public_html/` selon l'hébergeur).
3. Vérifiez que `index.html` est bien la page par défaut (c'est le cas
   partout par défaut).

> `404.html` est reconnue automatiquement par Netlify, Cloudflare Pages et
> GitHub Pages. Sur un hébergement FTP classique, déclarez-la comme page
> d'erreur 404 dans le panneau de l'hébergeur (ou `.htaccess` :
> `ErrorDocument 404 /404.html`).

À ce stade, tout fonctionne : galeries, espace client, recherche par visage,
formulaire, FR/EN, mode sombre.

---

## Étape 2 — Recevoir les messages du formulaire par email

Sans cette étape, les messages restent visibles dans l'admin (onglet
**Messages**) mais n'arrivent pas par email.

1. Allez sur https://web3forms.com et entrez `n.vivaudou@gmail.com`.
2. Copiez la **clé d'accès** (access key) reçue par email.
3. Ouvrez `nv-config.js` et collez la clé :
   ```js
   contact: {
     web3formsKey: 'a1b2c3d4-…',
     recipientLabel: 'n.vivaudou@gmail.com',
   },
   ```
4. Re-déployez (re-glissez le dossier / re-envoyez le fichier).

Cette clé est publique par conception : elle ne peut qu'envoyer des emails
vers VOTRE adresse.

---

## Étape 3 — IMPORTANT : comprendre le mode « démo » des données

Par défaut (`backend: 'local'` dans `nv-config.js`), les contenus édités via
l'admin (photos ajoutées, textes, galeries clients…) sont enregistrés **dans le
navigateur où l'édition est faite** (localStorage) :

- Vos modifications d'admin ne sont visibles que sur VOTRE navigateur.
- Chaque visiteur voit le contenu de démo livré dans `store.js` + `images/`.

C'est parfait pour valider le site. Pour que l'admin publie réellement pour
tout le monde (et que l'espace client soit partagé), passez en mode Supabase :

➡ Suivez **`docs/MIGRATION.md`** (compte Supabase gratuit, photos hébergées
sur Cloudflare R2, puis `backend: 'supabase'` dans `nv-config.js`).

---

## Étape 4 — Avant l'ouverture au public (checklist)

- [ ] Changer le **code admin** (défaut `1234`) — procédure dans
      `docs/MIGRATION.md`, étape 8.
- [ ] Renseigner la clé **Web3Forms** (étape 2).
- [ ] Remplacer les photos de démo restantes via l'admin (ou `images/`).
- [ ] Vérifier `sitemap.xml` / `index.html` : le domaine y est
      `www.nicolasvivaudou.com` — adaptez si votre domaine final diffère.
- [ ] (Optionnel) Audience sans cookies : créez un compte
      https://plausible.io et renseignez `analytics.plausibleDomain`
      dans `nv-config.js`.
- [ ] (Optionnel, si Supabase) Appliquer le durcissement « Niveau 2 »
      (`docs/MIGRATION.md`).

---

## Mises à jour ultérieures

Le site n'a pas de « build » : pour toute mise à jour, remplacez simplement
les fichiers modifiés chez l'hébergeur (ou re-glissez le dossier complet sur
Netlify/Cloudflare — chaque dépôt crée une nouvelle version, revenir en
arrière est possible en un clic).

## Guides détaillés

- `docs/DEPLOIEMENT.md` — version détaillée de ce guide + nouveautés incluses.
- `docs/MIGRATION.md` — données partagées (Supabase) + stockage photos externe.
- `docs/SCHEMA.md` — schéma de la base (si Supabase).

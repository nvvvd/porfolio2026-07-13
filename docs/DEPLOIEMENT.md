# Déploiement — Portfolio Nicolas Vivaudou

Le site est **statique** (HTML/JS, aucun serveur à installer). Il fonctionne tel
quel en mode démo. Voici comment le mettre en ligne, puis l'activer pleinement.

---

## 1. Mettre en ligne (5 minutes)

1. Décompressez le dossier du site.
2. Choisissez un hébergeur gratuit :
   - **Netlify** ou **Cloudflare Pages** : glissez-déposez le dossier dans leur
     page « Deploy » → en ligne en 30 s.
   - **GitHub Pages**, ou tout hébergement FTP classique : envoyez tous les
     fichiers à la racine.
3. La page d'accueil est `index.html` (elle ouvre automatiquement le site).
4. Une page **`404.html`** est incluse : Netlify, Cloudflare Pages et GitHub
   Pages l'affichent automatiquement pour toute adresse inexistante.

À ce stade tout marche : galeries, espace client, recherche par visage,
formulaire de contact, bouton **FR / EN**. Les données vivent dans le navigateur
de chaque visiteur (mode démo).

> **Validation de sélection** : quand un client valide sa sélection, une
> notification apparaît dans l'onglet **Messages** de l'admin (et par email si
> le formulaire est branché ci-dessous, même clé Web3Forms).

## 2. Recevoir les messages du formulaire par email

Les messages sont toujours visibles dans l'admin. Pour aussi les recevoir sur
**n.vivaudou@gmail.com** :

1. Allez sur https://web3forms.com, entrez `n.vivaudou@gmail.com`.
2. Copiez la **clé d'accès** reçue par email.
3. Dans `nv-config.js`, renseignez :
   ```js
   contact: { web3formsKey: 'VOTRE-CLE', recipientLabel: 'n.vivaudou@gmail.com' }
   ```
4. Re-déployez. Chaque envoi arrive désormais dans votre boîte mail.

## 3. Données partagées + temps réel (optionnel)

Pour que l'admin et les clients partagent les mêmes données (et non une copie par
navigateur), branchez **Supabase** : suivez `docs/MIGRATION.md` (base gratuite,
photos hébergées à l'extérieur sur Cloudflare R2, bascule `backend: 'supabase'`).

## 4. Avant l'ouverture au public

- Changez le **code admin** (défaut `1234`) — voir `docs/MIGRATION.md`, étape 8.
- Si vous avez branché Supabase : appliquez le **durcissement Niveau 2**.

---

## Ce qui est inclus dans cette version

- **Diaporama d'accueil** : défilement automatique rapide, pause + défilement
  à la souris (ou au doigt sur téléphone). Par défaut il enchaîne toutes les
  photos publiques (30 max) ; l'admin (onglet **Contenu** → « Diaporama
  d'accueil ») permet de choisir manuellement les photos et leur ordre.
  Seules les 6 prochaines photos sont chargées à l'avance (rapide sur mobile).
- **Qualité des téléversements** : avec le stockage externe branché (R2/Supabase,
  voir MIGRATION), les photos importées via l'admin sont conservées jusqu'à
  **2560 px** — net sur écran 4K. En mode démo local elles restent compressées
  davantage pour ne pas saturer le navigateur.
- **Page 404** assortie au site.

- **Bilingue FR / EN** : bouton dans l'en-tête de chaque page (public + espace
  client). La langue est mémorisée. Back-office (`Admin`) en français.
- **Galerie « sport »** ajoutée (photos de démo en attendant les vraies).
- **Formulaire de contact** → email vers n.vivaudou@gmail.com (via Web3Forms) +
  anti-spam (honeypot, validation, anti-flood).
- **Page contact** : colonne de droite alignée sur la hauteur du formulaire.

## Remplacer les photos de démo

Déposez vos images dans `images/` (ou hébergez-les en externe — voir MIGRATION)
puis remplacez-les via l'admin. Pour la galerie sport, importez vos photos de
sport dans l'admin → galerie « sport ».

## Note traductions

Les textes éditoriaux (à-propos, descriptions de galeries, accueil…) ont une
version anglaise stockée à côté du français. L'admin édite pour l'instant le
français ; pour ajuster une traduction anglaise, modifiez le champ `…En`
correspondant dans `store.js` (ou la table en base). C'est une évolution simple
à ajouter à l'admin plus tard si besoin.

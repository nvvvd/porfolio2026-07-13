# Guide de migration — brancher le site sur une base de données

Le site fonctionne aujourd'hui **sans base** (tout en `localStorage`, mode démo).
Ce guide explique comment le brancher sur **Supabase** (Postgres + Auth + temps
réel, offre gratuite) tout en gardant les **photos hébergées à l'extérieur**
pour ne rien payer côté base.

Rien n'est cassé tant que vous n'avez pas changé `backend` dans `nv-config.js` :
vous pouvez tout préparer tranquillement, puis basculer en une ligne.

```
┌─────────────┐     get()/update()      ┌──────────┐   diff + temps réel   ┌──────────┐
│  Les pages  │ ───────────────────────▶│ store.js │ ◀────────────────────▶│ Supabase │
│ (.dc.html)  │   (API synchrone,        │ (cache)  │   (nv-backend.js)     │ Postgres │
└─────────────┘    inchangée)            └──────────┘                       └──────────┘
                                                                      photos = URLs ↑
                                                              (R2 / Drive / … — hors base)
```

---

## Étape 1 — Créer le projet Supabase

1. Compte gratuit sur supabase.com → **New project**.
2. Notez le mot de passe de la base (pour vous, pas pour l'app).
3. Une fois prêt : **Project Settings → API**, récupérez :
   - **Project URL** (ex. `https://abcd1234.supabase.co`)
   - **anon public** key (clé publique, protégée par RLS — commitable)
   - ⚠️ Ne touchez pas à la clé **service_role** (secrète, jamais dans le front).

L'offre gratuite (500 Mo de base) est large : on n'y met que du **texte +
métadonnées + vecteurs de visages**. Les photos sont ailleurs (étape 4).

## Étape 2 — Créer le schéma

Ouvrez **SQL Editor** dans Supabase, collez **l'intégralité du fichier
[`schema.sql`](./schema.sql)** et exécutez-le (Run). Cela crée les tables, les fonctions
d'authentification (hash bcrypt), les règles RLS et active le temps réel.

> Le code admin initial est `1234` — changez-le (voir Étape 8).

## Étape 3 — Configurer le site

Dans `nv-config.js` :

```js
window.NV_CONFIG = {
  backend: 'supabase',                 // ← on bascule ici
  supabase: {
    url: 'https://abcd1234.supabase.co',
    anonKey: 'eyJhbGciOi...',          // la clé "anon public"
  },
  storage: { baseUrl: '', uploadEndpoint: '' },  // voir Étape 4
  realtime: true,
  bootstrapIfEmpty: true,
};
```

Laissez `backend: 'local'` tant que les étapes 4–5 ne sont pas prêtes, si vous
préférez ne basculer qu'à la fin.

## Étape 4 — Héberger les photos (le poste « 5 Go »)

La base ne stocke **qu'une URL par photo**. Vous choisissez l'hébergeur. Mon
classement pour « le moins cher avec beaucoup de téléchargements d'images » :

| Option | Gratuit | Sortie (egress) | Verdict |
|--------|---------|-----------------|---------|
| **Cloudflare R2** ⭐ | 10 Go | **gratuite** | Recommandé : 5 Go tiennent dans le gratuit, et le trafic ne coûte rien. |
| Backblaze B2 | 10 Go | gratuite via Cloudflare | Très bon, un cran plus technique. |
| Bunny.net | non (≈1 $/mois) | très bon marché | CDN rapide, quasi gratuit à votre échelle. |
| Supabase Storage | 1 Go | payante au-delà | Pratique (même tableau de bord) mais 5 Go = offre payante. |
| **Google Drive** | 15 Go | — | *Possible* mais déconseillé (voir ci-dessous). |

### Comment ça se branche

Deux façons de renseigner l'URL d'une photo :

- **URL absolue** (recommandé) : la colonne `photos.src` contient
  `https://images.votredomaine.com/mariage/img_001.jpg`. Laissez
  `storage.baseUrl` vide.
- **Chemin court + base** : `photos.src` = `mariage/img_001.jpg` et
  `storage.baseUrl` = `https://images.votredomaine.com`. Le code recolle les
  deux (`resolveSrc`). Pratique pour changer d'hébergeur sans toucher la base.

### Cloudflare R2 en bref
1. Créez un bucket R2, activez l'accès public (ou branchez un domaine perso).
2. Uploadez vos photos (glisser-déposer, ou `rclone`/CLI pour 5 Go).
3. Votre base d'URL devient `https://<votre-bucket>.r2.dev` (ou votre domaine) →
   à mettre dans `storage.baseUrl`.

### À propos de Google Drive
Techniquement **oui** : comme `photos.src` est une simple URL, un lien direct
Drive fonctionne au format
`https://drive.google.com/uc?export=view&id=IDENTIFIANT_DU_FICHIER`.
**Mais** Drive n'est pas un CDN : quotas de débit, liens qui peuvent casser,
pas de cache optimisé, partage à gérer fichier par fichier. Bon pour dépanner ou
quelques images, risqué pour une galerie complète très consultée. Si le coût est
le critère, **R2 fait le même prix (gratuit) en bien plus fiable**.

### Upload depuis le back-office (optionnel)
Aujourd'hui, un upload dans l'admin encode l'image en base64 (ça marche, mais
ça gonfle la base). Pour un vrai stockage externe, déployez le
Cloudflare Worker fourni dans [`upload-worker.js`](./upload-worker.js) (instructions
en tête de fichier), puis renseignez `storage.uploadEndpoint` (+ `uploadToken`)
dans `nv-config.js`. Le branchement côté admin existe déjà : dès que l'endpoint
est configuré, tous les uploads partent vers R2 et seule l'URL va en base.

## Étape 5 — Remplir la base

**Le plus simple (auto) :** avec `bootstrapIfEmpty: true`, au **premier**
chargement sur une base vide, l'app pousse automatiquement le contenu de démo
(galeries, clients, factures…) dans Supabase. Vous repartez du contenu actuel.

**Vos vraies photos :** une fois les fichiers hébergés (étape 4), insérez/modifiez
les URLs. Exemple SQL pour pointer une photo vers R2 :

```sql
update photos set src = 'https://images.votredomaine.com/mariage/img_001.jpg'
where id = 'ph-xxxxxx';
```

Ou, pour repartir proprement, videz puis réinsérez vos galeries/photos via
l'admin (les écritures partent en base automatiquement).

**Photos déjà saisies en base64 ?** Si vous aviez importé des photos *avant* de
configurer `storage.uploadEndpoint`, elles sont stockées en base64 (lourd). Une
fois l'endpoint configuré, ouvrez l'admin (connecté) et lancez dans la console :

```js
await NVStorage.migrateBase64({ dryRun: true });  // compte les images à migrer
await NVStorage.migrateBase64();                   // téléverse + remplace les URLs
```

L'opération est idempotente (relançable sans risque) et ne touche qu'aux images
encore en `data:`.

## Étape 6 — Basculer et tester

1. `backend: 'supabase'` dans `nv-config.js`, rechargez le site.
2. Ouvrez la console : aucune erreur `NVBackend`. Les contenus se chargent depuis
   Supabase (cache d'abord, puis rafraîchi).
3. **Test temps réel :** ouvrez `Client.dc.html` dans un onglet (connecté en
   client) et `Admin.dc.html` dans un autre. Modifiez une galerie côté admin →
   l'onglet client se met à jour tout seul.
4. **Test auth :** connectez-vous en admin (code défini à l'étape 8), puis en
   client. Les mots de passe sont vérifiés côté serveur (aucun mot de passe en
   clair ne transite ni n'est stocké).

## Étape 7 — Revenir en arrière

À tout moment : `backend: 'local'` → le site reprend en localStorage, hors-ligne,
sans rien casser. Idéal pour développer ou faire une démo.

## Étape 8 — Durcissement (avant la mise en ligne publique)

Le niveau 1 du schéma ouvre les écritures au rôle public `anon` (pratique pour
démarrer, **insuffisant en production**). À faire avant d'exposer le site :

1. **Changer le code admin :**
   ```sql
   update app_secrets set value_hash = extensions.crypt('VOTRE_NOUVEAU_CODE', extensions.gen_salt('bf'))
   where key = 'admin_pin';
   ```

2. **Créer un vrai compte admin** dans Supabase : Authentication → Users → Add
   user (e-mail + mot de passe). Copiez son `user id` (UID).

3. **Exécuter [`durcissement-niveau2.sql`](./durcissement-niveau2.sql)** après y
   avoir inséré votre UID dans la table `admins`. Il remplace les politiques ouvertes par : **lecture publique**
   (galeries, photos, site), **écriture réservée à l'admin authentifié**,
   **messages** en insertion publique mais lecture admin seulement, et retire
   `nv_set_client_password` au rôle public.

4. **Connecter l'admin via Supabase Auth** côté front. Aujourd'hui l'admin entre
   un code PIN (vérifié par `nv_check_admin`). En production, remplacez-le par une
   vraie session : dans `nv-auth.js`, faites pointer `loginAdmin` vers
   `supabase.auth.signInWithPassword({ email, password })`. Tant que la session
   est active, les écritures admin passent les politiques RLS du Niveau 2 ; les
   visiteurs anonymes ne peuvent que **lire** les pages publiques.

5. Le **hash des mots de passe client** est déjà au niveau production dès le départ.

> Ordre conseillé : ouvrez d'abord en Niveau 1 pour vérifier que tout fonctionne
> (contenus, temps réel, login), puis passez au Niveau 2 une fois le compte admin
> Auth créé. Le retour `backend: 'local'` reste toujours possible pour déboguer.

---

## Récapitulatif des coûts

| Poste | Solution | Coût |
|-------|----------|------|
| Base (texte, métadonnées, vecteurs) | Supabase Free (500 Mo) | **0 €** |
| Auth + temps réel | Inclus Supabase Free | **0 €** |
| Photos (~5 Go) | Cloudflare R2 (10 Go, egress gratuit) | **0 €** |

Tant que vous restez dans ces ordres de grandeur, l'ensemble tient sur les offres
gratuites. Le jour où le trafic grossit, seul l'hébergement des photos pourrait
devenir payant — et R2 reste l'un des moins chers grâce à la sortie gratuite.

---

## Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `nv-config.js` | Choix du backend, clés, hébergement des photos |
| `nv-i18n.js` | Bilingue FR / EN (toggle, dictionnaire, persistance) |
| `nv-storage.js` | Téléversement des photos vers le stockage externe |
| `nv-backend.js` | Adaptateur Supabase : hydrate, diff/push (debounce + retry), temps réel |
| `nv-auth.js` | Authentification (local ↔ serveur) |
| `store.js` | Cache + API synchrone des pages (inchangée pour les pages) |
| `docs/SCHEMA.md` | Tables, colonnes, SQL complet, RLS, RPC |

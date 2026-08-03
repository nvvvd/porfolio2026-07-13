# Audit de sécurité — www.nicolasvivaudou.com

_Audit du 2 août 2026. Analyse du code déployé + de l'infrastructure (Supabase, Cloudflare Pages, Worker R2)._

## Résultat

**2 failles réelles trouvées et corrigées** (dont une critique), et le durcissement des en-têtes HTTP ajouté.

| # | Faille | Gravité | État |
|---|---|---|---|
| 1 | Route `/cleanup` de suppression massive exposée | 🔴 **Critique** | ✅ Corrigée |
| 2 | Worker d'upload ouvert à toutes les origines (`*`) | 🟠 Élevée | ✅ Corrigée |
| 3 | En-têtes de sécurité HTTP absents | 🟡 Moyenne | ✅ Corrigée |
| 4 | Jeton d'upload lisible publiquement | 🟡 Moyenne | ⚠️ Atténuée — à faire tourner |
| 5 | Lien d'accès client `?acces=` non chiffré | 🟡 Moyenne | ⚠️ Par conception |
| 6 | Fichiers photo accessibles par URL directe | 🟢 Faible | ⚠️ Par conception |

---

## 1. 🔴 CRITIQUE — Route de suppression massive exposée (corrigée)

Le worker Cloudflare contenait encore une route temporaire `/cleanup` capable de **supprimer en masse tous les fichiers du bucket R2**. Elle n'était protégée que par le jeton `X-Upload-Token`… **or ce jeton est publiquement lisible** dans `nv-config.js`, servi à chaque visiteur du site.

**Conséquence :** n'importe qui pouvant lire le code source de la page (donc tout le monde) pouvait effacer l'intégralité de tes photos avec une seule commande.

Le commentaire du code prévoyait de retirer ce bloc après usage — cela n'avait pas été fait après le nettoyage des 10 537 anciens fichiers.

**Correction :** route `/cleanup` **entièrement supprimée** du worker.

## 2. 🟠 ÉLEVÉE — Worker ouvert à toutes les origines (corrigée)

Le worker renvoyait `Access-Control-Allow-Origin: *`, donc **n'importe quel site web** pouvait envoyer des fichiers dans ton bucket R2 (coût de stockage et de bande passante à ta charge).

**Correction :** seules `nicolasvivaudou.com` et `www.nicolasvivaudou.com` sont acceptées (liste ajustable via la variable `ALLOWED_ORIGINS`), et une **limite de 25 Mo par fichier** a été ajoutée.

## 3. 🟡 En-têtes de sécurité HTTP (corrigée)

Aucun en-tête de protection n'était envoyé. Ajoutés via le fichier `_headers` :
- `Strict-Transport-Security` — force HTTPS
- `X-Content-Type-Options: nosniff` — empêche l'interprétation abusive des fichiers
- `X-Frame-Options: SAMEORIGIN` — empêche l'intégration du site dans un autre site (clickjacking)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — caméra, micro et géolocalisation désactivés

## 4. 🟡 Jeton d'upload lisible publiquement — atténué

`nv-config.js` est un fichier public : le jeton y est forcément visible. Les corrections 1 et 2 réduisent fortement ce que quelqu'un peut en faire (plus de suppression possible, uploads limités à ton domaine et à 25 Mo).

**Action recommandée de ton côté :** puisque ce jeton a été exposé publiquement, **génère-en un nouveau** — Worker → Settings → Variables → `UPLOAD_TOKEN`, puis reporte la même valeur dans `nv-config.js`.

**Amélioration future :** exiger une session admin Supabase (JWT) au lieu d'un jeton statique partagé.

## 5. 🟡 Lien d'accès client `?acces=` — par conception

Le jeton du lien est un `base64(courriel:code)` : un **encodage**, pas un chiffrement. Quiconque possède le lien peut se connecter.
**À faire :** traiter ces liens comme des mots de passe (envoi en message privé), et utiliser la date d'expiration des galeries.

## 6. 🟢 Fichiers photo accessibles par URL — par conception

Le filigrane et le blocage du clic droit sont **dissuasifs uniquement** ; les URLs R2 restent atteignables directement.
**Pour les galeries sensibles :** servir les originaux via des URLs signées à durée limitée, ou livrer les fichiers finaux hors ligne.

---

## Points conformes (aucune action)

- **Clé `anon` Supabase** — publique par conception, protégée par les règles RLS. Vérifié en direct : la table `clients` renvoie 0 ligne avec la clé publique (les données clients sont bien invisibles au public).
- **Écriture en base** — réservée à l'admin authentifié (`is_admin()`).
- **Mots de passe** (admin et clients) — hachés côté serveur (bcrypt), jamais stockés ni transmis en clair.
- **Clé `service_role`** — absente du code et du dépôt. ✅
- **Clé Web3Forms** — publique par conception (n'envoie que vers ta propre adresse).
- **XSS** — rendu via React, échappement automatique du texte.
- **HTTPS** — de bout en bout via Cloudflare.

## Tes 2 actions

1. **Redéployer le worker** (`upload-worker.js`) — la faille critique n'est corrigée qu'une fois le worker remis en ligne.
2. **Faire tourner `UPLOAD_TOKEN`** (nouvelle valeur dans le worker + `nv-config.js`), puisque l'ancien a été exposé.

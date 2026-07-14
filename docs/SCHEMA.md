# Schéma de base — Portfolio Nicolas Vivaudou (Supabase / Postgres)

Ce document décrit les tables, les colonnes, la sécurité (RLS), les fonctions
serveur (login + hash) et le temps réel. 

> ⚡ **Pour exécuter le SQL, n'utilisez pas ce document** : copiez l'intégralité de
> [`schema.sql`](./schema.sql) dans Supabase → SQL Editor → Run.
> Le durcissement production est dans [`durcissement-niveau2.sql`](./durcissement-niveau2.sql)
> (à exécuter plus tard, voir MIGRATION.md étape 8).

> **Principe clé — les photos NE sont PAS dans la base.**
> La table `photos` ne stocke qu'une **URL** (colonne `src`) vers le fichier
> hébergé ailleurs (Cloudflare R2, Backblaze, Bunny, Supabase Storage, lien
> Google Drive…). Les ~5 Go de photos ne touchent donc jamais le quota de la
> base. Voir `docs/MIGRATION.md` pour le choix d'hébergement.

---

## Vue d'ensemble

| Table         | Rôle | Lignes |
|---------------|------|--------|
| `site`        | Contenus « singletons » : marque, hero, accueil, à-propos, contact, réglages, visages d'exemple | 1 ligne (`id='main'`) |
| `galleries`   | Galeries publiques **et** privées (clients) | 1 / galerie |
| `photos`      | Métadonnées + **URL** de chaque photo + descripteurs de visages | 1 / photo |
| `clients`     | Espaces clients (accès, sélection, factures). Mot de passe **hashé** | 1 / client |
| `messages`    | Messages reçus via le formulaire de contact | 1 / message |
| `app_secrets` | Secrets hashés (ex. code admin) | 1 / secret |

Le code de l'app (`nv-backend.js`) fait la correspondance **camelCase ↔ snake_case**
automatiquement (ex. `photoIds` ↔ `photo_ids`).

---

## Tables en détail

### `site` — contenus singletons
Un seul enregistrement contient tout ce qui n'est pas une liste, sous forme JSON.

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | `text` PK | toujours `'main'` |
| `data` | `jsonb` | `{ brand, hero, home, about, contact, settings, sampleFaces, version }` |
| `updated_at` | `timestamptz` | horodatage |

> `settings.adminPin` **n'est plus** stocké en clair en mode distant : le code
> admin vit hashé dans `app_secrets` (voir `nv_check_admin`).

### `galleries`
| Colonne | Type | JS |
|---------|------|----|
| `id` | `text` PK | `id` |
| `slug` | `text` unique | `slug` |
| `name` | `text` | `name` |
| `description` | `text` | `desc` |
| `photo_ids` | `jsonb` (tableau d'id) | `photoIds` |
| `cover_id` | `text` | `coverId` |
| `private` | `boolean` | `private` |
| `client_id` | `text` → `clients.id` | `clientId` |
| `face_search` | `boolean` | `faceSearch` |
| `total` | `int` (nullable) | `total` |
| `sub` | `text` (nullable) | `sub` |

### `photos`
| Colonne | Type | JS | Notes |
|---------|------|----|-------|
| `id` | `text` PK | `id` | |
| `gallery` | `text` | `gallery` | slug de la galerie d'origine |
| `file` | `text` | `file` | nom de fichier d'origine (optionnel) |
| `src` | `text` | `src` | **URL externe** de l'image |
| `faces` | `jsonb` | `faces` | tableau de vecteurs 128-d (un par visage) |
| `scanned` | `boolean` | `scanned` | analyse faciale faite ? |
| `uploaded_at` | `text` | `uploadedAt` | |

> **Visages.** Stockés en JSON, la recherche par selfie est calculée côté client
> (comme aujourd'hui) — gratuit et suffisant pour un portfolio. Si un jour vous
> avez des dizaines de milliers de photos, activez `pgvector` (voir plus bas)
> pour déléguer la recherche au serveur.

### `clients`
| Colonne | Type | JS | Notes |
|---------|------|----|-------|
| `id` | `text` PK | `id` | |
| `name` | `text` | `name` | |
| `email` | `text` unique | `email` | |
| `password_hash` | `text` | — | **bcrypt** ; jamais lu côté client |
| `gallery_ids` | `jsonb` | `galleryIds` | |
| `like_limit` | `int` | `likeLimit` | |
| `likes` | `jsonb` | `likes` | `{ photoId: true }` |
| `invoices` | `jsonb` | `invoices` | tableau de factures |

> `password_hash` n'est **pas** accordé au rôle `anon` : impossible de le lire ou
> de l'écrire directement. On passe par les fonctions serveur ci-dessous.

### `messages`
| Colonne | Type | JS |
|---------|------|----|
| `id` | `text` PK | `id` |
| `name` / `email` / `type` / `body` / `date` | `text` | idem |
| `created_at` | `timestamptz` | — |

### `app_secrets`
| Colonne | Type | Notes |
|---------|------|-------|
| `key` | `text` PK | ex. `'admin_pin'` |
| `value_hash` | `text` | bcrypt du secret |

---

## Authentification (hash côté serveur)

Trois fonctions `SECURITY DEFINER` — elles s'exécutent avec les droits du
propriétaire, donc elles peuvent lire `password_hash` que le client ne voit pas.
Le hash utilise **bcrypt** via l'extension `pgcrypto`.

- `nv_login_client(p_email, p_password)` → renvoie `{id, name, email}` si le mot
  de passe correspond (`crypt(p_password, password_hash) = password_hash`), sinon rien.
- `nv_set_client_password(p_id, p_password)` → (re)hashe et enregistre le mot de
  passe d'un client. Appelée par l'admin quand il modifie un « code d'accès ».
- `nv_check_admin(p_pin)` → `true` si le code admin correspond au hash de `app_secrets`.

`NVAuth` (fichier `nv-auth.js`) appelle ces RPC en mode `supabase`, et compare
localement en mode `local`. Aucune page n'inspecte jamais un mot de passe.

---

## Sécurité — deux niveaux

**Niveau 1 — démarrage rapide (ce script).** RLS activé. Le rôle public `anon`
peut **lire** les contenus et **écrire** (l'admin et le site utilisent la clé
anon). C'est suffisant pour ouvrir le site et tester le temps réel, **mais ce
n'est pas durci** : quiconque possède la clé anon publique pourrait écrire.

**Niveau 2 — production (recommandé une fois en ligne).** Voir la section
« Durcissement » de `docs/MIGRATION.md` : on bascule l'admin et les clients sur
**Supabase Auth** (JWT) et on restreint les écritures aux utilisateurs
authentifiés (ou à des Edge Functions avec la clé `service_role`). Les lectures
publiques (galeries, photos) restent ouvertes.

Le hash des mots de passe est, lui, **déjà au niveau production** dès le niveau 1.

### Script de durcissement (Niveau 2)

À exécuter **après** avoir créé un utilisateur admin dans **Supabase Auth**
(Authentication → Users → Add user) et lui avoir donné le rôle admin via un
*custom claim*. Le plus simple : marquer l'admin par son e-mail dans une table
d'allow-list lue par une fonction `is_admin()`.

```sql
-- 1) Allow-list des administrateurs (par user_id Supabase Auth)
create table if not exists admins ( user_id uuid primary key );
alter table admins enable row level security; -- aucun accès direct ; lue par is_admin() uniquement
-- insérez l'UID de votre utilisateur admin (visible dans Authentication → Users) :
-- insert into admins(user_id) values ('00000000-0000-0000-0000-000000000000');

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- 2) On retire les politiques ouvertes du Niveau 1…
drop policy if exists site_all      on site;
drop policy if exists galleries_all on galleries;
drop policy if exists photos_all    on photos;
drop policy if exists clients_all   on clients;
drop policy if exists messages_all  on messages;

-- 3) …et on les remplace : lecture publique, écriture réservée à l'admin.
-- Contenus du site : lisibles par tous, modifiables par l'admin seul.
create policy site_read   on site      for select to anon, authenticated using (true);
create policy site_write  on site      for all    to authenticated using (is_admin()) with check (is_admin());

create policy gal_read    on galleries for select to anon, authenticated using (true);
create policy gal_write   on galleries for all    to authenticated using (is_admin()) with check (is_admin());

create policy pho_read    on photos    for select to anon, authenticated using (true);
create policy pho_write   on photos    for all    to authenticated using (is_admin()) with check (is_admin());

-- Clients : ni lecture ni écriture publiques (tout passe par les RPC / l'admin).
create policy cli_admin   on clients   for all    to authenticated using (is_admin()) with check (is_admin());

-- Messages : insertion publique (formulaire de contact), lecture admin seulement.
create policy msg_insert  on messages  for insert to anon, authenticated with check (true);
create policy msg_read    on messages  for select to authenticated using (is_admin());
create policy msg_admin   on messages  for all    to authenticated using (is_admin()) with check (is_admin());

-- 4) Le changement de mot de passe client n'est plus ouvert à anon.
revoke execute on function nv_set_client_password(text, text) from anon;
grant  execute on function nv_set_client_password(text, text) to authenticated;
-- (nv_login_client / nv_check_admin restent ouverts à anon : ce sont les portes de login.)
```

> Avec ce script, les écritures requièrent une **session Supabase Auth admin**.
> Côté front, il faut alors connecter l'admin via `supabase.auth.signInWithPassword`
> (au lieu du simple code PIN) — voir l'étape 8 de `MIGRATION.md`. Les pages
> publiques (Accueil, Portfolio, Galerie) continuent de lire sans authentification.

---

## Temps réel

Les 5 tables de contenu sont ajoutées à la publication `supabase_realtime`.
`nv-backend.js` s'abonne à tout changement et ré-hydrate le cache (debounce
250 ms) : l'admin enregistre → le client voit en direct.

---

## Option : recherche de visages côté serveur (`pgvector`)

Par défaut on reste en JSON + calcul client (gratuit, simple). Pour passer à une
recherche serveur quand le volume explose :

```sql
create extension if not exists vector;
alter table photos add column face_vecs vector(128)[]; -- ou une table photo_faces(photo_id, embedding vector(128))
-- puis une fonction de plus proche voisin avec l'opérateur <-> (distance L2).
```

À n'activer que si nécessaire — ce n'est pas requis pour le branchement.

---

## Script complet (à coller dans Supabase → SQL Editor)

```sql
-- 0) Extensions
create extension if not exists pgcrypto with schema extensions;

-- 1) Tables
create table if not exists site (
  id text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists clients (
  id text primary key,
  name text,
  email text unique,
  password_hash text,
  gallery_ids jsonb not null default '[]',
  like_limit int not null default 30,
  likes jsonb not null default '{}',
  invoices jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists galleries (
  id text primary key,
  slug text unique,
  name text,
  description text default '',
  photo_ids jsonb not null default '[]',
  cover_id text,
  private boolean not null default false,
  client_id text references clients(id) on delete set null,
  face_search boolean not null default false,
  total int,
  sub text,
  created_at timestamptz not null default now()
);

create table if not exists photos (
  id text primary key,
  gallery text,
  file text,
  src text,                       -- URL EXTERNE de l'image
  faces jsonb not null default '[]',
  scanned boolean not null default false,
  uploaded_at text,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id text primary key,
  name text, email text, type text, body text, date text,
  created_at timestamptz not null default now()
);

create table if not exists app_secrets (
  key text primary key,
  value_hash text not null
);

create index if not exists idx_photos_gallery on photos(gallery);
create index if not exists idx_galleries_client on galleries(client_id);

-- 2) Fonctions d'authentification (hash bcrypt côté serveur)
create or replace function nv_login_client(p_email text, p_password text)
returns table (id text, name text, email text)
language sql security definer set search_path = public, extensions as $$
  select c.id, c.name, c.email
  from clients c
  where lower(c.email) = lower(p_email)
    and c.password_hash is not null
    and c.password_hash = extensions.crypt(p_password, c.password_hash)
  limit 1;
$$;

create or replace function nv_set_client_password(p_id text, p_password text)
returns void
language sql security definer set search_path = public, extensions as $$
  update clients set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')) where id = p_id;
$$;

create or replace function nv_check_admin(p_pin text)
returns boolean
language sql security definer set search_path = public, extensions as $$
  select exists (
    select 1 from app_secrets
    where key = 'admin_pin' and value_hash = extensions.crypt(p_pin, value_hash)
  );
$$;

-- Code admin initial = 1234 (CHANGEZ-LE !)
insert into app_secrets(key, value_hash)
values ('admin_pin', extensions.crypt('1234', extensions.gen_salt('bf')))
on conflict (key) do update set value_hash = excluded.value_hash;

-- 3) RLS — Niveau 1 (démarrage). À durcir en production (voir MIGRATION.md).
alter table site       enable row level security;
alter table galleries  enable row level security;
alter table photos     enable row level security;
alter table clients    enable row level security;
alter table messages   enable row level security;
alter table app_secrets enable row level security;
-- (app_secrets : RLS sans politique = aucun accès direct ; seules les fonctions
--  SECURITY DEFINER ci-dessus peuvent lire le hash.)

-- Lecture/écriture pour le rôle anon sur les contenus publics du site.
create policy site_all      on site      for all to anon using (true) with check (true);
create policy galleries_all on galleries for all to anon using (true) with check (true);
create policy photos_all    on photos    for all to anon using (true) with check (true);
create policy messages_all  on messages  for all to anon using (true) with check (true);

-- clients : lecture/écriture des champs NON secrets seulement (le hash est protégé
-- par les GRANT de colonnes ci-dessous), jamais password_hash en direct.
create policy clients_all on clients for all to anon using (true) with check (true);

revoke all on clients from anon;
grant select (id, name, email, gallery_ids, like_limit, likes, invoices) on clients to anon;
grant insert (id, name, email, gallery_ids, like_limit, likes, invoices) on clients to anon;
grant update (name, email, gallery_ids, like_limit, likes, invoices)     on clients to anon;
grant delete on clients to anon;

-- Les RPC sont les seules portes vers password_hash.
grant execute on function nv_login_client(text, text)        to anon;
grant execute on function nv_check_admin(text)               to anon;
grant execute on function nv_set_client_password(text, text) to anon; -- À restreindre en prod

-- 4) Temps réel
alter publication supabase_realtime add table site, galleries, photos, clients, messages;
```

Une fois ce script exécuté, suivez `docs/MIGRATION.md` pour configurer
`nv-config.js`, héberger les photos et basculer le site sur la base.

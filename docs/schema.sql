-- ============================================================================
-- SCHEMA.SQL — Portfolio Nicolas Vivaudou
-- À COPIER EN ENTIER dans Supabase → SQL Editor → Run.
-- (Niveau 1 : démarrage. Le durcissement production est dans
--  durcissement-niveau2.sql, à exécuter plus tard, avant l'ouverture publique.)
-- ============================================================================

-- 0) Extensions
create extension if not exists pgcrypto with schema extensions;
do $mv$
begin
  alter extension pgcrypto set schema extensions;
exception when others then null; -- déjà au bon endroit
end
$mv$;

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

-- Code admin initial = 1234 (CHANGEZ-LE ! voir MIGRATION.md, étape 8)
insert into app_secrets(key, value_hash)
values ('admin_pin', extensions.crypt('1234', extensions.gen_salt('bf')))
on conflict (key) do update set value_hash = excluded.value_hash;

-- 3) RLS — Niveau 1 (démarrage). À durcir en production (durcissement-niveau2.sql).
alter table site        enable row level security;
alter table galleries   enable row level security;
alter table photos      enable row level security;
alter table clients     enable row level security;
alter table messages    enable row level security;
alter table app_secrets enable row level security;
-- (app_secrets : RLS sans politique = aucun accès direct ; seules les fonctions
--  SECURITY DEFINER ci-dessus peuvent lire le hash.)

-- (Script relançable : on supprime les politiques avant de les recréer.)
drop policy if exists site_all      on site;
drop policy if exists galleries_all on galleries;
drop policy if exists photos_all    on photos;
drop policy if exists messages_all  on messages;
drop policy if exists clients_all   on clients;

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
grant execute on function nv_set_client_password(text, text) to anon; -- Restreint en prod (niveau 2)

-- 4) Temps réel (ignore l'erreur si les tables sont déjà dans la publication)
do $do$
begin
  alter publication supabase_realtime add table site, galleries, photos, clients, messages;
exception when duplicate_object then null;
end
$do$;

-- FIN. Résultat attendu : « Success. No rows returned ».
-- Suite : nv-config.js (backend: 'supabase' + url + anonKey), voir MIGRATION.md.

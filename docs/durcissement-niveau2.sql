-- ============================================================================
-- DURCISSEMENT-NIVEAU2.SQL — Portfolio Nicolas Vivaudou
-- À exécuter PLUS TARD, avant l'ouverture publique — PAS au premier déploiement.
--
-- PRÉREQUIS (sinon vous perdrez l'accès en écriture !) :
--   1. schema.sql déjà exécuté et site fonctionnel en mode 'supabase'.
--   2. Un utilisateur admin créé dans Supabase : Authentication → Users → Add user.
--   3. Son UID collé ci-dessous à la ligne « insert into admins ».
--   4. nv-auth.js branché sur supabase.auth.signInWithPassword
--      (voir MIGRATION.md, étape 8.4).
-- ============================================================================

-- 1) Allow-list des administrateurs (par user_id Supabase Auth)
create table if not exists admins ( user_id uuid primary key );
alter table admins enable row level security; -- aucun accès direct ; lue par is_admin() uniquement

-- ⚠️ REMPLACEZ l'UID ci-dessous par celui de VOTRE utilisateur admin
-- (Authentication → Users → colonne UID), puis décommentez la ligne :
-- insert into admins(user_id) values ('00000000-0000-0000-0000-000000000000');

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- 2) On retire les politiques ouvertes du Niveau 1…
drop policy if exists site_all      on site;
drop policy if exists galleries_all on galleries;
drop policy if exists photos_all    on photos;
drop policy if exists clients_all   on clients;
drop policy if exists messages_all  on messages;

-- 3) …et on les remplace : lecture publique, écriture réservée à l'admin.
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

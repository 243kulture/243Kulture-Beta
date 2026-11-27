-- 243Kulture — Push Phase 1 : préférences, devices (tokens), présence, journal d'envoi
--
-- DRAFT — NON APPLIQUÉ. Ne pas exécuter en prod sans OK explicite.
-- Quand validé : copier vers supabase/migrations/<timestamp>_push_phase1_tokens.sql
-- puis exécuter dans le SQL Editor (même procédure que P1).
--
-- Additive / idempotente. À exécuter APRÈS 20261011_p7_user_follows.sql.
-- Aucun secret ici : FCM / APNs vivent dans Supabase Edge Function secrets (dispatch-push).
--
-- Client (src/lib/pushNotifications.js) appelle :
--   rpc register_push_device(p_token, p_platform)
--   rpc disable_push_device(p_token)
--   rpc touch_user_presence()
--   upsert push_preferences (own row, RLS)
-- Tous derrière VITE_PUSH_ENABLED=false par défaut.

-- ---------- push_preferences (1 row / user) ----------
create table if not exists push_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  -- MVP
  messages boolean not null default true,
  interest_posts boolean not null default true,
  reengagement boolean not null default true,
  -- Optional later — defaults OFF
  stories_from_follows boolean not null default false,
  comment_replies boolean not null default false,
  mentions boolean not null default false,
  quiet_digest_mode boolean not null default false,
  quiet_hours_start smallint check (quiet_hours_start between 0 and 23),
  quiet_hours_end smallint check (quiet_hours_end between 0 and 23),
  updated_at timestamptz not null default now()
);

alter table push_preferences enable row level security;

drop policy if exists "Own push preferences select" on push_preferences;
create policy "Own push preferences select" on push_preferences
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Own push preferences insert" on push_preferences;
create policy "Own push preferences insert" on push_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Own push preferences update" on push_preferences;
create policy "Own push preferences update" on push_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table push_preferences from anon;
grant select, insert, update on table push_preferences to authenticated;

-- ---------- push_devices (tokens) ----------
create table if not exists push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios', 'web')),
  provider text not null check (provider in ('fcm', 'apns', 'webpush')),
  token text not null check (char_length(token) between 16 and 4096),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

-- One active owner per physical device token (shared phone / account switch).
create unique index if not exists push_devices_token_active_uniq
  on push_devices (token) where enabled;
create index if not exists push_devices_user_enabled_idx
  on push_devices (user_id) where enabled;

alter table push_devices enable row level security;

drop policy if exists "Own push devices select" on push_devices;
create policy "Own push devices select" on push_devices
  for select to authenticated using ((select auth.uid()) = user_id);

-- Writes only through the security definer RPCs below.
revoke all on table push_devices from anon;
revoke insert, update, delete on table push_devices from authenticated;
grant select on table push_devices to authenticated;

create or replace function public.register_push_device(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_provider text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_token is null or char_length(p_token) not between 16 and 4096 or p_token ~ '\s' then
    raise exception 'Invalid token';
  end if;
  v_provider := case p_platform when 'android' then 'fcm' when 'ios' then 'apns' else null end;
  if v_provider is null then
    raise exception 'Invalid platform';
  end if;

  -- Previous owner of this token (logout failed offline, account switch): stop delivering to them.
  update push_devices
     set enabled = false, last_seen_at = now()
   where token = p_token and user_id <> v_uid and enabled;

  insert into push_devices (user_id, platform, provider, token, enabled, last_seen_at)
  values (v_uid, p_platform, v_provider, p_token, true, now())
  on conflict (user_id, token)
  do update set enabled = true, platform = excluded.platform, provider = excluded.provider, last_seen_at = now();
end;
$$;

create or replace function public.disable_push_device(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update push_devices
     set enabled = false, last_seen_at = now()
   where user_id = auth.uid() and token = p_token;
end;
$$;

revoke all on function public.register_push_device(text, text) from public, anon;
revoke all on function public.disable_push_device(text) from public, anon;
grant execute on function public.register_push_device(text, text) to authenticated;
grant execute on function public.disable_push_device(text) to authenticated;

-- ---------- user_presence (règle 6 h) ----------
create table if not exists user_presence (
  user_id uuid primary key references profiles(id) on delete cascade,
  last_opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_presence enable row level security;

drop policy if exists "Own presence select" on user_presence;
create policy "Own presence select" on user_presence
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table user_presence from anon;
revoke insert, update, delete on table user_presence from authenticated;
grant select on table user_presence to authenticated;

create or replace function public.touch_user_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into user_presence (user_id, last_opened_at, updated_at)
  values (auth.uid(), now(), now())
  on conflict (user_id)
  do update set last_opened_at = now(), updated_at = now()
  -- Server-side debounce mirrors the client (5 min) so a buggy client can't hammer writes.
  where user_presence.last_opened_at < now() - interval '5 minutes';
end;
$$;

revoke all on function public.touch_user_presence() from public, anon;
grant execute on function public.touch_user_presence() to authenticated;

-- ---------- push_deliveries (anti-doublon + caps) — service role only ----------
create table if not exists push_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  notification_id uuid references notifications(id) on delete set null,
  kind text not null check (kind in ('message', 'story_reply', 'interest_post', 'digest', 'reengagement')),
  collapse_key text,
  status text not null check (status in ('queued', 'sent', 'failed', 'skipped_cap', 'skipped_pref')),
  provider_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists push_deliveries_user_created
  on push_deliveries (user_id, created_at desc);
create unique index if not exists push_deliveries_notification_once
  on push_deliveries (notification_id) where notification_id is not null and status = 'sent';

alter table push_deliveries enable row level security;

drop policy if exists "Own push deliveries select" on push_deliveries;
create policy "Own push deliveries select" on push_deliveries
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table push_deliveries from anon;
revoke insert, update, delete on table push_deliveries from authenticated;
grant select on table push_deliveries to authenticated;

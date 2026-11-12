-- 243Kulture — P1 : signalements (file de modération) + demande de suppression de compte
-- Additive / idempotente. À exécuter APRÈS P7/P8.
--
-- Règles produit :
-- - Les signalements entrent en file (status = pending). AUCUNE sanction auto (ban/suspension).
-- - La suppression Auth réelle passe par l'Edge Function `delete-account` (service_role).
-- - Cette migration enregistre la demande + drapeau profil ; le cascade profiles←auth.users
--   nettoie le graphe quand l'utilisateur Auth est réellement supprimé.

-- ---------- Compte : drapeau soft + file de demandes ----------
alter table if exists profiles
  add column if not exists deletion_requested_at timestamptz;

create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- SET NULL so the audit row survives auth.users → profiles cascade on hard delete
  user_id uuid references profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  source text not null default 'app'
    check (source in ('app', 'email', 'admin')),
  note text
);

create index if not exists account_deletion_requests_user_idx
  on account_deletion_requests (user_id, requested_at desc);
create index if not exists account_deletion_requests_pending_idx
  on account_deletion_requests (status, requested_at)
  where status in ('pending', 'processing');

alter table account_deletion_requests enable row level security;

drop policy if exists "Users read own deletion requests" on account_deletion_requests;
create policy "Users read own deletion requests" on account_deletion_requests
  for select using (auth.uid() = user_id);

revoke insert, update, delete on table account_deletion_requests from anon, authenticated;
grant select on table account_deletion_requests to authenticated;

-- Enregistre une demande (idempotent côté user) — NE supprime PAS auth.users.
create or replace function public.request_account_deletion(p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update profiles
     set deletion_requested_at = coalesce(deletion_requested_at, now())
   where id = v_uid;

  insert into account_deletion_requests (user_id, status, source, note)
  values (v_uid, 'pending', 'app', nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;

  return jsonb_build_object(
    'request_id', v_id,
    'status', 'pending',
    'message', 'Deletion requested. Auth user removal is handled by delete-account Edge Function.'
  );
end;
$$;

revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;

-- ---------- Modération : file de signalements (pas de ban auto) ----------
create table if not exists moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_type text not null
    check (target_type in ('user', 'post', 'story', 'comment', 'message', 'other')),
  target_id text,
  target_user_id uuid references profiles(id) on delete set null,
  reason text not null
    check (reason in (
      'illegal', 'harassment', 'hate', 'scam', 'impersonation',
      'privacy', 'ip', 'spam', 'other'
    )),
  details text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_note text,
  check (target_user_id is null or target_user_id <> reporter_id)
);

create index if not exists moderation_reports_status_idx
  on moderation_reports (status, created_at desc);
create index if not exists moderation_reports_reporter_idx
  on moderation_reports (reporter_id, created_at desc);
create index if not exists moderation_reports_target_user_idx
  on moderation_reports (target_user_id, created_at desc)
  where target_user_id is not null;

alter table moderation_reports enable row level security;

drop policy if exists "Users read own reports" on moderation_reports;
create policy "Users read own reports" on moderation_reports
  for select using (auth.uid() = reporter_id);

revoke insert, update, delete on table moderation_reports from anon, authenticated;
grant select on table moderation_reports to authenticated;

create or replace function public.submit_moderation_report(
  p_target_type text,
  p_target_id text default null,
  p_target_user_id uuid default null,
  p_reason text default 'other',
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_today integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_target_type is null or p_target_type not in ('user', 'post', 'story', 'comment', 'message', 'other') then
    raise exception 'Invalid target type';
  end if;

  if p_reason is null or p_reason not in (
    'illegal', 'harassment', 'hate', 'scam', 'impersonation',
    'privacy', 'ip', 'spam', 'other'
  ) then
    raise exception 'Invalid reason';
  end if;

  if p_target_user_id is not null and p_target_user_id = v_uid then
    raise exception 'Cannot report yourself';
  end if;

  if p_target_type = 'user' and p_target_user_id is null then
    raise exception 'target_user_id required for user reports';
  end if;

  if p_target_user_id is not null
     and not exists (select 1 from profiles where id = p_target_user_id) then
    raise exception 'Target user not found';
  end if;

  -- Soft rate limit: 20 reports / rolling day (no ban side-effect)
  select count(*)::integer into v_today
  from moderation_reports
  where reporter_id = v_uid
    and created_at > now() - interval '24 hours';

  if v_today >= 20 then
    raise exception 'Report rate limit reached';
  end if;

  insert into moderation_reports (
    reporter_id, target_type, target_id, target_user_id, reason, details, status
  ) values (
    v_uid,
    p_target_type,
    nullif(trim(coalesce(p_target_id, '')), ''),
    p_target_user_id,
    p_reason,
    nullif(trim(coalesce(p_details, '')), ''),
    'pending'
  )
  returning id into v_id;

  -- Explicit: status stays pending. No ban / mute / content delete here.
  return jsonb_build_object(
    'report_id', v_id,
    'status', 'pending',
    'auto_action', 'none'
  );
end;
$$;

revoke all on function public.submit_moderation_report(text, text, uuid, text, text) from public, anon;
grant execute on function public.submit_moderation_report(text, text, uuid, text, text) to authenticated;

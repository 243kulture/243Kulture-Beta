-- 243Kulture — P8 : onboarding gate (langues + acceptation CGU)
-- Additive / idempotente. Ne touche PAS friend_invitations / user_follows / notifications.
-- Tables dédiées 243Kulture (ne réutilise PAS jovatax_*).

-- ---------- Langues UI (8 codes) ----------
alter table if exists profiles drop constraint if exists profiles_language_check;
alter table if exists profiles
  add constraint profiles_language_check
  check (language is null or language = any (array[
    'fr'::text, 'en'::text, 'nl'::text, 'ln'::text,
    'sw'::text, 'lua'::text, 'kg'::text, 'mongo'::text
  ]));

-- ---------- Versions légales requises ----------
create table if not exists legal_required_versions (
  document_type text not null check (document_type in ('cgu', 'privacy')),
  version text not null,
  required_from timestamptz not null default now(),
  primary key (document_type)
);

alter table legal_required_versions enable row level security;

drop policy if exists "Authenticated read legal required versions" on legal_required_versions;
create policy "Authenticated read legal required versions"
  on legal_required_versions for select
  using (auth.role() = 'authenticated');

revoke insert, update, delete on table legal_required_versions from anon, authenticated;
grant select on table legal_required_versions to authenticated;

insert into legal_required_versions (document_type, version)
values ('cgu', 'v1.0'), ('privacy', 'v1.0')
on conflict (document_type) do nothing;

-- ---------- Historique d'acceptation (append-only) ----------
create table if not exists legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  document_type text not null check (document_type in ('cgu', 'privacy')),
  version text not null,
  accepted_at timestamptz not null default now()
);

create index if not exists legal_consents_user_idx
  on legal_consents (user_id, document_type, accepted_at desc);

create index if not exists legal_consents_user_doc_version_idx
  on legal_consents (user_id, document_type, version);

alter table legal_consents enable row level security;

drop policy if exists "Users read own legal consents" on legal_consents;
create policy "Users read own legal consents"
  on legal_consents for select
  using (auth.uid() = user_id);

-- Pas d'INSERT/UPDATE/DELETE client direct : RPC security definer
revoke insert, update, delete on table legal_consents from anon, authenticated;
grant select on table legal_consents to authenticated;

create or replace function public.accept_legal_document(p_document_type text, p_version text)
returns legal_consents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_required text;
  v_row legal_consents;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_document_type is null or p_document_type not in ('cgu', 'privacy') then
    raise exception 'invalid_document_type';
  end if;
  if p_version is null or length(trim(p_version)) = 0 then
    raise exception 'invalid_version';
  end if;

  select version into v_required
  from legal_required_versions
  where document_type = p_document_type;

  if v_required is null then raise exception 'required_version_missing'; end if;
  if p_version <> v_required then raise exception 'version_mismatch'; end if;

  -- Historique : on ré-insère même si déjà accepté (traçabilité)
  insert into legal_consents (user_id, document_type, version)
  values (v_me, p_document_type, p_version)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.has_accepted_legal(p_document_type text, p_version text default null)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_me uuid := auth.uid();
  v_version text := p_version;
begin
  if v_me is null then return false; end if;
  if p_document_type is null then return false; end if;
  if v_version is null then
    select version into v_version from legal_required_versions where document_type = p_document_type;
  end if;
  if v_version is null then return false; end if;
  return exists (
    select 1 from legal_consents
    where user_id = v_me
      and document_type = p_document_type
      and version = v_version
  );
end;
$$;

revoke all on function public.accept_legal_document(text, text) from public, anon;
grant execute on function public.accept_legal_document(text, text) to authenticated;
revoke all on function public.has_accepted_legal(text, text) from public, anon;
grant execute on function public.has_accepted_legal(text, text) to authenticated;
-- overload convenience: has_accepted_legal(text) uses required version
create or replace function public.has_accepted_legal(p_document_type text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_accepted_legal(p_document_type, null);
$$;
revoke all on function public.has_accepted_legal(text) from public, anon;
grant execute on function public.has_accepted_legal(text) to authenticated;

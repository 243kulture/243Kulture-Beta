-- 243Kulture — Invitations d'amis (additive) — P4b
-- À exécuter APRÈS 20260822_p4_progress_persistence.sql
-- (et donc après schema + p1 + p2* + p3).
-- Idempotente. Ne remplace pas les tables existantes.

-- ---------- Table d'invitations ----------
create table if not exists friend_invitations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);

alter table friend_invitations drop constraint if exists friend_invitations_pair_key;
alter table friend_invitations add constraint friend_invitations_pair_key unique (sender_id, recipient_id);

create unique index if not exists friend_invitations_pending_unordered_idx
  on friend_invitations (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status = 'pending';

create index if not exists friend_invitations_recipient_pending_idx
  on friend_invitations (recipient_id, created_at desc)
  where status = 'pending';

alter table friend_invitations enable row level security;

drop policy if exists "Participants read invitations" on friend_invitations;
create policy "Participants read invitations"
  on friend_invitations for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Aucun INSERT / UPDATE / DELETE client : tout passe par des RPC security definer.

-- ---------- Friendships : plus d'ajout unilatéral ----------
drop policy if exists "Chacun gère ses propres relations" on friendships;
drop policy if exists "Participants read friendships" on friendships;
drop policy if exists "Participants delete friendships" on friendships;

create policy "Participants read friendships"
  on friendships for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Participants delete friendships"
  on friendships for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Pas de policy INSERT : seules les fonctions ci-dessous peuvent créer une relation.

-- ---------- Helpers ----------
create or replace function public._are_friends(a uuid, b uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from friendships
    where (user_id = a and friend_id = b) or (user_id = b and friend_id = a)
  );
$$;

create or replace function public._insert_friendship_pair(a uuid, b uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into friendships (user_id, friend_id) values (a, b)
  on conflict (user_id, friend_id) do nothing;
  insert into friendships (user_id, friend_id) values (b, a)
  on conflict (user_id, friend_id) do nothing;
end;
$$;

-- ---------- Envoyer une invitation ----------
create or replace function public.send_friend_invitation(p_recipient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row friend_invitations;
  v_existing friend_invitations;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_recipient_id is null or p_recipient_id = v_me then raise exception 'invalid_recipient'; end if;
  if not exists (select 1 from profiles where id = p_recipient_id) then raise exception 'user_not_found'; end if;
  if public._are_friends(v_me, p_recipient_id) then raise exception 'already_friends'; end if;

  select * into v_existing
  from friend_invitations
  where status = 'pending'
    and (
      (sender_id = v_me and recipient_id = p_recipient_id)
      or (sender_id = p_recipient_id and recipient_id = v_me)
    )
  limit 1;

  if found then
    if v_existing.sender_id = v_me then raise exception 'invite_already_sent'; end if;
    raise exception 'invite_already_received';
  end if;

  insert into friend_invitations (sender_id, recipient_id, status)
  values (v_me, p_recipient_id, 'pending')
  on conflict (sender_id, recipient_id) do update
    set status = 'pending', created_at = now(), responded_at = null
    where friend_invitations.status in ('declined', 'cancelled')
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from friend_invitations
    where sender_id = v_me and recipient_id = p_recipient_id;
    if v_row.status = 'pending' then raise exception 'invite_already_sent'; end if;
    if v_row.status = 'accepted' then raise exception 'already_friends'; end if;
    update friend_invitations
      set status = 'pending', created_at = now(), responded_at = null
      where id = v_row.id
      returning * into v_row;
  end if;

  insert into notifications (user_id, actor_id, type, text)
  values (p_recipient_id, v_me, 'friend_invite', 'Nouvelle invitation d''ami');

  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'sender_id', v_row.sender_id, 'recipient_id', v_row.recipient_id);
end;
$$;

-- ---------- Accepter ----------
create or replace function public.accept_friend_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row friend_invitations;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_row from friend_invitations where id = p_invitation_id for update;
  if not found then raise exception 'invite_not_found'; end if;
  if v_row.recipient_id <> v_me then raise exception 'not_recipient'; end if;
  if v_row.status <> 'pending' then raise exception 'invite_not_pending'; end if;

  update friend_invitations
    set status = 'accepted', responded_at = now()
    where id = v_row.id
    returning * into v_row;

  perform public._insert_friendship_pair(v_row.sender_id, v_row.recipient_id);

  insert into notifications (user_id, actor_id, type, text)
  values (v_row.sender_id, v_me, 'friend_accepted', 'Invitation d''ami acceptée');

  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'sender_id', v_row.sender_id, 'recipient_id', v_row.recipient_id);
end;
$$;

-- ---------- Refuser ----------
create or replace function public.decline_friend_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row friend_invitations;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_row from friend_invitations where id = p_invitation_id for update;
  if not found then raise exception 'invite_not_found'; end if;
  if v_row.recipient_id <> v_me then raise exception 'not_recipient'; end if;
  if v_row.status <> 'pending' then raise exception 'invite_not_pending'; end if;

  update friend_invitations
    set status = 'declined', responded_at = now()
    where id = v_row.id
    returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;

-- ---------- Annuler une invitation envoyée ----------
create or replace function public.cancel_friend_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row friend_invitations;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_row from friend_invitations where id = p_invitation_id for update;
  if not found then raise exception 'invite_not_found'; end if;
  if v_row.sender_id <> v_me then raise exception 'not_sender'; end if;
  if v_row.status <> 'pending' then raise exception 'invite_not_pending'; end if;

  update friend_invitations
    set status = 'cancelled', responded_at = now()
    where id = v_row.id
    returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;

-- ---------- Supprimer une relation ----------
create or replace function public.remove_friendship(p_friend_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_deleted int;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_friend_id is null or p_friend_id = v_me then raise exception 'invalid_recipient'; end if;

  delete from friendships
  where (user_id = v_me and friend_id = p_friend_id)
     or (user_id = p_friend_id and friend_id = v_me);
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then raise exception 'not_friends'; end if;

  update friend_invitations
    set status = 'cancelled', responded_at = now()
    where status = 'accepted'
      and (
        (sender_id = v_me and recipient_id = p_friend_id)
        or (sender_id = p_friend_id and recipient_id = v_me)
      );

  return jsonb_build_object('removed', true, 'friend_id', p_friend_id);
end;
$$;

revoke all on function public.send_friend_invitation(uuid) from public, anon;
revoke all on function public.accept_friend_invitation(uuid) from public, anon;
revoke all on function public.decline_friend_invitation(uuid) from public, anon;
revoke all on function public.cancel_friend_invitation(uuid) from public, anon;
revoke all on function public.remove_friendship(uuid) from public, anon;

grant execute on function public.send_friend_invitation(uuid) to authenticated;
grant execute on function public.accept_friend_invitation(uuid) to authenticated;
grant execute on function public.decline_friend_invitation(uuid) to authenticated;
grant execute on function public.cancel_friend_invitation(uuid) to authenticated;
grant execute on function public.remove_friendship(uuid) to authenticated;

revoke all on table friend_invitations from anon, authenticated;
grant select on table friend_invitations to authenticated;

revoke insert on table friendships from anon, authenticated;

-- Helpers internes : pas d'exécution client
revoke all on function public._are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public._insert_friendship_pair(uuid, uuid) from public, anon, authenticated;

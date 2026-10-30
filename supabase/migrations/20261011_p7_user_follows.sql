-- 243Kulture — P7 : abonnements utilisateur (Follow ≠ Friend)
-- Additive / idempotente. À exécuter APRÈS :
--   20261001_p4_friend_invitations.sql
--   20261001_p4c_revoke_anon_story_reply.sql
--   20261001_p6_notifications_read_at_only.sql
--
-- IMPORTANT :
-- - Ne crée PAS friend_requests et ne remplace PAS friend_invitations.
-- - Follow est unidirectionnel ; Friend reste via friend_invitations / friendships.
-- - Aligne le SQL repo sur le modèle live validé (notif seulement si insert réel).

-- ---------- Métadonnées notifications (deep links) ----------
alter table if exists notifications add column if not exists entity_type text;
alter table if exists notifications add column if not exists entity_id uuid;
alter table if exists notifications add column if not exists deep_link text;

-- ---------- user_follows ----------
create table if not exists user_follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followed_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create index if not exists user_follows_followed_idx
  on user_follows (followed_id, created_at desc);
create index if not exists user_follows_follower_idx
  on user_follows (follower_id, created_at desc);

alter table user_follows enable row level security;

drop policy if exists "Users read user follows" on user_follows;
create policy "Users read user follows" on user_follows
  for select using (auth.role() = 'authenticated');

-- Écritures uniquement via RPC security definer
revoke insert, update, delete on table user_follows from anon, authenticated;
grant select on table user_follows to authenticated;

-- ---------- follow / unfollow (idempotent, notif si nouvel abonnement) ----------
create or replace function public.follow_user(p_followed_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if auth.uid() is null
     or p_followed_id is null
     or p_followed_id = auth.uid() then
    raise exception 'Invalid follow';
  end if;

  if not exists (select 1 from profiles where id = p_followed_id) then
    raise exception 'User not found';
  end if;

  insert into user_follows (follower_id, followed_id)
  values (auth.uid(), p_followed_id)
  on conflict do nothing
  returning 1 into v_inserted;

  if v_inserted is not null then
    insert into notifications (
      user_id, actor_id, type, text,
      entity_type, entity_id, deep_link
    )
    values (
      p_followed_id,
      auth.uid(),
      'user_follow',
      'Nouvel abonné',
      'profile',
      auth.uid(),
      '/profile/' || auth.uid()
    );
  end if;
end;
$$;

create or replace function public.unfollow_user(p_followed_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from user_follows
  where follower_id = auth.uid() and followed_id = p_followed_id;
end;
$$;

revoke all on function public.follow_user(uuid) from public, anon;
grant execute on function public.follow_user(uuid) to authenticated;
revoke all on function public.unfollow_user(uuid) from public, anon;
grant execute on function public.unfollow_user(uuid) to authenticated;

-- ---------- Compteurs profil public (lecture agrégée) ----------
create or replace function public.get_public_profile_stats(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_followers integer;
  v_following integer;
  v_posts integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_profile_id is null then raise exception 'Invalid profile'; end if;
  if not exists (select 1 from profiles where id = p_profile_id) then
    raise exception 'User not found';
  end if;

  select count(*)::integer into v_followers
  from user_follows where followed_id = p_profile_id;

  select count(*)::integer into v_following
  from user_follows where follower_id = p_profile_id;

  select count(*)::integer into v_posts
  from posts where user_id = p_profile_id;

  return jsonb_build_object(
    'followers', v_followers,
    'following', v_following,
    'posts', v_posts
  );
end;
$$;

revoke all on function public.get_public_profile_stats(uuid) from public, anon;
grant execute on function public.get_public_profile_stats(uuid) to authenticated;

-- ---------- Notification commentaire sur publication ----------
create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from posts where id = new.post_id;
  if v_owner is null or v_owner = new.user_id then
    return new;
  end if;

  insert into notifications (
    user_id, actor_id, type, text,
    entity_type, entity_id, deep_link
  )
  values (
    v_owner,
    new.user_id,
    'post_comment',
    'Nouveau commentaire sur ta publication',
    'post',
    new.post_id,
    '/community?tab=feed'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_post_comment on post_comments;
create trigger trg_notify_post_comment
after insert on post_comments
for each row execute function public.notify_post_comment();

-- Garantit que P6 (read_at only) reste en place même si cette migration
-- est rejouée après un restore partiel.
revoke update on table public.notifications from authenticated;
revoke update on table public.notifications from anon;
grant update (read_at) on table public.notifications to authenticated;
grant select on table public.notifications to authenticated;
revoke insert, delete on table public.notifications from authenticated, anon;

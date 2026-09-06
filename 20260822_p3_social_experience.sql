-- 243Kulture Social Experience additive migration
-- Comments, reposts, post media, notifications and secure story replies.

alter table if exists posts add column if not exists media_url text;
alter table if exists posts add column if not exists media_type text check (media_type in ('image','video') or media_type is null);

create table if not exists post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  parent_id uuid references post_comments(id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  created_at timestamptz default now()
);
alter table post_comments enable row level security;
create policy "Connected users can read comments" on post_comments for select using (auth.role() = 'authenticated');
create policy "Users create their own comments" on post_comments for insert with check (auth.uid() = user_id);
create policy "Users delete their own comments" on post_comments for delete using (auth.uid() = user_id);

create table if not exists post_reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);
alter table post_reposts enable row level security;
create policy "Connected users can read reposts" on post_reposts for select using (auth.role() = 'authenticated');
create policy "Users create their own reposts" on post_reposts for insert with check (auth.uid() = user_id);
create policy "Users delete their own reposts" on post_reposts for delete using (auth.uid() = user_id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  type text not null,
  text text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);
alter table notifications enable row level security;
create policy "Users read their notifications" on notifications for select using (auth.uid() = user_id);
create policy "Users mark their notifications read" on notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists story_replies (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references stories(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  recipient_id uuid references profiles(id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  created_at timestamptz default now()
);
alter table story_replies enable row level security;
create policy "Participants read story replies" on story_replies for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

create or replace function public.send_story_reply(p_story_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_text text := trim(p_text);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_text = '' then raise exception 'Empty reply'; end if;
  select user_id into v_recipient from stories where id = p_story_id and created_at > now() - interval '24 hours';
  if v_recipient is null then raise exception 'Story not found or expired'; end if;
  if v_recipient = auth.uid() then raise exception 'Cannot reply to your own story'; end if;

  insert into story_replies(story_id, sender_id, recipient_id, text)
  values (p_story_id, auth.uid(), v_recipient, v_text);

  insert into messages(sender_id, recipient_id, text)
  values (auth.uid(), v_recipient, 'Réponse à ta Story : ' || v_text);

  insert into notifications(user_id, actor_id, type, text)
  values (v_recipient, auth.uid(), 'story_reply', 'Nouvelle réponse à ta Story');
end;
$$;
revoke all on function public.send_story_reply(uuid, text) from public;
grant execute on function public.send_story_reply(uuid, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('posts', 'posts', true)
on conflict (id) do update set public = true;

create policy "Post media visible to connected users"
on storage.objects for select using (bucket_id = 'posts');
create policy "Users upload their post media"
on storage.objects for insert with check (bucket_id = 'posts' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users delete their post media"
on storage.objects for delete using (bucket_id = 'posts' and auth.uid()::text = (storage.foldername(name))[1]);

create index if not exists post_comments_post_id_idx on post_comments(post_id, created_at);
create index if not exists post_reposts_post_id_idx on post_reposts(post_id, created_at);
create index if not exists notifications_user_id_idx on notifications(user_id, created_at desc);
create index if not exists story_replies_recipient_id_idx on story_replies(recipient_id, created_at desc);

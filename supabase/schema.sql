-- =============================================================
-- 243Kulture — schéma Supabase
-- À exécuter dans Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- ---------- PROFILS ----------
-- Un profil par utilisateur, créé automatiquement à l'inscription (trigger plus bas)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text default 'Fan de rumba',
  avatar_icon text default '🎶',
  language text default 'fr' check (language in ('fr','ln','en','nl')),
  xp integer default 0,
  streak_days integer default 0,
  last_active_date date default current_date,
  onboarding_completed boolean default false,
  onboarding_interests text[] default '{}',
  onboarding_country text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "Les profils sont visibles par tous les connectés"
  on profiles for select using (auth.role() = 'authenticated');
create policy "Un utilisateur modifie seulement son propre profil"
  on profiles for update using (auth.uid() = id);

-- Crée automatiquement un profil quand quelqu'un s'inscrit via Supabase Auth
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------- ARTISTES SUIVIS ----------
create table if not exists followed_artists (
  user_id uuid references profiles(id) on delete cascade,
  artist_id text not null,
  created_at timestamptz default now(),
  primary key (user_id, artist_id)
);
alter table followed_artists enable row level security;
create policy "Chacun gère ses propres suivis"
  on followed_artists for all using (auth.uid() = user_id);

-- ---------- FAVORIS ----------
create table if not exists favorites (
  user_id uuid references profiles(id) on delete cascade,
  item_id text not null,
  item_type text not null, -- 'podcast' | 'article' | 'insta' | 'ytep'
  title text,
  sub text,
  icon text,
  created_at timestamptz default now(),
  primary key (user_id, item_id)
);
alter table favorites enable row level security;
create policy "Chacun gère ses propres favoris"
  on favorites for all using (auth.uid() = user_id);

-- ---------- AMIS ----------
create table if not exists friendships (
  user_id uuid references profiles(id) on delete cascade,
  friend_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table friendships enable row level security;
create policy "Chacun gère ses propres relations"
  on friendships for all using (auth.uid() = user_id or auth.uid() = friend_id);

-- ---------- FIL COMMUNAUTAIRE ----------
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);
alter table posts enable row level security;
create policy "Tout le monde connecté peut lire les publications"
  on posts for select using (auth.role() = 'authenticated');
create policy "Chacun publie en son propre nom"
  on posts for insert with check (auth.uid() = user_id);
create policy "Chacun supprime ses propres publications"
  on posts for delete using (auth.uid() = user_id);

create table if not exists post_reactions (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  emoji text not null,
  primary key (post_id, user_id)
);
alter table post_reactions enable row level security;
create policy "Tout le monde connecté peut lire les réactions"
  on post_reactions for select using (auth.role() = 'authenticated');
create policy "Chacun gère sa propre réaction"
  on post_reactions for all using (auth.uid() = user_id);

-- ---------- MESSAGES PRIVÉS ----------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles(id) on delete cascade,
  recipient_id uuid references profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);
alter table messages enable row level security;
create policy "Seuls les deux participants lisent leurs messages"
  on messages for select using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "Chacun envoie ses propres messages"
  on messages for insert with check (auth.uid() = sender_id);

-- ---------- STORIES (24h) ----------
create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  type text not null check (type in ('text','image','video')),
  text_content text,
  color text,
  media_url text,
  created_at timestamptz default now()
);
alter table stories enable row level security;
create policy "Les stories de moins de 24h sont visibles par tous les connectés"
  on stories for select using (auth.role() = 'authenticated' and created_at > now() - interval '24 hours');
create policy "Chacun publie ses propres stories"
  on stories for insert with check (auth.uid() = user_id);
create policy "Chacun supprime ses propres stories"
  on stories for delete using (auth.uid() = user_id);

-- ---------- STORAGE DES STORIES ----------
-- Bucket public : les fichiers sont référencés par media_url et les stories
-- expirées ne sont plus visibles dans la table après 24h.
insert into storage.buckets (id, name, public)
values ('stories', 'stories', true)
on conflict (id) do update set public = true;

create policy "Stories media visibles"
  on storage.objects for select
  using (bucket_id = 'stories');
create policy "Chaque utilisateur peut envoyer ses stories"
  on storage.objects for insert
  with check (bucket_id = 'stories' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Chaque utilisateur peut supprimer ses stories"
  on storage.objects for delete
  using (bucket_id = 'stories' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------- DEBATS 243 ----------
create table if not exists debate_votes (
  user_id uuid references profiles(id) on delete cascade,
  debate_id text not null,
  option_index integer not null,
  created_at timestamptz default now(),
  primary key (user_id, debate_id)
);
alter table debate_votes enable row level security;
create policy "Tout le monde connecté peut lire les votes (agrégés côté app)"
  on debate_votes for select using (auth.role() = 'authenticated');
create policy "Chacun vote en son propre nom, une seule fois"
  on debate_votes for insert with check (auth.uid() = user_id);

create table if not exists debate_reactions (
  user_id uuid references profiles(id) on delete cascade,
  debate_id text not null,
  emoji text not null,
  primary key (user_id, debate_id)
);
alter table debate_reactions enable row level security;
create policy "Chacun gère sa propre réaction de débat"
  on debate_reactions for all using (auth.uid() = user_id);

-- ---------- EVENEMENTS ("J'y vais") ----------
create table if not exists event_attendance (
  user_id uuid references profiles(id) on delete cascade,
  event_id text not null,
  created_at timestamptz default now(),
  primary key (user_id, event_id)
);
alter table event_attendance enable row level security;
create policy "Chacun gère sa propre participation aux événements"
  on event_attendance for all using (auth.uid() = user_id);

-- ---------- QUIZ & BADGES ----------
create table if not exists quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  score integer not null,
  total integer not null,
  completed_at timestamptz default now()
);
alter table quiz_results enable row level security;
create policy "Chacun gère ses propres résultats de quiz"
  on quiz_results for all using (auth.uid() = user_id);

create table if not exists badges (
  user_id uuid references profiles(id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz default now(),
  primary key (user_id, badge_id)
);
alter table badges enable row level security;
create policy "Chacun gère ses propres badges"
  on badges for all using (auth.uid() = user_id);

-- ---------- COLLECTIONS (progression de découverte) ----------
create table if not exists discovered_items (
  user_id uuid references profiles(id) on delete cascade,
  item_key text not null, -- ex: 'artist:ar1' ou 'fact:0'
  discovered_at timestamptz default now(),
  primary key (user_id, item_key)
);
alter table discovered_items enable row level security;
create policy "Chacun gère sa propre progression"
  on discovered_items for all using (auth.uid() = user_id);

-- =============================================================
-- Fin du schéma. Le CONTENU éditorial (articles, podcasts, quiz,
-- débats, artistes, timeline...) n'est PAS ici : il reste dans
-- src/App.jsx pour l'instant (couche "contenu", voir le commentaire
-- en tête de App.jsx). Il pourra être migré vers ses propres tables
-- Supabase plus tard, quand un espace admin sera nécessaire.
-- =============================================================

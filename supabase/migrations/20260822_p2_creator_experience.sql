-- =============================================================
-- 243Kulture — Migration Priorité 2 (suite additive)
-- Creator Experience V1 : champs manquants pour l'interface
-- Date : 2026-08-22
-- Idempotente. N'annule ni ne modifie 20260822_p1_security.sql
-- ni 20260822_p2_creator_accounts.sql.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Nouvelles colonnes profils créateur (complément)
-- -------------------------------------------------------------
alter table profiles
  add column if not exists creator_handle text,
  add column if not exists creator_type text,
  add column if not exists creator_languages text[] not null default '{}',
  add column if not exists featured_post_ids uuid[] not null default '{}';

-- Unicité du pseudo public, une fois renseigné (autorise plusieurs NULL).
drop index if exists profiles_creator_handle_unique_idx;
create unique index profiles_creator_handle_unique_idx
  on profiles (creator_handle)
  where creator_handle is not null;

-- -------------------------------------------------------------
-- 2. Limite du portfolio "à la une" (max 6 posts)
-- -------------------------------------------------------------
-- Contrainte applicative légère plutôt qu'une contrainte SQL rigide,
-- pour rester simple et lisible.
create or replace function check_featured_post_limit()
returns trigger
language plpgsql
as $$
begin
  if array_length(new.featured_post_ids, 1) is not null
     and array_length(new.featured_post_ids, 1) > 6 then
    raise exception 'Un maximum de 6 contenus peut être mis à la une.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_featured_post_limit on profiles;

create trigger trg_check_featured_post_limit
before update on profiles
for each row
execute function check_featured_post_limit();

-- -------------------------------------------------------------
-- 3. Sécurité — rappel, aucune nouvelle policy nécessaire
-- -------------------------------------------------------------
-- Lecture : la policy existante
--   "Les profils sont visibles par tous les connectés" (auth.role() = 'authenticated')
-- couvre déjà ces colonnes.
--
-- Écriture : la policy existante
--   "Un utilisateur modifie seulement son propre profil" (auth.uid() = id)
-- couvre déjà ces colonnes. Elles ne sont pas creator_status ni verified_at,
-- donc non concernées par le trigger anti-auto-certification de la migration
-- précédente, ce qui est le comportement voulu (un créateur gère librement
-- son handle, son type, ses langues et sa sélection "à la une").
--
-- Aucun GRANT/REVOKE supplémentaire n'est nécessaire.

-- =============================================================
-- Fin de la migration.
-- =============================================================

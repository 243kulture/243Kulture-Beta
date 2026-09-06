-- =============================================================
-- 243Kulture — Migration Priorité 2 (version finale)
-- Comptes créateurs de contenu & certification
-- Date : 2026-08-22
-- Idempotente : peut être exécutée plusieurs fois sans erreur.
-- À exécuter APRÈS schema.sql et 20260822_p1_security.sql.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Nouvelles colonnes sur profiles
-- -------------------------------------------------------------
alter table profiles
  add column if not exists creator_status text not null default 'member',
  add column if not exists verified_at timestamptz null,
  add column if not exists creator_name text null,
  add column if not exists creator_bio text null,
  add column if not exists creator_categories text[] not null default '{}',
  add column if not exists creator_location text null,
  add column if not exists creator_ig text null,
  add column if not exists creator_tiktok text null,
  add column if not exists creator_youtube text null,
  add column if not exists creator_website text null,
  add column if not exists audience_size text null;

alter table profiles drop constraint if exists profiles_creator_status_check;
alter table profiles add constraint profiles_creator_status_check
  check (creator_status in ('member', 'creator', 'pending_verification', 'verified_creator'));

-- -------------------------------------------------------------
-- 2. Confidentialité des champs créateur — état réel (rappel)
-- -------------------------------------------------------------
-- La policy existante dans schema.sql :
--   create policy "Les profils sont visibles par tous les connectés"
--   on profiles for select using (auth.role() = 'authenticated');
-- rend déjà TOUTES les colonnes de profiles lisibles par tout
-- utilisateur connecté, pour n'importe quel profil. Cela inclut donc
-- déjà, sans action supplémentaire, toutes les colonnes créateur
-- ajoutées ci-dessus. Aucune policy de lecture n'est ajoutée dans
-- cette migration : il n'y a rien à ouvrir, et il n'existe pas de
-- distinction profil public/privé dans ce schéma. Voir migration
-- précédente pour le détail de ce constat.

-- -------------------------------------------------------------
-- 3. Transitions autorisées côté client — workflow strict
-- -------------------------------------------------------------
-- Parcours utilisateur prévu, et uniquement celui-ci :
--   member -> creator
--   creator -> pending_verification
-- Toute autre transition tentée depuis le client doit échouer,
-- notamment member -> pending_verification (saut d'étape) et bien
-- sûr tout passage vers verified_creator (traité en section 4).

-- -------------------------------------------------------------
-- 4. Trigger unique : workflow + anti-auto-certification
-- -------------------------------------------------------------
-- Un utilisateur peut passer lui-même de 'member' à 'creator', puis
-- de 'creator' à 'pending_verification' — rien d'autre. Il ne peut
-- JAMAIS passer lui-même à 'verified_creator', ni modifier
-- verified_at.
--
-- Rappel sécurité (déjà validé) : dans Supabase SQL Editor, les
-- requêtes s'exécutent en tant que rôle Postgres "postgres", sans
-- JWT — auth.role() y renvoie NULL, pas 'service_role'. C'est
-- pourquoi la protection ne repose pas sur auth.role(), mais sur un
-- indicateur de session (current_setting) positionné uniquement par
-- la fonction admin_approve_creator() ci-dessous.

create or replace function prevent_client_self_certification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Indicateur positionné uniquement par admin_approve_creator(),
  -- jamais accessible depuis le client. Contourne toutes les
  -- vérifications ci-dessous : c'est le seul chemin légitime vers
  -- verified_creator.
  if coalesce(current_setting('app.creator_approval_in_progress', true), 'off') = 'on' then
    return new;
  end if;

  -- Aucun changement de statut : rien à vérifier ici, on laisse
  -- passer (les autres colonnes, comme creator_bio, ne sont pas
  -- concernées par ce trigger).
  if new.creator_status is distinct from old.creator_status then

    -- Blocage explicite : jamais de passage direct à verified_creator
    -- depuis le client, quel que soit le statut de départ.
    if new.creator_status = 'verified_creator' then
      raise exception 'Passage à verified_creator interdit depuis le client. Utilisez admin_approve_creator() en tant qu''administrateur.';
    end if;

    -- Workflow strict : seules ces deux transitions sont autorisées
    -- côté client. Toute autre valeur de (old, new) est refusée,
    -- y compris member -> pending_verification (saut d'étape).
    if not (
      (old.creator_status = 'member' and new.creator_status = 'creator')
      or
      (old.creator_status = 'creator' and new.creator_status = 'pending_verification')
    ) then
      raise exception 'Transition de statut créateur non autorisée : % vers %. Parcours attendu : member -> creator -> pending_verification.',
        old.creator_status, new.creator_status;
    end if;

  end if;

  if new.verified_at is distinct from old.verified_at then
    raise exception 'Modification de verified_at interdite depuis le client.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_client_self_certification on profiles;

create trigger trg_prevent_client_self_certification
before update on profiles
for each row
execute function prevent_client_self_certification();

-- -------------------------------------------------------------
-- 5. Fonction d'approbation admin — inchangée
-- -------------------------------------------------------------
create or replace function admin_approve_creator(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.creator_approval_in_progress', 'on', true);

  update profiles
  set creator_status = 'verified_creator',
      verified_at = now()
  where id = p_user_id
    and creator_status = 'pending_verification';

  perform set_config('app.creator_approval_in_progress', 'off', true);
exception
  when others then
    perform set_config('app.creator_approval_in_progress', 'off', true);
    raise;
end;
$$;

revoke all on function admin_approve_creator(uuid) from public;
revoke all on function admin_approve_creator(uuid) from anon;
revoke all on function admin_approve_creator(uuid) from authenticated;
grant execute on function admin_approve_creator(uuid) to postgres;
grant execute on function admin_approve_creator(uuid) to service_role;

-- -------------------------------------------------------------
-- 6. Procédure d'approbation — testable dans Supabase SQL Editor
-- -------------------------------------------------------------
-- 1. Identifier l'utilisateur à valider :
--      select id, display_name, creator_name, creator_status
--      from profiles
--      where creator_status = 'pending_verification';
--
-- 2. Approuver (remplacer l'UUID par celui du profil concerné) :
--      select admin_approve_creator('11111111-1111-1111-1111-111111111111');
--
-- 3. Vérifier :
--      select id, creator_status, verified_at
--      from profiles
--      where id = '11111111-1111-1111-1111-111111111111';
--      -- creator_status doit valoir 'verified_creator', verified_at renseigné.
--
-- 4. Tests négatifs, à exécuter côté client (authentifié via l'app),
--    PAS depuis le SQL Editor :
--      -- (a) saut direct vers verified_creator : doit échouer
--      update profiles set creator_status = 'verified_creator' where id = auth.uid();
--
--      -- (b) saut d'étape member -> pending_verification : doit échouer
--      -- (uniquement si le compte de test est encore 'member')
--      update profiles set creator_status = 'pending_verification' where id = auth.uid();
--
--      -- (c) transition normale : doit réussir
--      update profiles set creator_status = 'creator' where id = auth.uid();
--      update profiles set creator_status = 'pending_verification' where id = auth.uid();

-- -------------------------------------------------------------
-- 7. Droits sur creator_status pour les transitions autorisées
-- -------------------------------------------------------------
-- member -> creator et creator -> pending_verification restent
-- possibles via un simple update de la ligne par son propriétaire
-- (policy update existante auth.uid() = id, déjà en place dans
-- schema.sql). Le trigger ci-dessus est la seule protection
-- nécessaire pour le workflow et pour verified_creator/verified_at ;
-- aucune restriction de GRANT supplémentaire n'est nécessaire.

-- =============================================================
-- Fin de la migration P2.
-- =============================================================

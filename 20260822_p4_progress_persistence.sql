-- =============================================================
-- 243Kulture — Migration Priorité 4
-- Correctifs de persistance : XP, streak, badges
-- Date : 2026-08-22 (bêta)
-- Idempotente. N'annule ni ne modifie les migrations précédentes :
-- elle complète 20260822_p1_security.sql, dont le durcissement
-- (revoke update xp/streak_days + trigger anti-triche) avait été
-- appliqué sans jamais créer la fonction RPC de remplacement
-- permettant un gain légitime — ce qui rendait tout gain d'XP et
-- de streak impossible à enregistrer une fois Supabase configuré.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Mise à jour du trigger anti-triche : ajout d'un verrou de
--    session, sur le même principe que celui déjà utilisé par
--    admin_approve_creator() dans 20260822_p2_creator_accounts.sql.
--    Le client ne peut toujours pas modifier xp/streak_days
--    directement ; seules les fonctions ci-dessous (increment_xp,
--    bump_daily_streak) peuvent activer ce verrou, et seulement le
--    temps de leur propre écriture.
-- -------------------------------------------------------------
create or replace function prevent_client_xp_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.server_progress_update', true), 'off') = 'on' then
    return new;
  end if;

  if new.xp is distinct from old.xp then
    raise exception 'Modification de profiles.xp interdite depuis le client';
  end if;

  if new.streak_days is distinct from old.streak_days then
    raise exception 'Modification de profiles.streak_days interdite depuis le client';
  end if;

  return new;
end;
$$;

-- Le trigger existant pointe déjà vers cette fonction (aucun besoin
-- de le recréer) : "create or replace function" suffit à appliquer
-- le nouveau comportement au trigger déjà en place.

-- -------------------------------------------------------------
-- 2. RPC increment_xp : seul chemin légitime pour augmenter l'XP.
--    Montants limités à la liste exacte utilisée dans l'app
--    (5 = suivre un artiste / ajouter un ami / voter / publier,
--     10 = bonne réponse au quiz, 15 = publier une Story,
--     20 = terminer le quiz) — pour empêcher qu'un appel direct à
--    la fonction avec un montant arbitraire ne permette de tricher.
-- -------------------------------------------------------------
create or replace function public.increment_xp(p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_xp integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_amount is null or p_amount not in (5, 10, 15, 20) then
    raise exception 'Invalid XP amount';
  end if;

  perform set_config('app.server_progress_update', 'on', true);
  update profiles
  set xp = coalesce(xp, 0) + p_amount
  where id = auth.uid()
  returning xp into v_new_xp;
  perform set_config('app.server_progress_update', 'off', true);

  return v_new_xp;
exception
  when others then
    perform set_config('app.server_progress_update', 'off', true);
    raise;
end;
$$;

revoke all on function public.increment_xp(integer) from public;
revoke all on function public.increment_xp(integer) from anon;
grant execute on function public.increment_xp(integer) to authenticated;

-- -------------------------------------------------------------
-- 3. RPC bump_daily_streak : calcule et écrit le streak quotidien.
--    Logique standard : +1 si la dernière activité était hier,
--    remise à 1 s'il y a eu un trou (ou premier passage), inchangé
--    si déjà compté aujourd'hui.
-- -------------------------------------------------------------
create or replace function public.bump_daily_streak()
returns table(streak_days integer, last_active_date date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last date;
  v_streak integer;
  v_today date := current_date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select p.last_active_date, p.streak_days into v_last, v_streak
  from profiles p
  where p.id = auth.uid();

  if v_last is null or v_last < v_today - 1 then
    v_streak := 1;
  elsif v_last = v_today - 1 then
    v_streak := coalesce(v_streak, 0) + 1;
  else
    -- v_last = v_today : déjà compté aujourd'hui, aucun changement
    -- (sauf s'il n'y avait encore aucune valeur, auquel cas 1)
    v_streak := coalesce(v_streak, 1);
    if v_streak = 0 then
      v_streak := 1;
    end if;
  end if;

  perform set_config('app.server_progress_update', 'on', true);
  update profiles
  set streak_days = v_streak, last_active_date = v_today
  where id = auth.uid();
  perform set_config('app.server_progress_update', 'off', true);

  return query select v_streak, v_today;
exception
  when others then
    perform set_config('app.server_progress_update', 'off', true);
    raise;
end;
$$;

revoke all on function public.bump_daily_streak() from public;
revoke all on function public.bump_daily_streak() from anon;
grant execute on function public.bump_daily_streak() to authenticated;

-- -------------------------------------------------------------
-- 4. Badges : restauration de la policy d'insertion.
--    20260822_p1_security.sql avait supprimé la policy "for all"
--    d'origine pour ne laisser que la lecture, sans jamais recréer
--    d'insertion : plus aucun badge ne pouvait être enregistré.
--    On restaure uniquement l'insertion de ses propres badges —
--    comportement identique à celui d'avant le durcissement.
-- -------------------------------------------------------------
drop policy if exists "Insertion de ses propres badges" on badges;
create policy "Insertion de ses propres badges"
on badges for insert
with check (auth.uid() = user_id);

-- =============================================================
-- Fin de la migration P4.
-- =============================================================

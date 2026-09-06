-- 243Kulture — Priorité 1 : protections XP, streak, quiz et badges.
-- À exécuter après supabase/schema.sql.

create or replace function prevent_client_xp_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.xp is distinct from old.xp then
    raise exception 'Modification de profiles.xp interdite depuis le client';
  end if;

  if new.streak_days is distinct from old.streak_days then
    raise exception 'Modification de profiles.streak_days interdite depuis le client';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_client_xp_edit on profiles;
create trigger trg_prevent_client_xp_edit
before update on profiles
for each row
execute function prevent_client_xp_edit();

revoke update (xp, streak_days) on profiles from authenticated;

drop policy if exists "Chacun gère ses propres résultats de quiz" on quiz_results;
create policy "Lecture de ses propres résultats de quiz"
on quiz_results for select
using (auth.uid() = user_id);
create policy "Insertion de ses propres résultats de quiz"
on quiz_results for insert
with check (auth.uid() = user_id);

drop policy if exists "Chacun gère ses propres badges" on badges;
create policy "Lecture de ses propres badges"
on badges for select
using (auth.uid() = user_id);

-- =============================================================
-- P4c — Revoke anon EXECUTE on send_story_reply (idempotent)
-- Safe to re-run. Does not drop data or tables.
-- =============================================================
-- Context: information_schema showed grantee=anon on
-- public.send_story_reply(uuid, text). Function is security
-- definer and must be authenticated-only.
-- =============================================================

revoke all on function public.send_story_reply(uuid, text) from public;
revoke all on function public.send_story_reply(uuid, text) from anon;
grant execute on function public.send_story_reply(uuid, text) to authenticated;

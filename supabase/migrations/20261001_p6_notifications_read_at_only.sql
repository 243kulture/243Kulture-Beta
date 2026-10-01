-- =============================================================
-- P6 — Restrict authenticated notifications UPDATE to read_at
-- Idempotent. Safe to re-run. Does not drop data or tables.
-- =============================================================
-- Choice: COLUMN PRIVILEGES (not a BEFORE UPDATE trigger).
--
-- Rationale:
--   1. The live client mark-read path (App.jsx) uses PostgREST
--      `UPDATE notifications SET read_at=...` — column grant
--      UPDATE (read_at) keeps that path working.
--   2. RPC mark_notification_read is SECURITY DEFINER and updates
--      as the function owner, so it keeps working without needing
--      authenticated UPDATE on type/text.
--   3. PostgREST + RLS: ownership UPDATE policy remains; privilege
--      layer rejects PATCH of type/text for role authenticated.
--
-- A trigger would also work, but column privileges match the
-- existing PostgREST read_at update and avoid false failures on
-- privileged server-side updates that only touch read_at.
-- =============================================================

revoke update on table public.notifications from authenticated;
revoke update on table public.notifications from anon;

grant update (read_at) on table public.notifications to authenticated;

-- Reaffirm read access for clients (idempotent).
grant select on table public.notifications to authenticated;

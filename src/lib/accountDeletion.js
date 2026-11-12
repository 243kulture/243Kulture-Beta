/**
 * Account deletion helpers — store-safe confirm + Supabase paths.
 * Aligns with legal draft: Settings → Account → Delete my account
 * (or contact@243kulture.app).
 */

export const ACCOUNT_DELETE_CONTACT = "contact@243kulture.app";
export const ACCOUNT_DELETE_CONFIRM_TOKEN = "DELETE";

/** UI confirm phrase the user must type (case-sensitive). */
export function isDeleteConfirmValid(value) {
  return String(value ?? "").trim() === ACCOUNT_DELETE_CONFIRM_TOKEN;
}

/**
 * End-to-end delete: Edge Function (hard delete Auth user) with RPC queue fallback.
 * Never invents secrets; uses the caller's session JWT via supabase-js.
 *
 * @param {{ supabase: import("@supabase/supabase-js").SupabaseClient, confirm: string }} args
 */
export async function deleteAccountEndToEnd({ supabase, confirm }) {
  if (!supabase) {
    return { ok: false, code: "backend_required", message: "Supabase not configured" };
  }
  if (!isDeleteConfirmValid(confirm)) {
    return { ok: false, code: "confirm_required", message: "Type DELETE to confirm" };
  }

  // Primary: Edge Function (service_role deleteUser)
  const { data, error } = await supabase.functions.invoke("delete-account", {
    body: { confirm: ACCOUNT_DELETE_CONFIRM_TOKEN },
  });

  if (!error && data?.ok) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* session may already be invalid after delete */
    }
    return { ok: true, mode: "hard_delete", data };
  }

  const errMsg = error?.message || data?.error || "";
  const edgeMissing =
    /Failed to send|FunctionsFetchError|not found|404|Function not found/i.test(errMsg) ||
    data?.code === "delete_failed";

  // Fallback: queue request so ops / later Edge deploy can complete deletion.
  // Still signs the user out locally; does NOT claim hard delete succeeded.
  const { data: queued, error: rpcErr } = await supabase.rpc("request_account_deletion", {
    p_note: edgeMissing
      ? `queued: edge unavailable (${errMsg || "unknown"})`
      : `queued after edge error (${errMsg || "unknown"})`,
  });

  if (rpcErr) {
    return {
      ok: false,
      code: "delete_failed",
      message: rpcErr.message || errMsg || "Account deletion failed",
      edgeError: errMsg || null,
    };
  }

  try {
    await supabase.auth.signOut();
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    mode: "queued",
    data: queued,
    edgeError: errMsg || null,
    contact: ACCOUNT_DELETE_CONTACT,
  };
}

/**
 * Report / moderation client helpers.
 * Reports enter a queue (pending). No silent auto-ban.
 */

export const REPORT_TARGET_TYPES = ["user", "post", "story", "comment", "message", "other"];

export const REPORT_REASONS = [
  "illegal",
  "harassment",
  "hate",
  "scam",
  "impersonation",
  "privacy",
  "ip",
  "spam",
  "other",
];

export function isValidReportTargetType(type) {
  return REPORT_TARGET_TYPES.includes(type);
}

export function isValidReportReason(reason) {
  return REPORT_REASONS.includes(reason);
}

/**
 * @param {{
 *   targetType: string,
 *   targetId?: string|null,
 *   targetUserId?: string|null,
 *   reason: string,
 *   details?: string|null,
 *   reporterId?: string|null,
 * }} input
 */
export function validateReportInput(input) {
  const targetType = input?.targetType;
  const reason = input?.reason;
  if (!isValidReportTargetType(targetType)) {
    return { ok: false, code: "invalid_target_type" };
  }
  if (!isValidReportReason(reason)) {
    return { ok: false, code: "invalid_reason" };
  }
  if (targetType === "user" && !input?.targetUserId) {
    return { ok: false, code: "target_user_required" };
  }
  if (input?.targetUserId && input?.reporterId && input.targetUserId === input.reporterId) {
    return { ok: false, code: "cannot_report_self" };
  }
  return { ok: true };
}

/**
 * Submit a moderation report via SECURITY DEFINER RPC.
 * Expects `{ report_id, status: "pending", auto_action: "none" }`.
 */
export async function submitModerationReport({
  supabase,
  reporterId,
  targetType,
  targetId = null,
  targetUserId = null,
  reason,
  details = null,
}) {
  if (!supabase) {
    return { ok: false, code: "backend_required", message: "Supabase not configured" };
  }

  const check = validateReportInput({
    targetType,
    targetId,
    targetUserId,
    reason,
    details,
    reporterId,
  });
  if (!check.ok) {
    return { ok: false, code: check.code, message: check.code };
  }

  const { data, error } = await supabase.rpc("submit_moderation_report", {
    p_target_type: targetType,
    p_target_id: targetId || null,
    p_target_user_id: targetUserId || null,
    p_reason: reason,
    p_details: details || null,
  });

  if (error) {
    return { ok: false, code: "rpc_error", message: error.message };
  }

  // Defense: never treat a report as an automatic sanction.
  if (data?.auto_action && data.auto_action !== "none") {
    return {
      ok: false,
      code: "unexpected_auto_action",
      message: "Server returned an unexpected auto action",
      data,
    };
  }

  return {
    ok: true,
    reportId: data?.report_id ?? null,
    status: data?.status ?? "pending",
    autoAction: "none",
    data,
  };
}

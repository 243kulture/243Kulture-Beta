/**
 * Soft engagement helpers — daily hint rotation, dismiss (no dark patterns).
 */

export const DAILY_ACTION_DISMISS_KEY = "243kulture_daily_action_dismissed";
/** Creation-leaning soft rotation (story first energy). */
export const DAILY_ACTION_KINDS = ["story", "post", "quiz"];

/** Calendar day key YYYY-MM-DD in local time. */
export function localDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Stable soft rotation: story → post → quiz, by local calendar day. */
export function getDailyActionKind(date = new Date()) {
  const utcDay = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return DAILY_ACTION_KINDS[((utcDay % 3) + 3) % 3];
}

export function isDailyActionDismissed(date = new Date(), storage = typeof localStorage !== "undefined" ? localStorage : null) {
  if (!storage) return false;
  try {
    return storage.getItem(DAILY_ACTION_DISMISS_KEY) === localDayKey(date);
  } catch {
    return false;
  }
}

export function dismissDailyAction(date = new Date(), storage = typeof localStorage !== "undefined" ? localStorage : null) {
  if (!storage) return false;
  try {
    storage.setItem(DAILY_ACTION_DISMISS_KEY, localDayKey(date));
    return true;
  } catch {
    return false;
  }
}

/**
 * Contacts match + invite scaffold — consent-first, flag-gated.
 * No silent background sync. No raw contact upload in this scaffold.
 * Web: Contacts API unavailable → search / share invite only.
 *
 * @see PERMISSIONS_AND_CONTACTS.md
 */

export const CONTACTS_CONSENT = {
  why:
    "243Kulture peut comparer de façon sécurisée les numéros/emails de ton carnet pour voir qui est déjà membre, les suivre ou les inviter. On n’envoie pas ton carnet à d’autres utilisateurs.",
  noSilent:
    "Rien n’est synchronisé en arrière-plan sans ton accord explicite.",
  settingsHint:
    "Tu peux modifier cette autorisation dans Réglages → Applications → 243Kulture → Contacts.",
  deniedKeepsAppUsable:
    "Sans accès contacts, cherche par pseudo ou partage un lien d’invitation — l’app reste utilisable.",
};

const LS_DENIED_AT = "kulture243_contacts_denied_at_v1";

export function isContactsMatchEnabled(env = import.meta.env) {
  const raw = env?.VITE_CONTACTS_MATCH_ENABLED;
  return raw === true || raw === "true" || raw === "1";
}

export const INVITE_CAPS = {
  friendInvitesPerDay: 20,
  matchBatchesPerHour: 6,
  maxHashesPerBatch: 500,
  denySoftCtaCooldownMs: 7 * 24 * 60 * 60 * 1000,
};

/**
 * OS contacts permission — ONLY when userInitiated === true.
 * Never from cold start / resume / visibilitychange.
 */
export async function ensureContactsPermission({ userInitiated = false } = {}) {
  if (!userInitiated) {
    return {
      ok: false,
      status: "blocked_no_intent",
      message: "Contacts permission only on user intent.",
    };
  }

  if (!isContactsMatchEnabled()) {
    return {
      ok: false,
      status: "flag_off",
      via: "flag-off",
      message: `${CONTACTS_CONSENT.why} ${CONTACTS_CONSENT.deniedKeepsAppUsable}`,
    };
  }

  // Native plugin wiring lands with Capacitor shells — scaffold returns unavailable
  // so Web never breaks and no silent read occurs.
  const native = await tryNativeContactsPermission();
  if (native) return native;

  return {
    ok: false,
    status: "unavailable",
    via: "web",
    message: `${CONTACTS_CONSENT.deniedKeepsAppUsable} (Web : pas d’accès carnet — utilise la recherche ou le lien d’invite.)`,
  };
}

async function tryNativeContactsPermission() {
  try {
    const coreId = "@capacitor/core";
    const { Capacitor } = await import(/* @vite-ignore */ coreId);
    if (!Capacitor?.isNativePlatform?.()) return null;
    // Plugin optional — when absent, treat as unavailable (app usable)
    try {
      const contactsId = "@capacitor-community/contacts";
      const contactsMod = await import(/* @vite-ignore */ contactsId).catch(() => null);
      if (!contactsMod?.Contacts) {
        return {
          ok: false,
          status: "unavailable",
          via: "capacitor-no-plugin",
          message: CONTACTS_CONSENT.deniedKeepsAppUsable,
        };
      }
      const { Contacts } = contactsMod;
      const current = await Contacts.checkPermissions();
      if (current.contacts === "granted") {
        return { ok: true, status: "granted", via: "capacitor" };
      }
      if (current.contacts === "denied") {
        markContactsDenied();
        return {
          ok: false,
          status: "denied",
          via: "capacitor",
          message: `${CONTACTS_CONSENT.why} ${CONTACTS_CONSENT.settingsHint}`,
        };
      }
      const req = await Contacts.requestPermissions();
      if (req.contacts === "granted") {
        return { ok: true, status: "granted", via: "capacitor" };
      }
      markContactsDenied();
      return {
        ok: false,
        status: req.contacts || "denied",
        via: "capacitor",
        message: `${CONTACTS_CONSENT.why} ${CONTACTS_CONSENT.settingsHint}`,
      };
    } catch {
      return {
        ok: false,
        status: "unavailable",
        via: "capacitor-error",
        message: CONTACTS_CONSENT.deniedKeepsAppUsable,
      };
    }
  } catch {
    return null;
  }
}

export function markContactsDenied(storage = defaultStorage(), nowMs = Date.now()) {
  try {
    storage?.setItem?.(LS_DENIED_AT, String(nowMs));
  } catch {
    /* ignore */
  }
}

export function canShowContactsSoftCta(storage = defaultStorage(), nowMs = Date.now()) {
  try {
    const raw = storage?.getItem?.(LS_DENIED_AT);
    if (!raw) return true;
    const at = Number(raw);
    if (!Number.isFinite(at)) return true;
    return nowMs - at >= INVITE_CAPS.denySoftCtaCooldownMs;
  } catch {
    return true;
  }
}

/** Pure anti-spam for friend invites (client pre-check; server remains source of truth). */
export function canSendFriendInvite({ sentTodayCount = 0, caps = INVITE_CAPS } = {}) {
  if (sentTodayCount >= caps.friendInvitesPerDay) {
    return { ok: false, reason: "daily_cap" };
  }
  return { ok: true };
}

export function canRunMatchBatch({ batchesThisHour = 0, hashCount = 0, caps = INVITE_CAPS } = {}) {
  if (batchesThisHour >= caps.matchBatchesPerHour) {
    return { ok: false, reason: "batch_hour_cap" };
  }
  if (hashCount > caps.maxHashesPerBatch) {
    return { ok: false, reason: "batch_size" };
  }
  if (hashCount <= 0) {
    return { ok: false, reason: "empty" };
  }
  return { ok: true };
}

/** Normalize for future hashing — does not upload. */
export function normalizePhoneE164ish(raw, defaultCountry = "CD") {
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("+")) return digits;
  if (defaultCountry === "CD" && digits.startsWith("0")) {
    return `+243${digits.slice(1)}`;
  }
  return digits;
}

export function normalizeEmail(raw) {
  if (!raw || typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v.includes("@") || v.length < 5) return null;
  return v;
}

function defaultStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

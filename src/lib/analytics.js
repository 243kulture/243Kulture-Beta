/**
 * Light analytics hook — consent-aware, pluggable, OFF by default.
 * Mirrors push/contacts: flag + localStorage consent + no-op when off.
 * No third-party SDK until privacy / tool choice is approved.
 */

export const ANALYTICS_CONSENT = {
  why:
    "243Kulture peut compter des événements anonymes (écrans ouverts, partages) pour améliorer l’app. Aucun tracker tiers n’est actif tant que tu n’as pas consenti et que le flag reste off.",
  settingsHint:
    "Tu peux retirer ton consentement à tout moment dans Profil → Confidentialité / analytics.",
  deniedKeepsAppUsable:
    "Sans analytics, l’app fonctionne normalement. Rien n’est envoyé.",
};

const LS_CONSENT = "kulture243_analytics_consent_v1";

/** Feature flag — keep false until privacy OK + sink chosen. */
export function isAnalyticsFeatureEnabled(env = import.meta.env) {
  const raw = env?.VITE_ANALYTICS_ENABLED;
  return raw === true || raw === "true" || raw === "1";
}

export function defaultAnalyticsConsent() {
  return {
    /** User explicitly opted in. Default false. */
    granted: false,
    updatedAtMs: null,
  };
}

export function readAnalyticsConsent(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(LS_CONSENT);
    if (!raw) return defaultAnalyticsConsent();
    const parsed = JSON.parse(raw);
    return { ...defaultAnalyticsConsent(), ...parsed };
  } catch {
    return defaultAnalyticsConsent();
  }
}

export function writeAnalyticsConsent(consent, storage = defaultStorage()) {
  const next = {
    ...defaultAnalyticsConsent(),
    ...consent,
    updatedAtMs: typeof consent?.updatedAtMs === "number" ? consent.updatedAtMs : Date.now(),
  };
  try {
    storage?.setItem?.(LS_CONSENT, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

export function grantAnalyticsConsent(storage = defaultStorage(), nowMs = Date.now()) {
  return writeAnalyticsConsent({ granted: true, updatedAtMs: nowMs }, storage);
}

export function revokeAnalyticsConsent(storage = defaultStorage(), nowMs = Date.now()) {
  return writeAnalyticsConsent({ granted: false, updatedAtMs: nowMs }, storage);
}

/** Whether track() may emit (flag ON + consent granted). */
export function canTrack(env = import.meta.env, storage = defaultStorage()) {
  return isAnalyticsFeatureEnabled(env) && Boolean(readAnalyticsConsent(storage).granted);
}

/** Pluggable sink — tests / future PostHog/etc. replace this. */
let sink = null;

export function setAnalyticsSink(fn) {
  sink = typeof fn === "function" ? fn : null;
  return sink;
}

export function getAnalyticsSink() {
  return sink;
}

/**
 * Emit an analytics event. Always safe: no-op when flag off or no consent.
 * Never throws to callers.
 */
export function track(event, props = {}, opts = {}) {
  try {
    const name = typeof event === "string" ? event.trim() : "";
    if (!name) return { ok: false, reason: "bad_event" };

    const env = opts.env ?? import.meta.env;
    const storage = opts.storage ?? defaultStorage();
    if (!isAnalyticsFeatureEnabled(env)) return { ok: false, reason: "flag_off" };
    if (!readAnalyticsConsent(storage).granted) return { ok: false, reason: "no_consent" };

    const payload = {
      event: name,
      props: props && typeof props === "object" ? props : {},
      ts: opts.nowMs ?? Date.now(),
    };

    if (sink) {
      sink(payload);
      return { ok: true, via: "sink" };
    }
    // Default: quiet console in DEV only (never in prod builds without sink)
    if (env?.DEV || env?.MODE === "development") {
      // eslint-disable-next-line no-console
      console.debug("[analytics]", payload.event, payload.props);
      return { ok: true, via: "dev_console" };
    }
    return { ok: false, reason: "no_sink" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

function defaultStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

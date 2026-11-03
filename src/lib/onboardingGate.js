/**
 * Pure onboarding / route-gate helpers (testable without React).
 *
 * Flow: language → terms (CGU) → auth → (profile onboarding) → app
 */

export const PUBLIC_SCREENS = new Set([
  "languagePicker",
  "termsGate",
  "onboarding", // auth landing (signup/login buttons)
  "auth",
  "legal",
]);

export const APP_SCREENS = new Set([
  "home", "podcasts", "player", "articles", "article", "social", "search",
  "favoris", "profil", "timeline", "collections", "collectionDetail",
  "artistsList", "artistDetail", "events", "create", "today", "debats",
  "quiz", "amis", "conversation", "storyView", "storyCreate", "userProfile",
  "notifications", "onboardingChoice", "onboardingSetup", "creatorIntro",
  "creatorProfileForm", "creatorStudio",
]);

/**
 * Decide which gate screen the user must see.
 * @returns {'languagePicker'|'termsGate'|'onboarding'|'ok'}
 */
export function resolveEntryGate({
  hasLanguage,
  hasSession,
  hasCurrentCgu,
  termsCheckboxAccepted,
}) {
  if (!hasLanguage) return "languagePicker";
  if (!hasSession) {
    // Pre-auth: must pass terms screen before auth actions
    if (!termsCheckboxAccepted && !hasCurrentCgu) return "termsGate";
    return "onboarding";
  }
  if (!hasCurrentCgu) return "termsGate";
  return "ok";
}

/** Whether a screen is allowed given gate state. */
export function isScreenAllowed(screen, gate) {
  if (gate === "ok") return true;
  if (gate === "languagePicker") return screen === "languagePicker" || screen === "legal";
  if (gate === "termsGate") return screen === "termsGate" || screen === "legal" || screen === "languagePicker";
  if (gate === "onboarding") return PUBLIC_SCREENS.has(screen);
  return PUBLIC_SCREENS.has(screen);
}

/** Redirect target when current screen violates the gate. */
export function redirectForGate(gate, currentScreen) {
  if (isScreenAllowed(currentScreen, gate)) return null;
  return gate === "ok" ? null : gate;
}

export function hasAcceptedRequiredVersion(acceptances, requiredVersion, docType = "cgu") {
  if (!requiredVersion) return false;
  const list = acceptances || [];
  return list.some((a) => a.document_type === docType && a.version === requiredVersion);
}

export function canSubmitAuth({ hasLanguage, termsAccepted }) {
  return Boolean(hasLanguage && termsAccepted);
}

export function sortLangMetaByNativeName(meta) {
  return [...meta].sort((a, b) => a.nativeName.localeCompare(b.nativeName, "en"));
}

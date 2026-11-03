import assert from "node:assert/strict";
import {
  canSubmitAuth,
  hasAcceptedRequiredVersion,
  isScreenAllowed,
  redirectForGate,
  resolveEntryGate,
  sortLangMetaByNativeName,
} from "../src/lib/onboardingGate.js";
import { LANG_META, REQUIRED_CGU_VERSION, SUPPORTED_LANGS, resolveLang } from "../src/i18n/index.js";

// 8 languages
assert.equal(SUPPORTED_LANGS.length, 8);
for (const code of ["fr", "en", "nl", "ln", "sw", "lua", "kg", "mongo"]) {
  assert.equal(resolveLang(code), code);
}
assert.equal(resolveLang("xx"), null);

// Alpha order by displayed native name
const sorted = sortLangMetaByNativeName(LANG_META);
assert.deepEqual(
  sorted.map((l) => l.nativeName),
  ["English", "Français", "Kikongo", "Lingála", "Mongo", "Nederlands", "Swahili", "Tshiluba"]
);

// New user: no language
assert.equal(resolveEntryGate({ hasLanguage: false, hasSession: false, hasCurrentCgu: false, termsCheckboxAccepted: false }), "languagePicker");

// Language chosen, no CGU checkbox yet
assert.equal(resolveEntryGate({ hasLanguage: true, hasSession: false, hasCurrentCgu: false, termsCheckboxAccepted: false }), "termsGate");

// Checkbox accepted → auth landing
assert.equal(resolveEntryGate({ hasLanguage: true, hasSession: false, hasCurrentCgu: false, termsCheckboxAccepted: true }), "onboarding");

// Cannot auth without language + terms
assert.equal(canSubmitAuth({ hasLanguage: false, termsAccepted: true }), false);
assert.equal(canSubmitAuth({ hasLanguage: true, termsAccepted: false }), false);
assert.equal(canSubmitAuth({ hasLanguage: true, termsAccepted: true }), true);

// Deep-link to feed without account → redirect
assert.equal(
  redirectForGate(
    resolveEntryGate({ hasLanguage: true, hasSession: false, hasCurrentCgu: false, termsCheckboxAccepted: true }),
    "amis"
  ),
  "onboarding"
);
assert.equal(
  redirectForGate(
    resolveEntryGate({ hasLanguage: false, hasSession: false, hasCurrentCgu: false, termsCheckboxAccepted: false }),
    "home"
  ),
  "languagePicker"
);
assert.equal(isScreenAllowed("amis", "onboarding"), false);
assert.equal(isScreenAllowed("storyView", "languagePicker"), false);
assert.equal(isScreenAllowed("userProfile", "termsGate"), false);

// Session without current CGU → terms
assert.equal(resolveEntryGate({ hasLanguage: true, hasSession: true, hasCurrentCgu: false, termsCheckboxAccepted: false }), "termsGate");

// Existing user OK
assert.equal(resolveEntryGate({ hasLanguage: true, hasSession: true, hasCurrentCgu: true, termsCheckboxAccepted: true }), "ok");
assert.equal(redirectForGate("ok", "home"), null);

// Version acceptance helper
assert.equal(
  hasAcceptedRequiredVersion([{ document_type: "cgu", version: REQUIRED_CGU_VERSION }], REQUIRED_CGU_VERSION),
  true
);
assert.equal(
  hasAcceptedRequiredVersion([{ document_type: "cgu", version: "v0.9" }], REQUIRED_CGU_VERSION),
  false
);
// New required version → re-prompt
assert.equal(
  hasAcceptedRequiredVersion([{ document_type: "cgu", version: "v1.0" }], "v2.0"),
  false
);

console.log("onboarding-gate.test.mjs: PASS");

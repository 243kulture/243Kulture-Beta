import assert from "node:assert/strict";
import {
  ACCOUNT_DELETE_CONFIRM_TOKEN,
  ACCOUNT_DELETE_CONTACT,
  isDeleteConfirmValid,
} from "../src/lib/accountDeletion.js";
import {
  REPORT_REASONS,
  isValidReportReason,
  isValidReportTargetType,
  validateReportInput,
} from "../src/lib/moderation.js";
import {
  buildGoogleOAuthSetup,
  isGoogleProviderDisabledError,
  supabaseAuthCallbackUrl,
} from "../src/lib/googleOAuth.js";

assert.equal(ACCOUNT_DELETE_CONFIRM_TOKEN, "DELETE");
assert.equal(isDeleteConfirmValid("DELETE"), true);
assert.equal(isDeleteConfirmValid("delete"), false);
assert.equal(isDeleteConfirmValid(" DELETE "), true);
assert.ok(ACCOUNT_DELETE_CONTACT.includes("@243kulture.app"));

assert.equal(isValidReportTargetType("user"), true);
assert.equal(isValidReportTargetType("ban"), false);
assert.equal(isValidReportReason("harassment"), true);
assert.equal(isValidReportReason("auto_ban"), false);
assert.ok(REPORT_REASONS.includes("spam"));

assert.equal(validateReportInput({ targetType: "user", reason: "spam" }).ok, false);
assert.equal(
  validateReportInput({
    targetType: "user",
    targetUserId: "u2",
    reason: "spam",
    reporterId: "u2",
  }).code,
  "cannot_report_self",
);
assert.equal(
  validateReportInput({
    targetType: "post",
    targetId: "p1",
    reason: "hate",
    reporterId: "u1",
  }).ok,
  true,
);

const cb = supabaseAuthCallbackUrl("https://kvmzriikfefgbhqsihwj.supabase.co");
assert.equal(cb, "https://kvmzriikfefgbhqsihwj.supabase.co/auth/v1/callback");

const setup = buildGoogleOAuthSetup({
  appOrigin: "http://localhost:5173",
  supabaseUrl: "https://kvmzriikfefgbhqsihwj.supabase.co",
  productionOrigin: "https://example.com",
});
assert.deepEqual(setup.googleCloud.authorizedRedirectUris, [cb]);
assert.ok(setup.supabaseAuth.redirectUrls.includes("http://localhost:5173/**"));
assert.equal(setup.supabaseAuth.provider.enabled, false);
assert.match(setup.supabaseAuth.provider.clientId, /user secret/i);
assert.equal(isGoogleProviderDisabledError("Unsupported provider: provider is not enabled"), true);
assert.equal(isGoogleProviderDisabledError("network error"), false);

console.log("p1-compliance.test.mjs OK");

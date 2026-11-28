import { afterEach, describe, expect, it } from "vitest";
import { getAllowlist, hashInviteToken, isInviteAllowed } from "../invite-hash";

afterEach(() => {
  delete process.env.INVITE_HASH_ALLOWLIST;
});

describe("invite-hash", () => {
  it("hashes trimmed code as sha256 hex", () => {
    expect(hashInviteToken("JV-DEMO-GATE")).toBe(
      "21b046bf83e0d7bc218faa9f3b6a3521a0fe090b4dab7bc84e87479d383f5352",
    );
  });

  it("empty allowlist refuses", () => {
    process.env.INVITE_HASH_ALLOWLIST = "";
    expect(getAllowlist().size).toBe(0);
    expect(isInviteAllowed("JV-DEMO-GATE")).toBe(false);
  });

  it("unset allowlist refuses", () => {
    delete process.env.INVITE_HASH_ALLOWLIST;
    expect(isInviteAllowed("JV-DEMO-GATE")).toBe(false);
  });

  it("strict allowlist accepts listed hash only", () => {
    const h = hashInviteToken("BETA1TEST");
    process.env.INVITE_HASH_ALLOWLIST = h;
    expect(isInviteAllowed("BETA1TEST")).toBe(true);
    expect(isInviteAllowed("JV-DEMO-GATE")).toBe(false);
  });
});

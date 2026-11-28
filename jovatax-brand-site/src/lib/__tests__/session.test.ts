import { afterEach, describe, expect, it } from "vitest";
import {
  SessionConfigError,
  assertSessionConfigured,
  createSessionToken,
  decodeSession,
  encodeSession,
} from "../session";

afterEach(() => {
  delete process.env.DOWNLOAD_SESSION_SECRET;
});

describe("session", () => {
  it("throws when secret missing", () => {
    delete process.env.DOWNLOAD_SESSION_SECRET;
    expect(() => assertSessionConfigured()).toThrow(SessionConfigError);
    expect(() => createSessionToken("Léa")).toThrow(SessionConfigError);
  });

  it("throws when secret too short", () => {
    process.env.DOWNLOAD_SESSION_SECRET = "short";
    expect(() => assertSessionConfigured()).toThrow(SessionConfigError);
  });

  it("round-trips a valid session", () => {
    process.env.DOWNLOAD_SESSION_SECRET = "x".repeat(32);
    const token = createSessionToken("Léa");
    const parsed = decodeSession(token);
    expect(parsed?.name).toBe("Léa");
  });

  it("rejects forged payload", () => {
    process.env.DOWNLOAD_SESSION_SECRET = "x".repeat(32);
    expect(decodeSession("forged.payload")).toBeNull();
  });

  it("rejects wrong secret", () => {
    process.env.DOWNLOAD_SESSION_SECRET = "a".repeat(32);
    const token = encodeSession({ name: "Léa", exp: Date.now() + 60_000 });
    process.env.DOWNLOAD_SESSION_SECRET = "b".repeat(32);
    expect(decodeSession(token)).toBeNull();
  });

  it("decode returns null if secret unset (no bypass)", () => {
    delete process.env.DOWNLOAD_SESSION_SECRET;
    expect(decodeSession("anything.here")).toBeNull();
  });
});

import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "jt_dl_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export class SessionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionConfigError";
  }
}

function getSecret(): string {
  const secret = process.env.DOWNLOAD_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new SessionConfigError(
      "DOWNLOAD_SESSION_SECRET must be set and at least 32 characters",
    );
  }
  return secret;
}

/** Throw if HMAC secret absent/short — callers map to 503. */
export function assertSessionConfigured(): void {
  getSecret();
}

export type SessionPayload = {
  name: string;
  exp: number;
};

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function encodeSession(payload: SessionPayload): string {
  const secret = getSecret();
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${body}.${sign(body, secret)}`;
}

export function decodeSession(token: string | undefined | null): SessionPayload | null {
  if (!token || !token.includes(".")) return null;
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body, secret);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (!parsed?.name || typeof parsed.exp !== "number") return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createSessionToken(name: string): string {
  return encodeSession({
    name: name.trim().slice(0, 48),
    exp: Date.now() + SESSION_TTL_MS,
  });
}

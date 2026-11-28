import { createHash } from "crypto";

/** Aligné tip app: SHA-256 hex du code trimé. */
export function hashInviteToken(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

/**
 * Allowlist stricte depuis INVITE_HASH_ALLOWLIST (CSV de hashes hex).
 * Vide / unset = refus (aucun hash démo implicite).
 */
export function getAllowlist(): Set<string> {
  const raw = process.env.INVITE_HASH_ALLOWLIST?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isInviteAllowed(code: string): boolean {
  const allow = getAllowlist();
  if (allow.size === 0) return false;
  return allow.has(hashInviteToken(code).toLowerCase());
}

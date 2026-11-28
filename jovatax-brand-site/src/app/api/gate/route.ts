import { NextResponse } from "next/server";
import { isInviteAllowed } from "@/lib/invite-hash";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  SessionConfigError,
  createSessionToken,
} from "@/lib/session";

export async function POST(request: Request) {
  let body: { code?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (code.length < 8 || name.length < 2 || name.length > 48) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    if (!isInviteAllowed(code)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const token = createSessionToken(name);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return res;
  } catch (e) {
    if (e instanceof SessionConfigError) {
      return NextResponse.json({ error: "misconfigured" }, { status: 503 });
    }
    throw e;
  }
}

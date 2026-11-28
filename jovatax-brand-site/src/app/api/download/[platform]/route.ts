import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getAndroidApkPath } from "@/lib/apk-path";
import {
  SESSION_COOKIE,
  SessionConfigError,
  assertSessionConfigured,
  decodeSession,
} from "@/lib/session";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  const { platform } = await context.params;

  try {
    assertSessionConfigured();
  } catch (e) {
    if (e instanceof SessionConfigError) {
      return NextResponse.json({ error: "misconfigured" }, { status: 503 });
    }
    throw e;
  }

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (platform !== "android") {
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }

  const apkPath = getAndroidApkPath();
  if (!fs.existsSync(apkPath)) {
    return NextResponse.json({ error: "missing_apk" }, { status: 503 });
  }

  const buf = fs.readFileSync(apkPath);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": 'attachment; filename="jovatax-beta.apk"',
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store",
    },
  });
}

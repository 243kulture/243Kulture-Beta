import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Refuse toute exposition statique /downloads ou *.apk. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/downloads") ||
    pathname.toLowerCase().endsWith(".apk")
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/downloads/:path*", "/:path*.apk"],
};

"use client";

import { SiteNav } from "./SiteNav";
import { SiteFooter } from "./SiteFooter";

export function SiteShell({
  children,
  hasSession = false,
}: {
  children: React.ReactNode;
  hasSession?: boolean;
}) {
  return (
    <div className="min-h-screen bg-jovatax text-[#E8F2EE]">
      <SiteNav hasSession={hasSession} />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

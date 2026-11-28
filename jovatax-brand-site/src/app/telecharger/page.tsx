import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HubPlatforms } from "@/components/HubPlatforms";
import { SiteShell } from "@/components/SiteShell";
import { SESSION_COOKIE, decodeSession } from "@/lib/session";

export default async function TelechargerPage() {
  const jar = await cookies();
  const session = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/#beta");
  }

  return (
    <SiteShell hasSession={true}>
      <HubPlatforms name={session.name} />
    </SiteShell>
  );
}

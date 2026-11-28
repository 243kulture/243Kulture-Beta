import { cookies } from "next/headers";
import { BrandSections } from "@/components/BrandSections";
import { SiteShell } from "@/components/SiteShell";
import { SESSION_COOKIE, decodeSession } from "@/lib/session";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ dev?: string }>;
}) {
  const sp = await searchParams;
  const jar = await cookies();
  const session = decodeSession(jar.get(SESSION_COOKIE)?.value);
  const histoireDev = sp.dev === "1";

  return (
    <SiteShell hasSession={Boolean(session)}>
      <BrandSections
        hasSession={Boolean(session)}
        histoireDev={histoireDev}
      />
    </SiteShell>
  );
}

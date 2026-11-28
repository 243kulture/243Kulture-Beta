"use client";

import Link from "next/link";
import { Button } from "./ui/button";

export function HubPlatforms({ name }: { name: string }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="font-display text-4xl text-[#E8F2EE] md:text-5xl">
        Salut {name}
      </h1>
      <p className="mt-4 text-[#A8C0B6]">
        Choisis ta plateforme. Android est prêt ; iOS et Windows suivent.
      </p>

      <div className="mt-10 space-y-4">
        <PlatformRow
          title="Android"
          detail="APK sideload — Samsung et autres Android."
          action={
            <Button
              type="button"
              onClick={() => {
                window.location.assign("/api/download/android");
              }}
            >
              Télécharger l&apos;APK
            </Button>
          }
        />
        <PlatformRow
          title="iPhone & iPad"
          detail="App Store — dès le compte Apple développeur."
          action={
            <Button variant="muted" disabled>
              Bientôt
            </Button>
          }
        />
        <PlatformRow
          title="Windows"
          detail="Desktop / web — placeholder jusqu’au build MSIX."
          action={
            <Button variant="muted" disabled>
              Bientôt
            </Button>
          }
        />
      </div>

      <div className="mt-10 flex flex-wrap gap-6 text-sm text-[#A8C0B6]">
        <Link href="/" className="hover:text-[#E8F2EE]">
          Retour au site
        </Link>
        <button
          type="button"
          className="hover:text-[#E8F2EE]"
          onClick={async () => {
            await fetch("/api/logout", { method: "POST" });
            window.location.assign("/#beta");
          }}
        >
          Changer de code
        </button>
      </div>
    </div>
  );
}

function PlatformRow({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#E8F2EE]/12 bg-[#0a1f1a]/40 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-display text-lg text-[#E8F2EE]">{title}</p>
        <p className="mt-1 text-sm text-[#A8C0B6]">{detail}</p>
      </div>
      <div>{action}</div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { clsx } from "clsx";

const links = [
  { href: "/#accueil", label: "Accueil" },
  { href: "/#histoire", label: "Histoire" },
  { href: "/#plateforme", label: "Plateforme" },
  { href: "/#pour-qui", label: "Pour qui" },
];

export function SiteNav({
  hasSession = false,
}: {
  hasSession?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#E8F2EE]/8 bg-[#0a1f1a]/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link
          href="/"
          className="font-display text-xl tracking-tight text-[#E8F2EE]"
        >
          Jovatax
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-[#A8C0B6] transition hover:text-[#E8F2EE]"
            >
              {l.label}
            </a>
          ))}
          {hasSession ? (
            <Link
              href="/telecharger"
              className={clsx(
                "rounded-full bg-[#F4B740] px-4 py-2 text-sm font-medium text-[#0a1f1a]",
              )}
            >
              Télécharger
            </Link>
          ) : (
            <Link
              href="/#beta"
              className="rounded-full bg-[#F4B740] px-4 py-2 text-sm font-medium text-[#0a1f1a]"
            >
              Bêta
            </Link>
          )}
        </nav>
        <Link
          href={hasSession ? "/telecharger" : "/#beta"}
          className="rounded-full bg-[#F4B740] px-4 py-2 text-sm font-medium text-[#0a1f1a] md:hidden"
        >
          {hasSession ? "Télécharger" : "Bêta"}
        </Link>
      </div>
    </header>
  );
}

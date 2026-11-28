import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-[#E8F2EE]/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-display text-lg text-[#E8F2EE]">Jovatax</p>
          <p className="mt-2 max-w-sm text-sm text-[#7F9B90]">
            Bêta privée — invitation requise pour télécharger
          </p>
        </div>
        <div className="flex flex-wrap gap-5 text-sm text-[#A8C0B6]">
          <Link href="/contact" className="hover:text-[#E8F2EE]">
            Contact
          </Link>
          <Link href="/confidentialite" className="hover:text-[#E8F2EE]">
            Confidentialité
          </Link>
          <Link href="/mentions" className="hover:text-[#E8F2EE]">
            Mentions / CGU
          </Link>
        </div>
      </div>
    </footer>
  );
}

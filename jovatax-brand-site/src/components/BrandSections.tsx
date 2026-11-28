import { GateForm } from "./GateForm";
import { Button } from "./ui/button";

function showDevStatus() {
  if (typeof process === "undefined") return false;
  return process.env.SHOW_DEV_STATUS === "true";
}

const platformOps = [
  {
    title: "Profils adaptés à ta situation",
    body: "Parcours multi-profils fiscaux en bêta — particular, salarié, indépendant, et mixes.",
  },
  {
    title: "Factures & devis",
    body: "Devis → facture / note de crédit / PDF — cycle opérationnel en bêta.",
  },
  {
    title: "Acceptation de devis signée",
    body: "Signature d’acceptation côté client, déjà en place.",
  },
  {
    title: "Import de documents",
    body: "Photo et import document — priorité Samsung / mobile.",
  },
  {
    title: "Espace cabinet",
    body: "Rôles, dossiers et contrôle pour cabinets comptables (bêta tip).",
  },
];

const platformLimited = [
  {
    title: "Assistant Jovatax",
    body: "Aide déterministe + LLM produit gated — pas une « IA magique ».",
  },
  {
    title: "Analyse budgétaire",
    body: "Pro+ selon plan. Ne remplace pas un conseiller fiscal.",
  },
  {
    title: "Relances & suivi devis",
    body: "CRM light / signatures gated plan.",
  },
];

const platformSoon = [
  {
    title: "Peppol — pas encore envoi live",
    body: "Émission BLOCKED sans Access Point vérifié.",
  },
  {
    title: "Banque — sync live bientôt",
    body: "Import / reco tip ; PSD2 live gated off.",
  },
  {
    title: "Paiements clients",
    body: "Stripe gated — pas de checkout live sans GO + clés.",
  },
  {
    title: "iPhone & Windows",
    body: "Clients natifs / Store — bientôt (compte Apple / Partner Center).",
  },
];

const audiences = [
  {
    title: "Particuliers & salariés",
    body: "Vue claire de ta situation et de tes obligations, sans jargon inutile.",
  },
  {
    title: "Indépendants & professions libérales",
    body: "Facturation, documents et parcours fiscal adaptés à ton activité.",
  },
  {
    title: "Dirigeants / sociétés",
    body: "Vue d’ensemble pour piloter dossiers et obligations — sans promesse « expert ISOC » inventée.",
  },
  {
    title: "Location & hébergement",
    body: "Parcours location (dont Airbnb) selon plan — avec disclaimers honnêtes.",
  },
  {
    title: "Cabinets comptables",
    body: "Espace cabinet en bêta : rôles, dossiers et contrôle.",
  },
];

export function BrandSections({
  hasSession = false,
  histoireDev = false,
}: {
  hasSession?: boolean;
  histoireDev?: boolean;
}) {
  const showHistoirePlaceholder = histoireDev || showDevStatus();

  return (
    <>
      <section
        id="accueil"
        className="relative overflow-hidden px-5 pb-24 pt-16 md:pt-24"
      >
        <div className="mesh-pulse pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div className="rise-in space-y-6">
            <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-[#E8F2EE] md:text-7xl">
              Jovatax
            </h1>
            <p className="max-w-md text-lg text-[#A8C0B6] md:text-xl">
              La fiscalité et l&apos;activité, enfin dans une app qui te
              ressemble.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#histoire">
                <Button variant="outline" size="lg" type="button">
                  Notre histoire
                </Button>
              </a>
              <a href={hasSession ? "/telecharger" : "#beta"}>
                <Button size="lg" type="button">
                  Accéder à la bêta
                </Button>
              </a>
            </div>
          </div>
          <aside className="rise-in-delay rounded-2xl border border-[#E8F2EE]/12 bg-[#123B32]/55 p-6 backdrop-blur-sm">
            <p className="font-display text-xl text-[#E8F2EE]">Bêta privée</p>
            <p className="mt-3 text-sm leading-relaxed text-[#A8C0B6]">
              Android prêt ; iPhone et Windows arrivent
            </p>
          </aside>
        </div>
      </section>

      <section id="histoire" className="px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F4B740]">
            Notre histoire
          </p>
          <h2 className="mt-3 font-display text-3xl text-[#E8F2EE] md:text-4xl">
            Bientôt
          </h2>
          <p className="mt-4 max-w-xl text-[#A8C0B6]">
            Le récit fondateur sera publié dès qu&apos;un brief authentique sera
            fourni — aucun fait inventé ici.
          </p>
          {showHistoirePlaceholder ? (
            <p className="mt-6 rounded-xl border border-dashed border-[#7F9B90]/40 p-4 font-mono text-xs text-[#7F9B90]">
              [HISTOIRE — en attente brief fondateur]
            </p>
          ) : null}
        </div>
      </section>

      <section id="plateforme" className="px-5 py-20">
        <div className="mx-auto max-w-6xl space-y-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F4B740]">
              La plateforme
            </p>
            <h2 className="mt-3 font-display text-3xl text-[#E8F2EE] md:text-4xl">
              Capacités réelles, statut honnête
            </h2>
          </div>
          <div className="grid gap-10 md:grid-cols-3">
            <FeatureColumn title="Disponible en bêta" items={platformOps} />
            <FeatureColumn title="Aperçu / limité" items={platformLimited} />
            <FeatureColumn title="En construction" items={platformSoon} />
          </div>
        </div>
      </section>

      <section id="pour-qui" className="px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F4B740]">
            Pour qui
          </p>
          <h2 className="mt-3 font-display text-3xl text-[#E8F2EE] md:text-4xl">
            Multi-profil, une seule app
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            {audiences.map((a) => (
              <div key={a.title} className="space-y-2">
                <h3 className="font-display text-xl text-[#E8F2EE]">
                  {a.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#A8C0B6]">
                  {a.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="beta" className="px-5 py-24">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F4B740]">
              Bêta privée
            </p>
            <h2 className="mt-3 font-display text-3xl text-[#E8F2EE] md:text-4xl">
              Un code, un blase, le téléchargement
            </h2>
            <p className="mt-4 text-[#A8C0B6]">
              Android est prêt. iPhone et Windows restent sur « bientôt ».
            </p>
          </div>
          {hasSession ? (
            <div className="rounded-2xl border border-[#E8F2EE]/12 bg-[#123B32]/45 p-6">
              <p className="text-[#E8F2EE]">Session active.</p>
              <a href="/telecharger" className="mt-4 inline-block">
                <Button size="lg">Aller au hub</Button>
              </a>
            </div>
          ) : (
            <GateForm />
          )}
        </div>
      </section>
    </>
  );
}

function FeatureColumn({
  title,
  items,
}: {
  title: string;
  items: { title: string; body: string }[];
}) {
  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#F4B740]">
        {title}
      </h3>
      <ul className="space-y-5">
        {items.map((item) => (
          <li key={item.title}>
            <p className="font-medium text-[#E8F2EE]">{item.title}</p>
            <p className="mt-1 text-sm text-[#A8C0B6]">{item.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function GateForm() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      if (!res.ok) {
        setError(
          res.status === 503
            ? "Configuration temporairement indisponible."
            : "Code invalide ou incomplet.",
        );
        setPending(false);
        return;
      }
      // Hard nav — évite soft-nav RSC TypeError sur SiteShell
      window.location.assign("/telecharger");
    } catch {
      setError("Impossible de joindre le serveur.");
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-[#E8F2EE]/12 bg-[#0a1f1a]/45 p-6 backdrop-blur-sm"
      autoComplete="off"
    >
      <div className="space-y-2">
        <Label htmlFor="invite-code">Code d&apos;invitation</Label>
        <Input
          id="invite-code"
          name="invite-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Ton code privé"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          minLength={8}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="display-name">Nom / blase</Label>
        <Input
          id="display-name"
          name="display-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Comment on t'appelle"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          minLength={2}
          maxLength={48}
          required
        />
      </div>
      {error ? <p className="text-sm text-[#F4B740]">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending} size="lg">
        {pending ? "…" : "Continuer"}
      </Button>
    </form>
  );
}

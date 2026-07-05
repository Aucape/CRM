"use client";

// URL en lecture seule avec bouton « Copier » (presse-papiers).
import { useState } from "react";
import { Bouton } from "@/components/ui/base";

export function ChampCopie({ valeur }: { valeur: string }) {
  const [copie, setCopie] = useState(false);

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={valeur}
        onFocus={(e) => e.target.select()}
        className="min-h-11 w-full min-w-0 flex-1 rounded-xl bg-slate-50 px-3.5 font-mono text-xs text-slate-600 ring-1 ring-slate-200"
      />
      <Bouton
        type="button"
        variante="secondaire"
        className="shrink-0"
        onClick={async () => {
          await navigator.clipboard.writeText(valeur);
          setCopie(true);
          setTimeout(() => setCopie(false), 2000);
        }}
      >
        {copie ? "Copié ✓" : "Copier"}
      </Bouton>
    </div>
  );
}

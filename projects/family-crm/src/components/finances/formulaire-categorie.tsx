"use client";

// Ajout d'une catégorie de dépenses personnalisée.
import { useActionState, useEffect, useRef } from "react";
import type { EtatFormulaire } from "@/server/actions/finances";
import { Bouton } from "@/components/ui/base";

export function FormulaireCategorie({
  action,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
}) {
  const [etat, soumettre, enCours] = useActionState<EtatFormulaire, FormData>(
    action,
    {},
  );
  const formulaire = useRef<HTMLFormElement>(null);

  // Vide le champ après une création réussie.
  useEffect(() => {
    if (!etat.erreur && !enCours) formulaire.current?.reset();
  }, [etat, enCours]);

  return (
    <form ref={formulaire} action={soumettre} className="space-y-2">
      <div className="flex gap-2">
        <input
          name="libelle"
          required
          placeholder="ex. Frais d'école, Cadeaux, Animaux…"
          className="min-h-11 w-full min-w-0 flex-1 rounded-xl bg-white px-3.5 text-base ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600 focus:outline-none"
        />
        <Bouton type="submit" disabled={enCours} className="shrink-0">
          {enCours ? "Ajout…" : "Ajouter"}
        </Bouton>
      </div>
      {etat.erreur && (
        <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}

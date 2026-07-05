"use client";

// Formulaire d'échéance manuelle (rappel libre, hors modules).
import { useActionState } from "react";
import type { Membre } from "@prisma/client";
import type { EtatFormulaire } from "@/server/actions/echeances";
import {
  Bouton,
  Champ,
  ChampSelect,
  ChampTexteLong,
  LienBouton,
} from "@/components/ui/base";

export function FormulaireEcheance({
  membres,
  action,
}: {
  membres: Membre[];
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
}) {
  const [etat, soumettre, enCours] = useActionState<EtatFormulaire, FormData>(
    action,
    {},
  );

  return (
    <form action={soumettre} className="space-y-4">
      <Champ
        label="Titre *"
        name="titre"
        placeholder="ex. Inscrire Louis au stage d'été"
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <Champ label="Date *" type="date" name="dateEcheance" required />
        <Champ
          label="Alerte X jours avant"
          type="number"
          name="alerteJoursAvant"
          min={0}
          max={365}
          defaultValue={14}
        />
      </div>
      <ChampSelect label="Concerne" name="membreId" defaultValue="">
        <option value="">Le foyer</option>
        {membres.map((m) => (
          <option key={m.id} value={m.id}>
            {m.prenom}
          </option>
        ))}
      </ChampSelect>
      <ChampTexteLong label="Notes" name="notes" />

      {etat.erreur && (
        <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {etat.erreur}
        </p>
      )}

      <div className="flex gap-2">
        <Bouton type="submit" disabled={enCours} className="flex-1">
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </Bouton>
        <LienBouton href="/echeances" variante="secondaire">
          Annuler
        </LienBouton>
      </div>
    </form>
  );
}

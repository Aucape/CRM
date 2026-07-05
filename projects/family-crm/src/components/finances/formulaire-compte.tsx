"use client";

// Formulaire de création d'un compte bancaire (import manuel).
import { useActionState } from "react";
import type { EtatFormulaire } from "@/server/actions/finances";
import { BANQUES, LIBELLES_BANQUE } from "@/lib/constantes";
import { Bouton, Champ, ChampSelect, LienBouton } from "@/components/ui/base";

export function FormulaireCompte({
  action,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
}) {
  const [etat, soumettre, enCours] = useActionState<EtatFormulaire, FormData>(
    action,
    {},
  );

  return (
    <form action={soumettre} className="space-y-4">
      <Champ
        label="Nom du compte *"
        name="nom"
        placeholder="ex. Compte commun Belfius"
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <ChampSelect label="Banque" name="banque" defaultValue="BELFIUS">
          {BANQUES.map((b) => (
            <option key={b} value={b}>
              {LIBELLES_BANQUE[b]}
            </option>
          ))}
        </ChampSelect>
        <Champ label="IBAN" name="iban" placeholder="BE68 5390 0754 7034" />
      </div>

      {etat.erreur && (
        <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {etat.erreur}
        </p>
      )}

      <div className="flex gap-2">
        <Bouton type="submit" disabled={enCours} className="flex-1">
          {enCours ? "Création…" : "Créer le compte"}
        </Bouton>
        <LienBouton href="/finances" variante="secondaire">
          Annuler
        </LienBouton>
      </div>
    </form>
  );
}

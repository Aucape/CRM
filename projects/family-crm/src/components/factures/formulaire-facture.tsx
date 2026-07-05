"use client";

// Formulaire de création / édition d'une facture ou d'un abonnement.
import { useActionState } from "react";
import type { Facture, Membre } from "@prisma/client";
import type { EtatFormulaire } from "@/server/actions/factures";
import {
  CATEGORIES_FACTURE,
  LIBELLES_CATEGORIE_FACTURE,
  LIBELLES_RECURRENCE,
  RECURRENCES,
} from "@/lib/constantes";
import { versInputDate } from "@/lib/dates";
import {
  Bouton,
  Champ,
  ChampSelect,
  ChampTexteLong,
  LienBouton,
} from "@/components/ui/base";

export function FormulaireFacture({
  facture,
  membres,
  action,
}: {
  facture?: Facture;
  membres: Membre[];
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
}) {
  const [etat, soumettre, enCours] = useActionState<EtatFormulaire, FormData>(
    action,
    {},
  );

  return (
    <form action={soumettre} className="space-y-4">
      {facture && <input type="hidden" name="id" value={facture.id} />}

      <Champ
        label="Libellé *"
        name="libelle"
        placeholder="ex. Électricité Engie"
        defaultValue={facture?.libelle}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <ChampSelect
          label="Catégorie"
          name="categorie"
          defaultValue={facture?.categorie ?? "LOGEMENT"}
        >
          {CATEGORIES_FACTURE.map((c) => (
            <option key={c} value={c}>
              {LIBELLES_CATEGORIE_FACTURE[c]}
            </option>
          ))}
        </ChampSelect>
        <Champ
          label="Montant (€) *"
          name="montant"
          inputMode="decimal"
          placeholder="89,99"
          defaultValue={
            facture ? (facture.montantCents / 100).toFixed(2).replace(".", ",") : ""
          }
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ChampSelect
          label="Récurrence"
          name="recurrence"
          defaultValue={facture?.recurrence ?? "MENSUELLE"}
        >
          {RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {LIBELLES_RECURRENCE[r]}
            </option>
          ))}
        </ChampSelect>
        <Champ
          label="Prochaine échéance *"
          type="date"
          name="prochaineEcheance"
          defaultValue={versInputDate(facture?.prochaineEcheance ?? null)}
          required
        />
      </div>

      <ChampSelect label="Qui paie ?" name="payeurId" defaultValue={facture?.payeurId ?? ""}>
        <option value="">—</option>
        {membres.map((m) => (
          <option key={m.id} value={m.id}>
            {m.prenom}
          </option>
        ))}
      </ChampSelect>

      <ChampTexteLong
        label="Notes"
        name="notes"
        placeholder="Numéro de client, domiciliation…"
        defaultValue={facture?.notes ?? ""}
      />

      {etat.erreur && (
        <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {etat.erreur}
        </p>
      )}

      <div className="flex gap-2">
        <Bouton type="submit" disabled={enCours} className="flex-1">
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </Bouton>
        <LienBouton href="/factures" variante="secondaire">
          Annuler
        </LienBouton>
      </div>
    </form>
  );
}

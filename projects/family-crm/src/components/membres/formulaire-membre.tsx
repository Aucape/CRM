"use client";

// Formulaire de création / édition d'un membre du foyer.
import { useActionState } from "react";
import type { Membre } from "@prisma/client";
import type { EtatFormulaire } from "@/server/actions/membres";
import { COULEURS_MEMBRE } from "@/lib/constantes";
import { composantsBruxelles } from "@/lib/dates";
import {
  Bouton,
  Champ,
  ChampTexteLong,
  LienBouton,
} from "@/components/ui/base";

/** Date → valeur d'un <input type="date"> (jour mural bruxellois). */
function versInputDate(d: Date | null): string {
  if (!d) return "";
  const c = composantsBruxelles(d);
  return `${c.annee}-${String(c.mois).padStart(2, "0")}-${String(c.jour).padStart(2, "0")}`;
}

export function FormulaireMembre({
  membre,
  action,
}: {
  membre?: Membre;
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
}) {
  const [etat, soumettre, enCours] = useActionState<EtatFormulaire, FormData>(
    action,
    {},
  );

  return (
    <form action={soumettre} className="space-y-4">
      {membre && <input type="hidden" name="id" value={membre.id} />}

      <div className="grid grid-cols-2 gap-3">
        <Champ label="Prénom *" name="prenom" defaultValue={membre?.prenom} required />
        <Champ label="Nom" name="nom" defaultValue={membre?.nom ?? ""} />
      </div>

      <Champ
        label="Date de naissance"
        type="date"
        name="dateNaissance"
        defaultValue={versInputDate(membre?.dateNaissance ?? null)}
      />

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700">
          Couleur (calendrier)
        </legend>
        <div className="flex flex-wrap gap-2.5">
          {COULEURS_MEMBRE.map((c, i) => (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="couleur"
                value={c}
                defaultChecked={membre ? membre.couleur === c : i === 0}
                className="peer sr-only"
              />
              <span
                className="block h-9 w-9 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-slate-900"
                style={{ backgroundColor: c }}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Champ
          label="Taille vêtements"
          name="tailleVetements"
          placeholder="ex. 128 / 8 ans"
          defaultValue={membre?.tailleVetements ?? ""}
        />
        <Champ
          label="Pointure"
          name="pointure"
          placeholder="ex. 32"
          defaultValue={membre?.pointure ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Champ
          label="Groupe sanguin"
          name="groupeSanguin"
          placeholder="ex. O+"
          defaultValue={membre?.groupeSanguin ?? ""}
        />
        <Champ
          label="Allergies"
          name="allergies"
          placeholder="ex. arachides"
          defaultValue={membre?.allergies ?? ""}
        />
      </div>

      <ChampTexteLong
        label="Notes"
        name="notes"
        placeholder="Médecin traitant, doudou, points d'attention…"
        defaultValue={membre?.notes ?? ""}
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
        <LienBouton
          href={membre ? `/membres/${membre.id}` : "/membres"}
          variante="secondaire"
        >
          Annuler
        </LienBouton>
      </div>
    </form>
  );
}

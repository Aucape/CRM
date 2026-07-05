"use client";

// Formulaire de création / édition d'un événement du calendrier.
import { useActionState, useState } from "react";
import type { Membre } from "@prisma/client";
import type { EtatFormulaire } from "@/server/actions/evenements";
import { versInputDate, versInputHeure } from "@/lib/dates";
import {
  AvatarMembre,
  Bouton,
  Champ,
  ChampSelect,
  ChampTexteLong,
  LienBouton,
} from "@/components/ui/base";

const CHOIX_RECURRENCE = [
  { valeur: "", libelle: "Jamais" },
  { valeur: "FREQ=DAILY", libelle: "Tous les jours" },
  { valeur: "FREQ=WEEKLY", libelle: "Toutes les semaines" },
  { valeur: "FREQ=WEEKLY;INTERVAL=2", libelle: "Toutes les 2 semaines" },
  { valeur: "FREQ=MONTHLY", libelle: "Tous les mois" },
  { valeur: "FREQ=YEARLY", libelle: "Tous les ans" },
];

interface EvenementInitial {
  id: string;
  titre: string;
  lieu: string | null;
  description: string | null;
  debut: Date;
  fin: Date;
  journeeEntiere: boolean;
  rrule: string | null;
  membreIds: string[];
}

export function FormulaireEvenement({
  evenement,
  membres,
  action,
  dateInitiale,
}: {
  evenement?: EvenementInitial;
  membres: Membre[];
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  dateInitiale?: string;
}) {
  const [etat, soumettre, enCours] = useActionState<EtatFormulaire, FormData>(
    action,
    {},
  );
  const [journeeEntiere, setJourneeEntiere] = useState(
    evenement?.journeeEntiere ?? false,
  );

  // DTEND exclusif → dernier jour inclus pour l'input « jusqu'au ».
  const finInclus = evenement?.journeeEntiere
    ? new Date(evenement.fin.getTime() - 86_400_000)
    : (evenement?.fin ?? null);

  return (
    <form action={soumettre} className="space-y-4">
      {evenement && <input type="hidden" name="id" value={evenement.id} />}

      <Champ
        label="Titre *"
        name="titre"
        placeholder="ex. Réunion parents-profs"
        defaultValue={evenement?.titre}
        required
      />
      <Champ
        label="Lieu"
        name="lieu"
        placeholder="ex. École Saint-Michel"
        defaultValue={evenement?.lieu ?? ""}
      />

      <label className="flex min-h-11 items-center gap-2.5">
        <input
          type="checkbox"
          name="journeeEntiere"
          checked={journeeEntiere}
          onChange={(e) => setJourneeEntiere(e.target.checked)}
          className="h-5 w-5 accent-blue-700"
        />
        <span className="text-sm font-medium text-slate-700">Journée entière</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Champ
          label={journeeEntiere ? "Du" : "Date *"}
          type="date"
          name="date"
          defaultValue={
            evenement ? versInputDate(evenement.debut) : (dateInitiale ?? "")
          }
          required
        />
        {journeeEntiere ? (
          <Champ
            label="Au (inclus)"
            type="date"
            name="dateFin"
            defaultValue={versInputDate(finInclus)}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Champ
              label="Début *"
              type="time"
              name="heureDebut"
              defaultValue={evenement ? versInputHeure(evenement.debut) : "09:00"}
            />
            <Champ
              label="Fin *"
              type="time"
              name="heureFin"
              defaultValue={evenement ? versInputHeure(evenement.fin) : "10:00"}
            />
          </div>
        )}
      </div>

      <ChampSelect
        label="Répétition"
        name="rrule"
        defaultValue={evenement?.rrule ?? ""}
      >
        {CHOIX_RECURRENCE.map((c) => (
          <option key={c.valeur} value={c.valeur}>
            {c.libelle}
          </option>
        ))}
      </ChampSelect>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700">
          Qui est concerné ? <span className="font-normal text-slate-400">(personne = toute la famille)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {membres.map((m) => (
            <label key={m.id} className="cursor-pointer">
              <input
                type="checkbox"
                name="membreIds"
                value={m.id}
                defaultChecked={evenement?.membreIds.includes(m.id)}
                className="peer sr-only"
              />
              <span className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-slate-300 peer-checked:text-white peer-checked:ring-0 peer-checked:[background-color:var(--couleur)]"
                style={{ "--couleur": m.couleur } as React.CSSProperties}
              >
                <AvatarMembre prenom={m.prenom} couleur={m.couleur} taille="sm" />
                {m.prenom}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <ChampTexteLong
        label="Description"
        name="description"
        defaultValue={evenement?.description ?? ""}
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
          href={evenement ? `/calendrier/${evenement.id}` : "/calendrier"}
          variante="secondaire"
        >
          Annuler
        </LienBouton>
      </div>
    </form>
  );
}

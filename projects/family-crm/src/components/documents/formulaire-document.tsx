"use client";

// Formulaire de création / édition d'un document administratif.
// Le délai d'alerte se pré-remplit selon le type (Kids-ID : 90 j…) tant
// que l'utilisateur ne l'a pas modifié lui-même.
import { useRef, useState, useActionState } from "react";
import type { Document, Membre } from "@prisma/client";
import type { EtatFormulaire } from "@/server/actions/documents";
import {
  ALERTE_DEFAUT_PAR_TYPE,
  LIBELLES_TYPE_DOCUMENT,
  TYPES_DOCUMENT,
  type TypeDocument,
} from "@/lib/constantes";
import { versInputDate } from "@/lib/dates";
import {
  Bouton,
  Champ,
  ChampSelect,
  ChampTexteLong,
  LienBouton,
} from "@/components/ui/base";

export function FormulaireDocument({
  document,
  membres,
  action,
}: {
  document?: Document;
  membres: Membre[];
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
}) {
  const [etat, soumettre, enCours] = useActionState<EtatFormulaire, FormData>(
    action,
    {},
  );
  const [alerte, setAlerte] = useState(
    document?.alerteJoursAvant ?? ALERTE_DEFAUT_PAR_TYPE.AUTRE,
  );
  const alerteModifiee = useRef(Boolean(document));

  return (
    <form action={soumettre} className="space-y-4">
      {document && <input type="hidden" name="id" value={document.id} />}

      <Champ
        label="Titre *"
        name="titre"
        placeholder="ex. Kids-ID Emma"
        defaultValue={document?.titre}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <ChampSelect
          label="Type"
          name="type"
          defaultValue={document?.type ?? "AUTRE"}
          onChange={(e) => {
            if (!alerteModifiee.current) {
              setAlerte(ALERTE_DEFAUT_PAR_TYPE[e.target.value as TypeDocument]);
            }
          }}
        >
          {TYPES_DOCUMENT.map((t) => (
            <option key={t} value={t}>
              {LIBELLES_TYPE_DOCUMENT[t]}
            </option>
          ))}
        </ChampSelect>
        <ChampSelect
          label="Concerne"
          name="membreId"
          defaultValue={document?.membreId ?? ""}
        >
          <option value="">Le foyer</option>
          {membres.map((m) => (
            <option key={m.id} value={m.id}>
              {m.prenom}
            </option>
          ))}
        </ChampSelect>
      </div>

      <Champ
        label="Numéro / référence"
        name="numeroReference"
        placeholder="ex. 612-0345678-90"
        defaultValue={document?.numeroReference ?? ""}
      />

      <div className="grid grid-cols-2 gap-3">
        <Champ
          label="Délivré le"
          type="date"
          name="dateEmission"
          defaultValue={versInputDate(document?.dateEmission ?? null)}
        />
        <Champ
          label="Expire le"
          type="date"
          name="dateExpiration"
          defaultValue={versInputDate(document?.dateExpiration ?? null)}
        />
      </div>

      <Champ
        label="Alerte X jours avant l'expiration"
        type="number"
        name="alerteJoursAvant"
        min={0}
        max={365}
        value={alerte}
        onChange={(e) => {
          alerteModifiee.current = true;
          setAlerte(Number(e.target.value));
        }}
      />

      <ChampTexteLong
        label="Notes"
        name="notes"
        placeholder="Où est rangé l'original, démarches de renouvellement…"
        defaultValue={document?.notes ?? ""}
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
        <LienBouton href="/documents" variante="secondaire">
          Annuler
        </LienBouton>
      </div>
    </form>
  );
}

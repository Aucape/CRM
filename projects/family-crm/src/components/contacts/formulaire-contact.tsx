"use client";

// Formulaire de création / édition d'un contact utile.
import { useActionState } from "react";
import type { Contact } from "@prisma/client";
import type { EtatFormulaire } from "@/server/actions/contacts";
import {
  CATEGORIES_CONTACT,
  LIBELLES_CATEGORIE_CONTACT,
} from "@/lib/constantes";
import {
  Bouton,
  Champ,
  ChampSelect,
  ChampTexteLong,
  LienBouton,
} from "@/components/ui/base";

export function FormulaireContact({
  contact,
  action,
}: {
  contact?: Contact;
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
}) {
  const [etat, soumettre, enCours] = useActionState<EtatFormulaire, FormData>(
    action,
    {},
  );

  return (
    <form action={soumettre} className="space-y-4">
      {contact && <input type="hidden" name="id" value={contact.id} />}

      <Champ
        label="Nom *"
        name="nom"
        placeholder="ex. Dr Peeters — médecin traitant"
        defaultValue={contact?.nom}
        required
      />

      <ChampSelect
        label="Catégorie"
        name="categorie"
        defaultValue={contact?.categorie ?? "AUTRE"}
      >
        {CATEGORIES_CONTACT.map((c) => (
          <option key={c} value={c}>
            {LIBELLES_CATEGORIE_CONTACT[c]}
          </option>
        ))}
      </ChampSelect>

      <div className="grid grid-cols-2 gap-3">
        <Champ
          label="Téléphone"
          type="tel"
          name="telephone"
          placeholder="ex. 02 345 67 89"
          defaultValue={contact?.telephone ?? ""}
        />
        <Champ
          label="E-mail"
          type="email"
          name="email"
          defaultValue={contact?.email ?? ""}
        />
      </div>

      <Champ label="Adresse" name="adresse" defaultValue={contact?.adresse ?? ""} />

      <Champ
        label="Tags (séparés par des virgules)"
        name="tags"
        placeholder="ex. urgence, baby-sitter"
        defaultValue={contact?.tags ?? ""}
      />

      <ChampTexteLong
        label="Notes"
        name="notes"
        placeholder="Horaires, tarifs, numéro de client…"
        defaultValue={contact?.notes ?? ""}
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
        <LienBouton href="/contacts" variante="secondaire">
          Annuler
        </LienBouton>
      </div>
    </form>
  );
}

import type { Metadata } from "next";
import { exigerUtilisateur } from "@/lib/auth";
import { creerContact } from "@/server/actions/contacts";
import { Carte, EnTetePage } from "@/components/ui/base";
import { FormulaireContact } from "@/components/contacts/formulaire-contact";

export const metadata: Metadata = { title: "Nouveau contact" };

export default async function PageNouveauContact() {
  await exigerUtilisateur();
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage titre="Nouveau contact" />
      <Carte>
        <FormulaireContact action={creerContact} />
      </Carte>
    </div>
  );
}

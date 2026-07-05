import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { creerEcheanceManuelle } from "@/server/actions/echeances";
import { Carte, EnTetePage } from "@/components/ui/base";
import { FormulaireEcheance } from "@/components/echeances/formulaire-echeance";

export const metadata: Metadata = { title: "Nouvelle échéance" };

export default async function PageNouvelleEcheance() {
  await exigerUtilisateur();
  const membres = await db.membre.findMany({
    where: { archive: false },
    orderBy: { dateNaissance: "asc" },
  });

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage titre="Nouvelle échéance" sousTitre="Un rappel libre, visible sur le dashboard" />
      <Carte>
        <FormulaireEcheance membres={membres} action={creerEcheanceManuelle} />
      </Carte>
    </div>
  );
}

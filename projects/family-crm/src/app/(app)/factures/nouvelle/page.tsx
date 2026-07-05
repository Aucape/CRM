import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { creerFacture } from "@/server/actions/factures";
import { Carte, EnTetePage } from "@/components/ui/base";
import { FormulaireFacture } from "@/components/factures/formulaire-facture";

export const metadata: Metadata = { title: "Nouvelle facture" };

export default async function PageNouvelleFacture() {
  await exigerUtilisateur();
  const membres = await db.membre.findMany({
    where: { archive: false },
    orderBy: { prenom: "asc" },
  });

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage titre="Nouvelle facture" />
      <Carte>
        <FormulaireFacture membres={membres} action={creerFacture} />
      </Carte>
    </div>
  );
}

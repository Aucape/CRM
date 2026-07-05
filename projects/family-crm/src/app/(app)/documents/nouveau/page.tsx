import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { creerDocument } from "@/server/actions/documents";
import { Carte, EnTetePage } from "@/components/ui/base";
import { FormulaireDocument } from "@/components/documents/formulaire-document";

export const metadata: Metadata = { title: "Nouveau document" };

export default async function PageNouveauDocument() {
  await exigerUtilisateur();
  const membres = await db.membre.findMany({
    where: { archive: false },
    orderBy: { dateNaissance: "asc" },
  });

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage titre="Nouveau document" />
      <Carte>
        <FormulaireDocument membres={membres} action={creerDocument} />
      </Carte>
    </div>
  );
}

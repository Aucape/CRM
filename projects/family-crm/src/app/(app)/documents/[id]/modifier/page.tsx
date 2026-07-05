import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { modifierDocument, supprimerDocument } from "@/server/actions/documents";
import { Bouton, Carte, EnTetePage } from "@/components/ui/base";
import { FormulaireDocument } from "@/components/documents/formulaire-document";

export const metadata: Metadata = { title: "Modifier le document" };

export default async function PageModifierDocument({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerUtilisateur();
  const { id } = await params;
  const [document, membres] = await Promise.all([
    db.document.findUnique({ where: { id } }),
    db.membre.findMany({ where: { archive: false }, orderBy: { dateNaissance: "asc" } }),
  ]);
  if (!document) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage titre={document.titre} />
      <Carte>
        <FormulaireDocument
          document={document}
          membres={membres}
          action={modifierDocument}
        />
      </Carte>
      <form action={supprimerDocument}>
        <input type="hidden" name="id" value={document.id} />
        <Bouton type="submit" variante="danger" className="w-full">
          Supprimer ce document
        </Bouton>
      </form>
    </div>
  );
}

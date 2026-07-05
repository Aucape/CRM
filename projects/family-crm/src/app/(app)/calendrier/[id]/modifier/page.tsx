import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { modifierEvenement } from "@/server/actions/evenements";
import { Carte, EnTetePage } from "@/components/ui/base";
import { FormulaireEvenement } from "@/components/calendrier/formulaire-evenement";

export const metadata: Metadata = { title: "Modifier l'événement" };

export default async function PageModifierEvenement({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerUtilisateur();
  const { id } = await params;
  const [evenement, membres] = await Promise.all([
    db.evenement.findUnique({ where: { id }, include: { membres: true } }),
    db.membre.findMany({ where: { archive: false }, orderBy: { dateNaissance: "asc" } }),
  ]);
  if (!evenement) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage titre={`Modifier « ${evenement.titre} »`} />
      <Carte>
        <FormulaireEvenement
          evenement={{
            ...evenement,
            membreIds: evenement.membres.map((m) => m.membreId),
          }}
          membres={membres}
          action={modifierEvenement}
        />
      </Carte>
    </div>
  );
}

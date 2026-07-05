import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { modifierMembre } from "@/server/actions/membres";
import { Carte, EnTetePage } from "@/components/ui/base";
import { FormulaireMembre } from "@/components/membres/formulaire-membre";

export const metadata: Metadata = { title: "Modifier le membre" };

export default async function PageModifierMembre({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerUtilisateur();
  const { id } = await params;
  const membre = await db.membre.findUnique({ where: { id } });
  if (!membre) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage titre={`Modifier ${membre.prenom}`} />
      <Carte>
        <FormulaireMembre membre={membre} action={modifierMembre} />
      </Carte>
    </div>
  );
}

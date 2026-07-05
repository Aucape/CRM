import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { modifierContact, supprimerContact } from "@/server/actions/contacts";
import { Bouton, Carte, EnTetePage } from "@/components/ui/base";
import { FormulaireContact } from "@/components/contacts/formulaire-contact";

export const metadata: Metadata = { title: "Modifier le contact" };

export default async function PageModifierContact({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerUtilisateur();
  const { id } = await params;
  const contact = await db.contact.findUnique({ where: { id } });
  if (!contact) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage titre={contact.nom} />
      <Carte>
        <FormulaireContact contact={contact} action={modifierContact} />
      </Carte>
      <form action={supprimerContact}>
        <input type="hidden" name="id" value={contact.id} />
        <Bouton type="submit" variante="danger" className="w-full">
          Supprimer ce contact
        </Bouton>
      </form>
    </div>
  );
}

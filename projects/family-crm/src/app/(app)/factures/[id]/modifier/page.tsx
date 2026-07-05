import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { modifierFacture, supprimerFacture } from "@/server/actions/factures";
import { formaterDate, formaterEuros } from "@/lib/dates";
import { Badge, Bouton, Carte, EnTetePage } from "@/components/ui/base";
import { FormulaireFacture } from "@/components/factures/formulaire-facture";

export const metadata: Metadata = { title: "Modifier la facture" };

export default async function PageModifierFacture({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerUtilisateur();
  const { id } = await params;
  const [facture, membres] = await Promise.all([
    db.facture.findUnique({
      where: { id },
      include: {
        paiements: { orderBy: { dateEcheance: "desc" }, take: 12 },
      },
    }),
    db.membre.findMany({ where: { archive: false }, orderBy: { prenom: "asc" } }),
  ]);
  if (!facture) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage titre={facture.libelle} />

      <Carte>
        <FormulaireFacture facture={facture} membres={membres} action={modifierFacture} />
      </Carte>

      <Carte titre="Historique des occurrences">
        <ul className="divide-y divide-slate-100">
          {facture.paiements.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-slate-600">
                {formaterDate(p.dateEcheance)}
              </span>
              <span className="text-sm font-medium text-slate-900">
                {formaterEuros(p.montantCents)}
              </span>
              {p.statut === "PAYE" ? (
                <Badge teinte="vert">Payé</Badge>
              ) : (
                <Badge teinte="orange">À payer</Badge>
              )}
            </li>
          ))}
        </ul>
      </Carte>

      <form action={supprimerFacture}>
        <input type="hidden" name="id" value={facture.id} />
        <Bouton type="submit" variante="danger" className="w-full">
          Supprimer cette facture et son historique
        </Bouton>
      </form>
    </div>
  );
}

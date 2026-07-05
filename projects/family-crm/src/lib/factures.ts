// Logique métier des factures partagée entre le module Factures et le
// rapprochement bancaire du module Finances.
import { db } from "@/lib/db";
import type { Recurrence } from "@/lib/constantes";
import { occurrenceSuivante } from "@/lib/recurrence";
import { basculerEcheanceFaite, synchroniserEcheance } from "@/lib/echeances";

/** Crée l'occurrence (Paiement) d'une facture et son échéance liée. */
export async function creerOccurrence(
  facture: { id: string; libelle: string; payeurId: string | null },
  dateEcheance: Date,
  montantCents: number,
) {
  const paiement = await db.paiement.create({
    data: { factureId: facture.id, dateEcheance, montantCents },
  });
  await synchroniserEcheance("FACTURE", paiement.id, {
    titre: `Payer : ${facture.libelle}`,
    dateEcheance,
    alerteJoursAvant: 7,
    membreId: facture.payeurId,
  });
  return paiement;
}

/**
 * Marque une occurrence payée : échéance liée à FAIT et, pour une
 * facture récurrente active sans autre occurrence en attente,
 * génération de l'occurrence suivante.
 */
export async function marquerPaiementPaye(
  paiementId: string,
  payeLe: Date = new Date(),
): Promise<void> {
  const paiement = await db.paiement.findUnique({
    where: { id: paiementId },
    include: { facture: true },
  });
  if (!paiement || paiement.statut === "PAYE") return;

  await db.paiement.update({
    where: { id: paiementId },
    data: { statut: "PAYE", payeLe },
  });
  const echeance = await db.echeance.findFirst({
    where: { module: "FACTURE", sourceId: paiementId },
  });
  if (echeance) await basculerEcheanceFaite(echeance.id, true);

  const suivante = occurrenceSuivante(
    paiement.dateEcheance,
    paiement.facture.recurrence as Recurrence,
  );
  if (suivante && paiement.facture.active) {
    const dejaEnAttente = await db.paiement.findFirst({
      where: { factureId: paiement.factureId, statut: "A_PAYER" },
    });
    if (!dejaEnAttente) {
      await db.facture.update({
        where: { id: paiement.factureId },
        data: { prochaineEcheance: suivante },
      });
      await creerOccurrence(paiement.facture, suivante, paiement.facture.montantCents);
    }
  }
}

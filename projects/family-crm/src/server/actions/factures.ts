"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { zCategorieFacture, zRecurrence, type Recurrence } from "@/lib/constantes";
import { dateBruxelles, parserEuros } from "@/lib/dates";
import { occurrenceSuivante } from "@/lib/recurrence";
import { basculerEcheanceFaite, supprimerEcheances, synchroniserEcheance } from "@/lib/echeances";

export interface EtatFormulaire {
  erreur?: string;
}

const zFacture = z.object({
  libelle: z.string().trim().min(1, "Le libellé est obligatoire."),
  categorie: zCategorieFacture,
  montant: z.string().trim().min(1, "Le montant est obligatoire."),
  recurrence: zRecurrence,
  prochaineEcheance: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La date d'échéance est obligatoire."),
  payeurId: z.string().optional(),
  notes: z.string().trim().optional(),
});

function lireFormulaire(formData: FormData) {
  const resultat = zFacture.safeParse({
    libelle: formData.get("libelle"),
    categorie: formData.get("categorie"),
    montant: formData.get("montant"),
    recurrence: formData.get("recurrence"),
    prochaineEcheance: formData.get("prochaineEcheance"),
    payeurId: formData.get("payeurId") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!resultat.success) return { erreur: resultat.error.issues[0].message };

  const d = resultat.data;
  let montantCents: number;
  try {
    montantCents = parserEuros(d.montant);
  } catch {
    return { erreur: "Montant invalide (ex. 89,99)." };
  }
  if (montantCents <= 0) return { erreur: "Le montant doit être positif." };

  const [a, m, j] = d.prochaineEcheance.split("-").map(Number);
  return {
    donnees: {
      libelle: d.libelle,
      categorie: d.categorie,
      montantCents,
      recurrence: d.recurrence,
      prochaineEcheance: dateBruxelles(a, m, j),
      payeurId: d.payeurId || null,
      notes: d.notes || null,
    },
  };
}

/** Crée l'occurrence (Paiement) et son échéance liée. */
async function creerOccurrence(
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

export async function creerFacture(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur();
  const lu = lireFormulaire(formData);
  if ("erreur" in lu) return { erreur: lu.erreur };

  const facture = await db.facture.create({ data: lu.donnees });
  await creerOccurrence(facture, facture.prochaineEcheance, facture.montantCents);

  revalidatePath("/factures");
  redirect("/factures");
}

export async function modifierFacture(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");
  const lu = lireFormulaire(formData);
  if ("erreur" in lu) return { erreur: lu.erreur };

  const facture = await db.facture.update({ where: { id }, data: lu.donnees });

  // Réaligne l'occurrence en attente (date, montant, échéance liée).
  const enAttente = await db.paiement.findFirst({
    where: { factureId: id, statut: "A_PAYER" },
    orderBy: { dateEcheance: "asc" },
  });
  if (enAttente) {
    await db.paiement.update({
      where: { id: enAttente.id },
      data: {
        dateEcheance: facture.prochaineEcheance,
        montantCents: facture.montantCents,
      },
    });
    await synchroniserEcheance("FACTURE", enAttente.id, {
      titre: `Payer : ${facture.libelle}`,
      dateEcheance: facture.prochaineEcheance,
      alerteJoursAvant: 7,
      membreId: facture.payeurId,
    });
  } else {
    await creerOccurrence(facture, facture.prochaineEcheance, facture.montantCents);
  }

  revalidatePath("/factures");
  redirect("/factures");
}

/**
 * Marque une occurrence payée : l'échéance liée passe à FAIT et, pour
 * une facture récurrente active, l'occurrence suivante est générée.
 * Démarquer fait l'inverse et retire l'occurrence auto-générée non payée.
 */
export async function basculerPaiement(formData: FormData): Promise<void> {
  await exigerUtilisateur();
  const paiementId = String(formData.get("paiementId") ?? "");
  const payer = formData.get("payer") === "true";

  const paiement = await db.paiement.findUnique({
    where: { id: paiementId },
    include: { facture: true },
  });
  if (!paiement) return;

  await db.paiement.update({
    where: { id: paiementId },
    data: { statut: payer ? "PAYE" : "A_PAYER", payeLe: payer ? new Date() : null },
  });
  const echeance = await db.echeance.findFirst({
    where: { module: "FACTURE", sourceId: paiementId },
  });
  if (echeance) await basculerEcheanceFaite(echeance.id, payer);

  const suivante = occurrenceSuivante(
    paiement.dateEcheance,
    paiement.facture.recurrence as Recurrence,
  );

  if (payer && suivante && paiement.facture.active) {
    // Ne génère pas de doublon si une occurrence non payée existe déjà.
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

  if (!payer) {
    // Retire l'occurrence suivante auto-générée (non payée) pour éviter
    // un doublon quand on re-marquera celle-ci comme payée.
    const generee = await db.paiement.findFirst({
      where: {
        factureId: paiement.factureId,
        statut: "A_PAYER",
        dateEcheance: { gt: paiement.dateEcheance },
      },
    });
    if (generee) {
      await supprimerEcheances("FACTURE", generee.id);
      await db.paiement.delete({ where: { id: generee.id } });
      await db.facture.update({
        where: { id: paiement.factureId },
        data: { prochaineEcheance: paiement.dateEcheance },
      });
    }
  }

  revalidatePath("/factures");
  revalidatePath("/");
}

export async function supprimerFacture(formData: FormData): Promise<void> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");

  const paiements = await db.paiement.findMany({
    where: { factureId: id },
    select: { id: true },
  });
  for (const p of paiements) await supprimerEcheances("FACTURE", p.id);
  await db.facture.delete({ where: { id } }); // cascade sur les paiements

  revalidatePath("/factures");
  redirect("/factures");
}

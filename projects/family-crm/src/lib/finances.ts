// Logique métier du module Finances : insertion dédupliquée des
// transactions, catégorisation automatique par règles et rapprochement
// avec les occurrences de factures.
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { ajouterJours, dateBruxelles } from "@/lib/dates";
import { marquerPaiementPaye } from "@/lib/factures";
import type { TransactionImportee } from "@/lib/csv";

/** Fenêtre (jours) autour de l'échéance pour rapprocher un paiement. */
const FENETRE_RAPPROCHEMENT_JOURS = 7;

function normaliser(texte: string): string {
  return texte.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Empreinte anti-doublon : deux imports du même mouvement n'en créent qu'un. */
export function empreinteTransaction(
  compteId: string,
  date: Date,
  montantCents: number,
  contrepartie: string | null,
  communication: string | null,
): string {
  return createHash("sha256")
    .update(
      [
        compteId,
        date.toISOString().slice(0, 10),
        montantCents,
        normaliser(contrepartie ?? ""),
        normaliser(communication ?? ""),
      ].join("|"),
    )
    .digest("hex");
}

/** Première règle dont le mot-clé apparaît dans les libellés, sinon A_TRIER. */
export function categoriser(
  contrepartie: string | null,
  communication: string | null,
  regles: { motCle: string; categorie: string }[],
): string {
  const texte = normaliser(`${contrepartie ?? ""} ${communication ?? ""}`);
  for (const regle of regles) {
    if (texte.includes(normaliser(regle.motCle))) return regle.categorie;
  }
  return "A_TRIER";
}

/**
 * Tente de rapprocher une dépense d'une occurrence de facture à payer :
 * même montant, échéance à ±7 jours. Marque alors l'occurrence payée
 * (ce qui génère la suivante et clôt l'échéance du dashboard).
 * Retourne l'id du paiement rapproché, ou null.
 */
async function rapprocherFacture(transaction: {
  montantCents: number;
  date: Date;
}): Promise<{ paiementId: string; categorie: string } | null> {
  if (transaction.montantCents >= 0) return null;

  const paiement = await db.paiement.findFirst({
    where: {
      statut: "A_PAYER",
      montantCents: -transaction.montantCents,
      transaction: null,
      dateEcheance: {
        gte: ajouterJours(transaction.date, -FENETRE_RAPPROCHEMENT_JOURS),
        lte: ajouterJours(transaction.date, FENETRE_RAPPROCHEMENT_JOURS),
      },
    },
    include: { facture: { select: { categorie: true } } },
    orderBy: { dateEcheance: "asc" },
  });
  if (!paiement) return null;

  await marquerPaiementPaye(paiement.id, transaction.date);
  // La transaction hérite de la catégorie de la facture rapprochée.
  return { paiementId: paiement.id, categorie: paiement.facture.categorie };
}

export interface ResultatImport {
  ajoutees: number;
  doublons: number;
  rapprochees: number;
  categorisees: number;
}

/** Insère des transactions (import CSV ou sync PSD2) avec déduplication,
 * catégorisation par règles et rapprochement automatique des factures. */
export async function importerTransactions(
  compteId: string,
  importees: TransactionImportee[],
): Promise<ResultatImport> {
  const regles = await db.regleCategorie.findMany({
    orderBy: { creeLe: "asc" },
  });
  const resultat: ResultatImport = {
    ajoutees: 0,
    doublons: 0,
    rapprochees: 0,
    categorisees: 0,
  };

  for (const t of importees) {
    const date = dateBruxelles(t.date.annee, t.date.mois, t.date.jour, 12);
    const empreinte = empreinteTransaction(
      compteId,
      date,
      t.montantCents,
      t.contrepartie,
      t.communication,
    );

    const existante = await db.transaction.findUnique({ where: { empreinte } });
    if (existante) {
      resultat.doublons++;
      continue;
    }

    const categorie = categoriser(t.contrepartie, t.communication, regles);
    if (categorie !== "A_TRIER") resultat.categorisees++;

    const rapprochement = await rapprocherFacture({
      montantCents: t.montantCents,
      date,
    });
    if (rapprochement) resultat.rapprochees++;

    await db.transaction.create({
      data: {
        compteId,
        date,
        montantCents: t.montantCents,
        contrepartie: t.contrepartie,
        ibanContrepartie: t.ibanContrepartie,
        communication: t.communication,
        // Une transaction rapprochée hérite de la catégorie de sa facture.
        categorie: rapprochement?.categorie ?? categorie,
        paiementId: rapprochement?.paiementId ?? null,
        empreinte,
      },
    });
    resultat.ajoutees++;
  }
  return resultat;
}

/** Réapplique les règles aux transactions encore « À trier ». */
export async function recategoriser(): Promise<number> {
  const regles = await db.regleCategorie.findMany({ orderBy: { creeLe: "asc" } });
  const aTrier = await db.transaction.findMany({ where: { categorie: "A_TRIER" } });
  let modifiees = 0;
  for (const t of aTrier) {
    const categorie = categoriser(t.contrepartie, t.communication, regles);
    if (categorie !== "A_TRIER") {
      await db.transaction.update({ where: { id: t.id }, data: { categorie } });
      modifiees++;
    }
  }
  return modifiees;
}

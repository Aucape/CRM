"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigerParent, exigerUtilisateur } from "@/lib/auth";
import { zBanque, zCategorieTransaction } from "@/lib/constantes";
import { importerTransactions, recategoriser, type ResultatImport } from "@/lib/finances";
import {
  comptesDeRequisition,
  creerRequisition,
  detailsCompte,
  gocardlessConfigure,
  soldeCompte,
  transactionsCompte,
} from "@/lib/gocardless";

export interface EtatFormulaire {
  erreur?: string;
}

// ------------------------------------------------------------------
// Comptes bancaires
// ------------------------------------------------------------------

const zCompte = z.object({
  nom: z.string().trim().min(1, "Le nom du compte est obligatoire."),
  iban: z.string().trim().optional(),
  banque: zBanque,
});

export async function creerCompte(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur();
  const resultat = zCompte.safeParse({
    nom: formData.get("nom"),
    iban: formData.get("iban") ?? undefined,
    banque: formData.get("banque"),
  });
  if (!resultat.success) return { erreur: resultat.error.issues[0].message };
  const d = resultat.data;
  await db.compteBancaire.create({
    data: {
      nom: d.nom,
      iban: d.iban?.replace(/\s/g, "").toUpperCase() || null,
      banque: d.banque,
    },
  });
  revalidatePath("/finances");
  redirect("/finances");
}

export async function supprimerCompte(formData: FormData): Promise<void> {
  await exigerParent();
  const id = String(formData.get("id") ?? "");
  await db.compteBancaire.delete({ where: { id } }); // cascade transactions
  revalidatePath("/finances");
  redirect("/finances");
}

// ------------------------------------------------------------------
// Import CSV (les lignes sont parsées côté client, voir lib/csv.ts)
// ------------------------------------------------------------------

const zTransactionImportee = z.object({
  date: z.object({
    annee: z.number().int().min(1990).max(2100),
    mois: z.number().int().min(1).max(12),
    jour: z.number().int().min(1).max(31),
  }),
  montantCents: z.number().int(),
  contrepartie: z.string().nullable(),
  ibanContrepartie: z.string().nullable(),
  communication: z.string().nullable(),
});

export async function importerCsv(
  compteId: string,
  transactions: unknown,
): Promise<ResultatImport | { erreur: string }> {
  await exigerUtilisateur();
  const compte = await db.compteBancaire.findUnique({ where: { id: compteId } });
  if (!compte) return { erreur: "Compte introuvable." };

  const resultat = z.array(zTransactionImportee).max(5000).safeParse(transactions);
  if (!resultat.success) return { erreur: "Données d'import invalides." };

  const bilan = await importerTransactions(compteId, resultat.data);
  revalidatePath("/finances");
  revalidatePath("/factures");
  revalidatePath("/");
  return bilan;
}

// ------------------------------------------------------------------
// Transactions : catégorie manuelle & règles
// ------------------------------------------------------------------

export async function changerCategorie(formData: FormData): Promise<void> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");
  const categorie = zCategorieTransaction.safeParse(formData.get("categorie"));
  if (!categorie.success) return;

  await db.transaction.update({
    where: { id },
    data: { categorie: categorie.data },
  });

  // Optionnel : créer une règle pour catégoriser pareil à l'avenir.
  const motCle = String(formData.get("creerRegle") ?? "").trim();
  if (motCle) {
    await db.regleCategorie.create({
      data: { motCle, categorie: categorie.data },
    });
    await recategoriser();
  }
  revalidatePath("/finances");
}

export async function supprimerTransaction(formData: FormData): Promise<void> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");
  await db.transaction.delete({ where: { id } });
  revalidatePath("/finances");
}

// ------------------------------------------------------------------
// Connexion bancaire PSD2 (optionnelle — GoCardless Bank Account Data)
// ------------------------------------------------------------------

async function urlBase(): Promise<string> {
  const entetes = await headers();
  const proto = entetes.get("x-forwarded-proto") ?? "http";
  const hote = entetes.get("host") ?? "localhost:3000";
  return `${proto}://${hote}`;
}

/** Démarre le consentement : redirige vers la banque choisie. */
export async function connecterBanque(formData: FormData): Promise<void> {
  await exigerParent();
  if (!gocardlessConfigure()) redirect("/finances/connexion");

  const institutionId = String(formData.get("institutionId") ?? "");
  if (!institutionId) redirect("/finances/connexion");

  const requisition = await creerRequisition(
    institutionId,
    `${await urlBase()}/finances/connexion/retour`,
  );
  // La réquisition est retenue via un compte « en attente » minimal.
  await db.parametre.upsert({
    where: { cle: "requisitionEnCours" },
    update: { valeur: requisition.id },
    create: { cle: "requisitionEnCours", valeur: requisition.id },
  });
  redirect(requisition.link);
}

/** Au retour de la banque : relie les comptes autorisés puis redirige
 * vers /finances (message passé en query string). */
export async function finaliserConnexion(): Promise<void> {
  await exigerParent();
  const parametre = await db.parametre.findUnique({
    where: { cle: "requisitionEnCours" },
  });
  if (!parametre) {
    redirect("/finances?banque=erreur:aucune connexion en cours");
  }

  const requisition = await comptesDeRequisition(parametre.valeur);
  if (requisition.status !== "LN" || requisition.accounts.length === 0) {
    redirect(
      `/finances?banque=erreur:consentement non finalisé (statut ${requisition.status})`,
    );
  }

  let relies = 0;
  for (const externeId of requisition.accounts) {
    const existant = await db.compteBancaire.findFirst({ where: { externeId } });
    if (existant) continue;
    const details = await detailsCompte(externeId);
    await db.compteBancaire.create({
      data: {
        nom: details.name ?? details.ownerName ?? "Compte connecté",
        iban: details.iban ?? null,
        banque: "AUTRE",
        externeId,
        requisitionId: parametre.valeur,
      },
    });
    relies++;
  }
  await db.parametre.delete({ where: { cle: "requisitionEnCours" } });
  revalidatePath("/finances");
  redirect(`/finances?banque=ok:${relies}`);
}

/** Synchronise transactions + soldes de tous les comptes connectés. */
export async function synchroniserBanques(): Promise<void> {
  await exigerUtilisateur();
  const comptes = await db.compteBancaire.findMany({
    where: { externeId: { not: null } },
  });

  for (const compte of comptes) {
    const transactions = await transactionsCompte(compte.externeId!);
    await importerTransactions(compte.id, transactions);
    const solde = await soldeCompte(compte.externeId!);
    if (solde) {
      await db.compteBancaire.update({
        where: { id: compte.id },
        data: { soldeCents: solde.montantCents, soldeDate: solde.date },
      });
    }
  }
  revalidatePath("/finances");
  revalidatePath("/factures");
  revalidatePath("/");
}

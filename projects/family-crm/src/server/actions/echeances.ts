"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { dateBruxelles } from "@/lib/dates";
import { basculerEcheanceFaite } from "@/lib/echeances";

export interface EtatFormulaire {
  erreur?: string;
}

const zEcheance = z.object({
  titre: z.string().trim().min(1, "Le titre est obligatoire."),
  dateEcheance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date est obligatoire."),
  alerteJoursAvant: z.coerce.number().int().min(0).max(365),
  membreId: z.string().optional(),
  notes: z.string().trim().optional(),
});

export async function creerEcheanceManuelle(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur();
  const resultat = zEcheance.safeParse({
    titre: formData.get("titre"),
    dateEcheance: formData.get("dateEcheance"),
    alerteJoursAvant: formData.get("alerteJoursAvant") ?? 14,
    membreId: formData.get("membreId") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!resultat.success) return { erreur: resultat.error.issues[0].message };
  const d = resultat.data;
  const [a, m, j] = d.dateEcheance.split("-").map(Number);

  await db.echeance.create({
    data: {
      titre: d.titre,
      dateEcheance: dateBruxelles(a, m, j),
      module: "MANUEL",
      alerteJoursAvant: d.alerteJoursAvant,
      membreId: d.membreId || null,
      notes: d.notes || null,
    },
  });
  revalidatePath("/echeances");
  revalidatePath("/");
  redirect("/echeances");
}

/**
 * Coche/décoche une échéance. Pour une occurrence de facture, on passe
 * par la logique du module Factures (génération de l'occurrence
 * suivante…) — ici on ne gère que le basculement direct.
 */
export async function basculerEcheance(formData: FormData): Promise<void> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");
  const faite = formData.get("faite") === "true";
  await basculerEcheanceFaite(id, faite);
  revalidatePath("/echeances");
  revalidatePath("/");
}

/** Seules les échéances manuelles se suppriment ici ; les échéances
 * liées disparaissent avec leur objet source. */
export async function supprimerEcheanceManuelle(formData: FormData): Promise<void> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");
  await db.echeance.deleteMany({ where: { id, module: "MANUEL" } });
  revalidatePath("/echeances");
  revalidatePath("/");
}

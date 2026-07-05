"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { zTypeDocument } from "@/lib/constantes";
import { dateBruxelles } from "@/lib/dates";
import { supprimerEcheances, synchroniserEcheance } from "@/lib/echeances";

export interface EtatFormulaire {
  erreur?: string;
}

const zDocument = z.object({
  titre: z.string().trim().min(1, "Le titre est obligatoire."),
  type: zTypeDocument,
  membreId: z.string().optional(),
  numeroReference: z.string().trim().optional(),
  dateEmission: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  dateExpiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  alerteJoursAvant: z.coerce.number().int().min(0).max(365),
  notes: z.string().trim().optional(),
});

function versDate(saisie: string | undefined): Date | null {
  if (!saisie) return null;
  const [a, m, j] = saisie.split("-").map(Number);
  return dateBruxelles(a, m, j);
}

function lireFormulaire(formData: FormData) {
  const resultat = zDocument.safeParse({
    titre: formData.get("titre"),
    type: formData.get("type"),
    membreId: formData.get("membreId") ?? undefined,
    numeroReference: formData.get("numeroReference") ?? undefined,
    dateEmission: formData.get("dateEmission") ?? undefined,
    dateExpiration: formData.get("dateExpiration") ?? undefined,
    alerteJoursAvant: formData.get("alerteJoursAvant") ?? 60,
    notes: formData.get("notes") ?? undefined,
  });
  if (!resultat.success) return { erreur: resultat.error.issues[0].message };
  const d = resultat.data;
  return {
    donnees: {
      titre: d.titre,
      type: d.type,
      membreId: d.membreId || null,
      numeroReference: d.numeroReference || null,
      dateEmission: versDate(d.dateEmission),
      dateExpiration: versDate(d.dateExpiration),
      alerteJoursAvant: d.alerteJoursAvant,
      notes: d.notes || null,
    },
  };
}

/** Matérialise (ou retire) l'échéance d'expiration du document. */
async function synchroniser(doc: {
  id: string;
  titre: string;
  dateExpiration: Date | null;
  alerteJoursAvant: number;
  membreId: string | null;
}) {
  await synchroniserEcheance(
    "DOCUMENT",
    doc.id,
    doc.dateExpiration
      ? {
          titre: doc.titre,
          dateEcheance: doc.dateExpiration,
          alerteJoursAvant: doc.alerteJoursAvant,
          membreId: doc.membreId,
        }
      : null,
  );
}

export async function creerDocument(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur();
  const lu = lireFormulaire(formData);
  if ("erreur" in lu) return { erreur: lu.erreur };

  const doc = await db.document.create({ data: lu.donnees });
  await synchroniser(doc);
  revalidatePath("/documents");
  redirect("/documents");
}

export async function modifierDocument(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");
  const lu = lireFormulaire(formData);
  if ("erreur" in lu) return { erreur: lu.erreur };

  const doc = await db.document.update({ where: { id }, data: lu.donnees });
  await synchroniser(doc);
  revalidatePath("/documents");
  redirect("/documents");
}

export async function supprimerDocument(formData: FormData): Promise<void> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");
  await supprimerEcheances("DOCUMENT", id);
  await db.document.delete({ where: { id } });
  revalidatePath("/documents");
  redirect("/documents");
}

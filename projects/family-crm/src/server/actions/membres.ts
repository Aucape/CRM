"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigerParent, exigerUtilisateur } from "@/lib/auth";
import { dateBruxelles } from "@/lib/dates";

export interface EtatFormulaire {
  erreur?: string;
}

const zMembre = z.object({
  prenom: z.string().trim().min(1, "Le prénom est obligatoire."),
  nom: z.string().trim().optional(),
  dateNaissance: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  couleur: z.string().regex(/^#[0-9a-f]{6}$/i, "Choisissez une couleur."),
  tailleVetements: z.string().trim().optional(),
  pointure: z.string().trim().optional(),
  allergies: z.string().trim().optional(),
  groupeSanguin: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function lireFormulaire(formData: FormData) {
  const resultat = zMembre.safeParse({
    prenom: formData.get("prenom"),
    nom: formData.get("nom") ?? undefined,
    dateNaissance: formData.get("dateNaissance") ?? undefined,
    couleur: formData.get("couleur"),
    tailleVetements: formData.get("tailleVetements") ?? undefined,
    pointure: formData.get("pointure") ?? undefined,
    allergies: formData.get("allergies") ?? undefined,
    groupeSanguin: formData.get("groupeSanguin") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!resultat.success) return { erreur: resultat.error.issues[0].message };

  const d = resultat.data;
  // La date saisie (AAAA-MM-JJ) est un jour « mural » belge → minuit Bruxelles.
  let dateNaissance: Date | null = null;
  if (d.dateNaissance) {
    const [a, m, j] = d.dateNaissance.split("-").map(Number);
    dateNaissance = dateBruxelles(a, m, j);
  }
  return {
    donnees: {
      prenom: d.prenom,
      nom: d.nom || null,
      dateNaissance,
      couleur: d.couleur.toLowerCase(),
      tailleVetements: d.tailleVetements || null,
      pointure: d.pointure || null,
      allergies: d.allergies || null,
      groupeSanguin: d.groupeSanguin || null,
      notes: d.notes || null,
    },
  };
}

export async function creerMembre(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerParent();
  const lu = lireFormulaire(formData);
  if ("erreur" in lu) return { erreur: lu.erreur };

  const membre = await db.membre.create({ data: lu.donnees });
  revalidatePath("/membres");
  redirect(`/membres/${membre.id}`);
}

export async function modifierMembre(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");
  const lu = lireFormulaire(formData);
  if ("erreur" in lu) return { erreur: lu.erreur };

  await db.membre.update({ where: { id }, data: lu.donnees });
  revalidatePath("/membres");
  revalidatePath(`/membres/${id}`);
  redirect(`/membres/${id}`);
}

/**
 * Archive (ou restaure) un membre plutôt que de le supprimer : son
 * historique (paiements, événements, documents) reste intact.
 */
export async function archiverMembre(formData: FormData): Promise<void> {
  await exigerParent();
  const id = String(formData.get("id") ?? "");
  const archive = formData.get("archive") === "true";
  await db.membre.update({ where: { id }, data: { archive } });
  revalidatePath("/membres");
  revalidatePath(`/membres/${id}`);
  redirect("/membres");
}

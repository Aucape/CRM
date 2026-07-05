"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { zCategorieContact } from "@/lib/constantes";

export interface EtatFormulaire {
  erreur?: string;
}

const zContact = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  categorie: zCategorieContact,
  telephone: z.string().trim().optional(),
  email: z.string().trim().email("E-mail invalide.").optional().or(z.literal("")),
  adresse: z.string().trim().optional(),
  tags: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function lireFormulaire(formData: FormData) {
  const resultat = zContact.safeParse({
    nom: formData.get("nom"),
    categorie: formData.get("categorie"),
    telephone: formData.get("telephone") ?? undefined,
    email: formData.get("email") ?? undefined,
    adresse: formData.get("adresse") ?? undefined,
    tags: formData.get("tags") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!resultat.success) return { erreur: resultat.error.issues[0].message };
  const d = resultat.data;
  return {
    donnees: {
      nom: d.nom,
      categorie: d.categorie,
      telephone: d.telephone || null,
      email: d.email || null,
      adresse: d.adresse || null,
      // Tags normalisés : minuscules, séparés par des virgules simples.
      tags: (d.tags ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .join(","),
      notes: d.notes || null,
    },
  };
}

export async function creerContact(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur();
  const lu = lireFormulaire(formData);
  if ("erreur" in lu) return { erreur: lu.erreur };
  await db.contact.create({ data: lu.donnees });
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function modifierContact(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");
  const lu = lireFormulaire(formData);
  if ("erreur" in lu) return { erreur: lu.erreur };
  await db.contact.update({ where: { id }, data: lu.donnees });
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function supprimerContact(formData: FormData): Promise<void> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");
  await db.contact.delete({ where: { id } });
  revalidatePath("/contacts");
  redirect("/contacts");
}

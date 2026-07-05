"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { zRayon } from "@/lib/constantes";

const zArticle = z.object({
  nom: z.string().trim().min(1),
  rayon: zRayon.default("AUTRE"),
  quantite: z.string().trim().optional(),
});

export async function ajouterArticle(formData: FormData): Promise<void> {
  await exigerUtilisateur();
  const resultat = zArticle.safeParse({
    nom: formData.get("nom"),
    rayon: formData.get("rayon") ?? "AUTRE",
    quantite: formData.get("quantite") ?? undefined,
  });
  if (!resultat.success) return;

  const { nom, rayon, quantite } = resultat.data;

  // Si l'article existe déjà (même nom), on le remet sur la liste au
  // lieu de créer un doublon — utile pour les récurrents.
  const existant = await db.articleCourse.findFirst({
    where: { nom: { equals: nom } },
  });
  if (existant) {
    await db.articleCourse.update({
      where: { id: existant.id },
      data: { coche: false, cocheLe: null, ajouteLe: new Date(), rayon, quantite: quantite || existant.quantite },
    });
  } else {
    await db.articleCourse.create({
      data: { nom, rayon, quantite: quantite || null },
    });
  }
  revalidatePath("/courses");
}

export async function basculerArticle(id: string, coche: boolean): Promise<void> {
  await exigerUtilisateur();
  await db.articleCourse.update({
    where: { id },
    data: { coche, cocheLe: coche ? new Date() : null },
  });
  revalidatePath("/courses");
}

export async function basculerRecurrent(id: string, recurrent: boolean): Promise<void> {
  await exigerUtilisateur();
  await db.articleCourse.update({ where: { id }, data: { recurrent } });
  revalidatePath("/courses");
}

export async function supprimerArticle(id: string): Promise<void> {
  await exigerUtilisateur();
  await db.articleCourse.delete({ where: { id } });
  revalidatePath("/courses");
}

/** Remet un article récurrent (déjà acheté) sur la liste, en un clic. */
export async function reAjouterArticle(id: string): Promise<void> {
  await exigerUtilisateur();
  await db.articleCourse.update({
    where: { id },
    data: { coche: false, cocheLe: null, ajouteLe: new Date() },
  });
  revalidatePath("/courses");
}

/**
 * Fin des courses : les articles cochés ponctuels sont supprimés ; les
 * récurrents restent stockés (cochés) pour être ré-ajoutés en un clic.
 */
export async function terminerCourses(): Promise<void> {
  await exigerUtilisateur();
  await db.articleCourse.deleteMany({ where: { coche: true, recurrent: false } });
  revalidatePath("/courses");
}

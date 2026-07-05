"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { dateBruxelles } from "@/lib/dates";

export interface EtatFormulaire {
  erreur?: string;
}

const RRULES_AUTORISEES = [
  "",
  "FREQ=DAILY",
  "FREQ=WEEKLY",
  "FREQ=WEEKLY;INTERVAL=2",
  "FREQ=MONTHLY",
  "FREQ=YEARLY",
] as const;

const zEvenement = z.object({
  titre: z.string().trim().min(1, "Le titre est obligatoire."),
  lieu: z.string().trim().optional(),
  description: z.string().trim().optional(),
  journeeEntiere: z.boolean(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date est obligatoire."),
  dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  rrule: z.enum(RRULES_AUTORISEES),
  membreIds: z.array(z.string()),
});

function lireFormulaire(formData: FormData) {
  const resultat = zEvenement.safeParse({
    titre: formData.get("titre"),
    lieu: formData.get("lieu") ?? undefined,
    description: formData.get("description") ?? undefined,
    journeeEntiere: formData.get("journeeEntiere") === "on",
    date: formData.get("date"),
    dateFin: formData.get("dateFin") ?? undefined,
    heureDebut: formData.get("heureDebut") ?? undefined,
    heureFin: formData.get("heureFin") ?? undefined,
    rrule: formData.get("rrule") ?? "",
    membreIds: formData.getAll("membreIds").map(String),
  });
  if (!resultat.success) return { erreur: resultat.error.issues[0].message };
  const d = resultat.data;

  const [a, m, j] = d.date.split("-").map(Number);
  let debut: Date;
  let fin: Date;

  if (d.journeeEntiere) {
    debut = dateBruxelles(a, m, j);
    if (d.dateFin) {
      const [af, mf, jf] = d.dateFin.split("-").map(Number);
      fin = dateBruxelles(af, mf, jf + 1); // DTEND exclusif
    } else {
      fin = dateBruxelles(a, m, j + 1);
    }
    if (fin <= debut) return { erreur: "La date de fin précède le début." };
  } else {
    if (!d.heureDebut || !d.heureFin) {
      return { erreur: "Indiquez l'heure de début et de fin." };
    }
    const [hd, md] = d.heureDebut.split(":").map(Number);
    const [hf, mf] = d.heureFin.split(":").map(Number);
    debut = dateBruxelles(a, m, j, hd, md);
    fin = dateBruxelles(a, m, j, hf, mf);
    // Fin avant le début = événement qui déborde sur le lendemain.
    if (fin <= debut) fin = dateBruxelles(a, m, j + 1, hf, mf);
  }

  return {
    donnees: {
      titre: d.titre,
      lieu: d.lieu || null,
      description: d.description || null,
      journeeEntiere: d.journeeEntiere,
      debut,
      fin,
      rrule: d.rrule || null,
    },
    membreIds: d.membreIds,
  };
}

export async function creerEvenement(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur();
  const lu = lireFormulaire(formData);
  if ("erreur" in lu) return { erreur: lu.erreur };

  await db.evenement.create({
    data: {
      ...lu.donnees,
      membres: { create: lu.membreIds.map((membreId) => ({ membreId })) },
    },
  });
  revalidatePath("/calendrier");
  redirect("/calendrier");
}

export async function modifierEvenement(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");
  const lu = lireFormulaire(formData);
  if ("erreur" in lu) return { erreur: lu.erreur };

  await db.evenement.update({
    where: { id },
    data: {
      ...lu.donnees,
      membres: {
        deleteMany: {},
        create: lu.membreIds.map((membreId) => ({ membreId })),
      },
    },
  });
  revalidatePath("/calendrier");
  redirect(`/calendrier/${id}`);
}

export async function supprimerEvenement(formData: FormData): Promise<void> {
  await exigerUtilisateur();
  const id = String(formData.get("id") ?? "");
  await db.evenement.delete({ where: { id } });
  revalidatePath("/calendrier");
  redirect("/calendrier");
}

/**
 * Régénère le jeton d'un flux (révoque l'ancienne URL secrète) ou crée
 * le flux s'il n'existe pas encore (membreId vide = flux famille).
 */
export async function regenererJeton(formData: FormData): Promise<void> {
  await exigerUtilisateur();
  const membreId = String(formData.get("membreId") ?? "") || null;
  const jeton = randomBytes(24).toString("base64url");

  const existant = await db.fluxCalendrier.findFirst({ where: { membreId } });
  if (existant) {
    await db.fluxCalendrier.update({ where: { id: existant.id }, data: { jeton } });
  } else {
    await db.fluxCalendrier.create({ data: { jeton, membreId } });
  }
  revalidatePath("/calendrier/abonnements");
}

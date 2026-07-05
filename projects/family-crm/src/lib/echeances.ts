// Service central des échéances — la colonne vertébrale de l'app.
//
// Chaque module matérialise ses dates importantes dans la table
// Echeance via ces fonctions ; le dashboard et les alertes ne lisent
// que cette table. Une échéance liée porte (module, sourceId) vers son
// objet d'origine et est resynchronisée quand celui-ci change.
import { db } from "@/lib/db";
import type { ModuleEcheance } from "@/lib/constantes";
import { joursRestants } from "@/lib/dates";

export interface EcheanceLiee {
  titre: string;
  dateEcheance: Date;
  alerteJoursAvant: number;
  membreId?: string | null;
  notes?: string | null;
}

/**
 * Crée ou met à jour l'échéance liée à un objet source (une par couple
 * module+sourceId). Passer `null` en données supprime l'échéance —
 * utilisé quand la source perd sa date (ex. document sans expiration).
 */
export async function synchroniserEcheance(
  module: ModuleEcheance,
  sourceId: string,
  donnees: EcheanceLiee | null,
): Promise<void> {
  const existante = await db.echeance.findFirst({
    where: { module, sourceId },
  });

  if (!donnees) {
    if (existante) await db.echeance.delete({ where: { id: existante.id } });
    return;
  }

  if (existante) {
    await db.echeance.update({
      where: { id: existante.id },
      data: {
        titre: donnees.titre,
        dateEcheance: donnees.dateEcheance,
        alerteJoursAvant: donnees.alerteJoursAvant,
        membreId: donnees.membreId ?? null,
        notes: donnees.notes ?? null,
      },
    });
  } else {
    await db.echeance.create({
      data: {
        module,
        sourceId,
        titre: donnees.titre,
        dateEcheance: donnees.dateEcheance,
        alerteJoursAvant: donnees.alerteJoursAvant,
        membreId: donnees.membreId ?? null,
        notes: donnees.notes ?? null,
      },
    });
  }
}

/** Supprime les échéances liées à un objet source (à sa suppression). */
export async function supprimerEcheances(
  module: ModuleEcheance,
  sourceId: string,
): Promise<void> {
  await db.echeance.deleteMany({ where: { module, sourceId } });
}

/** Marque une échéance comme faite (ou la rouvre). */
export async function basculerEcheanceFaite(
  id: string,
  faite: boolean,
): Promise<void> {
  await db.echeance.update({
    where: { id },
    data: { statut: faite ? "FAIT" : "A_VENIR", faitLe: faite ? new Date() : null },
  });
}

// ------------------------------------------------------------------
// Lecture : statut affiché (EN_RETARD calculé, jamais stocké)
// ------------------------------------------------------------------

export type StatutAffiche = "A_VENIR" | "EN_ALERTE" | "EN_RETARD" | "FAIT";

export function statutAffiche(
  e: { dateEcheance: Date; statut: string; alerteJoursAvant: number },
  maintenant = new Date(),
): StatutAffiche {
  if (e.statut === "FAIT") return "FAIT";
  const jours = joursRestants(e.dateEcheance, maintenant);
  if (jours < 0) return "EN_RETARD";
  if (jours <= e.alerteJoursAvant) return "EN_ALERTE";
  return "A_VENIR";
}

/**
 * Échéances non faites dont la fenêtre d'alerte est ouverte ou dépassée,
 * triées par date — ce que le dashboard affiche en premier.
 */
export async function echeancesEnAlerte(maintenant = new Date()) {
  const aVenir = await db.echeance.findMany({
    where: { statut: "A_VENIR" },
    include: { membre: true },
    orderBy: { dateEcheance: "asc" },
  });
  return aVenir.filter((e) => statutAffiche(e, maintenant) !== "A_VENIR");
}

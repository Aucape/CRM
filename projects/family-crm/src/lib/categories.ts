// Catégories de dépenses : les intégrées (constantes.ts) + celles
// créées par la famille (table CategorieDepense), fusionnées pour les
// sélecteurs, filtres et graphiques du module Finances.
import { db } from "@/lib/db";
import {
  CATEGORIES_TRANSACTION,
  LIBELLES_CATEGORIE_TRANSACTION,
  type CategorieTransaction,
} from "@/lib/constantes";

export interface CategorieDef {
  cle: string;
  libelle: string;
  perso: boolean;
}

/** Liste fusionnée : intégrées d'abord, puis personnalisées (A-Z). */
export async function listerCategories(): Promise<CategorieDef[]> {
  const persos = await db.categorieDepense.findMany({
    orderBy: { libelle: "asc" },
  });
  return [
    ...CATEGORIES_TRANSACTION.map((c) => ({
      cle: c as string,
      libelle: LIBELLES_CATEGORIE_TRANSACTION[c as CategorieTransaction],
      perso: false,
    })),
    ...persos.map((c) => ({ cle: c.cle, libelle: c.libelle, perso: true })),
  ];
}

/** cle → libelle (une clé inconnue est affichée telle quelle). */
export function libellesParCle(categories: CategorieDef[]): Map<string, string> {
  return new Map(categories.map((c) => [c.cle, c.libelle]));
}

/** La clé est-elle une catégorie valide (intégrée ou personnalisée) ? */
export async function categorieValide(cle: string): Promise<boolean> {
  if (CATEGORIES_TRANSACTION.includes(cle as CategorieTransaction)) return true;
  return Boolean(await db.categorieDepense.findUnique({ where: { cle } }));
}

/** « Frais d'école » → « FRAIS_D_ECOLE ». */
export function slugifierCategorie(libelle: string): string {
  return libelle
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

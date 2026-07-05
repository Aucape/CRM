// Calculs de récurrence des factures et normalisation budgétaire.
import { MOIS_PAR_RECURRENCE, type Recurrence } from "@/lib/constantes";
import { ajouterMois } from "@/lib/dates";

/**
 * Date de l'occurrence suivant `date`, ou null si la facture est unique.
 * Le jour est conservé en calendrier bruxellois (31 → borné au dernier
 * jour du mois cible).
 */
export function occurrenceSuivante(
  date: Date,
  recurrence: Recurrence,
): Date | null {
  const mois = MOIS_PAR_RECURRENCE[recurrence];
  if (mois === 0) return null;
  return ajouterMois(date, mois);
}

/**
 * Coût mensuel lissé d'une facture récurrente, en centimes — la base de
 * la vue « budget mensuel ». Une facture unique ne pèse pas sur le
 * budget récurrent.
 */
export function coutMensuelCents(
  montantCents: number,
  recurrence: Recurrence,
): number {
  const mois = MOIS_PAR_RECURRENCE[recurrence];
  if (mois === 0) return 0;
  return Math.round(montantCents / mois);
}

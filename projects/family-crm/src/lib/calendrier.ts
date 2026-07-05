// Expansion des événements récurrents pour l'affichage dans l'app.
// Sous-ensemble de RRULE géré : FREQ=DAILY|WEEKLY|MONTHLY|YEARLY avec
// INTERVAL et UNTIL optionnels — suffisant pour un agenda familial.
// (Le flux ICS transmet la RRULE brute : Apple Calendar fait sa propre
// expansion, y compris pour des règles plus complexes.)
import { ajouterJours, ajouterMois } from "@/lib/dates";

export interface Occurrence<E> {
  evenement: E;
  debut: Date;
  fin: Date;
}

interface RegleSimple {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  until?: Date;
}

function parserRrule(rrule: string): RegleSimple | null {
  const parties = new Map(
    rrule.split(";").map((p) => p.split("=") as [string, string]),
  );
  const freq = parties.get("FREQ");
  if (
    freq !== "DAILY" &&
    freq !== "WEEKLY" &&
    freq !== "MONTHLY" &&
    freq !== "YEARLY"
  ) {
    return null;
  }
  let until: Date | undefined;
  const untilBrut = parties.get("UNTIL");
  if (untilBrut) {
    const m = untilBrut.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) until = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59));
  }
  return {
    freq,
    interval: Math.max(1, Number(parties.get("INTERVAL") ?? 1)),
    until,
  };
}

function pasSuivant(debut: Date, regle: RegleSimple): Date {
  switch (regle.freq) {
    case "DAILY":
      return ajouterJours(debut, regle.interval);
    case "WEEKLY":
      return ajouterJours(debut, 7 * regle.interval);
    case "MONTHLY":
      return ajouterMois(debut, regle.interval);
    case "YEARLY":
      return ajouterMois(debut, 12 * regle.interval);
  }
}

const MAX_OCCURRENCES = 400; // garde-fou

/**
 * Occurrences d'un événement (récurrent ou non) chevauchant la plage
 * [debutPlage, finPlage), triées par date de début.
 */
export function occurrencesDansPlage<
  E extends { debut: Date; fin: Date; rrule?: string | null },
>(evenement: E, debutPlage: Date, finPlage: Date): Occurrence<E>[] {
  const duree = evenement.fin.getTime() - evenement.debut.getTime();
  const regle = evenement.rrule ? parserRrule(evenement.rrule) : null;

  if (!regle) {
    const visible =
      evenement.debut < finPlage && evenement.fin > debutPlage;
    return visible
      ? [{ evenement, debut: evenement.debut, fin: evenement.fin }]
      : [];
  }

  const occurrences: Occurrence<E>[] = [];
  let debut = evenement.debut;
  for (let i = 0; i < MAX_OCCURRENCES && debut < finPlage; i++) {
    if (regle.until && debut > regle.until) break;
    const fin = new Date(debut.getTime() + duree);
    if (fin > debutPlage) occurrences.push({ evenement, debut, fin });
    debut = pasSuivant(debut, regle);
  }
  return occurrences;
}

/** Occurrences de plusieurs événements dans la plage, triées. */
export function toutesOccurrences<
  E extends { debut: Date; fin: Date; rrule?: string | null },
>(evenements: E[], debutPlage: Date, finPlage: Date): Occurrence<E>[] {
  return evenements
    .flatMap((e) => occurrencesDansPlage(e, debutPlage, finPlage))
    .sort((a, b) => a.debut.getTime() - b.debut.getTime());
}

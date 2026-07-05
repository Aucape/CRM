// Formatage des dates et montants pour la Belgique : fr-BE, JJ/MM/AAAA,
// euros, fuseau Europe/Brussels. Toutes les dates sont stockées en UTC.

export const FUSEAU = "Europe/Brussels";

const fmtDate = new Intl.DateTimeFormat("fr-BE", {
  timeZone: FUSEAU,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const fmtDateLongue = new Intl.DateTimeFormat("fr-BE", {
  timeZone: FUSEAU,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const fmtHeure = new Intl.DateTimeFormat("fr-BE", {
  timeZone: FUSEAU,
  hour: "2-digit",
  minute: "2-digit",
});

const fmtEuros = new Intl.NumberFormat("fr-BE", {
  style: "currency",
  currency: "EUR",
});

/** « 05/07/2026 » */
export function formaterDate(d: Date): string {
  return fmtDate.format(d);
}

/** « dimanche 5 juillet » */
export function formaterDateLongue(d: Date): string {
  return fmtDateLongue.format(d);
}

/** « 14:30 » */
export function formaterHeure(d: Date): string {
  return fmtHeure.format(d);
}

/** 12345 centimes → « 123,45 € » */
export function formaterEuros(cents: number): string {
  return fmtEuros.format(cents / 100);
}

/** « 123,45 € » ou « 123,45 » → centimes. Accepte virgule ou point. */
export function parserEuros(saisie: string): number {
  const nettoye = saisie.replace(/[€\s]/g, "").replace(",", ".");
  const valeur = Number(nettoye);
  if (Number.isNaN(valeur)) throw new Error(`Montant invalide : ${saisie}`);
  return Math.round(valeur * 100);
}

/**
 * Composants année/mois/jour/heure/minute d'un instant UTC, vus depuis
 * Bruxelles. Sert de base à tous les calculs « quel jour est-on ? ».
 */
export function composantsBruxelles(d: Date): {
  annee: number;
  mois: number; // 1-12
  jour: number;
  heure: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("fr-BE", {
    timeZone: FUSEAU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    annee: get("year"),
    mois: get("month"),
    jour: get("day"),
    heure: get("hour"),
    minute: get("minute"),
  };
}

/** Décalage (ms) entre UTC et Bruxelles à l'instant donné (UTC+1 ou UTC+2). */
function decalageBruxelles(d: Date): number {
  const c = composantsBruxelles(d);
  const commeUtc = Date.UTC(c.annee, c.mois - 1, c.jour, c.heure, c.minute);
  const minuteUtc = Math.floor(d.getTime() / 60000) * 60000;
  return commeUtc - minuteUtc;
}

/**
 * Construit l'instant UTC correspondant à une date/heure « murale » de
 * Bruxelles (ex. le 05/07/2026 à 14:30 heure belge).
 */
export function dateBruxelles(
  annee: number,
  mois: number, // 1-12
  jour: number,
  heure = 0,
  minute = 0,
): Date {
  const approx = new Date(Date.UTC(annee, mois - 1, jour, heure, minute));
  // Deux passes pour les jours de changement d'heure.
  let resultat = new Date(approx.getTime() - decalageBruxelles(approx));
  resultat = new Date(approx.getTime() - decalageBruxelles(resultat));
  return resultat;
}

/** Minuit à Bruxelles du jour contenant l'instant donné. */
export function debutJourBruxelles(d: Date): Date {
  const c = composantsBruxelles(d);
  return dateBruxelles(c.annee, c.mois, c.jour);
}

/** Ajoute n jours en conservant l'heure murale bruxelloise. */
export function ajouterJours(d: Date, n: number): Date {
  const c = composantsBruxelles(d);
  return dateBruxelles(c.annee, c.mois, c.jour + n, c.heure, c.minute);
}

/**
 * Ajoute n mois en heure murale bruxelloise, en bornant au dernier jour
 * du mois cible (31 janvier + 1 mois → 28/29 février).
 */
export function ajouterMois(d: Date, n: number): Date {
  const c = composantsBruxelles(d);
  const moisCible = c.mois - 1 + n;
  const dernierJour = new Date(
    Date.UTC(c.annee, moisCible + 1, 0),
  ).getUTCDate();
  return dateBruxelles(
    c.annee,
    moisCible + 1,
    Math.min(c.jour, dernierJour),
    c.heure,
    c.minute,
  );
}

/** Lundi 00:00 (Bruxelles) de la semaine contenant l'instant donné. */
export function debutSemaineBruxelles(d: Date): Date {
  const c = composantsBruxelles(d);
  // Jour de semaine du jour bruxellois (0 = dimanche … 6 = samedi).
  const js = new Date(Date.UTC(c.annee, c.mois - 1, c.jour)).getUTCDay();
  const versLundi = js === 0 ? -6 : 1 - js;
  return dateBruxelles(c.annee, c.mois, c.jour + versLundi);
}

/** Premier jour 00:00 (Bruxelles) du mois contenant l'instant donné. */
export function debutMoisBruxelles(d: Date): Date {
  const c = composantsBruxelles(d);
  return dateBruxelles(c.annee, c.mois, 1);
}

/** Nombre de jours (calendrier bruxellois) entre aujourd'hui et la date. */
export function joursRestants(d: Date, maintenant = new Date()): number {
  const debut = debutJourBruxelles(maintenant).getTime();
  const cible = debutJourBruxelles(d).getTime();
  return Math.round((cible - debut) / 86_400_000);
}

/** Âge en années révolues, calculé en calendrier bruxellois. */
export function calculerAge(naissance: Date, maintenant = new Date()): number {
  const n = composantsBruxelles(naissance);
  const m = composantsBruxelles(maintenant);
  let age = m.annee - n.annee;
  if (m.mois < n.mois || (m.mois === n.mois && m.jour < n.jour)) age--;
  return age;
}

/** Date → valeur d'un <input type="date"> (jour mural bruxellois). */
export function versInputDate(d: Date | null): string {
  if (!d) return "";
  const c = composantsBruxelles(d);
  return `${c.annee}-${String(c.mois).padStart(2, "0")}-${String(c.jour).padStart(2, "0")}`;
}

/** Date → valeur d'un <input type="time"> (heure murale bruxelloise). */
export function versInputHeure(d: Date | null): string {
  if (!d) return "";
  const c = composantsBruxelles(d);
  return `${String(c.heure).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;
}

/** « aujourd'hui », « demain », « dans 5 j », « il y a 3 j ». */
export function libelleRelatif(d: Date, maintenant = new Date()): string {
  const jours = joursRestants(d, maintenant);
  if (jours === 0) return "aujourd'hui";
  if (jours === 1) return "demain";
  if (jours === -1) return "hier";
  if (jours > 1) return `dans ${jours} j`;
  return `il y a ${-jours} j`;
}

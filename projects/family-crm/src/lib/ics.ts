// Génération d'un flux iCalendar (RFC 5545) compatible Apple Calendar.
// Les heures sont émises en heure locale Europe/Brussels avec le
// VTIMEZONE correspondant ; les événements « journée entière » en DATE.
import { composantsBruxelles } from "@/lib/dates";

interface EvenementIcs {
  uid: string;
  titre: string;
  description?: string | null;
  lieu?: string | null;
  debut: Date;
  fin: Date;
  journeeEntiere: boolean;
  rrule?: string | null;
  modifieLe: Date;
}

/** Échappe texte pour les propriétés iCalendar (RFC 5545 §3.3.11). */
function echapper(texte: string): string {
  return texte
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Plie les lignes à 75 octets (continuation par espace, RFC 5545 §3.1). */
function plier(ligne: string): string {
  const octets = Buffer.from(ligne, "utf8");
  if (octets.length <= 75) return ligne;
  const morceaux: string[] = [];
  let debut = 0;
  while (debut < octets.length) {
    let fin = Math.min(debut + (debut === 0 ? 75 : 74), octets.length);
    // Ne pas couper au milieu d'un caractère UTF-8 (octets de continuation 10xxxxxx).
    while (fin < octets.length && (octets[fin] & 0b1100_0000) === 0b1000_0000) fin--;
    morceaux.push(octets.subarray(debut, fin).toString("utf8"));
    debut = fin;
  }
  return morceaux.join("\r\n ");
}

/** Date+heure murale bruxelloise au format 20260705T143000. */
function horodatageLocal(d: Date): string {
  const c = composantsBruxelles(d);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(c.annee, 4)}${p(c.mois)}${p(c.jour)}T${p(c.heure)}${p(c.minute)}00`;
}

/** Jour mural bruxellois au format 20260705 (événements journée entière). */
function dateLocale(d: Date): string {
  const c = composantsBruxelles(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${String(c.annee).padStart(4, "0")}${p(c.mois)}${p(c.jour)}`;
}

/** Instant UTC au format 20260705T123000Z (DTSTAMP). */
function horodatageUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Définition standard du fuseau Europe/Brussels (CET/CEST).
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Brussels",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function genererIcs(
  nomCalendrier: string,
  evenements: EvenementIcs[],
): string {
  const lignes: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CRM Familial//Calendrier//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${echapper(nomCalendrier)}`,
    "X-WR-TIMEZONE:Europe/Brussels",
    ...VTIMEZONE,
  ];

  for (const e of evenements) {
    lignes.push("BEGIN:VEVENT");
    lignes.push(`UID:${e.uid}@crm-familial`);
    lignes.push(`DTSTAMP:${horodatageUtc(e.modifieLe)}`);
    if (e.journeeEntiere) {
      lignes.push(`DTSTART;VALUE=DATE:${dateLocale(e.debut)}`);
      lignes.push(`DTEND;VALUE=DATE:${dateLocale(e.fin)}`);
    } else {
      lignes.push(`DTSTART;TZID=Europe/Brussels:${horodatageLocal(e.debut)}`);
      lignes.push(`DTEND;TZID=Europe/Brussels:${horodatageLocal(e.fin)}`);
    }
    lignes.push(`SUMMARY:${echapper(e.titre)}`);
    if (e.lieu) lignes.push(`LOCATION:${echapper(e.lieu)}`);
    if (e.description) lignes.push(`DESCRIPTION:${echapper(e.description)}`);
    if (e.rrule) lignes.push(`RRULE:${e.rrule}`);
    lignes.push("END:VEVENT");
  }

  lignes.push("END:VCALENDAR");
  return lignes.map(plier).join("\r\n") + "\r\n";
}

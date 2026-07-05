// Parseur CSV universel pour les exports bancaires belges (Belfius,
// KBC, ING, BNP Paribas Fortis, Argenta…). Plutôt que de figer le
// format de chaque banque, on parse le fichier puis on devine le rôle
// des colonnes par leurs en-têtes — l'utilisateur peut corriger le
// mapping avant l'import. Utilisable côté client comme côté serveur.

export interface CsvParse {
  entetes: string[];
  lignes: string[][];
}

/** Détecte le séparateur le plus probable (les banques belges utilisent « ; »). */
function detecterSeparateur(texte: string): string {
  const premiereLigne = texte.slice(0, texte.indexOf("\n"));
  const compte = (c: string) => premiereLigne.split(c).length;
  const candidats = [";", ",", "\t"];
  return candidats.reduce((a, b) => (compte(a) >= compte(b) ? a : b));
}

/** Parse un CSV avec guillemets et champs multi-lignes (RFC 4180 souple). */
export function parserCsv(texte: string): CsvParse {
  const contenu = texte.replace(/^﻿/, ""); // BOM Excel
  const sep = detecterSeparateur(contenu);
  const lignes: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let entreGuillemets = false;

  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (contenu[i + 1] === '"') {
          champ += '"';
          i++;
        } else {
          entreGuillemets = false;
        }
      } else {
        champ += c;
      }
    } else if (c === '"') {
      entreGuillemets = true;
    } else if (c === sep) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && contenu[i + 1] === "\n") i++;
      ligne.push(champ);
      champ = "";
      if (ligne.some((v) => v.trim() !== "")) lignes.push(ligne);
      ligne = [];
    } else {
      champ += c;
    }
  }
  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    if (ligne.some((v) => v.trim() !== "")) lignes.push(ligne);
  }

  if (lignes.length === 0) return { entetes: [], lignes: [] };
  const [entetes, ...donnees] = lignes;
  return {
    entetes: entetes.map((e) => e.trim()),
    // Ignore les lignes de longueur incohérente (pieds de page, totaux).
    lignes: donnees.filter((l) => l.length === entetes.length),
  };
}

// ------------------------------------------------------------------
// Devinette du rôle des colonnes à partir des en-têtes
// ------------------------------------------------------------------

export interface MappingColonnes {
  date: number;
  montant: number;
  contrepartie: number | null;
  ibanContrepartie: number | null;
  communication: number | null;
}

function chercher(entetes: string[], motsCles: string[]): number | null {
  const normalises = entetes.map((e) =>
    e.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""),
  );
  for (const mot of motsCles) {
    const i = normalises.findIndex((e) => e.includes(mot));
    if (i !== -1) return i;
  }
  return null;
}

/** Propose un mapping en fonction des en-têtes (corrigeable par l'utilisateur). */
export function devinerMapping(entetes: string[]): MappingColonnes {
  return {
    // « date valeur » prioritaire sur « date de comptabilisation »
    date: chercher(entetes, ["date valeur", "valutadatum", "date"]) ?? 0,
    montant: chercher(entetes, ["montant", "bedrag", "amount"]) ?? 1,
    contrepartie:
      chercher(entetes, [
        "nom contrepartie",
        "nom de la contrepartie",
        "contrepartie",
        "naam tegenpartij",
        "tegenpartij",
        "nom",
      ]) ?? null,
    ibanContrepartie:
      chercher(entetes, [
        "compte contrepartie",
        "compte partie adverse",
        "rekening tegenpartij",
        "iban",
      ]) ?? null,
    communication:
      chercher(entetes, [
        "communication",
        "mededeling",
        "libelle",
        "description",
        "detail",
        "transaction",
      ]) ?? null,
  };
}

// ------------------------------------------------------------------
// Normalisation des valeurs belges
// ------------------------------------------------------------------

/** « 1.234,56 », « -12,30 », « 1234.56 » → centimes. NaN si illisible. */
export function parserMontantBelge(brut: string): number {
  let s = brut.trim().replace(/\s|€/g, "");
  if (!s) return NaN;
  const virgule = s.lastIndexOf(",");
  const point = s.lastIndexOf(".");
  if (virgule > point) {
    s = s.replace(/\./g, "").replace(",", "."); // 1.234,56
  } else if (point > virgule) {
    s = s.replace(/,/g, ""); // 1,234.56
  }
  const valeur = Number(s);
  return Number.isNaN(valeur) ? NaN : Math.round(valeur * 100);
}

/** « 05/07/2026 », « 05-07-2026 », « 2026-07-05 » → {annee, mois, jour}. */
export function parserDateBelge(
  brut: string,
): { annee: number; mois: number; jour: number } | null {
  const s = brut.trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return { jour: +m[1], mois: +m[2], annee: +m[3] };
  m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (m) return { annee: +m[1], mois: +m[2], jour: +m[3] };
  return null;
}

export interface TransactionImportee {
  date: { annee: number; mois: number; jour: number };
  montantCents: number;
  contrepartie: string | null;
  ibanContrepartie: string | null;
  communication: string | null;
}

/** Applique le mapping aux lignes ; ignore les lignes illisibles. */
export function extraireTransactions(
  parse: CsvParse,
  mapping: MappingColonnes,
): { transactions: TransactionImportee[]; ignorees: number } {
  const transactions: TransactionImportee[] = [];
  let ignorees = 0;
  for (const ligne of parse.lignes) {
    const date = parserDateBelge(ligne[mapping.date] ?? "");
    const montantCents = parserMontantBelge(ligne[mapping.montant] ?? "");
    if (!date || Number.isNaN(montantCents)) {
      ignorees++;
      continue;
    }
    const lire = (i: number | null) =>
      i === null ? null : (ligne[i] ?? "").trim() || null;
    transactions.push({
      date,
      montantCents,
      contrepartie: lire(mapping.contrepartie),
      ibanContrepartie: lire(mapping.ibanContrepartie),
      communication: lire(mapping.communication),
    });
  }
  return { transactions, ignorees };
}

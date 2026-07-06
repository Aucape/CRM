// Modèle joueur : génération, note globale, valeur, salaire, progression, vieillissement.
// Module pur — aucune dépendance UI.

import { BALANCE } from '../config.js';
import { rand, randInt, randFloat, randGauss, clamp, pick } from './rng.js';
import { genNomJoueur } from './names.js';

const ATTRS = ['att', 'tec', 'def', 'phy', 'vit', 'men'];
export const POSTES = ['G', 'DEF', 'MIL', 'ATT'];

let NEXT_ID = 1;
export function resetIds(start = 1) { NEXT_ID = start; }
export function peekNextId() { return NEXT_ID; }

// ---------------------------------------------------------------------------
// Note globale pondérée par poste
// ---------------------------------------------------------------------------
export function noteGlobale(p, poste = p.poste) {
  const w = BALANCE.poidsPoste[poste];
  let n = 0;
  n += p.attrs.att * w.att + p.attrs.tec * w.tec + p.attrs.def * w.def;
  n += p.attrs.phy * w.phy + p.attrs.vit * w.vit + p.attrs.men * w.men;
  n += p.attrs.gb * w.gb;
  return Math.round(n * 10) / 10;
}

// forme = moyenne des 5 dernières notes de match (défaut 6.0)
export function forme(p) {
  if (!p.formeNotes.length) return BALANCE.condition.formeNeutre;
  return p.formeNotes.reduce((a, b) => a + b, 0) / p.formeNotes.length;
}

// note "du jour" : globale × forme × moral × fatigue
export function noteEffective(p, poste = p.poste) {
  const f = forme(p);
  const factForme = 0.92 + (clamp(f, 3, 9) - 6) * 0.025;         // ±~7 %
  const factMoral = 0.95 + (p.moral / 100) * 0.10;               // 0.95 → 1.05
  const factFatigue = 1 - (p.fatigue / 100) * BALANCE.condition.fatigueMaxPerf;
  return noteGlobale(p, poste) * factForme * factMoral * factFatigue;
}

// ---------------------------------------------------------------------------
// Valeur marchande et salaire
// ---------------------------------------------------------------------------
export function valeurMarchande(p) {
  const b = BALANCE.salaires;
  const note = noteGlobale(p);
  let v = Math.exp(note / b.valeurExpDiv) * b.valeurBase;
  // facteur âge : les jeunes à potentiel valent plus, les vieux moins
  let fAge = 1;
  if (p.age <= 21) fAge = 1.3;
  else if (p.age <= 25) fAge = 1.15;
  else if (p.age >= 30) fAge = Math.max(0.25, 1 - (p.age - 29) * 0.18);
  // facteur potentiel (marge restante)
  const marge = Math.max(0, p.potentiel - note);
  const fPot = 1 + Math.min(0.8, marge * 0.025);
  return Math.round(v * fAge * fPot / 1000) * 1000;
}

export function salaireDemande(p) {
  const b = BALANCE.salaires;
  const note = noteGlobale(p);
  let s = Math.exp(note / b.joueurExpDiv) * b.joueurBase;
  if (p.age <= 18) s *= 0.5;
  else if (p.age <= 21) s *= 0.75;
  return Math.round(s / 50) * 50;
}

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------
function distribuerAttrs(game, p, cible) {
  // répartit les attributs autour de la note cible, orientés par le poste
  const w = BALANCE.poidsPoste[p.poste];
  for (const a of ATTRS) {
    const orient = (w[a] - 0.15) * 30;                 // les attributs clés du poste sont plus hauts
    p.attrs[a] = clamp(Math.round(cible + orient + randGauss(game) * 6), 5, 99);
  }
  if (p.poste === 'G') {
    p.attrs.gb = clamp(Math.round(cible + 6 + randGauss(game) * 4), 5, 99);
    p.attrs.att = clamp(randInt(game, 5, 25), 5, 99);
  } else {
    p.attrs.gb = randInt(game, 3, 12);
  }
  // recalage exact sur la cible
  const diff = cible - noteGlobale(p);
  for (const a of [...ATTRS, 'gb']) {
    p.attrs[a] = clamp(Math.round(p.attrs[a] + diff), 3, 99);
  }
}

function margePotentiel(age) {
  const paliers = BALANCE.generation.potentielMargeParAge;
  for (const k of Object.keys(paliers).map(Number).sort((a, b) => a - b)) {
    if (age <= k) return paliers[k];
  }
  return 2;
}

/**
 * Génère un joueur.
 * opts: { age, poste?, cible (note visée), clubForme?: bool (formé au club) }
 */
export function genJoueur(game, opts) {
  const g = BALANCE.generation;
  const poste = opts.poste ||
    (rand(game) < g.partGardiens ? 'G' : pick(game, ['DEF', 'DEF', 'MIL', 'MIL', 'ATT']));
  const nom = genNomJoueur(game);
  const p = {
    id: NEXT_ID++,
    prenom: nom.prenom, nom: nom.nom,
    age: opts.age,
    poste,
    pied: rand(game) < 0.72 ? 'droit' : 'gauche',
    attrs: { att: 0, tec: 0, def: 0, phy: 0, vit: 0, men: 0, gb: 0 },
    potentiel: 0,                        // caché
    talent: randFloat(game, g.talentMin, g.talentMax),   // caché
    contrat: { saisons: randInt(game, 1, 3), salaire: 0 },
    moral: randInt(game, 55, 75),
    fatigue: 0,
    blessure: null,                      // {semaines, type, longue}
    suspension: 0,
    formeNotes: [],
    directive: 'auto',                   // pro ≤19 : 'pro' | 'jeunes' | 'auto'
    surclasse: false,                    // jeune : joue dans la catégorie supérieure
    formeAuClub: !!opts.clubForme,
    stats: { matchs: 0, buts: 0, passes: 0, notes: 0, minutes: 0 },       // saison en cours
    carriere: { matchs: 0, buts: 0, passes: 0, minutes: 0, saisons: [] }, // historique
  };
  const cible = clamp(opts.cible, 3, 92);
  distribuerAttrs(game, p, cible);
  const note = noteGlobale(p);
  const marge = margePotentiel(p.age);
  p.potentiel = clamp(Math.round(note + randFloat(game, 0.15, 1) * marge + (opts.bonusPotentiel || 0)), Math.ceil(note), 99);
  p.contrat.salaire = p.age <= 14 ? 0 : salaireDemande(p);
  return p;
}

// ---------------------------------------------------------------------------
// Progression hebdomadaire
// ---------------------------------------------------------------------------
// Applique "points" de progression, répartis sur les attributs (orientés poste),
// avec approche asymptotique du potentiel.
export function appliquerProgression(game, p, points) {
  if (points <= 0) return 0;
  const note = noteGlobale(p);
  const scale = clamp((p.potentiel - note) / BALANCE.progression.plafondLisse, 0, 1);
  const gain = points * scale;
  if (gain <= 0.001) return 0;
  const w = BALANCE.poidsPoste[p.poste];
  const keys = p.poste === 'G' ? ['gb', 'men', 'phy', 'vit', 'tec'] : ATTRS;
  let totalW = 0;
  for (const k of keys) totalW += (w[k] || 0.05) + 0.05;
  for (const k of keys) {
    const part = ((w[k] || 0.05) + 0.05) / totalW;
    p.attrs[k] = clamp(p.attrs[k] + gain * part * (0.6 + rand(game) * 0.8), 1, 99);
  }
  return gain;
}

export function regresser(game, p, points) {
  const keys = p.poste === 'G' ? ['gb', 'phy', 'vit'] : ATTRS;
  for (const k of keys) {
    p.attrs[k] = clamp(p.attrs[k] - points * (0.5 + rand(game)), 1, 99);
  }
}

// ---------------------------------------------------------------------------
// Vieillissement (fin de saison) — retourne true si le joueur prend sa retraite
// ---------------------------------------------------------------------------
export function vieillir(game, p) {
  p.age += 1;
  const v = BALANCE.vieillissement;
  if (p.age >= v.ageDebutDeclin) {
    for (const [attr, d] of Object.entries(v.declin)) {
      if (attr === 'gb' && p.poste !== 'G') continue;
      const perte = d.base + (p.age - v.ageDebutDeclin) * d.parAnnee;
      p.attrs[attr] = clamp(p.attrs[attr] - perte * (0.7 + rand(game) * 0.6), 1, 99);
    }
  }
  if (p.age >= v.ageRetraiteMin) {
    const pr = v.probaRetraiteParAn + (p.age - v.ageRetraiteMin) * 0.15 + (noteGlobale(p) < 55 ? 0.2 : 0);
    if (rand(game) < pr) return true;
  }
  return false;
}

// archive les stats de la saison et remet à zéro
export function clotureSaisonJoueur(p, saison) {
  const s = p.stats;
  if (s.matchs > 0 || s.minutes > 0) {
    p.carriere.saisons.push({
      saison, matchs: s.matchs, buts: s.buts, passes: s.passes,
      noteMoy: s.matchs ? Math.round((s.notes / s.matchs) * 10) / 10 : 0,
    });
    p.carriere.matchs += s.matchs;
    p.carriere.buts += s.buts;
    p.carriere.passes += s.passes;
    p.carriere.minutes += s.minutes;
  }
  p.stats = { matchs: 0, buts: 0, passes: 0, notes: 0, minutes: 0 };
  p.formeNotes = [];
}

// catégorie de jeunes correspondant à un âge (null si trop vieux)
export function categoriePourAge(age) {
  for (const c of BALANCE.categories) {
    if (age >= c.ageMin - 1 && age <= c.ageMax) return c.id;  // ageMin-1 : tolérance intake
  }
  return null;
}

export function nomComplet(p) {
  return `${p.prenom} ${p.nom}`;
}

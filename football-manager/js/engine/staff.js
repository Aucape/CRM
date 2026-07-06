// Génération et modèle du staff : coachs, adjoints, préparateurs, médecin,
// directeur du recrutement, scouts.

import { BALANCE } from '../config.js';
import { randInt, pick, clamp } from './rng.js';
import { genNomJoueur } from './names.js';

let NEXT_STAFF_ID = 100000;
export function resetStaffIds(start = 100000) { NEXT_STAFF_ID = start; }
export function peekNextStaffId() { return NEXT_STAFF_ID; }

function base(game, role, niveau) {
  const nom = genNomJoueur(game);
  return {
    id: NEXT_STAFF_ID++,
    role,
    prenom: nom.prenom, nom: nom.nom,
    age: randInt(game, 32, 60),
    niveau,                                   // 1-5
    salaire: BALANCE.salaires.staff[roleSalaire(role)] * niveau,
    contratSaisons: randInt(game, 1, 3),
  };
}

function roleSalaire(role) {
  return {
    coachPrincipal: 'coachPrincipal', coachJeunes: 'coachJeunes',
    adjoint: 'adjoint', prepa: 'prepa', medecin: 'medecin',
    directeurRecrutement: 'directeurRecrutement', scout: 'scout',
  }[role];
}

// attribut 0-100 corrélé au niveau 1-5
function attr(game, niveau, spread = 12) {
  return clamp(niveau * 16 + randInt(game, -spread, spread) + 8, 10, 99);
}

export function genCoachPrincipal(game, niveau) {
  const c = base(game, 'coachPrincipal', niveau);
  c.tactique = attr(game, niveau);
  c.gestion = attr(game, niveau);
  c.devJeunes = attr(game, niveau, 20);
  c.prefTactique = pick(game, ['off', 'bal', 'def']);
  return c;
}

export function genCoachJeunes(game, niveau) {
  const c = base(game, 'coachJeunes', niveau);
  c.formation = attr(game, niveau);
  c.gestion = attr(game, niveau, 18);
  return c;
}

export function genAdjoint(game, niveau) {
  const c = base(game, 'adjoint', niveau);
  c.tactique = attr(game, niveau, 18);
  return c;
}

export function genPrepa(game, niveau) {
  const c = base(game, 'prepa', niveau);
  c.condition = attr(game, niveau);
  return c;
}

export function genMedecin(game, niveau) {
  const c = base(game, 'medecin', niveau);
  c.medical = attr(game, niveau);
  return c;
}

export function genDirecteurRecrutement(game, niveau) {
  const c = base(game, 'directeurRecrutement', niveau);
  c.reseau = attr(game, niveau);
  return c;
}

export function genScout(game, niveau) {
  const c = base(game, 'scout', niveau);
  c.mission = null;   // {ageMin, ageMax, poste|null, type:'jeunes'|'pro'}
  return c;
}

export const ROLE_LABELS = {
  coachPrincipal: 'Coach principal',
  coachJeunes: 'Coach de jeunes',
  adjoint: 'Adjoint',
  prepa: 'Préparateur physique',
  medecin: 'Médecin / Kiné',
  directeurRecrutement: 'Directeur du recrutement',
  scout: 'Scout',
};

export function nomStaff(s) {
  return `${s.prenom} ${s.nom}`;
}

// génère une liste de candidats pour un rôle (marché du staff)
export function genCandidats(game, role, n = 4, cat = null) {
  const gens = {
    coachPrincipal: genCoachPrincipal, coachJeunes: genCoachJeunes,
    adjoint: genAdjoint, prepa: genPrepa, medecin: genMedecin,
    directeurRecrutement: genDirecteurRecrutement, scout: genScout,
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const niveau = randInt(game, 1, 5);
    const c = gens[role](game, niveau);
    if (cat) c.categorie = cat;
    out.push(c);
  }
  return out;
}

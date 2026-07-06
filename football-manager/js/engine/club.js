// Modèle club : création du club du joueur et des clubs IA (effectif pro,
// équipes de jeunes, staff, infrastructures, sponsors, finances).

import { BALANCE } from '../config.js';
import { rand, randInt, randFloat, clamp, pick } from './rng.js';
import { genJoueur, noteGlobale, salaireDemande } from './player.js';
import {
  genCoachPrincipal, genCoachJeunes, genScout, genMedecin, genPrepa,
} from './staff.js';
import { genSponsorNom } from './names.js';

let NEXT_CLUB_ID = 1;
export function resetClubIds(start = 1) { NEXT_CLUB_ID = start; }

// note moyenne visée pour l'effectif pro selon le rang de force (0 = plus fort)
export function cibleProPourRang(rang) {
  const [haut, bas] = BALANCE.generation.proMoyenneTier;
  return haut - (haut - bas) * (rang / (BALANCE.saison.nbClubs - 1));
}

function genEffectifPro(game, cible, clubForme = false) {
  const joueurs = [];
  const n = BALANCE.generation.tailleEffectifPro;
  // structure garantie : 3 G, 7 DEF, 7 MIL, 5 ATT
  const postes = ['G', 'G', 'G', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF',
    'MIL', 'MIL', 'MIL', 'MIL', 'MIL', 'MIL', 'MIL', 'ATT', 'ATT', 'ATT', 'ATT', 'ATT'];
  for (let i = 0; i < n; i++) {
    const age = randInt(game, 18, 33);
    const ecart = BALANCE.generation.proEcart;
    const p = genJoueur(game, {
      age, poste: postes[i],
      cible: cible + randFloat(game, -ecart, ecart),
      clubForme: clubForme && rand(game) < 0.25,
    });
    joueurs.push(p);
  }
  return joueurs;
}

function genEquipeJeunes(game, cat, qualiteBase, centreNiveau) {
  const joueurs = [];
  const n = randInt(game, cat.effectifMin, cat.effectifMax);
  for (let i = 0; i < n; i++) {
    const age = randInt(game, cat.ageMin, cat.ageMax);
    // les jeunes plus âgés sont plus avancés (note ≈ qualité × facteur d'âge)
    const facteurAge = 0.15 + (age - 6) * 0.065;   // 7 ans → ~0.22 ; 19 ans → ~1.0
    const p = genJoueur(game, {
      age,
      poste: i < 2 ? 'G' : undefined,
      cible: qualiteBase * facteurAge + randFloat(game, -5, 5),
      clubForme: true,
      bonusPotentiel: (centreNiveau - 1) * BALANCE.intake.bonusPotentielCentre,
    });
    p.contrat = { saisons: 99, salaire: p.age >= 15 ? BALANCE.salaires.jeuneCentre : 0 };
    joueurs.push(p);
  }
  return joueurs;
}

/**
 * Crée un club complet.
 * opts: { nom, ville, couleurs, estJoueur, rangForce (0-15), profil }
 */
export function creerClub(game, opts) {
  const b = BALANCE;
  const estJoueur = !!opts.estJoueur;
  const rep = estJoueur
    ? b.reputation.depart
    : Math.round(b.reputation.plageIA[1] - (b.reputation.plageIA[1] - b.reputation.plageIA[0]) * (opts.rangForce / 15));

  const club = {
    id: NEXT_CLUB_ID++,
    nom: opts.nom, ville: opts.ville, couleurs: opts.couleurs,
    estJoueur,
    profil: opts.profil || pick(game, b.ia.profils),
    reputation: rep,
    tresorerie: estJoueur ? b.finances.tresorerieDepart : Math.round(b.finances.tresorerieDepart * randFloat(game, 0.6, 1.8)),
    semainesRouge: 0,
    budgetMercato: 0,

    joueurs: [],                    // effectif pro
    jeunes: {},                     // { U8: {joueurs, invest, coach, adjoint, prepa}, ... }

    staff: {
      coachPrincipal: null, adjoint: null, prepa: null, medecin: null,
      directeurRecrutement: null, scouts: [],
    },

    infra: { stade: 1, entrainement: 1, formation: 1, infirmerie: 1 },
    travaux: [],                    // [{batiment, versNiveau, semainesRestantes}]

    sponsors: {},                   // { slot: contrat }
    confianceConseil: b.conseil.confianceDepart,
    objectifs: [],                  // objectifs de la saison en cours
    historique: [],                 // bilans de saisons passées

    // finances de la semaine (pour l'écran finances)
    fluxSemaine: null,
    fluxHisto: [],
  };

  // infrastructures des clubs IA selon leur force
  if (!estJoueur) {
    const niveau = opts.rangForce < 3 ? 3 : opts.rangForce < 8 ? 2 : 1;
    club.infra = {
      stade: niveau + (rand(game) < 0.4 ? 1 : 0),
      entrainement: niveau,
      formation: club.profil === 'formateur' ? Math.min(5, niveau + 1) : niveau,
      infirmerie: Math.max(1, niveau - (rand(game) < 0.5 ? 1 : 0)),
    };
  }

  // effectif pro
  const cible = cibleProPourRang(opts.rangForce);
  club.joueurs = genEffectifPro(game, cible, club.profil === 'formateur');

  // équipes de jeunes — la qualité dépend du centre de formation et de la réputation
  const qualiteJeunes = 30 + club.infra.formation * 5 + rep * 0.25;
  for (const cat of b.categories) {
    const investDefaut = estJoueur ? b.depart.investInitial
      : club.profil === 'formateur' ? randInt(game, b.ia.formateurInvestMin, 9)
      : club.profil === 'acheteur' ? randInt(game, 1, b.ia.acheteurInvestMax)
      : randInt(game, 3, 6);
    club.jeunes[cat.id] = {
      joueurs: genEquipeJeunes(game, cat, qualiteJeunes, club.infra.formation),
      invest: investDefaut,
      coach: genCoachJeunes(game, estJoueur ? randInt(game, 1, 3) : randInt(game, 1, 4)),
      adjoint: null,
      prepa: null,
    };
  }

  // staff
  const niveauCoach = estJoueur ? 3 : clamp(5 - Math.floor(opts.rangForce / 4), 1, 5);
  club.staff.coachPrincipal = genCoachPrincipal(game, niveauCoach);
  if (!estJoueur) {
    if (rand(game) < 0.7) club.staff.medecin = genMedecin(game, randInt(game, 1, 4));
    if (rand(game) < 0.6) club.staff.prepa = genPrepa(game, randInt(game, 1, 4));
    club.staff.scouts = [genScout(game, randInt(game, 1, 4))];
  } else {
    club.staff.scouts = [genScout(game, 2)];
  }

  // sponsors initiaux (les clubs IA ont des contrats, le joueur commence avec 2 petits)
  const slotsInit = estJoueur ? ['sec1', 'sec2'] : b.sponsors.slots.filter(() => rand(game) < 0.75);
  for (const slot of slotsInit) {
    club.sponsors[slot] = genContratSponsor(game, club, slot);
  }
  return club;
}

// ---------------------------------------------------------------------------
// Sponsors : création d'un contrat en cours (sans négociation)
// ---------------------------------------------------------------------------
export function montantSponsorHebdo(game, club, slot, prestige = false) {
  const m = BALANCE.sponsors.montants[slot];
  let base;
  if (slot === 'stade') {
    base = BALANCE.infra.stadeCapacite[club.infra.stade - 1] * m.parCapacite;
  } else {
    base = m.base + club.reputation * m.parRep;
  }
  base *= 1 + randFloat(game, -m.variation, m.variation);
  if (prestige) base *= BALANCE.sponsors.prestigeMult;
  return Math.round(base / 50) * 50;
}

export function genContratSponsor(game, club, slot) {
  const b = BALANCE.sponsors;
  const id = genSponsorNom(game, slot);
  const duree = randInt(game, b.dureeMinSem, b.dureeMaxSem);
  const hebdo = montantSponsorHebdo(game, club, slot);
  const bonuses = [];
  if (slot !== 'sec1' && slot !== 'sec2') {
    if (rand(game) < b.bonus.top5.proba) bonuses.push({ type: 'top5', montant: Math.round(hebdo * b.bonus.top5.mult) });
    if (rand(game) < b.bonus.titre.proba) bonuses.push({ type: 'titre', montant: Math.round(hebdo * b.bonus.titre.mult) });
    if (rand(game) < b.bonus.jeune.proba) bonuses.push({ type: 'jeune', montant: Math.round(hebdo * b.bonus.jeune.mult), seuil: b.bonus.jeune.seuilMatchs });
  }
  return {
    nom: id.nom, secteur: id.secteur, slot,
    hebdo, semainesRestantes: duree, dureeTotale: duree,
    bonuses, satisfaction: b.satisfaction.depart,
    prestige: false,
  };
}

// ---------------------------------------------------------------------------
// Helpers d'effectif
// ---------------------------------------------------------------------------
export function masseSalarialeHebdo(club) {
  let total = 0;
  for (const p of club.joueurs) total += p.contrat.salaire;
  const s = club.staff;
  for (const st of [s.coachPrincipal, s.adjoint, s.prepa, s.medecin, s.directeurRecrutement]) {
    if (st) total += st.salaire;
  }
  for (const sc of s.scouts) total += sc.salaire;
  for (const cat of Object.values(club.jeunes)) {
    if (cat.coach) total += cat.coach.salaire;
    if (cat.adjoint) total += cat.adjoint.salaire;
    if (cat.prepa) total += cat.prepa.salaire;
    for (const j of cat.joueurs) total += j.contrat.salaire;
  }
  return total;
}

export function coutInvestissementHebdo(club) {
  const inv = BALANCE.investissement;
  let total = 0;
  for (const cat of Object.values(club.jeunes)) {
    total += Math.round(inv.coutBase * Math.pow(cat.invest, inv.exposant));
  }
  return total;
}

export function forceEffectif(club) {
  const notes = club.joueurs.map(p => noteGlobale(p)).sort((a, b) => b - a);
  const onze = notes.slice(0, 14);
  return onze.length ? onze.reduce((a, b) => a + b, 0) / onze.length : 0;
}

export function tousLesJoueurs(club) {
  const out = [...club.joueurs];
  for (const cat of Object.values(club.jeunes)) out.push(...cat.joueurs);
  return out;
}

export function trouverJoueur(club, id) {
  for (const p of club.joueurs) if (p.id === id) return { joueur: p, ou: 'pro' };
  for (const [catId, cat] of Object.entries(club.jeunes)) {
    for (const p of cat.joueurs) if (p.id === id) return { joueur: p, ou: catId };
  }
  return null;
}

export function retirerJoueur(club, id) {
  let idx = club.joueurs.findIndex(p => p.id === id);
  if (idx >= 0) return club.joueurs.splice(idx, 1)[0];
  for (const cat of Object.values(club.jeunes)) {
    idx = cat.joueurs.findIndex(p => p.id === id);
    if (idx >= 0) return cat.joueurs.splice(idx, 1)[0];
  }
  return null;
}

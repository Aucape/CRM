// Conseil d'administration : objectifs de saison, jauge de confiance, suivi.

import { BALANCE } from '../config.js';
import { rand, randInt, clamp, shuffle } from './rng.js';
import { forceEffectif, masseSalarialeHebdo } from './club.js';
import { rangClub, classement } from './league.js';
import { fmtEuro } from './sponsors.js';
import { mouvementExceptionnel } from './finance.js';

// ---------------------------------------------------------------------------
// Génération des objectifs — calibrés selon la force de l'effectif,
// la réputation et le budget. Au moins 2 catégories différentes.
// ---------------------------------------------------------------------------
export function genObjectifs(game, club) {
  const c = BALANCE.conseil;
  // ambition 0 (modeste) → 1 (très ambitieux) selon le rang de force de l'effectif
  const forces = game.clubs.map(cl => ({ id: cl.id, f: forceEffectif(cl) })).sort((a, b) => b.f - a.f);
  const rangForce = forces.findIndex(f => f.id === club.id) + 1;   // 1..16
  const ambition = clamp(1 - (rangForce - 1) / 15, 0, 1);

  const candidats = [];

  // --- sportif (classement)
  if (ambition > 0.75) candidats.push({ cat: 'sportif', type: 'classement_top', n: randInt(game, 2, 3) });
  else if (ambition > 0.5) candidats.push({ cat: 'sportif', type: 'classement_top', n: randInt(game, 4, 6) });
  else if (ambition > 0.3) candidats.push({ cat: 'sportif', type: 'classement_top', n: randInt(game, 7, 10) });
  else candidats.push({ cat: 'sportif', type: 'classement_pas_bas', n: 3 });

  // --- financier
  if (rand(game) < 0.5) {
    candidats.push({ cat: 'finance', type: 'cashflow_positif' });
  } else {
    const plafond = Math.round(masseSalarialeHebdo(club) * (1.1 + ambition * 0.15) / 1000) * 1000;
    candidats.push({ cat: 'finance', type: 'masse_salariale', plafond });
  }

  // --- formation des jeunes
  if (rand(game) < 0.55) {
    const cible = Math.round(c.minutesJeunesObjectifBase * (0.7 + ambition * 0.6) / 100) * 100;
    candidats.push({ cat: 'jeunes', type: 'minutes_jeunes', cible });
  } else {
    candidats.push({ cat: 'jeunes', type: 'eclosion', matchs: 15 });
  }

  // --- secondaire
  if (rand(game) < 0.5) candidats.push({ cat: 'secondaire', type: 'vente_benefice' });
  else candidats.push({ cat: 'secondaire', type: 'blessures_longues', max: randInt(game, 3, 5) });

  // tire 2-3 objectifs couvrant au moins 2 catégories
  const nb = randInt(game, c.objectifsMin, c.objectifsMax);
  let choisis = [];
  let essais = 0;
  do {
    choisis = shuffle(game, candidats).slice(0, nb);
    essais++;
  } while (new Set(choisis.map(o => o.cat)).size < 2 && essais < 10);

  return choisis.map((o, i) => ({ ...o, id: i + 1, atteint: null }));
}

// ---------------------------------------------------------------------------
// Libellé et progression d'un objectif (pour l'onglet Conseil)
// ---------------------------------------------------------------------------
export function libelleObjectif(o) {
  switch (o.type) {
    case 'classement_top': return `Terminer dans le top ${o.n} du championnat`;
    case 'classement_pas_bas': return `Ne pas terminer dans les ${o.n} dernières places`;
    case 'cashflow_positif': return `Terminer la saison avec un cash-flow cumulé positif`;
    case 'masse_salariale': return `Maintenir la masse salariale sous ${fmtEuro(o.plafond)}/semaine`;
    case 'minutes_jeunes': return `Cumuler ${o.cible} minutes en équipe première pour des joueurs formés au club (≤ 21 ans)`;
    case 'eclosion': return `Faire éclore un titulaire formé au club (≥ ${o.matchs} matchs pros dans la saison)`;
    case 'vente_benefice': return `Réaliser au moins une vente de joueur bénéficiaire`;
    case 'blessures_longues': return `Limiter les blessures longue durée à ${o.max} maximum`;
    default: return o.type;
  }
}

export function progressionObjectif(game, club, o) {
  const ss = club.saisonStats;
  const table = game.ligues.pro.table;
  switch (o.type) {
    case 'classement_top': {
      const rang = rangClub(table, club.id);
      return { texte: `actuellement ${rang}ᵉ`, ok: rang <= o.n };
    }
    case 'classement_pas_bas': {
      const rang = rangClub(table, club.id);
      const nb = game.clubs.length;
      return { texte: `actuellement ${rang}ᵉ`, ok: rang <= nb - o.n };
    }
    case 'cashflow_positif':
      return { texte: `cash-flow cumulé : ${fmtEuro(ss.cashflowCumul)}`, ok: ss.cashflowCumul >= 0 };
    case 'masse_salariale': {
      const ms = masseSalarialeHebdo(club);
      return { texte: `actuelle : ${fmtEuro(ms)}/sem (dépassée : ${ss.masseDepassee ? 'oui' : 'non'})`, ok: !ss.masseDepassee && ms <= o.plafond };
    }
    case 'minutes_jeunes':
      return { texte: `${ss.minutesJeunesFormes} / ${o.cible} minutes`, ok: ss.minutesJeunesFormes >= o.cible };
    case 'eclosion': {
      const meilleur = club.joueurs.filter(p => p.formeAuClub && p.age <= 21)
        .sort((a, b) => b.stats.matchs - a.stats.matchs)[0];
      const n = meilleur ? meilleur.stats.matchs : 0;
      return { texte: `meilleur jeune formé : ${n} / ${o.matchs} matchs`, ok: n >= o.matchs };
    }
    case 'vente_benefice':
      return { texte: ss.ventesBenefice > 0 ? `réalisé (${ss.ventesBenefice})` : 'aucune vente bénéficiaire', ok: ss.ventesBenefice > 0 };
    case 'blessures_longues':
      return { texte: `${ss.blessuresLongues} / ${o.max} max`, ok: ss.blessuresLongues <= o.max };
    default:
      return { texte: '', ok: false };
  }
}

// ampleur de l'échec (0 = raté de peu, 1 = échec cuisant) pour moduler la perte de confiance
function ampleurEchec(game, club, o) {
  const table = game.ligues.pro.table;
  const ss = club.saisonStats;
  switch (o.type) {
    case 'classement_top': {
      const rang = rangClub(table, club.id);
      return clamp((rang - o.n) / 8, 0, 1);
    }
    case 'classement_pas_bas': {
      const rang = rangClub(table, club.id);
      const limite = game.clubs.length - o.n;
      return clamp((rang - limite) / o.n, 0, 1);
    }
    case 'cashflow_positif':
      return clamp(-ss.cashflowCumul / 1_500_000, 0, 1);
    case 'minutes_jeunes':
      return clamp(1 - ss.minutesJeunesFormes / o.cible, 0, 1);
    default:
      return 0.5;
  }
}

// ---------------------------------------------------------------------------
// Évaluation de fin de saison → met à jour la confiance, retourne le bilan
// ---------------------------------------------------------------------------
export function evaluerObjectifs(game, club) {
  const c = BALANCE.conseil;
  const bilan = [];
  let tousReussis = true;
  for (const o of club.objectifs) {
    const prog = progressionObjectif(game, club, o);
    o.atteint = prog.ok;
    if (prog.ok) {
      club.confianceConseil = clamp(club.confianceConseil + c.gainObjectif, 0, 100);
    } else {
      tousReussis = false;
      const perte = c.perteObjectifBase + c.perteObjectifMarge * ampleurEchec(game, club, o);
      club.confianceConseil = clamp(club.confianceConseil - perte, 0, 100);
    }
    bilan.push({ libelle: libelleObjectif(o), atteint: prog.ok, detail: prog.texte });
  }
  if (tousReussis && club.objectifs.length) {
    club.confianceConseil = clamp(club.confianceConseil + c.bonusToutReussi, 0, 100);
  }
  return bilan;
}

// budget mercato alloué par le conseil pour la saison suivante
export function budgetMercato(game, club, rang) {
  const f = BALANCE.finances;
  const primeRang = Math.round(f.primeClassement[rang - 1] * 0.25);
  return f.budgetMercatoBase + Math.round(club.confianceConseil * f.budgetMercatoParConfiance) + primeRang;
}

// ---------------------------------------------------------------------------
// Demandes du président au conseil (une fois par type et par saison).
// Le succès dépend de la confiance ; obtenir une faveur « consomme » un peu de
// capital politique (la confiance baisse : le conseil attend un retour).
// ---------------------------------------------------------------------------
export const DEMANDES = {
  budget: {
    titre: 'Rallonge de budget mercato',
    desc: "Demander des fonds supplémentaires pour recruter cette saison.",
    confMin: 35,
  },
  soutien: {
    titre: 'Soutien financier exceptionnel',
    desc: 'Obtenir une injection de trésorerie (seulement si les finances sont dans le rouge).',
    confMin: 50,
  },
  patience: {
    titre: 'Demander de la patience au conseil',
    desc: 'Rassurer le conseil sur le projet à long terme après une mauvaise passe.',
    confMin: 0,
  },
};

export function peutDemander(game, club, type) {
  const d = DEMANDES[type];
  if (!d) return { ok: false, raison: 'Demande inconnue.' };
  if ((club.demandesConseil || {})[type] === game.saison) {
    return { ok: false, raison: 'Déjà demandé cette saison.' };
  }
  if (type === 'soutien' && club.tresorerie >= 0) {
    return { ok: false, raison: 'Réservé aux situations de trésorerie négative.' };
  }
  return { ok: true };
}

export function demanderConseil(game, club, type) {
  const pd = peutDemander(game, club, type);
  if (!pd.ok) return { ok: false, message: pd.raison };
  const d = DEMANDES[type];
  club.demandesConseil = club.demandesConseil || {};
  club.demandesConseil[type] = game.saison;   // consommé pour la saison
  const conf = club.confianceConseil;

  if (type === 'budget') {
    const accepte = conf >= d.confMin && rand(game) < 0.35 + conf / 200;
    if (accepte) {
      const montant = Math.round((120_000 + conf * 6000) / 10_000) * 10_000;
      club.budgetMercato += montant;
      club.confianceConseil = clamp(conf - 5, 0, 100);
      return { ok: true, accepte: true, message: `Le conseil accorde une rallonge de ${fmtEuro(montant)} au budget mercato. En contrepartie, il attend des résultats (confiance −5).` };
    }
    return { ok: true, accepte: false, message: 'Le conseil juge le budget actuel suffisant et décline poliment.' };
  }

  if (type === 'soutien') {
    const accepte = conf >= d.confMin && rand(game) < 0.30 + conf / 250;
    if (accepte) {
      const montant = Math.round(Math.min(1_800_000, -club.tresorerie * 1.15 + 250_000) / 10_000) * 10_000;
      mouvementExceptionnel(club, montant);
      club.confianceConseil = clamp(conf - 9, 0, 100);
      return { ok: true, accepte: true, message: `Injection exceptionnelle de ${fmtEuro(montant)} en trésorerie. Le conseil s'attend à un redressement (confiance −9).` };
    }
    return { ok: true, accepte: false, message: 'Le conseil refuse le renflouement et vous demande de gérer avec les moyens du bord.' };
  }

  if (type === 'patience') {
    const accepte = rand(game) < 0.4 + (60 - conf) / 200;   // plus efficace quand la confiance est basse
    if (accepte) {
      club.confianceConseil = clamp(conf + 4, 0, 100);
      club.serieDefaites = 0;
      return { ok: true, accepte: true, message: 'Votre discours convainc : le conseil renouvelle sa confiance dans le projet (confiance +4).' };
    }
    return { ok: true, accepte: false, message: "Le conseil vous écoute mais reste sur ses gardes : ce sont les résultats qui parleront." };
  }
  return { ok: false, message: 'Demande inconnue.' };
}

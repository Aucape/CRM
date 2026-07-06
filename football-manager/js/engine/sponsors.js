// Sponsoring : offres hebdomadaires, négociation, satisfaction, renouvellements.

import { BALANCE } from '../config.js';
import { rand, randInt, randFloat, clamp } from './rng.js';
import { genSponsorNom } from './names.js';
import { montantSponsorHebdo, genContratSponsor } from './club.js';
import { msg } from './messages.js';
import { rangClub } from './league.js';

export const SLOT_LABELS = {
  maillot: 'Sponsor maillot principal',
  equipementier: 'Équipementier',
  stade: 'Sponsor du stade (naming)',
  entrainement: 'Sponsor entraînement',
  sec1: 'Partenaire secondaire 1',
  sec2: 'Partenaire secondaire 2',
};

export const BONUS_LABELS = {
  top5: 'Top 5 en fin de saison',
  titre: 'Titre de champion',
  jeune: 'Un jeune formé au club dépasse un seuil de matchs pros',
};

function secteursActifs(club) {
  return new Set(Object.values(club.sponsors).map(s => s.secteur));
}

/**
 * Génère une offre de sponsor pour un slot vide du club du joueur.
 * Retourne null si aucune offre possible (réputation insuffisante, exclusivité...).
 */
export function genOffreSponsor(game, club, slot) {
  const b = BALANCE.sponsors;
  if (club.reputation < b.repMinSlot[slot]) return null;
  const identite = genSponsorNom(game, slot);
  if (slot !== 'equipementier' && secteursActifs(club).has(identite.secteur)) return null; // exclusivité sectorielle
  const prestige = club.reputation >= b.repMinPrestige && club.confianceConseil >= 60 && rand(game) < 0.35;
  let hebdo = montantSponsorHebdo(game, club, slot, prestige);
  const duree = randInt(game, b.dureeMinSem, b.dureeMaxSem);
  // dilemme court/long : les contrats courts paient mieux
  const facteurDuree = 1 + b.primeCourteDuree * (1 - (duree - b.dureeMinSem) / (b.dureeMaxSem - b.dureeMinSem));
  hebdo = Math.round(hebdo * facteurDuree / 50) * 50;

  const bonuses = [];
  if (slot !== 'sec1' && slot !== 'sec2') {
    if (rand(game) < b.bonus.top5.proba) bonuses.push({ type: 'top5', montant: Math.round(hebdo * b.bonus.top5.mult) });
    if (rand(game) < b.bonus.titre.proba) bonuses.push({ type: 'titre', montant: Math.round(hebdo * b.bonus.titre.mult) });
    if (rand(game) < b.bonus.jeune.proba) bonuses.push({ type: 'jeune', montant: Math.round(hebdo * b.bonus.jeune.mult), seuil: b.bonus.jeune.seuilMatchs });
  }
  return {
    slot, nom: identite.nom, secteur: identite.secteur,
    hebdo, dureeSem: duree, bonuses, prestige,
    contreFaite: false,
  };
}

export function texteOffre(offre) {
  const semaines = offre.dureeSem;
  const saisons = (semaines / 32).toFixed(1).replace('.0', '');
  let t = `${offre.nom} (${offre.secteur})${offre.prestige ? ' — sponsor prestigieux' : ''}\n`;
  t += `Slot : ${SLOT_LABELS[offre.slot]}\n`;
  t += `Montant : ${fmtEuro(offre.hebdo)}/semaine pendant ${semaines} semaines (≈ ${saisons} saison(s))\n`;
  for (const bo of offre.bonuses) {
    t += `Bonus : ${fmtEuro(bo.montant)} si ${BONUS_LABELS[bo.type].toLowerCase()}${bo.seuil ? ` (${bo.seuil} matchs)` : ''}\n`;
  }
  return t;
}

function fmtEuro(n) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + ' M€';
  if (Math.abs(n) >= 1000) return Math.round(n / 1000) + ' k€';
  return Math.round(n) + ' €';
}

// contre-proposition : demande de hausse (fraction ≤ margeMax). Retourne true si acceptée.
export function contreProposition(game, club, offre, fractionHausse) {
  const b = BALANCE.sponsors.contreProposition;
  const f = clamp(fractionHausse, 0, b.margeMax);
  // plus la demande est gourmande et la réputation basse, moins ça passe
  const proba = b.probaAccepteBase * (1 - f / b.margeMax * 0.7) * (0.6 + club.reputation / 150);
  offre.contreFaite = true;
  if (rand(game) < proba) {
    offre.hebdo = Math.round(offre.hebdo * (1 + f) / 50) * 50;
    return true;
  }
  return false;
}

export function accepterOffre(game, club, offre) {
  club.sponsors[offre.slot] = {
    nom: offre.nom, secteur: offre.secteur, slot: offre.slot,
    hebdo: offre.hebdo, semainesRestantes: offre.dureeSem, dureeTotale: offre.dureeSem,
    bonuses: offre.bonuses, satisfaction: BALANCE.sponsors.satisfaction.depart,
    prestige: !!offre.prestige,
  };
}

// ---------------------------------------------------------------------------
// Logique hebdomadaire (club du joueur) : expiration, satisfaction, nouvelles offres
// ---------------------------------------------------------------------------
export function sponsorsHebdo(game, club, resultatSemaine) {
  const b = BALANCE.sponsors;

  // satisfaction selon le résultat pro de la semaine
  for (const s of Object.values(club.sponsors)) {
    if (resultatSemaine === 'V') s.satisfaction = clamp(s.satisfaction + b.satisfaction.resultatSemaine, 0, 100);
    else if (resultatSemaine === 'D') s.satisfaction = clamp(s.satisfaction - b.satisfaction.resultatSemaine, 0, 100);
    s.semainesRestantes--;
  }

  // expirations → renouvellement selon satisfaction
  for (const [slot, s] of Object.entries(club.sponsors)) {
    if (s.semainesRestantes > 0) continue;
    delete club.sponsors[slot];
    if (!club.estJoueur) continue;
    if (s.satisfaction >= b.renouvellement.seuilBon) {
      const offre = genOffreSponsor(game, club, slot);
      if (offre) {
        offre.nom = s.nom; offre.secteur = s.secteur;
        offre.hebdo = Math.round(s.hebdo * (1 + b.renouvellement.hausseBon) / 50) * 50;
        msg(game, {
          type: 'sponsor', titre: `${s.nom} veut prolonger (satisfait !)`,
          corps: `Le contrat avec ${s.nom} est arrivé à échéance. Très satisfait du partenariat, il propose un renouvellement en hausse.\n\n${texteOffre(offre)}`,
          actions: offreActions(offre),
        });
        continue;
      }
    }
    if (s.satisfaction <= b.renouvellement.seuilMauvais) {
      (game.sponsorsFaches ||= []).push({ nom: s.nom, retourSaison: game.saison + b.renouvellement.saisonsAbsenceSiFache });
      msg(game, {
        type: 'sponsor', titre: `${s.nom} met fin au partenariat`,
        corps: `Déçu des résultats, ${s.nom} ne renouvellera pas son contrat (${SLOT_LABELS[slot]}) et se retire du marché pour quelques saisons.`,
      });
    } else {
      const offre = genOffreSponsor(game, club, slot);
      if (offre) {
        offre.nom = s.nom; offre.secteur = s.secteur;
        offre.hebdo = Math.round(s.hebdo * (1 - (s.satisfaction < 55 ? b.renouvellement.baisseMauvais : 0)) / 50) * 50;
        msg(game, {
          type: 'sponsor', titre: `Fin de contrat : ${s.nom} propose un renouvellement`,
          corps: texteOffre(offre),
          actions: offreActions(offre),
        });
      } else {
        msg(game, { type: 'sponsor', titre: `Fin du contrat avec ${s.nom}`, corps: `Le slot « ${SLOT_LABELS[slot]} » est désormais libre.` });
      }
    }
  }

  // nouvelles offres pour les slots vides
  if (club.estJoueur) {
    for (const slot of b.slots) {
      if (club.sponsors[slot]) continue;
      // pas 2 offres en attente pour le même slot
      const dejaEnAttente = game.messages.some(m => m.type === 'sponsor' && !m.traite && m.actions && m.data?.slot === slot);
      if (dejaEnAttente) continue;
      if (rand(game) < b.probaOffreHebdo) {
        const offre = genOffreSponsor(game, club, slot);
        if (!offre) continue;
        if ((game.sponsorsFaches || []).some(f => f.nom === offre.nom && f.retourSaison > game.saison)) continue;
        msg(game, {
          type: 'sponsor', titre: `Offre de sponsoring : ${offre.nom}`,
          corps: texteOffre(offre),
          actions: offreActions(offre),
          data: { slot },
        });
      }
    }
  }
}

function offreActions(offre) {
  return [
    { label: 'Accepter', action: 'sponsorAccepter', data: { offre } },
    { label: 'Contre-proposition (+15 %)', action: 'sponsorContre', data: { offre, hausse: 0.15 } },
    { label: 'Décliner', action: 'sponsorDecliner', data: { offre } },
  ];
}

// ---------------------------------------------------------------------------
// Fin de saison : versement des bonus + satisfaction selon les bonus atteints
// ---------------------------------------------------------------------------
export function bonusFinDeSaison(game, club, table) {
  const b = BALANCE.sponsors;
  const rang = rangClub(table, club.id);
  let total = 0;
  const details = [];
  // un jeune formé au club a-t-il dépassé le seuil de matchs pros ?
  const jeuneEclos = (seuil) => club.joueurs.some(p => p.formeAuClub && p.age <= 21 && p.stats.matchs >= seuil);
  for (const s of Object.values(club.sponsors)) {
    for (const bo of s.bonuses) {
      let atteint = false;
      if (bo.type === 'top5') atteint = rang <= 5;
      else if (bo.type === 'titre') atteint = rang === 1;
      else if (bo.type === 'jeune') atteint = jeuneEclos(bo.seuil);
      if (atteint) {
        total += bo.montant;
        s.satisfaction = clamp(s.satisfaction + b.satisfaction.bonusAtteint, 0, 100);
        details.push(`${s.nom} : ${BONUS_LABELS[bo.type]} → +${fmtEuro(bo.montant)}`);
      } else {
        s.satisfaction = clamp(s.satisfaction + b.satisfaction.bonusRate, 0, 100);
      }
    }
  }
  return { total, details };
}

export { fmtEuro };

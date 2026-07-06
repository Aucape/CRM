// Finances : flux hebdomadaires (revenus/dépenses), billetterie, alertes trésorerie.

import { BALANCE } from '../config.js';
import { randFloat, clamp } from './rng.js';
import { masseSalarialeHebdo, coutInvestissementHebdo } from './club.js';
import { rangClub } from './league.js';
import { forme } from './player.js';

// affluence d'un match à domicile
export function affluence(game, club, table) {
  const b = BALANCE.billetterie;
  const capacite = BALANCE.infra.stadeCapacite[club.infra.stade - 1];
  let taux = b.remplissageBase + club.reputation * b.remplissageParRep;
  // forme récente de l'équipe (moyenne des formes des joueurs clés)
  const formes = club.joueurs.slice(0, 14).map(p => forme(p));
  const fMoy = formes.length ? formes.reduce((a, c) => a + c, 0) / formes.length : 6;
  taux += (fMoy - 6) / 3 * b.remplissageForme;
  // classement
  const rang = rangClub(table, club.id);
  taux += b.remplissageClassement * (1 - (rang - 1) / (game.clubs.length - 1));
  taux *= randFloat(game, 0.92, 1.05);
  return Math.round(capacite * clamp(taux, 0.1, 1));
}

/**
 * Calcule et applique le flux financier hebdomadaire d'un club.
 * matchDomicile : rapport du match pro à domicile de la semaine (ou null).
 * Retourne le détail (stocké dans club.fluxSemaine pour l'écran finances).
 */
export function fluxHebdo(game, club, matchDomicile, table) {
  const b = BALANCE;
  const flux = { revenus: {}, depenses: {}, transferts: club._fluxTransferts || 0 };

  // --- revenus
  let sponsors = 0;
  for (const s of Object.values(club.sponsors)) sponsors += s.hebdo;
  flux.revenus.sponsors = sponsors;

  if (matchDomicile) {
    const spectateurs = affluence(game, club, table);
    flux.revenus.billetterie = Math.round(spectateurs * b.billetterie.prixMoyen);
    flux.spectateurs = spectateurs;
  } else {
    flux.revenus.billetterie = 0;
  }

  // --- dépenses
  flux.depenses.salaires = masseSalarialeHebdo(club);
  flux.depenses.jeunes = coutInvestissementHebdo(club);
  let entretien = 0;
  for (const niveau of Object.values(club.infra)) entretien += niveau * b.infra.entretienHebdoParNiveau;
  flux.depenses.entretien = entretien;
  let materiel = b.finances.coutMaterielHebdo;
  if (club.sponsors.equipementier) materiel = Math.max(0, materiel - b.sponsors.equipementierEconomie);
  flux.depenses.materiel = materiel;

  const totalRevenus = Object.values(flux.revenus).reduce((a, c) => a + c, 0);
  const totalDepenses = Object.values(flux.depenses).reduce((a, c) => a + c, 0);
  // les transferts/primes (mouvementExceptionnel) ont déjà été appliqués à la
  // trésorerie au moment de la transaction — ils n'apparaissent ici que pour le détail
  flux.total = totalRevenus - totalDepenses + flux.transferts;
  club._fluxTransferts = 0;

  club.tresorerie += totalRevenus - totalDepenses;
  club.fluxSemaine = flux;
  club.fluxHisto.push({ saison: game.saison, semaine: game.semaine, total: flux.total, tresorerie: club.tresorerie });
  if (club.fluxHisto.length > 40) club.fluxHisto.shift();

  // stats de saison (objectifs du conseil)
  if (club.saisonStats) {
    club.saisonStats.cashflowCumul += flux.total;
    const objMasse = club.objectifs.find(o => o.type === 'masse_salariale');
    if (objMasse && flux.depenses.salaires > objMasse.plafond) club.saisonStats.masseDepassee = true;
  }

  // suivi de trésorerie négative
  if (club.tresorerie < 0) club.semainesRouge++;
  else club.semainesRouge = 0;

  return flux;
}

// enregistre une entrée/sortie exceptionnelle (transfert, prime, travaux…)
// Appliquée immédiatement à la trésorerie ; le cash-flow cumulé de saison est
// mis à jour au prochain fluxHebdo (via flux.transferts).
export function mouvementExceptionnel(club, montant) {
  club.tresorerie += montant;
  club._fluxTransferts = (club._fluxTransferts || 0) + montant;
}

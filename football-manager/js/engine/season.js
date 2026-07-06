// Fin de saison et nouvelle saison : bilan, évaluation des objectifs, primes,
// renouvellements, intake, montées de catégories, vieillissement, mercato,
// nouveaux objectifs et calendrier régénéré.

import { BALANCE } from '../config.js';
import { rand, randInt, clamp } from './rng.js';
import { classement, rangClub, genCalendrier, tableVierge } from './league.js';
import { noteGlobale, nomComplet, vieillir, clotureSaisonJoueur, salaireDemande } from './player.js';
import { evaluerObjectifs, genObjectifs, budgetMercato, libelleObjectif } from './board.js';
import { bonusFinDeSaison, fmtEuro } from './sponsors.js';
import { mouvementExceptionnel } from './finance.js';
import { iaFinDeSaison, gererMonteesJeunes, intakeAnnuel } from './ai.js';
import { regenererMarche } from './market.js';
import { msg } from './messages.js';
import { clubById } from './week.js';

// ---------------------------------------------------------------------------
// Meilleurs joueurs de la saison (championnat pro)
// ---------------------------------------------------------------------------
export function meilleursDeLaSaison(game) {
  const tous = [];
  for (const club of game.clubs) {
    for (const p of club.joueurs) {
      if (p.stats.matchs > 0) tous.push({ p, club });
    }
  }
  const buteurs = tous.slice().sort((a, b) => b.p.stats.buts - a.p.stats.buts).slice(0, 5);
  const passeurs = tous.slice().sort((a, b) => b.p.stats.passes - a.p.stats.passes).slice(0, 5);
  const jeunes = tous.filter(x => x.p.age <= 21 && x.p.stats.matchs >= 8)
    .sort((a, b) => (b.p.stats.notes / b.p.stats.matchs) - (a.p.stats.notes / a.p.stats.matchs))
    .slice(0, 3);
  return { buteurs, passeurs, jeunes };
}

// ---------------------------------------------------------------------------
// FIN DE SAISON — appelée après la 30ᵉ journée
// ---------------------------------------------------------------------------
export function finDeSaison(game) {
  const clubJoueur = game.clubs.find(c => c.estJoueur);
  const table = game.ligues.pro.table;
  const cl = classement(table);
  const rang = rangClub(table, clubJoueur.id);
  const meilleurs = meilleursDeLaSaison(game);

  // 1-2. bilan + évaluation des objectifs (confiance)
  const bilanObjectifs = evaluerObjectifs(game, clubJoueur);

  // 3. primes et bonus sponsors pour tous les clubs
  for (const club of game.clubs) {
    const r = rangClub(table, club.id);
    mouvementExceptionnel(club, BALANCE.finances.primeClassement[r - 1]);
    const bonus = bonusFinDeSaison(game, club, table);
    if (bonus.total > 0) mouvementExceptionnel(club, bonus.total);
    if (club.estJoueur) {
      club._bonusSponsorsDetails = bonus.details;
    }
    // réputation ajustée vers la cible du classement
    club.reputation = clamp(Math.round(
      club.reputation + (cibleReputation(r) - club.reputation) * BALANCE.reputation.ajustementFinSaison), 5, 95);
  }

  // budget mercato alloué par le conseil
  clubJoueur.budgetMercato = budgetMercato(game, clubJoueur, rang);

  // 4. contrats du club du joueur : décompte + renouvellement automatique
  //    (sauf joueurs marqués « laisser partir » dans leur fiche)
  const partis = [];
  const renouveles = [];
  for (const p of [...clubJoueur.joueurs]) {
    p.contrat.saisons--;
    if (p.contrat.saisons > 0) continue;
    if (p.partirFinContrat) {
      clubJoueur.joueurs.splice(clubJoueur.joueurs.indexOf(p), 1);
      partis.push(p);
    } else {
      p.contrat = { saisons: randInt(game, 1, 2), salaire: salaireDemande(p) };
      renouveles.push(p);
    }
  }
  gererStaffFinDeSaison(game, clubJoueur);

  // 5. vieillissement + retraites + montées (joueur) — les stats sont archivées ici
  const retraites = [];
  clubJoueur.joueurs = clubJoueur.joueurs.filter(p => {
    clotureSaisonJoueur(p, game.saison);
    if (vieillir(game, p)) { retraites.push(p); return false; }
    return true;
  });
  const { tropVieuxU19 } = gererMonteesJeunes(game, clubJoueur, true);
  const promus = [];
  for (const p of tropVieuxU19) {
    if (noteGlobale(p) >= 45 || p.potentiel >= 62) {
      p.contrat = { saisons: 2, salaire: salaireDemande(p) };
      clubJoueur.joueurs.push(p);
      promus.push(p);
    }
  }
  const arrivees = intakeAnnuel(game, clubJoueur);
  const liberes = limiterEffectifsJeunes(game, clubJoueur);

  // clubs IA : même cycle, en automatique
  for (const club of game.clubs) {
    if (club.estJoueur) continue;
    iaFinDeSaison(game, club);
    intakeAnnuel(game, club);
    limiterEffectifsJeunes(game, club);
    club.saisonStats = statsSaisonVierges();
    club.objectifs = [];
  }

  // archive de la saison
  clubJoueur.historique.push({
    saison: game.saison, rang,
    points: table[clubJoueur.id].pts,
    confiance: Math.round(clubJoueur.confianceConseil),
    objectifs: bilanObjectifs,
    champion: clubById(game, cl[0].clubId).nom,
  });

  // messages de bilan
  msgBilan(game, clubJoueur, rang, cl, meilleurs, bilanObjectifs, retraites, promus, partis, arrivees, renouveles, liberes);

  // révocation si la confiance est tombée à zéro
  if (clubJoueur.confianceConseil <= 0) {
    game.gameOver = {
      type: 'revocation', titre: 'RÉVOQUÉ PAR LE CONSEIL',
      texte: "La confiance du conseil d'administration est tombée à zéro après l'évaluation des objectifs. Vous êtes démis de vos fonctions.",
    };
  }

  // 6. le mercato d'intersaison s'ouvre (semaines 31-32) — marché régénéré
  regenererMarche(game);
  game.phase = 'mercato';
}

function cibleReputation(rang) {
  const cibles = BALANCE.reputation.cibleParRang;
  const points = Object.keys(cibles).map(Number).sort((a, b) => a - b);
  let prev = points[0];
  for (const pt of points) {
    if (rang <= pt) {
      if (pt === prev) return cibles[pt];
      const t = (rang - prev) / (pt - prev);
      return cibles[prev] + (cibles[pt] - cibles[prev]) * t;
    }
    prev = pt;
  }
  return cibles[points[points.length - 1]];
}

function gererStaffFinDeSaison(game, club) {
  const tout = [
    club.staff.coachPrincipal, club.staff.adjoint, club.staff.prepa,
    club.staff.medecin, club.staff.directeurRecrutement, ...club.staff.scouts,
  ].filter(Boolean);
  for (const cat of Object.values(club.jeunes)) {
    for (const s of [cat.coach, cat.adjoint, cat.prepa]) if (s) tout.push(s);
  }
  for (const s of tout) {
    s.contratSaisons--;
    if (s.contratSaisons <= 0) {
      s.contratSaisons = randInt(game, 1, 3);   // renouvellement automatique (salaire inchangé)
      if (club.estJoueur && s.role === 'coachPrincipal') {
        msg(game, {
          type: 'staff', titre: `Contrat renouvelé : ${s.prenom} ${s.nom}`,
          corps: `Le coach principal a prolongé de ${s.contratSaisons} saison(s).`,
        });
      }
    }
  }
}

// limite chaque catégorie à son effectif max : les moins bons partent
function limiterEffectifsJeunes(game, club) {
  const liberes = [];
  for (const cat of BALANCE.categories) {
    const equipe = club.jeunes[cat.id];
    if (equipe.joueurs.length <= cat.effectifMax) continue;
    equipe.joueurs.sort((a, b) => (noteGlobale(b) + b.potentiel * 0.5) - (noteGlobale(a) + a.potentiel * 0.5));
    while (equipe.joueurs.length > cat.effectifMax) {
      liberes.push({ cat: cat.id, joueur: equipe.joueurs.pop() });
    }
  }
  return liberes;
}

function msgBilan(game, club, rang, cl, meilleurs, bilanObjectifs, retraites, promus, partis, arrivees, renouveles, liberes) {
  const lignes = [];
  lignes.push(`Classement final : ${rang}ᵉ / ${game.clubs.length} — Champion : ${clubById(game, cl[0].clubId).nom}`);
  lignes.push(`Prime de classement : ${fmtEuro(BALANCE.finances.primeClassement[rang - 1])}`);
  if (club._bonusSponsorsDetails?.length) {
    lignes.push('Bonus sponsors : ' + club._bonusSponsorsDetails.join(' ; '));
  }
  delete club._bonusSponsorsDetails;
  lignes.push('');
  lignes.push('— Objectifs du conseil —');
  for (const o of bilanObjectifs) {
    lignes.push(`${o.atteint ? '✔' : '✘'} ${o.libelle} (${o.detail})`);
  }
  lignes.push(`Confiance du conseil : ${Math.round(club.confianceConseil)}/100`);
  lignes.push(`Budget mercato accordé : ${fmtEuro(club.budgetMercato)}`);
  lignes.push('');
  if (meilleurs.buteurs[0]) {
    lignes.push(`Meilleur buteur : ${nomComplet(meilleurs.buteurs[0].p)} (${meilleurs.buteurs[0].club.nom}) — ${meilleurs.buteurs[0].p.stats.buts} buts`);
  }
  if (meilleurs.passeurs[0]) {
    lignes.push(`Meilleur passeur : ${nomComplet(meilleurs.passeurs[0].p)} (${meilleurs.passeurs[0].club.nom}) — ${meilleurs.passeurs[0].p.stats.passes} passes`);
  }
  if (meilleurs.jeunes[0]) {
    const j = meilleurs.jeunes[0];
    lignes.push(`Meilleur jeune : ${nomComplet(j.p)} (${j.club.nom}, ${j.p.age} ans)`);
  }
  msg(game, { type: 'conseil', titre: `Bilan de la saison ${game.saison}`, corps: lignes.join('\n') });

  if (retraites.length) {
    msg(game, { type: 'info', titre: 'Retraites', corps: retraites.map(p => `${nomComplet(p)} (${p.age} ans) raccroche les crampons.`).join('\n') });
  }
  if (promus.length) {
    msg(game, {
      type: 'jeunes', titre: 'Montées en équipe première',
      corps: promus.map(p => `${nomComplet(p)} (${p.age} ans, ${p.poste}) sort des U19 et signe pro.`).join('\n'),
    });
  }
  if (partis.length) {
    msg(game, { type: 'info', titre: 'Fins de contrat', corps: partis.map(p => `${nomComplet(p)} quitte le club libre.`).join('\n') });
  }
  if (renouveles.length) {
    msg(game, {
      type: 'info', titre: `Contrats renouvelés (${renouveles.length})`,
      corps: renouveles.map(p => `${nomComplet(p)} — nouveau salaire ${fmtEuro(p.contrat.salaire)}/sem, ${p.contrat.saisons} saison(s)`).join('\n') +
        "\n\n(Pour laisser partir un joueur en fin de contrat, activez « Laisser partir » dans sa fiche.)",
    });
  }
  if (liberes.length) {
    msg(game, {
      type: 'jeunes', titre: `Centre de formation : ${liberes.length} départ(s)`,
      corps: 'Effectifs pleins — les moins prometteurs sont libérés :\n' +
        liberes.map(l => `${l.cat} : ${nomComplet(l.joueur)}`).join('\n'),
    });
  }
  if (arrivees.length) {
    const parCat = {};
    for (const a of arrivees) parCat[a.cat] = (parCat[a.cat] || 0) + 1;
    msg(game, {
      type: 'jeunes', titre: `Intake annuel : ${arrivees.length} nouveaux jeunes`,
      corps: Object.entries(parCat).map(([c, n]) => `${c} : ${n} arrivée(s)`).join('\n') +
        '\n\nLa quantité et la qualité dépendent du centre de formation, des investissements et de la réputation.',
    });
  }
  msg(game, {
    type: 'info', titre: "Mercato d'intersaison ouvert (2 semaines)",
    corps: "Les clubs sont actifs sur le marché. Profitez-en pour recruter avant la nouvelle saison.",
  });
}

// ---------------------------------------------------------------------------
// NOUVELLE SAISON — après les 2 semaines de mercato
// ---------------------------------------------------------------------------
export function nouvelleSaison(game) {
  const clubJoueur = game.clubs.find(c => c.estJoueur);
  game.saison++;
  game.semaine = 1;
  game.phase = 'saison';
  game.rapports = {};

  // calendriers régénérés (pro + toutes les catégories de jeunes)
  const ids = game.clubs.map(c => c.id);
  game.ligues.pro = { calendrier: genCalendrier(game, ids), table: tableVierge(ids), resultats: [] };
  game.ligues.jeunes = {};
  for (const cat of BALANCE.categories) {
    game.ligues.jeunes[cat.id] = { calendrier: genCalendrier(game, ids), table: tableVierge(ids), resultats: [] };
  }

  // stats de saison et objectifs
  clubJoueur.saisonStats = statsSaisonVierges();
  clubJoueur.serieDefaites = 0;
  clubJoueur.objectifs = genObjectifs(game, clubJoueur);

  msg(game, {
    type: 'conseil', titre: `Saison ${game.saison} : objectifs du conseil`,
    corps: clubJoueur.objectifs.map(o => `• ${libelleObjectif(o)}`).join('\n') +
      `\n\nConfiance actuelle : ${Math.round(clubJoueur.confianceConseil)}/100.`,
  });
}

export function statsSaisonVierges() {
  return {
    minutesJeunesFormes: 0, ventesBenefice: 0, blessuresLongues: 0,
    cashflowCumul: 0, masseDepassee: false, achats: 0, ventes: 0,
  };
}

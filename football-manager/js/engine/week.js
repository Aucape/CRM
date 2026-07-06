// Orchestration de la « Semaine suivante » : matchs (pros + toutes les catégories
// de jeunes + clubs IA), entraînement/progression, récupération, finances,
// travaux, scouting, sponsors, mercato, conseil d'administration.

import { BALANCE } from '../config.js';
import { rand, randInt, clamp, pick } from './rng.js';
import { simulerMatch } from './match.js';
import { enregistrerResultat, rangClub } from './league.js';
import { noteGlobale, nomComplet, appliquerProgression, regresser, valeurMarchande } from './player.js';
import { tousLesJoueurs, genContratSponsor } from './club.js';
import { fluxHebdo, mouvementExceptionnel } from './finance.js';
import { sponsorsHebdo } from './sponsors.js';
import { scoutingHebdo, offresRecuesHebdo } from './market.js';
import { iaHebdo } from './ai.js';
import { msg } from './messages.js';

export function clubById(game, id) {
  return game.clubs.find(c => c.id === id);
}

// ---------------------------------------------------------------------------
// Constitution des pools de joueurs (double éligibilité pro/jeunes, surclassement)
// ---------------------------------------------------------------------------
function poolPro(club) {
  return club.joueurs.filter(p => !(p.age <= 19 && p.directive === 'jeunes'));
}

function poolJeunes(game, club, catId, utilisesPro) {
  const cats = BALANCE.categories;
  const idx = cats.findIndex(c => c.id === catId);
  const cat = cats[idx];
  const pool = [];

  // joueurs de la catégorie (sauf les surclassés, qui jouent au-dessus)
  for (const p of club.jeunes[catId].joueurs) {
    if (!p.surclasse) pool.push(p);
  }
  // surclassés venus de la catégorie inférieure
  if (idx > 0) {
    for (const p of club.jeunes[cats[idx - 1].id].joueurs) {
      if (p.surclasse) pool.push(p);
    }
  }
  // pros ≤ 19 ans encore éligibles dans leur catégorie d'âge
  for (const p of club.joueurs) {
    if (p.age > 19 || p.age < cat.ageMin || p.age > cat.ageMax) continue;
    if (p.directive === 'pro') continue;
    if (p.directive === 'auto' && utilisesPro.has(p.id)) continue;  // le coach l'a utilisé chez les pros
    pool.push(p);
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Simulation d'une journée de championnat (pro + jeunes)
// ---------------------------------------------------------------------------
function jouerJournee(game) {
  const journee = game.semaine - 1;   // index 0-based
  const clubJoueur = game.clubs.find(c => c.estJoueur);
  const utilisesParClub = new Map();  // clubId → Set(joueurIds utilisés en pro)
  const resultats = { pro: [], jeunes: {} };
  let resultatJoueur = null;

  // --- matchs pros
  const matchsPro = game.ligues.pro.calendrier[journee];
  matchsPro.forEach((m, i) => {
    const dom = clubById(game, m.dom), ext = clubById(game, m.ext);
    const implique = dom.estJoueur || ext.estJoueur;
    const rapport = simulerMatch(game, poolPro(dom), poolPro(ext), {
      domId: dom.id, extId: ext.id, detail: implique,
      coachDom: dom.staff.coachPrincipal, coachExt: ext.staff.coachPrincipal,
      clubDom: dom, clubExt: ext, categorie: null,
    });
    enregistrerResultat(game.ligues.pro.table, dom.id, ext.id, rapport.bd, rapport.be);
    utilisesParClub.set(dom.id, rapport._utilises);
    utilisesParClub.set(ext.id, new Set([...rapport._utilises]));
    const slim = { domId: dom.id, extId: ext.id, bd: rapport.bd, be: rapport.be, buts: rapport.buts };
    if (implique) {
      const rid = `s${game.saison}j${game.semaine}`;
      delete rapport._utilises;
      game.rapports[rid] = rapport;
      slim.rapportId = rid;
      resultatJoueur = dom.estJoueur
        ? (rapport.bd > rapport.be ? 'V' : rapport.bd < rapport.be ? 'D' : 'N')
        : (rapport.be > rapport.bd ? 'V' : rapport.be < rapport.bd ? 'D' : 'N');
      // événements notables
      signalerEvenements(game, clubJoueur, rapport, dom, ext);
    }
    resultats.pro.push(slim);
  });

  // minutes des jeunes formés au club en équipe première (objectif du conseil)
  for (const p of clubJoueur.joueurs) {
    if (p.formeAuClub && p.age <= 21 && p._minSemaine) {
      clubJoueur.saisonStats.minutesJeunesFormes += p._minSemaine;
    }
  }

  // --- matchs de jeunes (toutes catégories, moteur simplifié : detail=false)
  for (const cat of BALANCE.categories) {
    const ligue = game.ligues.jeunes[cat.id];
    const matchs = ligue.calendrier[journee];
    resultats.jeunes[cat.id] = [];
    for (const m of matchs) {
      const dom = clubById(game, m.dom), ext = clubById(game, m.ext);
      const implique = dom.estJoueur || ext.estJoueur;
      const rapport = simulerMatch(game,
        poolJeunes(game, dom, cat.id, utilisesParClub.get(dom.id) || new Set()),
        poolJeunes(game, ext, cat.id, utilisesParClub.get(ext.id) || new Set()),
        {
          domId: dom.id, extId: ext.id, detail: false, categorie: cat.id,
          coachDom: dom.jeunes[cat.id].coach, coachExt: ext.jeunes[cat.id].coach,
          clubDom: dom, clubExt: ext,
        });
      enregistrerResultat(ligue.table, dom.id, ext.id, rapport.bd, rapport.be);
      resultats.jeunes[cat.id].push({
        domId: dom.id, extId: ext.id, bd: rapport.bd, be: rapport.be,
        buts: implique ? rapport.buts : undefined,
      });
    }
  }

  game.ligues.pro.resultats.push({ journee: game.semaine, matchs: resultats.pro });
  for (const cat of BALANCE.categories) {
    game.ligues.jeunes[cat.id].resultats.push({ journee: game.semaine, matchs: resultats.jeunes[cat.id] });
  }
  return { resultatJoueur, resultats };
}

function signalerEvenements(game, clubJoueur, rapport, dom, ext) {
  const nomDom = dom.nom, nomExt = ext.nom;
  const score = `${nomDom} ${rapport.bd} – ${rapport.be} ${nomExt}`;
  // nouvelles blessures dans l'effectif du joueur
  for (const p of clubJoueur.joueurs) {
    if (p.blessure && p.blessure.semaines && !p.blessure._signalee) {
      p.blessure._signalee = true;
      msg(game, {
        type: 'blessure',
        titre: `Blessure : ${nomComplet(p)} (${p.blessure.type})`,
        corps: `${nomComplet(p)} s'est blessé (${p.blessure.type}). Indisponible environ ${p.blessure.semaines} semaine(s).${p.blessure.longue ? '\n⚠ Blessure longue durée.' : ''}`,
      });
      if (p.blessure.longue) clubJoueur.saisonStats.blessuresLongues++;
    }
  }
  // performance notable d'un jeune formé au club
  if (rapport.notes) {
    for (const n of rapport.notes) {
      const p = clubJoueur.joueurs.find(x => x.id === n.joueurId);
      if (p && p.formeAuClub && p.age <= 20 && n.note >= 8) {
        msg(game, {
          type: 'jeunes',
          titre: `Éclosion : ${nomComplet(p)} (${p.age} ans) brille chez les pros !`,
          corps: `${nomComplet(p)}, formé au club, a été noté ${n.note}/10 lors de ${score}.`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Entraînement et progression hebdomadaire
// ---------------------------------------------------------------------------
function baseAge(age) {
  for (const palier of BALANCE.progression.baseParAge) {
    if (age <= palier.ageMax) return palier.base;
  }
  return 0;
}

function progressionJeunes(game, club) {
  const pr = BALANCE.progression;
  const cats = BALANCE.categories;
  const estJoueur = club.estJoueur;

  for (let i = 0; i < cats.length; i++) {
    const catId = cats[i].id;
    const equipe = club.jeunes[catId];
    const coachFormation = equipe.coach ? equipe.coach.formation : 20;
    const f = pr.fInvest.min + equipe.invest * pr.fInvest.parPoint;
    const g = pr.gCoach.min + (coachFormation / 100) * pr.gCoach.plage;
    const h = pr.hCentre.min + club.infra.formation * pr.hCentre.parNiveau;
    let bonusStaff = 1;
    if (equipe.adjoint) bonusStaff += pr.bonusAdjoint;
    if (equipe.prepa) bonusStaff += pr.bonusPrepa;

    const partants = [];
    for (const p of equipe.joueurs) {
      // régression : investissement très faible + mauvais coach
      if (equipe.invest <= pr.regression.seuilInvest && coachFormation < pr.regression.seuilCoach) {
        p.moral = clamp(p.moral + pr.regression.moralHebdo, 0, 100);
        if (rand(game) < 0.5) regresser(game, p, pr.regression.perte);
        if (rand(game) < pr.regression.probaDepart) partants.push(p);
        continue;
      }
      const minutes = p._minSemaine || 0;
      let points = baseAge(p.age) * f * g * h * p.talent * (1 + pr.bonusTempsJeu * Math.min(1, minutes / 90)) * bonusStaff;
      if (p.surclasse) {
        points *= pr.bonusSurclassement;
        // trop juste pour la catégorie supérieure ? → moral en berne
        const sup = club.jeunes[cats[Math.min(i + 1, cats.length - 1)].id];
        const moySup = sup.joueurs.length
          ? sup.joueurs.reduce((a, x) => a + noteGlobale(x), 0) / sup.joueurs.length : 50;
        if (noteGlobale(p) < moySup - BALANCE.surclassement.ecartMoral) {
          p.moral = clamp(p.moral + BALANCE.surclassement.moralPerte, 0, 100);
        }
      }
      appliquerProgression(game, p, points);
    }
    for (const p of partants) {
      equipe.joueurs.splice(equipe.joueurs.indexOf(p), 1);
      if (estJoueur) {
        msg(game, {
          type: 'jeunes',
          titre: `Départ du centre : ${nomComplet(p)} (${catId})`,
          corps: `Démotivé par le manque de moyens (investissement ${equipe.invest}/10), ${nomComplet(p)} quitte le centre de formation.`,
        });
      }
    }
  }

  // progression des pros ≤ 23 ans (centre d'entraînement + coach principal)
  const coach = club.staff.coachPrincipal;
  const hPro = pr.proCentreEntrainement.min + club.infra.entrainement * pr.proCentreEntrainement.parNiveau;
  const gPro = pr.proDevJeunesCoach.min + ((coach?.devJeunes || 30) / 100) * pr.proDevJeunesCoach.plage;
  for (const p of club.joueurs) {
    if (p.age > 23) continue;
    const minutes = p._minSemaine || 0;
    const points = baseAge(p.age) * hPro * gPro * p.talent * (1 + pr.bonusTempsJeu * Math.min(1, minutes / 90));
    appliquerProgression(game, p, points);
  }
}

// ---------------------------------------------------------------------------
// Récupération : fatigue, blessures, suspensions, moral
// ---------------------------------------------------------------------------
function recuperation(game, club) {
  const c = BALANCE.condition;
  let recup = c.recupHebdo;
  if (club.staff.prepa) recup += c.recupBonusPrepa;
  if (club.sponsors.entrainement) recup += c.recupBonusSponsorEntrainement;

  for (const p of tousLesJoueurs(club)) {
    p.fatigue = clamp(p.fatigue - recup, 0, 100);
    if (p.suspension > 0) p.suspension--;
    if (p.blessure) {
      p.blessure.semaines--;
      if (p.blessure.semaines <= 0) {
        if (club.estJoueur && club.joueurs.includes(p)) {
          msg(game, { type: 'blessure', titre: `Retour de blessure : ${nomComplet(p)}`, corps: `${nomComplet(p)} a repris l'entraînement.` });
        }
        p.blessure = null;
      }
    }
    // le moral revient doucement vers 60
    p.moral = clamp(p.moral + (60 - p.moral) * c.moralRetourNeutre, 0, 100);
    p._minSemaine = 0;
  }
}

// ---------------------------------------------------------------------------
// Travaux d'infrastructure
// ---------------------------------------------------------------------------
function avancerTravaux(game, club) {
  const termines = [];
  for (const t of club.travaux) {
    t.semainesRestantes--;
    if (t.semainesRestantes <= 0) {
      club.infra[t.batiment] = t.versNiveau;
      termines.push(t);
    }
  }
  club.travaux = club.travaux.filter(t => t.semainesRestantes > 0);
  if (club.estJoueur) {
    const noms = { stade: 'Stade', entrainement: "Centre d'entraînement", formation: 'Centre de formation', infirmerie: 'Infirmerie' };
    for (const t of termines) {
      msg(game, {
        type: 'info', titre: `Travaux terminés : ${noms[t.batiment]} niveau ${t.versNiveau}`,
        corps: `Le chantier est livré. ${noms[t.batiment]} passe au niveau ${t.versNiveau}.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Conseil d'administration : surveillance en cours de saison
// ---------------------------------------------------------------------------
function conseilHebdo(game, club, resultatJoueur) {
  const c = BALANCE.conseil;
  const f = BALANCE.finances;

  if (resultatJoueur === 'D') club.serieDefaites = (club.serieDefaites || 0) + 1;
  else if (resultatJoueur) club.serieDefaites = 0;

  if (club.serieDefaites === c.patienceSerieDefaites) {
    club.confianceConseil = clamp(club.confianceConseil - c.perteSerieDefaites, 0, 100);
    msg(game, {
      type: 'conseil', titre: "Le conseil s'inquiète de la série de défaites",
      corps: `${club.serieDefaites} défaites consécutives. La confiance du conseil s'effrite (${Math.round(club.confianceConseil)}/100).`,
    });
  }

  // trésorerie dans le rouge
  if (club.semainesRouge === f.semainesRougeAvertissement) {
    msg(game, {
      type: 'finance', titre: '⚠ Avertissement du conseil : trésorerie négative',
      corps: `La trésorerie est dans le rouge depuis ${club.semainesRouge} semaines. Le conseil exige un retour à l'équilibre, sous peine de ventes forcées.`,
    });
  } else if (club.semainesRouge === f.semainesRougeVenteForcee) {
    const meilleur = club.joueurs.slice().sort((a, b) => valeurMarchande(b) - valeurMarchande(a))[0];
    if (meilleur) {
      const montant = Math.round(valeurMarchande(meilleur) * 0.85);
      const acheteur = pick(game, game.clubs.filter(x => !x.estJoueur));
      msg(game, {
        type: 'conseil', titre: `Vente forcée : le conseil impose le départ de ${nomComplet(meilleur)}`,
        corps: `Trésorerie négative depuis trop longtemps : le conseil a accepté une offre de ${acheteur.nom} (${Math.round(montant / 1000)} k€) pour ${nomComplet(meilleur)}.`,
      });
      vendreJoueurForce(game, club, meilleur, montant, acheteur);
    }
  } else if (club.semainesRouge >= f.semainesRougeFaillite) {
    game.gameOver = {
      type: 'faillite',
      titre: 'FAILLITE',
      texte: `Le club est en cessation de paiement après ${club.semainesRouge} semaines de trésorerie négative. Le tribunal prononce la liquidation. Votre aventure s'arrête ici.`,
    };
  }

  if (club.confianceConseil <= 0) {
    game.gameOver = {
      type: 'revocation',
      titre: 'RÉVOQUÉ PAR LE CONSEIL',
      texte: "Après des échecs répétés, la confiance du conseil d'administration est tombée à zéro. Vous êtes démis de vos fonctions de président.",
    };
  }
}

function vendreJoueurForce(game, club, joueur, montant, acheteur) {
  const idx = club.joueurs.indexOf(joueur);
  if (idx >= 0) {
    club.joueurs.splice(idx, 1);
    mouvementExceptionnel(club, montant);
    mouvementExceptionnel(acheteur, -montant);
    acheteur.joueurs.push(joueur);
    joueur.formeAuClub = false;
    if (club.saisonStats) club.saisonStats.ventes += montant;
  }
}

// ---------------------------------------------------------------------------
// Sponsors des clubs IA : simple entretien de contrats
// ---------------------------------------------------------------------------
function sponsorsIA(game, club) {
  for (const [slot, s] of Object.entries(club.sponsors)) {
    s.semainesRestantes--;
    if (s.semainesRestantes <= 0) delete club.sponsors[slot];
  }
  for (const slot of BALANCE.sponsors.slots) {
    if (!club.sponsors[slot] && rand(game) < 0.25) {
      club.sponsors[slot] = genContratSponsor(game, club, slot);
    }
  }
}

// ---------------------------------------------------------------------------
// SEMAINE SUIVANTE — point d'entrée principal
// ---------------------------------------------------------------------------
export function simulerSemaine(game) {
  if (game.gameOver) return null;
  const clubJoueur = game.clubs.find(c => c.estJoueur);
  const enSaison = game.semaine <= BALANCE.saison.nbJournees;

  // remise à zéro des minutes de la semaine
  for (const club of game.clubs) {
    for (const p of tousLesJoueurs(club)) p._minSemaine = 0;
  }

  // 1. matchs
  let resultatJoueur = null;
  if (enSaison) {
    const r = jouerJournee(game);
    resultatJoueur = r.resultatJoueur;
  }

  // 2-8. traitement hebdomadaire par club
  for (const club of game.clubs) {
    progressionJeunes(game, club);
    recuperation(game, club);
    avancerTravaux(game, club);

    // match à domicile cette semaine ?
    let matchDom = null;
    if (enSaison) {
      const journee = game.ligues.pro.calendrier[game.semaine - 1];
      matchDom = journee.find(m => m.dom === club.id) || null;
    }
    fluxHebdo(game, club, matchDom, game.ligues.pro.table);

    if (club.estJoueur) {
      sponsorsHebdo(game, club, resultatJoueur);
      scoutingHebdo(game, club);
      offresRecuesHebdo(game, club);
      conseilHebdo(game, club, resultatJoueur);
      // rappel : contrats qui expirent en fin de saison
      if (game.semaine === 25) {
        const expirants = club.joueurs.filter(p => p.contrat.saisons <= 1);
        if (expirants.length) {
          msg(game, {
            type: 'info', titre: `${expirants.length} contrat(s) expirent en fin de saison`,
            corps: expirants.map(p => `${nomComplet(p)} (${p.age} ans, ${p.poste})${p.partirFinContrat ? ' — partira libre' : ''}`).join('\n') +
              "\n\nSans décision de votre part, ils seront prolongés automatiquement au salaire du marché. " +
              "Activez « Laisser partir » dans la fiche d'un joueur pour ne pas le prolonger.",
          });
        }
      }
    } else {
      sponsorsIA(game, club);
      iaHebdo(game, club);
    }
  }

  // 9. horloge
  game.semaine++;
  game.semainesTotal++;
  return { resultatJoueur };
}

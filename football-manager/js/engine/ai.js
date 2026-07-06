// IA des clubs adverses : transferts, gestion d'effectif, infrastructures.
// Objectif : rester cohérents et compétitifs sur plusieurs saisons, selon leur
// profil (« formateur », « acheteur », « équilibré »).

import { BALANCE } from '../config.js';
import { rand, randInt, randFloat, pick, clamp } from './rng.js';
import { genJoueur, noteGlobale, valeurMarchande, salaireDemande, vieillir, clotureSaisonJoueur } from './player.js';
import { mouvementExceptionnel } from './finance.js';
import { genCoachJeunes } from './staff.js';

// ---------------------------------------------------------------------------
// Activité hebdomadaire (légère) : transferts entre clubs IA
// ---------------------------------------------------------------------------
export function iaHebdo(game, club) {
  const m = BALANCE.mercato;
  const enMercato = game.semaine > BALANCE.saison.nbJournees;
  const proba = enMercato ? m.activiteIAMercato : m.activiteIAHebdo;
  if (rand(game) >= proba) return;

  if (club.profil !== 'formateur' && club.tresorerie > 800_000 && rand(game) < 0.6) {
    // achète un joueur au marché ou à un autre club IA
    acheterIA(game, club);
  } else if (club.joueurs.length > 20 && rand(game) < 0.5) {
    // vend un joueur peu utilisé
    const candidats = club.joueurs.slice().sort((a, b) => noteGlobale(a) - noteGlobale(b)).slice(0, 6);
    const joueur = pick(game, candidats);
    const idx = club.joueurs.indexOf(joueur);
    if (idx >= 0) {
      club.joueurs.splice(idx, 1);
      mouvementExceptionnel(club, Math.round(valeurMarchande(joueur) * 0.8));
      game.marche.transferts = game.marche.transferts.filter(t => t.joueurId !== joueur.id);
    }
  }
}

function acheterIA(game, club) {
  // pioche parmi les agents libres, sinon génère une recrue plausible
  let joueur = null;
  if (game.marche.libres.length && rand(game) < 0.5) {
    joueur = game.marche.libres.splice(randInt(game, 0, game.marche.libres.length - 1), 1)[0];
  } else {
    const besoin = posteManquant(club);
    joueur = genJoueur(game, {
      age: randInt(game, 19, 29), poste: besoin,
      cible: noteGlobale(meilleur(club)) - randFloat(game, 2, 12),
    });
    mouvementExceptionnel(club, -Math.min(club.tresorerie * 0.4, valeurMarchande(joueur)));
  }
  joueur.contrat = { saisons: randInt(game, 1, 3), salaire: salaireDemande(joueur) };
  club.joueurs.push(joueur);
}

function posteManquant(club) {
  const compte = { G: 0, DEF: 0, MIL: 0, ATT: 0 };
  for (const p of club.joueurs) compte[p.poste]++;
  const besoins = { G: 3, DEF: 7, MIL: 7, ATT: 5 };
  let pire = 'MIL', pireRatio = 99;
  for (const [poste, cible] of Object.entries(besoins)) {
    const r = compte[poste] / cible;
    if (r < pireRatio) { pireRatio = r; pire = poste; }
  }
  return pire;
}

function meilleur(club) {
  return club.joueurs.slice().sort((a, b) => noteGlobale(b) - noteGlobale(a))[0];
}

// ---------------------------------------------------------------------------
// Fin de saison : vieillissement, retraites, montées de jeunes, recomplètement
// (appelé pour chaque club IA — le club du joueur a sa propre logique guidée)
// ---------------------------------------------------------------------------
export function iaFinDeSaison(game, club) {
  // contrats
  for (const p of club.joueurs) {
    p.contrat.saisons--;
    if (p.contrat.saisons <= 0) p.contrat.saisons = randInt(game, 1, 3); // l'IA renouvelle
  }

  // vieillissement + retraites + archives
  club.joueurs = club.joueurs.filter(p => {
    clotureSaisonJoueur(p, game.saison);
    return !vieillir(game, p);
  });

  // jeunes : vieillissement + montées de catégories
  gererMonteesJeunes(game, club, false);

  // promotion des meilleurs U19 devenus trop vieux ou très bons
  const u19 = club.jeunes.U19.joueurs;
  const promus = u19.filter(p => p.age > 19 || (noteGlobale(p) > 58 && rand(game) < 0.7));
  for (const p of promus) {
    const idx = u19.indexOf(p);
    u19.splice(idx, 1);
    if (p.age > 19 && noteGlobale(p) < 50) continue;  // libéré
    p.contrat = { saisons: randInt(game, 2, 3), salaire: salaireDemande(p) };
    club.joueurs.push(p);
  }

  // recomplète l'effectif pro si trop mince
  while (club.joueurs.length < BALANCE.ia.tailleEffectifCible - 2) {
    acheterIA(game, club);
  }
  // dégraisse si trop gros
  while (club.joueurs.length > BALANCE.ia.tailleEffectifCible + 4) {
    const moins = club.joueurs.slice().sort((a, b) => noteGlobale(a) - noteGlobale(b))[0];
    club.joueurs.splice(club.joueurs.indexOf(moins), 1);
    mouvementExceptionnel(club, Math.round(valeurMarchande(moins) * 0.7));
  }

  // infrastructures : les clubs riches investissent parfois
  if (club.tresorerie > 4_000_000 && rand(game) < 0.35 && !club.travaux.length) {
    const cibles = Object.entries(club.infra).filter(([, n]) => n < 5);
    if (cibles.length) {
      const [bat] = pick(game, cibles);
      const pref = club.profil === 'formateur' && club.infra.formation < 5 ? 'formation' : bat;
      const niveau = club.infra[pref];
      const cout = BALANCE.infra.coutNiveau[niveau - 1] * BALANCE.infra.facteurCout[pref];
      if (club.tresorerie > cout * 1.5) {
        mouvementExceptionnel(club, -cout);
        club.travaux.push({ batiment: pref, versNiveau: niveau + 1, semainesRestantes: BALANCE.infra.delaiNiveau[niveau - 1] });
      }
    }
  }

  // sponsors IA : renouvellement automatique simplifié
  for (const [slot, s] of Object.entries(club.sponsors)) {
    if (s.semainesRestantes <= 0) delete club.sponsors[slot];
  }
}

// ---------------------------------------------------------------------------
// Montées de catégories (commun IA / joueur) — après vieillissement des jeunes.
// estJoueur : true → génère des événements guidés côté season.js
// Retourne { promusEnPro: [joueurs U19 devenus trop vieux] } pour le club du joueur.
// ---------------------------------------------------------------------------
export function gererMonteesJeunes(game, club, estJoueur) {
  const cats = BALANCE.categories;
  const tropVieuxU19 = [];

  // vieillissement de tous les jeunes + archives
  for (const cat of cats) {
    for (const p of club.jeunes[cat.id].joueurs) {
      clotureSaisonJoueur(p, game.saison);
      vieillir(game, p);   // pas de retraite chez les jeunes
      p.surclasse = false;
    }
  }

  // montées : de la catégorie la plus âgée vers le haut
  for (let i = cats.length - 1; i >= 0; i--) {
    const cat = cats[i];
    const equipe = club.jeunes[cat.id];
    const restants = [];
    for (const p of equipe.joueurs) {
      if (p.age <= cat.ageMax) { restants.push(p); continue; }
      if (i === cats.length - 1) {
        tropVieuxU19.push(p);           // U19 trop vieux → pro ou départ
      } else {
        club.jeunes[cats[i + 1].id].joueurs.push(p);   // monte de catégorie
        if (p.age >= 15 && !p.contrat.salaire) p.contrat.salaire = BALANCE.salaires.jeuneCentre;
      }
    }
    equipe.joueurs = restants;
  }
  return { tropVieuxU19 };
}

// ---------------------------------------------------------------------------
// Intake annuel (commun IA / joueur)
// quantité et qualité selon centre de formation, investissement moyen, réputation
// ---------------------------------------------------------------------------
export function intakeAnnuel(game, club) {
  const it = BALANCE.intake;
  const cats = BALANCE.categories;
  const invMoyen = cats.reduce((a, c) => a + club.jeunes[c.id].invest, 0) / cats.length;
  const qualite = it.qualite.base + club.infra.formation * it.qualite.parNiveauCentre +
    invMoyen * it.qualite.parInvest + club.reputation * it.qualite.parRep;

  const arrivees = [];
  const nbU8 = randInt(game, it.nbU8Min, it.nbU8Max) + Math.floor(club.infra.formation / 2);
  for (let i = 0; i < nbU8; i++) {
    const p = genJoueur(game, {
      age: randInt(game, 7, 8),
      cible: qualite * 0.28 + randFloat(game, -3, 3),
      clubForme: true,
      bonusPotentiel: (club.infra.formation - 1) * it.bonusPotentielCentre,
    });
    p.contrat = { saisons: 99, salaire: 0 };
    club.jeunes.U8.joueurs.push(p);
    arrivees.push({ cat: 'U8', joueur: p });
  }
  // quelques arrivées dans les autres catégories
  for (const cat of cats.slice(1)) {
    const n = randInt(game, 0, it.nbAutresMax);
    for (let i = 0; i < n; i++) {
      const age = randInt(game, cat.ageMin, cat.ageMax);
      const facteurAge = 0.15 + (age - 6) * 0.065;
      const p = genJoueur(game, {
        age, cible: qualite * facteurAge + randFloat(game, -4, 4),
        clubForme: true,
        bonusPotentiel: (club.infra.formation - 1) * it.bonusPotentielCentre,
      });
      p.contrat = { saisons: 99, salaire: age >= 15 ? BALANCE.salaires.jeuneCentre : 0 };
      club.jeunes[cat.id].joueurs.push(p);
      arrivees.push({ cat: cat.id, joueur: p });
    }
  }

  // s'assure que chaque catégorie garde un coach (l'IA remplace automatiquement)
  for (const cat of cats) {
    if (!club.jeunes[cat.id].coach) {
      club.jeunes[cat.id].coach = genCoachJeunes(game, clamp(Math.round(club.infra.formation), 1, 5));
    }
  }
  return arrivees;
}

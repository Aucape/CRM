// Recrutement : scouting (marché des jeunes + marché pro), liste de transferts,
// agents libres, négociations simples, offres reçues pour vos joueurs.

import { BALANCE } from '../config.js';
import { rand, randInt, randFloat, clamp, pick, weightedPick } from './rng.js';
import { genJoueur, noteGlobale, valeurMarchande, salaireDemande, nomComplet, categoriePourAge } from './player.js';
import { retirerJoueur } from './club.js';
import { msg } from './messages.js';
import { mouvementExceptionnel } from './finance.js';

// ---------------------------------------------------------------------------
// Fourchette de potentiel vue par un scout (précision selon son niveau)
// ---------------------------------------------------------------------------
export function fourchettePotentiel(game, joueur, niveauScout, bonusDR = false) {
  let precision = BALANCE.scouting.precisionPotentiel[clamp(niveauScout, 1, 5) - 1];
  if (bonusDR) precision = Math.round(precision * 0.8);
  const centre = joueur.potentiel + randInt(game, -Math.floor(precision / 3), Math.floor(precision / 3));
  return {
    min: clamp(centre - precision, 1, 99),
    max: clamp(centre + precision, 1, 99),
  };
}

// ---------------------------------------------------------------------------
// Marché pro : liste de transferts + agents libres (rafraîchie en début de saison)
// Chaque entrée : { joueur, clubId|null, prix, connu:bool (révélé par un scout) }
// ---------------------------------------------------------------------------
export function regenererMarche(game) {
  const m = BALANCE.mercato;
  const transferts = [];
  // joueurs transférables pris dans les effectifs des clubs IA
  const clubsIA = game.clubs.filter(c => !c.estJoueur);
  let essais = 0;
  while (transferts.length < m.tailleListeTransferts && essais < 200) {
    essais++;
    const club = pick(game, clubsIA);
    const joueur = pick(game, club.joueurs);
    if (!joueur || joueur.age < m.ageMinPro) continue;
    if (transferts.some(t => t.joueurId === joueur.id)) continue;
    const surcote = club.profil === 'acheteur' ? 1.15 : 1.0;
    transferts.push({
      joueurId: joueur.id, clubId: club.id,
      prix: Math.round(valeurMarchande(joueur) * surcote * randFloat(game, 0.9, 1.25) / 1000) * 1000,
    });
  }
  // agents libres générés
  const libres = [];
  for (let i = 0; i < m.tailleAgentsLibres; i++) {
    const age = randInt(game, 20, 33);
    const p = genJoueur(game, { age, cible: randFloat(game, 45, 68) });
    p.contrat = { saisons: 0, salaire: 0 };
    libres.push(p);
  }
  game.marche = { transferts, libres };
}

export function joueurMarche(game, joueurId) {
  for (const t of game.marche.transferts) {
    if (t.joueurId === joueurId) {
      const club = game.clubs.find(c => c.id === t.clubId);
      const joueur = club?.joueurs.find(p => p.id === joueurId);
      if (joueur) return { joueur, club, prix: t.prix, entree: t };
    }
  }
  const libre = game.marche.libres.find(p => p.id === joueurId);
  if (libre) return { joueur: libre, club: null, prix: 0, entree: null };
  return null;
}

// ---------------------------------------------------------------------------
// Négociation d'un transfert (marché pro) — retourne {ok, raison}
// ---------------------------------------------------------------------------
export function negocierTransfert(game, clubJoueur, cible, offreMontant, salaire, dureeSaisons) {
  const m = BALANCE.mercato;
  const { joueur, club, prix } = cible;
  if (clubJoueur.tresorerie < offreMontant) return { ok: false, raison: 'Trésorerie insuffisante.' };

  if (club) {
    // le club vendeur accepte si l'offre couvre son prix (avec une petite marge de négociation)
    const seuil = prix * (1 - m.margeNegociation / 2 + rand(game) * 0.1);
    if (offreMontant < seuil) {
      return { ok: false, raison: `${club.nom} refuse : offre trop basse (il en demande environ ${Math.round(prix / 1000)} k€).` };
    }
  }
  // le joueur accepte si le salaire couvre ses attentes
  const demande = salaireDemande(joueur);
  if (salaire < demande * 0.9) {
    return { ok: false, raison: `${nomComplet(joueur)} refuse : il demande au moins ${Math.round(demande * 0.9)} €/semaine.` };
  }

  // transfert conclu
  if (club) {
    retirerJoueur(club, joueur.id);
    mouvementExceptionnel(club, offreMontant);
    game.marche.transferts = game.marche.transferts.filter(t => t.joueurId !== joueur.id);
    mouvementExceptionnel(clubJoueur, -offreMontant);
  } else {
    game.marche.libres = game.marche.libres.filter(p => p.id !== joueur.id);
  }
  joueur.contrat = { saisons: dureeSaisons, salaire };
  joueur.acheteA = offreMontant;
  joueur.formeAuClub = false;
  joueur.moral = 70;
  joueur.stats = { matchs: 0, buts: 0, passes: 0, notes: 0, minutes: 0 };
  clubJoueur.joueurs.push(joueur);
  if (clubJoueur.saisonStats) clubJoueur.saisonStats.achats += offreMontant;
  return { ok: true };
}

// signature d'un jeune scouté → rejoint le centre de formation
export function signerJeuneScoute(game, clubJoueur, joueur) {
  const frais = BALANCE.scouting.fraisSignatureJeune;
  if (clubJoueur.tresorerie < frais) return { ok: false, raison: 'Trésorerie insuffisante.' };
  const cat = categoriePourAge(joueur.age);
  if (!cat) return { ok: false, raison: 'Joueur trop âgé pour le centre de formation.' };
  mouvementExceptionnel(clubJoueur, -frais);
  joueur.contrat = { saisons: 99, salaire: joueur.age >= 15 ? BALANCE.salaires.jeuneCentre : 0 };
  joueur.formeAuClub = true;
  clubJoueur.jeunes[cat].joueurs.push(joueur);
  return { ok: true, cat };
}

// vente d'un joueur du club du joueur à un club IA
export function vendreJoueur(game, clubJoueur, joueur, montant, clubAcheteur) {
  retirerJoueur(clubJoueur, joueur.id);
  mouvementExceptionnel(clubJoueur, montant);
  if (clubAcheteur) {
    mouvementExceptionnel(clubAcheteur, -montant);
    joueur.contrat = { saisons: randInt(game, 1, 3), salaire: salaireDemande(joueur) };
    joueur.formeAuClub = false;
    clubAcheteur.joueurs.push(joueur);
  }
  const coutInitial = joueur.acheteA || 0;
  if (montant > coutInitial && clubJoueur.saisonStats) clubJoueur.saisonStats.ventesBenefice++;
  if (clubJoueur.saisonStats) clubJoueur.saisonStats.ventes += montant;
}

// ---------------------------------------------------------------------------
// Scouting hebdomadaire du club du joueur
// ---------------------------------------------------------------------------
export function scoutingHebdo(game, club) {
  const sc = BALANCE.scouting;
  const bonusDR = !!club.staff.directeurRecrutement;
  for (const scout of club.staff.scouts) {
    if (!scout.mission) continue;
    let proba = sc.probaRapportHebdo;
    if (bonusDR) proba *= 1 + sc.bonusDirecteurRecrutement;
    if (rand(game) >= proba) continue;

    const mi = scout.mission;
    if (mi.type === 'jeunes') {
      // découvre un jeune (13-19 ans) à intégrer au centre de formation.
      const lo = Math.max(mi.ageMin, sc.ageMinJeunes);
      const hi = Math.min(mi.ageMax, sc.ageMaxJeunes);
      // biais vers les plus jeunes : on garde le MIN de plusieurs tirages
      // → beaucoup plus de 13-15 ans que de 16-19 ans (meilleur pour former).
      let age = randInt(game, lo, hi);
      for (let k = 1; k < sc.jeuneBiaisAge; k++) age = Math.min(age, randInt(game, lo, hi));
      // note actuelle MODESTE et croissante avec l'âge (un 13-14 ans est faible aujourd'hui)
      const cible = sc.jeuneNoteBase + (age - sc.ageMinJeunes) * sc.jeuneNoteParAge
        + scout.niveau * sc.jeuneNoteParNiveau + randFloat(game, -4, 5);
      // ...mais un bon scout repère de gros potentiels (c'est là toute la valeur)
      const bonusPot = scout.niveau * sc.jeuneBonusPotentielParNiveau + randFloat(game, 0, scout.niveau * 2);
      const joueur = genJoueur(game, {
        age, poste: mi.poste || undefined, cible, bonusPotentiel: bonusPot,
      });
      joueur.formeAuClub = true;   // formé au club dès la signature (compte pour les objectifs)
      const fourchette = fourchettePotentiel(game, joueur, scout.niveau, bonusDR);
      const marge = fourchette.min - Math.round(noteGlobale(joueur));
      msg(game, {
        type: 'scout',
        titre: `Rapport de scout : ${nomComplet(joueur)} (${joueur.age} ans, ${joueur.poste})`,
        corps: `${scout.prenom} ${scout.nom} (niv. ${scout.niveau}) a repéré ce jeune.\n` +
          `Note actuelle : ${Math.round(noteGlobale(joueur))} (normal à cet âge)\n` +
          `Potentiel estimé : ${fourchette.min} – ${fourchette.max}` +
          `${marge >= 20 ? '  ⭐ gros potentiel !' : ''}\n` +
          `Frais de signature : ${Math.round(sc.fraisSignatureJeune / 1000)} k€`,
        actions: [
          { label: 'Signer au centre de formation', action: 'signerJeune', data: { joueur } },
          { label: 'Ignorer', action: 'ignorer', data: {} },
        ],
      });
    } else {
      // mission "pro" : évalue un joueur du marché des transferts
      const cibles = game.marche.transferts
        .map(t => joueurMarche(game, t.joueurId))
        .filter(x => x && x.joueur.age >= (mi.ageMin || 15) && x.joueur.age <= (mi.ageMax || 40) &&
          (!mi.poste || x.joueur.poste === mi.poste) && !x.entree.connu);
      if (!cibles.length) continue;
      const cible = pick(game, cibles);
      cible.entree.connu = true;
      cible.entree.fourchette = fourchettePotentiel(game, cible.joueur, scout.niveau, bonusDR);
      msg(game, {
        type: 'scout',
        titre: `Rapport de scout : ${nomComplet(cible.joueur)} (${cible.joueur.age} ans, ${cible.joueur.poste})`,
        corps: `${scout.prenom} ${scout.nom} a supervisé ce joueur de ${cible.club.nom}.\n` +
          `Note actuelle : ${Math.round(noteGlobale(cible.joueur))}\n` +
          `Potentiel estimé : ${cible.entree.fourchette.min} – ${cible.entree.fourchette.max}\n` +
          `Prix demandé : ${Math.round(cible.prix / 1000)} k€\n\nRetrouvez-le dans l'écran Recrutement.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Offres reçues pour les joueurs du club (hebdomadaire)
// ---------------------------------------------------------------------------
export function offresRecuesHebdo(game, club) {
  const m = BALANCE.mercato;
  const enMercato = game.semaine > BALANCE.saison.nbJournees;
  const proba = enMercato ? m.probaOffreRecueHebdo * 3 : m.probaOffreRecueHebdo;
  if (rand(game) >= proba || !club.joueurs.length) return;
  // les clubs IA visent plutôt vos meilleurs joueurs
  const cible = weightedPick(game, club.joueurs, p => Math.pow(Math.max(1, noteGlobale(p) - 40), 2));
  const acheteur = pick(game, game.clubs.filter(c => !c.estJoueur));
  const valeur = valeurMarchande(cible);
  if (acheteur.tresorerie < valeur * 0.8) return;
  const montant = Math.round(valeur * randFloat(game, 0.85, 1.35) / 1000) * 1000;
  msg(game, {
    type: 'transfert',
    titre: `Offre de ${acheteur.nom} pour ${nomComplet(cible)}`,
    corps: `${acheteur.nom} propose ${Math.round(montant / 1000)} k€ pour ${nomComplet(cible)} ` +
      `(${cible.age} ans, ${cible.poste}, note ${Math.round(noteGlobale(cible))}).\n` +
      `Valeur estimée : ${Math.round(valeur / 1000)} k€.`,
    actions: [
      { label: 'Accepter la vente', action: 'vendreAccepter', data: { joueurId: cible.id, montant, clubId: acheteur.id } },
      { label: 'Refuser', action: 'ignorer', data: {} },
    ],
  });
}

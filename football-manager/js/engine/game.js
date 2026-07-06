// Façade du moteur : création de partie, avancement du temps, actions du
// président. C'est le SEUL module que l'UI importe (avec config.js pour les
// libellés). Le moteur ne référence jamais le DOM.

import { BALANCE, SEMAINES_SAISON } from '../config.js';
import { randInt, clamp, rand } from './rng.js';
import { genNomsClubs } from './names.js';
import { creerClub, resetClubIds, trouverJoueur, retirerJoueur } from './club.js';
import { resetIds, noteGlobale, valeurMarchande, salaireDemande, nomComplet, categoriePourAge } from './player.js';
import { resetStaffIds, genCandidats } from './staff.js';
import { genCalendrier, tableVierge, classement, rangClub } from './league.js';
import { simulerSemaine, clubById } from './week.js';
import { finDeSaison, nouvelleSaison, statsSaisonVierges, meilleursDeLaSaison } from './season.js';
import { genObjectifs, libelleObjectif, progressionObjectif, demanderConseil, peutDemander, DEMANDES } from './board.js';
import { accepterOffre, contreProposition, texteOffre, sponsorsHebdo, SLOT_LABELS, BONUS_LABELS, fmtEuro } from './sponsors.js';
import { regenererMarche, negocierTransfert, signerJeuneScoute, vendreJoueur, joueurMarche, fourchettePotentiel } from './market.js';
import { mouvementExceptionnel } from './finance.js';
import { msg, marquerTraite, resetMsgIds } from './messages.js';

export { clubById, classement, rangClub, libelleObjectif, progressionObjectif,
  SLOT_LABELS, BONUS_LABELS, fmtEuro, texteOffre, noteGlobale, valeurMarchande,
  salaireDemande, nomComplet, joueurMarche, meilleursDeLaSaison, trouverJoueur,
  fourchettePotentiel, categoriePourAge, DEMANDES };

// demandes au conseil (délègue au module board, puis sauvegarde côté UI)
export function faireDemandeConseil(game, type) {
  return demanderConseil(game, clubJoueur(game), type);
}
export function demandeDisponible(game, type) {
  return peutDemander(game, clubJoueur(game), type);
}

// ---------------------------------------------------------------------------
// NOUVELLE PARTIE
// ---------------------------------------------------------------------------
export function nouvellePartie({ nomClub = null, seed = null } = {}) {
  const game = {
    version: 1,
    rngState: seed ?? (Date.now() & 0x7fffffff),
    saison: 1, semaine: 1, semainesTotal: 0,
    phase: 'saison',
    clubs: [], clubJoueurId: null,
    ligues: { pro: null, jeunes: {} },
    rapports: {},
    messages: [],
    marche: { transferts: [], libres: [] },
    candidatsStaff: {},
    sponsorsFaches: [],
    gameOver: null,
  };
  resetIds(); resetStaffIds(); resetClubIds(); resetMsgIds();

  // 16 clubs — le club du joueur reçoit le rang de force configuré
  const noms = genNomsClubs(game, BALANCE.saison.nbClubs);
  const rangJoueur = BALANCE.depart.rangForceInitial;
  for (let i = 0; i < BALANCE.saison.nbClubs; i++) {
    const estJoueur = i === rangJoueur;
    const club = creerClub(game, {
      nom: estJoueur && nomClub ? nomClub : noms[i].nom,
      ville: noms[i].ville, couleurs: noms[i].couleurs,
      estJoueur, rangForce: i,
    });
    if (estJoueur) game.clubJoueurId = club.id;
    game.clubs.push(club);
  }

  const clubJoueur = clubById(game, game.clubJoueurId);
  clubJoueur.saisonStats = statsSaisonVierges();
  clubJoueur.objectifs = genObjectifs(game, clubJoueur);
  clubJoueur.budgetMercato = BALANCE.finances.budgetMercatoBase +
    Math.round(clubJoueur.confianceConseil * BALANCE.finances.budgetMercatoParConfiance);

  // calendriers
  const ids = game.clubs.map(c => c.id);
  game.ligues.pro = { calendrier: genCalendrier(game, ids), table: tableVierge(ids), resultats: [] };
  for (const cat of BALANCE.categories) {
    game.ligues.jeunes[cat.id] = { calendrier: genCalendrier(game, ids), table: tableVierge(ids), resultats: [] };
  }

  regenererMarche(game);

  msg(game, {
    type: 'conseil', titre: `Bienvenue à la présidence de ${clubJoueur.nom} !`,
    corps: `Le conseil d'administration vous confie les clés du club.\n\n` +
      `Vous ne choisissez ni la composition ni la tactique : ce sont vos coachs qui disputent les matchs. ` +
      `Votre rôle : construire le club — recruter joueurs et coachs, développer les infrastructures, ` +
      `signer des sponsors et surtout former les jeunes, des U8 aux U19.\n\n` +
      `Objectifs de la saison :\n` +
      clubJoueur.objectifs.map(o => `• ${libelleObjectif(o)}`).join('\n') +
      `\n\nTrésorerie : ${fmtEuro(clubJoueur.tresorerie)} — Budget mercato : ${fmtEuro(clubJoueur.budgetMercato)}` +
      `\nConfiance du conseil : ${Math.round(clubJoueur.confianceConseil)}/100`,
  });
  return game;
}

export function clubJoueur(game) {
  return clubById(game, game.clubJoueurId);
}

// ---------------------------------------------------------------------------
// SEMAINE SUIVANTE (transitions de saison incluses)
// ---------------------------------------------------------------------------
export function avancerSemaine(game) {
  if (game.gameOver) return;
  simulerSemaine(game);
  if (game.semaine === BALANCE.saison.nbJournees + 1 && game.phase === 'saison') {
    finDeSaison(game);
  }
  if (game.semaine > SEMAINES_SAISON) {
    nouvelleSaison(game);
  }
}

// ---------------------------------------------------------------------------
// ACTIONS DEPUIS LA MESSAGERIE (offres de sponsors, scouts, transferts)
// ---------------------------------------------------------------------------
export function executerActionMessage(game, messageId, action) {
  const club = clubJoueur(game);
  const data = action.data || {};
  switch (action.action) {
    case 'sponsorAccepter': {
      if (club.sponsors[data.offre.slot]) { marquerTraite(game, messageId, 'Slot déjà occupé.'); return; }
      accepterOffre(game, club, data.offre);
      marquerTraite(game, messageId, `Contrat signé avec ${data.offre.nom} (${fmtEuro(data.offre.hebdo)}/sem).`);
      break;
    }
    case 'sponsorContre': {
      if (data.offre.contreFaite) { marquerTraite(game, messageId, 'Contre-proposition déjà faite.'); return; }
      const ok = contreProposition(game, club, data.offre, data.hausse);
      if (ok) {
        const m = game.messages.find(x => x.id === messageId);
        if (m) {
          m.corps = texteOffre(data.offre) + `\n➤ Contre-proposition acceptée ! Nouveau montant : ${fmtEuro(data.offre.hebdo)}/sem.`;
          m.actions = m.actions.filter(a => a.action !== 'sponsorContre');
        }
      } else {
        // vexé ou pas : 50/50 il retire l'offre
        if (rand(game) < 0.5) {
          marquerTraite(game, messageId, `${data.offre.nom} a mal pris la contre-proposition et retire son offre.`);
        } else {
          const m = game.messages.find(x => x.id === messageId);
          if (m) {
            m.corps += `\n➤ Contre-proposition refusée : c'est à prendre ou à laisser.`;
            m.actions = m.actions.filter(a => a.action !== 'sponsorContre');
          }
        }
      }
      break;
    }
    case 'sponsorDecliner':
      marquerTraite(game, messageId, 'Offre déclinée.');
      break;
    case 'signerJeune': {
      const r = signerJeuneScoute(game, club, data.joueur);
      marquerTraite(game, messageId, r.ok
        ? `${nomComplet(data.joueur)} rejoint les ${r.cat}.`
        : `Échec : ${r.raison}`);
      break;
    }
    case 'vendreAccepter': {
      const res = trouverJoueur(club, data.joueurId);
      if (!res) { marquerTraite(game, messageId, 'Ce joueur a déjà quitté le club.'); return; }
      const acheteur = clubById(game, data.clubId);
      vendreJoueur(game, club, res.joueur, data.montant, acheteur);
      marquerTraite(game, messageId, `Vente conclue : ${fmtEuro(data.montant)} encaissés.`);
      break;
    }
    case 'ignorer':
    default:
      marquerTraite(game, messageId);
  }
}

// ---------------------------------------------------------------------------
// MERCATO : achat / vente / négociation
// ---------------------------------------------------------------------------
export function acheterJoueur(game, joueurId, offreMontant, salaire, dureeSaisons) {
  const club = clubJoueur(game);
  const cible = joueurMarche(game, joueurId);
  if (!cible) return { ok: false, raison: 'Joueur plus disponible.' };
  if (offreMontant > club.budgetMercato) {
    return { ok: false, raison: `Le conseil refuse : budget mercato limité à ${fmtEuro(club.budgetMercato)}.` };
  }
  const r = negocierTransfert(game, club, cible, offreMontant, salaire, dureeSaisons);
  if (r.ok) {
    club.budgetMercato -= offreMontant;
    msg(game, {
      type: 'transfert', titre: `Recrue : ${nomComplet(cible.joueur)}`,
      corps: `${nomComplet(cible.joueur)} (${cible.joueur.age} ans, ${cible.joueur.poste}) rejoint le club ` +
        `pour ${fmtEuro(offreMontant)} — ${fmtEuro(salaire)}/sem sur ${dureeSaisons} saison(s).`,
    });
  }
  return r;
}

export function mettreEnVente(game, joueurId) {
  // vente immédiate simplifiée : un club IA se positionne à ~85-105 % de la valeur
  const club = clubJoueur(game);
  const res = trouverJoueur(club, joueurId);
  if (!res || res.ou !== 'pro') return { ok: false, raison: 'Introuvable dans l’effectif pro.' };
  const j = res.joueur;
  const interesses = game.clubs.filter(c => !c.estJoueur && c.tresorerie > valeurMarchande(j));
  if (!interesses.length || rand(game) < 0.15) {
    return { ok: false, raison: 'Aucun club ne se positionne cette semaine. Réessayez plus tard.' };
  }
  const acheteur = interesses[randInt(game, 0, interesses.length - 1)];
  const montant = Math.round(valeurMarchande(j) * (0.85 + rand(game) * 0.2) / 1000) * 1000;
  vendreJoueur(game, club, j, montant, acheteur);
  msg(game, {
    type: 'transfert', titre: `Vente : ${nomComplet(j)} → ${acheteur.nom}`,
    corps: `Transfert conclu pour ${fmtEuro(montant)}.`,
  });
  return { ok: true, montant, acheteur: acheteur.nom };
}

export function libererJoueur(game, joueurId) {
  const club = clubJoueur(game);
  const res = trouverJoueur(club, joueurId);
  if (!res) return { ok: false };
  const indemnite = res.joueur.contrat.salaire * 8;   // 8 semaines de salaire
  if (club.tresorerie < indemnite) return { ok: false, raison: 'Trésorerie insuffisante pour l’indemnité.' };
  retirerJoueur(club, joueurId);
  mouvementExceptionnel(club, -indemnite);
  return { ok: true, indemnite };
}

export function prolongerContrat(game, joueurId, saisons) {
  const club = clubJoueur(game);
  const res = trouverJoueur(club, joueurId);
  if (!res || res.ou !== 'pro') return { ok: false };
  const j = res.joueur;
  const salaire = Math.round(salaireDemande(j) * (1 + 0.03 * saisons));
  j.contrat = { saisons, salaire };
  return { ok: true, salaire };
}

// fait signer un contrat pro à un jeune du centre (dès 15 ans) — il rejoint
// l'équipe première tout en restant éligible chez les jeunes jusqu'à 19 ans
export function signerProJeune(game, joueurId) {
  const club = clubJoueur(game);
  const res = trouverJoueur(club, joueurId);
  if (!res || res.ou === 'pro') return { ok: false, raison: 'Introuvable au centre de formation.' };
  const j = res.joueur;
  if (j.age < BALANCE.mercato.ageMinPro) {
    return { ok: false, raison: `Contrat pro possible à partir de ${BALANCE.mercato.ageMinPro} ans.` };
  }
  retirerJoueur(club, joueurId);
  j.contrat = { saisons: 3, salaire: salaireDemande(j) };
  j.surclasse = false;
  j.directive = 'auto';
  club.joueurs.push(j);
  msg(game, {
    type: 'jeunes', titre: `Premier contrat pro : ${nomComplet(j)}`,
    corps: `${nomComplet(j)} (${j.age} ans, ${j.poste}) signe son premier contrat professionnel ` +
      `(${fmtEuro(j.contrat.salaire)}/sem, 3 saisons). Étant ${j.age <= 19 ? 'encore éligible en jeunes, vous pouvez fixer sa directive dans sa fiche.' : 'désormais un pro à part entière.'}`,
  });
  return { ok: true };
}

export function basculerPartirFinContrat(game, joueurId) {
  const club = clubJoueur(game);
  const res = trouverJoueur(club, joueurId);
  if (res && res.ou === 'pro') res.joueur.partirFinContrat = !res.joueur.partirFinContrat;
}

// ---------------------------------------------------------------------------
// DIRECTIVES ET SURCLASSEMENT
// ---------------------------------------------------------------------------
export function definirDirective(game, joueurId, directive) {
  const club = clubJoueur(game);
  const res = trouverJoueur(club, joueurId);
  if (res && res.ou === 'pro' && res.joueur.age <= 19) res.joueur.directive = directive;
}

export function definirSurclassement(game, joueurId, actif) {
  const club = clubJoueur(game);
  const res = trouverJoueur(club, joueurId);
  if (!res || res.ou === 'pro') return;
  // pas de surclassement pour la catégorie la plus haute (U19)
  if (res.ou === 'U19' && actif) return;
  res.joueur.surclasse = !!actif;
}

// ---------------------------------------------------------------------------
// JEUNES : curseur d'investissement
// ---------------------------------------------------------------------------
export function definirInvestissement(game, catId, valeur) {
  const club = clubJoueur(game);
  if (club.jeunes[catId]) club.jeunes[catId].invest = clamp(Math.round(valeur), 0, 10);
}

// ---------------------------------------------------------------------------
// STAFF : marché des candidats, embauche, licenciement, missions de scouts
// ---------------------------------------------------------------------------
export function candidatsStaff(game, role, catId = null) {
  const cle = catId ? `${role}:${catId}` : role;
  // liste régénérée à chaque saison ou à la première demande
  if (!game.candidatsStaff[cle] || game.candidatsStaff[cle].saison !== game.saison) {
    game.candidatsStaff[cle] = { saison: game.saison, liste: genCandidats(game, role, 4, catId) };
  }
  return game.candidatsStaff[cle].liste;
}

export function embaucherStaff(game, role, candidatId, catId = null) {
  const club = clubJoueur(game);
  const cle = catId ? `${role}:${catId}` : role;
  const liste = game.candidatsStaff[cle]?.liste || [];
  const candidat = liste.find(c => c.id === candidatId);
  if (!candidat) return { ok: false, raison: 'Candidat indisponible.' };

  if (role === 'scout') {
    if (club.staff.scouts.length >= BALANCE.scouting.maxScouts) {
      return { ok: false, raison: `Maximum ${BALANCE.scouting.maxScouts} scouts.` };
    }
    club.staff.scouts.push(candidat);
  } else if (role === 'coachJeunes') {
    if (!catId || !club.jeunes[catId]) return { ok: false, raison: 'Catégorie invalide.' };
    club.jeunes[catId].coach = candidat;
  } else if (role === 'adjoint' && catId) {
    if (!BALANCE.categoriesStaffEtendu.includes(catId)) return { ok: false, raison: 'Adjoint possible seulement à partir des U14.' };
    club.jeunes[catId].adjoint = candidat;
  } else if (role === 'prepa' && catId) {
    if (!BALANCE.categoriesStaffEtendu.includes(catId)) return { ok: false, raison: 'Préparateur possible seulement à partir des U14.' };
    club.jeunes[catId].prepa = candidat;
  } else {
    club.staff[role] = candidat;
  }
  liste.splice(liste.indexOf(candidat), 1);
  return { ok: true };
}

export function licencierStaff(game, role, catId = null, scoutId = null) {
  const club = clubJoueur(game);
  let sortant = null;
  if (role === 'scout') {
    const i = club.staff.scouts.findIndex(s => s.id === scoutId);
    if (i >= 0) sortant = club.staff.scouts.splice(i, 1)[0];
  } else if (catId) {
    const equipe = club.jeunes[catId];
    const champ = role === 'coachJeunes' ? 'coach' : role;
    sortant = equipe[champ];
    equipe[champ] = null;
  } else {
    sortant = club.staff[role];
    club.staff[role] = null;
  }
  if (sortant) mouvementExceptionnel(club, -sortant.salaire * 6);   // indemnité : 6 semaines
  return { ok: !!sortant };
}

export function definirMissionScout(game, scoutId, mission) {
  const club = clubJoueur(game);
  const scout = club.staff.scouts.find(s => s.id === scoutId);
  if (scout) scout.mission = mission;   // {type:'jeunes'|'pro', ageMin, ageMax, poste|null}
}

// ---------------------------------------------------------------------------
// INFRASTRUCTURES
// ---------------------------------------------------------------------------
export function lancerTravaux(game, batiment) {
  const club = clubJoueur(game);
  const niveau = club.infra[batiment];
  if (niveau >= 5) return { ok: false, raison: 'Niveau maximum atteint.' };
  if (club.travaux.some(t => t.batiment === batiment)) return { ok: false, raison: 'Travaux déjà en cours sur ce bâtiment.' };
  const cout = Math.round(BALANCE.infra.coutNiveau[niveau - 1] * BALANCE.infra.facteurCout[batiment]);
  if (club.tresorerie < cout) return { ok: false, raison: `Trésorerie insuffisante (coût : ${fmtEuro(cout)}).` };
  mouvementExceptionnel(club, -cout);
  const delai = BALANCE.infra.delaiNiveau[niveau - 1];
  club.travaux.push({ batiment, versNiveau: niveau + 1, semainesRestantes: delai });
  return { ok: true, cout, delai };
}

export function coutTravaux(batiment, niveauActuel) {
  if (niveauActuel >= 5) return null;
  return {
    cout: Math.round(BALANCE.infra.coutNiveau[niveauActuel - 1] * BALANCE.infra.facteurCout[batiment]),
    delai: BALANCE.infra.delaiNiveau[niveauActuel - 1],
  };
}

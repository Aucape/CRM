// Moteur de simulation des matchs.
// Le coach sélectionne le 11 et le banc, le match est entièrement simulé :
// occasions, buts, buteurs/passeurs, cartons, blessures, notes /10, stats.

import { BALANCE } from '../config.js';
import { rand, randInt, randFloat, randGauss, clamp, weightedPick, pick } from './rng.js';
import { noteEffective, noteGlobale, nomComplet, forme } from './player.js';

// ---------------------------------------------------------------------------
// Sélection de l'équipe par le coach
// ---------------------------------------------------------------------------

function disponible(p) {
  return !p.blessure && p.suspension <= 0;
}

/**
 * Sélectionne 11 + banc dans un pool de joueurs.
 * Retourne { onze: [{joueur, poste}], banc: [joueur] }
 */
export function selectionnerEquipe(game, pool, prefTactique = 'bal') {
  const formation = BALANCE.match.formations[prefTactique] || BALANCE.match.formations.bal;
  const dispos = pool.filter(disponible);
  const pris = new Set();
  const onze = [];

  const prendre = (poste, n) => {
    // meilleurs au poste selon la note effective à ce poste (forme/fatigue/moral inclus)
    const candidats = dispos
      .filter(p => !pris.has(p.id))
      .map(p => ({ p, score: noteEffective(p, poste) * (p.poste === poste ? 1 : 0.82) }))
      .sort((a, b) => b.score - a.score);
    for (let i = 0; i < n && i < candidats.length; i++) {
      pris.add(candidats[i].p.id);
      onze.push({ joueur: candidats[i].p, poste });
    }
  };

  prendre('G', 1);
  prendre('DEF', formation.DEF);
  prendre('MIL', formation.MIL);
  prendre('ATT', formation.ATT);

  // banc : 1 gardien + meilleurs restants
  const banc = [];
  const restants = dispos.filter(p => !pris.has(p.id));
  const gardien = restants.filter(p => p.poste === 'G').sort((a, b) => noteEffective(b) - noteEffective(a))[0];
  if (gardien) { banc.push(gardien); pris.add(gardien.id); }
  const autres = restants.filter(p => !pris.has(p.id)).sort((a, b) => noteEffective(b) - noteEffective(a));
  for (const p of autres) {
    if (banc.length >= BALANCE.match.tailleBanc) break;
    banc.push(p);
  }
  return { onze, banc };
}

// ---------------------------------------------------------------------------
// Force des lignes
// ---------------------------------------------------------------------------
function forcesEquipe(game, onze, coach, domicile) {
  const m = BALANCE.match;
  const notes = { G: [], DEF: [], MIL: [], ATT: [] };
  for (const { joueur, poste } of onze) {
    notes[poste].push(noteEffective(joueur, poste));
  }
  const moy = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 20;
  const gk = moy(notes.G), def = moy(notes.DEF), mil = moy(notes.MIL), att = moy(notes.ATT);

  const pref = coach?.prefTactique || 'bal';
  const mod = m.tactiqueMod[pref];
  const bonusCoach = 1 + (coach?.tactique || 40) * m.bonusTactiqueCoach;
  const bruit = 1 + randGauss(game) * m.aleatoireForce;   // part de chance du jour
  const dom = domicile ? m.avantageDomicile : 1;
  const global = bonusCoach * bruit * dom;

  return {
    attaque: (att * 0.6 + mil * 0.4) * mod.atk * global,
    defense: (def * 0.55 + gk * 0.30 + mil * 0.15) * mod.def * global,
    milieu: mil * global,
  };
}

// ---------------------------------------------------------------------------
// Simulation d'un match
// opts: { categorie: null|'U8'..'U19', detail: bool, clubDom, clubExt, coachDom, coachExt }
// Retourne le rapport de match ; mutations : stats, fatigue, forme, moral, blessures.
// ---------------------------------------------------------------------------
export function simulerMatch(game, poolDom, poolExt, opts) {
  const m = BALANCE.match;
  const jeunes = !!opts.categorie;

  const selDom = selectionnerEquipe(game, poolDom, opts.coachDom?.prefTactique);
  const selExt = selectionnerEquipe(game, poolExt, opts.coachExt?.prefTactique);

  const fDom = forcesEquipe(game, selDom.onze, opts.coachDom, true);
  const fExt = forcesEquipe(game, selExt.onze, opts.coachExt, false);

  // buts attendus
  const mult = jeunes ? m.jeunesButsMult : 1;
  const xgDom = clamp(m.xgBase * Math.pow(fDom.attaque / Math.max(20, fExt.defense), m.xgExposant) * mult, 0.05, m.xgMax);
  const xgExt = clamp(m.xgBase * Math.pow(fExt.attaque / Math.max(20, fDom.defense), m.xgExposant) * mult, 0.05, m.xgMax);

  const bd = poisson(game, xgDom);
  const be = poisson(game, xgExt);

  // minutes jouées (3 remplacements simulés)
  const minutesDom = attribuerMinutes(game, selDom);
  const minutesExt = attribuerMinutes(game, selExt);

  // buteurs et passeurs
  const buts = [];
  genButs(game, bd, selDom, minutesDom, opts.domId, buts);
  genButs(game, be, selExt, minutesExt, opts.extId, buts);
  buts.sort((a, b) => a.minute - b.minute);

  // stats de match
  const totalMil = fDom.milieu + fExt.milieu;
  const possDom = clamp(Math.round(50 + ((fDom.milieu - fExt.milieu) / totalMil) * 60 + randGauss(game) * 3), 25, 75);
  const statsDom = genStats(game, xgDom, bd, possDom);
  const statsExt = genStats(game, xgExt, be, 100 - possDom);

  // cartons
  statsDom.jaunes = poisson(game, m.cartonsJaunesMoyens);
  statsExt.jaunes = poisson(game, m.cartonsJaunesMoyens);
  statsDom.rouges = rand(game) < m.probaRouge ? 1 : 0;
  statsExt.rouges = rand(game) < m.probaRouge ? 1 : 0;

  // notes /10
  const notes = [];
  noter(game, selDom, minutesDom, buts, opts.domId, bd, be, xgExt, notes);
  noter(game, selExt, minutesExt, buts, opts.extId, be, bd, xgDom, notes);

  // homme du match
  const homme = notes.slice().sort((a, b) => b.note - a.note)[0] || null;

  // application aux joueurs : stats, fatigue, forme, moral, blessures, suspensions
  appliquer(game, selDom, minutesDom, notes, bd > be ? 'V' : bd < be ? 'D' : 'N', opts.clubDom, statsDom.rouges, jeunes);
  appliquer(game, selExt, minutesExt, notes, be > bd ? 'V' : be < bd ? 'D' : 'N', opts.clubExt, statsExt.rouges, jeunes);

  const rapport = {
    categorie: opts.categorie || null,
    domId: opts.domId, extId: opts.extId,
    bd, be,
    buts: buts.map(b => ({
      clubId: b.clubId, minute: b.minute,
      buteur: b.buteur ? { id: b.buteur.id, nom: nomComplet(b.buteur) } : null,
      passeur: b.passeur ? { id: b.passeur.id, nom: nomComplet(b.passeur) } : null,
    })),
  };
  if (opts.detail) {
    rapport.stats = { dom: statsDom, ext: statsExt, possDom, possExt: 100 - possDom };
    rapport.notes = notes.map(n => ({
      joueurId: n.joueur.id, nom: nomComplet(n.joueur), poste: n.poste,
      clubId: n.clubId, note: n.note, buts: n.buts, passes: n.passes, minutes: n.minutes,
    }));
    rapport.homme = homme ? { joueurId: homme.joueur.id, nom: nomComplet(homme.joueur), note: homme.note } : null;
    rapport.compos = {
      dom: selDom.onze.map(o => ({ id: o.joueur.id, nom: nomComplet(o.joueur), poste: o.poste })),
      ext: selExt.onze.map(o => ({ id: o.joueur.id, nom: nomComplet(o.joueur), poste: o.poste })),
    };
  }
  // joueurs utilisés (pour la double éligibilité pro/jeunes la même semaine)
  rapport._utilises = new Set();
  for (const [pl, min] of minutesDom) if (min > 0) rapport._utilises.add(pl.id);
  for (const [pl, min] of minutesExt) if (min > 0) rapport._utilises.add(pl.id);
  return rapport;
}

function poisson(game, lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(game); } while (p > L && k < 12);
  return k - 1;
}

// minutes : Map(joueur → minutes). 3 remplacements aux minutes configurées.
function attribuerMinutes(game, sel) {
  const minutes = new Map();
  for (const { joueur } of sel.onze) minutes.set(joueur, 90);
  const sortants = sel.onze.filter(o => o.poste !== 'G');
  const entrants = sel.banc.filter(p => p.poste !== 'G');
  const nSubs = Math.min(BALANCE.match.minutesRemplacement.length, entrants.length, sortants.length);
  for (let i = 0; i < nSubs; i++) {
    const minute = BALANCE.match.minutesRemplacement[i] + randInt(game, -4, 4);
    // sort le joueur le plus fatigué / le moins bien noté
    const idx = randInt(game, 0, sortants.length - 1);
    const out = sortants.splice(idx, 1)[0];
    minutes.set(out.joueur, minute);
    minutes.set(entrants[i], 90 - minute);
  }
  for (const p of sel.banc) if (!minutes.has(p)) minutes.set(p, 0);
  return minutes;
}

function genButs(game, n, sel, minutes, clubId, out) {
  if (n === 0) return;
  const joueurs = [...minutes.entries()].filter(([, min]) => min > 0).map(([p]) => p);
  if (!joueurs.length) return;
  const poidsButeur = p => {
    const posMult = p.poste === 'ATT' ? 4 : p.poste === 'MIL' ? 1.8 : p.poste === 'DEF' ? 0.4 : 0.02;
    return Math.max(1, p.attrs.att) * posMult;
  };
  const poidsPasseur = p => {
    const posMult = p.poste === 'ATT' ? 1.5 : p.poste === 'MIL' ? 2.2 : p.poste === 'DEF' ? 0.6 : 0.05;
    return Math.max(1, p.attrs.tec) * posMult;
  };
  for (let i = 0; i < n; i++) {
    const buteur = weightedPick(game, joueurs, poidsButeur);
    let passeur = null;
    if (rand(game) < 0.7 && joueurs.length > 1) {
      do { passeur = weightedPick(game, joueurs, poidsPasseur); } while (passeur === buteur);
    }
    out.push({ clubId, minute: randInt(game, 1, 90), buteur, passeur });
  }
}

function genStats(game, xg, buts, poss) {
  const tirs = Math.max(buts, Math.round(xg * 4.5 + randGauss(game) * 2 + poss / 25));
  const cadres = clamp(Math.round(buts + (tirs - buts) * randFloat(game, 0.2, 0.45)), buts, tirs);
  return {
    tirs, cadres,
    corners: Math.max(0, Math.round(tirs * randFloat(game, 0.4, 0.7))),
    fautes: randInt(game, 6, 16),
    jaunes: 0, rouges: 0,
  };
}

function noter(game, sel, minutes, buts, clubId, butsPour, butsContre, xgContre, out) {
  const resultat = butsPour > butsContre ? 0.4 : butsPour < butsContre ? -0.4 : 0;
  for (const [joueur, min] of minutes.entries()) {
    if (min <= 0) continue;
    const poste = sel.onze.find(o => o.joueur === joueur)?.poste || joueur.poste;
    const nbButs = buts.filter(b => b.clubId === clubId && b.buteur === joueur).length;
    const nbPasses = buts.filter(b => b.clubId === clubId && b.passeur === joueur).length;
    let note = 6.1 + resultat + randGauss(game) * 0.55;
    note += nbButs * 1.0 + nbPasses * 0.5;
    note += (noteGlobale(joueur, poste) - 60) * 0.012;    // les bons joueurs notent mieux
    if (poste === 'G') note += clamp((xgContre - butsContre) * 0.45, -1.2, 1.5); // gardien : arrêts vs attendu
    if (poste === 'DEF' && butsContre === 0) note += 0.5;
    note = clamp(Math.round(note * 10) / 10, 1, 10);
    out.push({ joueur, poste, clubId, note, buts: nbButs, passes: nbPasses, minutes: min });
  }
}

function appliquer(game, sel, minutes, notes, resultat, club, rouges, jeunes) {
  const c = BALANCE.condition;
  const bl = BALANCE.blessures;
  const tous = [...minutes.entries()];
  const joueursNotes = new Map(notes.map(n => [n.joueur, n]));

  // suspension après rouge : un titulaire de champ au hasard
  if (rouges > 0) {
    const champ = tous.filter(([p, min]) => min > 0 && p.poste !== 'G');
    if (champ.length) pick(game, champ)[0].suspension = BALANCE.match.suspensionRouge + 1;
  }

  for (const [p, min] of tous) {
    if (min > 0) {
      const n = joueursNotes.get(p);
      p._minSemaine = (p._minSemaine || 0) + min;   // minutes de la semaine (formule de progression)
      p.fatigue = clamp(p.fatigue + (min / 90) * c.fatigueParMatch, 0, 100);
      p.stats.matchs++;
      p.stats.minutes += min;
      if (n) {
        p.stats.buts += n.buts;
        p.stats.passes += n.passes;
        p.stats.notes += n.note;
        p.formeNotes.push(n.note);
        if (p.formeNotes.length > 5) p.formeNotes.shift();
      }
      p.moral = clamp(p.moral + c.moralTitulaire +
        (resultat === 'V' ? c.moralVictoire : resultat === 'D' ? c.moralDefaite : c.moralNul), 0, 100);
      // blessure ?
      let proba = bl.probaBaseParMatch * (min / 90);
      if (p.fatigue > 70) proba *= bl.facteurFatigue;
      if (p.surclasse) proba *= BALANCE.surclassement.risqueBlessureMult;
      if (club) proba *= 1 - club.infra.entrainement * bl.reducCentreEntrainement;
      if (rand(game) < proba) {
        let duree = 1 + Math.floor(Math.pow(rand(game), 1.6) * (bl.dureeMax - 1));
        if (club) {
          duree *= 1 - club.infra.infirmerie * bl.reducInfirmerieParNiveau;
          if (club.staff?.medecin) duree *= 1 - bl.reducMedecin;
        }
        duree = Math.max(bl.dureeMin, Math.round(duree));
        p.blessure = {
          semaines: duree,
          longue: duree >= bl.seuilLongueDuree,
          type: pick(game, ['entorse de la cheville', 'élongation', 'déchirure musculaire',
            'contusion au genou', 'pubalgie', 'fracture de fatigue', 'lésion aux ischios']),
        };
      }
    } else {
      p.moral = clamp(p.moral + c.moralRemplacantNonEntre, 0, 100);
    }
  }
}

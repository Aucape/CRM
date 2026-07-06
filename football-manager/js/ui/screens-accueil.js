// Écrans : titre / nouvelle partie, dashboard (bureau), messagerie, conseil,
// résultats de la semaine, sauvegardes, game over.

import {
  clubJoueur, clubById, avancerSemaine, executerActionMessage, nouvellePartie,
  libelleObjectif, progressionObjectif, rangClub, fmtEuro as fE,
  DEMANDES, demandeDisponible, faireDemandeConseil,
} from '../engine/game.js';
import { BALANCE } from '../config.js';
import { S, rerender, naviguer, ouvrirModale, fermerModale, autoSave, defActions } from './state.js';
import { esc, jauge, TYPE_MSG_ICO, fmtEuro } from './helpers.js';
import { sauvegarder, charger, listerSlots, supprimer, SLOTS } from '../storage.js';

// ---------------------------------------------------------------------------
// Écran titre / nouvelle partie
// ---------------------------------------------------------------------------
export function rTitre() {
  const slots = S.slotsMeta || [];
  const reprises = slots.filter(Boolean);
  return `<div class="ecran-titre">
    <div class="logo-ballon">⚽</div>
    <h1>Président FC</h1>
    <p class="sous-titre">Vous êtes le président. Vos coachs jouent les matchs.
    Construisez le club, formez les jeunes, visez le titre.</p>
    <input id="nom-club" placeholder="Nom de votre club" value="FC Belleville" maxlength="28">
    <button class="btn btn-primaire btn-large" style="max-width:300px" data-act="nouvellePartie">Nouvelle partie</button>
    ${reprises.length ? `<button class="btn btn-large" style="max-width:300px" data-act="ouvrirSauvegardes">Charger une partie</button>` : ''}
    <p class="mini">Jeu 100 % hors ligne — sauvegarde automatique locale</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------
export function rGameOver() {
  const go = S.game.gameOver;
  const club = clubJoueur(S.game);
  return `<div class="game-over">
    <div style="font-size:56px">${go.type === 'faillite' ? '💸' : '🪑'}</div>
    <h1>${esc(go.titre)}</h1>
    <p>${esc(go.texte)}</p>
    <p class="mini">${esc(club.nom)} — ${S.game.saison} saison(s), confiance ${Math.round(club.confianceConseil)}/100, trésorerie ${fmtEuro(club.tresorerie)}</p>
    <button class="btn btn-primaire btn-large" style="max-width:300px" data-act="retourTitre">Retour à l'accueil</button>
  </div>`;
}

// ---------------------------------------------------------------------------
// Accueil : bureau / messagerie / conseil
// ---------------------------------------------------------------------------
export function rAccueil() {
  const sous = S.sous.accueil;
  const tabs = [['bureau', 'Bureau'], ['messagerie', 'Messagerie'], ['conseil', 'Conseil']];
  const nonLus = S.game.messages.filter(m => !m.lu).length;
  return `
    <div class="onglets">
      ${tabs.map(([id, lib]) => `<button class="${sous === id ? 'actif' : ''}" data-act="sousOnglet" data-arg='${JSON.stringify({ o: 'accueil', s: id })}'>${lib}${id === 'messagerie' && nonLus ? ` (${nonLus})` : ''}</button>`).join('')}
    </div>
    ${sous === 'bureau' ? rBureau() : sous === 'messagerie' ? rMessagerie() : rConseil()}`;
}

function rBureau() {
  const g = S.game, club = clubJoueur(g);
  const enSaison = g.semaine <= BALANCE.saison.nbJournees;

  // prochain match
  let prochainHtml = `<p class="mini">Mercato d'intersaison — pas de match cette semaine.</p>`;
  if (enSaison) {
    const j = g.ligues.pro.calendrier[g.semaine - 1];
    const m = j.find(x => x.dom === club.id || x.ext === club.id);
    const adv = clubById(g, m.dom === club.id ? m.ext : m.dom);
    const rangAdv = rangClub(g.ligues.pro.table, adv.id);
    const rangMoi = rangClub(g.ligues.pro.table, club.id);
    prochainHtml = `<div class="ligne-flex">
      <div><b>${m.dom === club.id ? '🏠 Domicile' : '✈️ Extérieur'}</b> vs ${esc(adv.nom)}
        <div class="mini">Journée ${g.semaine}/30 — vous : ${rangMoi}ᵉ, adversaire : ${rangAdv}ᵉ</div></div>
    </div>`;
  }

  // dernier résultat du club
  let dernierHtml = '';
  const derniers = g.ligues.pro.resultats.slice(-1)[0];
  if (derniers) {
    const m = derniers.matchs.find(x => x.domId === club.id || x.extId === club.id);
    if (m) {
      const dom = clubById(g, m.domId), ext = clubById(g, m.extId);
      dernierHtml = `<div class="carte"><h3>Dernier match (J${derniers.journee})</h3>
        <div class="score-ligne">
          <span class="score-eq dom">${esc(dom.nom)}</span>
          <span class="score-val ${m.rapportId ? 'cliquable' : ''}" ${m.rapportId ? `data-act="voirRapport" data-arg='${JSON.stringify({ id: m.rapportId })}'` : ''}>${m.bd} – ${m.be}</span>
          <span class="score-eq">${esc(ext.nom)}</span>
        </div>
        ${m.rapportId ? `<div class="centre" style="margin-top:6px"><button class="btn btn-petit" data-act="voirRapport" data-arg='${JSON.stringify({ id: m.rapportId })}'>Fiche du match</button></div>` : ''}
      </div>`;
    }
  }

  // alertes
  const alertes = [];
  const blesses = club.joueurs.filter(p => p.blessure);
  if (blesses.length) alertes.push(`🤕 ${blesses.length} blessé(s) en équipe pro`);
  if (club.tresorerie < 0) alertes.push(`<span class="texte-ko">💰 Trésorerie négative depuis ${club.semainesRouge} semaine(s) !</span>`);
  const offres = g.messages.filter(m => m.actions && !m.traite).length;
  if (offres) alertes.push(`📬 ${offres} offre(s)/décision(s) en attente dans la messagerie`);
  if (club.travaux.length) alertes.push(`🏗️ ${club.travaux.map(t => `${t.batiment} niv.${t.versNiveau} (${t.semainesRestantes} sem)`).join(', ')}`);
  const sansCoach = BALANCE.categories.filter(c => !club.jeunes[c.id].coach);
  if (sansCoach.length) alertes.push(`<span class="texte-ko">⚠ Catégorie(s) sans coach : ${sansCoach.map(c => c.id).join(', ')} — la progression en souffre !</span>`);
  const scoutsSansMission = club.staff.scouts.filter(s => !s.mission).length;
  if (scoutsSansMission) alertes.push(`🔭 ${scoutsSansMission} scout(s) sans mission`);

  // mini-objectifs
  const objHtml = club.objectifs.map(o => {
    const pr = progressionObjectif(g, club, o);
    return `<div class="ligne-flex" style="font-size:12.5px">
      <span>${pr.ok ? '🟢' : '🔴'} ${esc(libelleObjectif(o))}</span>
      <span class="mini" style="white-space:nowrap">${esc(pr.texte)}</span></div>`;
  }).join('');

  return `
    <div class="carte"><h3>${enSaison ? `Semaine ${g.semaine} / 30 — Saison ${g.saison}` : `Mercato — semaine ${g.semaine - 30}/2 — Saison ${g.saison}`}</h3>
      ${prochainHtml}</div>
    <button class="btn-simuler" data-act="simulerSemaine" ${S.simEnCours ? 'disabled' : ''}>
      ${S.simEnCours ? '⏳ Simulation…' : '▶️ Simuler la semaine'}</button>
    ${dernierHtml}
    ${alertes.length ? `<div class="carte"><h3>Alertes</h3><div class="liste-simple">${alertes.map(a => `<div>${a}</div>`).join('')}</div></div>` : ''}
    <div class="carte"><h3>Objectifs de la saison</h3>${objHtml}
      <div class="ligne-flex" style="margin-top:8px"><span class="mini">Confiance du conseil</span><b>${Math.round(club.confianceConseil)}/100</b></div>
      ${jauge(club.confianceConseil)}</div>`;
}

function rMessagerie() {
  const g = S.game;
  const messages = g.messages.slice(0, 60);
  if (!messages.length) return `<div class="carte centre mini">Aucun message.</div>`;
  return messages.map(m => `
    <div class="carte message ${m.lu ? '' : 'non-lu'}">
      <div class="msg-titre"><span>${TYPE_MSG_ICO[m.type] || 'ℹ️'}</span> <span>${esc(m.titre)}</span>
        <span class="msg-date">S${m.saison} · sem ${m.semaine}</span></div>
      ${m.corps ? `<div class="msg-corps">${esc(m.corps)}</div>` : ''}
      ${m.actions && !m.traite ? `<div class="msg-actions">${m.actions.map((a, i) =>
        `<button class="btn btn-petit ${i === 0 ? 'btn-primaire' : ''}" data-act="actionMessage" data-arg='${JSON.stringify({ id: m.id, i })}'>${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`).join('');
}

function rConseil() {
  const g = S.game, club = clubJoueur(g);
  const objHtml = club.objectifs.map(o => {
    const pr = progressionObjectif(g, club, o);
    return `<div class="carte" style="padding:10px">
      <div class="ligne-flex"><b style="font-size:13.5px">${esc(libelleObjectif(o))}</b><span>${pr.ok ? '🟢' : '🔴'}</span></div>
      <div class="mini">${esc(pr.texte)}</div></div>`;
  }).join('');
  const histo = club.historique.slice().reverse().map(h => `
    <tr><td>S${h.saison}</td><td class="num">${h.rang}ᵉ</td><td class="num">${h.points} pts</td>
      <td class="num">${h.objectifs.filter(o => o.atteint).length}/${h.objectifs.length}</td>
      <td class="num">${h.confiance}</td></tr>`).join('');
  return `
    <div class="carte"><h3>Confiance du conseil</h3>
      <div class="ligne-flex"><span style="font-size:26px;font-weight:800">${Math.round(club.confianceConseil)}<span class="mini">/100</span></span>
        <span class="pill ${club.confianceConseil >= 60 ? 'pill-vert' : club.confianceConseil >= 30 ? 'pill-or' : 'pill-rouge'}">
        ${club.confianceConseil >= 60 ? 'Conseil confiant' : club.confianceConseil >= 30 ? 'Conseil vigilant' : 'Siège éjectable !'}</span></div>
      ${jauge(club.confianceConseil)}
      <p class="mini" style="margin-top:8px">La confiance monte quand les objectifs sont atteints et détermine le budget mercato,
      la patience du conseil et l'accès aux sponsors prestigieux. À 0 : révocation (game over).</p></div>
    <div class="carte"><h3>Budget mercato</h3><b>${fmtEuro(club.budgetMercato)}</b>
      <p class="mini">Alloué par le conseil selon sa confiance et le classement.</p></div>
    <div class="carte"><h3>Faire une demande au conseil</h3>
      <p class="mini" style="margin-bottom:8px">Une demande par type et par saison. Le succès dépend de votre confiance ;
      obtenir une faveur consomme un peu de capital politique.</p>
      <div class="liste-simple">
        ${Object.entries(DEMANDES).map(([type, d]) => {
          const dispo = demandeDisponible(g, type);
          const reponse = (club.reponsesDemandes || {})[type];
          return `<div>
            <div class="ligne-flex">
              <div><b style="font-size:13px">${d.titre}</b><div class="mini">${d.desc}</div></div>
              <button class="btn btn-petit ${dispo.ok ? 'btn-primaire' : ''}" ${dispo.ok ? '' : 'disabled'}
                data-act="demanderConseil" data-arg='${JSON.stringify({ type })}'>Demander</button>
            </div>
            ${!dispo.ok ? `<div class="mini" style="opacity:.7">${esc(dispo.raison)}</div>` : ''}
            ${reponse && reponse.saison === g.saison ? `<div class="mini ${reponse.accepte ? 'texte-ok' : 'texte-ko'}">➤ ${esc(reponse.message)}</div>` : ''}
          </div>`;
        }).join('')}
      </div></div>
    <h2 style="margin:4px 0 0">Objectifs — Saison ${g.saison}</h2>
    ${objHtml || '<p class="mini">Aucun objectif défini.</p>'}
    ${histo ? `<div class="carte"><h3>Saisons passées</h3><div class="table-scroll"><table>
      <tr><th>Saison</th><th class="num">Rang</th><th class="num">Points</th><th class="num">Objectifs</th><th class="num">Confiance</th></tr>
      ${histo}</table></div></div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Modale : résultats de la semaine
// ---------------------------------------------------------------------------
export function mResultats(m) {
  const g = S.game, club = clubJoueur(g);
  let html = '';
  const dernierPro = g.ligues.pro.resultats.slice(-1)[0];
  if (m.journee && dernierPro && dernierPro.journee === m.journee) {
    html += `<h3>Championnat — Journée ${m.journee}</h3>`;
    html += dernierPro.matchs.map(x => {
      const dom = clubById(g, x.domId), ext = clubById(g, x.extId);
      const moi = x.domId === club.id || x.extId === club.id;
      return `<div class="score-ligne" style="${moi ? 'font-weight:700' : ''}">
        <span class="score-eq dom">${esc(dom.nom)}</span>
        <span class="score-val" ${x.rapportId ? `data-act="voirRapport" data-arg='${JSON.stringify({ id: x.rapportId })}'` : ''}>${x.bd} – ${x.be}</span>
        <span class="score-eq">${esc(ext.nom)}</span></div>`;
    }).join('');
    html += `<div class="separateur"></div><h3>Vos équipes de jeunes</h3>`;
    for (const cat of BALANCE.categories) {
      const rj = g.ligues.jeunes[cat.id].resultats.slice(-1)[0];
      if (!rj || rj.journee !== m.journee) continue;
      const mj = rj.matchs.find(x => x.domId === club.id || x.extId === club.id);
      if (!mj) continue;
      const dom = clubById(g, mj.domId), ext = clubById(g, mj.extId);
      const gagne = (mj.domId === club.id && mj.bd > mj.be) || (mj.extId === club.id && mj.be > mj.bd);
      const nul = mj.bd === mj.be;
      html += `<div class="score-ligne">
        <span style="width:34px" class="pill">${cat.id}</span>
        <span class="score-eq dom">${esc(dom.nom)}</span>
        <span class="score-val">${gagne ? '🟢' : nul ? '⚪' : '🔴'} ${mj.bd}–${mj.be}</span>
        <span class="score-eq">${esc(ext.nom)}</span></div>`;
    }
  } else {
    html += `<p>Semaine de mercato écoulée. Les clubs s'activent sur le marché…</p>`;
  }
  const nonLus = g.messages.filter(x => !x.lu).length;
  if (nonLus) html += `<button class="btn btn-large" data-act="allerMessagerie" style="margin-top:8px">📬 ${nonLus} nouveau(x) message(s)</button>`;
  return { titre: `Résultats — Semaine ${m.journee || '(mercato)'}`, corps: html };
}

// ---------------------------------------------------------------------------
// Modale : sauvegardes
// ---------------------------------------------------------------------------
export function mSauvegardes() {
  const slots = S.slotsMeta || [];
  const libs = { auto: 'Sauvegarde auto', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };
  const enJeu = S.ecran === 'jeu';
  const rows = SLOTS.map((slot, i) => {
    const m = slots[i];
    return `<div class="carte" style="padding:10px">
      <div class="ligne-flex">
        <div><b>${libs[slot]}</b>
          <div class="mini">${m ? `${esc(m.nomClub)} — Saison ${m.saison}, sem ${m.semaine} · ${new Date(m.date).toLocaleDateString('fr')}` : 'Vide'}</div></div>
        <div style="display:flex;gap:6px">
          ${m ? `<button class="btn btn-petit btn-primaire" data-act="chargerSlot" data-arg='${JSON.stringify({ slot })}'>Charger</button>` : ''}
          ${enJeu && slot !== 'auto' ? `<button class="btn btn-petit" data-act="sauverSlot" data-arg='${JSON.stringify({ slot })}'>Sauver</button>` : ''}
          ${m && slot !== 'auto' ? `<button class="btn btn-petit btn-danger" data-act="supprimerSlot" data-arg='${JSON.stringify({ slot })}'>✕</button>` : ''}
        </div></div></div>`;
  }).join('');
  return {
    titre: '💾 Sauvegardes', corps: rows +
      (enJeu ? `<button class="btn btn-danger btn-large" data-act="retourTitre" style="margin-top:6px">Quitter vers l'écran titre</button>` : ''),
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function rafraichirSlots() {
  S.slotsMeta = await listerSlots();
}

defActions({
  async nouvellePartie() {
    const nom = document.getElementById('nom-club')?.value?.trim() || 'FC Belleville';
    S.game = nouvellePartie({ nomClub: nom });
    S.ecran = 'jeu';
    S.onglet = 'accueil'; S.sous.accueil = 'bureau';
    await autoSave();
    await rafraichirSlots();
    rerender();
  },

  simulerSemaine() {
    if (S.simEnCours || S.game.gameOver) return;
    S.simEnCours = true;
    rerender();
    setTimeout(async () => {
      const journeeJouee = S.game.semaine <= BALANCE.saison.nbJournees ? S.game.semaine : null;
      avancerSemaine(S.game);
      S.simEnCours = false;
      if (S.game.gameOver) {
        S.ecran = 'gameover';
        S.pileModales = [];
      } else {
        S.pileModales = [{ type: 'resultats', journee: journeeJouee }];
      }
      S.modale = S.pileModales[S.pileModales.length - 1] || null;
      await autoSave();
      rerender();
    }, 30);
  },

  actionMessage(arg) {
    const m = S.game.messages.find(x => x.id === arg.id);
    if (!m || !m.actions) return;
    executerActionMessage(S.game, arg.id, m.actions[arg.i]);
    autoSave();
    rerender();
  },

  allerMessagerie() { naviguer('accueil', 'messagerie'); },

  demanderConseil(arg) {
    const r = faireDemandeConseil(S.game, arg.type);
    if (r.ok) {
      const club = clubJoueur(S.game);
      club.reponsesDemandes = club.reponsesDemandes || {};
      club.reponsesDemandes[arg.type] = { saison: S.game.saison, accepte: r.accepte, message: r.message };
    } else if (r.message) {
      alert(r.message);
    }
    autoSave();
    rerender();
  },

  sousOnglet(arg) {
    if (arg.o === 'accueil' && arg.s === 'messagerie') {
      // NB : marquage « lu » au moment où on quitte l'onglet (voir ci-dessous)
    }
    // en quittant la messagerie, tout est marqué lu
    if (S.sous[arg.o] === 'messagerie' && arg.s !== 'messagerie') {
      for (const m of S.game.messages) m.lu = true;
    }
    naviguer(arg.o, arg.s);
  },

  async ouvrirSauvegardes() {
    await rafraichirSlots();
    ouvrirModale({ type: 'sauvegardes' });
  },

  async chargerSlot(arg) {
    const g = await charger(arg.slot);
    if (!g) return;
    S.game = g;
    S.ecran = g.gameOver ? 'gameover' : 'jeu';
    S.onglet = 'accueil'; S.sous.accueil = 'bureau';
    S.pileModales = []; S.modale = null;
    rerender();
  },

  async sauverSlot(arg) {
    await sauvegarder(arg.slot, S.game);
    await rafraichirSlots();
    rerender();
  },

  async supprimerSlot(arg) {
    await supprimer(arg.slot);
    await rafraichirSlots();
    rerender();
  },

  retourTitre() {
    S.game = null;
    S.ecran = 'titre';
    S.pileModales = []; S.modale = null;
    rafraichirSlots().then(rerender);
    rerender();
  },
});

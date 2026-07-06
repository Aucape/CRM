// Écrans Finances (trésorerie, cash-flow, sponsors) et Championnat
// (classement, calendrier/résultats, jeunes, stats) + fiche de match détaillée.

import {
  clubJoueur, clubById, classement, nomComplet, noteGlobale, meilleursDeLaSaison,
  SLOT_LABELS, BONUS_LABELS,
} from '../engine/game.js';
import { masseSalarialeHebdo, coutInvestissementHebdo } from '../engine/club.js';
import { BALANCE } from '../config.js';
import { S, ouvrirModale, defActions, rerender } from './state.js';
import { esc, fmtEuro, jauge, fmtNote10, badgePoste } from './helpers.js';

// ---------------------------------------------------------------------------
// FINANCES
// ---------------------------------------------------------------------------
export function rFinances() {
  const sous = S.sous.finances;
  const tabs = [['tresorerie', 'Trésorerie'], ['sponsors', 'Sponsors']];
  return `
    <div class="onglets">
      ${tabs.map(([id, lib]) => `<button class="${sous === id ? 'actif' : ''}" data-act="sousOnglet" data-arg='${JSON.stringify({ o: 'finances', s: id })}'>${lib}</button>`).join('')}
    </div>
    ${sous === 'tresorerie' ? rTresorerie() : rSponsors()}`;
}

const LIB_FLUX = {
  sponsors: 'Sponsors', billetterie: 'Billetterie',
  salaires: 'Salaires (joueurs + staff)', jeunes: 'Budget jeunes', entretien: 'Entretien infrastructures',
  materiel: 'Matériel / équipements',
};

function rTresorerie() {
  const g = S.game, club = clubJoueur(g);
  const flux = club.fluxSemaine;
  const ss = club.saisonStats;

  let fluxHtml = '<p class="mini">Le détail apparaîtra après la première semaine simulée.</p>';
  if (flux) {
    const ligne = (lib, v, signe) => `<div class="ligne-flex" style="font-size:13px">
      <span>${lib}</span><b class="${signe > 0 ? 'texte-ok' : 'texte-ko'}">${signe > 0 ? '+' : '−'}${fmtEuro(Math.abs(v))}</b></div>`;
    fluxHtml =
      Object.entries(flux.revenus).filter(([, v]) => v > 0).map(([k, v]) => ligne(LIB_FLUX[k] || k, v, 1)).join('') +
      Object.entries(flux.depenses).map(([k, v]) => ligne(LIB_FLUX[k] || k, v, -1)).join('') +
      (flux.transferts ? ligne('Transferts / primes / travaux', Math.abs(flux.transferts), flux.transferts > 0 ? 1 : -1) : '') +
      `<div class="separateur"></div>
      <div class="ligne-flex"><b>Cash-flow de la semaine</b>
        <b class="${flux.total >= 0 ? 'texte-ok' : 'texte-ko'}">${flux.total >= 0 ? '+' : '−'}${fmtEuro(Math.abs(flux.total))}</b></div>` +
      (flux.spectateurs ? `<div class="mini">Affluence du match : ${flux.spectateurs.toLocaleString('fr')} spectateurs</div>` : '');
  }

  // projection de fin de saison : cash-flow hebdo récurrent × semaines restantes
  const semRestantes = Math.max(0, BALANCE.saison.nbJournees + BALANCE.saison.semainesMercato - g.semaine + 1);
  let recurrent = 0;
  if (flux) {
    recurrent = Object.values(flux.revenus).reduce((a, b) => a + b, 0) -
      Object.values(flux.depenses).reduce((a, b) => a + b, 0);
  }
  const projection = club.tresorerie + recurrent * semRestantes;

  const histo = club.fluxHisto.slice(-10).reverse().map(h =>
    `<tr><td>S${h.saison} · sem ${h.semaine}</td>
      <td class="num ${h.total >= 0 ? 'texte-ok' : 'texte-ko'}">${h.total >= 0 ? '+' : ''}${fmtEuro(h.total)}</td>
      <td class="num">${fmtEuro(h.tresorerie)}</td></tr>`).join('');

  return `
    <div class="carte">
      <div class="stats-grille">
        <div class="stat-bloc"><div class="val ${club.tresorerie < 0 ? 'texte-ko' : ''}">${fmtEuro(club.tresorerie)}</div><div class="lib">Trésorerie</div></div>
        <div class="stat-bloc"><div class="val">${fmtEuro(club.budgetMercato)}</div><div class="lib">Budget mercato</div></div>
        <div class="stat-bloc"><div class="val ${projection < 0 ? 'texte-ko' : ''}">${fmtEuro(projection)}</div><div class="lib">Projection fin de saison</div></div>
        <div class="stat-bloc"><div class="val">${fmtEuro(masseSalarialeHebdo(club))}</div><div class="lib">Masse salariale/sem</div></div>
        <div class="stat-bloc"><div class="val">${fmtEuro(coutInvestissementHebdo(club))}</div><div class="lib">Budget jeunes/sem</div></div>
        <div class="stat-bloc"><div class="val ${ss.cashflowCumul < 0 ? 'texte-ko' : 'texte-ok'}">${fmtEuro(ss.cashflowCumul)}</div><div class="lib">Cash-flow saison</div></div>
      </div>
      ${club.tresorerie < 0 ? `<p class="texte-ko" style="margin-top:8px">⚠ Trésorerie négative depuis ${club.semainesRouge} semaine(s).
        Avertissement à ${BALANCE.finances.semainesRougeAvertissement}, vente forcée à ${BALANCE.finances.semainesRougeVenteForcee},
        faillite à ${BALANCE.finances.semainesRougeFaillite} !</p>` : ''}
    </div>
    <div class="carte"><h3>Cash-flow hebdomadaire détaillé</h3>${fluxHtml}</div>
    ${histo ? `<div class="carte"><h3>Historique</h3><div class="table-scroll"><table>
      <tr><th>Semaine</th><th class="num">Cash-flow</th><th class="num">Trésorerie</th></tr>${histo}</table></div></div>` : ''}
    <div class="carte mini">Achats de la saison : ${fmtEuro(ss.achats)} · Ventes : ${fmtEuro(ss.ventes)}</div>`;
}

function rSponsors() {
  const g = S.game, club = clubJoueur(g);
  const slots = BALANCE.sponsors.slots;
  const total = Object.values(club.sponsors).reduce((a, s) => a + s.hebdo, 0);

  const cartes = slots.map(slot => {
    const s = club.sponsors[slot];
    if (!s) {
      const repMin = BALANCE.sponsors.repMinSlot[slot];
      return `<div class="carte" style="padding:10px">
        <h3>${SLOT_LABELS[slot]}</h3>
        <p class="mini">Slot libre — ${club.reputation >= repMin
          ? 'les offres arrivent dans la messagerie selon votre réputation et vos résultats.'
          : `réputation ${repMin} requise (actuelle : ${club.reputation}).`}</p></div>`;
    }
    return `<div class="carte" style="padding:10px">
      <div class="ligne-flex"><h3>${SLOT_LABELS[slot]}</h3>${s.prestige ? '<span class="pill pill-or">Prestige</span>' : ''}</div>
      <div class="ligne-flex"><b>${esc(s.nom)}</b><b class="texte-ok">+${fmtEuro(s.hebdo)}/sem</b></div>
      <div class="mini">Secteur : ${esc(s.secteur)} · reste ${s.semainesRestantes} semaine(s)</div>
      ${s.bonuses.map(b => `<div class="mini">🎯 ${fmtEuro(b.montant)} si ${BONUS_LABELS[b.type].toLowerCase()}${b.seuil ? ` (${b.seuil} matchs)` : ''}</div>`).join('')}
      <div style="margin-top:6px"><span class="mini">Satisfaction ${Math.round(s.satisfaction)}/100</span>${jauge(s.satisfaction)}</div>
    </div>`;
  }).join('');

  return `
    <div class="carte"><div class="ligne-flex"><span class="mini">Revenus sponsors</span><b class="texte-ok">+${fmtEuro(total)}/sem</b></div>
      <p class="mini" style="margin-top:6px">Satisfaction élevée à l'échéance → offre de renouvellement en hausse.
      Sponsor déçu → offre réduite, voire retrait du marché. Exclusivité : un seul sponsor par secteur d'activité.</p></div>
    ${cartes}`;
}

// ---------------------------------------------------------------------------
// CHAMPIONNAT
// ---------------------------------------------------------------------------
export function rLigue() {
  const sous = S.sous.ligue;
  const tabs = [['classement', 'Classement'], ['resultats', 'Résultats'], ['jeunes', 'Jeunes'], ['stats', 'Stats']];
  return `
    <div class="onglets">
      ${tabs.map(([id, lib]) => `<button class="${sous === id ? 'actif' : ''}" data-act="sousOnglet" data-arg='${JSON.stringify({ o: 'ligue', s: id })}'>${lib}</button>`).join('')}
    </div>
    ${sous === 'classement' ? rClassement(null) : sous === 'resultats' ? rResultatsLigue()
      : sous === 'jeunes' ? rLigueJeunes() : rStatsLigue()}`;
}

function rClassement(catId) {
  const g = S.game;
  const table = catId ? g.ligues.jeunes[catId].table : g.ligues.pro.table;
  const cl = classement(table);
  const rows = cl.map((r, i) => {
    const c = clubById(g, r.clubId);
    return `<tr class="${c.estJoueur ? 'rang-joueur' : ''}">
      <td class="num">${i + 1}</td>
      <td>${esc(c.nom)}</td>
      <td class="num">${r.j}</td><td class="num">${r.g}</td><td class="num">${r.n}</td><td class="num">${r.p}</td>
      <td class="num">${r.diff > 0 ? '+' : ''}${r.diff}</td><td class="num"><b>${r.pts}</b></td></tr>`;
  }).join('');
  return `<div class="carte"><div class="table-scroll"><table>
    <tr><th class="num">#</th><th>Club</th><th class="num">J</th><th class="num">G</th><th class="num">N</th><th class="num">P</th><th class="num">+/-</th><th class="num">Pts</th></tr>
    ${rows}</table></div></div>`;
}

function rResultatsLigue() {
  const g = S.game, club = clubJoueur(g);
  const resultats = g.ligues.pro.resultats.slice().reverse();
  if (!resultats.length) return `<div class="carte centre mini">La saison n'a pas encore commencé.</div>`;
  return resultats.slice(0, 8).map(j => `
    <div class="carte"><h3>Journée ${j.journee}</h3>
      ${j.matchs.map(m => {
        const dom = clubById(g, m.domId), ext = clubById(g, m.extId);
        const moi = m.domId === club.id || m.extId === club.id;
        return `<div class="score-ligne" style="margin-bottom:5px;${moi ? 'font-weight:700' : ''}">
          <span class="score-eq dom">${esc(dom.nom)}</span>
          <span class="score-val ${m.rapportId ? 'cliquable' : ''}" ${m.rapportId ? `data-act="voirRapport" data-arg='${JSON.stringify({ id: m.rapportId })}'` : ''}>${m.bd} – ${m.be}</span>
          <span class="score-eq">${esc(ext.nom)}</span></div>`;
      }).join('')}
    </div>`).join('');
}

function rLigueJeunes() {
  const catId = S.sous.ligueJeunesCat || 'U19';
  const g = S.game, club = clubJoueur(g);
  const derniers = g.ligues.jeunes[catId].resultats.slice(-5).reverse();
  return `
    <div class="onglets">
      ${BALANCE.categories.map(c => `<button class="${catId === c.id ? 'actif' : ''}" data-act="ligueJeunesCat" data-arg='${JSON.stringify({ cat: c.id })}'>${c.id}</button>`).join('')}
    </div>
    ${rClassement(catId)}
    ${derniers.map(j => {
      const m = j.matchs.find(x => x.domId === club.id || x.extId === club.id);
      if (!m) return '';
      const dom = clubById(g, m.domId), ext = clubById(g, m.extId);
      const buteurs = (m.buts || []).filter(b => b.clubId === club.id && b.buteur)
        .map(b => `${esc(b.buteur.nom)} ${b.minute}'`).join(', ');
      return `<div class="carte" style="padding:10px"><h3>Journée ${j.journee}</h3>
        <div class="score-ligne"><span class="score-eq dom">${esc(dom.nom)}</span>
          <span class="score-val">${m.bd} – ${m.be}</span>
          <span class="score-eq">${esc(ext.nom)}</span></div>
        ${buteurs ? `<div class="buteurs">⚽ ${buteurs}</div>` : ''}</div>`;
    }).join('')}`;
}

function rStatsLigue() {
  const g = S.game;
  const { buteurs, passeurs, jeunes } = meilleursDeLaSaison(g);
  const bloc = (titre, liste, valFn) => `
    <div class="carte"><h3>${titre}</h3>
      ${liste.length ? liste.map((x, i) => `<div class="ligne-flex" style="font-size:13px;margin-bottom:4px">
        <span>${i + 1}. ${esc(nomComplet(x.p))} <span class="mini">(${esc(x.club.nom)})</span></span>
        <b>${valFn(x.p)}</b></div>`).join('') : '<p class="mini">Pas encore de données.</p>'}
    </div>`;
  return bloc('⚽ Meilleurs buteurs', buteurs, p => p.stats.buts + ' buts') +
    bloc('🎯 Meilleurs passeurs', passeurs, p => p.stats.passes + ' passes') +
    bloc('🌟 Meilleurs jeunes (≤ 21 ans, ≥ 8 matchs)', jeunes, p => (p.stats.notes / p.stats.matchs).toFixed(2) + '/10');
}

// ---------------------------------------------------------------------------
// Modale : fiche de match détaillée
// ---------------------------------------------------------------------------
export function mRapport(m) {
  const g = S.game;
  const r = g.rapports[m.id];
  if (!r) return { titre: 'Match', corps: '<p class="mini">Rapport indisponible (saison passée).</p>' };
  const dom = clubById(g, r.domId), ext = clubById(g, r.extId);
  const st = r.stats;

  const statLigne = (lib, a, b) => `<div class="ligne-flex" style="font-size:13px">
    <b style="width:44px">${a}</b><span class="mini" style="flex:1;text-align:center">${lib}</span><b style="width:44px;text-align:right">${b}</b></div>`;

  const butsHtml = r.buts.map(b => `<div class="mini">${b.minute}' ⚽ ${esc(b.buteur?.nom || '?')}
    ${b.passeur ? `<span style="opacity:.7">(passe : ${esc(b.passeur.nom)})</span>` : ''}
    — ${b.clubId === r.domId ? esc(dom.nom) : esc(ext.nom)}</div>`).join('');

  const notesEquipe = (clubId, nomClub) => {
    const notes = (r.notes || []).filter(n => n.clubId === clubId).sort((a, b) => b.note - a.note);
    if (!notes.length) return '';
    return `<h3 style="margin-top:8px">${esc(nomClub)}</h3>` + notes.map(n =>
      `<div class="ligne-flex" style="font-size:12.5px;margin-bottom:3px">
        <span>${badgePoste(n.poste)} ${esc(n.nom)} <span class="mini">${n.minutes}'</span>
          ${n.buts ? ' ⚽'.repeat(n.buts) : ''}${n.passes ? ' 🅰️'.repeat(n.passes) : ''}</span>
        ${fmtNote10(n.note)}</div>`).join('');
  };

  const corps = `
    <div class="score-ligne" style="font-size:16px">
      <span class="score-eq dom"><b>${esc(dom.nom)}</b></span>
      <span class="score-val" style="font-size:19px">${r.bd} – ${r.be}</span>
      <span class="score-eq"><b>${esc(ext.nom)}</b></span></div>
    ${butsHtml ? `<div>${butsHtml}</div>` : '<p class="mini centre">Aucun but.</p>'}
    ${r.homme ? `<p class="texte-or">⭐ Homme du match : ${esc(r.homme.nom)} (${r.homme.note}/10)</p>` : ''}
    <div class="separateur"></div>
    ${st ? `
    ${statLigne('Possession', st.possDom + '%', st.possExt + '%')}
    ${statLigne('Tirs', st.dom.tirs, st.ext.tirs)}
    ${statLigne('Tirs cadrés', st.dom.cadres, st.ext.cadres)}
    ${statLigne('Corners', st.dom.corners, st.ext.corners)}
    ${statLigne('Fautes', st.dom.fautes, st.ext.fautes)}
    ${statLigne('Cartons jaunes', st.dom.jaunes, st.ext.jaunes)}
    ${statLigne('Cartons rouges', st.dom.rouges, st.ext.rouges)}` : ''}
    <div class="separateur"></div>
    <h3>Notes des joueurs</h3>
    ${notesEquipe(r.domId, dom.nom)}
    ${notesEquipe(r.extId, ext.nom)}`;
  return { titre: `Fiche de match`, corps };
}

defActions({
  voirRapport(arg) { ouvrirModale({ type: 'rapport', id: arg.id }); },
  ligueJeunesCat(arg) { S.sous.ligueJeunesCat = arg.cat; S.sous.ligue = 'jeunes'; rerender(); },
});

// Écran Recrutement : marché des transferts, agents libres, négociation.
// (Le marché des jeunes passe par les missions de scouts → messagerie.)

import {
  clubJoueur, clubById, noteGlobale, valeurMarchande, salaireDemande, nomComplet,
  joueurMarche, acheterJoueur, fmtEuro as fE,
} from '../engine/game.js';
import { BALANCE } from '../config.js';
import { S, rerender, ouvrirModale, fermerModale, autoSave, defActions } from './state.js';
import { esc, fmtNote, badgePoste, fmtEuro, NOMS_POSTES } from './helpers.js';

export function rMarche() {
  const sous = S.sous.marche;
  const tabs = [['transferts', 'Transferts'], ['libres', 'Agents libres'], ['aide', 'Scouting']];
  return `
    <div class="onglets">
      ${tabs.map(([id, lib]) => `<button class="${sous === id ? 'actif' : ''}" data-act="sousOnglet" data-arg='${JSON.stringify({ o: 'marche', s: id })}'>${lib}</button>`).join('')}
    </div>
    ${sous === 'transferts' ? rTransferts() : sous === 'libres' ? rLibres() : rAideScouting()}`;
}

function ligneMarche(p, sub, droite, act) {
  return `<div class="carte cliquable" style="padding:10px" data-act="${act.a}" data-arg='${JSON.stringify(act.d)}'>
    <div class="ligne-flex">
      <div>${badgePoste(p.poste)} <b>${esc(nomComplet(p))}</b>
        <div class="mini">${sub}</div></div>
      <div style="text-align:right">${fmtNote(noteGlobale(p))}<div class="mini">${droite}</div></div>
    </div></div>`;
}

function rTransferts() {
  const g = S.game, club = clubJoueur(g);
  const entrees = g.marche.transferts
    .map(t => ({ t, cible: joueurMarche(g, t.joueurId) }))
    .filter(x => x.cible);
  const enteteHtml = `<div class="carte"><div class="ligne-flex">
    <span class="mini">Budget mercato : <b>${fmtEuro(club.budgetMercato)}</b></span>
    <span class="mini">Trésorerie : <b class="${club.tresorerie < 0 ? 'texte-ko' : ''}">${fmtEuro(club.tresorerie)}</b></span></div>
    <p class="mini" style="margin-top:6px">Recrutement possible dès ${BALANCE.mercato.ageMinPro} ans. Envoyez un scout en
    mission « marché pro » pour révéler le potentiel des joueurs listés.</p></div>`;
  if (!entrees.length) return enteteHtml + `<div class="carte centre mini">Marché vide — il se régénère à chaque intersaison.</div>`;
  return enteteHtml + entrees.map(({ t, cible }) => ligneMarche(
    cible.joueur,
    `${cible.joueur.age} ans · ${esc(cible.club.nom)}${t.connu && t.fourchette ? ` · potentiel ${t.fourchette.min}–${t.fourchette.max} 🔭` : ''}`,
    `${fmtEuro(t.prix)}`,
    { a: 'voirAchat', d: { id: cible.joueur.id } },
  )).join('');
}

function rLibres() {
  const g = S.game;
  if (!g.marche.libres.length) return `<div class="carte centre mini">Aucun agent libre disponible.</div>`;
  return `<div class="carte mini">Joueurs sans contrat : aucune indemnité de transfert, seulement un salaire à négocier.</div>` +
    g.marche.libres.map(p => ligneMarche(
      p, `${p.age} ans · libre`, `${fmtEuro(salaireDemande(p))}/sem demandés`,
      { a: 'voirAchat', d: { id: p.id } },
    )).join('');
}

function rAideScouting() {
  const club = clubJoueur(S.game);
  const scouts = club.staff.scouts;
  return `
    <div class="carte"><h3>Comment recruter des jeunes ?</h3>
      <p class="mini">1. Embauchez jusqu'à 3 scouts (onglet Club → Staff).<br>
      2. Donnez-leur une mission « jeunes talents » (tranche d'âge 13-19, poste, marché ciblé).<br>
      3. Leurs rapports arrivent dans la messagerie : vous pouvez signer le joueur directement
      au centre de formation (${fmtEuro(BALANCE.scouting.fraisSignatureJeune)} de frais).<br><br>
      La précision de l'estimation du potentiel dépend du niveau du scout
      (±${BALANCE.scouting.precisionPotentiel[0]} au niveau 1 → ±${BALANCE.scouting.precisionPotentiel[4]} au niveau 5).
      Un directeur du recrutement améliore encore leurs résultats.</p></div>
    ${scouts.length ? `<div class="carte"><h3>Vos scouts</h3>${scouts.map(sc => `
      <div class="ligne-flex" style="margin-bottom:6px">
        <span>${esc(sc.prenom + ' ' + sc.nom)} (niv. ${sc.niveau})</span>
        <span class="mini">${sc.mission ? (sc.mission.type === 'jeunes' ? '🎓 jeunes' : '💼 pro') + ` ${sc.mission.ageMin}-${sc.mission.ageMax} ans` : 'sans mission'}</span>
        <button class="btn btn-petit" data-act="voirMission" data-arg='${JSON.stringify({ scoutId: sc.id })}'>Mission</button>
      </div>`).join('')}</div>`
    : `<button class="btn btn-large btn-primaire" data-act="voirCandidats" data-arg='${JSON.stringify({ role: 'scout' })}'>Embaucher un premier scout</button>`}`;
}

// ---------------------------------------------------------------------------
// Modale : négociation d'achat
// ---------------------------------------------------------------------------
export function mAchat(m) {
  const g = S.game, club = clubJoueur(g);
  const cible = joueurMarche(g, m.id);
  if (!cible) return { titre: 'Transfert', corps: '<p>Ce joueur n\'est plus disponible.</p>' };
  const p = cible.joueur;
  const salaire = salaireDemande(p);
  const corps = `
    <div class="ligne-flex">
      <div>${badgePoste(p.poste)} <b>${NOMS_POSTES[p.poste]}</b> · ${p.age} ans · pied ${p.pied}</div>
      ${fmtNote(noteGlobale(p))}</div>
    <div class="mini">${cible.club ? `Club : ${esc(cible.club.nom)} — prix demandé ${fmtEuro(cible.prix)}` : 'Agent libre — aucune indemnité'}
      ${cible.entree?.connu && cible.entree.fourchette ? `<br>🔭 Potentiel estimé : ${cible.entree.fourchette.min}–${cible.entree.fourchette.max}` : '<br>Potentiel inconnu (envoyez un scout en mission « marché pro »)'}
      <br>Valeur estimée : ${fmtEuro(valeurMarchande(p))} · Salaire attendu : ≈${fmtEuro(salaire)}/sem</div>
    ${m.erreur ? `<p class="texte-ko">${esc(m.erreur)}</p>` : ''}
    ${cible.club ? `<div class="champ"><label>Indemnité de transfert (€)</label>
      <input id="tr-montant" type="number" step="1000" min="0" value="${m.montant ?? cible.prix}"></div>` : ''}
    <div class="champ"><label>Salaire hebdomadaire proposé (€)</label>
      <input id="tr-salaire" type="number" step="50" min="0" value="${m.salaire ?? salaire}"></div>
    <div class="champ"><label>Durée du contrat</label>
      <select id="tr-duree">${[1, 2, 3, 4].map(d => `<option value="${d}" ${d === 3 ? 'selected' : ''}>${d} saison(s)</option>`).join('')}</select></div>
    <div class="mini">Budget mercato : ${fmtEuro(club.budgetMercato)} · Trésorerie : ${fmtEuro(club.tresorerie)}</div>
    <button class="btn btn-primaire btn-large" data-act="faireOffre" data-arg='${JSON.stringify({ id: p.id })}'>Faire l'offre</button>`;
  return { titre: `Recruter ${esc(nomComplet(p))}`, corps };
}

defActions({
  voirAchat(arg) { ouvrirModale({ type: 'achat', id: arg.id }); },

  faireOffre(arg) {
    const montant = parseInt(document.getElementById('tr-montant')?.value ?? '0', 10) || 0;
    const salaire = parseInt(document.getElementById('tr-salaire')?.value ?? '0', 10) || 0;
    const duree = parseInt(document.getElementById('tr-duree')?.value ?? '3', 10) || 3;
    const r = acheterJoueur(S.game, arg.id, montant, salaire, duree);
    if (r.ok) {
      fermerModale();
    } else {
      ouvrirModale({ type: 'achat', id: arg.id, erreur: r.raison, montant, salaire });
    }
    autoSave();
  },
});

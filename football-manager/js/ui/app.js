// Point d'entrée de l'UI : rendu racine, navigation, délégation d'événements.
// L'UI ne fait que lire l'état du moteur et appeler ses actions — tout le
// gameplay vit dans js/engine/.

import { clubJoueur } from '../engine/game.js';
import { BALANCE } from '../config.js';
import { S, setRender, rerender, ACTIONS, defActions, naviguer } from './state.js';
import { esc, fmtEuro } from './helpers.js';
import { charger, listerSlots } from '../storage.js';
import { rTitre, rGameOver, rAccueil, mResultats, mSauvegardes } from './screens-accueil.js';
import { rClub, mJoueur, mCandidats, mMission, onInput } from './screens-club.js';
import { rMarche, mAchat } from './screens-marche.js';
import { rFinances, rLigue, mRapport } from './screens-finligue.js';

const app = document.getElementById('app');

// ---------------------------------------------------------------------------
// Rendu racine
// ---------------------------------------------------------------------------
const ECRANS = { accueil: rAccueil, club: rClub, marche: rMarche, finances: rFinances, ligue: rLigue };
const MODALES = {
  resultats: mResultats, sauvegardes: mSauvegardes, joueur: mJoueur,
  candidats: mCandidats, mission: mMission, achat: mAchat, rapport: mRapport,
};

function render() {
  if (S.ecran === 'titre' || !S.game) { app.innerHTML = rTitre(); return; }
  if (S.ecran === 'gameover') { app.innerHTML = rGameOver(); return; }

  const g = S.game, club = clubJoueur(g);
  const enSaison = g.semaine <= BALANCE.saison.nbJournees;
  const nonLus = g.messages.filter(m => !m.lu).length;

  const entete = `<header class="entete">
    <div class="entete-ligne1">
      <span class="club-nom">${esc(club.nom)}</span>
      <span class="date-jeu">S${g.saison} · ${enSaison ? `J${g.semaine}/30` : 'Mercato'}</span>
      <button class="btn-engrenage" data-act="ouvrirSauvegardes" title="Sauvegardes">⚙️</button>
    </div>
    <div class="entete-ligne2">
      <span>💰 <b class="${club.tresorerie < 0 ? 'tresorerie-neg' : ''}">${fmtEuro(club.tresorerie)}</b></span>
      <span>🏛️ <b>${Math.round(club.confianceConseil)}</b>/100</span>
      <span>⭐ Rép. <b>${club.reputation}</b></span>
    </div>
  </header>`;

  const navItems = [
    ['accueil', '🏠', 'Accueil'], ['club', '👥', 'Club'], ['marche', '🔁', 'Recrutement'],
    ['finances', '💶', 'Finances'], ['ligue', '🏆', 'Championnat'],
  ];
  const nav = `<nav class="nav-basse">
    ${navItems.map(([id, ico, lib]) => `
      <button class="${S.onglet === id ? 'actif' : ''}" data-act="nav" data-arg='${JSON.stringify({ o: id })}'>
        <span class="ico badge-nav">${ico}${id === 'accueil' && nonLus ? `<span class="badge-pastille">${nonLus}</span>` : ''}</span>
        <span>${lib}</span></button>`).join('')}
  </nav>`;

  let modale = '';
  if (S.modale && MODALES[S.modale.type]) {
    const m = MODALES[S.modale.type](S.modale);
    modale = `<div class="voile" data-act="fermerModale">
      <div class="modale" data-stop="1">
        <div class="modale-titre"><h2>${m.titre}</h2>
          <button class="btn-fermer" data-act="fermerModale">✕</button></div>
        ${m.corps}
      </div></div>`;
  }

  app.innerHTML = `${entete}<main class="contenu">${ECRANS[S.onglet]()}</main>${nav}${modale}`;
}

setRender(render);

// ---------------------------------------------------------------------------
// Délégation d'événements
// ---------------------------------------------------------------------------
app.addEventListener('click', (e) => {
  let el = e.target.closest('[data-act]');
  if (!el) return;
  // ne pas fermer la modale quand on clique dedans
  if (el.dataset.act === 'fermerModale' && el.classList.contains('voile')) {
    if (e.target.closest('[data-stop]')) return;
  }
  const act = el.dataset.act;
  const arg = el.dataset.arg ? JSON.parse(el.dataset.arg) : null;
  if (ACTIONS[act]) ACTIONS[act](arg);
});

app.addEventListener('input', (e) => {
  if (e.target.dataset?.input) onInput(e.target);
});

defActions({
  nav(arg) { naviguer(arg.o); },
  fermerModale() { S.modale = null; rerender(); },
});

// ---------------------------------------------------------------------------
// Démarrage : reprise de l'auto-save si présente
// ---------------------------------------------------------------------------
(async function boot() {
  S.slotsMeta = await listerSlots();
  const auto = await charger('auto');
  if (auto) {
    S.game = auto;
    S.ecran = auto.gameOver ? 'gameover' : 'jeu';
  } else {
    S.ecran = 'titre';
  }
  render();
})();

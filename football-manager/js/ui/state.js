// État global de l'UI + petites primitives partagées (évite les imports circulaires).

import { sauvegarder } from '../storage.js';

export const S = {
  game: null,
  ecran: 'titre',        // titre | jeu | gameover
  onglet: 'accueil',     // accueil | club | marche | finances | ligue
  sous: {                // sous-onglet courant par onglet
    accueil: 'bureau', club: 'pros', marche: 'transferts',
    finances: 'tresorerie', ligue: 'classement',
  },
  modale: null,          // { type, ...données }
  simEnCours: false,
};

let renderFn = () => {};
export function setRender(fn) { renderFn = fn; }
export function rerender() { renderFn(); }

export function naviguer(onglet, sous = null) {
  S.onglet = onglet;
  if (sous) S.sous[onglet] = sous;
  S.modale = null;
  rerender();
  window.scrollTo(0, 0);
}

export function ouvrirModale(m) { S.modale = m; rerender(); }
export function fermerModale() { S.modale = null; rerender(); }

export async function autoSave() {
  if (S.game) await sauvegarder('auto', S.game);
}

// registre d'actions déclenchées par data-act
export const ACTIONS = {};
export function defActions(map) { Object.assign(ACTIONS, map); }

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
  modale: null,          // modale affichée = sommet de la pile (ci-dessous)
  pileModales: [],       // pile : ouvrir empile, fermer dépile → on revient à la précédente
  simEnCours: false,
};

let renderFn = () => {};
export function setRender(fn) { renderFn = fn; }
export function rerender() { renderFn(); }

function majSommet() { S.modale = S.pileModales[S.pileModales.length - 1] || null; }

export function naviguer(onglet, sous = null) {
  S.onglet = onglet;
  if (sous) S.sous[onglet] = sous;
  S.pileModales = []; majSommet();
  rerender();
  window.scrollTo(0, 0);
}

// ouvrir une modale l'empile au-dessus de la courante ; ouvrirModale(null) vide la pile
export function ouvrirModale(m) {
  if (m == null) S.pileModales = [];
  else S.pileModales.push(m);
  majSommet();
  rerender();
}

// remplace la modale courante (sans empiler) — utile pour ré-afficher avec une erreur
export function remplacerModale(m) {
  if (S.pileModales.length) S.pileModales[S.pileModales.length - 1] = m;
  else S.pileModales.push(m);
  majSommet();
  rerender();
}

// ferme la modale du dessus et revient à la précédente
export function fermerModale() {
  S.pileModales.pop();
  majSommet();
  rerender();
}

export async function autoSave() {
  if (S.game) await sauvegarder('auto', S.game);
}

// registre d'actions déclenchées par data-act
export const ACTIONS = {};
export function defActions(map) { Object.assign(ACTIONS, map); }

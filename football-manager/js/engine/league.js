// Championnat : génération du calendrier (round-robin aller-retour) et classement.

import { shuffle } from './rng.js';

/**
 * Calendrier round-robin (algorithme du cercle) pour n équipes (n pair).
 * Retourne un tableau de journées : [[{dom, ext}, ...], ...] — 2×(n-1) journées.
 */
export function genCalendrier(game, clubIds) {
  const ids = shuffle(game, clubIds);
  const n = ids.length;
  const journees = [];
  const fixe = ids[0];
  let rot = ids.slice(1);
  for (let j = 0; j < n - 1; j++) {
    const matchs = [];
    const ligne = [fixe, ...rot];
    for (let i = 0; i < n / 2; i++) {
      const a = ligne[i], b = ligne[n - 1 - i];
      // alternance domicile/extérieur selon la journée
      matchs.push(j % 2 === 0 ? { dom: a, ext: b } : { dom: b, ext: a });
    }
    journees.push(matchs);
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  // matchs retour (terrains inversés)
  const retour = journees.map(js => js.map(m => ({ dom: m.ext, ext: m.dom })));
  return [...journees, ...retour];
}

export function tableVierge(clubIds) {
  const t = {};
  for (const id of clubIds) {
    t[id] = { j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, pts: 0 };
  }
  return t;
}

export function enregistrerResultat(table, dom, ext, bd, be) {
  const d = table[dom], e = table[ext];
  d.j++; e.j++;
  d.bp += bd; d.bc += be;
  e.bp += be; e.bc += bd;
  if (bd > be) { d.g++; e.p++; d.pts += 3; }
  else if (bd < be) { e.g++; d.p++; e.pts += 3; }
  else { d.n++; e.n++; d.pts++; e.pts++; }
}

// classement trié : [{clubId, ...stats, diff}]
export function classement(table) {
  return Object.entries(table)
    .map(([clubId, s]) => ({ clubId: +clubId, ...s, diff: s.bp - s.bc }))
    .sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.bp - a.bp);
}

export function rangClub(table, clubId) {
  const c = classement(table);
  return c.findIndex(r => r.clubId === clubId) + 1;
}

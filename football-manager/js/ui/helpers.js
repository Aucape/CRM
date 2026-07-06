// Petits utilitaires d'affichage partagés par tous les écrans.

import { fmtEuro, noteGlobale, fourchettePotentiel } from '../engine/game.js';

export { fmtEuro };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function fmtNote(n) {
  const v = Math.round(n);
  const cls = v >= 70 ? 'note-a' : v >= 58 ? 'note-b' : v >= 45 ? 'note-c' : 'note-d';
  return `<span class="note-pastille ${cls}">${v}</span>`;
}

export function fmtNote10(n) {
  const cls = n >= 7.5 ? 'note-a' : n >= 6.5 ? 'note-b' : n >= 5.5 ? 'note-c' : 'note-d';
  return `<span class="note-pastille ${cls}">${n.toFixed(1)}</span>`;
}

export function badgePoste(poste) {
  return `<span class="poste-badge poste-${poste}">${poste}</span>`;
}

export function etatJoueur(p) {
  const ics = [];
  if (p.blessure) ics.push(`<span class="etat-ico" title="Blessé">🤕${p.blessure.semaines}s</span>`);
  if (p.suspension > 0) ics.push('<span class="etat-ico" title="Suspendu">🟥</span>');
  if (p.fatigue > 70) ics.push('<span class="etat-ico" title="Fatigué">🥵</span>');
  if (p.moral < 35) ics.push('<span class="etat-ico" title="Moral bas">😞</span>');
  if (p.surclasse) ics.push('<span class="etat-ico" title="Surclassé">⬆️</span>');
  if (p.formeAuClub) ics.push('<span class="etat-ico" title="Formé au club">🏠</span>');
  return ics.join(' ');
}

export function barreAttr(nom, val) {
  return `<div class="attr-ligne">
    <span class="attr-nom">${nom}</span>
    <div class="attr-barre"><div class="attr-rempli" style="width:${Math.round(val)}%"></div></div>
    <span class="attr-val">${Math.round(val)}</span>
  </div>`;
}

export function jauge(pct, couleur) {
  const c = couleur || (pct >= 60 ? 'var(--accent)' : pct >= 30 ? 'var(--or)' : 'var(--rouge)');
  return `<div class="jauge"><div style="width:${Math.max(0, Math.min(100, pct))}%;background:${c}"></div></div>`;
}

// meilleur niveau de scout du club (pour la précision de la fourchette de potentiel)
export function niveauScoutMax(club) {
  return club.staff.scouts.reduce((m, s) => Math.max(m, s.niveau), 0);
}

// fourchette de potentiel vue (mise en cache sur le joueur, affinée si meilleur scout)
export function fourchetteVue(game, club, p) {
  const niv = niveauScoutMax(club);
  if (niv === 0) return p._fv ? `${p._fv.min}–${p._fv.max}` : '??';
  if (!p._fv || p._fv.niv < niv) {
    const f = fourchettePotentiel(game, p, niv, !!club.staff.directeurRecrutement);
    p._fv = { min: f.min, max: f.max, niv };
  }
  return `${p._fv.min}–${p._fv.max}`;
}

export function etoiles(niveau) {
  return '★'.repeat(niveau) + '☆'.repeat(5 - niveau);
}

export const NOMS_ATTRS = {
  att: 'Attaque', tec: 'Technique', def: 'Défense',
  phy: 'Physique', vit: 'Vitesse', men: 'Mental', gb: 'Gardien',
};

export const NOMS_POSTES = { G: 'Gardien', DEF: 'Défenseur', MIL: 'Milieu', ATT: 'Attaquant' };

export const NOMS_BATIMENTS = {
  stade: { nom: 'Stade', ico: '🏟️', effet: 'Capacité → revenus billetterie' },
  entrainement: { nom: "Centre d'entraînement", ico: '🏋️', effet: 'Progression des pros + moins de blessures' },
  formation: { nom: 'Centre de formation', ico: '🎓', effet: "Qualité/quantité de l'intake + progression des jeunes" },
  infirmerie: { nom: 'Infirmerie', ico: '🏥', effet: 'Blessures plus courtes' },
};

export const TYPE_MSG_ICO = {
  info: 'ℹ️', sponsor: '🤝', scout: '🔭', transfert: '🔁', blessure: '🤕',
  conseil: '🏛️', finance: '💰', jeunes: '🎓', staff: '👔',
};

export function noteMoyenneEquipe(joueurs, n = 14) {
  const notes = joueurs.map(p => noteGlobale(p)).sort((a, b) => b - a).slice(0, n);
  return notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : 0;
}

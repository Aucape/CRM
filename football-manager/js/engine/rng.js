// Générateur pseudo-aléatoire déterministe (mulberry32).
// L'état est stocké dans game.rngState → sauvegardes/rechargements reproductibles.

export function rand(game) {
  game.rngState = (game.rngState + 0x6D2B79F5) | 0;
  let t = game.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// entier dans [min, max] inclus
export function randInt(game, min, max) {
  return min + Math.floor(rand(game) * (max - min + 1));
}

// flottant dans [min, max)
export function randFloat(game, min, max) {
  return min + rand(game) * (max - min);
}

// approximation gaussienne (moyenne 0, écart-type 1) — somme de 3 uniformes
export function randGauss(game) {
  return (rand(game) + rand(game) + rand(game) - 1.5) * 2;
}

// tirage pondéré : items = [{w: poids, ...}] → retourne l'item
export function weightedPick(game, items, getWeight) {
  let total = 0;
  for (const it of items) total += getWeight(it);
  if (total <= 0) return items[Math.floor(rand(game) * items.length)];
  let r = rand(game) * total;
  for (const it of items) {
    r -= getWeight(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export function pick(game, arr) {
  return arr[Math.floor(rand(game) * arr.length)];
}

export function shuffle(game, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(game) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

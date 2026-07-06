// Service worker : cache tous les fichiers du jeu → 100 % jouable hors ligne
// après le premier chargement. Stratégie « cache d'abord ».

const CACHE = 'president-fc-v1';
const FICHIERS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './css/style.css',
  './js/config.js',
  './js/storage.js',
  './js/engine/rng.js',
  './js/engine/names.js',
  './js/engine/player.js',
  './js/engine/staff.js',
  './js/engine/club.js',
  './js/engine/league.js',
  './js/engine/match.js',
  './js/engine/messages.js',
  './js/engine/sponsors.js',
  './js/engine/board.js',
  './js/engine/finance.js',
  './js/engine/market.js',
  './js/engine/ai.js',
  './js/engine/week.js',
  './js/engine/season.js',
  './js/engine/game.js',
  './js/ui/state.js',
  './js/ui/helpers.js',
  './js/ui/app.js',
  './js/ui/screens-accueil.js',
  './js/ui/screens-club.js',
  './js/ui/screens-marche.js',
  './js/ui/screens-finligue.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit || fetch(e.request).then(rep => {
        const copie = rep.clone();
        caches.open(CACHE).then(c => c.put(e.request, copie));
        return rep;
      })
    )
  );
});

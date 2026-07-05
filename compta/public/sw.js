'use strict';
// Service worker : cache du "shell" de l'application pour un démarrage
// instantané. Les données (/api/) restent toujours en réseau — la
// comptabilité ne doit jamais afficher des chiffres périmés.

const CACHE = 'compta-shell-v1';
const SHELL = [
  './', 'index.html', 'css/app.css', 'icon.svg', 'manifest.webmanifest',
  'js/api.js', 'js/components.js', 'js/app.js',
  'js/views/dashboard.js', 'js/views/sales.js', 'js/views/contacts.js',
  'js/views/expenses.js', 'js/views/bank.js', 'js/views/fiscal.js', 'js/views/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.includes('/api/') || e.request.method !== 'GET') return; // réseau uniquement
  // Réseau d'abord, cache en secours : le shell reste frais mais dispo hors ligne.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

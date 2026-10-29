const CACHE = 'dingzhu-shell-v6-backup';
const ASSETS = ['./','./index.html','./assets/css/tokens.css','./assets/css/app.css','./assets/css/views.css','./assets/js/ui.js','./assets/js/profile.js','./assets/js/data.js','./assets/js/media.js','./assets/js/backup.js','./assets/js/geo.js','./assets/js/views/schedule.js','./assets/js/views/create.js','./assets/js/views/orders.js','./assets/js/views/pending.js','./assets/js/views/analytics.js','./assets/js/views/orderDetail.js','./assets/js/views/teams.js','./assets/js/views/trash.js','./assets/js/router.js','./assets/js/offline.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('dingzhu-shell-') && k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then(cached => cached || fetch(event.request)));
  } else {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});

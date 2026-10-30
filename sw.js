/* 鼎筑 App Shell 离线缓存
 *
 * 之前是「缓存优先」：导航一律回 index.html 的旧副本，静态资源也只认缓存里那份。
 * 结果就是改了 CSS/JS 之后浏览器怎么刷新都还是旧界面 —— 服务端就算发
 * Cache-Control: no-store 也没用，请求根本没到网络。
 *
 * 现在改成：
 *   · 网络优先，拿到新文件就顺手更新缓存（联网时永远是最新的）
 *   · 只有断网 / 请求失败时才回缓存（离线照样能打开）
 *   · install 时 skipWaiting、activate 时 clients.claim，新的 SW 立刻接管，
 *     不会卡在 waiting 等用户关掉所有标签页
 *   · 缓存名带版本号，activate 时清掉旧版本的桶
 */
const CACHE = 'dingzhu-shell-v14-hold-compact';
const ASSETS = [
  './', './index.html',
  './assets/css/tokens.css', './assets/css/app.css', './assets/css/views.css',
  './assets/js/ui.js', './assets/js/profile.js', './assets/js/data.js',
  './assets/js/media.js', './assets/js/backup.js', './assets/js/geo.js',
  './assets/js/views/schedule.js', './assets/js/views/create.js',
  './assets/js/views/orders.js', './assets/js/views/pending.js',
  './assets/js/views/analytics.js', './assets/js/views/orderDetail.js',
  './assets/js/views/teams.js', './assets/js/views/trash.js',
  './assets/js/router.js', './assets/js/offline.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(ASSETS))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('dingzhu-shell-') && k !== CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const isNav = event.request.mode === 'navigate';
    try {
      /* 导航强制绕过 HTTP 缓存，保证拿到最新 index.html */
      const res = await fetch(event.request, isNav ? { cache: 'no-store' } : undefined);
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        /* 导航统一存到 ./index.html 下，因为带 ?v= 的地址每次都不一样 */
        cache.put(isNav ? './index.html' : event.request, res.clone()).catch(() => {});
      }
      return res;
    } catch (err) {
      const cache = await caches.open(CACHE);
      const hit = isNav
        ? await cache.match('./index.html')
        : await cache.match(event.request, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});

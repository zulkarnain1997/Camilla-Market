const CACHE='ada-apa-aja-20260918-auth-boot-v134';
const ASSETS=[
  './',
  'index.php',
  'assets/css/style.css?v=20260918-auth-boot-v134',
  'assets/js/app.js?v=20260918-auth-boot-v134',
  'files/default-logo.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if(event.request.method !== 'GET' || url.pathname.includes('api.php')) return;

  event.respondWith(
    fetch(event.request, {cache:'no-store'})
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(()=>{});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

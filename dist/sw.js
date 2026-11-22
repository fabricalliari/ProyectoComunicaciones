const PREFIX = 'sonicdrop-hf-' + encodeURIComponent(self.registration.scope) + '-';
const CACHE = PREFIX + 'v2';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './audio.js', './protocol.js', './capture-worklet.js', './vendor/ggwave.js', './vendor/LICENSE-ggwave.txt', './icon.svg', './manifest.webmanifest', './alta-frecuencia.html', './clasico.html', './high-frequency.js', './high-frequency-app.js', './high-frequency.css', './c3po.svg', './r2d2.svg'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request)).then(cached => cached || fetch(event.request)));
});

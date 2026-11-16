/* krt2.wicki.aero – Service Worker (0.6.0): App und Frequenzdaten auch ohne Netz.
   App-Dateien: zuerst das Netz, nach 4 s oder ohne Netz die Kopie im Cache.
   Frequenzdaten (raw.githubusercontent.com/bwicki/krt2/data/): ebenso, jede geladene Datei wird aufbewahrt.
   Nicht angefasst: API (Konten, Gerätestand), Kartenkacheln, Schriften, Zählpixel. */
const V = '0.6.5';
const APP = 'krt2-app-' + V, DATA = 'krt2-data';
const DATA_URL = 'https://raw.githubusercontent.com/bwicki/krt2/data/';
const WAIT_MS = 4000;
const SHELL = ['./', './index.html', './img/logo.png', './lib/leaflet/leaflet.css', './lib/leaflet/leaflet.js', './css/app.css?v=' + V]
  .concat(['config', 'api', 'krt2codec', 'model', 'sample', 'area', 'gebiet', 'i18n', 'krt2decoder', 'link', 'readout', 'geraet', 'flug', 'flugui', 'app']
    .map(n => './src/' + n + '.js?v=' + V));

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(APP).then(c => Promise.allSettled(SHELL.map(u => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('krt2-app-') && k !== APP).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function fromCache(cacheName, req) {
  return caches.open(cacheName).then(c => c.match(req).then(r => r || c.match(req, { ignoreSearch: true })));
}
// Zuerst das Netz; antwortet es nicht innert WAIT_MS und gibt es eine Kopie, kommt die Kopie. Neue Antworten werden aufbewahrt.
function netFirst(cacheName, req) {
  const net = fetch(req).then(r => {
    if (r && r.ok) { const copy = r.clone(); caches.open(cacheName).then(c => c.put(req, copy)); }
    return r;
  });
  const slow = new Promise(res => setTimeout(res, WAIT_MS)).then(() => fromCache(cacheName, req));
  return new Promise((resolve, reject) => {
    let done = false;
    const give = r => { if (!done && r) { done = true; resolve(r); } };
    net.then(r => { if (r && r.ok) give(r); else fromCache(cacheName, req).then(c => give(c || r)); })
      .catch(err => fromCache(cacheName, req).then(c => { if (c) give(c); else if (!done) { done = true; reject(err); } }));
    slow.then(give);
  });
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.href.startsWith(DATA_URL)) { ev.respondWith(netFirst(DATA, req)); return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;
  ev.respondWith(netFirst(APP, req));
});

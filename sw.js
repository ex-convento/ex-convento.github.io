/* Ex Convento · tiene in memoria le app Bar e Forni per aprirle anche senza rete */
var V = 'excv-1';  /* cambiare numero a ogni aggiornamento delle app */
var FILES = ['./', 'index.html', 'comune.js', 'comune.css', 'logo.png', 'icon-192.png', 'icon.png', 'apple-touch-icon.png',
  'bar/', 'bar/index.html', 'bar/manifest.json', 'forni/', 'forni/index.html', 'forni/manifest.json'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === location.origin) {
    /* subito la copia salvata (parte anche con rete lenta), intanto scarica la versione nuova per la prossima apertura */
    e.respondWith(caches.open(V).then(function (c) {
      return c.match(r, {ignoreSearch: true}).then(function (m) {
        var rete = fetch(r).then(function (res) { if (res.ok) c.put(r, res.clone()); return res; });
        if (m) { rete.catch(function () {}); return m; }
        return rete.catch(function () { return c.match(u.pathname.replace(/[^/]*$/, '') + 'index.html'); });
      });
    }));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.match(r).then(function (m) {
      return m || fetch(r).then(function (res) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp); }); return res; });
    }));
  }
});

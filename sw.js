/* Ex Convento · tiene in memoria le app Bar e Forni per aprirle anche senza rete */
var V = 'excv-15';  /* cambiare numero a ogni aggiornamento delle app */
var FILES = ['./', 'index.html', 'comune.js', 'comune.css', 'totore.js', 'logo.png', 'icon-192.png', 'icon.png', 'apple-touch-icon.png',
  'bar/', 'bar/index.html', 'bar/manifest.json', 'forni/', 'forni/index.html', 'forni/manifest.json',
  'pubblico/', 'pubblico/index.html', 'pubblico/manifest.json'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(FILES.map(function (f) { return new Request(f, {cache: 'reload'}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === location.origin) {
    /* prima la rete (così ogni aggiornamento si vede subito); se la rete manca o è lenta (oltre 4 secondi), la copia salvata */
    e.respondWith(caches.open(V).then(function (c) {
      var salvata = function () { return c.match(r, {ignoreSearch: true}).then(function (m) { return m || c.match(u.pathname.replace(/[^/]*$/, '') + 'index.html'); }); };
      var rete = fetch(new Request(r.url, {cache: 'no-cache', credentials: 'same-origin'})).then(function (res) { if (res.ok) c.put(r, res.clone()); return res; });
      var attesa = new Promise(function (ok) { setTimeout(ok, 4000); }).then(function () { return c.match(r, {ignoreSearch: true}); });
      return Promise.race([rete.catch(salvata), attesa.then(function (m) { return m || rete.catch(salvata); })]);
    }));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.match(r).then(function (m) {
      return m || fetch(r).then(function (res) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp); }); return res; });
    }));
  }
});

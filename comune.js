/* Ex Convento · postazioni (bar e forni) — parte comune: chiave, coda offline, sincronizzazione */
(function () {
  'use strict';
  var API = 'https://script.google.com/macros/s/AKfycbwr4sZBvrhmavAtTrBXbNJ0OOsS1yxozXwtbxEpMfuKVz2CDW30YTztDrllZOAfkBuC-Q/exec';
  var X = window.EXC = {};
  var app = 'app', opts = {}, busy = false, fails = 0, nextAt = 0, lastOk = 0, lastInit = 0, timer = null;

  /* ---------- memoria locale ---------- */
  function k(n) { return 'excv_' + app + '_' + n; }
  X.get = function (n, d) { try { var s = localStorage.getItem(k(n)); return s == null ? d : JSON.parse(s); } catch (e) { return d; } };
  X.set = function (n, v) { try { localStorage.setItem(k(n), JSON.stringify(v)); } catch (e) { X.toast('Memoria del dispositivo piena: sincronizza e libera spazio.', 'err'); } };

  /* ---------- utilità ---------- */
  X.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  X.oggi = function (d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  X.adesso = function (d) { d = d || new Date(); return X.oggi(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  X.ora = function (iso) { var m = String(iso || '').match(/T(\d\d:\d\d)/); return m ? m[1] : ''; };
  X.euro = function (n) { n = Math.round(Number(n || 0) * 100) / 100; return n.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €'; };
  X.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };
  X.fra = function (iso) {
    var t = new Date(String(iso).replace(' ', 'T')).getTime(); if (!t) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'adesso'; if (m < 60) return m + ' min fa';
    var h = Math.floor(m / 60); if (h < 24) return h + ' h ' + pad(m % 60) + ' fa';
    return Math.floor(h / 24) + ' g fa';
  };

  /* ---------- avvisi ---------- */
  X.toast = function (msg, tipo, azione) {
    var box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'toast ' + (tipo || ''); t.textContent = msg; box.appendChild(t);
    var dura = azione ? 9000 : (tipo === 'err' ? 5000 : 2600);
    if (azione) {
      var b = document.createElement('button'); b.className = 'tbtn'; b.textContent = azione.label || 'Annulla';
      b.onclick = function () { t.remove(); azione.fn(); };
      t.appendChild(b); t.classList.add('conazione');
    }
    setTimeout(function () { t.classList.add('via'); }, dura);
    setTimeout(function () { t.remove(); }, dura + 600);
  };

  /* ---------- nomi: suggeriti e scritti sempre allo stesso modo ---------- */
  X.nomePulito = function (n) {
    n = String(n || '').replace(/\s+/g, ' ').trim();
    if (n === n.toLowerCase() || n === n.toUpperCase()) n = n.toLowerCase().replace(/(^|[\s'’-])(\S)/g, function (m, a, c) { return a + c.toUpperCase(); });
    return n.slice(0, 60);
  };
  X.ricordaNome = function (n) {
    n = X.nomePulito(n); if (n.length < 2) return n;
    var l = X.get('nomi', []).filter(function (x) { return x.toLowerCase() !== n.toLowerCase(); }); l.unshift(n); X.set('nomi', l.slice(0, 60));
    X.aggiornaNomi(); return n;
  };
  X.aggiornaNomi = function () {
    var st = X.stato() || {}, set = {}, out = [];
    X.get('nomi', []).concat(st.operatori || [], st.nomi || []).forEach(function (n) { var k = String(n).toLowerCase(); if (n && !set[k]) { set[k] = 1; out.push(n); } });
    var dl = document.getElementById('excvNomi');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'excvNomi'; document.body.appendChild(dl); }
    dl.innerHTML = out.slice(0, 300).map(function (n) { return '<option value="' + X.esc(n) + '"></option>'; }).join('');
  };

  /* ---------- menu delle app (solo sui dispositivi personali, non sui tablet-postazione) ---------- */
  X.menuApp = function () {
    var st = X.stato() || {}, top = document.querySelector('.top'), btn = document.getElementById('appBtn');
    var mostra = top && st.postazione && !/^postazione/i.test(st.postazione);
    if (!mostra) { if (btn) btn.remove(); return; }
    if (btn) return;
    btn = document.createElement('button'); btn.id = 'appBtn'; btn.className = 'appbtn'; btn.setAttribute('aria-label', 'Altre app');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>';
    var sync = document.getElementById('sync'); top.insertBefore(btn, sync ? sync.nextSibling : null);
    btn.onclick = function () {
      var d = document.getElementById('appDlg');
      if (!d) { d = document.createElement('dialog'); d.id = 'appDlg'; document.body.appendChild(d); d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-chiudi]')) d.close(); }); }
      var voci = [['../', 'Gestionale', 'Cassa, turni, forni, eventi, avvisi'], ['../bar/', 'Bar', 'Cassa del bar, chiusura serata'], ['../forni/', 'Forni', 'Carico, cottura, prenotazioni'], ['../pubblico/', 'Bacheca pubblica', 'Quello che vede chi visita la sede']];
      d.innerHTML = '<div class="dlg-h"><h2>Le app dell\u2019Ex Convento</h2><button class="dlg-x" data-chiudi aria-label="Chiudi">×</button></div><div class="dlg-b"><div class="applinks">' +
        voci.map(function (v) { return '<a class="applink" href="' + v[0] + '"><b>' + v[1] + '</b><span>' + v[2] + '</span></a>'; }).join('') + '</div></div>';
      d.showModal();
    };
  };

  /* ---------- aiuto in pagina ---------- */
  X.aiuto = function (titolo, punti) {
    var top = document.querySelector('.top'), sync = document.getElementById('sync'); if (!top || document.getElementById('aiutoBtn')) return;
    var b = document.createElement('button'); b.id = 'aiutoBtn'; b.className = 'aiutobtn'; b.setAttribute('aria-label', 'Aiuto'); b.textContent = '?';
    top.insertBefore(b, sync ? sync.nextSibling : null);
    b.onclick = function () {
      var d = document.getElementById('aiutoDlg');
      if (!d) { d = document.createElement('dialog'); d.id = 'aiutoDlg'; document.body.appendChild(d); d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-chiudi]')) d.close(); }); }
      d.innerHTML = '<div class="dlg-h"><h2>' + X.esc(titolo) + '</h2><button class="dlg-x" data-chiudi aria-label="Chiudi">×</button></div><div class="dlg-b"><ol class="aiutolist">' +
        punti.map(function (p) { return '<li>' + X.esc(p) + '</li>'; }).join('') + '</ol><button class="btn prim full" data-chiudi>Ho capito</button></div>';
      d.showModal();
    };
  };

  /* ---------- scorte (bar e laboratorio): conteggio, arrivi, uso; senza PIN, finiscono in coda come il resto ---------- */
  // o = {reparti: ['Bar', ...], operatore: fn() -> nome, chiediOp: fn(poi), dopo: fn() per ridisegnare}
  var SC = null;
  function numIt(v) { var n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : NaN; }
  function fmtQ(n) { n = Math.round(Number(n || 0) * 100) / 100; return String(n).replace('.', ','); }
  X.scorteInit = function (o) { SC = o; };
  X.scorte = function () {
    var st = X.stato() || {}, l = (st.scorte && st.scorte.ok ? st.scorte.values : []) || [];
    var m = {}; l = l.filter(function (x) { return !SC || SC.reparti.indexOf(x.reparto) >= 0; }).map(function (x) { var c = {}; Object.keys(x).forEach(function (n) { c[n] = x[n]; }); m[c.id] = c; c.inAttesa = 0; return c; });
    X.coda().forEach(function (it) {
      var x = it.tipo === 'scorta' && m[it.scorta]; if (!x) return;
      var v = Number(it.valore) || 0; x.quantita = it.modo === 'carico' ? x.quantita + v : it.modo === 'uso' ? Math.max(0, x.quantita - v) : v;
      x.bassa = x.quantita <= x.soglia; x.inAttesa++;
    });
    return l;
  };
  X.vScorte = function (filtro) {
    var tutte = X.scorte(), rep = SC ? SC.reparti : [];
    if (!(X.stato() || {}).scorte) return '<div class="wrap scw"><div class="card vuota">Le scorte arrivano al prossimo collegamento con il gestionale.</div></div>';
    var lista = tutte.filter(function (x) { return !filtro || x.reparto === filtro; }).sort(function (a, b) { return (b.bassa ? 1 : 0) - (a.bassa ? 1 : 0) || a.nome.localeCompare(b.nome); });
    var basse = tutte.filter(function (x) { return x.bassa; });
    var h = '<div class="wrap scw">';
    if (basse.length) h += '<div class="card scbuy"><h3>Da comprare (' + basse.length + ')</h3><p>' + basse.map(function (x) { return '<b>' + X.esc(x.nome) + '</b>' + (x.riordino ? ' · circa ' + fmtQ(x.riordino) + ' ' + X.esc(x.unita) : ''); }).join('<br>') + '</p><p class="muted" style="margin:6px 0 0;font-size:14px">Il direttivo riceve l’avviso da solo. Quando arriva la spesa, tocca <b>Arrivati</b>.</p></div>';
    if (rep.length > 1) h += '<div class="scelte scfil">' + [['', 'Tutte']].concat(rep.map(function (r) { return [r, r]; })).map(function (r) { return '<button class="scelta' + ((filtro || '') === r[0] ? ' on' : '') + '" data-skr="' + X.esc(r[0]) + '">' + X.esc(r[1]) + '</button>'; }).join('') + '</div>';
    if (!lista.length) h += '<div class="card vuota">Nessuna scorta' + (filtro ? ' in ' + X.esc(filtro) : '') + '. Le scorte nuove si aggiungono dal gestionale (sezione Scorte).</div>';
    h += '<div class="sclist">' + lista.map(function (x) {
      var info = [];
      if (x.bassa) info.push('<span class="badge ros">Sta finendo</span>');
      if (x.giorni != null && !x.bassa) info.push('<span class="muted">basta per circa ' + x.giorni + (x.giorni === 1 ? ' giorno' : ' giorni') + '</span>');
      if (x.inAttesa) info.push('<span class="badge ara">in invio</span>');
      if (!filtro && rep.length > 1) info.push('<span class="muted">' + X.esc(x.reparto) + '</span>');
      return '<article class="scr' + (x.bassa ? ' bassa' : '') + '"><div class="scn"><b>' + X.esc(x.nome) + '</b><div class="sci">' + info.join(' ') + '</div></div>' +
        '<div class="scq"><b>' + fmtQ(x.quantita) + '</b><span>' + X.esc(x.unita) + '</span><small>avviso sotto ' + fmtQ(x.soglia) + '</small></div>' +
        '<div class="sca"><button class="btn lin" data-sk="' + X.esc(x.id) + '" data-skm="uso" aria-label="Usati: ' + X.esc(x.nome) + '">− Usati</button><button class="btn lin" data-sk="' + X.esc(x.id) + '" data-skm="carico" aria-label="Arrivati: ' + X.esc(x.nome) + '">+ Arrivati</button><button class="btn prim" data-sk="' + X.esc(x.id) + '" data-skm="conteggio">Conta</button></div></article>';
    }).join('') + '</div></div>';
    return h;
  };
  function scDlg() {
    var d = document.getElementById('scDlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'scDlg'; document.body.appendChild(d); d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-chiudi]')) d.close(); }); }
    return d;
  }
  function scApri(id, modo) {
    var x = X.scorte().filter(function (y) { return y.id === id; })[0]; if (!x) return X.toast('Scorta non trovata: aggiorna la pagina.', 'err');
    var t = {conteggio: ['Quanti ne restano?', 'Conta quello che c’è adesso e scrivi il numero.', 'Salva il conteggio'], carico: ['Quanti ne sono arrivati?', 'Si sommano a quelli che ci sono.', 'Aggiungi'], uso: ['Quanti ne hai usati?', 'Si tolgono da quelli che ci sono.', 'Togli']}[modo];
    var d = scDlg();
    d.innerHTML = '<div class="dlg-h"><h2>' + X.esc(x.nome) + '</h2><button class="dlg-x" data-chiudi aria-label="Chiudi">×</button></div><div class="dlg-b">' +
      '<p class="muted" style="margin:0 0 4px">Adesso: <b>' + fmtQ(x.quantita) + ' ' + X.esc(x.unita) + '</b> · ' + t[1] + '</p>' +
      '<label class="campo"><span>' + t[0] + ' (' + X.esc(x.unita) + ')</span><div class="scstep"><button type="button" class="btn lin" data-skd="-1" aria-label="Meno uno">−</button><input id="scV" inputmode="decimal" autocomplete="off" value="' + (modo === 'conteggio' ? fmtQ(x.quantita) : '') + '" placeholder="0"><button type="button" class="btn lin" data-skd="1" aria-label="Più uno">+</button></div></label>' +
      '<p id="scDopo" class="muted" style="margin:0 0 6px;min-height:1.4em"></p>' +
      '<label class="campo"><span>Note</span><input id="scN" maxlength="150" placeholder="' + (modo === 'carico' ? 'es. spesa Metro' : 'facoltative') + '"></label>' +
      '<button class="btn prim full big" data-skok="' + X.esc(id) + '" data-skm="' + modo + '">' + t[2] + '</button></div>';
    d.showModal();
    var i = document.getElementById('scV'); scPrev(x, modo); i.addEventListener('input', function () { scPrev(x, modo); });
    setTimeout(function () { i.focus(); i.select(); }, 60);
  }
  function scPrev(x, modo) {
    var v = numIt(document.getElementById('scV').value), el = document.getElementById('scDopo'); if (!el) return;
    if (isNaN(v) || document.getElementById('scV').value === '') { el.textContent = ''; return; }
    var n = modo === 'carico' ? x.quantita + v : modo === 'uso' ? Math.max(0, x.quantita - v) : v;
    el.innerHTML = 'Dopo: <b>' + fmtQ(n) + ' ' + X.esc(x.unita) + '</b>' + (n <= x.soglia ? ' · <span style="color:var(--rosso)">sotto la soglia, finisce in “Da comprare”</span>' : '');
  }
  function scSalva(id, modo) {
    var raw = document.getElementById('scV').value, v = numIt(raw);
    if (raw === '' || isNaN(v) || v < 0) return X.toast('Scrivi un numero (anche 0).', 'err');
    if (modo !== 'conteggio' && v === 0) return X.toast('Scrivi quanti.', 'err');
    var x = X.scorte().filter(function (y) { return y.id === id; })[0]; if (!x) return;
    var op = SC && SC.operatore ? SC.operatore() : '';
    var fai = function () {
      X.accoda({tipo: 'scorta', scorta: id, modo: modo, valore: Math.round(v * 100) / 100, note: (document.getElementById('scN') || {}).value ? document.getElementById('scN').value.trim().slice(0, 150) : '', operatore: (SC && SC.operatore ? SC.operatore() : ''), quando: X.adesso()});
      var d = document.getElementById('scDlg'); if (d && d.open) d.close();
      X.toast(x.nome + ': ' + (modo === 'conteggio' ? 'ne restano ' + fmtQ(v) : (modo === 'carico' ? '+' : '−') + fmtQ(v)) + ' ' + x.unita, 'ok');
      if (SC && SC.dopo) SC.dopo();
    };
    if (!op && SC && SC.chiediOp) { var d0 = document.getElementById('scDlg'); var nota = (document.getElementById('scN') || {}).value || ''; if (d0 && d0.open) d0.close(); return SC.chiediOp(function () { scApri(id, modo); document.getElementById('scV').value = fmtQ(v); document.getElementById('scN').value = nota; scPrev(x, modo); }); }
    fai();
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button'); if (!t || !SC) return;
    var d = t.dataset;
    if (d.skr !== undefined) { SC.filtro = d.skr; if (SC.dopo) SC.dopo(); return; }
    if (d.skok) return scSalva(d.skok, d.skm);
    if (d.sk) return scApri(d.sk, d.skm);
    if (d.skd) { var i = document.getElementById('scV'), v = numIt(i.value); v = (isNaN(v) ? 0 : v) + Number(d.skd); i.value = fmtQ(Math.max(0, v)); i.dispatchEvent(new Event('input')); }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target && ev.target.id === 'scV') { var b = document.querySelector('[data-skok]'); if (b) b.click(); } });
  X.scorteFiltro = function () { return SC ? SC.filtro || '' : ''; };
  X.scorteBasse = function () { return X.scorte().filter(function (x) { return x.bassa; }).length; };

  /* ---------- chiave della postazione ---------- */
  X.chiave = function () { try { return localStorage.getItem(k('chiave')) || localStorage.getItem('excv_k') || ''; } catch (e) { return ''; } };
  X.salvaChiave = function (c) { try { if (c) localStorage.setItem(k('chiave'), c); else localStorage.removeItem(k('chiave')); } catch (e) {} };
  var chiaveUrl = (function leggiDaUrl() {
    var u = new URL(location.href), c = (u.searchParams.get('k') || '').trim();
    if (c) {
      u.searchParams.delete('k');
      try { history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); } catch (e) {}
    }
    return c;
  })();

  /* ---------- computer pubblico: nessun nome ricordato, si chiede ogni volta ---------- */
  X.pubblico = function () { try { return localStorage.getItem('excv_modo') === 'pubblico'; } catch (e) { return false; } };

  /* ---------- server ---------- */
  X.call = function (a, extra) {
    var body = {a: a, k: X.chiave()};
    if (opts.extra) body.extra = opts.extra;
    body.attesa = X.coda().length;
    Object.keys(extra || {}).forEach(function (n) { body[n] = extra[n]; });
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 30000);
    return fetch(API, {method: 'POST', body: JSON.stringify(body), headers: {'Content-Type': 'text/plain;charset=utf-8'}, redirect: 'follow', signal: ctl ? ctl.signal : undefined})
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        clearTimeout(to);
        if (!j.ok) { var e = new Error(j.error || 'Errore'); e.server = true; throw e; }
        return j;
      }, function (e) { clearTimeout(to); throw e; });
  };

  /* ---------- coda offline ---------- */
  X.coda = function () { return X.get('coda', []); };
  X.errori = function () { return X.get('errori', []); };
  X.accoda = function (item) {
    item.id = item.id || X.uuid();
    var c = X.coda(); c.push(item); X.set('coda', c);
    stato(); setTimeout(X.sync, 50);
    return item;
  };
  X.stato = function () { return X.get('stato', null); };
  X.inInvio = function () { return busy; };

  function applica(j) {
    var s = {}; Object.keys(j).forEach(function (n) { if (n !== 'esiti' && n !== 'ok') s[n] = j[n]; });
    s.ricevuto = Date.now();
    X.set('stato', s);
    if (opts.onStato) opts.onStato(s);
  }

  X.sync = function (forza) {
    if (busy || !X.chiave()) return Promise.resolve();
    if (!forza && Date.now() < nextAt) return Promise.resolve();
    var c = X.coda();
    if (!c.length && !forza && Date.now() - lastInit < 90000) return Promise.resolve();
    busy = true; stato();
    var invio = c.slice(0, 120);
    var p = invio.length ? X.call('sync', {coda: invio}) : X.call('init');
    return p.then(function (j) {
      busy = false; fails = 0; nextAt = 0; lastOk = Date.now(); lastInit = Date.now();
      if (j.esiti) {
        var err = X.errori(), resto = [];
        X.coda().forEach(function (it) {
          var e = j.esiti[it.id];
          if (e === 'ok') return;
          if (e) { it.errore = e; err.unshift(it); return; }
          resto.push(it);
        });
        X.set('coda', resto); X.set('errori', err.slice(0, 50));
        if (opts.onEsiti) opts.onEsiti(j.esiti);
        if (resto.length) setTimeout(X.sync, 200);
      }
      applica(j); X.aggiornaNomi(); X.menuApp(); stato();
    }, function (e) {
      busy = false;
      if (e.server && /CHIAVE_NON_VALIDA/.test(e.message)) {
        X.toast('Questa postazione non è più autorizzata. Serve una nuova chiave.', 'err');
        if (opts.onChiave) opts.onChiave();
      }
      fails++; nextAt = Date.now() + Math.min(300000, 8000 * Math.pow(2, fails - 1));
      stato();
    });
  };

  /* ---------- indicatore di collegamento ---------- */
  function stato() {
    var el = document.getElementById('sync'); if (!el) return;
    var n = X.coda().length, ne = X.errori().length, cls, txt;
    if (busy) { cls = 'blu'; txt = n ? 'Invio di ' + n + '…' : 'Aggiorno…'; }
    else if (!navigator.onLine && n) { cls = 'ros'; txt = 'Senza rete · ' + n + ' in attesa'; }
    else if (!navigator.onLine) { cls = 'ros'; txt = 'Senza rete'; }
    else if (n && fails) { cls = 'ara'; txt = n + ' in attesa · riprovo'; }
    else if (n) { cls = 'ara'; txt = n + ' in attesa'; }
    else if (fails && !lastOk) { cls = 'ara'; txt = 'Collegamento lento'; }
    else { cls = 'ver'; txt = lastOk ? 'Tutto salvato' : 'Pronto'; }
    if (ne) { txt += ' · ' + ne + ' da controllare'; cls = 'ros'; }
    el.className = 'sync ' + cls; el.textContent = txt;
    el.title = lastOk ? 'Ultimo contatto col gestionale: ' + new Date(lastOk).toLocaleTimeString('it-IT') : 'Nessun contatto ancora';
  }
  X.aggiornaStato = stato;

  /* ---------- schermo sempre acceso ---------- */
  var wl = null;
  function sveglia() { try { if (navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').then(function (l) { wl = l; }, function () {}); } catch (e) {} }

  /* ---------- avvio ---------- */
  X.avvia = function (nome, o) {
    app = nome; opts = o || {};
    if (chiaveUrl) { X.salvaChiave(chiaveUrl); chiaveUrl = ''; }
    if (navigator.serviceWorker && location.protocol === 'https:') {
      var giaControllata = !!navigator.serviceWorker.controller, ricaricata = false;
      navigator.serviceWorker.register('../sw.js', {updateViaCache: 'none'}).then(function (reg) {
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () {}); });
      }).catch(function () {});
      /* quando arriva una versione nuova dell'app, la pagina si ricarica da sola (una volta) */
      navigator.serviceWorker.addEventListener('controllerchange', function () { if (giaControllata && !ricaricata && !document.querySelector('dialog[open]')) { ricaricata = true; location.reload(); } });
    }
    window.addEventListener('online', function () { nextAt = 0; stato(); X.sync(true); });
    window.addEventListener('offline', stato);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { sveglia(); X.sync(); } });
    sveglia();
    stato();
    var s = X.stato(); if (s && opts.onStato) opts.onStato(s);
    X.aggiornaNomi(); X.menuApp();
    if (timer) clearInterval(timer);
    timer = setInterval(function () { stato(); X.sync(); if (opts.onTick) opts.onTick(); }, 20000);
    if (X.chiave()) X.sync(true);
  };

  /* Invio (tasto blu della tastiera) in un campo di testo: chiude la tastiera; se il campo ha data-invio, preme quel pulsante */
  document.addEventListener('keydown', function (ev) {
    var t = ev.target;
    if (ev.key !== 'Enter' || !t || t.tagName !== 'INPUT' || t.id === 'scV') return;
    ev.preventDefault();
    var sel = t.getAttribute('data-invio');
    t.blur();
    if (sel) { var b = document.querySelector(sel); if (b) setTimeout(function () { b.click(); }, 50); }
  });
  document.addEventListener('focusin', function (ev) {
    var t = ev.target;
    if (t && t.tagName === 'INPUT' && !t.hasAttribute('enterkeyhint')) t.setAttribute('enterkeyhint', t.hasAttribute('data-invio') ? 'go' : 'done');
  });
})();
/* Posti dei forni: 4 ripiani (s1 in alto … s4 in basso) da 4 oggetti ciascuno = 16 posti (p1…p16).
   Mezzo forno h1 = ripiani 1-2, h2 = ripiani 3-4. Prenotabili insieme fino a 2 mezzi forni, 4 ripiani o 16 oggetti.
   Le prenotazioni vecchie (mezzo, ripiano, o1-o4) si leggono come h1, s3, p13-p16. */
var FM = (function () {
  var LEG = {mezzo: 'h1', ripiano: 's3', o1: 'p13', o2: 'p14', o3: 'p15', o4: 'p16'};
  function range(a, b) { var o = []; for (var i = a; i <= b; i++) o.push(i); return o; }
  function norm(posti) {
    var out = [];
    (posti || []).forEach(function (x) {
      x = String(x).trim(); x = LEG[x] || x;
      if ((x === 'intero' || /^h[12]$/.test(x) || /^s[1-4]$/.test(x) || /^p([1-9]|1[0-6])$/.test(x)) && out.indexOf(x) < 0) out.push(x);
    });
    return out.indexOf('intero') >= 0 ? ['intero'] : out;
  }
  function unita(x) {
    if (x === 'intero') return range(1, 16);
    var n = Number(x.slice(1));
    if (x.charAt(0) === 'h') return range(n * 8 - 7, n * 8);
    if (x.charAt(0) === 's') return range(n * 4 - 3, n * 4);
    return [n];
  }
  function unitaDi(posti) { var o = []; norm(posti).forEach(function (x) { unita(x).forEach(function (u) { if (o.indexOf(u) < 0) o.push(u); }); }); return o; }
  /* posto (1-16) -> prenotazione che lo occupa */
  function occupa(lista) { var o = {}; (lista || []).forEach(function (r) { unitaDi(r.posti).forEach(function (u) { o[u] = r; }); }); return o; }
  function liberi(o) { var n = 0; for (var u = 1; u <= 16; u++) if (!o[u]) n++; return n; }
  function conta(posti) {
    var c = {intero: 0, h: 0, s: 0, p: 0};
    norm(posti).forEach(function (x) { if (x === 'intero') c.intero = 1; else c[x.charAt(0)]++; });
    return c;
  }
  /* sceglie i posti liberi per q mezzi forni ('h'), ripiani ('s') o oggetti ('p'), oppure il forno intero */
  function alloca(o, tipo, q) {
    var occ = {}, u, k, out = [];
    for (u = 1; u <= 16; u++) if (o[u]) occ[u] = 1;
    var libero = function (a) { return a.every(function (x) { return !occ[x]; }); };
    var prendi = function (a) { a.forEach(function (x) { occ[x] = 1; }); };
    if (tipo === 'intero') return liberi(occ) === 16 ? ['intero'] : null;
    for (k = 0; k < q; k++) {
      var scelto = null;
      if (tipo === 'h') { [1, 2].forEach(function (n) { if (!scelto && libero(unita('h' + n))) scelto = 'h' + n; }); }
      else if (tipo === 's') {
        var cand = [4, 3, 2, 1].filter(function (n) { return libero(unita('s' + n)); });
        cand.sort(function (a, b) { var pa = libero(unita('s' + (a % 2 ? a + 1 : a - 1))) ? 1 : 0, pb = libero(unita('s' + (b % 2 ? b + 1 : b - 1))) ? 1 : 0; return pa - pb || b - a; });
        if (cand.length) scelto = 's' + cand[0];
      } else {
        var best = null, bs = 9;
        for (u = 16; u >= 1; u--) {
          if (occ[u]) continue;
          var sh = Math.ceil(u / 4), h = Math.ceil(u / 8);
          var s = !libero(unita('s' + sh)) ? 0 : !libero(unita('h' + h)) ? 1 : 2;
          if (s < bs) { bs = s; best = u; }
        }
        if (best) scelto = 'p' + best;
      }
      if (!scelto) return null;
      prendi(unita(scelto)); out.push(scelto);
    }
    return out;
  }
  function prezzo(l, posti) {
    if (!l) return null; var c = conta(posti);
    if (c.intero) return l.intero == null ? null : Number(l.intero);
    var tot = c.h * (Number(l.mezzo) || 0) + c.s * (Number(l.ripiano) || 0) + c.p * (Number(l.oggetto) || 0);
    return Math.round(tot * 100) / 100;
  }
  function etichetta(posti) {
    var c = conta(posti);
    if (c.intero) return 'forno intero';
    return [c.h ? (c.h === 1 ? 'mezzo forno' : c.h + ' mezzi forni') : '', c.s ? c.s + (c.s === 1 ? ' ripiano' : ' ripiani') : '', c.p ? c.p + (c.p === 1 ? ' oggetto' : ' oggetti') : ''].filter(String).join(' + ');
  }
  /* righe del disegno: per ogni ripiano, segmenti di posti consecutivi liberi o della stessa prenotazione */
  function righe(o) {
    var out = [];
    for (var s = 1; s <= 4; s++) {
      var seg = [];
      for (var u = s * 4 - 3; u <= s * 4; u++) {
        var r = o[u] || null, last = seg[seg.length - 1];
        if (last && r && last.r === r) last.n++;
        else seg.push({r: r, n: 1, u: u});
      }
      out.push(seg);
    }
    return out;
  }
  var TIPI = [['p', 'Oggetti', 16], ['s', 'Ripiani', 4], ['h', 'Mezzi forni', 2]];
  return {norm: norm, unitaDi: unitaDi, occupa: occupa, liberi: liberi, conta: conta, alloca: alloca, prezzo: prezzo, etichetta: etichetta, righe: righe, TIPI: TIPI};
})();
window.FM = FM;

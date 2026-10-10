/* STEER AfterParts — Supabase backend adapter.
   Provides window.claude.use('db' | 'assets' | 'downloads') with the same
   interface the workspace already uses, backed by Supabase:
     db      -> table public.docs (path, collection, data) + Realtime
     assets  -> Storage bucket "attachments"
     downloads -> null (the app falls back to a normal browser download)
   Also adds sign-in (email + password or email link), an access allowlist
   (public.app_users) and a small account menu. */
(function () {
  'use strict';
  var CFG = window.STEER_CONFIG || {};
  if (!window.supabase || !CFG.url || !CFG.key) { console.warn('STEER: Supabase not configured; running in this browser only.'); return; }
  var sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  });
  window.STEER_SB = sb;

  /* ------------------------------------------------------------------ auth gate */
  var readyResolve, ready = new Promise(function (r) { readyResolve = r; });
  var me = { email: null, admin: false, uid: null };

  var css = '\
#sbx{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.72);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}\
#sbx .card{background:#fff;color:#0f172a;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.3);width:100%;max-width:380px;padding:26px 24px}\
#sbx h1{font-size:19px;margin:0 0 4px}#sbx p{margin:0 0 14px;color:#475569;font-size:13px}\
#sbx label{display:block;font-size:12px;font-weight:600;color:#334155;margin:10px 0 4px}\
#sbx input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:9px 10px;font:inherit}\
#sbx input:focus{outline:2px solid #2563eb33;border-color:#2563eb}\
#sbx button.pri{margin-top:16px;width:100%;background:#1d4ed8;color:#fff;border:0;border-radius:8px;padding:10px;font:600 14px system-ui;cursor:pointer}\
#sbx button.pri:disabled{opacity:.6;cursor:wait}\
#sbx .links{display:flex;justify-content:space-between;margin-top:12px;font-size:12.5px}\
#sbx a{color:#1d4ed8;cursor:pointer;text-decoration:none}#sbx a:hover{text-decoration:underline}\
#sbx .msg{margin-top:12px;font-size:12.5px;padding:8px 10px;border-radius:8px;display:none}\
#sbx .msg.err{display:block;background:#fef2f2;color:#991b1b}#sbx .msg.ok{display:block;background:#f0fdf4;color:#166534}\
#sbx .brand{display:flex;align-items:center;gap:8px;margin-bottom:14px;font-weight:700;color:#1d4ed8;letter-spacing:.02em;font-size:12px;text-transform:uppercase}\
#sbacct{position:fixed;right:12px;bottom:12px;z-index:9000;font:12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif}\
#sbacct>button{background:#0f172acc;color:#fff;border:0;border-radius:999px;padding:6px 12px;cursor:pointer;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.75}\
#sbacct>button:hover{opacity:1}\
#sbacct .menu{position:absolute;right:0;bottom:36px;background:#fff;color:#0f172a;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);min-width:200px;padding:6px;display:none}\
#sbacct .menu.open{display:block}#sbacct .menu div{padding:8px 10px;border-radius:6px;cursor:pointer}#sbacct .menu div:hover{background:#f1f5f9}\
#sbacct .menu .who{cursor:default;color:#64748b;font-size:11.5px}#sbacct .menu .who:hover{background:none}\
#sbteam table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px}#sbteam td,#sbteam th{padding:6px 4px;border-bottom:1px solid #e2e8f0;text-align:left}\
#sbteam .row{display:flex;gap:6px;margin-top:10px}#sbteam .row input{flex:1}#sbteam select{border:1px solid #cbd5e1;border-radius:8px;padding:8px}\
#sbteam .row button{background:#1d4ed8;color:#fff;border:0;border-radius:8px;padding:0 12px;cursor:pointer}\
#sbteam .x{color:#b91c1c;cursor:pointer}\
@media (prefers-color-scheme:dark){#sbx .card,#sbacct .menu{background:#0f172a;color:#e2e8f0}#sbx p,#sbacct .menu .who{color:#94a3b8}#sbx label{color:#cbd5e1}#sbx input,#sbteam select{background:#1e293b;color:#e2e8f0;border-color:#334155}#sbacct .menu div:hover{background:#1e293b}#sbteam td,#sbteam th{border-color:#334155}}';

  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function onDom(f) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', f); else f(); }
  onDom(function () { var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); });

  var overlay = null, mode = 'in';
  function showGate(view, note) {
    onDom(function () {
      if (!overlay) { overlay = el('<div id="sbx"><div class="card"></div></div>'); document.body.appendChild(overlay); }
      var c = overlay.querySelector('.card');
      var brand = '<div class="brand">STEER · After-parts workspace</div>';
      if (view === 'denied') {
        c.innerHTML = brand + '<h1>Access not enabled yet</h1><p>You are signed in as <b>' + esc(me.email) + '</b>, but this address has not been added to the workspace. Ask your administrator to add it under <i>Team access</i>, then reload.</p>' +
          '<button class="pri" id="sbout">Sign in with another account</button>';
        c.querySelector('#sbout').onclick = function () { sb.auth.signOut().then(function () { location.reload(); }); };
        return;
      }
      if (view === 'recover') {
        c.innerHTML = brand + '<h1>Set a new password</h1><p>Choose a password for ' + esc(me.email || 'your account') + '.</p>' +
          '<label>New password</label><input id="sbp1" type="password" autocomplete="new-password" minlength="8">' +
          '<button class="pri" id="sbgo">Save password</button><div class="msg" id="sbmsg"></div>';
        c.querySelector('#sbgo').onclick = function () {
          var p = c.querySelector('#sbp1').value; if (p.length < 8) return msg('err', 'Use at least 8 characters.');
          sb.auth.updateUser({ password: p }).then(function (r) { if (r.error) return msg('err', r.error.message); msg('ok', 'Password saved.'); setTimeout(function () { location.replace(location.pathname); }, 800); });
        };
        return;
      }
      mode = view || mode;
      var title = { in: 'Sign in', up: 'Create your account', link: 'Email me a sign-in link', forgot: 'Reset your password' }[mode];
      var sub = { in: 'Use your work email.', up: 'Your email must be added to the workspace by an administrator.', link: 'We will email you a one-time link.', forgot: 'We will email you a link to set a new password.' }[mode];
      c.innerHTML = brand + '<h1>' + title + '</h1><p>' + sub + '</p>' +
        '<form id="sbf"><label>Email</label><input id="sbe" type="email" required autocomplete="email">' +
        (mode === 'in' || mode === 'up' ? '<label>Password</label><input id="sbp" type="password" required minlength="8" autocomplete="' + (mode === 'up' ? 'new-password' : 'current-password') + '">' : '') +
        '<button class="pri" id="sbgo" type="submit">' + { in: 'Sign in', up: 'Create account', link: 'Send link', forgot: 'Send reset link' }[mode] + '</button></form>' +
        '<div class="msg" id="sbmsg"></div><div class="links">' +
        (mode === 'in' ? '<a data-v="up">Create account</a><a data-v="forgot">Forgot password?</a>' : '<a data-v="in">Back to sign in</a>') +
        (mode === 'in' ? '' : '<span></span>') + '</div>' +
        (mode === 'in' ? '<div class="links" style="justify-content:center"><a data-v="link">Email me a sign-in link instead</a></div>' : '');
      if (note) msg(note[0], note[1]);
      c.querySelectorAll('a[data-v]').forEach(function (a) { a.onclick = function () { showGate(a.getAttribute('data-v')); }; });
      var redirect = location.origin + location.pathname;
      c.querySelector('#sbf').onsubmit = function (ev) {
        ev.preventDefault();
        var email = c.querySelector('#sbe').value.trim().toLowerCase(), pw = c.querySelector('#sbp') ? c.querySelector('#sbp').value : '';
        var b = c.querySelector('#sbgo'); b.disabled = true;
        var p;
        if (mode === 'in') p = sb.auth.signInWithPassword({ email: email, password: pw });
        else if (mode === 'up') p = sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: redirect } });
        else if (mode === 'link') p = sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
        else p = sb.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        p.then(function (r) {
          b.disabled = false;
          if (r.error) return msg('err', r.error.message);
          if (mode === 'up' && !(r.data && r.data.session)) return msg('ok', 'Check your inbox to confirm your email, then sign in.');
          if (mode === 'link') return msg('ok', 'Link sent. Open it on this device.');
          if (mode === 'forgot') return msg('ok', 'Reset link sent. Check your inbox.');
        }, function (e) { b.disabled = false; msg('err', String(e && e.message || e)); });
      };
      setTimeout(function () { var i = c.querySelector('#sbe'); if (i) i.focus(); }, 30);
      function msg(k, t) { var m = c.querySelector('#sbmsg'); if (m) { m.className = 'msg ' + k; m.textContent = t; } }
    });
    function msg(k, t) { var m = overlay && overlay.querySelector('#sbmsg'); if (m) { m.className = 'msg ' + k; m.textContent = t; } }
  }
  function hideGate() { if (overlay) { overlay.remove(); overlay = null; } }

  var started = false, recovering = false;
  async function onSession(session) {
    if (!session) { showGate('in'); return; }
    me.email = (session.user.email || '').toLowerCase(); me.uid = session.user.id;
    if (recovering) { showGate('recover'); return; }
    if (started) return;
    var r = await sb.rpc('is_app_user');
    if (r.error || !r.data) { showGate('denied'); return; }
    var a = await sb.rpc('is_app_admin'); me.admin = !!a.data;
    started = true; window.STEER_SESSION = { email: me.email, uid: me.uid }; hideGate(); accountMenu(); startRealtime(); readyResolve(true);
  }
  if (CFG.open) {
    /* Prototype mode: no sign-in. Everyone shares the same data; the role switcher picks the view. */
    started = true; startRealtime(); readyResolve(true);
  } else sb.auth.onAuthStateChange(function (ev, session) {
    if (ev === 'PASSWORD_RECOVERY') { recovering = true; me.email = session && session.user.email; showGate('recover'); return; }
    if (ev === 'SIGNED_OUT') { location.reload(); return; }
    if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') setTimeout(function () { onSession(session); }, 0);
  });

  /* --------------------------------------------------------------- account menu */
  function accountMenu() {
    onDom(function () {
      var box = el('<div id="sbacct"><button title="Account">' + esc(me.email) + '</button><div class="menu">' +
        '<div class="who">Signed in as<br><b>' + esc(me.email) + '</b>' + (me.admin ? ' · admin' : '') + '</div>' +
        (me.admin ? '<div data-a="team">Team access…</div>' : '') +
        '<div data-a="out">Sign out</div></div></div>');
      document.body.appendChild(box);
      var menu = box.querySelector('.menu');
      box.querySelector('button').onclick = function (e) { e.stopPropagation(); menu.classList.toggle('open'); };
      document.addEventListener('click', function () { menu.classList.remove('open'); });
      menu.onclick = function (e) {
        var a = e.target.closest('[data-a]'); if (!a) return;
        if (a.dataset.a === 'out') {
          try { Object.keys(localStorage).forEach(function (k) { if (/^steer-/.test(k) && k !== 'steer-outbox') localStorage.removeItem(k); }); } catch (x) {}
          sb.auth.signOut();
        }
        if (a.dataset.a === 'team') teamPanel();
      };
    });
  }
  async function teamPanel() {
    var ov = el('<div id="sbx"><div class="card" id="sbteam" style="max-width:520px"><div class="brand">Team access</div><h1>Who can use this workspace</h1><p>People sign in with these emails. Admins can add or remove people.</p><div id="sbtl">Loading…</div>' +
      '<div class="row"><input id="sbne" type="email" placeholder="name@company.com"><select id="sbnr"><option value="member">Member</option><option value="admin">Admin</option></select><button id="sbadd">Add</button></div>' +
      '<div class="msg" id="sbmsg"></div><button class="pri" id="sbclose">Done</button></div></div>');
    document.body.appendChild(ov);
    ov.querySelector('#sbclose').onclick = function () { ov.remove(); };
    function m(k, t) { var x = ov.querySelector('#sbmsg'); x.className = 'msg ' + k; x.textContent = t; }
    async function load() {
      var r = await sb.from('app_users').select('email,role,added_at').order('email');
      if (r.error) return m('err', r.error.message);
      ov.querySelector('#sbtl').innerHTML = '<table><tr><th>Email</th><th>Role</th><th></th></tr>' + r.data.map(function (u) {
        return '<tr><td>' + esc(u.email) + '</td><td>' + esc(u.role) + '</td><td>' + (u.email === me.email ? '' : '<span class="x" data-e="' + esc(u.email) + '">Remove</span>') + '</td></tr>';
      }).join('') + '</table>';
      ov.querySelectorAll('.x').forEach(function (x) { x.onclick = async function () {
        if (!confirm('Remove ' + x.dataset.e + '?')) return;
        var d = await sb.from('app_users').delete().eq('email', x.dataset.e); if (d.error) m('err', d.error.message); else { m('ok', 'Removed.'); load(); }
      }; });
    }
    ov.querySelector('#sbadd').onclick = async function () {
      var e = ov.querySelector('#sbne').value.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return m('err', 'Enter a valid email.');
      var r = await sb.from('app_users').upsert({ email: e, role: ov.querySelector('#sbnr').value });
      if (r.error) return m('err', r.error.message); ov.querySelector('#sbne').value = ''; m('ok', 'Added. They can now create an account with this email.'); load();
    };
    load();
  }

  /* ------------------------------------------------------------ document store */
  var cache = {};       // collection -> {path: data}
  var loading = {};     // collection -> Promise
  var colL = {};        // collection -> [cb]
  var docL = {};        // path -> [cb]
  var notifyT = {};
  var colOf = function (p) { return String(p).split('/')[0]; };
  var idOf = function (p) { return String(p).split('/').slice(1).join('/'); };

  function qsnap(col) {
    var m = cache[col] || {}, keys = Object.keys(m);
    return { empty: keys.length === 0, size: keys.length, docs: keys.map(function (p) { var d = m[p]; return { id: idOf(p), ref: { path: p }, data: function () { return d; } }; }) };
  }
  function dsnap(p, d) { return { id: idOf(p), exists: d !== undefined && d !== null, data: function () { return d; } }; }

  async function loadCol(col) {
    if (cache[col]) return;
    if (!loading[col]) loading[col] = (async function () {
      var out = {}, from = 0, size = 1000;
      for (;;) {
        var r = await sb.from('docs').select('path,data').eq('collection', col).order('path').range(from, from + size - 1);
        if (r.error) throw r.error;
        r.data.forEach(function (x) { out[x.path] = x.data; });
        if (r.data.length < size) break; from += size;
      }
      cache[col] = Object.assign(out, cache[col] || {});
    })().catch(function (e) { delete loading[col]; throw e; });
    return loading[col];
  }
  function notify(col, path) {
    (docL[path] || []).forEach(function (cb) { try { cb(dsnap(path, cache[col] && cache[col][path])); } catch (e) { console.error(e); } });
    if (!colL[col] || !colL[col].length) return;
    clearTimeout(notifyT[col]);
    notifyT[col] = setTimeout(function () { var s = qsnap(col); colL[col].forEach(function (cb) { try { cb(s); } catch (e) { console.error(e); } }); }, 120);
  }
  function applyLocal(path, data) {
    var col = colOf(path);
    if (col === 'chunks') return;
    if (cache[col]) { if (data === undefined) delete cache[col][path]; else cache[col][path] = data; }
    notify(col, path);
  }

  var rtStarted = false;
  function startRealtime() {
    if (rtStarted) return; rtStarted = true;
    sb.channel('steer-docs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'collection=neq.chunks' }, function (pl) {
        if (pl.eventType === 'DELETE') { var p = pl.old && pl.old.path; if (p) applyLocal(p, undefined); }
        else if (pl.new && pl.new.path) applyLocal(pl.new.path, pl.new.data);
      })
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED' && rtStarted === 'again') Object.keys(cache).forEach(function (c) { delete cache[c]; delete loading[c]; refresh(c); });
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') rtStarted = 'again';
      });
  }
  async function refresh(col) { try { await loadCol(col); notify(col, ''); } catch (e) {} }

  /* writes are coalesced and sent in batches */
  var pend = new Map(), flushT = null;
  function errOf(e) {
    var code = e && (e.code === '42501' || /row-level security|permission/i.test(e.message || '')) ? 'invalid_argument' : 'unavailable';
    return { code: code, message: (e && e.message) || 'Write failed' };
  }
  function queue(path, op, data) {
    return new Promise(function (res, rej) {
      var prev = pend.get(path), cbs = prev ? prev.cbs : [];
      cbs.push([res, rej]); pend.set(path, { op: op, data: data, cbs: cbs });
      if (!flushT) flushT = setTimeout(flush, 30);
    });
  }
  async function flush() {
    flushT = null; var items = Array.from(pend.entries()); pend.clear();
    var sets = items.filter(function (x) { return x[1].op === 'set'; }), dels = items.filter(function (x) { return x[1].op === 'del'; });
    var groups = [], g = [], bytes = 0;
    sets.forEach(function (x) { var n = JSON.stringify(x[1].data).length; if (g.length && (bytes + n > 1500000 || g.length >= 300)) { groups.push(g); g = []; bytes = 0; } g.push(x); bytes += n; });
    if (g.length) groups.push(g);
    for (var i = 0; i < groups.length; i++) {
      var grp = groups[i];
      var r = await sb.from('docs').upsert(grp.map(function (x) { return { path: x[0], data: x[1].data }; }), { onConflict: 'path' });
      grp.forEach(function (x) { x[1].cbs.forEach(function (c) { r.error ? c[1](errOf(r.error)) : c[0](); }); });
    }
    for (var j = 0; j < dels.length; j += 200) {
      var dg = dels.slice(j, j + 200);
      var d = await sb.from('docs').delete().in('path', dg.map(function (x) { return x[0]; }));
      dg.forEach(function (x) { x[1].cbs.forEach(function (c) { d.error ? c[1](errOf(d.error)) : c[0](); }); });
    }
  }
  function clean(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }

  var DB = {
    collection: function (col) {
      return {
        onSnapshot: function (cb, onErr) {
          (colL[col] = colL[col] || []).push(cb);
          loadCol(col).then(function () { cb(qsnap(col)); }, function (e) { if (onErr) onErr(errOf(e)); });
          return function () { colL[col] = (colL[col] || []).filter(function (f) { return f !== cb; }); };
        },
        get: function () { return loadCol(col).then(function () { return qsnap(col); }); },
        doc: function (id) { return DB.doc(col + '/' + id); }
      };
    },
    doc: function (path) {
      var col = colOf(path);
      return {
        id: idOf(path), path: path,
        get: async function () {
          if (cache[col] && col !== 'chunks') return dsnap(path, cache[col][path]);
          var r = await sb.from('docs').select('data').eq('path', path).maybeSingle();
          if (r.error) throw errOf(r.error);
          return dsnap(path, r.data ? r.data.data : undefined);
        },
        set: function (data) { var d = clean(data); applyLocal(path, d); return queue(path, 'set', d); },
        delete: function () { applyLocal(path, undefined); return queue(path, 'del'); },
        onSnapshot: function (cb, onErr) {
          (docL[path] = docL[path] || []).push(cb);
          (cache[col] ? Promise.resolve() : loadCol(col)).then(function () { cb(dsnap(path, cache[col][path])); }, function (e) { if (onErr) onErr(errOf(e)); });
          return function () { docL[path] = (docL[path] || []).filter(function (f) { return f !== cb; }); };
        }
      };
    }
  };

  /* ---------------------------------------------------------------- attachments */
  var ASSETS = {
    upload: async function (blob, opts) {
      var name = (blob.name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
      var rnd = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
      var path = (me.uid || 'shared') + '/' + rnd + '-' + name;
      var type = (opts && opts.type) || blob.type || 'application/octet-stream';
      var r = await sb.storage.from('attachments').upload(path, blob, { contentType: type, upsert: false });
      if (r.error) throw { code: /size|large/i.test(r.error.message) ? 'too_large' : 'upstream_error', message: r.error.message };
      var url = sb.storage.from('attachments').getPublicUrl(path).data.publicUrl;
      return { id: path, url: url, sizeBytes: blob.size, contentType: type };
    },
    list: async function () { return { assets: [], usage: {} }; },
    delete: async function (ref) { var r = await sb.storage.from('attachments').remove([ref]); return { deleted: !r.error }; }
  };

  window.claude = window.claude || {};
  window.claude.use = async function (name) {
    if (name === 'db') { await ready; return DB; }
    if (name === 'assets') { await ready; return ASSETS; }
    return null; // downloads: the app uses a normal browser download
  };
})();

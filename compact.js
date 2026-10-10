/* STEER workspace — compact layout layer (less scrolling).
   Runs after every screen render (and after in-screen re-renders such as
   sorting or filtering) and:
     1. pages long tables (10 rows, with 10 / 25 / 50 / All),
     2. trims long worklists and timelines to a few items with "Show more",
     3. makes every card collapsible, remembers the choice, and folds
        reference-only cards (checks, history, rules, method notes) by default,
     4. adds a back-to-top button when a screen is still taller than two screens.
   It never removes rows: hidden rows stay in the page, so sorting, row
   clicks, downloads and counts are unaffected. */
(function () {
  'use strict';
  var PAGE_SIZE = 10, MIN_ROWS = 12;       // tables longer than 12 rows get a pager
  var LIST_SHOW = 5, MIN_LIST = 7;         // lists longer than 7 items show 5 + "more"
  var FOLD = /^(reconciliation checks|import history|file rules|data settings|the five questions|tests from uploaded ledgers|how (this|it) works|method|methodology|about this (screen|data)|definitions|notes)\b/i;

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var pgState = {};                                  // per table key, for this session
  var folds = store.get('steer-ui-folds', {});        // per card key, remembered
  var listOpen = {};

  function screenId() { var m = location.hash.match(/^#\/\w+\/(\w+)/); return m ? m[1] : 'home'; }
  function cardTitle(el) { var c = el.closest('.card'); var h = c && c.querySelector(':scope>.ch h2'); return h ? h.textContent.trim().slice(0, 60) : ''; }
  function isAppHidden(tr) { return tr.style.display === 'none' || tr.hidden; }

  /* ---------------------------------------------------------- 1. table pager */
  function pageTables(root) {
    var tables = root.querySelectorAll('table');
    tables.forEach(function (t, ti) {
      var body = t.tBodies[0]; if (!body) return;
      var wrap = t.parentElement && t.parentElement.classList.contains('tbl-wrap') ? t.parentElement : t;
      var rows = Array.prototype.filter.call(body.rows, function (r) { return !isAppHidden(r); });
      var bar = wrap.nextElementSibling && wrap.nextElementSibling.classList.contains('pgbar') ? wrap.nextElementSibling : null;
      if (rows.length <= MIN_ROWS) {
        Array.prototype.forEach.call(body.rows, function (r) { r.classList.remove('pg-off'); });
        if (bar) bar.remove(); wrap.classList.remove('pg-on'); return;
      }
      var key = screenId() + '|' + cardTitle(t) + '|' + ti;
      var card = t.closest('.card'), many = card && card.querySelectorAll('table').length > 1 && card.querySelectorAll('.label + .tbl-wrap').length < 3;
      var st = pgState[key] || (pgState[key] = { size: many ? 5 : PAGE_SIZE, pg: 0 });
      var size = st.size === 0 ? rows.length : st.size;
      var pages = Math.max(1, Math.ceil(rows.length / size));
      var sig = rows.length + '|' + (rows[0].textContent || '').slice(0, 80) + '|' + (rows[rows.length - 1].textContent || '').slice(0, 80);
      if (st.sig !== undefined && st.sig !== sig) st.pg = 0;          // re-sorted or re-filtered: back to the first page
      st.sig = sig;
      if (t.dataset.goto != null) { st.pg = Math.floor((+t.dataset.goto) / size); delete t.dataset.goto; }
      if (st.pg >= pages) st.pg = pages - 1;
      var a = st.pg * size, b = Math.min(rows.length, a + size);
      Array.prototype.forEach.call(body.rows, function (r) { r.classList.add('pg-off'); });
      for (var i = a; i < b; i++) rows[i].classList.remove('pg-off');
      wrap.classList.add('pg-on');
      if (!bar) { bar = document.createElement('div'); bar.className = 'pgbar'; wrap.after(bar); }
      bar.innerHTML = '<span><b>' + (a + 1) + '–' + b + '</b> of <b>' + rows.length + '</b></span>' +
        '<span class="pgnav"><label>Rows <select aria-label="Rows per page">' +
        (st.size === 5 ? [5, 10, 25, 50, 0] : [10, 25, 50, 0]).map(function (n) { return '<option value="' + n + '"' + (st.size === n ? ' selected' : '') + '>' + (n || 'All') + '</option>'; }).join('') +
        '</select></label> <button data-p="-1" aria-label="Previous page"' + (st.pg ? '' : ' disabled') + '>‹</button>' +
        '<span>' + (st.pg + 1) + ' / ' + pages + '</span>' +
        '<button data-p="1" aria-label="Next page"' + (st.pg < pages - 1 ? '' : ' disabled') + '>›</button></span>';
      bar.querySelector('select').onchange = function (e) { st.size = +e.target.value; st.pg = 0; run(); };
      bar.querySelectorAll('button[data-p]').forEach(function (btn) {
        btn.onclick = function () {
          st.pg = Math.max(0, Math.min(pages - 1, st.pg + (+btn.dataset.p))); run();
          var top = (t.closest('.card') || t).getBoundingClientRect().top;
          if (top < 0) (t.closest('.card') || t).scrollIntoView({ block: 'start' });
        };
      });
    });
  }

  /* ------------------------------------------- 2. long worklists and timelines */
  function trimLists(root) {
    var lists = root.querySelectorAll('.cb.flush, ul.tl');
    lists.forEach(function (ls, li) {
      if (window.innerWidth > 900 && ls.closest('.casewrap,.inboxwrap')) return;   // desktop panes scroll on their own
      var items = Array.prototype.filter.call(ls.children, function (c) { return c.classList.contains('linkrow') || c.tagName === 'LI'; });
      var more = ls.querySelector(':scope>.lsmore');
      var seeAll = Array.prototype.some.call(ls.children, function (c) { return /^see all\b/i.test(c.textContent.trim()); });
      if (seeAll) {   // the list already has its own "See all" link: just show the top five
        if (more) more.remove();
        var real = items.filter(function (c) { return !/^see all\b/i.test(c.textContent.trim()); });
        real.forEach(function (c, i) { c.classList.toggle('ls-off', i >= LIST_SHOW); });
        return;
      }

      if (items.length < MIN_LIST) { items.forEach(function (c) { c.classList.remove('ls-off'); }); if (more) more.remove(); return; }
      var key = screenId() + '|' + cardTitle(ls) + '|' + li;
      var open = !!listOpen[key];
      items.forEach(function (c, i) { c.classList.toggle('ls-off', !open && i >= LIST_SHOW); });
      if (!more) { more = document.createElement('button'); more.type = 'button'; more.className = 'lsmore'; ls.appendChild(more); }
      more.textContent = open ? 'Show fewer' : 'Show ' + (items.length - LIST_SHOW) + ' more';
      more.onclick = function () { listOpen[key] = !open; run(); };
    });
  }

  /* ------------------------------------------------------ 3. collapsible cards */
  var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  function foldCards(root) {
    root.querySelectorAll('.card').forEach(function (c) {
      var ch = c.querySelector(':scope>.ch'); var h = ch && ch.querySelector('h2');
      if (!ch || !h || c.closest('.drawer')) return;
      if (c.children.length < 2) return;                     // header only: nothing to fold
      var title = h.textContent.trim();
      var key = screenId() + '|' + title.slice(0, 60);
      var shut = key in folds ? folds[key] : FOLD.test(title);
      c.classList.toggle('cl-shut', !!shut);
      var tog = ch.querySelector(':scope>.cl-tog');
      if (!tog) {
        tog = document.createElement('button'); tog.type = 'button'; tog.className = 'cl-tog'; tog.innerHTML = CHEV; ch.appendChild(tog);
        h.classList.add('cl-h');
        var flip = function (e) { e.stopPropagation(); var now = !c.classList.contains('cl-shut'); folds[key] = now; store.set('steer-ui-folds', folds); c.classList.toggle('cl-shut', now); upd(); };
        tog.onclick = flip; h.onclick = flip;
      }
      upd();
      function upd() { var s = c.classList.contains('cl-shut'); tog.setAttribute('aria-expanded', String(!s)); tog.title = s ? 'Show this section' : 'Fold this section'; tog.setAttribute('aria-label', (s ? 'Show ' : 'Fold ') + title); }
    });
  }

  /* --------------------------------------------------------- 4. back to top */
  var totop = null;
  function backToTop() {
    var v = document.getElementById('view'); if (!v) return;
    if (!totop) {
      totop = document.createElement('button'); totop.className = 'totop'; totop.setAttribute('aria-label', 'Back to top');
      totop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
      totop.onclick = function () { v.scrollTo({ top: 0, behavior: 'smooth' }); };
      document.body.appendChild(totop);
      v.addEventListener('scroll', function () { totop.classList.toggle('show', v.scrollTop > v.clientHeight * 0.8); }, { passive: true });
    }
    totop.classList.toggle('show', v.scrollTop > v.clientHeight * 0.8);
  }


  /* ------------------------------------- 5. team groups become tabs (h2 + grid) */
  var tabSel = store.get('steer-ui-tabs', {});
  function tabGroups(root) {
    var heads = Array.prototype.filter.call(root.children, function (e) {
      return e.tagName === 'H2' && e.nextElementSibling && e.nextElementSibling.classList.contains('agrid');
    });
    var strip = root.querySelector(':scope>.cgtabs');
    if (heads.length < 2) { if (strip) strip.remove(); return; }
    var key = screenId(), labels = heads.map(function (h) { return h.textContent.trim(); });
    var cur = labels.indexOf(tabSel[key]); if (cur < 0) cur = 0;
    if (!strip) { strip = document.createElement('div'); strip.className = 'cgtabs'; heads[0].before(strip); }
    strip.innerHTML = '<div class="seg" role="tablist">' + labels.map(function (l, i) {
      var n = heads[i].nextElementSibling.children.length;
      return '<button role="tab" data-t="' + i + '" aria-pressed="' + (i === cur) + '" aria-selected="' + (i === cur) + '">' + l.replace(/[<>&]/g, '') + ' <span class="n">' + n + '</span></button>';
    }).join('') + '</div>';
    heads.forEach(function (h, i) { h.classList.add('grp-off'); h.nextElementSibling.classList.toggle('grp-off', i !== cur); });
    strip.querySelectorAll('button').forEach(function (b) { b.onclick = function () { tabSel[key] = labels[+b.dataset.t]; store.set('steer-ui-tabs', tabSel); run(); }; });
  }

  /* --------------- 7. long multi-section screens get section tabs (by card title) */
  var SECT = {
    team: [['Owners & teams', /^(mapping health|coverage and primary owners)/i], ['Engineers', /^engineer pool/i], ['Customer identity', /^customer identity/i], ['Customer territories', /^customer territories/i], ['Change history', /^change history/i]],
    ib: [['Bridge to after-parts', /^tse/i], ['Data gaps', /^data gaps/i], ['Dark machines', /^dark machines/i], ['All machines', /^all machines/i]],
    radar: [['Timeline', /^(forward pipeline|when each line)/i], ['Call list', /^call list/i], ['Leads from visits', /^leads from service visits/i]],
    schedule: [['Schedule', /^any engineer|^(overdue|this week|planned)/i], ['Engineers', /^(engineers and capacity|engineer load)/i]],
    market: [['Competitor incursion', /^competitor incursion/i], ['White space', /^white space/i], ['Cohort trajectory', /^cohort trajectory/i]]
  };
  var secSel = store.get('steer-ui-sect', {});
  function titleOf(e) {
    var h = e.matches && e.matches('.card') ? e.querySelector(':scope>.ch h2') : e.querySelector && e.querySelector('.card>.ch h2');
    if (!h && e.classList && e.classList.contains('card')) {   // cards without a header: use the first control's text
      var f = e.querySelector('select,h3,.label'); return f ? f.textContent.trim() : '';
    }
    return h ? h.textContent.trim() : '';
  }
  function sectionTabs(root) {
    var cfg = SECT[screenId()], strip = root.querySelector(':scope>.sectabs');
    if (!cfg) { if (strip) strip.remove(); return; }
    var kids = Array.prototype.filter.call(root.children, function (e) { return !e.classList.contains('sectabs'); });
    var start = -1;
    kids.forEach(function (e, i) { if (start < 0 && titleOf(e) && cfg.some(function (c) { return c[1].test(titleOf(e)); })) start = i; });
    if (start < 0) { if (strip) strip.remove(); return; }
    var owner = [], curT = 0, used = {};
    for (var i = start; i < kids.length; i++) {
      var t = titleOf(kids[i]), hit = -1;
      if (t) cfg.forEach(function (c, ci) { if (hit < 0 && c[1].test(t)) hit = ci; });
      if (hit >= 0) curT = hit;
      owner.push([kids[i], curT]); used[curT] = true;
    }
    var tabs = cfg.map(function (c, i) { return { l: c[0], i: i }; }).filter(function (x) { return used[x.i]; });
    if (tabs.length < 2) { if (strip) strip.remove(); owner.forEach(function (o) { o[0].classList.remove('sec-off'); }); return; }
    var key = screenId(), cur = tabs.filter(function (x) { return x.l === secSel[key]; })[0] || tabs[0];
    if (!strip) { strip = document.createElement('div'); strip.className = 'sectabs'; }
    if (strip.nextElementSibling !== kids[start]) kids[start].before(strip);
    strip.innerHTML = '<div class="seg" role="tablist" aria-label="Sections">' + tabs.map(function (x) {
      return '<button role="tab" data-s="' + x.i + '" aria-pressed="' + (x === cur) + '" aria-selected="' + (x === cur) + '">' + x.l + '</button>';
    }).join('') + '</div>';
    owner.forEach(function (o) { o[0].classList.toggle('sec-off', o[1] !== cur.i); });
    strip.querySelectorAll('button').forEach(function (b) { b.onclick = function () { secSel[key] = cfg[+b.dataset.s][0]; store.set('steer-ui-sect', secSel); run(); }; });
  }
  /* anything that scrolls to, or focuses, a section on another tab opens that tab first */
  function reveal(el) {
    var sec = el && el.closest && el.closest('.sec-off,.grp-off,.cl-shut');
    var changed = false;
    if (el && el.closest && el.closest('.sec-off')) {
      var root = document.getElementById('page'), cfg = SECT[screenId()], top = el.closest('.sec-off');
      while (top && top.parentElement !== root) top = top.parentElement;
      if (cfg && top) {
        var k = Array.prototype.slice.call(root.children), idx = k.indexOf(top), t = '';
        for (var i = idx; i >= 0 && !t; i--) { var tt = titleOf(k[i]); if (tt && cfg.some(function (c) { return c[1].test(tt); })) t = tt; }
        cfg.forEach(function (c) { if (t && c[1].test(t)) secSel[screenId()] = c[0]; });
        changed = true;
      }
    }
    var shut = el && el.closest && el.closest('.card.cl-shut');
    if (shut) { var h = shut.querySelector(':scope>.ch h2'); if (h) { folds[screenId() + '|' + h.textContent.trim().slice(0, 60)] = false; store.set('steer-ui-folds', folds); } changed = true; }
    var row = el && el.closest && el.closest('tr.pg-off');
    if (row) { var tb = row.closest('table'); if (tb) { var r = Array.prototype.filter.call(tb.tBodies[0].rows, function (x) { return !isAppHidden(x); }), ix = r.indexOf(row);
      Object.keys(pgState).forEach(function () {}); tb.dataset.goto = ix; } changed = true; }
    if (changed) run();
    return sec;
  }
  var _siv = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () { try { reveal(this); } catch (e) {} return _siv.apply(this, arguments); };
  var _focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function () { try { if (this.closest && this.closest('#page')) reveal(this); } catch (e) {} return _focus.apply(this, arguments); };


  /* -------- 8. a card holding several labelled lists (e.g. Overdue / This week / Later) shows one at a time */
  var lblSel = {};
  function labelTabs(root) {
    root.querySelectorAll('.card').forEach(function (c, ci) {
      var box = c.querySelector(':scope>.cb') || c;
      var labs = Array.prototype.filter.call(box.children, function (e) {
        return e.classList.contains('label') && e.nextElementSibling && e.nextElementSibling.classList.contains('tbl-wrap');
      });
      var strip = box.querySelector(':scope>.lbtabs');
      if (labs.length < 3) { if (strip) strip.remove(); return; }
      var key = screenId() + '|' + ci, names = labs.map(function (l) { return l.textContent.trim(); });
      var base = names.map(function (n) { return n.replace(/\s*\(\d+\)\s*$/, ''); });
      var cur = base.indexOf(lblSel[key]); if (cur < 0) cur = 0;
      if (!strip) { strip = document.createElement('div'); strip.className = 'lbtabs'; }
      if (strip.nextElementSibling !== labs[0]) labs[0].before(strip);
      strip.innerHTML = '<div class="seg" role="tablist">' + names.map(function (n, i) {
        var m = n.match(/^(.*?)\s*\((\d+)\)\s*$/);
        return '<button role="tab" data-l="' + i + '" aria-pressed="' + (i === cur) + '">' + (m ? m[1] + ' <span class="n">' + m[2] + '</span>' : n) + '</button>';
      }).join('') + '</div>';
      labs.forEach(function (l, i) { l.classList.add('grp-off'); var w = l.nextElementSibling; w.classList.toggle('grp-off', i !== cur);
        var bar = w.nextElementSibling; if (bar && bar.classList.contains('pgbar')) bar.classList.toggle('grp-off', i !== cur); });
      strip.querySelectorAll('button').forEach(function (b) { b.onclick = function () { lblSel[key] = base[+b.dataset.l]; run(); }; });
    });
  }

  /* -------- 9. upload tiles: the required-columns line moves into the Template button's tooltip */
  function trimUploadTiles(root) {
    root.querySelectorAll('.card.up .note').forEach(function (n) {
      if (!/^Required:/.test(n.textContent.trim())) return;
      var tile = n.closest('.card.up'), tpl = tile && tile.querySelector('[data-tpl]');
      if (tpl) { tpl.title = 'Download the template. ' + n.textContent.trim(); n.classList.add('grp-off'); }
    });
    root.querySelectorAll('.card.up label.btn').forEach(function (l) {
      l.childNodes.forEach(function (t) { if (t.nodeType === 3 && /Upload CSV or Excel/.test(t.nodeValue)) { t.nodeValue = 'Upload'; l.title = 'Upload CSV or Excel'; } });
    });
  }

  /* ------------------------------------------------------------------ driver */
  var busy = false, timer = null;
  function run() {
    var root = document.getElementById('page'); if (!root) return;
    busy = true;
    try { pageTables(root); trimLists(root); foldCards(root); tabGroups(root); sectionTabs(root); labelTabs(root); trimUploadTiles(root); backToTop(); } catch (e) { console.error('compact', e); }
    obs.takeRecords(); busy = false;
  }
  var obs = new MutationObserver(function () { if (busy) return; clearTimeout(timer); run(); });
  function start() {
    var root = document.getElementById('page'); if (!root) return;
    obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] });
    run();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.STEER_COMPACT = { run: run };
})();

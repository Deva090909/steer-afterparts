/* STEER workspace — access and roles.
   One definition of who may do what (PERMS), used both to enforce the rules and to
   draw the "Who can do what" matrix, so the two never disagree.
   Policy (segregation of duties):
     - IT / ERP grants, edits and removes access for every team; it is the data steward,
       so it sees data screens, not commercial ones.
     - Each department head adds or removes members of their own team and sets their
       team's territories and primary owner.
     - The CFO office manages leadership accounts (CFO office, IT / ERP, management viewers)
       and can see every screen; it does not run team access day to day.
     - Nobody changes their own access. Head positions are handed over (new name / email),
       never removed, so no team is ever left without an accountable head.
     - Every grant, edit, removal and restore is logged with who, when and why.
   Loaded after the main app script and before the app starts routing. */

/* ---------- positions and permissions ---------- */
const POSITIONS = [
  ['cfo', 'CFO office'], ['it', 'IT / ERP'], ['lead-view', 'Management viewer'],
  ['sales-head', 'Sales head'], ['sales-member', 'Sales account manager'],
  ['quality-head', 'Quality head'], ['quality-member', 'Quality complaints owner'], ['quality-spec', 'Quality specialist (queue)'],
  ['service-head', 'Service head'], ['service-member', 'Service field lead']
];
const posOf = p => !p ? '' : p.id === 'cfo' ? 'cfo' : p.id === 'it' ? 'it' : p.role === 'lead' ? 'lead-view' : p.head ? p.role + '-head' : p.queues ? p.role + '-spec' : p.role + '-member';
const HEADS = ['sales-head', 'quality-head', 'service-head'];
const MEMBERS = ['sales-member', 'quality-member', 'quality-spec', 'service-member'];
/* k: key · l: what it allows · who: positions · own: heads limited to their own team · note: how it is scoped */
const PERMS = [
  { g: 'Access', k: 'access.all', l: 'Grant, edit and remove access in any team', who: ['it'] },
  { g: 'Access', k: 'access.team', l: 'Add or remove members of their own team', who: HEADS, own: true },
  { g: 'Access', k: 'access.lead', l: 'Manage leadership accounts (CFO office, IT / ERP, viewers)', who: ['cfo'] },
  { g: 'Access', k: 'access.view', l: 'See the access register and its log', who: ['cfo', 'it'].concat(HEADS), note: 'Heads see their own team' },
  { g: 'Team', k: 'team.coverage', l: 'Set territories and the primary owner for a team', who: ['cfo'].concat(HEADS), own: true, note: 'Heads: own team only' },
  { g: 'Customers', k: 'customer.territory', l: 'Reassign customer territories, import the owner list', who: ['cfo', 'it', 'sales-head'], note: 'Owners of the customer master' },
  { g: 'Customers', k: 'customer.identity', l: 'Merge or split duplicate customer records', who: ['cfo', 'it'], note: 'Data stewardship' },
  { g: 'Customers', k: 'contacts.view', l: 'See customer contact names', who: ['cfo', 'it'].concat(HEADS, ['quality-member', 'quality-spec']), note: 'Privacy: kept to Quality and heads' },
  { g: 'Data', k: 'data.upload', l: 'Upload data files (owners apply, others go for approval)', who: ['cfo', 'it'].concat(HEADS), note: 'Owner per file on Data uploads' },
  { g: 'Data', k: 'data.settings', l: 'Change the data date, retention and response targets', who: ['cfo'] },
  { g: 'Data', k: 'data.sample', l: 'Load or remove the sample data', who: ['cfo'] },
  { g: 'Work', k: 'work.quotes', l: 'Log and update quotes', who: ['cfo', 'sales-head', 'sales-member'] },
  { g: 'Work', k: 'work.complaints', l: 'Update complaints', who: ['quality-head', 'quality-member', 'quality-spec'], note: 'Members: their territory or queue' },
  { g: 'Work', k: 'work.visits', l: 'Log visits and visit reports', who: ['sales-head', 'sales-member', 'quality-head', 'quality-member', 'quality-spec', 'service-head', 'service-member'] },
  { g: 'Screens', k: 'screens.all', l: 'Open every team screen (read)', who: ['cfo', 'lead-view'] },
  { g: 'Screens', k: 'screens.data', l: 'Data screens only: uploads, customer master, installed base, agent status', who: ['it'] }
];
const PERM = {}; PERMS.forEach(d => PERM[d.k] = d);
function can(k, arg, p) {
  p = p || ME; const d = PERM[k]; if (!d || !p) return false;
  const pos = posOf(p); if (!d.who.includes(pos)) return false;
  if (d.own && arg && HEADS.includes(pos) && arg !== p.role) return false;
  return true;
}
/* may `who` change `target`'s access? */
function canManagePerson(target, who) {
  who = who || ME; if (!target || !who || target.id === who.id) return false;
  const pos = posOf(who);
  if (target.role === 'lead') return pos === 'cfo';
  if (pos === 'it') return true;
  if (HEADS.includes(pos)) return target.role === who.role && !target.head;
  return false;
}
function canAddTo(rid, who) {
  who = who || ME; const pos = posOf(who);
  if (rid === 'lead') return pos === 'cfo';
  if (pos === 'it') return ['sales', 'quality', 'service'].includes(rid);
  return HEADS.includes(pos) && who.role === rid;
}
const canRemove = (t, who) => canManagePerson(t, who) && !t.head && t.id !== 'cfo' && t.id !== 'it';

/* ---------- IT / ERP: a data steward's navigation, not the CFO's ---------- */
(function () {
  const it = personById('it');
  if (it) {
    it.nav = [{ sec: 'My work' }, { id: 'mywk' }, { id: 'uploads' }, { sec: 'Data stewardship' }, { id: 'team' }, { id: 'ib' }, { id: 'agents' }, { sec: 'Access' }, { id: 'access' }];
    it.home = 'mywk';
  }
  const lead = roleById('lead'); const i = lead.nav.findIndex(n => n.id === 'team');
  lead.nav.splice(i + 1, 0, { id: 'access' });
  ['sales', 'quality', 'service'].forEach(r => { const R = roleById(r); const j = R.nav.findIndex(n => n.id === 'team'); R.nav.splice(j + 1, 0, { id: 'access', head: true }); });
})();

/* ---------- access log ---------- */
let ACCLOG = store.get('steer-acclog', []);
function logAccess(action, p, detail, why) {
  const e = { id: 'A' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), by: ME.id, byName: ME.name, byPos: posOf(ME), action, pid: p.id, name: p.name, team: p.role, detail: detail || '', why: why || '' };
  ACCLOG = [e].concat(ACCLOG).slice(0, 500); store.set('steer-acclog', ACCLOG); SYNC.w('access/' + e.id, e);
}
const QUEUES = ['Supply chain — picking & despatch', 'Quality — RCA queue', 'Technical services — field'];
const TEAMS = [['sales', 'Sales'], ['quality', 'Quality'], ['service', 'Service'], ['lead', 'Leadership']];
const teamName = r => (TEAMS.find(t => t[0] === r) || [r, r])[1];
const DEFAULT_TITLE = { sales: 'Account manager', quality: 'Complaints owner', service: 'Field service lead', lead: 'Management viewer' };

/* people a viewer may see on the access screen */
function accessScope(p) { const pos = posOf(p || ME); if (pos === 'cfo' || pos === 'it') return null; if (HEADS.includes(pos)) return [ME.role]; return []; }
function coverageGapsWithout(t) {
  if (t.zones === 'all' || t.queues) return [];
  return t.zones.filter(z => coverers(t.role, z).filter(x => x !== t).length === 0);
}

const AC = { f: 'active', team: 'all' };
PAGES.access = {
  title: 'Access & roles', icon: 'users', render(el) {
    if (AC.who !== ME.id) { AC.f = 'active'; AC.team = 'all'; AC.who = ME.id; }
    const scope = accessScope(), mineOnly = scope && scope.length === 1;
    const ppl = PEOPLE_ALL.filter(p => !scope || scope.includes(p.role)).filter(p => AC.team === 'all' || p.role === AC.team);
    const act = ppl.filter(p => p.active !== false), rem = ppl.filter(p => p.active === false);
    const list = AC.f === 'removed' ? rem : AC.f === 'all' ? ppl : act;
    const log = ACCLOG.filter(e => !scope || scope.includes(e.team));
    const d30 = log.filter(e => e.at > Date.now() - 30 * 864e5).length;
    const addable = TEAMS.filter(t => canAddTo(t[0]));
    const order = { lead: 0, sales: 1, quality: 2, service: 3 };
    list.sort((a, b) => order[a.role] - order[b.role] || (b.head ? 1 : 0) - (a.head ? 1 : 0) || a.name.localeCompare(b.name));
    const pos = posOf(ME);
    const policy = pos === 'it' ? 'You grant, edit and remove access for every team. Leadership accounts are managed by the CFO office, and nobody can change their own access.'
      : pos === 'cfo' ? 'You manage leadership accounts and can see everyone. Team access is run by IT / ERP, with each head managing their own team.'
        : HEADS.includes(pos) ? 'You add or remove members of the ' + teamName(ME.role) + ' team and set their territories. Other teams, leadership and head positions are handled by IT / ERP.'
          : '';
    el.innerHTML = header('Access & roles', 'Who can open the workspace, in which team and territory, and what each position may do. Every change is logged.',
      addable.length ? '<button class="btn pri" id="acAdd">' + ic('users', 'sm') + 'Add a person</button>' : '') +
      '<div class="kpis">' + stat('People with access', act.length, mineOnly ? teamName(ME.role) + ' team' : 'across ' + new Set(act.map(p => p.role)).size + ' teams') +
      stat('Access removed', rem.length, 'kept for the record') +
      stat('Team heads', act.filter(p => p.head && p.role !== 'lead').length, 'one accountable head per team') +
      stat('Changes, 30 days', d30, 'in the access log') + '</div>' +
      (policy ? '<div class="banner info" style="margin-bottom:12px">' + ic('users') + '<div><b>Your part.</b> ' + policy + '</div></div>' : '') +
      card('People', (mineOnly ? teamName(ME.role) + ' team' : 'Everyone') + ' · select a name to edit',
        '<div class="cb" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line2)"><div class="seg" role="group" aria-label="Status">' +
        [['active', 'Active', act.length], ['removed', 'Removed', rem.length], ['all', 'All', ppl.length]].map(x => '<button data-acf="' + x[0] + '" aria-pressed="' + (AC.f === x[0]) + '">' + x[1] + ' <span class="n">' + x[2] + '</span></button>').join('') + '</div>' +
        (scope ? '' : '<label class="note" style="display:flex;gap:6px;align-items:center">Team <select class="field" id="acTeam"><option value="all">All teams</option>' + TEAMS.map(t => '<option value="' + t[0] + '"' + (AC.team === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('') + '</select></label>') + '</div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Team</th><th>Position</th><th>Covers</th><th>Screens</th><th>Status</th><th></th></tr></thead><tbody>' +
        (list.length ? list.map(p => {
          const n = (() => { try { return navItems(roleById(p.role), p).filter(x => !x.sec).length } catch (e) { return '' } })();
          const m = canManagePerson(p), rm = canRemove(p);
          return '<tr><td class="nm">' + esc(p.name) + (p === ME ? ' <span class="pill p-mute">you</span>' : '') + '<br><span class="sm">' + (p.email ? esc(p.email) : 'no sign-in email yet') + '</span></td>' +
            '<td>' + teamName(p.role) + '</td><td>' + esc(p.title) + (p.head ? ' <span class="pill p-due">head</span>' : '') + '</td><td class="sm">' + esc(coverage(p)) + '</td><td class="num">' + n + '</td>' +
            '<td>' + (p.active === false ? '<span class="pill p-bad">Removed</span><br><span class="sm">' + (p.removedAt ? dmy(new Date(p.removedAt).toISOString().slice(0, 10)) : '') + '</span>' : '<span class="pill p-ok">Active</span>') + '</td>' +
            '<td style="white-space:nowrap;text-align:right">' + (m ? '<button class="btn sm" data-ace="' + p.id + '">Edit</button> ' : '') +
            (p.active === false ? (m ? '<button class="btn sm" data-acr="' + p.id + '">Restore</button>' : '') : rm ? '<button class="btn sm" data-acx="' + p.id + '">Remove access</button>' : (m ? '' : '<span class="note">' + (p === ME ? 'Your own access' : p.head || p.id === 'it' || p.id === 'cfo' ? (p.role === 'lead' ? 'CFO office manages' : 'IT / ERP manages') : '') + '</span>')) + '</td></tr>';
        }).join('') : '<tr><td colspan="7"><div class="empty">Nobody here.</div></td></tr>') + '</tbody></table></div>') +
      card('Who can do what', 'The same rules the workspace enforces. ✓ allowed · Own: their own team or scope only',
        '<div class="tbl-wrap"><table class="tbl coh nopage"><thead><tr><th>Permission</th>' + POSITIONS.map(x => '<th style="text-align:center;white-space:normal;min-width:74px">' + x[1] + '</th>').join('') + '</tr></thead><tbody>' +
        PERMS.map(d => '<tr><td><b style="color:var(--ink);font-weight:600">' + d.l + '</b>' + (d.note ? '<br><span class="sm">' + d.note + '</span>' : '') + '</td>' +
          POSITIONS.map(x => { const on = d.who.includes(x[0]); const own = on && (d.own && HEADS.includes(x[0]) || (d.k === 'work.complaints' && x[0] !== 'quality-head') || (d.k === 'access.view' && HEADS.includes(x[0])));
            return '<td style="text-align:center;font-size:15px;color:' + (on ? 'var(--ok)' : 'var(--faint)') + '" title="' + (on ? (own ? 'Own team / scope only' : 'Allowed') : 'Not allowed') + '">' + (on ? (own ? '<span class="pill p-mute" style="font-size:11px">Own</span>' : '✓') : '·') + '</td>' }).join('') + '</tr>').join('') +
        '</tbody></table></div>') +
      card('Access log', 'Every grant, edit, removal and restore, newest first',
        log.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Who changed it</th><th>Change</th><th>Person</th><th>Detail</th></tr></thead><tbody>' +
          log.map(e => '<tr><td class="sm">' + new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</td><td>' + esc(e.byName) + '</td><td><span class="pill ' + ({ added: 'p-ok', removed: 'p-bad', restored: 'p-ok', edited: 'p-mute' }[e.action] || 'p-mute') + '">' + esc(e.action) + '</span></td><td class="nm">' + esc(e.name) + '<br><span class="sm">' + teamName(e.team) + '</span></td><td class="sm">' + esc(e.detail) + (e.why ? '<br>Reason: ' + esc(e.why) : '') + '</td></tr>').join('') + '</tbody></table></div>'
          : '<div class="empty">No access changes yet.</div>');
    el.querySelectorAll('[data-acf]').forEach(b => b.onclick = () => { AC.f = b.dataset.acf; renderPage(); });
    const tsel = el.querySelector('#acTeam'); if (tsel) tsel.onchange = () => { AC.team = tsel.value; renderPage(); };
    const add = el.querySelector('#acAdd'); if (add) add.onclick = () => personForm(null);
    el.querySelectorAll('[data-ace]').forEach(b => b.onclick = () => personForm(personById(b.dataset.ace)));
    el.querySelectorAll('[data-acx]').forEach(b => b.onclick = () => removeForm(personById(b.dataset.acx)));
    el.querySelectorAll('[data-acr]').forEach(b => b.onclick = () => restorePerson(personById(b.dataset.acr)));
  }
};

function zonePicker(cur) {
  return '<div class="zpick" style="display:flex;gap:6px;flex-wrap:wrap">' + ZONES.map(z => '<label class="filterchip" style="cursor:pointer"><input type="checkbox" value="' + esc(z) + '"' + (cur !== 'all' && cur && cur.includes(z) ? ' checked' : '') + '> ' + esc(z) + '</label>').join('') + '</div>';
}
function personForm(p) {
  const isNew = !p, teams = TEAMS.filter(t => isNew ? canAddTo(t[0]) : t[0] === p.role);
  const rid0 = isNew ? teams[0][0] : p.role;
  const kind0 = p && p.queues ? 'queue' : 'zones';
  const body = '<div class="frow">' + fld('acName', 'Name', inp('acName', 'text', p ? p.name : '', 'autocomplete="off"'), '', 1) + fld('acMail', 'Sign-in email', inp('acMail', 'email', p ? p.email || '' : '', 'autocomplete="off"'), 'Used when sign-in is switched on') + '</div>' +
    '<div class="frow">' + fld('acTeamF', 'Team', '<select class="field" id="acTeamF"' + (isNew ? '' : ' disabled') + '>' + teams.map(t => '<option value="' + t[0] + '"' + (t[0] === rid0 ? ' selected' : '') + '>' + t[1] + '</option>').join('') + '</select>', isNew ? '' : 'To move someone to another team, remove their access here and add them there', 1) +
    fld('acTitle', 'Position', inp('acTitle', 'text', p ? p.title : DEFAULT_TITLE[rid0]), '', 1) + '</div>' +
    (p && p.head ? '<p class="note">Head position: covers every territory. Hand it over by changing the name and email; it cannot be removed.</p>' :
      '<div id="acCovWrap">' + fld('acKind', 'Works on', '<select class="field" id="acKind"><option value="zones"' + (kind0 === 'zones' ? ' selected' : '') + '>Territories</option><option value="queue"' + (kind0 === 'queue' ? ' selected' : '') + '>A specialist queue, every territory</option></select>', '') +
      '<div id="acZones"' + (kind0 === 'queue' ? ' hidden' : '') + '>' + fld('acZ', 'Territories', zonePicker(p ? p.zones : []), 'Customers in these territories show up in their worklists', 1) + '</div>' +
      '<div id="acQ"' + (kind0 === 'queue' ? '' : ' hidden') + '>' + fld('acQueue', 'Queue', sel('acQueue', QUEUES, p && p.queues ? p.queues[0] : QUEUES[0]), '') + '</div></div>') +
    fld('acWhy', 'Reason for the change', inp('acWhy', 'text', '', 'placeholder="e.g. joined West sales, replaces A. Kumar"'), 'Kept in the access log', 1);
  openPanel(isNew ? 'Add a person' : 'Edit ' + esc(p.name), isNew ? 'Give someone access to the workspace' : teamName(p.role) + ' · ' + esc(p.title), body,
    '<button class="btn" id="acX">Cancel</button><button class="btn pri" id="acOk">' + ic('check', 'sm') + (isNew ? 'Give access' : 'Save') + '</button>', () => {
      $('#acX').onclick = closeDrawer;
      const tf = $('#acTeamF'), kind = $('#acKind');
      const sync = () => { const r = tf.value; if (isNew) $('#acTitle').value = DEFAULT_TITLE[r]; const w = $('#acCovWrap'); if (!w) return;
        w.style.display = r === 'lead' ? 'none' : ''; if ($('#acKind')) $('#acKind').closest('.fld').style.display = r === 'quality' ? '' : 'none'; };
      const kindSync = () => { const q = kind && kind.value === 'queue' && tf.value === 'quality'; if ($('#acZones')) { $('#acZones').hidden = q; $('#acQ').hidden = !q; } };
      if (tf) tf.onchange = () => { sync(); kindSync(); };
      if (kind) kind.onchange = kindSync;
      sync();
      $('#acOk').onclick = () => {
        const v = id => ($('#' + id) ? $('#' + id).value.trim() : ''), e = {}, r = isNew ? tf.value : p.role;
        const zones = Array.from(document.querySelectorAll('#acZones input:checked')).map(x => x.value);
        const queue = kind && kind.value === 'queue' && r === 'quality' ? v('acQueue') : null;
        if (!v('acName')) e.acName = 'Required';
        else if (PEOPLE_ALL.some(x => x !== p && x.active !== false && x.name.toLowerCase() === v('acName').toLowerCase())) e.acName = 'Someone with access already has this name';
        if (v('acMail') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('acMail'))) e.acMail = 'Enter a valid email';
        else if (v('acMail') && PEOPLE_ALL.some(x => x !== p && x.active !== false && (x.email || '').toLowerCase() === v('acMail').toLowerCase())) e.acMail = 'Already used by someone else';
        if (!v('acTitle')) e.acTitle = 'Required';
        if (r !== 'lead' && !(p && p.head) && !queue && !zones.length) e.acZ = 'Pick at least one territory';
        if (!v('acWhy')) e.acWhy = 'Say why, for the log';
        if (!(isNew ? canAddTo(r) : canManagePerson(p))) e.acName = 'You cannot change access for this team';
        if (!fieldErr(e)) return;
        if (isNew) {
          const np = { id: r.slice(0, 1) + '-' + Date.now().toString(36), role: r, name: v('acName'), title: v('acTitle'), email: v('acMail'), active: true, added: Date.now(), addedBy: ME.id,
            zones: r === 'lead' || queue ? 'all' : zones };
          if (queue) np.queues = [queue];
          PEOPLE_ALL.push(np); rebuildPeople(); savePeople(np);
          logAccess('added', np, teamName(r) + ' · ' + np.title + ' · ' + coverage(np), v('acWhy'));
          toast(np.name + ' now has access');
        } else {
          const ch = [];
          if (p.name !== v('acName')) ch.push('name ' + p.name + ' → ' + v('acName'));
          if ((p.email || '') !== v('acMail')) ch.push('email ' + (p.email || 'none') + ' → ' + (v('acMail') || 'none'));
          if (p.title !== v('acTitle')) ch.push('position ' + p.title + ' → ' + v('acTitle'));
          const oldCov = coverage(p);
          p.name = v('acName'); p.email = v('acMail'); p.title = v('acTitle');
          if (!p.head && r !== 'lead') { if (queue) { p.queues = [queue]; p.zones = 'all'; } else { delete p.queues; p.zones = zones; } }
          if (coverage(p) !== oldCov) ch.push('covers ' + oldCov + ' → ' + coverage(p));
          if (!ch.length) { closeDrawer(); return; }
          savePeople(p); logAccess('edited', p, ch.join('; '), v('acWhy')); toast('Saved');
        }
        closeDrawer(); refreshNav(); renderPage();
      };
    });
}

function removeForm(p) {
  if (!canRemove(p)) { toast('You cannot remove this access'); return; }
  const gaps = coverageGapsWithout(p);
  openPanel('Remove access for ' + esc(p.name), teamName(p.role) + ' · ' + esc(p.title),
    '<p style="margin-bottom:10px">' + esc(p.name) + ' will no longer appear in the role switcher or in any worklist. Their past records, notes and log entries stay as they are.</p>' +
    (gaps.length ? '<div class="banner warn" style="margin-bottom:10px">' + ic('alert') + '<div><b>Coverage gap.</b> Nobody else in ' + teamName(p.role) + ' covers ' + esc(gaps.join(', ')) + '. Those customers fall to the ' + teamName(p.role) + ' head until someone is assigned.</div></div>' : '') +
    fld('acWhy2', 'Reason', inp('acWhy2', 'text', '', 'placeholder="e.g. left the company on 9 Oct"'), 'Kept in the access log', 1),
    '<button class="btn" id="acX">Cancel</button><button class="btn pri" id="acOk" style="background:var(--bad);border-color:var(--bad)">Remove access</button>', () => {
      $('#acX').onclick = closeDrawer;
      $('#acOk').onclick = () => {
        const why = $('#acWhy2').value.trim(); if (!fieldErr(why ? {} : { acWhy2: 'Say why, for the log' })) return;
        p.active = false; p.removedAt = Date.now(); p.removedBy = ME.id;
        Object.keys(PRIMARY).forEach(k => { if (PRIMARY[k] === p.id) { delete PRIMARY[k]; store.set('steer-primary', PRIMARY); SYNC.primary(k); } });
        rebuildPeople(); savePeople(p);
        logAccess('removed', p, gaps.length ? 'coverage gap: ' + gaps.join(', ') : '', why);
        closeDrawer(); refreshNav(); renderPage(); toast('Access removed for ' + p.name);
      };
    });
}
function restorePerson(p) {
  if (!canManagePerson(p)) return;
  if (PEOPLE.some(x => x.name.toLowerCase() === p.name.toLowerCase())) { toast('Someone active already has this name'); return; }
  p.active = true; delete p.removedAt; delete p.removedBy; rebuildPeople(); savePeople(p);
  logAccess('restored', p, coverage(p), ''); AC.f = 'active'; refreshNav(); renderPage(); toast(p.name + ' has access again');
}

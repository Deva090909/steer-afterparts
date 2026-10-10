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
          PEOPLE_ALL.push(np); rebuildPeople(); savePeople(np); grantSignIn(np);
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
          p.correctedAt = Date.now(); savePeople(p); if (ch.some(x => /^email/.test(x))) grantSignIn(p); logAccess('edited', p, ch.join('; '), v('acWhy')); toast('Saved');
        }
        closeDrawer(); refreshNav(); renderPage();
      };
    });
}

/* ---------- handover: everything open against a person moves to a named successor ---------- */
function openItemsOf(p) {
  const out = { complaints: [], quotes: [], leads: [], plans: [], primaries: [] };
  try { BOARD.open.forEach(i => { if (baseAccountable(i) === p) out.complaints.push(i); }); } catch (e) {}
  try { Object.entries(RS.quotes || {}).forEach(([id, q]) => { if ((q.status || 'Open') === 'Open' && q.sales_rep === p.name) out.quotes.push(id); }); } catch (e) {}
  const zs = p.zones === 'all' ? null : p.zones;
  if (p.role === 'sales') try { Object.values(VIS).forEach(v => { if (!(v.parts && v.parts.length)) return; const L = leadOf(v); if (/^(Won|Lost)$/.test(L.status)) return;
    if (L.ownerId === p.id || (!L.ownerId && zs && zs.includes(zoneOf(cust(v.customer).key)) && primaryOf('sales', zoneOf(cust(v.customer).key)) === p)) out.leads.push(v.id); }); } catch (e) {}
  if (p.role === 'service') try { allPlans().forEach(pl => { if (pl.done || pl.cancelled) return; if (pl.ownerId === p.id || (!pl.ownerId && zs && zs.includes(zoneOf(pl.ck)) && primaryOf('service', zoneOf(pl.ck)) === p)) out.plans.push(pl.id); }); } catch (e) {}
  Object.keys(PRIMARY).forEach(k => { if (PRIMARY[k] === p.id) out.primaries.push(k); });
  return out;
}
const itemsLine = o => [[o.complaints.length, 'open complaint'], [o.quotes.length, 'open quote'], [o.leads.length, 'open lead'], [o.plans.length, 'planned visit'], [o.primaries.length, 'primary-owner duty', 'primary-owner duties']]
  .filter(x => x[0]).map(x => x[0] + ' ' + (x[0] === 1 ? x[1] : (x[2] || x[1] + 's'))).join(', ');
function successorsFor(p) { return PEOPLE.filter(x => x !== p && x.role === p.role && x.active !== false); }
function defaultSuccessor(p) {
  const c = successorsFor(p); if (!c.length) return null;
  const z = p.zones !== 'all' && p.zones[0];
  return (z && c.find(x => !x.head && !x.queues && (x.zones === 'all' || x.zones.includes(z)))) || c.find(x => x.head) || c[0];
}
function handOver(p, to, takeZones, note) {
  const o = openItemsOf(p), n = { complaints: 0, quotes: 0, leads: 0, plans: 0 };
  if (takeZones && p.zones !== 'all' && !to.head && to.zones !== 'all') { to.zones = Array.from(new Set(to.zones.concat(p.zones))); savePeople(to); }
  o.complaints.forEach(i => { const rec = COMPL[i.no] || { no: i.no, isNew: false, status: i.status, updates: [] };
    rec.assignee = to.id; rec.updates = (rec.updates || []).concat([{ at: Date.now(), by: ME.name, status: null, note: 'Handed over from ' + p.name + ' to ' + to.name + (note ? ' (' + note + ')' : '') }]).slice(-100);
    COMPL[i.no] = rec; store.set('steer-compl', COMPL); SYNC.w('complaints/' + sid(i.no), rec); n.complaints++; });
  if (n.complaints) { BOARD = buildBoard(); try { recountCases(); } catch (e) {} }
  o.quotes.forEach(id => { const q = RS.quotes[id]; rsPut('quotes', id, Object.assign({}, q, { sales_rep: to.name, handedFrom: p.name, at: Date.now() })); n.quotes++; });
  o.leads.forEach(id => { const L = Object.assign({ status: 'New' }, LEADS[id] || {}); L.ownerId = to.id; L.history = (L.history || []).concat([{ at: Date.now(), by: ME.name, status: L.status, note: 'Handed over from ' + p.name + ' to ' + to.name }]);
    LEADS[id] = L; store.set('steer-leads', LEADS); SYNC.w('leads/' + sid(id), Object.assign({ vid: id }, L)); n.leads++; });
  o.plans.forEach(id => { const pl = allPlans().find(x => x.id === id); if (!pl) return; const base = Object.assign({}, PLANS[id] || {}, { id, customer: pl.customer, date: pl.date, engineer: pl.engineer, reason: pl.reason, src: pl.src });
    base.ownerId = to.id; base.by = ME.name; savePlan(base); n.plans++; });
  o.primaries.forEach(k => { const [rid, z] = k.split('|'); if (to.role === rid && !to.head && to.zones !== 'all' && to.zones.includes(z)) { PRIMARY[k] = to.id; } else delete PRIMARY[k];
    store.set('steer-primary', PRIMARY); SYNC.primary(k); });
  return n;
}
function removeForm(p) {
  if (!canRemove(p)) { toast('You cannot remove this access'); return; }
  const o = openItemsOf(p), succ = successorsFor(p), def = defaultSuccessor(p);
  const moveTeams = TEAMS.filter(t => t[0] !== p.role && t[0] !== 'lead' && canAddTo(t[0]));
  const body = '<p style="margin-bottom:10px">' + esc(p.name) + ' will no longer appear in the role switcher or any worklist, and is signed out straight away. Past records and log entries stay.</p>' +
    fld('rmKind', 'What is happening', '<select class="field" id="rmKind"><option value="leave">Leaving the company</option>' + (moveTeams.length ? '<option value="move">Moving to another team</option>' : '') + '<option value="other">Other</option></select>', '', 1) +
    '<div id="rmMove" hidden><div class="frow">' + fld('rmTeam', 'New team', '<select class="field" id="rmTeam">' + moveTeams.map(t => '<option value="' + t[0] + '">' + t[1] + '</option>').join('') + '</select>', '', 1) +
    fld('rmTitle', 'New position', inp('rmTitle', 'text', moveTeams[0] ? DEFAULT_TITLE[moveTeams[0][0]] : ''), '', 1) + '</div>' + fld('rmZ', 'Territories in the new team', zonePicker([]), '', 1) + '</div>' +
    '<div class="card" style="box-shadow:none;border:1px solid var(--line2);margin:6px 0 12px"><div class="cb"><b>Handover</b><p class="note" style="margin:4px 0 8px">' +
    (itemsLine(o) ? 'Open now against ' + esc(p.name) + ': <b>' + itemsLine(o) + '</b>. All of it moves to the person below in one step, with a note on each record.' : 'Nothing open against ' + esc(p.name) + '. Choose who takes over their customers from now on.') + '</p>' +
    fld('rmTo', 'Hand over to', '<select class="field" id="rmTo">' + succ.map(x => '<option value="' + x.id + '"' + (x === def ? ' selected' : '') + '>' + esc(x.name) + ' · ' + esc(x.title) + ' · ' + esc(coverage(x)) + '</option>').join('') + '</select>', '', 1) +
    (p.zones !== 'all' ? '<label class="note" style="display:flex;gap:6px;align-items:center;margin-top:4px"><input type="checkbox" id="rmTake" checked> Also give them ' + esc(p.name) + '’s territories (' + esc(p.zones.join(', ')) + ')</label>' : '') +
    '<div id="rmGap"></div></div></div>' +
    fld('acWhy2', 'Reason', inp('acWhy2', 'text', '', 'placeholder="e.g. left the company on 9 Oct"'), 'Kept in the access log', 1);
  openPanel('Remove access for ' + esc(p.name), teamName(p.role) + ' · ' + esc(p.title), body,
    '<button class="btn" id="acX">Cancel</button><button class="btn pri" id="acOk" style="background:var(--bad);border-color:var(--bad)">Hand over and remove</button>', () => {
      $('#acX').onclick = closeDrawer;
      const kind = $('#rmKind'), to = $('#rmTo'), take = $('#rmTake'), gapBox = $('#rmGap');
      const gap = () => { const t = personById(to.value), keep = take && take.checked && t && !t.head && t.zones !== 'all';
        const g = keep ? [] : coverageGapsWithout(p);
        gapBox.innerHTML = !g.length ? '' : t && t.head ? '<div class="banner info" style="margin-top:8px">' + ic('info') + '<div>Nobody else in ' + teamName(p.role) + ' covers ' + esc(g.join(', ')) + ', so ' + esc(t.name) + ' looks after those customers until someone is assigned.</div></div>'
          : '<div class="banner warn" style="margin-top:8px">' + ic('alert') + '<div><b>Coverage gap.</b> Nobody else in ' + teamName(p.role) + ' covers ' + esc(g.join(', ')) + '. Tick the box above, or those customers fall to the ' + teamName(p.role) + ' head.</div></div>'; };
      to.onchange = gap; if (take) take.onchange = gap; gap();
      kind.onchange = () => { $('#rmMove').hidden = kind.value !== 'move'; };
      const tm = $('#rmTeam'); if (tm) tm.onchange = () => { $('#rmTitle').value = DEFAULT_TITLE[tm.value]; };
      $('#acOk').onclick = () => {
        const why = $('#acWhy2').value.trim(), e = {}, move = kind.value === 'move';
        const zones = Array.from(document.querySelectorAll('#rmMove input:checked')).map(x => x.value);
        if (!why) e.acWhy2 = 'Say why, for the log';
        if (!to.value) e.rmTo = 'Choose who takes over';
        if (move && !zones.length) e.rmZ = 'Pick at least one territory';
        if (move && !$('#rmTitle').value.trim()) e.rmTitle = 'Required';
        if (move && PEOPLE.some(x => x !== p && x.name.toLowerCase() === p.name.toLowerCase() && x.role === $('#rmTeam').value)) e.rmTeam = 'Already in that team';
        if (!fieldErr(e)) return;
        const succP = personById(to.value), n = handOver(p, succP, take && take.checked, why);
        p.active = false; p.removedAt = Date.now(); p.removedBy = ME.id;
        Object.values(COVERS).forEach(c => { if ((c.pid === p.id || c.standIn === p.id) && coverState(c) !== 'ended') { c.endedAt = Date.now(); c.endedBy = ME.id; saveCover(c); } });
        let moved = null;
        if (move) { const r = $('#rmTeam').value; moved = { id: r.slice(0, 1) + '-' + Date.now().toString(36), role: r, name: p.name, title: $('#rmTitle').value.trim(), email: p.email || '', active: true, added: Date.now(), addedBy: ME.id, zones: zones, movedFrom: p.id };
          p.movedTo = moved.id; PEOPLE_ALL.push(moved); }
        rebuildPeople(); savePeople(p); if (moved) savePeople(moved); if (!move) revokeSignIn(p);
        const summary = 'handed over to ' + succP.name + (n.complaints + n.quotes + n.leads + n.plans ? ': ' + [[n.complaints, 'complaints'], [n.quotes, 'quotes'], [n.leads, 'leads'], [n.plans, 'planned visits']].filter(x => x[0]).map(x => x[0] + ' ' + x[1]).join(', ') : '') + (take && take.checked && p.zones !== 'all' ? '; territories ' + p.zones.join(', ') : '');
        logAccess(move ? 'moved' : 'removed', p, summary + (move ? '; now ' + teamName(moved.role) + ' · ' + moved.title + ' · ' + moved.zones.join(', ') : ''), why);
        if (moved) logAccess('added', moved, 'moved from ' + teamName(p.role), why);
        closeDrawer(); refreshNav(); renderPage(); toast(move ? p.name + ' moved to ' + teamName(moved.role) : 'Access removed for ' + p.name + ', handed over to ' + succP.name);
      };
    });
}
function restorePerson(p) {
  if (!canManagePerson(p)) return;
  if (PEOPLE.some(x => x.name.toLowerCase() === p.name.toLowerCase())) { toast('Someone active already has this name'); return; }
  p.active = true; delete p.removedAt; delete p.removedBy; rebuildPeople(); savePeople(p);
  logAccess('restored', p, coverage(p), ''); AC.f = 'active'; refreshNav(); renderPage(); toast(p.name + ' has access again');
}

/* =====================================================================
   Leave cover: a stand-in for a set period. Worklists, scope and new
   complaints go to the stand-in; it ends on its own on the last day.
   ===================================================================== */
let COVERS = store.get('steer-covers', {});
const saveCover = c => { COVERS[c.id] = c; store.set('steer-covers', COVERS); SYNC.w('covers/' + c.id, c); };
function coverState(c, day) { day = day || TODAY_ISO; if (c.endedAt) return 'ended'; if (day < c.from) return 'upcoming'; if (day > c.to) return 'ended'; return 'active'; }
const activeCoverOf = p => p && Object.values(COVERS).find(c => c.pid === p.id && coverState(c) === 'active');
function actingFor(p) { const c = activeCoverOf(p); if (!c) return p; const s = personById(c.standIn); return s && s.active !== false ? s : p; }
const coveringFor = p => Object.values(COVERS).filter(c => c.standIn === (p && p.id) && coverState(c) === 'active').map(c => personById(c.pid)).filter(x => x && x.active !== false);
function coverZones(p) {
  if (!p || p.zones === 'all') return 'all';
  const z = new Set(p.zones); coveringFor(p).forEach(x => { if (x.zones === 'all') return; x.zones.forEach(y => z.add(y)); });
  return Array.from(z);
}
const canSetCover = p => p && p.active !== false && p.role !== 'lead' && (p === ME || canManagePerson(p));
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
function coverForm(p) {
  const people = p ? [p] : PEOPLE.filter(canSetCover);
  if (!people.length) { toast('You cannot set leave cover'); return; }
  const p0 = people[0];
  const opts = x => PEOPLE.filter(y => y !== x && y.role === x.role);
  const body = fld('cvP', 'Who is away', '<select class="field" id="cvP">' + people.map(x => '<option value="' + x.id + '">' + esc(x.name) + ' · ' + esc(x.title) + '</option>').join('') + '</select>', '', 1) +
    fld('cvS', 'Stand-in', '<select class="field" id="cvS">' + opts(p0).map(y => '<option value="' + y.id + '">' + esc(y.name) + ' · ' + esc(coverage(y)) + '</option>').join('') + '</select>', 'Gets their worklist, their customers and their new complaints for these dates', 1) +
    '<div class="frow">' + fld('cvF', 'From', inp('cvF', 'date', TODAY_ISO), '', 1) + fld('cvT', 'To (last day away)', inp('cvT', 'date', addDays(TODAY_ISO, 6)), 'Cover ends on its own after this day', 1) + '</div>' +
    fld('cvWhy', 'Reason', inp('cvWhy', 'text', '', 'placeholder="e.g. annual leave"'), '', 1);
  openPanel('Set leave cover', 'A stand-in for a set period', body, '<button class="btn" id="cvX">Cancel</button><button class="btn pri" id="cvOk">' + ic('check', 'sm') + 'Set cover</button>', () => {
    $('#cvX').onclick = closeDrawer;
    $('#cvP').onchange = () => { const x = personById($('#cvP').value); $('#cvS').innerHTML = opts(x).map(y => '<option value="' + y.id + '">' + esc(y.name) + ' · ' + esc(coverage(y)) + '</option>').join(''); };
    $('#cvOk').onclick = () => {
      const v = id => $('#' + id).value.trim(), e = {}, who = personById(v('cvP')), st = personById(v('cvS'));
      if (!st) e.cvS = 'Choose a stand-in';
      if (!v('cvF')) e.cvF = 'Required'; else if (v('cvF') < TODAY_ISO) e.cvF = 'Cannot start in the past';
      if (!v('cvT')) e.cvT = 'Required'; else if (v('cvT') < v('cvF')) e.cvT = 'Must be on or after the start'; else if (daysBetween(v('cvF'), v('cvT')) > 90) e.cvT = 'At most 90 days; longer absences are a handover';
      if (!v('cvWhy')) e.cvWhy = 'Required';
      const overlap = (c, a, b) => coverState(c) !== 'ended' && !(b < c.from || a > c.to);
      if (!e.cvT && Object.values(COVERS).some(c => c.pid === who.id && overlap(c, v('cvF'), v('cvT')))) e.cvF = who.name + ' already has cover in these dates';
      if (st && Object.values(COVERS).some(c => c.pid === st.id && overlap(c, v('cvF'), v('cvT')))) e.cvS = st.name + ' is away in these dates too';
      if (st && Object.values(COVERS).some(c => c.standIn === who.id && overlap(c, v('cvF'), v('cvT')))) e.cvP = who.name + ' is standing in for someone in these dates';
      if (!canSetCover(who)) e.cvP = 'You cannot set cover for this person';
      if (!fieldErr(e)) return;
      const c = { id: 'C' + Date.now().toString(36), pid: who.id, standIn: st.id, from: v('cvF'), to: v('cvT'), why: v('cvWhy'), by: ME.id, byName: ME.name, at: Date.now() };
      saveCover(c); logAccess('cover', who, st.name + ' stands in ' + dmy(c.from) + ' to ' + dmy(c.to), c.why);
      closeDrawer(); refreshNav(); renderPage(); toast(st.name + ' covers for ' + who.name + ' ' + dmy(c.from) + '–' + dmy(c.to));
    };
  });
}
function endCover(id) {
  const c = COVERS[id]; if (!c) return; const who = personById(c.pid);
  if (!(canSetCover(who) || c.standIn === ME.id)) return;
  c.endedAt = Date.now(); c.endedBy = ME.id; saveCover(c); logAccess('cover ended', who, 'stand-in ' + (personById(c.standIn) || {}).name + ' released early', '');
  refreshNav(); renderPage(); toast('Cover ended');
}
function coverCard(scope) {
  const rows = Object.values(COVERS).filter(c => { const p = personById(c.pid); return p && (!scope || scope.includes(p.role) || c.pid === ME.id || c.standIn === ME.id); })
    .sort((a, b) => ({ active: 0, upcoming: 1, ended: 2 }[coverState(a)] - { active: 0, upcoming: 1, ended: 2 }[coverState(b)]) || b.from.localeCompare(a.from)).slice(0, 40);
  const canAny = PEOPLE.some(canSetCover);
  return card('Leave cover', 'A stand-in gets the person’s worklist, customers and new complaints for the dates; it ends on its own',
    (rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Away</th><th>Stand-in</th><th>Dates</th><th>Status</th><th>Reason</th><th></th></tr></thead><tbody>' + rows.map(c => {
      const p = personById(c.pid), s = personById(c.standIn), st = coverState(c);
      return '<tr><td class="nm">' + esc(p.name) + '</td><td>' + esc(s ? s.name : '—') + '</td><td class="sm">' + dmy(c.from) + ' – ' + dmy(c.to) + '</td><td><span class="pill ' + { active: 'p-due', upcoming: 'p-mute', ended: 'p-mute' }[st] + '">' + { active: 'On cover now', upcoming: 'Upcoming', ended: c.endedAt ? 'Ended early' : 'Ended' }[st] + '</span></td><td class="sm">' + esc(c.why || '') + '</td>' +
        '<td style="text-align:right">' + (st !== 'ended' && (canSetCover(p) || c.standIn === ME.id) ? '<button class="btn sm" data-cvend="' + c.id + '">End now</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty">No leave cover set.</div>'),
    canAny ? '<button class="btn sm" id="cvNew">Set leave cover</button>' : '');
}

/* =====================================================================
   Quarterly access review: each head certifies their team; the CFO office
   certifies leadership. Flagged people go to IT / ERP to remove.
   ===================================================================== */
let REVIEWS = store.get('steer-reviews', {});
const saveReview = r => { REVIEWS[r.id] = r; store.set('steer-reviews', REVIEWS); SYNC.w('reviews/' + r.id, r); };
function fyQuarter(day) {
  const d = new Date(day || TODAY_ISO), m = d.getMonth(), y = d.getFullYear();
  const fy = m >= 3 ? y + 1 : y, q = Math.floor(((m + 9) % 12) / 3) + 1;
  const sm = (q - 1) * 3 + 3, sy = sm > 11 ? fy : fy - 1, start = new Date(Date.UTC(sy, sm % 12, 1)).toISOString().slice(0, 10);
  return { key: 'FY' + String(fy).slice(2) + '-Q' + q, label: 'FY' + String(fy).slice(2) + ' Q' + q, start, due: addDays(start, 30) };
}
const REVIEWERS = { sales: 's-head', quality: 'q-head', service: 'v-head', lead: 'cfo' };
const reviewerOf = rid => personById(REVIEWERS[rid]);
function reviewState(rid, day) {
  day = day || TODAY_ISO; const q = fyQuarter(day), r = REVIEWS[rid + '|' + q.key];
  if (r) return { q, r, st: 'done' };
  return { q, r: null, st: day > q.due ? 'overdue' : 'due', days: daysBetween(q.due, day) };
}
const canReview = rid => reviewerOf(rid) === ME;
function reviewForm(rid) {
  if (!canReview(rid)) return;
  const q = fyQuarter(), ppl = PEOPLE.filter(p => p.role === rid && p.id !== REVIEWERS[rid]);
  const body = '<p class="note" style="margin-bottom:10px">Confirm each person still needs access to the ' + teamName(rid) + ' team, in the territories shown. Anyone you flag goes to IT / ERP to remove, with the handover.</p>' +
    '<div class="tbl-wrap"><table class="tbl nopage"><thead><tr><th>Person</th><th>Position</th><th>Covers</th><th>Still needs access?</th></tr></thead><tbody>' +
    ppl.map(p => '<tr><td class="nm">' + esc(p.name) + '</td><td class="sm">' + esc(p.title) + '</td><td class="sm">' + esc(coverage(p)) + '</td><td><select class="field rvk" data-p="' + p.id + '"><option value="keep">Yes, keep</option><option value="flag">No, remove</option><option value="change">Keep, but territories are wrong</option></select>' +
      '<input class="field rvw" data-p="' + p.id + '" placeholder="Why" style="margin-top:4px" hidden></td></tr>').join('') + '</tbody></table></div>' +
    fld('rvNote', 'Note for the record', inp('rvNote', 'text', ''), '', 0);
  openPanel('Access review · ' + teamName(rid) + ' · ' + q.label, ppl.length + ' people to confirm', body, '<button class="btn" id="rvX">Cancel</button><button class="btn pri" id="rvOk">' + ic('check', 'sm') + 'Certify the review</button>', () => {
    $('#rvX').onclick = closeDrawer;
    document.querySelectorAll('.rvk').forEach(s => s.onchange = () => { document.querySelector('.rvw[data-p="' + s.dataset.p + '"]').hidden = s.value === 'keep'; });
    $('#rvOk').onclick = () => {
      const res = Array.from(document.querySelectorAll('.rvk')).map(s => ({ id: s.dataset.p, v: s.value, why: document.querySelector('.rvw[data-p="' + s.dataset.p + '"]').value.trim() }));
      const miss = res.find(x => x.v !== 'keep' && !x.why); if (miss) { toast('Say why for ' + personById(miss.id).name); return; }
      const r = { id: rid + '|' + q.key, team: rid, quarter: q.key, label: q.label, by: ME.id, byName: ME.name, at: Date.now(), kept: res.filter(x => x.v === 'keep').map(x => x.id),
        flagged: res.filter(x => x.v === 'flag').map(x => ({ id: x.id, why: x.why })), changes: res.filter(x => x.v === 'change').map(x => ({ id: x.id, why: x.why })), note: $('#rvNote').value.trim(), people: ppl.length };
      saveReview(r); logAccess('reviewed', { id: rid, name: teamName(rid) + ' team', role: rid }, q.label + ': ' + r.kept.length + ' kept' + (r.flagged.length ? ', ' + r.flagged.length + ' flagged for removal' : '') + (r.changes.length ? ', ' + r.changes.length + ' territory corrections' : ''), r.note);
      closeDrawer(); refreshNav(); renderPage(); toast(teamName(rid) + ' access review certified');
    };
  });
}
function pendingFlags() { const out = []; Object.values(REVIEWS).forEach(r => (r.flagged || []).concat((r.changes || []).map(c => Object.assign({ change: true }, c))).forEach(f => { const p = personById(f.id); if (p && p.active !== false && !(f.change && p.correctedAt > r.at)) out.push({ r, f, p }); })); return out; }
function reviewCard(scope) {
  const teams = TEAMS.map(t => t[0]).filter(rid => !scope || scope.includes(rid));
  const flags = pendingFlags().filter(x => !scope || scope.includes(x.p.role));
  const q = fyQuarter();
  return card('Quarterly access review', q.label + ' · due by ' + dmy(q.due) + ' · each head certifies their team, the CFO office certifies leadership',
    '<div class="tbl-wrap"><table class="tbl nopage"><thead><tr><th>Team</th><th>Reviewer</th><th>' + q.label + '</th><th>Result</th><th></th></tr></thead><tbody>' + teams.map(rid => {
      const s = reviewState(rid), rv = reviewerOf(rid);
      return '<tr><td class="nm">' + teamName(rid) + '</td><td>' + esc(rv ? rv.name : '—') + '</td><td>' + (s.st === 'done' ? '<span class="pill p-ok">Done ' + dmy(new Date(s.r.at).toISOString().slice(0, 10)) + '</span>' : s.st === 'overdue' ? '<span class="pill p-bad">Overdue ' + s.days + ' days</span>' : '<span class="pill p-warn">Due by ' + dmy(s.q.due) + '</span>') + '</td>' +
        '<td class="sm">' + (s.r ? s.r.kept.length + ' kept' + (s.r.flagged.length ? ', ' + s.r.flagged.length + ' to remove' : '') + (s.r.changes.length ? ', ' + s.r.changes.length + ' to correct' : '') + ' · ' + esc(s.r.byName) : '') + '</td>' +
        '<td style="text-align:right">' + (canReview(rid) ? '<button class="btn sm" data-rv="' + rid + '">' + (s.st === 'done' ? 'Review again' : 'Start review') + '</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    (flags.length ? '<div class="cb" style="border-top:1px solid var(--line2)"><b>Waiting for IT / ERP</b>' + flags.map(x => '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line2)"><span><b>' + esc(x.p.name) + '</b> · ' + (x.f.change ? 'territories to correct' : 'flagged for removal') + ' by ' + esc(x.r.byName) + ' (' + x.r.label + '): ' + esc(x.f.why) + '</span>' +
      (canManagePerson(x.p) && posOf(ME) === 'it' ? (x.f.change ? '<button class="btn sm" data-fxe="' + x.p.id + '">Correct</button>' : '<button class="btn sm" data-fxr="' + x.p.id + '">Remove access</button>') : '') + '</div>').join('') + '</div>' : ''));
}

/* =====================================================================
   Sessions: sign out after a period without activity, and straight away
   when access is removed.
   ===================================================================== */
const AUTH_MODE = () => !!(window.STEER_SB && window.STEER_CONFIG && !window.STEER_CONFIG.open);
const idleMin = () => (SETTINGS.idleMin === 0 ? 0 : (SETTINGS.idleMin || 30));
let lastAct = Date.now(), idleWarned = false, lockEl = null, warnEl = null;
['pointerdown', 'keydown', 'wheel', 'touchstart', 'pointermove'].forEach(ev => addEventListener(ev, () => { if (lockEl) return; lastAct = Date.now(); if (warnEl) { warnEl.remove(); warnEl = null; idleWarned = false; } }, { passive: true, capture: true }));
function lockSession(reason) {
  closeDrawer();
  if (AUTH_MODE()) { try { Object.keys(localStorage).forEach(k => { if (/^steer-/.test(k) && k !== 'steer-outbox') localStorage.removeItem(k); }); } catch (e) {} window.STEER_SB.auth.signOut(); return; }
  if (lockEl) return;
  lockEl = document.createElement('div'); lockEl.id = 'lockx';
  lockEl.innerHTML = '<div class="lockcard"><div class="brand2">STEER · After-parts workspace</div><h1>' + esc(reason) + '</h1><p>Choose who is using this computer.</p>' +
    '<button class="btn pri" id="lkMe">Continue as ' + esc(ME.name) + '</button><div class="lkgrid">' +
    ROLES.map(r => '<div><div class="note" style="margin:10px 0 4px">' + r.name + '</div>' + PEOPLE.filter(p => p.role === r.id).map(p => '<button class="btn sm" data-lk="' + p.id + '">' + esc(p.name) + '</button>').join(' ') + '</div>').join('') + '</div></div>';
  document.body.appendChild(lockEl);
  const close = () => { lockEl.remove(); lockEl = null; lastAct = Date.now(); idleWarned = false; };
  lockEl.querySelector('#lkMe').onclick = close;
  lockEl.querySelectorAll('[data-lk]').forEach(b => b.onclick = () => { close(); switchPerson(b.dataset.lk); });
}
setInterval(() => {
  const m = idleMin(); if (!m || lockEl) return;
  const idle = (Date.now() - lastAct) / 1000;
  if (idle >= m * 60) { if (warnEl) { warnEl.remove(); warnEl = null; } lockSession('Signed out after ' + m + ' minutes without activity'); return; }
  if (idle >= m * 60 - 60 && !idleWarned) { idleWarned = true; warnEl = document.createElement('div'); warnEl.className = 'idlewarn';
    warnEl.innerHTML = '<span>No activity for a while. You will be signed out in a minute.</span><button class="btn sm pri">Stay signed in</button>';
    warnEl.querySelector('button').onclick = () => { lastAct = Date.now(); warnEl.remove(); warnEl = null; idleWarned = false; }; document.body.appendChild(warnEl); }
}, 5000);
/* removed people are signed out wherever they are signed in */
function enforceSession() {
  if (AUTH_MODE() && window.STEER_SESSION) { const em = (window.STEER_SESSION.email || '').toLowerCase();
    const mine = PEOPLE_ALL.filter(p => (p.email || '').toLowerCase() === em);
    if (mine.length && mine.every(p => p.active === false)) lockSession('Your access was removed'); }
}
function revokeSignIn(p) { if (AUTH_MODE() && p.email && !PEOPLE.some(x => x !== p && (x.email || '').toLowerCase() === p.email.toLowerCase())) window.STEER_SB.from('app_users').delete().eq('email', p.email.toLowerCase()).then(() => {}, () => {}); }
function grantSignIn(p) { if (AUTH_MODE() && p.email) window.STEER_SB.from('app_users').upsert({ email: p.email.toLowerCase(), role: 'member' }).then(() => {}, () => {}); }
function sessionCard() {
  const canSet = ['it', 'cfo'].includes(posOf(ME)), m = idleMin();
  return card('Sessions', 'For shared plant computers',
    '<div class="cb"><p class="note" style="margin-bottom:8px">After <b>' + (m ? m + ' minutes' : 'no limit') + '</b> without activity the workspace ' + (AUTH_MODE() ? 'signs the person out' : 'locks and asks who is using the computer') +
    ', with a one-minute warning. Removing someone’s access signs them out straight away on every device' + (AUTH_MODE() ? ', and removes their email from the sign-in list.' : '.') + '</p>' +
    (canSet ? '<label class="note" style="display:flex;gap:8px;align-items:center">Sign out after <select class="field" id="ssIdle">' + [[10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [0, 'Never']].map(x => '<option value="' + x[0] + '"' + (x[0] === m ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' : '<span class="note">Set by IT / ERP.</span>') + '</div>');
}

/* ---------- wire into the Access & roles screen ---------- */
const _accRender = PAGES.access.render;
PAGES.access.render = function (el) {
  _accRender(el);
  const scope = accessScope(), cards = el.querySelectorAll(':scope>.card'), people = cards[0];
  const box = document.createElement('div'); box.innerHTML = coverCard(scope) + reviewCard(scope) + sessionCard();
  Array.from(box.children).reverse().forEach(c => people.after(c));
  const nb = el.querySelector('#cvNew'); if (nb) nb.onclick = () => coverForm(null);
  el.querySelectorAll('[data-cvend]').forEach(b => b.onclick = () => endCover(b.dataset.cvend));
  el.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => reviewForm(b.dataset.rv));
  el.querySelectorAll('[data-fxr]').forEach(b => b.onclick = () => removeForm(personById(b.dataset.fxr)));
  el.querySelectorAll('[data-fxe]').forEach(b => b.onclick = () => { const p = personById(b.dataset.fxe); personForm(p); });
  const si = el.querySelector('#ssIdle'); if (si) si.onchange = () => { SETTINGS.idleMin = +si.value; saveSettings(); logAccess('edited', { id: 'sessions', name: 'Session timeout', role: 'lead' }, 'sign out after ' + (+si.value ? si.value + ' minutes' : 'never'), ''); renderPage(); toast('Saved'); };
  el.querySelectorAll('[data-cvp]').forEach(b => b.onclick = () => coverForm(personById(b.dataset.cvp)));
};

/* ---------- worklists: what each person sees in My week ---------- */
function accessTasks(day) {
  const t = [], add = (c, h, s2, f, key) => t.push({ c, h, s: s2, f, key });
  Object.keys(REVIEWERS).forEach(rid => { if (!canReview(rid)) return; const st = reviewState(rid, day); if (st.st === 'done') return;
    add(st.st === 'overdue' ? 'var(--bad)' : 'var(--warn)', 'Access review for the <b>' + teamName(rid) + '</b> team', st.st === 'overdue' ? 'Overdue by ' + st.days + ' days (' + st.q.label + ')' : st.q.label + ', due by ' + dmy(st.q.due), () => { go('access'); setTimeout(() => reviewForm(rid), 350); }, 'rv' + rid + st.q.key); });
  if (posOf(ME) === 'it') {
    TEAMS.forEach(t2 => { const st = reviewState(t2[0], day); if (st.st === 'overdue') add('var(--bad)', '<b>' + t2[1] + '</b> access review is overdue', 'Reviewer: ' + esc((reviewerOf(t2[0]) || {}).name || '') + ' · ' + st.days + ' days', () => go('access'), 'rvo' + t2[0]); });
    pendingFlags().forEach(x => add('var(--warn)', (x.f.change ? 'Correct territories for <b>' : 'Remove access for <b>') + esc(x.p.name) + '</b>', 'Flagged in the ' + x.r.label + ' review by ' + esc(x.r.byName), () => go('access'), 'fl' + x.p.id));
  }
  return t;
}
const _myTasks = myTasks;
myTasks = function () {
  const t = _myTasks().concat(accessTasks().map(x => Object.assign(x, { acc: 1 })));
  coveringFor(ME).forEach(p => { const c = activeCoverOf(p); t.push({ acc: 1, c: 'var(--due)', h: 'You are covering for <b>' + esc(p.name) + '</b>', s: 'Until ' + dmy(c.to) + ' · their customers and complaints are in your lists', f: () => go('mywk'), key: 'cv' + c.id }); });
  return t;
};
/* role switcher: show who is away */
const _renderShell = renderShell;
renderShell = function () {
  _renderShell();
  document.querySelectorAll('#rsMenu .rs-opt').forEach(b => { const p = personById(b.dataset.p), c = activeCoverOf(p);
    if (c) { const d = b.querySelector('.d'); if (d && !d.querySelector('.awaytag')) d.insertAdjacentHTML('beforeend', ' <span class="pill p-warn awaytag">Away to ' + dmy(c.to) + ' · ' + esc((personById(c.standIn) || {}).name || '') + '</span>'); } });
};
/* My week: banner for the person away and for the stand-in, and a quick way to set cover */
const _mywk = PAGES.mywk.render;
PAGES.mywk.render = function (el) {
  _mywk(el);
  const mine = activeCoverOf(ME) || Object.values(COVERS).find(c => c.pid === ME.id && coverState(c) === 'upcoming'), cov = coveringFor(ME);
  let h = '';
  if (mine) h += '<div class="banner warn" style="margin-bottom:12px">' + ic('calendar') + '<div><b>' + (coverState(mine) === 'active' ? 'You are on leave cover' : 'Leave cover booked') + '.</b> ' + esc((personById(mine.standIn) || {}).name || '') + ' handles your customers and complaints ' + dmy(mine.from) + ' – ' + dmy(mine.to) + '.</div></div>';
  cov.forEach(p => { const c = activeCoverOf(p); h += '<div class="banner info" style="margin-bottom:12px">' + ic('users') + '<div><b>You are covering for ' + esc(p.name) + '</b> until ' + dmy(c.to) + '. Their customers (' + esc(coverage(p)) + ') and complaints are in your lists below.</div></div>'; });
  const at = accessTasks(window.__ACCESS_DAY);
  if (at.length) h += card('Access tasks', 'Reviews and access changes waiting for you', '<div class="cb flush">' + at.map((x, k) => '<div class="r linkrow" data-at="' + k + '" style="cursor:pointer;display:flex;gap:10px;align-items:center;padding:9px 16px;border-bottom:1px solid var(--line2)"><i style="width:8px;height:8px;border-radius:50%;background:' + x.c + ';flex:none"></i><div><div>' + x.h + '</div><div class="note">' + x.s + '</div></div></div>').join('') + '</div>');
  if (canSetCover(ME) && !mine) h += '<div style="margin:-4px 0 12px"><button class="btn sm" data-cvp="' + ME.id + '">' + ic('calendar', 'sm') + 'Going on leave? Set a stand-in</button></div>';
  if (h) { const ph = el.querySelector('.ph1'); const d = document.createElement('div'); d.innerHTML = h; Array.from(d.children).reverse().forEach(x => ph.after(x));
    el.querySelectorAll('[data-cvp]').forEach(b => b.onclick = () => coverForm(personById(b.dataset.cvp)));
    el.querySelectorAll('[data-at]').forEach(r => r.onclick = () => at[+r.dataset.at].f()); }
};

/* styles for the lock screen and idle warning */
(function () { const st = document.createElement('style'); st.textContent =
  '#lockx{position:fixed;inset:0;z-index:99998;background:rgba(15,23,42,.78);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px}' +
  '#lockx .lockcard{background:var(--panel);color:var(--ink);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.35);max-width:640px;width:100%;padding:24px;max-height:90vh;overflow:auto}' +
  '#lockx h1{font-size:19px;margin:4px 0}#lockx p{color:var(--mute);margin:0 0 12px}#lockx .brand2{font-size:12px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--accent)}' +
  '#lockx .lkgrid .btn{margin:2px 0}' +
  '.idlewarn{position:fixed;left:50%;transform:translateX(-50%);bottom:20px;z-index:99990;background:var(--ink);color:var(--panel);border-radius:10px;padding:10px 14px;display:flex;gap:12px;align-items:center;box-shadow:var(--pop);font-size:13px}';
  document.head.appendChild(st); })();

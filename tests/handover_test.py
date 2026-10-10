import json,sys
from playwright.sync_api import sync_playwright
ROOT=sys.argv[1] if len(sys.argv)>1 else '/home/claude/steer-afterparts'
DOCS={}
def srv(s):
    q=json.loads(s)
    if q['op']=='select':
        rows=[{'path':p,'data':d} for p,d in sorted(DOCS.items()) if all((p.split('/')[0] if k=='collection' else p)==v for o,k,v in q['f'] if o=='eq')]
        if q['single']: return json.dumps({'data':rows[0] if rows else None,'error':None})
        if q.get('r'): a,b=q['r']; rows=rows[a:b+1]
        return json.dumps({'data':rows,'error':None})
    if q['op']=='upsert':
        for r in q['rows']: DOCS[r['path']]=r['data']
    return json.dumps({'data':None,'error':None})
R=[];errs=[]
def ok(n,c,i=''):
    R.append(bool(c)); print('PASS' if c else 'FAIL',n,i)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}); ctx.expose_function('__srv',srv)
    ctx.route('**/vendor/supabase.js',lambda r:r.fulfill(path='tests/fake-sb.js',content_type='text/javascript'))
    ctx.route('https://fonts.**',lambda r:r.abort())
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto('file://'+ROOT+'/index.html'); pg.wait_for_timeout(2500)
    go=lambda h:(pg.evaluate(f"location.hash='{h}'"),pg.wait_for_timeout(450))
    E=pg.evaluate
    jc=lambda sel:(pg.evaluate('s=>document.querySelector(s).click()',sel),pg.wait_for_timeout(300))
    # ---------- handover: quality ----------
    go('#/lead/access/it')
    before=E("(()=>{const o=openItemsOf(personById('q-w'));return {c:o.complaints.length}})()")
    ok('Quality – West has open complaints to hand over', before['c']>0, str(before))
    jc('[data-acx="q-w"]')
    ok('remove form lists what will move', 'open complaint' in pg.locator('#drawer').inner_text())
    pg.select_option('#rmTo','q-n'); pg.fill('#acWhy2','Left the company'); pg.click('#acOk'); pg.wait_for_timeout(500)
    r=E("(()=>{const qn=personById('q-n');const mine=BOARD.open.filter(i=>COMPL[i.no]&&COMPL[i.no].assignee==='q-n');return {n:mine.length,acc:mine.every(i=>accountableFor(i)===qn),z:qn.zones,note:mine.length?COMPL[mine[0].no].updates.slice(-1)[0].note:''}})()")
    ok('every open complaint now assigned to Quality – North & East', r['n']==before['c'] and r['acc'], str(r['n']))
    ok('successor took the West territory', 'West' in r['z'], str(r['z']))
    ok('each complaint carries a handover note', 'Handed over from Quality' in r['note'], r['note'])
    ok('log records the handover counts', E("ACCLOG[0].action==='removed'&&/handed over to Quality – North & East: \\d+ complaints/.test(ACCLOG[0].detail)"), E("ACCLOG[0].detail"))
    ok('nothing left against the removed person', E("(()=>{const o=openItemsOf(personById('q-w'));return o.complaints.length+o.quotes.length})()")==0)
    # ---------- handover: sales ----------
    q0=E("Object.values(RS.quotes).filter(q=>(q.status||'Open')==='Open'&&q.sales_rep==='Sales – West').length")
    s0=E("Object.values(RS.quotes).filter(q=>(q.status||'Open')==='Open'&&q.sales_rep==='Sales – South').length")
    ok('Sales – West has open quotes', q0>0, str(q0))
    jc('[data-acx="s-w"]'); pg.select_option('#rmTo','s-s'); pg.fill('#acWhy2','Resigned'); pg.click('#acOk'); pg.wait_for_timeout(500)
    s1=E("Object.values(RS.quotes).filter(q=>(q.status||'Open')==='Open'&&q.sales_rep==='Sales – South').length")
    ok('open quotes moved to Sales – South', s1==s0+q0, f'{s0}+{q0}->{s1}')
    ok('West primary passes to the successor', E("primaryOf('sales','West')&&primaryOf('sales','West').id")=='s-s')
    ok('Sales – South now covers West', E("personById('s-s').zones.includes('West')"))
    # ---------- handover: service plans ----------
    n0=E("openItemsOf(personById('v-w')).plans.length")
    jc('[data-acx="v-w"]'); pg.select_option('#rmTo','v-n'); pg.fill('#acWhy2','Transferred'); pg.click('#acOk'); pg.wait_for_timeout(500)
    n1=E("allPlans().filter(p=>p.ownerId==='v-n').length")
    ok('planned visits moved to Service – North & East', n1==n0, f'{n0} -> {n1}')
    # ---------- move to another team ----------
    jc('[data-acx="s-n"]')
    pg.select_option('#rmKind','move'); pg.select_option('#rmTeam','service'); pg.check('#rmMove input[value="North & East"]'); pg.select_option('#rmTo','s-head'); pg.fill('#acWhy2','Moved to service'); pg.click('#acOk'); pg.wait_for_timeout(500)
    mv=E("(()=>{const o=personById('s-n'),n=personById(o.movedTo);return n?{old:o.active,role:n.role,name:n.name,z:n.zones,log:ACCLOG[0].action+'/'+ACCLOG[1].action}:null})()")
    ok('mover becomes a Service member with the same name', mv and mv['old']==False and mv['role']=='service' and mv['name']=='Sales – North & East', str(mv))
    # ---------- forced sign-out (sign-in mode) ----------
    so=E("""(()=>{window.__so=0;window.__rev=0;const keepSB=window.STEER_SB,keepCfg=Object.assign({},window.STEER_CONFIG);
      window.STEER_SB={auth:{signOut:()=>{window.__so=1;return Promise.resolve()}},from:()=>({delete(){return {eq(){window.__rev=1;return Promise.resolve()}}},upsert(){return Promise.resolve()}})};
      window.STEER_CONFIG.open=false;window.STEER_SESSION={email:'ravi@x.com'};
      const p=personById('s-s');p.email='ravi@x.com';p.active=false;enforceSession();revokeSignIn(p);const r={so:window.__so,rev:window.__rev};
      p.active=true;p.email='';rebuildPeople();window.STEER_CONFIG.open=keepCfg.open;window.STEER_SB=keepSB;window.STEER_SESSION=null;return r})()""")
    ok('removed person is signed out at once (sign-in mode)', so['so']==1, str(so))
    ok('their email leaves the sign-in list', so['rev']==1)
    # ---------- leave cover ----------
    go('#/quality/access/q-head')
    pg.click('#cvNew'); pg.wait_for_timeout(300)
    pg.select_option('#cvP','q-s'); pg.wait_for_timeout(100); pg.select_option('#cvS','q-head') if False else None
    opts=E("[...document.querySelectorAll('#cvS option')].map(o=>o.value)")
    ok('stand-in choices are the same team', all(x.startswith('q-') for x in opts) and 'q-s' not in opts, str(opts))
    pg.select_option('#cvS','q-n'); pg.fill('#cvWhy','Annual leave'); pg.click('#cvOk'); pg.wait_for_timeout(400)
    cv=E("""(()=>{const qs=personById('q-s'),qn=personById('q-n');const south=BOARD.open.find(i=>baseAccountable(i)===qs);
      return {acting:actingFor(qs).id,acc:south?accountableFor(south).id:null,z:coverZones(qn)}})()""")
    ok('South complaints go to the stand-in', cv['acc']=='q-n', str(cv))
    ok('stand-in scope includes South and Export', 'South' in cv['z'] and 'Export' in cv['z'], str(cv['z']))
    go('#/quality/mywk/q-n')
    ok('stand-in My week says who they cover', 'You are covering for Quality – South & Export' in pg.locator('#page').inner_text())
    ok('stand-in can update the covered complaints', E("(()=>{const i=BOARD.open.find(i=>baseAccountable(i)===personById('q-s'));return canUpdateComplaint(i)})()"))
    go('#/quality/mywk/q-s')
    ok('person away sees their cover banner', 'You are on leave cover' in pg.locator('#page').inner_text())
    ok('role switcher shows who is away', E("[...document.querySelectorAll('#rsMenu .awaytag')].length")==1)
    # overlap refused
    go('#/quality/access/q-head'); pg.click('#cvNew'); pg.wait_for_timeout(300); pg.select_option('#cvP','q-s'); pg.wait_for_timeout(100); pg.fill('#cvWhy','x'); pg.click('#cvOk'); pg.wait_for_timeout(200)
    ok('overlapping cover refused', 'already has cover' in pg.locator('#e-cvF').inner_text())
    pg.select_option('#cvP','q-sc'); pg.wait_for_timeout(100); pg.select_option('#cvS','q-s'); pg.click('#cvOk'); pg.wait_for_timeout(200)
    ok('a stand-in who is away is refused', 'away in these dates' in pg.locator('#e-cvS').inner_text())
    pg.fill('#cvT','2027-06-01'); pg.select_option('#cvS','q-n'); pg.click('#cvOk'); pg.wait_for_timeout(200)
    ok('more than 90 days refused', 'At most 90 days' in pg.locator('#e-cvT').inner_text())
    E('closeDrawer()')
    # ends on its own
    ended=E("""(()=>{const c=Object.values(COVERS).find(c=>c.pid==='q-s');const keep=c.to;c.to=addDays(TODAY_ISO,-1);c.from=addDays(TODAY_ISO,-5);
      const i=BOARD.open.find(i=>baseAccountable(i)===personById('q-s'));const r={st:coverState(c),acc:accountableFor(i).id};c.to=keep;c.from=TODAY_ISO;return r})()""")
    ok('cover ends on its own after the last day', ended['st']=='ended' and ended['acc']=='q-s', str(ended))
    # self-service cover for a member
    go('#/sales/mywk/s-x')
    ok('a member can set their own cover from My week', pg.locator('[data-cvp="s-x"]').count()==1)
    jc('[data-cvp="s-x"]')
    ok('member can only set cover for themselves', E("[...document.querySelectorAll('#cvP option')].map(o=>o.value)")==['s-x'])
    pg.select_option('#cvS','s-s'); pg.fill('#cvWhy','Conference'); pg.click('#cvOk'); pg.wait_for_timeout(400)
    ok('sales stand-in can log for the covered territory', E("(()=>{const keep=ME;ME=personById('s-s');const ck=Object.keys(CUST).find(k=>zoneOf(k)==='Export');const r=ck?canLogFor(ck):'no export customer';ME=keep;return r})()")==True)
    go('#/quality/access/q-head')
    pg.locator('[data-cvend]').first.click(); pg.wait_for_timeout(300)
    ok('end cover early', E("Object.values(COVERS).find(c=>c.pid==='q-s').endedAt>0"))
    # ---------- quarterly review ----------
    ok('quarter is FY27 Q3, due 31 Oct', E("fyQuarter('2026-10-10').label+' '+fyQuarter('2026-10-10').due")=='FY27 Q3 2026-10-31', E("fyQuarter('2026-10-10').label+' '+fyQuarter('2026-10-10').due"))
    ok('quarter boundaries (Jan -> Q4, Apr -> Q1 next FY)', E("fyQuarter('2027-01-15').key+' '+fyQuarter('2027-04-02').key")=='FY27-Q4 FY28-Q1')
    go('#/sales/mywk/s-head')
    ok('Sales head gets the review in My week', 'Access review for the Sales team' in pg.locator('#page').inner_text())
    go('#/lead/access/it')
    ok('IT cannot certify a team review', pg.locator('[data-rv]').count()==0)
    E("window.__ACCESS_DAY='2026-11-05'")
    go('#/lead/mywk/it')
    ok('IT sees overdue reviews', pg.locator('#page').inner_text().count('access review is overdue')==4, str(pg.locator('#page').inner_text().count('access review is overdue')))
    ok('overdue counted from the due date', E("reviewState('sales','2026-11-05').st+' '+reviewState('sales','2026-11-05').days")=='overdue 5')
    E("window.__ACCESS_DAY=undefined")
    go('#/sales/access/s-head'); jc('[data-rv="sales"]')
    pg.select_option('.rvk[data-p="s-x"]','flag'); pg.click('#rvOk'); pg.wait_for_timeout(200)
    ok('flagging needs a reason', E("!REVIEWS['sales|FY27-Q3']"))
    pg.fill('.rvw[data-p="s-x"]','No longer handles export'); pg.click('#rvOk'); pg.wait_for_timeout(400)
    ok('review certified with one flag', E("(()=>{const r=REVIEWS['sales|FY27-Q3'];return r&&r.flagged.length===1&&r.by==='s-head'})()"))
    ok('team shows Done', 'Done' in pg.locator('.card:has(h2:has-text("Quarterly access review"))').inner_text())
    go('#/lead/mywk/it')
    ok('IT gets the removal task', 'Remove access for Sales – Export' in pg.locator('#page').inner_text())
    go('#/lead/access/it'); jc('[data-fxr="s-x"]'); pg.fill('#acWhy2','Access review FY27 Q3'); pg.click('#acOk'); pg.wait_for_timeout(400)
    ok('flag clears once removed', E("pendingFlags().length")==0)
    # ---------- sessions ----------
    pg.select_option('#ssIdle','10'); pg.wait_for_timeout(300)
    ok('IT sets the idle timeout', E("SETTINGS.idleMin")==10 and any(k=='settings/app' for k in DOCS))
    E("lastAct=Date.now()-(10*60-30)*1000"); pg.wait_for_timeout(6000)
    ok('one-minute warning shows', pg.locator('.idlewarn').count()==1)
    E("lastAct=Date.now()-11*60*1000"); pg.wait_for_timeout(6000)
    ok('locks after the idle time (no sign-in mode)', pg.locator('#lockx').count()==1)
    pg.click('#lockx [data-lk="v-head"]'); pg.wait_for_timeout(500)
    ok('lock screen asks who is using the computer', pg.locator('#lockx').count()==0 and E("ME.id")=='v-head')
    go('#/sales/access/s-head')
    ok('heads cannot change the timeout', pg.locator('#ssIdle').count()==0)
    # sync to backend
    ok('covers, reviews and handovers sync', any(k.startswith('covers/') for k in DOCS) and any(k.startswith('reviews/') for k in DOCS) and any(k.startswith('complaints/') for k in DOCS) and any(k.startswith('rs_quotes/') for k in DOCS))
    b.close()
print('JS errors:',errs[:5]); print('SUMMARY',sum(R),'/',len(R))

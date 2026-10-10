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
    R.append(c); print('PASS' if c else 'FAIL',n,i)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}); ctx.expose_function('__srv',srv)
    ctx.route('**/vendor/supabase.js',lambda r:r.fulfill(path='tests/fake-sb.js',content_type='text/javascript'))
    ctx.route('https://fonts.**',lambda r:r.abort())
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto('file://'+ROOT+'/index.html'); pg.wait_for_timeout(2500)
    go=lambda h:(pg.evaluate(f"location.hash='{h}'"),pg.wait_for_timeout(400))
    nav=lambda:pg.evaluate("[...document.querySelectorAll('#nav a')].map(a=>a.textContent.replace(/\\d+$/,'').trim())")
    # IT / ERP
    go('#/lead/overview/it')
    ok('IT lands on My week', pg.evaluate('location.hash')=='#/lead/mywk/it', pg.evaluate('location.hash'))
    ok('IT nav is data-steward only', nav()==['My week','Data uploads','Team & territories','Installed base','Agent map','Access & roles'], str(nav()))
    for bad in ['pricing','forecast','radar','inbox','board','scorecard']:
        go(f'#/lead/{bad}/it')
        if pg.evaluate('location.hash')!='#/lead/mywk/it': ok('IT blocked from '+bad,False,pg.evaluate('location.hash')); break
    else: ok('IT blocked from commercial / complaint screens by URL',True)
    go('#/lead/team/it'); pg.click('.sectabs button:has-text("Customer territories")')
    ok('IT can reassign customer territories', pg.locator('select.tz').count()>0)
    pg.click('.sectabs button:has-text("Customer identity")')
    ok('IT can merge duplicate customers', pg.locator('[data-merge]').count()>0)
    pg.click('.sectabs button:has-text("Owners & teams")')
    ok('IT cannot set primary owners (business decision)', pg.locator('[data-prim]:not([disabled])').count()==0)
    ok('IT cannot change team territories', pg.locator('.opt button[data-z]:not([disabled])').count()==0)
    # Quality head on team page
    go('#/quality/team/q-head')
    ok('Quality head cannot reassign customer territories', pg.locator('select.tz').count()==0)
    ok('Quality head cannot merge customers', pg.locator('[data-merge]').count()==0)
    en=pg.evaluate("[...document.querySelectorAll('.opt button[data-z]:not([disabled])')].map(b=>b.dataset.p)")
    ok('Quality head edits only quality members\' territories', len(en)>0 and all(x.startswith('q-') for x in en), str(sorted(set(en))))
    pr=pg.evaluate("[...document.querySelectorAll('[data-prim]:not([disabled])')].map(b=>b.dataset.prim.split('|')[0])")
    ok('Quality head sets primary only for Quality', all(x=='quality' for x in pr), str(set(pr)))
    go('#/sales/team/s-head'); pg.click('.sectabs button:has-text("Customer territories")')
    ok('Sales head can reassign customer territories (customer master owner)', pg.locator('select.tz').count()>0)
    # member has no access screen
    go('#/sales/access/s-w')
    ok('Account manager cannot open Access & roles', '/access/' not in pg.evaluate('location.hash') and 'Access & roles' not in nav(), pg.evaluate('location.hash'))
    # IT adds a person
    go('#/lead/access/it')
    ok('IT sees all teams on access page', pg.locator('#acTeam').count()==1)
    pg.click('#acAdd'); pg.wait_for_timeout(300)
    opts=pg.evaluate("[...document.querySelectorAll('#acTeamF option')].map(o=>o.value)")
    ok('IT can add to Sales, Quality, Service but not Leadership', opts==['sales','quality','service'], str(opts))
    pg.click('#acOk'); pg.wait_for_timeout(200)
    ok('form validates required fields', pg.evaluate("[...document.querySelectorAll('.fld .err')].filter(e=>e.textContent).length")>=3)
    pg.fill('#acName','Ravi Patil'); pg.fill('#acMail','ravi.patil@steer.example'); pg.select_option('#acTeamF','sales')
    pg.check('#acZones input[value="West"]'); pg.fill('#acWhy','Joined West sales')
    pg.click('#acOk'); pg.wait_for_timeout(400)
    rid=pg.evaluate("(PEOPLE.find(p=>p.name==='Ravi Patil')||{}).id")
    ok('person added and active', bool(rid), str(rid))
    ok('new person in role switcher', pg.evaluate("[...document.querySelectorAll('#rsMenu .rs-opt')].some(b=>b.textContent.includes('Ravi Patil'))"))
    ok('new person covers West as Sales backup', pg.evaluate("coverers('sales','West').some(p=>p.name==='Ravi Patil')"))
    ok('logged with reason', pg.evaluate("ACCLOG[0].action==='added'&&ACCLOG[0].why==='Joined West sales'&&ACCLOG[0].byName==='IT / ERP'"))
    ok('synced to backend', any(k.startswith('people/'+rid) for k in DOCS) and any(k.startswith('access/') for k in DOCS))
    # duplicate name blocked
    pg.click('#acAdd'); pg.wait_for_timeout(200); pg.fill('#acName','ravi patil'); pg.check('#acZones input[value="South"]'); pg.fill('#acWhy','x'); pg.click('#acOk'); pg.wait_for_timeout(200)
    ok('duplicate name refused', 'already has this name' in pg.locator('#e-acName').inner_text())
    pg.evaluate('closeDrawer()')
    # new person signs in and sees sales work
    go(f'#/sales/mywk/{rid}')
    ok('new person can work as Sales West', pg.evaluate('location.hash')==f'#/sales/mywk/{rid}' and 'My week' in nav())
    ok('new person sees West customers only', pg.evaluate("scopeZones().join()")=='West')
    # remove s-w -> no gap (Ravi covers West)
    go('#/lead/access/it')
    pg.click('[data-acx="s-w"]'); pg.wait_for_timeout(300)
    ok('no gap warning when a backup remains', pg.locator('#drawer .banner.warn').count()==0)
    pg.click('#acOk'); pg.wait_for_timeout(200)
    ok('removal needs a reason', 'Say why' in pg.locator('#e-acWhy2').inner_text())
    pg.fill('#acWhy2','Moved to another company'); pg.click('#acOk'); pg.wait_for_timeout(400)
    ok('s-w removed', pg.evaluate("personById('s-w').active===false&&!PEOPLE.includes(personById('s-w'))"))
    ok('removed person gone from role switcher', not pg.evaluate("[...document.querySelectorAll('#rsMenu .rs-opt')].some(b=>b.dataset.p==='s-w')"))
    ok('primary passes to the remaining West owner', pg.evaluate("primaryOf('sales','West').name")=='Ravi Patil')
    go('#/sales/mywk/s-w')
    ok('removed person URL falls back', pg.evaluate('location.hash')!='#/sales/mywk/s-w', pg.evaluate('location.hash'))
    # remove Ravi now -> gap
    go('#/lead/access/it'); pg.click(f'[data-acx="{rid}"]'); pg.wait_for_timeout(300)
    ok('gap warning when last West owner removed', 'West' in pg.locator('#drawer .banner.warn').inner_text() if pg.locator('#drawer .banner.warn').count() else False)
    pg.evaluate('closeDrawer()')
    # restore
    pg.click('[data-acf="removed"]'); pg.wait_for_timeout(200)
    pg.click('[data-acr="s-w"]'); pg.wait_for_timeout(300)
    ok('restore brings access back', pg.evaluate("personById('s-w').active===true&&PEOPLE.includes(personById('s-w'))"))
    # heads and leadership protected
    go('#/lead/access/it')
    ok('IT cannot remove heads', pg.locator('[data-acx="s-head"],[data-acx="q-head"],[data-acx="v-head"]').count()==0)
    ok('IT cannot edit itself or the CFO office', pg.locator('[data-ace="it"],[data-ace="cfo"]').count()==0)
    ok('IT can hand over a head position (edit)', pg.locator('[data-ace="s-head"]').count()==1)
    # Sales head scope
    go('#/sales/access/s-head')
    ppl=pg.evaluate("[...document.querySelectorAll('#page tbody tr td.nm')].map(t=>t.textContent)")
    ok('Sales head sees only Sales people', all(('Sales' in x) or ('Ravi' in x) for x in ppl), str(len(ppl)))
    pg.click('#acAdd'); pg.wait_for_timeout(200)
    ok('Sales head can add only to Sales', pg.evaluate("[...document.querySelectorAll('#acTeamF option')].map(o=>o.value)")==['sales'])
    pg.evaluate('closeDrawer()')
    ok('Sales head cannot remove self', pg.locator('[data-acx="s-head"]').count()==0)
    ok('Sales head can remove a member', pg.locator('[data-acx="s-s"]').count()==1)
    # Quality head cannot touch sales
    go('#/quality/access/q-head')
    ok('Quality head cannot see Sales people', pg.locator('[data-acx="s-s"],[data-ace="s-s"]').count()==0)
    pg.click('#acAdd'); pg.wait_for_timeout(200); pg.select_option('#acKind','queue'); pg.wait_for_timeout(100)
    ok('Quality can add a queue specialist', pg.locator('#acQ').is_visible() and not pg.locator('#acZones').is_visible())
    pg.evaluate('closeDrawer()')
    # CFO
    go('#/lead/access/cfo'); pg.click('#acAdd'); pg.wait_for_timeout(200)
    ok('CFO office adds leadership accounts only', pg.evaluate("[...document.querySelectorAll('#acTeamF option')].map(o=>o.value)")==['lead'])
    pg.fill('#acName','MD office'); pg.fill('#acWhy','Board visibility'); pg.click('#acOk'); pg.wait_for_timeout(300)
    mid=pg.evaluate("(PEOPLE.find(p=>p.name==='MD office')||{}).id")
    ok('management viewer added', bool(mid))
    go(f'#/lead/pricing/{mid}')
    ok('management viewer can read every screen', pg.evaluate('location.hash')==f'#/lead/pricing/{mid}')
    ok('management viewer cannot upload or change settings', not pg.evaluate("can('data.upload')||can('data.settings')"))
    go('#/lead/access/cfo')
    ok('CFO cannot remove IT / ERP (handover only)', pg.locator('[data-acx="it"]').count()==0 and pg.locator('[data-ace="it"]').count()==1)
    # matrix equals enforcement
    mism=pg.evaluate("""()=>{const out=[];const sample={cfo:'cfo',it:'it','sales-head':'s-head','sales-member':'s-s','quality-head':'q-head','quality-member':'q-w','quality-spec':'q-sc','service-head':'v-head','service-member':'v-w'};
      for(const [pos,id] of Object.entries(sample)){const p=personById(id);if(posOf(p)!==pos)out.push('pos '+id);
        for(const d of PERMS){const allowed=can(d.k,null,p);if(allowed!==d.who.includes(pos))out.push(d.k+' '+pos)}}
      // spot checks against the app's own rules
      const keep=ME;for(const id of ['q-w','s-s','v-w','it']){ME=personById(id);if(canSeeContacts()!==can('contacts.view'))out.push('contacts '+id)}ME=keep;
      return out}""")
    ok('matrix, positions and enforcement agree', mism==[], str(mism))
    # persistence across reload
    pg.reload(); pg.wait_for_timeout(2500)
    ok('people and log persist after reload', pg.evaluate("!!PEOPLE.find(p=>p.name==='Ravi Patil')&&!!PEOPLE.find(p=>p.name==='MD office')&&ACCLOG.length>=4"))
    # second browser sees the change from the backend
    c2=b.new_context(); c2.expose_function('__srv',srv); c2.route('**/vendor/supabase.js',lambda r:r.fulfill(path='tests/fake-sb.js',content_type='text/javascript'))
    p2=c2.new_page(); p2.on('pageerror',lambda e:errs.append('p2 '+str(e))); p2.goto('file://'+ROOT+'/index.html'); p2.wait_for_timeout(3000)
    ok('another browser gets added people and log', p2.evaluate("!!PEOPLE.find(p=>p.name==='Ravi Patil')&&ACCLOG.length>=4"))
    b.close()
print('JS errors:',errs[:5]); print('SUMMARY',sum(R),'/',len(R))

import json,sys
from playwright.sync_api import sync_playwright
ROOT=sys.argv[1]; OUT=sys.argv[2]
def srv(s):
    q=json.loads(s); return json.dumps({'data':[] if q.get('op')=='select' and not q.get('single') else None,'error':None})
res={}; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}); ctx.expose_function('__srv',srv)
    ctx.route('**/vendor/supabase.js',lambda r:r.fulfill(path='tests/fake-sb.js',content_type='text/javascript'))
    ctx.route('https://fonts.**',lambda r:r.abort())
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(pg.url+' '+str(e)))
    pg.goto('file://'+ROOT+'/index.html'); pg.wait_for_timeout(1500)
    people=pg.evaluate("PEOPLE.map(p=>[p.role,p.id])")
    res['_checks']=pg.evaluate("dataChecks().map(c=>c.n+'|'+c.st+'|'+c.d)")
    for role,pid in people:
        home=pg.evaluate(f"ROLES.find(r=>r.id==='{role}').home")
        pg.evaluate(f"location.hash='#/{role}/{home}/{pid}'"); pg.wait_for_timeout(300)
        links=pg.evaluate("[...document.querySelectorAll('#nav a[href^=\"#/\"]')].map(a=>a.getAttribute('href'))")
        for h in dict.fromkeys(links):
            pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(250)
            res[h]=pg.evaluate("""()=>{const P=document.querySelector('#page');
              return {kpi:[...P.querySelectorAll('.kpi')].map(k=>k.textContent.trim().replace(/\\s+/g,' ')),
                      cards:[...P.querySelectorAll('.card>.ch h2')].map(h=>h.textContent.trim()).sort(),
                      rows:[...P.querySelectorAll('table')].map(t=>t.tBodies[0]?t.tBodies[0].rows.length:0).sort((a,b)=>b-a),
                      text:P.textContent.length}}""")
    b.close()
json.dump({'res':res,'errs':errs},open(OUT,'w'))
print('pages',len(res)-1,'errors',errs[:5])

import json, sys
from playwright.sync_api import sync_playwright
ROOT=sys.argv[1] if len(sys.argv)>1 else '/home/claude/steer-afterparts'
OUT=sys.argv[2] if len(sys.argv)>2 else '/home/claude/tests/measure.json'
VPS=[(1440,900),(1366,768),(390,844)]
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
res=[]; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for vw,vh in VPS:
        ctx=b.new_context(viewport={'width':vw,'height':vh})
        ctx.expose_function('__srv',srv)
        ctx.route('**/vendor/supabase.js',lambda r:r.fulfill(path='tests/fake-sb.js',content_type='text/javascript'))
        ctx.route('https://fonts.**',lambda r:r.abort())
        pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto('file://'+ROOT+'/index.html'); pg.wait_for_timeout(2500)
        roles=pg.evaluate("ROLES.map(r=>r.id+'/'+r.home)")
        for role in roles:
            pg.evaluate(f"location.hash='#/{role}'"); pg.wait_for_timeout(500)
            links=pg.evaluate("[...document.querySelectorAll('#nav a[href^=\"#/\"]')].map(a=>a.getAttribute('href'))")
            for h in dict.fromkeys(links):
                pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(350)
                m=pg.evaluate("""()=>{const v=document.querySelector('#view'),pgEl=document.querySelector('#page');
                 const secs=[...pgEl.children].map(c=>({t:(c.querySelector('h2,h3,.ttl,.hd')||c).textContent.trim().slice(0,50),h:Math.round(c.getBoundingClientRect().height)})).sort((a,b)=>b.h-a.h).slice(0,4);
                 const tables=[...pgEl.querySelectorAll('table')].map(t=>t.rows.length).sort((a,b)=>b-a).slice(0,3);
                 return {sh:v.scrollHeight,ch:v.clientHeight,hx:document.documentElement.scrollWidth>innerWidth+2||v.scrollWidth>v.clientWidth+2,secs,tables,title:(document.querySelector('#crumb')||{}).textContent}}""")
                m.update(vp=f'{vw}x{vh}',route=h,screens=round(m['sh']/m['ch'],2))
                res.append(m)
        ctx.close()
    b.close()
json.dump(res,open(OUT,'w'),indent=1)
print('errors',errs[:10])
import collections
for vp in ['1440x900','1366x768','390x844']:
    rs=[r for r in res if r['vp']==vp]
    rs.sort(key=lambda r:-r['screens'])
    print('\n==',vp,'pages',len(rs),'avg screens',round(sum(r['screens'] for r in rs)/len(rs),2),'>2 screens:',sum(r['screens']>2 for r in rs), 'hx:',sum(bool(r['hx']) for r in rs))
    for r in rs[:45 if vp=='1440x900' else 12]:
        print(f"{r['screens']:5} {r['route']:28} tables{r['tables']} {[(s['t'][:28],s['h']) for s in r['secs'][:3]]}")

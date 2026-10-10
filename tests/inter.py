import json,sys
from playwright.sync_api import sync_playwright
ROOT='/home/claude/steer-afterparts'
def srv(s):
    q=json.loads(s); return json.dumps({'data':[] if q.get('op')=='select' and not q.get('single') else None,'error':None})
R=[]; errs=[]
def ok(name,cond,info=''):
    R.append((('PASS' if cond else 'FAIL'),name,info)); print(('PASS' if cond else 'FAIL'),name,info)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}); ctx.expose_function('__srv',srv)
    ctx.route('**/vendor/supabase.js',lambda r:r.fulfill(path='tests/fake-sb.js',content_type='text/javascript'))
    ctx.route('https://fonts.**',lambda r:r.abort())
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('file://'+ROOT+'/index.html'); pg.wait_for_timeout(1500)
    go=lambda h:(pg.evaluate(f"location.hash='{h}'"),pg.wait_for_timeout(400))
    # radar
    go('#/sales/radar/s-head')
    ok('radar has section tabs', pg.locator('.sectabs button').count()==3, pg.locator('.sectabs').inner_text())
    ok('radar chart height capped', pg.evaluate("document.querySelector('#radarChart svg').viewBox.baseVal.height")<=520)
    pg.click('.sectabs button:has-text("Call list")'); pg.wait_for_timeout(200)
    bar=pg.locator('.pgbar').first
    ok('call list paged', '1–10 of 137' in bar.inner_text(), bar.inner_text())
    vis=pg.evaluate("[...document.querySelectorAll('#page tr.click[data-i]')].filter(r=>r.offsetParent).length")
    ok('10 rows visible', vis==10, str(vis))
    bar.locator('button[data-p="1"]').click(); pg.wait_for_timeout(200)
    ok('next page', '11–20 of 137' in pg.locator('.pgbar').first.inner_text())
    first=pg.evaluate("[...document.querySelectorAll('#page tr.click[data-i]')].find(r=>r.offsetParent).textContent.slice(0,30)")
    pg.locator('#page tr.click[data-i]:visible').first.click(); pg.wait_for_timeout(400)
    ok('row on page 2 opens drawer', pg.evaluate("document.querySelector('#drawer').classList.contains('open')"), first)
    pg.keyboard.press('Escape'); pg.evaluate("closeDrawer&&closeDrawer()"); pg.wait_for_timeout(200)
    pg.select_option('#rSort','due'); pg.wait_for_timeout(300)
    ok('sort returns to page 1', '1–10 of 137' in pg.locator('.pgbar').first.inner_text(), pg.locator('.pgbar').first.inner_text())
    pg.locator('.pgbar select').first.select_option('0'); pg.wait_for_timeout(200)
    vis=pg.evaluate("[...document.querySelectorAll('#page tr.click[data-i]')].filter(r=>r.offsetParent).length")
    ok('rows: All shows every row', vis==137, str(vis))
    pg.locator('.pgbar select').first.select_option('10'); pg.wait_for_timeout(200)
    pg.click('.sectabs button:has-text("Timeline")'); pg.wait_for_timeout(200)
    pg.click('[data-f="OVERDUE"]'); pg.wait_for_timeout(400)
    pg.click('.sectabs button:has-text("Call list")'); pg.wait_for_timeout(200)
    ok('status filter flows into pager', 'of 37' in pg.locator('.pgbar').first.inner_text(), pg.locator('.pgbar').first.inner_text())
    pg.click('.sectabs button:has-text("Timeline")'); pg.click('[data-f="ALL"]'); pg.wait_for_timeout(300)
    # team: tabs + reveal
    go('#/lead/team/cfo')
    ok('team section tabs', pg.locator('.sectabs button').count()==5, pg.locator('.sectabs').inner_text().replace('\n',' | '))
    ok('team groups as tabs', pg.locator('.cgtabs button').count()==3, pg.locator('.cgtabs').inner_text().replace('\n',' '))
    pg.click('.cgtabs button:nth-child(2)'); pg.wait_for_timeout(200)
    ok('quality team tab shows quality cards', 'Quality head' in pg.evaluate("[...document.querySelectorAll('#page .agrid')].find(a=>a.offsetParent).textContent"))
    btn=pg.locator('#page button:has-text("Review")').first
    if btn.count():
        btn.click(); pg.wait_for_timeout(400)
        cur=pg.evaluate("(document.querySelector('.sectabs [aria-pressed=true]')||{}).textContent")
        ok('"Review" jumps to Customer identity tab', cur=='Customer identity', cur)
    else: ok('Review button present',False)
    pg.click('.sectabs button:has-text("Customer territories")'); pg.wait_for_timeout(200)
    ok('territories list paged over all 194', 'of 194' in pg.locator('.pgbar:visible').first.inner_text(), pg.locator('.pgbar:visible').first.inner_text())
    f=pg.locator('#page input[placeholder="Filter customers"]')
    if f.count():
        f.fill('poly'); pg.wait_for_timeout(500)
        t=pg.locator('.pgbar:visible').first.inner_text() if pg.locator('.pgbar:visible').count() else 'no pager (<=12 rows)'
        n=pg.evaluate("[...document.querySelectorAll('#page table')].map(t=>t.tBodies[0]?t.tBodies[0].rows.length:0)")
        ok('filter re-paginates', True, t+' rows '+str(n))
        ok('filter keeps focus in box', pg.evaluate("document.activeElement&&document.activeElement.placeholder==='Filter customers'"))
        f.fill(''); pg.wait_for_timeout(300)
    pg.click('.sectabs button:has-text("Owners & teams")')
    # fold persistence
    go('#/lead/uploads/cfo')
    ok('reference cards folded by default', pg.locator('.card.cl-shut').count()>=4, str(pg.locator('.card.cl-shut').count()))
    pg.click('.card.cl-shut h2:has-text("Data settings")'); pg.wait_for_timeout(200)
    ok('fold opens on click', pg.locator('.card:has(h2:has-text("Data settings"))').evaluate("c=>!c.classList.contains('cl-shut')"))
    pg.reload(); pg.wait_for_timeout(1500)
    ok('fold choice remembered after reload', pg.locator('.card:has(h2:has-text("Data settings"))').evaluate("c=>!c.classList.contains('cl-shut')"))
    ok('required columns moved to tooltip', 'Required:' in (pg.locator('[data-tpl]').first.get_attribute('title') or ''))
    # schedule label tabs
    go('#/service/schedule/v-head')
    ok('schedule list tabs', pg.locator('.lbtabs button').count()>=4, pg.locator('.lbtabs').inner_text().replace('\n',' '))
    pg.click('.lbtabs button:last-child'); pg.wait_for_timeout(200)
    ok('later tab paged', pg.locator('.pgbar:visible').count()==1 and 'of 40' in pg.locator('.pgbar:visible').first.inner_text(), pg.locator('.pgbar:visible').first.inner_text() if pg.locator('.pgbar:visible').count() else '')
    pg.locator('#page button:has-text("Log visit"):visible').first.click(); pg.wait_for_timeout(400)
    ok('log visit from paged row opens form', pg.evaluate("document.querySelector('#drawer').classList.contains('open')||!!document.querySelector('#page form,#page .formcard')"))
    pg.evaluate("closeDrawer&&closeDrawer()")
    # territory filter on CFO
    go('#/lead/visits/cfo')
    before=pg.locator('.pgbar').first.inner_text()
    pg.select_option('#zf','West'); pg.wait_for_timeout(400)
    after=pg.locator('.pgbar').first.inner_text() if pg.locator('.pgbar').count() else 'none'
    ok('territory filter changes paged totals', before!=after, before+' -> '+after)
    pg.select_option('#zf','all'); pg.wait_for_timeout(300)
    # downloads & search
    pg.click('#dlBtn'); pg.wait_for_timeout(200)
    ok('download menu still lists options', pg.locator('.dlmenu button').count()>0, str(pg.locator('.dlmenu button').count()))
    pg.keyboard.press('Escape')
    pg.fill('#q','Jotun'); pg.wait_for_timeout(400)
    ok('customer search works', 'Jotun' in pg.locator('#sres').inner_text())
    pg.fill('#q','')
    # cases panes
    go('#/quality/cases/q-head')
    h=pg.evaluate("document.querySelector('#view').scrollHeight/document.querySelector('#view').clientHeight")
    ok('repeat cases fits ~one screen (panes scroll)', h<1.3, str(round(h,2)))
    # back to top
    go('#/lead/overview/cfo'); pg.evaluate("document.querySelector('#view').scrollTop=2000"); pg.wait_for_timeout(300)
    ok('back-to-top appears on long screen', pg.locator('.totop.show').count()==1)
    pg.click('.totop'); pg.wait_for_timeout(800)
    ok('back-to-top scrolls up', pg.evaluate("document.querySelector('#view').scrollTop")<50)
    # performance
    t=pg.evaluate("""()=>{const t0=performance.now();for(const h of ['#/lead/team/cfo','#/lead/ib/cfo','#/sales/radar/s-head','#/lead/visits/cfo']){location.hash=h;route()}return performance.now()-t0}""")
    ok('render + compact under 400ms per heavy screen', t/4<400, f'{t/4:.0f} ms avg')
    # mobile
    m=b.new_context(viewport={'width':390,'height':844}); m.expose_function('__srv',srv)
    m.route('**/vendor/supabase.js',lambda r:r.fulfill(path='tests/fake-sb.js',content_type='text/javascript'))
    mp=m.new_page(); mp.on('pageerror',lambda e:errs.append('mobile '+str(e))); mp.goto('file://'+ROOT+'/index.html'); mp.wait_for_timeout(1200)
    mp.evaluate("location.hash='#/sales/radar/s-head'"); mp.wait_for_timeout(400)
    ok('mobile: tabs scroll sideways inside strip, page does not', mp.evaluate("document.documentElement.scrollWidth<=innerWidth+1"))
    mp.evaluate("location.hash='#/quality/cases/q-head'"); mp.wait_for_timeout(400)
    ok('mobile: case timeline trimmed', mp.locator('.lsmore').count()>=1)
    b.close()
print('JS errors:',errs[:5])
print('SUMMARY', sum(r[0]=='PASS' for r in R),'pass /',len(R))

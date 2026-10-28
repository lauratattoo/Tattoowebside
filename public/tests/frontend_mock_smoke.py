from playwright.sync_api import sync_playwright
from pathlib import Path
import json, base64
root=Path(__file__).resolve().parent.parent
public=root/'public'
html=(public/'index.html').read_text()
css=(public/'style.css').read_text()
js=(public/'app.js').read_text()
assets=public/'assets'
for filename in ['portfolio-2.jpg','portfolio-5.jpg','original-3.jpg']:
    b64=base64.b64encode((assets/filename).read_bytes()).decode()
    html=html.replace('/assets/'+filename,'data:image/jpeg;base64,'+b64)
# All gallery images optional for mock smoke.
html=html.replace('<link rel="stylesheet" href="/style.css">','')
html=html.replace('<script defer src="/app.js"></script>','')
import re
css=re.sub(r'@import[^;]+;', '', css)
html=html.replace('</head>','<style>'+css+'</style></head>')
public_state={
    'settings':{'name':'Salon tattoo Laura','artist':'Laura','intro':'Jemné linky a osobní přístup.','city':'Liberec','address':'','phone':'','email':'','facebook':'','instagram':'','whatsapp':'','hoursStart':'10:00','hoursEnd':'18:00','workdays':[1,2,3,4,5,6],'theme':'rose'},
    'gallery':[{'id':'image1','title':'Motiv','category':'Původní fotografie','image':'data:image/jpeg;base64,'+base64.b64encode((assets/'original-3.jpg').read_bytes()).decode()}],
    'occupied':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height,name in [(1440,900,'desktop'),(390,844,'mobil')]:
        page=browser.new_page(viewport={'width':width,'height':height})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(html)
        mock=json.dumps(public_state,ensure_ascii=False)
        page.evaluate('''data => { window.fetch=async (u,opt)=>({ok: true,json: async()=>String(u).includes('/api/public')?JSON.parse(data):({ok:true,notificationSent:false})}); }''',mock)
        page.add_script_tag(content=js)
        page.wait_for_timeout(400)
        assert not errors,errors
        assert page.locator('.gallery-tile').count()==1
        assert page.locator('#slots .slot').count()>0
        if name=='mobil':
            page.locator('#menuButton').click()
            assert page.locator('#mobileNav').is_visible()
        else:
            page.locator('.slot:not([disabled])').first.click()
            page.locator('input[name="firstName"]').fill('Jana')
            page.locator('input[name="lastName"]').fill('Testerová')
            page.locator('input[name="email"]').fill('test@example.com')
            page.locator('.consent input').check()
            page.locator('#submitBooking').click()
            assert 'uložena' in page.locator('#toast').inner_text(),page.locator('#toast').inner_text()
        assert not errors,errors
        page.screenshot(path=f'/mnt/data/salon_tattoo_laura_{name}_nahled.png',full_page=True)
        print(name, 'pass, gallery + slots + interactions')
    browser.close()

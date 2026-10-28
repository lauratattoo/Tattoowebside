import os, subprocess, time, tempfile, socket, urllib.request
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close()
with tempfile.TemporaryDirectory() as temp:
    env={**os.environ,'PORT':str(port),'ADMIN_PASSWORD':'Long_Test_Password_127896','SESSION_SECRET':'Strong_Long_Test_Secret_8988989191919191','DATA_FILE':os.path.join(temp,'data.json')}
    srv=subprocess.Popen(['node','server.mjs'],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for n in range(35):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=1)
                break
            except Exception: time.sleep(.15)
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
            page=browser.new_page(viewport={'width':1440,'height':900}, device_scale_factor=1)
            errs=[]
            page.on('pageerror',lambda e:errs.append(str(e)))
            page.goto(f'http://127.0.0.1:{port}',wait_until='networkidle')
            page.screenshot(path='/mnt/data/salon_tattoo_laura_desktop.png',full_page=True)
            assert page.locator('.gallery-tile').count()==9,page.locator('#galleryGrid').inner_text()
            assert page.locator('#slots .slot').count()>=2,page.locator('#slots').inner_text()
            assert not errs,errs
            page.locator('#bookingForm input[name="firstName"]').fill('Jana')
            page.locator('#bookingForm input[name="lastName"]').fill('Testerová')
            page.locator('#bookingForm input[name="email"]').fill('jana@example.com')
            page.locator('#slots .slot:not([disabled])').first.click()
            page.locator('#bookingForm .consent input').check()
            page.locator('#bookingForm button[type="submit"]').click()
            page.wait_for_timeout(500)
            assert 'Žádost uložena' in page.locator('#toast').inner_text(), page.locator('#toast').inner_text()
            page.goto(f'http://127.0.0.1:{port}/admin.html',wait_until='networkidle')
            assert page.locator('#loginCover').is_visible()
            page.locator('#password').fill('Long_Test_Password_127896')
            page.locator('#loginBtn').click()
            page.wait_for_timeout(700)
            assert page.locator('#loginCover').is_hidden(),page.locator('#loginError').inner_text()
            page.locator('button[data-view="requests"]').click()
            assert 'Jana Testerová' in page.locator('#content').inner_text()
            assert not errs,errs
            print('desktop + booking + admin PASS')
            mob=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
            moberrs=[]
            mob.on('pageerror',lambda e:moberrs.append(str(e)))
            mob.goto(f'http://127.0.0.1:{port}',wait_until='networkidle')
            mob.screenshot(path='/mnt/data/salon_tattoo_laura_mobil.png',full_page=True)
            assert mob.locator('#menuButton').is_visible()
            mob.locator('#menuButton').click()
            assert mob.locator('#mobileNav').is_visible()
            assert not moberrs,moberrs
            print('mobile PASS')
            browser.close()
    finally:
        srv.terminate()
        try:srv.wait(timeout=3)
        except: srv.kill()

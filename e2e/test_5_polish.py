"""Phase 5 browser checks: dark mode, offline banner, service worker offline reload, lazy screens, skip link, manifest."""
import os, json, sys, time, base64, re
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('E2E_OUT', os.path.join(HERE, 'out'))
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright, expect
from mock_supabase import MockSupabase, USER_ID

REF = 'abcdefghijklmnopqrst'
BASE = os.environ.get('BASE', 'http://localhost:4108')
W, H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (360, 760)
TAG = 'phone' if W < 800 else 'laptop'

def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
exp = int(time.time()) + 3600
token = 'eyJhbGciOiJIUzI1NiJ9.' + b64({'sub': USER_ID, 'role': 'authenticated', 'exp': exp}) + '.sig'
session = {'access_token': token, 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': exp,
           'user': {'id': USER_ID, 'email': 'ketan@example.com', 'aud': 'authenticated', 'role': 'authenticated',
                    'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-10-21T00:00:00Z'}}
checks = []
def check(name, cond, detail=''):
    checks.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail and not cond else ''), flush=True)

mock = MockSupabase()
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': W, 'height': H}, color_scheme='dark')
    ctx.set_default_timeout(10000)
    ctx.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(session))})")
    ctx.route(f'https://{REF}.supabase.co/**', mock.route)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to fetch' not in m.text and 'ERR_INTERNET_DISCONNECTED' not in m.text and errors.append(m.text))

    # Seed a little data so screens have content
    page.goto(BASE + '/accounts/new')
    page.get_by_label('Name', exact=True).fill('HDFC Savings')
    page.get_by_label(re.compile('on that date')).fill('25000')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('heading', name='Accounts')).to_be_visible()
    check('lazy screen (Accounts) loads', True)
    for text, cat in [('450 groceries', None), ('got 50000 salary', None), ('120 cafe', 'Food & dining')]:
        page.goto(BASE + '/add')
        page.get_by_label('Quick add — type or speak').fill(text)
        page.get_by_label('Quick add — type or speak').press('Enter')
        if cat: page.get_by_label('Category').select_option(label=cat)
        page.get_by_role('button', name='Save', exact=True).click()
        expect(page.get_by_role('status').filter(has_text='Saved')).to_be_visible()

    # Dark mode follows the device
    page.goto(BASE + '/')
    expect(page.get_by_text('Balances today')).to_be_visible()
    check('dark mode follows the device', page.evaluate('document.documentElement.dataset.theme') == 'dark')
    bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
    check('dark page background is black', bg == 'rgb(0, 0, 0)', bg)
    btn = page.evaluate("(() => { const s = getComputedStyle(document.querySelector('nav a[aria-label=\"Add transaction\"], aside a[href=\"/add\"]')); return [s.color, s.backgroundColor]; })()")
    check('add button is black on neon in dark mode', btn == ['rgb(0, 0, 0)', 'rgb(187, 243, 81)'], str(btn))
    page.screenshot(path=os.path.join(OUT, f'p5-01-home-dark-{TAG}.png'), full_page=True)
    page.goto(BASE + '/add'); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(OUT, f'p5-02-add-dark-{TAG}.png'), full_page=True)
    page.goto(BASE + '/upcoming'); page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(OUT, f'p5-03-upcoming-dark-{TAG}.png'), full_page=True)

    # Choosing Light in Settings overrides the device and survives a reload
    page.goto(BASE + '/settings')
    page.get_by_role('radio', name='Light').click()
    page.reload(); page.wait_for_timeout(300)
    check('appearance choice persists', page.evaluate('document.documentElement.dataset.theme') == 'light')
    page.get_by_role('radio', name='Same as device').click()

    # Skip link
    page.goto(BASE + '/')
    expect(page.get_by_text('Balances today')).to_be_visible()
    page.keyboard.press('Tab')
    check('first Tab focuses "Skip to content"', page.evaluate('document.activeElement.textContent') == 'Skip to content')

    # Service worker + offline
    page.goto(BASE + '/'); page.wait_for_timeout(1500)
    sw = page.evaluate("navigator.serviceWorker.getRegistration().then(r => !!(r && (r.active || r.installing || r.waiting)))")
    check('service worker registered', sw)
    page.reload(); page.wait_for_timeout(1500)  # let the worker control the page and cache assets
    cached = page.evaluate("caches.keys()")
    check('only app caches exist', sorted(cached) == ['assets-v1', 'shell-v1'], str(cached))
    urls = page.evaluate("Promise.all(['shell-v1','assets-v1'].map(n => caches.open(n).then(c => c.keys()).then(k => k.map(r => r.url)))).then(a => a.flat())")
    check('no database responses cached', not any('supabase' in u for u in urls), str(urls))

    ctx.set_offline(True)
    page.reload(); page.wait_for_timeout(1500)
    check('app opens offline from cache', page.get_by_text('You’re offline').count() == 1, page.content()[:300])
    page.screenshot(path=os.path.join(OUT, f'p5-04-offline-{TAG}.png'), full_page=True)
    ctx.set_offline(False)

    # Manifest is valid and icons load
    manifest = page.evaluate("fetch('/manifest.webmanifest').then(r => r.json())")
    sizes = sorted(i['sizes'] for i in manifest['icons'])
    check('manifest has 192 and 512 icons', '192x192' in sizes and '512x512' in sizes, str(sizes))
    ok = page.evaluate("Promise.all(['/icon-192.png','/icon-512.png','/icon-maskable-512.png','/apple-touch-icon.png'].map(u => fetch(u).then(r => r.ok && r.headers.get('content-type').includes('png')))).then(a => a.every(Boolean))")
    check('icons served as PNG', ok)

    widths = []
    for path in ['/', '/settings', '/backup', '/import']:
        page.goto(BASE + path); page.wait_for_timeout(400)
        widths.append((path, page.evaluate('document.documentElement.scrollWidth')))
    check('no horizontal scrolling', all(w <= W for _, w in widths), str(widths))
    check('no console/page errors', not errors, '; '.join(errors[:3]))
    browser.close()

print(f"\n{sum(1 for _, ok in checks if ok)}/{len(checks)} checks passed")

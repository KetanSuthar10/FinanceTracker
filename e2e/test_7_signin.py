"""Sign-in screen: email + password, plain errors, Google button only when switched on, the DB-not-set-up message."""
import os, sys, re
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('E2E_OUT', os.path.join(HERE, 'out'))
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright, expect
from mock_supabase import MockSupabase

REF = 'abcdefghijklmnopqrst'
BASE = os.environ.get('BASE', 'http://localhost:4108')
W, H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (360, 760)
TAG = 'phone' if W < 600 else 'laptop'
checks = []
def check(name, cond, detail=''):
    checks.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail and not cond else ''), flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    for google in (False, True):
        mock = MockSupabase(); mock.google_enabled = google
        ctx = browser.new_context(viewport={'width': W, 'height': H})
        ctx.set_default_timeout(10000)
        ctx.route(f'https://{REF}.supabase.co/**', mock.route)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE + '/')
        expect(page.get_by_label('Email')).to_be_visible()
        page.wait_for_timeout(500)
        google_btn = page.get_by_role('button', name='Continue with Google')
        if not google:
            check('email + password form is shown', page.get_by_label('Password').is_visible())
            check('no Google button while Google is off', google_btn.count() == 0)
            page.screenshot(path=os.path.join(OUT, f'p7-signin-{TAG}.png'))
            page.get_by_role('button', name='Sign in', exact=True).click()
            check('empty form asks for email and password', page.get_by_text('Enter your email and password.').is_visible())
            page.get_by_label('Email').fill('owner@example.com')
            page.get_by_label('Password').fill('wrong')
            page.get_by_role('button', name='Sign in', exact=True).click()
            expect(page.get_by_text('Wrong email or password.')).to_be_visible()
            check('wrong password says so plainly', True)
            page.get_by_label('Password').fill('correct-horse-42')
            page.get_by_role('button', name='Sign in', exact=True).click()
            expect(page.get_by_text('Welcome! Start with your accounts')).to_be_visible()
            check('right password opens the app', True)
            page.reload()
            expect(page.get_by_text('Welcome! Start with your accounts')).to_be_visible()
            check('stays signed in after reload', True)
            # Database not set up: tables missing -> plain instruction instead of a raw error
            mock.rpc = lambda name, payload: mock.err(404, 'PGRST202', f'Could not find the function public.{name}')
            orig = mock.handle
            def missing(method, url, headers, body, orig=orig):
                if '/rest/v1/' in url and 'rpc/' not in url:
                    return 404, {'code': 'PGRST205', 'message': "Could not find the table 'public.accounts' in the schema cache"}
                return orig(method, url, headers, body)
            mock.handle = missing
            page.reload()
            expect(page.get_by_text(re.compile('database isn’t set up yet')).first).to_be_visible()
            check('missing database setup is explained', True)
        else:
            check('Google button appears when switched on', google_btn.is_visible())
            check('email form still shown alongside', page.get_by_label('Password').is_visible())
        check(f'no page errors (google={google})', not errors, '; '.join(errors[:2]))
        ctx.close()
    browser.close()

print(f"\n{sum(1 for _, ok in checks if ok)}/{len(checks)} checks passed")

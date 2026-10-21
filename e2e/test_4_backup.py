"""Phase 4 browser checks: full backup download, CSV export, restore into an empty app, tamper detection."""
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

def new_page(browser, mock):
    ctx = browser.new_context(viewport={'width': W, 'height': H}, accept_downloads=True)
    ctx.set_default_timeout(10000)
    ctx.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(session))})")
    ctx.route(f'https://{REF}.supabase.co/**', mock.route)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'status of 4' not in m.text and errors.append(m.text))
    return ctx, page, errors

with sync_playwright() as p:
    browser = p.chromium.launch()
    first = MockSupabase()
    ctx, page, errors = new_page(browser, first)

    page.goto(BASE + '/')
    expect(page.get_by_text('Welcome! Start with your accounts')).to_be_visible()
    page.goto(BASE + '/accounts/new')
    page.get_by_label('Name', exact=True).fill('HDFC Savings')
    page.get_by_label('Starting date').fill('2026-09-30')
    page.get_by_label(re.compile('on that date')).fill('1000')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('heading', name='Accounts')).to_be_visible()
    for text, cat, note in [('got 5000 salary on 1st', None, ''), ('120 cafe on 3rd', 'Food & dining', ''), ('50 snacks on 4th', None, '=SUM(A1:A9)')]:
        page.goto(BASE + '/add')
        page.get_by_label('Quick add — type or speak').fill(text)
        page.get_by_label('Quick add — type or speak').press('Enter')
        if cat: page.get_by_label('Category').select_option(label=cat)
        if note: page.get_by_label('Note (optional)').fill(note)
        page.get_by_role('button', name='Save', exact=True).click()
        expect(page.get_by_role('status').filter(has_text='Saved')).to_be_visible()

    page.goto(BASE + '/backup')
    expect(page.get_by_text('Restore from a backup')).to_be_visible()
    check('restore hidden when the app has data', page.get_by_text('Restore only works on an empty app').count() == 1 and page.get_by_text('Choose backup file').count() == 0)
    page.screenshot(path=os.path.join(OUT, f'p4-01-backup-{TAG}.png'), full_page=True)
    with page.expect_download() as dl:
        page.get_by_role('button', name='Download backup').click()
    backup_path = dl.value.path()
    backup = json.load(open(backup_path))
    check('backup file has all transactions and a checksum', len(backup['data']['transactions']) == 3 and len(backup['checksum']) == 64)
    check('backup amounts are integer paise', all(isinstance(t['amount_paise'], int) for t in backup['data']['transactions']))

    page.get_by_label('From').fill('2026-10-01')
    page.get_by_label('To').fill('2026-10-31')
    with page.expect_download() as dl:
        page.get_by_role('button', name='Download CSV').click()
    csv_text = open(dl.value.path(), encoding='utf-8-sig', newline='').read()
    lines = csv_text.strip().split('\r\n')
    check('CSV has header + 3 rows, oldest first', len(lines) == 4 and lines[1].startswith('2026-10-01,income,5000.00'), csv_text[:300])
    check('CSV neutralises a formula-looking name', "'=" in csv_text, csv_text)

    # Restore into a brand-new, empty app
    second = MockSupabase()
    ctx2, page2, errors2 = new_page(browser, second)
    page2.goto(BASE + '/backup')
    expect(page2.get_by_text('Choose backup file')).to_be_visible()

    tampered = json.loads(json.dumps(backup)); tampered['data']['transactions'][0]['amount_paise'] += 100
    open(os.path.join(OUT, 'tampered.json'), 'w').write(json.dumps(tampered))
    page2.locator('input[type=file]').set_input_files(os.path.join(OUT, 'tampered.json'))
    expect(page2.get_by_text('changed or damaged')).to_be_visible()
    check('tampered backup refused before writing', len(second.tables['accounts']) == 0)

    page2.locator('input[type=file]').set_input_files(backup_path)
    expect(page2.get_by_text('Backup checked')).to_be_visible()
    page2.screenshot(path=os.path.join(OUT, f'p4-02-restore-check-{TAG}.png'), full_page=True)
    page2.get_by_role('button', name='Restore this backup').click()
    expect(page2.get_by_text('Restored.')).to_be_visible()
    check('restore wrote accounts and transactions', len(second.tables['accounts']) == 1 and len(second.tables['transactions']) == 3)
    page2.goto(BASE + '/?month=2026-10')
    expect(page2.get_by_text('Balances today')).to_be_visible()
    text = page2.locator('main').inner_text()
    check('restored balance is the same (₹5,830)', '₹5,830' in text, text[:400])
    check('restored recipient memory works', len(second.tables['recipients']) == len(first.tables['recipients']))

    check('no horizontal scrolling', page.evaluate('document.documentElement.scrollWidth') <= W)
    check('no console/page errors', not errors and not errors2, '; '.join((errors + errors2)[:3]))
    browser.close()

print(f"\n{sum(1 for _, ok in checks if ok)}/{len(checks)} checks passed")

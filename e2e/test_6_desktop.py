"""Computer layout checks: transactions table, keyboard shortcuts, Add side panel, Home columns, import table."""
import os, json, sys, time, base64, re
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('E2E_OUT', os.path.join(HERE, 'out'))
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright, expect
from mock_supabase import MockSupabase, USER_ID

REF = 'abcdefghijklmnopqrst'
BASE = os.environ.get('BASE', 'http://localhost:4108')
FILES = os.path.join(HERE, 'files') + '/'
W, H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (1366, 860)
if W < 1024:
    print('This test is for computer widths (1024px and up).')
    sys.exit(0)
TAG = f'desk{W}'

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
    ctx = browser.new_context(viewport={'width': W, 'height': H})
    ctx.set_default_timeout(10000)
    ctx.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(session))})")
    ctx.route(f'https://{REF}.supabase.co/**', mock.route)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'status of 4' not in m.text and errors.append(m.text))

    def shot(name):
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(OUT, f'p6-{name}-{TAG}.png'))  # viewport only: what you actually see

    def add_account(kind, name, amount):
        page.goto(BASE + '/accounts/new')
        page.get_by_role('radio', name=kind).click()
        page.get_by_label('Name', exact=True).fill(name)
        page.get_by_label('Starting date').fill('2026-09-30')
        page.get_by_label(re.compile('on that date')).fill(amount)
        page.get_by_role('button', name='Save', exact=True).click()
        expect(page.get_by_role('heading', name='Accounts')).to_be_visible()

    page.goto(BASE + '/')
    expect(page.get_by_text('Welcome! Start with your accounts')).to_be_visible()
    add_account('Bank', 'HDFC Savings', '1000')
    add_account('Bank', 'Bank B', '0')
    add_account('Cash', 'Cash', '200')
    add_account('Credit card', 'Card C', '0')

    def quick(text, category=None):
        page.get_by_label('Quick add — type or speak').fill(text)
        page.get_by_label('Quick add — type or speak').press('Enter')
        if category: page.get_by_label('Category').select_option(label=category)
        page.get_by_role('button', name='Save', exact=True).click()
        expect(page.get_by_role('status').filter(has_text='Saved')).to_be_visible()

    # 1. "N" opens Add with the cursor already in quick add (computer only)
    page.goto(BASE + '/')
    expect(page.get_by_text('Balances today')).to_be_visible()
    page.keyboard.press('n')
    expect(page.get_by_role('heading', name='Add transaction')).to_be_visible()
    check('N opens Add transaction', page.url.endswith('/add'))
    check('quick add is focused', page.evaluate("document.activeElement.id") == 'quick-text')

    for text, cat in [('got 5000 salary on 1st', None), ('120 cafe on 3rd', 'Food & dining'), ('120 cafe on 3rd', None),
                      ('120 pharmacy on 4th', 'Health'), ('60 parking cash on 4th', 'Transport'), ('800 groceries card on 5th', None),
                      ('paid card bill 300 on 7th', None), ('withdrew 100 on 8th', None), ('transfer 50 hdfc to bank b on 9th', None),
                      ('got 1000 freelance on 10th', None), ('refund 100 groceries card on 12th', None), ('20 card fee on 14th', None)]:
        quick(text, cat)
    panel = page.get_by_text('Latest entries')
    check('Add shows latest entries beside the form', panel.is_visible())
    form_box = page.get_by_role('button', name='Save', exact=True).bounding_box()
    panel_box = panel.bounding_box()
    check('panel is to the right of the form', panel_box and form_box and panel_box['x'] > form_box['x'] + form_box['width'] - 5, f'{panel_box} {form_box}')
    shot('01-add')

    # 2. Transactions table: many rows on one screen; "/" focuses search; typing in a field ignores shortcuts
    page.goto(BASE + '/transactions?month=2026-10')
    expect(page.get_by_role('table')).to_be_visible()
    rows = page.locator('tbody tr')
    check('table has all 12 transactions', rows.count() == 12, str(rows.count()))
    visible = sum(1 for i in range(rows.count()) if (b := rows.nth(i).bounding_box()) and b['y'] + b['height'] <= H)
    check('at least 10 rows fit on screen', visible >= 10, str(visible))
    shot('02-transactions')
    page.locator('body').click(position={'x': W - 5, 'y': H - 5})
    page.keyboard.press('/')
    check('"/" focuses search', page.evaluate("document.activeElement.id") == 'transaction-search')
    page.keyboard.type('nn')
    check('typing "n" in search does not jump to Add', '/transactions' in page.url and page.get_by_label('Search by name or note').input_value() == 'nn')
    page.get_by_label('Search by name or note').fill('')
    page.get_by_role('link', name='Pharmacy').click()
    expect(page.get_by_role('heading', name='Edit transaction')).to_be_visible()
    check('clicking a row opens it', True)

    page.goto(BASE + '/')
    expect(page.get_by_text('Balances today')).to_be_visible()
    page.keyboard.press('/')
    page.wait_for_timeout(400)
    check('"/" from Home goes to search', '/transactions' in page.url and page.evaluate("document.activeElement.id") == 'transaction-search')

    # 3. Home uses the width: on wide screens three cards share a row
    page.goto(BASE + '/?month=2026-10')
    expect(page.get_by_text('Balances today')).to_be_visible()
    tops = {name: page.get_by_text(name, exact=True).first.bounding_box()['y'] for name in ['Balances today', 'Spending by category', 'Due in the next 7 days']}
    if W >= 1280:
        check('three cards side by side on a wide screen', max(tops.values()) - min(tops.values()) < 5, str(tops))
    else:
        check('balances and categories side by side', abs(tops['Balances today'] - tops['Spending by category']) < 5, str(tops))
    text = page.locator('main').inner_text()
    check('home figures unchanged (₹6,000 / ₹1,140 / ₹6,480)', all(v in text for v in ['₹6,000', '₹1,140', '₹6,480']))
    shot('03-home')

    # 4. Import review is a compact table
    page.goto(BASE + '/import')
    page.get_by_label('Account this statement is for').select_option(label='HDFC Savings · Bank')
    page.locator('#statement-file').set_input_files(FILES + 'bank-oct.csv')
    page.get_by_role('button', name='Continue to review').click()
    expect(page.get_by_role('table')).to_be_visible()
    check('import review shows a table', page.locator('tbody tr').count() == 6)
    shot('04-import-review')
    page.get_by_role('button', name=re.compile('^Import \\d+ transactions?$')).click()
    expect(page.get_by_text(re.compile('^Imported \\d+ transactions?$'))).to_be_visible()
    check('statement rows already entered by hand are recognised (only 1 new)', page.get_by_text('Imported 1 transaction', exact=True).count() == 1)

    page.goto(BASE + '/upcoming'); page.wait_for_timeout(400); shot('05-upcoming')

    widths = []
    for path in ['/', '/transactions?month=2026-10', '/add', '/accounts', '/accounts/new', '/upcoming', '/budgets', '/categories',
                 '/recipients', '/settings', '/import', '/backup', '/more']:
        page.goto(BASE + path); page.wait_for_timeout(350)
        widths.append((path, page.evaluate('document.documentElement.scrollWidth')))
    check('no horizontal scrolling on any page', all(w <= W for _, w in widths), str([x for x in widths if x[1] > W]))
    check('no console/page errors', not errors, '; '.join(errors[:3]))
    browser.close()

print(f"\n{sum(1 for _, ok in checks if ok)}/{len(checks)} checks passed")

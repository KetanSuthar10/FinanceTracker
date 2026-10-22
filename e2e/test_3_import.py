"""Phase 3 browser checks: statement import (CSV + XLSX), mapping memory, duplicates, undo, refusals."""
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
W, H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (360, 760)
TAG = 'phone' if W < 800 else 'laptop'

def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
exp = int(time.time()) + 3600
token = 'eyJhbGciOiJIUzI1NiJ9.' + b64({'sub': USER_ID, 'role': 'authenticated', 'exp': exp}) + '.sig'
session = {'access_token': token, 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': exp,
           'user': {'id': USER_ID, 'email': 'ketan@example.com', 'aud': 'authenticated', 'role': 'authenticated',
                    'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-10-21T00:00:00Z'}}

mock = MockSupabase()
checks = []
def check(name, cond, detail=''):
    checks.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail and not cond else ''), flush=True)

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
        page.screenshot(path=os.path.join(OUT, f'p3-{name}-{TAG}.png'), full_page=True)

    def add_account(kind, name, amount):
        page.goto(BASE + '/accounts/new')
        page.get_by_role('radio', name=kind).click()
        page.get_by_label('Name', exact=True).fill(name)
        page.get_by_label('Starting date').fill('2026-09-30')
        page.get_by_label(re.compile('on that date')).fill(amount)
        page.get_by_role('button', name='Save', exact=True).click()
        expect(page.get_by_role('heading', name='Accounts')).to_be_visible()

    def choose(account_label, filename):
        page.goto(BASE + '/import')
        page.get_by_label('Account this statement is for').select_option(label=account_label)
        page.locator('#statement-file').set_input_files(FILES + filename)

    page.goto(BASE + '/')
    expect(page.get_by_text('Welcome! Start with your accounts')).to_be_visible()
    add_account('Bank', 'HDFC Savings', '1000')
    add_account('Cash', 'Wallet', '0')
    add_account('Credit card', 'Card C', '0')

    # A manual coffee entered earlier in the day — the statement should flag one coffee as a possible duplicate.
    page.goto(BASE + '/add')
    page.get_by_label('Quick add — type or speak').fill('120 third wave coffee on 3rd')
    page.get_by_label('Quick add — type or speak').press('Enter')
    page.get_by_label('Category').select_option(label='Food & dining')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('status').filter(has_text='Saved')).to_be_visible()

    # 1. Refusals with clear next steps
    page.goto(BASE + '/import'); shot('01-pick')
    choose('HDFC Savings · Bank', 'statement.pdf')
    expect(page.get_by_role('alert').filter(has_text='PDF statements can’t be read')).to_be_visible()
    check('PDF refused with a next step', True)

    # 2. Bank CSV: mapping guessed, review statuses
    choose('HDFC Savings · Bank', 'bank-oct.csv')
    expect(page.get_by_text('Which columns are which?')).to_be_visible()
    check('header row found below preamble', 'Line 5' in page.get_by_label('Line with the column names').evaluate('el => el.options[el.selectedIndex].text'))
    check('withdrawal column guessed', page.get_by_label('Money out (debit / withdrawal)').input_value() == 'Withdrawal Amt.')
    shot('02-mapping')
    page.get_by_role('button', name='Continue to review').click()
    expect(page.get_by_text('6 transactions', exact=True)).to_be_visible()
    text = page.locator('main').inner_text()
    check('error line explained', 'Can\'t read the date "31/02/26"' in text or "31/02/26" in text, text[:500])
    check('one coffee flagged as possibly entered', 'Possibly already entered' in text)
    check('mapping saved for the account', len(mock.tables['import_mappings']) == 1)
    shot('03-review')
    page.get_by_role('button', name=re.compile('^Import 5 transactions')).click()
    expect(page.get_by_text('Imported 5 transactions')).to_be_visible()
    shot('04-done')
    tx = mock.tables['transactions']
    check('6 transactions total (1 manual + 5 imported)', len(tx) == 6, str(len(tx)))
    card = next(a for a in mock.tables['accounts'] if a['name'] == 'Card C')
    wallet = next(a for a in mock.tables['accounts'] if a['name'] == 'Wallet')
    check('CRED payment imported as transfer to the card', any(t['type'] == 'transfer' and t['to_account_id'] == card['id'] and t['amount_paise'] == 30000 for t in tx))
    check('ATM imported as transfer to cash', any(t['type'] == 'transfer' and t['to_account_id'] == wallet['id'] for t in tx))
    check('recipient memory reused (no duplicate Third Wave Coffee)', sum(1 for r in mock.tables['recipients'] if r['name'].lower() == 'third wave coffee') == 1)

    # 3. Same file again: mapping remembered, everything already imported
    choose('HDFC Savings · Bank', 'bank-oct.csv')
    expect(page.get_by_text('6 transactions', exact=True)).to_be_visible()
    check('second import skips mapping step', page.get_by_text('Which columns are which?').count() == 0)
    check('nothing to import the second time', page.get_by_role('button', name=re.compile('^Import 0 transactions')).is_disabled())
    check('rows shown as already imported', page.get_by_text('Already imported — skipped').count() >= 1)

    # 4. Card CSV with Dr/Cr: payment row matches the bank-side transfer
    choose('Card C · Credit card', 'card-oct.csv')
    expect(page.get_by_text('Which columns are which?')).to_be_visible()
    page.get_by_role('button', name='Continue to review').click()
    expect(page.get_by_text('4 transactions', exact=True)).to_be_visible()
    check('card payment flagged as possibly entered', page.get_by_text('Possibly already entered').count() == 1)
    page.get_by_role('button', name=re.compile('^Import 3 transactions')).click()
    expect(page.get_by_text('Imported 3 transactions')).to_be_visible()

    page.goto(BASE + '/?month=2026-10')
    expect(page.get_by_text('Balances today')).to_be_visible()
    text = page.locator('main').inner_text()
    check('bank balance matches the statement closing balance ₹5,459.50', '₹5,459.50' in text, text[:600])
    check('card outstanding ₹420', 'Outstanding ₹420' in text)
    shot('05-home-after-import')

    # 5. Undo the card import
    page.goto(BASE + '/import')
    page.once('dialog', lambda d: d.accept())
    page.locator('li', has_text='card-oct.csv').get_by_role('button', name='Undo').click()
    page.wait_for_timeout(600)
    check('undo removes exactly the card import', len(mock.tables['transactions']) == 6 and len(mock.tables['import_batches']) == 1)

    # 6. XLSX with real date and number cells; a transfer row needing an account blocks import until fixed
    choose('Wallet · Cash', 'wallet.xlsx')
    expect(page.get_by_text('Which columns are which?')).to_be_visible()
    page.get_by_role('button', name='Continue to review').click()
    expect(page.get_by_text('2 transactions', exact=True)).to_be_visible()
    text = page.locator('main').inner_text()
    check('xlsx amounts read exactly', '₹250.75' in text and '₹12.50' in text, text[:400])
    first = page.locator('li, tr').filter(has_text='SYNTH PHARMACY')
    first.get_by_label(re.compile('^Type')).select_option('transfer')
    page.get_by_role('button', name=re.compile('^Import 2 transactions')).click()
    expect(page.get_by_text('needs attention')).to_be_visible()
    check('unfinished transfer blocks import', len(mock.tables['import_batches']) == 1)
    first.get_by_label(re.compile('^Type')).select_option('expense')
    page.get_by_role('button', name=re.compile('^Import 2 transactions')).click()
    expect(page.get_by_text('Imported 2 transactions')).to_be_visible()
    check('xlsx imported', any(t['amount_paise'] == 25075 for t in mock.tables['transactions']))

    widths = []
    for path in ['/import', '/more']:
        page.goto(BASE + path); page.wait_for_timeout(300)
        widths.append((path, page.evaluate('document.documentElement.scrollWidth')))
    choose('HDFC Savings · Bank', 'bank-oct.csv'); expect(page.get_by_text('6 transactions', exact=True)).to_be_visible()
    widths.append(('review', page.evaluate('document.documentElement.scrollWidth')))
    check('no horizontal scrolling', all(w <= W for _, w in widths), str(widths))
    check('no console/page errors', not errors, '; '.join(errors[:3]))
    browser.close()

print(f"\n{sum(1 for _, ok in checks if ok)}/{len(checks)} checks passed")

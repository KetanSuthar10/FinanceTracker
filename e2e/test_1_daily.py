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
token = 'eyJhbGciOiJIUzI1NiJ9.' + b64({'sub': USER_ID, 'role': 'authenticated', 'exp': exp, 'email': 'ketan@example.com'}) + '.sig'
session = {'access_token': token, 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': exp,
           'user': {'id': USER_ID, 'email': 'ketan@example.com', 'aud': 'authenticated', 'role': 'authenticated',
                    'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-10-21T00:00:00Z'}}

FAKE_SPEECH = """
window.__speechText = '450 groceries yesterday';
class FakeRecognition {
  start() { setTimeout(() => {
    this.onresult && this.onresult({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, 0: { transcript: window.__speechText } } } });
    this.onend && this.onend();
  }, 150); }
  stop() {} abort() {}
}
window.webkitSpeechRecognition = FakeRecognition;
window.SpeechRecognition = FakeRecognition;
"""

mock = MockSupabase()
checks = []
def check(name, cond, detail=''):
    checks.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail and not cond else ''), flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': W, 'height': H})
    ctx.set_default_timeout(8000)
    ctx.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(session))})")
    ctx.add_init_script(FAKE_SPEECH)
    ctx.route(f'https://{REF}.supabase.co/**', mock.route)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'status of 503' not in m.text and 'status of 409' not in m.text and errors.append(m.text))

    def shot(name):
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(OUT, f'p1-{name}-{TAG}.png'), full_page=True)

    def main_text():
        return page.locator('main').inner_text()

    # 1. Fresh account: welcome state
    page.goto(BASE + '/')
    expect(page.get_by_text('Welcome! Start with your accounts')).to_be_visible()
    check('starter categories seeded', len(mock.tables['categories']) == 18)
    shot('01-welcome')

    # 2. Add accounts through the form
    def add_account(kind, name, amount, nickname=''):
        page.goto(BASE + '/accounts/new')
        page.get_by_role('radio', name=kind).click()
        page.get_by_label('Name', exact=True).fill(name)
        page.get_by_label('Starting date').fill('2026-09-30')
        page.get_by_label(re.compile('on that date')).fill(amount)
        if nickname: page.get_by_label(re.compile('Short name')).fill(nickname)
        page.get_by_role('button', name='Save', exact=True).click()
        expect(page.get_by_role('heading', name='Accounts')).to_be_visible()

    page.goto(BASE + '/accounts/new'); shot('02-account-form')
    add_account('Bank', 'HDFC Savings', '1000', 'hdfc')
    add_account('Bank', 'Bank B', '0')
    add_account('Cash', 'Cash', '200')
    add_account('Credit card', 'Card C', '0')
    check('4 accounts created', len(mock.tables['accounts']) == 4)
    card = next(a for a in mock.tables['accounts'] if a['name'] == 'Card C')
    check('first account became default', mock.tables['settings'][0]['default_account_id'] == mock.tables['accounts'][0]['id'])
    shot('03-accounts')

    # 3. Enter the reference fixture by quick text
    def quick(text, category=None, expect_type=None):
        page.goto(BASE + '/add')
        page.get_by_label('Quick add — type or speak').fill(text)
        page.get_by_label('Quick add — type or speak').press('Enter')
        if expect_type:
            expect(page.get_by_role('radio', name=expect_type)).to_have_attribute('aria-checked', 'true')
        if category:
            page.get_by_label('Category').select_option(label=category)
        page.get_by_role('button', name='Save', exact=True).click()
        expect(page.get_by_role('status').filter(has_text='Saved')).to_be_visible()

    quick('got 5000 salary on 1st', expect_type='Income')
    quick('120 cafe on 3rd', category='Food & dining')
    page.goto(BASE + '/add')
    page.get_by_label('Quick add — type or speak').fill('120 cafe on 3rd')
    page.get_by_label('Quick add — type or speak').press('Enter')
    check('recipient memory pre-fills Food & dining',
          page.get_by_label('Category').evaluate('el => el.options[el.selectedIndex].text') == 'Food & dining')
    shot('04-add-draft')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('status').filter(has_text='Saved')).to_be_visible()
    shot('05-add-saved')

    quick('120 pharmacy on 4th', category='Health')
    quick('60 parking cash on 4th', category='Transport')
    quick('800 groceries card on 5th')
    quick('paid card bill 300 on 7th', expect_type='Transfer')
    quick('withdrew 100 on 8th', expect_type='Transfer')
    quick('transfer 50 hdfc to bank b on 9th', expect_type='Transfer')
    quick('got 1000 freelance on 10th', expect_type='Income')
    quick('refund 100 groceries card on 12th', expect_type='Refund')
    quick('20 card fee on 14th')
    tx = mock.tables['transactions']
    check('12 transactions saved', len(tx) == 12, str(len(tx)))
    check('card bill is a transfer into the card', any(t['type'] == 'transfer' and t['to_account_id'] == card['id'] and t['amount_paise'] == 30000 for t in tx))
    fee = next((t for t in tx if t['amount_paise'] == 2000), None)
    cats = {c['id']: c['name'] for c in mock.tables['categories']}
    check('card fee categorised as Fees & interest', fee and cats.get(fee['category_id']) == 'Fees & interest' and fee['account_id'] == card['id'])

    # 4. Home shows the documented October numbers
    page.goto(BASE + '/?month=2026-10')
    expect(page.get_by_text('Balances today')).to_be_visible()
    text = main_text()
    for label, value in [('income', '₹6,000'), ('spending', '₹1,140'), ('saved', '₹4,860'), ('money in hand', '₹6,480'),
                         ('card outstanding', 'Outstanding ₹420'), ('HDFC balance', '₹6,190'), ('net position', '₹6,060'),
                         ('groceries net of refund', '₹700')]:
        check(f'home shows {label} {value}', value in text, text[:400])
    shot('06-home')

    # 5. Transactions list + filters
    page.goto(BASE + '/transactions?month=2026-10')
    expect(page.get_by_text('12 transactions')).to_be_visible()
    shot('07-transactions')
    page.get_by_label('Filter by type').select_option('transfer')
    expect(page.get_by_text('3 transactions')).to_be_visible()
    page.get_by_label('Filter by type').select_option('')
    page.get_by_label('Search by name or note').fill('cafe')
    expect(page.get_by_text('2 transactions')).to_be_visible()
    check('filters and search work', True)

    page.goto(BASE + '/?month=2026-10')
    page.get_by_role('link', name=re.compile('^Groceries')).first.click()
    expect(page.get_by_text('2 transactions')).to_be_visible()
    check('home category links to filtered transactions', 'category=' in page.url)

    # 6. Edit a transaction: pharmacy 120 -> 150, spending becomes 1,170
    page.goto(BASE + '/transactions?month=2026-10&q=pharmacy')
    page.get_by_role('link', name=re.compile('Pharmacy')).click()
    expect(page.get_by_role('heading', name='Edit transaction')).to_be_visible()
    shot('08-edit')
    page.get_by_label('Amount (₹)').fill('150')
    page.get_by_role('button', name='Save changes').click()
    page.wait_for_timeout(400)
    page.goto(BASE + '/?month=2026-10')
    expect(page.get_by_text('Balances today')).to_be_visible()
    check('edit updates spending to ₹1,170', '₹1,170' in main_text())

    # 7. Validation: empty amount is refused, nothing written
    before = len(mock.tables['transactions'])
    page.goto(BASE + '/add')
    page.get_by_label('Quick add — type or speak').fill('coffee')
    page.get_by_label('Quick add — type or speak').press('Enter')
    expect(page.get_by_text('Please fill in: amount')).to_be_visible()
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_text('Enter an amount like 120 or 120.50.')).to_be_visible()
    check('invalid entry not written', len(mock.tables['transactions']) == before)
    shot('09-validation')

    # 8. Server failure: keeps the form, shows a readable error
    page.get_by_label('Amount (₹)').fill('99')
    mock.fail_next = ('POST', 'transactions')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_text('Not saved')).to_be_visible()
    check('failed save keeps input', page.get_by_label('Amount (₹)').input_value() == '99')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('status').filter(has_text='Saved')).to_be_visible()
    check('retry after failure saves once', len(mock.tables['transactions']) == before + 1)

    # 9. Delete it again
    coffee = next(t for t in mock.tables['transactions'] if t['amount_paise'] == 9900)
    page.goto(BASE + f'/transactions/{coffee["id"]}')
    page.once('dialog', lambda d: d.accept())
    page.get_by_role('button', name='Delete').click()
    expect(page.get_by_role('heading', name='Transactions')).to_be_visible()
    check('delete removes the transaction', all(t['id'] != coffee['id'] for t in mock.tables['transactions']))

    # 10. Voice: mic -> transcript -> draft
    page.goto(BASE + '/add')
    page.get_by_role('button', name='Speak').click()
    expect(page.get_by_label('Amount (₹)')).to_have_value('450')
    check('voice fills the draft', page.get_by_label('Quick add — type or speak').input_value() == '450 groceries yesterday')
    check('voice picks Groceries', page.get_by_label('Category').evaluate('el => el.options[el.selectedIndex].text') == 'Groceries')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('status').filter(has_text='Saved')).to_be_visible()
    check('voice entries are marked as voice', mock.tables['transactions'][-1]['source'] == 'voice')

    # 11. Other screens
    for path, name in [('/categories', '10-categories'), ('/recipients', '11-recipients'), ('/settings', '12-settings'), ('/more', '13-more')]:
        page.goto(BASE + path); page.wait_for_timeout(400); shot(name)
    page.goto(BASE + '/recipients')
    page.get_by_role('link', name=re.compile('^Cafe')).click()
    page.get_by_label(re.compile('Other names')).fill('ccd, coffee day')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('heading', name='Recipients')).to_be_visible()
    cafe = next(r for r in mock.tables['recipients'] if r['name'] == 'Cafe')
    check('recipient aliases saved', cafe['aliases'] == ['ccd', 'coffee day'])
    page.goto(BASE + '/add')
    page.get_by_label('Quick add — type or speak').fill('90 ccd')
    page.get_by_label('Quick add — type or speak').press('Enter')
    check('alias matches remembered recipient', page.get_by_label('Paid to').input_value() == 'Cafe')

    page.goto(BASE + '/categories')
    page.get_by_label('New spending category').fill('Groceries')
    page.get_by_role('button', name='Add').first.click()
    expect(page.get_by_text('already used')).to_be_visible()
    check('duplicate category name explained', True)

    widths = []
    for path in ['/', '/transactions', '/add', '/accounts', '/accounts/new', '/categories', '/recipients', '/settings', '/more']:
        page.goto(BASE + path + ('?month=2026-10' if path in ['/', '/transactions'] else '')); page.wait_for_timeout(300)
        widths.append((path, page.evaluate('document.documentElement.scrollWidth')))
    check('no horizontal scrolling', all(w <= W for _, w in widths), str(widths))
    check('no console/page errors', not errors, '; '.join(errors[:3]))
    browser.close()

failed = [c for c in checks if not c[1]]
print(f'\n{len(checks) - len(failed)}/{len(checks)} checks passed')

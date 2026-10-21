"""Phase 2 browser checks: reminders, mark as paid, skip, card bill shortcut, budgets, Home cards."""
import os, json, sys, time, base64, re, datetime
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
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
TODAY = datetime.datetime.now(IST).date()

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
    ctx.set_default_timeout(8000)
    ctx.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(session))})")
    ctx.route(f'https://{REF}.supabase.co/**', mock.route)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'status of 4' not in m.text and errors.append(m.text))

    def shot(name):
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(OUT, f'p2-{name}-{TAG}.png'), full_page=True)

    def add_account(kind, name, amount, due_day=''):
        page.goto(BASE + '/accounts/new')
        page.get_by_role('radio', name=kind).click()
        page.get_by_label('Name', exact=True).fill(name)
        page.get_by_label('Starting date').fill((TODAY - datetime.timedelta(days=40)).isoformat())
        page.get_by_label(re.compile('on that date')).fill(amount)
        if due_day: page.get_by_label(re.compile('Bill due day')).fill(due_day)
        page.get_by_role('button', name='Save', exact=True).click()
        expect(page.get_by_role('heading', name='Accounts')).to_be_visible()

    page.goto(BASE + '/')
    expect(page.get_by_text('Welcome! Start with your accounts')).to_be_visible()
    card_due = (TODAY + datetime.timedelta(days=2)).day
    add_account('Bank', 'HDFC Savings', '50000')
    add_account('Credit card', 'ICICI Card', '0', str(card_due))

    # 1. Create reminders
    rent_day = (TODAY + datetime.timedelta(days=3)).day
    def add_reminder(name, amount, day, category=None, instalments=''):
        page.goto(BASE + '/recurring/new')
        page.get_by_label('Name', exact=True).fill(name)
        page.get_by_label('Amount (₹)').fill(amount)
        page.get_by_label('Day of the month').fill(str(day))
        if category: page.get_by_label('Category').select_option(label=category)
        if instalments: page.get_by_label(re.compile('Payments left')).fill(instalments)
        page.get_by_role('button', name='Save', exact=True).click()
        expect(page.get_by_role('heading', name='Upcoming')).to_be_visible()

    page.goto(BASE + '/recurring/new'); shot('01-reminder-form')
    add_reminder('Rent', '15000', rent_day, 'Rent')
    add_reminder('Phone EMI', '2000', 28, 'Loan EMI', '3')
    check('two reminders saved', len(mock.tables['recurring_items']) == 2)
    rent = next(i for i in mock.tables['recurring_items'] if i['name'] == 'Rent')
    first_due = rent['next_due_date']
    check('first due date filled from the day', first_due == (TODAY + datetime.timedelta(days=3)).isoformat(), first_due)

    # 2. Card purchase so the card bill has an outstanding amount
    page.goto(BASE + '/add')
    page.get_by_label('Quick add — type or speak').fill('500 shoes card')
    page.get_by_label('Quick add — type or speak').press('Enter')
    page.get_by_label('Category').select_option(label='Shopping')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('status').filter(has_text='Saved')).to_be_visible()

    page.goto(BASE + '/upcoming')
    expect(page.get_by_text('ICICI Card bill')).to_be_visible()
    text = page.locator('main').inner_text()
    check('upcoming lists rent, EMI and card bill', 'Rent' in text and 'Phone EMI' in text and 'Outstanding ₹500' in text, text[:300])
    shot('02-upcoming')

    # 3. Mark rent as paid
    page.get_by_role('link', name='Mark as paid').first.click()
    expect(page.get_by_role('heading', name='Pay Rent')).to_be_visible()
    check('pay form pre-filled', page.get_by_label('Amount (₹)').input_value() == '15000')
    shot('03-pay')
    page.get_by_role('button', name='Save payment').click()
    expect(page.get_by_role('heading', name='Upcoming')).to_be_visible()
    paid = [t for t in mock.tables['transactions'] if t.get('recurring_item_id') == rent['id']]
    check('rent payment recorded once, as recurring', len(paid) == 1 and paid[0]['source'] == 'recurring' and paid[0]['amount_paise'] == 1500000)
    check('rent moved to next month', rent['next_due_date'] > first_due, rent['next_due_date'])

    # 4. Skip the EMI: date moves, count unchanged
    emi = next(i for i in mock.tables['recurring_items'] if i['name'] == 'Phone EMI')
    emi_due = emi['next_due_date']
    page.goto(BASE + '/upcoming')
    page.once('dialog', lambda d: d.accept())
    row = page.locator('li', has_text='Phone EMI').filter(has=page.get_by_role('button', name='Skip'))
    row.get_by_role('button', name='Skip').click()
    page.wait_for_timeout(500)
    check('skip moves EMI date, keeps 3 left', emi['next_due_date'] > emi_due and emi['instalments_left'] == 3, str(emi))

    # 5. Card bill shortcut: pre-filled transfer clears the card
    page.goto(BASE + '/upcoming')
    page.get_by_role('link', name='Record payment').click()
    expect(page.get_by_role('radio', name='Transfer')).to_have_attribute('aria-checked', 'true')
    check('card bill amount pre-filled', page.get_by_label('Amount (₹)').input_value() == '500')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('status').filter(has_text='Saved')).to_be_visible()
    page.goto(BASE + '/accounts')
    expect(page.get_by_text('Nothing owed')).to_be_visible()
    check('card cleared after bill payment', True)

    # 6. Budgets
    page.goto(BASE + '/budgets')
    page.get_by_label('Monthly limit for Groceries').fill('1000')
    page.locator('li', has_text='Groceries').get_by_role('button', name='Save').click()
    page.wait_for_timeout(400)
    check('budget saved', any(b['monthly_limit_paise'] == 100000 for b in mock.tables['budgets']))
    page.goto(BASE + '/add')
    page.get_by_label('Quick add — type or speak').fill('900 groceries')
    page.get_by_label('Quick add — type or speak').press('Enter')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('status').filter(has_text='Saved')).to_be_visible()
    page.goto(BASE + '/budgets'); expect(page.get_by_text('Near limit · 90%')).to_be_visible(); shot('04-budgets')
    check('budget shows near limit at 90%', True)

    # 7. Home shows due-soon, budgets and trend
    page.goto(BASE + '/')
    expect(page.get_by_text('Due in the next 7 days')).to_be_visible()
    text = page.locator('main').inner_text()
    check('home: card bill due soon', 'ICICI Card bill' in text)
    check('home: budget card', 'Near limit · 90%' in text)
    check('home: trend card', 'This month so far' in text and 'Out ₹16,400' in text, text[-600:])
    shot('05-home')

    widths = []
    for path in ['/', '/upcoming', '/recurring/new', f'/recurring/{rent["id"]}', f'/recurring/{rent["id"]}/pay', '/budgets']:
        page.goto(BASE + path); page.wait_for_timeout(300)
        widths.append((path, page.evaluate('document.documentElement.scrollWidth')))
    check('no horizontal scrolling', all(w <= W for _, w in widths), str(widths))
    check('no console/page errors', not errors, '; '.join(errors[:3]))
    browser.close()

print(f"\n{sum(1 for _, ok in checks if ok)}/{len(checks)} checks passed")

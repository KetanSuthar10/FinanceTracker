"""Voice input: long sentences in several pieces, Android repeats, pause-to-finish, stop button, network errors."""
import os, sys, json, time, base64, re
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright, expect
from mock_supabase import MockSupabase, USER_ID

REF = 'abcdefghijklmnopqrst'
BASE = os.environ.get('BASE', 'http://localhost:4108')
W, H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (360, 760)

def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
exp = int(time.time()) + 3600
token = 'eyJhbGciOiJIUzI1NiJ9.' + b64({'sub': USER_ID, 'role': 'authenticated', 'exp': exp}) + '.sig'
session = {'access_token': token, 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': exp,
           'user': {'id': USER_ID, 'email': 'ketan@example.com', 'aud': 'authenticated', 'role': 'authenticated',
                    'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-10-21T00:00:00Z'}}

# A stand-in for the browser's recogniser. window.__mode picks the behaviour; window.__instances counts starts.
FAKE = """
window.__mode = 'long'; window.__instances = 0; window.__continuous = null;
class FakeRecognition {
  start() {
    window.__instances++; window.__continuous = this.continuous;
    const mode = window.__mode, n = window.__instances;
    const emit = (pieces) => this.onresult && this.onresult({ resultIndex: 0, results: Object.assign(
      { length: pieces.length }, pieces.map(([t, f]) => ({ isFinal: f, 0: { transcript: t } })) ) });
    const end = () => { if (!this.ended) { this.ended = true; this.onend && this.onend(); } };
    this.timers = [];
    const at = (ms, fn) => this.timers.push(setTimeout(fn, ms));
    if (mode === 'long' || (mode === 'network-once' && n === 2)) {
      at(100, () => emit([['paid four hundred fifty rupees', false]]));
      at(300, () => emit([['paid four hundred fifty rupees for groceries', true]]));
      at(700, () => emit([['paid four hundred fifty rupees for groceries', true], [' at dmart yesterday', false]]));
      at(900, () => emit([['paid four hundred fifty rupees for groceries', true], [' at dmart yesterday from hdfc', true]]));
      // Like Chrome in continuous mode: keeps listening until stop() is called.
    } else if (mode === 'android') {
      at(100, () => emit([['paid 450', true]]));
      at(400, () => emit([['paid 450', true], ['paid 450 for groceries at dmart', true]]));
    } else if (mode.startsWith('network')) {
      at(100, () => { this.onerror && this.onerror({ error: 'network' }); end(); });
    }
  }
  stop() { this.timers.forEach(clearTimeout); setTimeout(() => this.onend && !this.ended && (this.ended = true, this.onend()), 50); }
  abort() { this.stop(); }
}
window.webkitSpeechRecognition = FakeRecognition;
window.SpeechRecognition = FakeRecognition;
"""

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
    ctx.add_init_script(FAKE)
    ctx.route(f'https://{REF}.supabase.co/**', mock.route)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))

    page.goto(BASE + '/accounts/new')
    page.get_by_role('radio', name='Bank').click()
    page.get_by_label('Name', exact=True).fill('HDFC Savings')
    page.get_by_label('Starting date').fill('2026-09-30')
    page.get_by_label(re.compile('on that date')).fill('1000')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('heading', name='Accounts')).to_be_visible()

    quick = page.get_by_label('Quick add — type or speak')
    def speak(mode):
        page.goto(BASE + '/add')
        page.evaluate(f"window.__mode = '{mode}'; window.__instances = 0")
        page.get_by_role('button', name='Speak').click()

    # 1. A long sentence arriving in pieces; listening ends by itself after a pause.
    speak('long')
    page.wait_for_timeout(1000)
    check('keeps listening between pieces', page.get_by_role('button', name='Stop listening').is_visible())
    check('shows the words live while listening', 'at dmart yesterday from hdfc' in quick.input_value(), quick.input_value())
    expect(page.get_by_role('button', name='Speak')).to_be_visible(timeout=6000)
    sentence = 'paid four hundred fifty rupees for groceries at dmart yesterday from hdfc'
    check('whole 12-word sentence is kept', quick.input_value() == sentence, quick.input_value())
    check('continuous listening is on', page.evaluate('window.__continuous') is True)
    expect(page.get_by_label('Amount (₹)')).to_have_value('450')
    check('draft: Groceries category', page.get_by_label('Category').evaluate('el => el.options[el.selectedIndex].text') == 'Groceries')
    check('draft: shop name without the category word', page.get_by_label('Paid to').input_value().lower() == 'dmart', page.get_by_label('Paid to').input_value())

    # 2. Tapping stop early keeps what was heard so far.
    speak('long')
    page.wait_for_timeout(450)
    page.get_by_role('button', name='Stop listening').click()
    expect(page.get_by_role('button', name='Speak')).to_be_visible()
    check('stop keeps the words heard so far', quick.input_value() == 'paid four hundred fifty rupees for groceries', quick.input_value())

    # 3. Android-style repeats are not doubled.
    speak('android')
    expect(page.get_by_role('button', name='Speak')).to_be_visible(timeout=6000)
    check('android repeats are not doubled', quick.input_value() == 'paid 450 for groceries at dmart', quick.input_value())

    # 4. A one-off network hiccup is retried silently.
    speak('network-once')
    expect(page.get_by_role('button', name='Speak')).to_be_visible(timeout=8000)
    check('network hiccup retried once', page.evaluate('window.__instances') == 2)
    check('text arrives after the retry, no error', quick.input_value() == sentence and page.get_by_text('speech service').count() == 0, quick.input_value())

    # 5. A browser that can never reach the speech service gets a useful message.
    speak('network-always')
    expect(page.get_by_text(re.compile('couldn’t reach its speech service'))).to_be_visible()
    check('persistent network error explains what to do', page.get_by_text(re.compile('Chrome, Edge or Safari')).is_visible())
    check('gives up after one retry', page.evaluate('window.__instances') == 2)

    check('no page errors', not errors, '; '.join(errors[:2]))
    browser.close()

print(f"\n{sum(1 for _, ok in checks if ok)}/{len(checks)} checks passed")

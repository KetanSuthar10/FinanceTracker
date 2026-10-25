"""
In-memory stand-in for the parts of Supabase's REST API the app uses, for browser tests.
Not shipped with the app. Mirrors: filters eq/neq/gte/lte/is, order, offset/limit,
single/maybeSingle, insert/update/delete with return=representation, upsert, rpc.
"""
import json, uuid, datetime, base64, time
from urllib.parse import urlparse, parse_qsl

USER_ID = '11111111-1111-1111-1111-111111111111'

STARTER = [
    ('Food & dining', 'expense'), ('Groceries', 'expense'), ('Transport', 'expense'), ('Fuel', 'expense'),
    ('Shopping', 'expense'), ('Bills & utilities', 'expense'), ('Rent', 'expense'), ('Health', 'expense'),
    ('Entertainment', 'expense'), ('Travel', 'expense'), ('Education', 'expense'), ('Fees & interest', 'expense'),
    ('Loan EMI', 'expense'), ('Other', 'expense'), ('Salary', 'income'), ('Freelance', 'income'),
    ('Interest', 'income'), ('Other income', 'income'),
]

DEFAULTS = {
    'accounts': {'nickname': None, 'card_due_day': None, 'archived': False, 'opening_balance_paise': 0},
    'categories': {'archived': False},
    'recipients': {'aliases': [], 'default_category_id': None},
    'transactions': {'to_account_id': None, 'category_id': None, 'recipient_id': None, 'note': None,
                     'source': 'manual', 'import_batch_id': None, 'import_hash': None, 'recurring_item_id': None},
    'settings': {'default_account_id': None},
    'recurring_items': {'to_account_id': None, 'category_id': None, 'instalments_left': None, 'active': True},
    'budgets': {}, 'import_batches': {}, 'import_mappings': {},
}
UNIQUE = {'accounts': [('name',)], 'categories': [('name', 'kind')], 'recipients': [('name',)],
          'settings': [('user_id',)], 'budgets': [('category_id',)], 'import_mappings': [('account_id',)],
          'transactions': [('account_id', 'import_hash')]}


class MockSupabase:
    def __init__(self):
        self.tables = {t: [] for t in DEFAULTS}
        self.log = []
        self.fail_next = None  # (method, table) -> respond 500 once

    # -- helpers -----------------------------------------------------------
    def now(self):
        return datetime.datetime.now(datetime.timezone.utc).isoformat()

    def err(self, status, code, message):
        return status, {'code': code, 'message': message, 'details': None, 'hint': None}

    @staticmethod
    def as_text(v):
        return 'true' if v is True else 'false' if v is False else 'null' if v is None else str(v)

    def match(self, row, filters):
        for col, expr in filters:
            if col == '__or__':
                parts = expr.strip('()').split(',')
                if not any(self.match(row, [tuple(p.split('.', 1))]) for p in parts): return False
                continue
            op, _, val = expr.partition('.')
            cur = row.get(col)
            if op == 'eq' and self.as_text(cur) != val: return False
            if op == 'neq' and self.as_text(cur) == val: return False
            if op == 'gte' and not (cur is not None and str(cur) >= val): return False
            if op == 'lte' and not (cur is not None and str(cur) <= val): return False
            if op == 'is' and val == 'null' and cur is not None: return False
        return True

    def project(self, row, select):
        if not select or select.strip() == '*':
            return dict(row)
        cols = [c.strip() for c in select.split(',')]
        return {c: row.get(c) for c in cols}

    def unique_violation(self, table, row, ignore_id=None):
        for cols in UNIQUE.get(table, []):
            if any(row.get(c) is None for c in cols): continue
            for other in self.tables[table]:
                if other.get('id') == ignore_id and ignore_id is not None: continue
                if all(other.get(c) == row.get(c) for c in cols):
                    return True
        return False

    def check_transaction(self, row):
        ids = {a['id'] for a in self.tables['accounts']}
        if row['account_id'] not in ids: return '23503'
        if row.get('to_account_id') and row['to_account_id'] not in ids: return '23503'
        if (row['type'] == 'transfer') != bool(row.get('to_account_id')): return '23514'
        if row.get('to_account_id') == row['account_id']: return '23514'
        if not isinstance(row['amount_paise'], int) or row['amount_paise'] <= 0: return '23514'
        if row['type'] == 'transfer' and row.get('category_id'): return '23514'
        return None

    # -- rpc ---------------------------------------------------------------
    def rpc(self, name, args):
        if name == 'ensure_starter_data':
            if not self.tables['categories']:
                for n, k in STARTER:
                    self.tables['categories'].append({'id': str(uuid.uuid4()), 'user_id': USER_ID, 'name': n, 'kind': k,
                                                      'archived': False, 'created_at': self.now()})
            if not self.tables['settings']:
                self.tables['settings'].append({'user_id': USER_ID, 'default_account_id': None})
            return 200, None
        if name == 'account_totals':
            before = (args or {}).get('p_before')
            out = []
            for a in self.tables['accounts']:
                t = {'account_id': a['id'], 'income_in_paise': 0, 'refund_in_paise': 0, 'expense_out_paise': 0,
                     'transfer_in_paise': 0, 'transfer_out_paise': 0}
                for x in self.tables['transactions']:
                    if x['date'] < a['opening_date'] or (before and x['date'] >= before): continue
                    amt = x['amount_paise']
                    if x['account_id'] == a['id']:
                        key = {'income': 'income_in_paise', 'refund': 'refund_in_paise',
                               'expense': 'expense_out_paise', 'transfer': 'transfer_out_paise'}[x['type']]
                        t[key] += amt
                    if x['type'] == 'transfer' and x.get('to_account_id') == a['id']:
                        t['transfer_in_paise'] += amt
                out.append(t)
            return 200, out
        if name in ('pay_recurring', 'skip_recurring'):
            item = next((i for i in self.tables['recurring_items'] if i['id'] == args['p_item_id']), None)
            if not item: return self.err(400, 'P0002', 'Recurring item not found')
            if item['next_due_date'] != args['p_expected_due']:
                return self.err(400, 'P0001', 'This payment was already recorded')
            tx_id = None
            if name == 'pay_recurring':
                if not item['active']: return self.err(400, 'P0001', 'This reminder is paused or finished')
                tx = {k: v for k, v in args['p_tx'].items()}
                row = {'id': str(uuid.uuid4()), 'user_id': USER_ID, 'created_at': self.now(), **DEFAULTS['transactions'],
                       **tx, 'source': 'recurring', 'recurring_item_id': item['id']}
                code = self.check_transaction(row)
                if code: return self.err(400, code, 'violates constraint')
                self.tables['transactions'].append(row); tx_id = row['id']
                if item.get('instalments_left') is not None:
                    item['instalments_left'] -= 1
                    item['active'] = item['instalments_left'] > 0
            d = datetime.date.fromisoformat(item['next_due_date'])
            y, m = (d.year + (d.month // 12), d.month % 12 + 1)
            import calendar
            item['next_due_date'] = datetime.date(y, m, min(item['day_of_month'], calendar.monthrange(y, m)[1])).isoformat()
            return 200, tx_id
        if name == 'restore_backup':
            if self.tables['accounts'] or self.tables['transactions']:
                return self.err(400, 'P0001', 'Restore only works on an empty app (no accounts or transactions yet)')
            data = args['p_data']
            for t in ['budgets', 'recurring_items', 'import_mappings', 'import_batches', 'recipients', 'settings', 'categories']:
                self.tables[t] = []
            for t in ['accounts', 'categories', 'recipients', 'import_batches', 'recurring_items', 'transactions', 'budgets', 'import_mappings']:
                for row in data.get(t, []):
                    self.tables[t].append({'user_id': USER_ID, 'created_at': self.now(), **row})
            self.tables['settings'] = [{'user_id': USER_ID, 'default_account_id': (data.get('settings') or {}).get('default_account_id')}]
            return 200, {'accounts': len(self.tables['accounts']), 'transactions': len(self.tables['transactions'])}
        if name == 'commit_import':
            batches = self.tables['import_batches']
            existing = next((b for b in batches if b['id'] == args['p_batch_id']), None)
            if existing: return 200, {'batch_id': existing['id'], 'added': existing['added_count'], 'already_done': True}
            new_rows = []
            for r in args['p_rows']:
                if any(t.get('import_hash') == r['import_hash'] and t['account_id'] == r['account_id'] for t in self.tables['transactions']):
                    return self.err(409, '23505', 'duplicate key value violates unique constraint')
                rid = r.get('recipient_id')
                if not rid and r.get('recipient_name'):
                    hit = next((x for x in self.tables['recipients'] if x['name'].lower() == r['recipient_name'].lower()), None)
                    if not hit:
                        hit = {'id': str(uuid.uuid4()), 'user_id': USER_ID, 'name': r['recipient_name'], 'aliases': [],
                               'default_category_id': r.get('category_id'), 'created_at': self.now()}
                        self.tables['recipients'].append(hit)
                    rid = hit['id']
                row = {'id': str(uuid.uuid4()), 'user_id': USER_ID, 'created_at': self.now(), **DEFAULTS['transactions'],
                       'date': r['date'], 'type': r['type'], 'amount_paise': r['amount_paise'], 'account_id': r['account_id'],
                       'to_account_id': r.get('to_account_id'), 'category_id': r.get('category_id'), 'recipient_id': rid,
                       'note': r.get('note'), 'source': 'import', 'import_batch_id': args['p_batch_id'], 'import_hash': r['import_hash']}
                code = self.check_transaction(row)
                if code: return self.err(400, code, 'violates check constraint')
                new_rows.append(row)
            self.tables['transactions'].extend(new_rows)
            batches.append({'id': args['p_batch_id'], 'user_id': USER_ID, 'account_id': args['p_account_id'], 'file_name': args['p_file_name'],
                            'row_count': args['p_row_count'], 'added_count': len(new_rows), 'skipped_count': args['p_skipped_count'],
                            'created_at': self.now()})
            return 200, {'batch_id': args['p_batch_id'], 'added': len(new_rows), 'already_done': False}
        return self.err(404, 'PGRST202', f'Could not find the function {name}')

    # -- auth: public settings and email + password sign-in --------------
    PASSWORD = ('owner@example.com', 'correct-horse-42')
    google_enabled = False

    def auth(self, method, path, query, body):
        if path == '/auth/v1/settings':
            return 200, {'external': {'email': True, 'google': self.google_enabled}, 'disable_signup': True}
        if path == '/auth/v1/token' and 'grant_type=password' in query:
            creds = json.loads(body or '{}')
            if (creds.get('email'), creds.get('password')) != self.PASSWORD:
                return 400, {'code': 'invalid_credentials', 'error_code': 'invalid_credentials', 'msg': 'Invalid login credentials',
                             'message': 'Invalid login credentials'}
            exp = int(time.time()) + 3600
            b64 = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
            token = 'eyJhbGciOiJIUzI1NiJ9.' + b64({'sub': USER_ID, 'role': 'authenticated', 'exp': exp}) + '.sig'
            return 200, {'access_token': token, 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': exp,
                         'user': {'id': USER_ID, 'email': creds['email'], 'aud': 'authenticated', 'role': 'authenticated',
                                  'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-10-21T00:00:00Z'}}
        return 204, None

    # -- main entry --------------------------------------------------------
    def handle(self, method, url, headers, body):
        u = urlparse(url)
        path = u.path
        self.log.append((method, path))
        if path.startswith('/auth/v1/'):
            return self.auth(method, path, u.query, body)
        if not path.startswith('/rest/v1/'):
            return 404, {'message': 'not found'}
        name = path[len('/rest/v1/'):]
        params = parse_qsl(u.query, keep_blank_values=True)
        payload = json.loads(body) if body else None

        if self.fail_next and self.fail_next == (method, name):
            self.fail_next = None
            return 503, {'message': 'Failed to fetch', 'code': ''}

        if name.startswith('rpc/'):
            return self.rpc(name[4:], payload)

        table = self.tables.get(name)
        if table is None:
            return self.err(404, '42P01', f'relation {name} does not exist')

        select = None; order = None; offset = 0; limit = None; on_conflict = None
        filters = []
        for k, v in params:
            if k == 'select': select = v
            elif k == 'order': order = v
            elif k == 'offset': offset = int(v)
            elif k == 'limit': limit = int(v)
            elif k == 'on_conflict': on_conflict = v
            elif k == 'columns': pass
            elif k == 'or': filters.append(('__or__', v))
            else: filters.append((k, v))
        wants_object = 'vnd.pgrst.object' in (headers.get('accept') or '')

        def respond(rows):
            rows = [self.project(r, select) for r in rows]
            if wants_object:
                if len(rows) != 1:
                    return self.err(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned')
                return 200, rows[0]
            return 200, rows

        if method == 'GET':
            rows = [r for r in table if self.match(r, filters)]
            if order:
                for part in reversed(order.split(',')):
                    col, _, direction = part.partition('.')
                    rows.sort(key=lambda r: (r.get(col) is None, str(r.get(col))), reverse=direction.startswith('desc'))
            rows = rows[offset: offset + limit if limit else None]
            return respond(rows)

        if method == 'POST':
            items = payload if isinstance(payload, list) else [payload]
            created = []
            for item in items:
                row = {'user_id': USER_ID, 'created_at': self.now(), **DEFAULTS.get(name, {}), **item}
                if name != 'settings': row.setdefault('id', str(uuid.uuid4()))
                if name == 'transactions':
                    code = self.check_transaction(row)
                    if code: return self.err(400 if code == '23514' else 409, code, f'violates constraint ({code})')
                if self.unique_violation(name, row):
                    if on_conflict:
                        keys = on_conflict.split(',')
                        for other in table:
                            if all(other.get(k) == row.get(k) for k in keys if k != 'user_id'):
                                other.update(item); created.append(other)
                        continue
                    return self.err(409, '23505', 'duplicate key value violates unique constraint')
                table.append(row); created.append(row)
            return respond(created) if 'return=representation' in (headers.get('prefer') or '') else (201, None)

        if method == 'PATCH':
            rows = [r for r in table if self.match(r, filters)]
            for r in rows:
                candidate = {**r, **payload}
                if self.unique_violation(name, candidate, ignore_id=r.get('id')):
                    return self.err(409, '23505', 'duplicate key value violates unique constraint')
                if name == 'transactions':
                    code = self.check_transaction(candidate)
                    if code: return self.err(400, code, f'violates constraint ({code})')
            for r in rows: r.update(payload)
            return respond(rows)

        if method == 'DELETE':
            rows = [r for r in table if self.match(r, filters)]
            if name == 'accounts':
                for r in rows:
                    if any(t['account_id'] == r['id'] or t.get('to_account_id') == r['id'] for t in self.tables['transactions']):
                        return self.err(409, '23503', 'still referenced')
            if name == 'recipients':
                ids = {r['id'] for r in rows}
                for t in self.tables['transactions']:
                    if t.get('recipient_id') in ids: t['recipient_id'] = None
            if name == 'import_batches':
                ids = {r['id'] for r in rows}
                self.tables['transactions'] = [t for t in self.tables['transactions'] if t.get('import_batch_id') not in ids]
            for r in rows: table.remove(r)
            return respond(rows)

        return 405, {'message': 'method not allowed'}

    CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
            'access-control-allow-methods': '*', 'access-control-expose-headers': '*'}

    def route(self, route):
        req = route.request
        if req.method == 'OPTIONS':
            route.fulfill(status=204, headers=self.CORS, body='')
            return
        status, body = self.handle(req.method, req.url, req.headers, req.post_data)
        headers = {'content-type': 'application/json', **self.CORS}
        if status == 204:
            route.fulfill(status=204, headers=headers, body='')
        else:
            route.fulfill(status=status, headers=headers, body=json.dumps(body))

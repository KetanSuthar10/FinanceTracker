# Browser tests

These drive the real built app in Chromium (via Playwright for Python) at phone (360px) and laptop (1366px) widths.
Supabase is replaced by `mock_supabase.py`, a small in-memory imitation of the REST/RPC calls the app makes, so the
tests need no accounts or network. They check whole flows and the exact money figures from `docs/MONEY_RULES.md`.

They complement, and do not replace:

- `npm test`, which includes the database tests that run the real SQL migrations in PGlite;
- trying the app against your real Supabase project.

The mock imitates the database functions in `supabase/migrations/`. If you change one of those functions, update the mock too.

## Run

```bash
pip install playwright && python -m playwright install chromium
./e2e/run.sh          # builds the app, serves it on :4108, runs every test at phone and laptop width, plus test_6 at 1024 / 1366 / 1920
```

Screenshots are written to `e2e/out/` (ignored by Git). All data here is synthetic.

| File | Covers |
| --- | --- |
| `test_1_daily.py` | Accounts, quick add (text + simulated voice), recipient memory and aliases, the reference fixture totals, edit/delete, validation, failed save + retry |
| `test_2_bills.py` | Reminders, mark as paid, skip, card bill payment shortcut, budgets, Home cards |
| `test_3_import.py` | CSV and .xlsx statement import, mapping memory, duplicates, undo, PDF refusal |
| `test_4_backup.py` | Backup download, CSV export, restore into an empty app, tampered backup |
| `test_5_polish.py` | Dark mode, offline banner and offline reload, service worker caches, icons, skip link |
| `test_7_signin.py` | Email + password sign-in, plain errors, Google button only when switched on, the database-not-set-up message |
| `test_8_voice.py` | Voice: long sentences in pieces, pause to finish, stop button, Android repeats, network retry and message |
| `test_6_desktop.py` | Computer layout: N and / shortcuts, transactions table, Add side panel, Home columns, import table, no sideways scrolling (computer widths only) |

# Roadmap and status

This is the only status file. Tick a box only after it has been checked in the running app (not just because a unit test passed). Each phase ends with something you can actually use.

Status key: ⬜ not started · 🟨 in progress · ✅ done

## Phase 0 — Setup 🟨 (code done; owner setup pending)
- [x] Vite + React + TS + Tailwind + Router + TanStack Query + Zod + Vitest, versions pinned
- [x] ESLint; `npm run check` runs typecheck + lint + tests
- [x] GitHub Actions workflow: install, check, build on every push (runs once pushed)
- [x] Full schema migration with RLS, composite ownership keys, `account_totals`, starter categories
- [x] Schema tested in PGlite: fixture balances, period opening, RLS isolation, constraints
- [x] "Not configured" screen; secret keys refused
- [x] Google sign-in screen, app shell (phone bottom nav / laptop sidebar), empty Home, More with sign-out
- [x] Checked in a headless browser at 360px and 1366px with a simulated session (no live Supabase)
- [ ] Owner: Supabase project created and migration applied ([SETUP.md](SETUP.md) §1)
- [ ] Owner: Google OAuth configured ([SETUP.md](SETUP.md) §2)
- [ ] Owner: Vercel env vars set and redeployed ([SETUP.md](SETUP.md) §3)
- [ ] Owner: live sign-in on phone and laptop; sign-ups disabled; other account refused ([SETUP.md](SETUP.md) §4)

**Done when:** you can sign in with Google on the deployed URL, see an empty Home screen, and sign out. Sign-ups are then disabled.

## Phase 1 — Daily tracking (first usable version) 🟨 (built; waiting for live use)
- [x] Accounts: add/edit/archive, opening balance and date, default account, card due day
- [x] Starter categories seeded on first sign-in; add/rename/archive categories
- [x] Add transaction form: expense / income / transfer / refund with validation
- [x] Quick text box + parser (all examples in MONEY_RULES.md pass as unit tests)
- [x] Voice button (Web Speech, `en-IN`) filling the quick text box
- [x] Recipient memory: pre-fill category; Recipients screen to edit names, aliases and default category
- [x] Transactions list: day groups, search, filters, edit, delete
- [x] Home: month picker, Income/Spending/Saved, balances, money in hand, card outstanding, spending by category, top recipients
- [x] Reference fixture from MONEY_RULES.md passes as unit tests (both periods)
- [x] Checked on phone (360px) and laptop (1366px)
- [ ] Owner: real phone check — voice in Chrome on Android, sign-in, a week of real entries

How it was checked: unit tests, plus a browser run against an in-memory imitation of Supabase. That run entered the whole reference fixture through quick text and got the documented Home figures. It also covered edit, delete, validation, a failed save and retry, voice (with a simulated speech engine), aliases, filters, and no sideways scrolling at 360px and 1366px. Not yet checked: the real Supabase database, real Google sign-in, and real speech recognition on a phone.

**Done when:** you have entered a real week of expenses by voice and text on your phone, and the balances match your bank app.

## Phase 2 — Bills, EMIs and budgets 🟨 (built; waiting for live use)
- [x] Recurring items: create/edit/pause/delete, EMI instalment countdown
- [x] Upcoming screen (30 days, overdue shown) + Home "next 7 days"; card due dates with "Record payment" shortcut
- [x] Mark as paid → pre-filled draft → atomic save + advance (`pay_recurring`); Skip (`skip_recurring`)
- [x] Budgets per category with progress on Home (text labels + colour)
- [x] Monthly trend (last 6 months income vs spending, plain bars with numbers)
- [ ] Owner: use with real rent/EMI/card bills for a month

How it was checked: database tests (pay is atomic, the same occurrence can't be paid twice, an invalid payment writes nothing, another user can't pay your reminder, skip keeps the EMI count, month-end dates clamp). Unit tests cover the 90-day horizon (₹600 = 3 × ₹200), 45-day windows, overdue items and budget thresholds. A browser run at 360px and 1366px covered creating reminders, mark as paid, skip, card bill payment, budgets and the Home cards.

**Done when:** a month's rent, an EMI and a card bill have been tracked through Upcoming → Mark as paid.

## Phase 3 — Statement import 🟨 (built; needs your real files)
- [x] Upload CSV/XLSX (read on the device); column mapping saved per account by column name
- [x] Parse with row-level errors (bad date, bad amount, both debit and credit filled); blank/summary lines counted, never silently dropped
- [x] Statuses: New / Already imported / Possibly already entered (one-to-one, ±3 days) / Error
- [x] Names suggested from bank narrations (UPI, NEFT, POS); categories from recipient memory; editable in review
- [x] Card-bill payments and ATM withdrawals become transfers; a card statement's payment row matches the bank-side transfer
- [x] Atomic, retry-safe commit (`commit_import`, migration 3); re-import of the same file adds 0 rows
- [x] Import history with Undo (removes exactly that import)
- [ ] Owner: test with your real bank and card files (kept locally, never committed)

How it was checked: unit tests for dates, amounts, headers, column guessing, fingerprints, name suggestions, statuses and transfer direction. Database tests show the import is all-or-nothing, a retry with the same batch writes nothing, a duplicate row fails the whole import, another user's account is refused, and undo keeps manual entries. A browser run imported a synthetic bank CSV, a card CSV and an .xlsx at 360px and 1366px. The bank balance afterwards matched the statement's own closing balance, ₹5,459.50.

**Done when:** a full month's statement for your main bank is imported with no duplicates against your manual entries.

## Phase 4 — Export and backup 🟨 (built; do your first real backup)
- [x] Export transactions CSV for a chosen date range (plain rupee numbers, spending effect column, formula-safe text)
- [x] Full JSON backup download (version 1, integer paise, SHA-256 checksum)
- [x] Restore from JSON into an empty app: shape, checksum and every link checked before writing; `restore_backup` is all-or-nothing (migration 4)
- [ ] Owner: download a backup after your first week of real data

How it was checked: database tests back up the full reference fixture plus reminders, budgets and recipients, and restore it into a fresh database. The balances match (net ₹6,060) and re-exporting gives identical data. Restoring over existing data is refused, and a bad row restores nothing. Edited files fail the checksum, and broken links are caught even with a recomputed checksum. A browser run at both widths covered backup, CSV, restore and a tampered file.

## Phase 5 — Polish ⬜
- [ ] PWA install (manifest, icons, app-file caching only), offline banner
- [ ] Dark mode
- [ ] Accessibility pass: focus states, labels, dialogs, zoom
- [ ] Code-split heavy screens (import, charts)

## Phase 6 — Optional: AI assistant ⬜ (decide later)
- [ ] Decide whether it is worth it, and confirm Gemini paid-tier data terms and cost
- [ ] Edge Function with server-side key; sends only computed summaries
- [ ] "Explain my month" button on Home — read-only text, no writes

## Change log
- 2026-10-22: Phase 4 built: CSV export, full backup with checksum, validated all-or-nothing restore (migration 4).
- 2026-10-22: Phase 3 built: CSV/XLSX statement import with review, duplicates, atomic commit and undo (migration 3).
- 2026-10-22: Phase 2 built: reminders, Upcoming, mark as paid / skip (migration 2), budgets, Home due-soon / budgets / trend.
- 2026-10-22: Phase 1 built: accounts, categories, recipients with aliases, quick add (text + voice), transactions, Home.
- 2026-10-21: Phase 0 code: scaffold, schema + PGlite tests, sign-in, shell. Money/date helpers and the balance formula added early, because the schema tests need them.
- 2026-10-21: Fresh start. Scope simplified (no receipt OCR, no PDF parsing, no complex reconciliation, no owner bootstrap). Docs rewritten.

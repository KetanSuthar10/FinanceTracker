# Roadmap and status

This is the only status file. Tick a box only after it has been checked in the running app (not just because a unit test passed). Each phase ends with something you can actually use.

Status key: ⬜ not started · 🟨 in progress · ✅ done

## Phase 0 — Setup ⬜
- [ ] Vite + React + TS + Tailwind + Router + TanStack Query + Zod + Vitest, versions pinned
- [ ] ESLint + Prettier; `npm run check` runs typecheck + lint + tests
- [ ] GitHub Actions: install, check, build on every push
- [ ] Supabase project created (Mumbai region), Supabase CLI linked, first migration applied
- [ ] Google OAuth configured in Google Cloud + Supabase; local and Vercel redirect URLs added
- [ ] Vercel project connected with the two `VITE_` env vars
- [ ] "Not configured" screen when env vars are missing

**Done when:** you can sign in with Google on the deployed URL, see an empty Home screen, and sign out. Sign-ups are then disabled.

## Phase 1 — Daily tracking (first usable version) ⬜
- [ ] Accounts: add/edit/archive, opening balance and date, default account, card due day
- [ ] Starter categories seeded on first sign-in; add/rename/archive categories
- [ ] Add transaction form: expense / income / transfer / refund with validation
- [ ] Quick text box + parser (all examples in MONEY_RULES.md pass as unit tests)
- [ ] Voice button (Web Speech, `en-IN`) filling the quick text box
- [ ] Recipient memory: pre-fill category; Recipients screen to edit names, aliases and default category
- [ ] Transactions list: day groups, search, filters, edit, delete
- [ ] Home: month picker, Income/Spending/Saved, balances, money in hand, card outstanding, spending by category, top recipients
- [ ] Reference fixture from MONEY_RULES.md passes as unit tests (both periods)
- [ ] Checked on phone (360px) and laptop (1366px)

**Done when:** you have entered a real week of expenses by voice and text on your phone, and the balances match your bank app.

## Phase 2 — Bills, EMIs and budgets ⬜
- [ ] Recurring items: create/edit/pause, EMI instalment countdown
- [ ] Upcoming screen (30 days) + Home "next 7 days"; card due dates included
- [ ] Mark as paid → pre-filled draft → atomic save + advance (`pay_recurring`)
- [ ] Budgets per category with progress on Home
- [ ] Monthly trend (last 6 months income vs spending)

**Done when:** a month's rent, an EMI and a card bill have been tracked through Upcoming → Mark as paid.

## Phase 3 — Statement import ⬜
- [ ] Upload CSV/XLSX; column mapping saved per account
- [ ] Parse with row-level errors (bad date, bad amount, both debit and credit filled)
- [ ] Statuses: New / Already imported / Possibly already entered / Error
- [ ] Categories pre-filled from recipient memory; editable in preview
- [ ] Atomic commit (`commit_import`); re-import of the same file adds 0 rows
- [ ] Import history with Undo
- [ ] Tested with your real bank file and real card file (kept locally, never committed)

**Done when:** a full month's statement for your main bank is imported with no duplicates against your manual entries.

## Phase 4 — Export and backup ⬜
- [ ] Export transactions CSV (for a chosen date range)
- [ ] Full JSON backup download
- [ ] Restore from JSON into an empty account (validated before writing; all or nothing)

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
- 2026-10-21: Fresh start. Scope simplified (no receipt OCR, no PDF parsing, no complex reconciliation, no owner bootstrap). Docs rewritten.

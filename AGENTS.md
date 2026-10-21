# Instructions for AI coding agents

Read these first: `docs/PRODUCT.md`, `docs/MONEY_RULES.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`.

## How to work
- Work on the current phase in `docs/ROADMAP.md`. Do not start later phases or add features that are not listed.
- Keep it simple. Prefer a standard library over custom code, and fewer files over more abstraction. No new infrastructure without a decision in `docs/DECISIONS.md`.
- Make small, reviewable commits. Run `npm run check` (typecheck, lint, tests) and `npm run build` before saying something works.
- Every schema change is a new file in `supabase/migrations/` (never edit an applied one) and gets a test in `src/tests/db/`. If it changes a database function, update `e2e/mock_supabase.py` too.
- For UI changes, run the browser tests in `e2e/` (see its README).
- Tick a ROADMAP box only after checking the feature in the running app. Say plainly what was not checked.
- If a requirement is unclear or conflicts with the docs, ask instead of guessing.

## Money rules (non-negotiable)
- Money is integer paise; `amount_paise` is always positive; the type decides the direction. Never use floats for money.
- Transfers (including card bill payments and cash withdrawals) are never income or spending.
- Refunds reduce spending. Opening balances are not income. Credit limits are never money.
- Dates use Asia/Kolkata. Never use `new Date().toISOString()` to get "today".
- Quick text and voice only create drafts. Never invent an amount, account or date the user didn't give; leave the field empty instead.
- Formulas live in `src/domain/` as pure functions with unit tests. The fixture in MONEY_RULES.md must always pass.
- Equal amount and date alone never merge or delete records.

## Security and data
- Every table has RLS with `user_id = auth.uid()`. Every migration that adds a table adds its policy.
- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the frontend. No hardcoded fallbacks, and no secret keys in frontend code or Git.
- Never commit real bank statements, exports, `.env` files or personal data. Test data is synthetic.
- No demo data, no localStorage copy of financial data, no silent fallback when Supabase fails. Show an error instead.

## UI
- Plain language on screen; no technical terms or debug panels.
- Every screen has loading, empty and error states. A failed save keeps the user's input.
- Check at 360px and 1366px widths. Use text or icons as well as colour for status.

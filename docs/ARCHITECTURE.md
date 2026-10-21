# Architecture

Small, boring, standard. Prefer a well-known library over custom code.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React + TypeScript + Vite | Fast, familiar |
| Styling | Tailwind CSS | Simple, consistent |
| Routing | React Router | Real URLs, phone back button works |
| Data fetching | TanStack Query | Caching, refetch on focus, loading/error states for free |
| Validation | Zod | One schema per form/write, shared by parser and form |
| Charts | None — plain CSS bars with numbers | Category bars, budgets, 6-month trend (see DECISIONS #12) |
| Spreadsheet import | Papa Parse (CSV), read-excel-file (.xlsx) | Maintained parsers, run in the browser; .xls not supported (DECISIONS #16) |
| Voice | Browser Web Speech API (`en-IN`) | No server, no cost; falls back to the phone keyboard mic |
| Database + auth | Supabase (Postgres + Google sign-in) | Free tier is enough; row-level security |
| Hosting | Vercel | Static site; already in use |
| Tests | Vitest + PGlite | Money rules, parser, import matching; the real SQL migrations run in PGlite (Postgres in WebAssembly) to test constraints and row-level security without Docker |

No backend server of our own in v1. The browser talks to Supabase directly, and security comes from row-level security (RLS). There are no Edge Functions until an AI feature needs a secret key.

Pin exact dependency versions and commit `package-lock.json`.

## Folder structure

```
src/
  main.tsx, App.tsx          app entry, router, providers
  lib/
    supabase.ts              client; shows a setup screen if env is missing
    money.ts                 paise <-> rupees, Indian formatting, safe-integer checks
    dates.ts                 Asia/Kolkata today, month ranges, date words
    queryClient.ts
  domain/                    pure functions, no React, no Supabase — fully unit tested
    balances.ts              account balances from opening + grouped totals
    summary.ts               month income/spending/category/recipient totals
    parseQuickText.ts        text/voice -> draft
    importer.ts              file rows -> normalised rows -> hashes -> statuses
    recurring.ts             next due date, instalment countdown
    schemas.ts               Zod schemas for transaction, account, etc.
  data/                      Supabase queries + TanStack Query hooks (one file per table)
  features/
    home/ transactions/ add/ upcoming/ accounts/ categories/
    recipients/ budgets/ import/ export/ settings/ auth/
  components/                Button, Input, Select, Sheet/Dialog, MoneyText, EmptyState...
  tests/                     *.test.ts; fixture.ts = the MONEY_RULES.md fixture
    db/                      schema tests: migrations run in PGlite with a Supabase auth stand-in
supabase/
  migrations/                numbered SQL files, applied in order (SQL Editor or Supabase CLI)
public/
  manifest.webmanifest, icons
```

## Data model

All tables have `id uuid primary key default gen_random_uuid()`, `user_id uuid not null default auth.uid() references auth.users`, and `created_at` / `updated_at timestamptz`. Every table has RLS enabled with one policy: `user_id = auth.uid()` for select/insert/update/delete.

```sql
accounts (
  name text not null,
  type text not null check (type in ('bank','cash','card')),
  opening_balance_paise bigint not null default 0,   -- signed; card debt is negative
  opening_date date not null,
  card_due_day smallint check (card_due_day between 1 and 31),  -- cards only
  nickname text,                                     -- for quick-text matching, e.g. 'hdfc'
  archived boolean not null default false
)

categories (
  name text not null,
  kind text not null check (kind in ('expense','income')),
  archived boolean not null default false,
  unique (user_id, name, kind)
)

recipients (
  name text not null,                 -- display name, e.g. 'Third Wave Coffee'
  aliases text[] not null default '{}',  -- lowercase, e.g. {'twc','third wave'}
  default_category_id uuid references categories,
  unique (user_id, name)
)

transactions (
  date date not null,
  type text not null check (type in ('expense','income','transfer','refund')),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 9007199254740991),
  account_id uuid not null references accounts,      -- 'from' account for transfers
  to_account_id uuid references accounts,            -- transfers only
  category_id uuid references categories,            -- null for transfers
  recipient_id uuid references recipients,
  note text,
  source text not null default 'manual' check (source in ('manual','voice','import','recurring')),
  import_batch_id uuid references import_batches on delete cascade,
  import_hash text,
  recurring_item_id uuid references recurring_items on delete set null,
  check ((type = 'transfer') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id),
  unique (account_id, import_hash)
)

recurring_items (
  name text not null,
  type text not null check (type in ('expense','transfer')),
  amount_paise bigint not null check (amount_paise > 0),
  account_id uuid not null references accounts,
  to_account_id uuid references accounts,
  category_id uuid references categories,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  next_due_date date not null,
  instalments_left integer check (instalments_left >= 0),   -- null = no end
  active boolean not null default true
)

budgets (
  category_id uuid not null references categories,
  monthly_limit_paise bigint not null check (monthly_limit_paise > 0),
  unique (user_id, category_id)
)

import_batches (
  account_id uuid not null references accounts,
  file_name text not null,
  row_count integer not null,
  added_count integer not null,
  skipped_count integer not null
)

import_mappings (                       -- remembered column mapping per account
  account_id uuid not null references accounts unique,
  mapping jsonb not null                -- {date:'Txn Date', description:'Narration', debit:'Withdrawal', credit:'Deposit', date_format:'dd/MM/yyyy'}
)

settings (
  user_id uuid primary key default auth.uid(),
  default_account_id uuid references accounts
)
```

**Ownership of references:** RLS stops reading other users' rows. Every reference between tables is a composite foreign key on `(user_id, id)`, so a row can never point at another user's account, category, recipient or batch.

The real schema is in `supabase/migrations/`; the sketch above is a summary.

**Deleting:** accounts and categories are archived, not deleted, once they have transactions (foreign keys without cascade enforce this).

**Seed data:** on first sign-in, insert a starter list of categories (Food & dining, Groceries, Transport, Fuel, Shopping, Bills & utilities, Rent, Health, Entertainment, Travel, Education, Fees & interest, Loan EMI, Other; income: Salary, Freelance, Interest, Other income). This seed is the only automatic data; there are no demo transactions.

## How numbers are computed

- **Balances:** a SQL view `account_totals` returns one row per account with summed amounts per effect (income in, refund in, expense out, transfer in, transfer out). The view is small: one row per account. `domain/balances.ts` combines it with opening balances using the formula in MONEY_RULES.md. This avoids loading all history into the browser, which would break past Supabase's 1,000-row default limit.
- **Month view:** fetch only the selected month's transactions, using range pagination if there are more than 1,000. `domain/summary.ts` computes income, spending, categories and recipients from them.
- **Opening net position for a period:** the same `account_totals` view, filtered by `date < period_start` (a SQL function with a date parameter).
- **Rule:** the money formulas live in `domain/` and are unit tested against the fixture. SQL only does sums and filtering.

## Writes

- Every form submits through one Zod schema per entity.
  - Quick text and voice produce a draft, which goes into the same form, which goes through the same schema and the same insert.
- A single transaction is a single row insert, so it is atomic with no RPC needed.
- **Import commit** is a Postgres function `commit_import(batch_id, account_id, file_name, row_count, skipped_count, rows jsonb)`. It inserts the batch, creates any new recipients and inserts all rows in one transaction. The client chooses `batch_id`, so a retry returns the first result instead of importing twice; `unique(account_id, import_hash)` stops the same statement row being stored twice. Undo deletes the batch, and its transactions cascade.
- **Mark recurring as paid** is a Postgres function `pay_recurring(item_id, expected_due, transaction jsonb)`. It inserts the transaction and advances the item atomically. If the item has already moved past `expected_due` (double tap, another device), it refuses and writes nothing. `skip_recurring(item_id, expected_due)` only advances the date.
- **Restore** is `restore_backup(data jsonb)`. It only runs when the user has no accounts or transactions, keeps the backup's IDs so links survive, always uses the signed-in user's id, and is all-or-nothing. The app validates the file (shape, checksum, links) before calling it.
- On error, the form keeps its values and shows a readable message.

## Auth and security

- **Google sign-in only** through Supabase Auth. There is no email/password.
- **Single user:** sign in once to create your user, then turn off "Allow new users to sign up" in Supabase Auth settings. RLS also means that any other account would only ever see its own empty data.
- The frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. These are public by design; RLS is the protection.
  - There is no hardcoded fallback. If they are missing, show a "not configured" screen.
- **Never** put the Supabase service-role key, or any secret key, in the frontend or in Git.
- On sign-out, clear the TanStack Query cache.

## Voice input

- Use `SpeechRecognition` / `webkitSpeechRecognition` with `lang = 'en-IN'` and interim results shown live.
  - Supported in Chrome on Android and desktop, and in Safari on iOS. Where unsupported, hide the mic button; the phone keyboard's own mic still works in the text box.
- In Chrome, speech is processed by Google's servers. Say so once in Settings. Only the spoken sentence is sent, never your ledger data.
- Recognised text goes into the quick-text box, so the user sees it and can correct it before parsing.

## PWA

Manifest + PNG icons so the app can be added to the home screen. `public/sw.js` (about 60 lines, hand-written) caches only the page shell and the hashed `/assets/` files. It ignores other origins, so Supabase responses are never cached. Pages are network-first, so a new deployment shows up on the next open. When offline, a banner says: "You're offline — connect to save or load your data."

## Optional later: AI assistant

If added (see ROADMAP Phase 6):
- A Supabase Edge Function holds the Gemini key.
- The function receives only computed summaries (month totals, category totals), never raw account numbers.
- The function returns text. It never writes data. Core features keep working when the AI is unavailable.

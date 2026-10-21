-- Finance Tracker — initial schema
-- Every table belongs to one user (user_id = auth.uid()) and is protected by row-level security.
-- Cross-table references use composite (user_id, id) foreign keys, so a row can never point
-- at another user's account, category, recipient or batch.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  type text not null check (type in ('bank', 'cash', 'card')),
  -- Signed: money you have is positive, card debt is negative.
  opening_balance_paise bigint not null default 0
    check (opening_balance_paise between -9007199254740991 and 9007199254740991),
  opening_date date not null,
  nickname text check (nickname is null or length(trim(nickname)) between 1 and 30),
  card_due_day smallint check (card_due_day between 1 and 31),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, name),
  check (card_due_day is null or type = 'card')
);

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  kind text not null check (kind in ('expense', 'income')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, name, kind)
);

-- ---------------------------------------------------------------------------
-- Recipients (merchant / person memory)
-- ---------------------------------------------------------------------------
create table public.recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  aliases text[] not null default '{}',
  default_category_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, name),
  foreign key (user_id, default_category_id) references public.categories (user_id, id)
    on delete set null (default_category_id)
);

-- ---------------------------------------------------------------------------
-- Import batches and remembered column mappings
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null,
  file_name text not null,
  row_count integer not null check (row_count >= 0),
  added_count integer not null check (added_count >= 0),
  skipped_count integer not null check (skipped_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, account_id) references public.accounts (user_id, id)
);

create table public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null,
  mapping jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_id),
  foreign key (user_id, account_id) references public.accounts (user_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Recurring items (bills, EMIs, subscriptions) — reminders, not transactions
-- ---------------------------------------------------------------------------
create table public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  type text not null check (type in ('expense', 'transfer')),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 9007199254740991),
  account_id uuid not null,
  to_account_id uuid,
  category_id uuid,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  next_due_date date not null,
  instalments_left integer check (instalments_left >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check ((type = 'transfer') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id),
  check (type <> 'transfer' or category_id is null),
  foreign key (user_id, account_id) references public.accounts (user_id, id),
  foreign key (user_id, to_account_id) references public.accounts (user_id, id),
  foreign key (user_id, category_id) references public.categories (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Transactions — the single source of every balance and total
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  type text not null check (type in ('expense', 'income', 'transfer', 'refund')),
  -- Always positive; the type decides the direction (see docs/MONEY_RULES.md).
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 9007199254740991),
  account_id uuid not null,          -- the 'from' account for transfers
  to_account_id uuid,                -- transfers only
  category_id uuid,
  recipient_id uuid,
  note text check (note is null or length(note) <= 500),
  source text not null default 'manual' check (source in ('manual', 'voice', 'import', 'recurring')),
  import_batch_id uuid,
  import_hash text,
  recurring_item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((type = 'transfer') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id),
  check (type <> 'transfer' or category_id is null),
  check ((import_batch_id is null) = (import_hash is null)),
  unique (account_id, import_hash),
  foreign key (user_id, account_id) references public.accounts (user_id, id),
  foreign key (user_id, to_account_id) references public.accounts (user_id, id),
  foreign key (user_id, category_id) references public.categories (user_id, id),
  foreign key (user_id, recipient_id) references public.recipients (user_id, id)
    on delete set null (recipient_id),
  foreign key (user_id, import_batch_id) references public.import_batches (user_id, id)
    on delete cascade,
  foreign key (user_id, recurring_item_id) references public.recurring_items (user_id, id)
    on delete set null (recurring_item_id)
);

create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_account_date_idx on public.transactions (account_id, date);
create index transactions_to_account_idx on public.transactions (to_account_id) where to_account_id is not null;
create index transactions_category_idx on public.transactions (category_id);
create index transactions_recipient_idx on public.transactions (recipient_id);
create index transactions_batch_idx on public.transactions (import_batch_id) where import_batch_id is not null;

-- ---------------------------------------------------------------------------
-- Budgets and settings
-- ---------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  monthly_limit_paise bigint not null check (monthly_limit_paise > 0 and monthly_limit_paise <= 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id),
  foreign key (user_id, category_id) references public.categories (user_id, id) on delete cascade
);

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  default_account_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, default_account_id) references public.accounts (user_id, id)
    on delete set null (default_account_id)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers, row-level security, grants
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'recipients', 'import_batches', 'import_mappings',
    'recurring_items', 'transactions', 'budgets', 'settings'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      'own rows only', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- account_totals: one row per account with summed effects.
-- The balance formula itself lives in src/domain/balances.ts.
-- Only transactions on/after each account's opening date count.
-- p_before (optional) limits to transactions dated strictly before that day,
-- which gives the opening position of a period.
-- Runs as the caller, so row-level security applies.
-- ---------------------------------------------------------------------------
create or replace function public.account_totals(p_before date default null)
returns table (
  account_id uuid,
  income_in_paise bigint,
  refund_in_paise bigint,
  expense_out_paise bigint,
  transfer_in_paise bigint,
  transfer_out_paise bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.id,
    coalesce(sum(t.amount_paise) filter (where t.type = 'income'   and t.account_id = a.id), 0)::bigint,
    coalesce(sum(t.amount_paise) filter (where t.type = 'refund'   and t.account_id = a.id), 0)::bigint,
    coalesce(sum(t.amount_paise) filter (where t.type = 'expense'  and t.account_id = a.id), 0)::bigint,
    coalesce(sum(t.amount_paise) filter (where t.type = 'transfer' and t.to_account_id = a.id), 0)::bigint,
    coalesce(sum(t.amount_paise) filter (where t.type = 'transfer' and t.account_id = a.id), 0)::bigint
  from public.accounts a
  left join public.transactions t
    on (t.account_id = a.id or t.to_account_id = a.id)
   and t.date >= a.opening_date
   and (p_before is null or t.date < p_before)
  group by a.id;
$$;

revoke all on function public.account_totals(date) from public, anon;
grant execute on function public.account_totals(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Starter categories for a new user (idempotent; called by the app after sign-in)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_starter_data()
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.categories (name, kind)
  select v.name, v.kind
  from (values
    ('Food & dining', 'expense'), ('Groceries', 'expense'), ('Transport', 'expense'),
    ('Fuel', 'expense'), ('Shopping', 'expense'), ('Bills & utilities', 'expense'),
    ('Rent', 'expense'), ('Health', 'expense'), ('Entertainment', 'expense'),
    ('Travel', 'expense'), ('Education', 'expense'), ('Fees & interest', 'expense'),
    ('Loan EMI', 'expense'), ('Other', 'expense'),
    ('Salary', 'income'), ('Freelance', 'income'), ('Interest', 'income'),
    ('Other income', 'income')
  ) as v (name, kind)
  where not exists (select 1 from public.categories c where c.user_id = auth.uid())
  on conflict (user_id, name, kind) do nothing;

  insert into public.settings (user_id) values (auth.uid())
  on conflict (user_id) do nothing;
$$;

revoke all on function public.ensure_starter_data() from public, anon;
grant execute on function public.ensure_starter_data() to authenticated;

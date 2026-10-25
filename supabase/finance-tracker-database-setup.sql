-- =====================================================================
-- Finance Tracker: complete database setup (all 4 migrations, in order)
--
-- HOW TO USE
--   Supabase dashboard → SQL Editor → New query → paste ALL of this → Run.
--   Run it ONCE, on a NEW, EMPTY Supabase project.
--
-- It is all-or-nothing: if anything fails, nothing is saved and you can
-- simply fix the problem and run it again.
--
-- The last line prints "Setup complete" with the number of tables (9).
-- =====================================================================

begin;


-- =====================================================================
-- 20261021000001_initial_schema.sql
-- =====================================================================

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


-- =====================================================================
-- 20261022000002_recurring_payments.sql
-- =====================================================================

-- Finance Tracker — recurring items: pay or skip atomically.
-- "Mark as paid" saves the transaction AND moves the reminder to its next due date in one
-- database transaction. p_expected_due guards against paying the same occurrence twice
-- (a double tap, or two devices): if the item has already moved on, nothing is written.

-- Next monthly due date after p_current, on p_day (clamped to the month's last day).
create or replace function public.next_monthly_due(p_current date, p_day smallint)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_current) + interval '1 month')::date
         + (least(
              p_day,
              extract(day from (date_trunc('month', p_current) + interval '2 month' - interval '1 day'))::int
            ) - 1);
$$;

create or replace function public.pay_recurring(p_item_id uuid, p_expected_due date, p_tx jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.recurring_items;
  v_id uuid;
begin
  select * into v_item from public.recurring_items where id = p_item_id for update;
  if not found then
    raise exception 'Recurring item not found' using errcode = 'P0002';
  end if;
  if not v_item.active then
    raise exception 'This reminder is paused or finished' using errcode = 'P0001';
  end if;
  if v_item.next_due_date <> p_expected_due then
    raise exception 'This payment was already recorded' using errcode = 'P0001';
  end if;

  insert into public.transactions (
    date, type, amount_paise, account_id, to_account_id, category_id, recipient_id, note, source, recurring_item_id
  ) values (
    (p_tx ->> 'date')::date,
    p_tx ->> 'type',
    (p_tx ->> 'amount_paise')::bigint,
    (p_tx ->> 'account_id')::uuid,
    nullif(p_tx ->> 'to_account_id', '')::uuid,
    nullif(p_tx ->> 'category_id', '')::uuid,
    nullif(p_tx ->> 'recipient_id', '')::uuid,
    nullif(p_tx ->> 'note', ''),
    'recurring',
    v_item.id
  )
  returning id into v_id;

  update public.recurring_items
     set next_due_date = public.next_monthly_due(v_item.next_due_date, v_item.day_of_month),
         instalments_left = case when instalments_left is null then null else instalments_left - 1 end,
         active = coalesce(instalments_left, 2) - 1 > 0
   where id = v_item.id;

  return v_id;
end;
$$;

-- Skip one occurrence (e.g. a subscription you didn't pay this month). EMI count is unchanged.
create or replace function public.skip_recurring(p_item_id uuid, p_expected_due date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.recurring_items;
begin
  select * into v_item from public.recurring_items where id = p_item_id for update;
  if not found then
    raise exception 'Recurring item not found' using errcode = 'P0002';
  end if;
  if v_item.next_due_date <> p_expected_due then
    raise exception 'This reminder has already moved on' using errcode = 'P0001';
  end if;
  update public.recurring_items
     set next_due_date = public.next_monthly_due(v_item.next_due_date, v_item.day_of_month)
   where id = v_item.id;
end;
$$;

revoke all on function public.next_monthly_due(date, smallint) from public, anon;
revoke all on function public.pay_recurring(uuid, date, jsonb) from public, anon;
revoke all on function public.skip_recurring(uuid, date) from public, anon;
grant execute on function public.next_monthly_due(date, smallint) to authenticated;
grant execute on function public.pay_recurring(uuid, date, jsonb) to authenticated;
grant execute on function public.skip_recurring(uuid, date) to authenticated;


-- =====================================================================
-- 20261022000003_statement_import.sql
-- =====================================================================

-- Finance Tracker — statement import as one atomic, retry-safe call.
-- The client sends the confirmed rows. The batch id is chosen by the client, so a retry after a
-- timeout finds the existing batch instead of importing twice. unique(account_id, import_hash)
-- stops the same statement row being stored twice for an account. Undo = delete the batch
-- (its transactions cascade).

create or replace function public.commit_import(
  p_batch_id uuid,
  p_account_id uuid,
  p_file_name text,
  p_row_count integer,
  p_skipped_count integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.import_batches;
  v_row jsonb;
  v_recipient uuid;
  v_name text;
  v_category uuid;
  v_added integer := 0;
begin
  select * into v_existing from public.import_batches where id = p_batch_id;
  if found then
    -- Retry of a call that already succeeded: report the original result, write nothing.
    return jsonb_build_object('batch_id', v_existing.id, 'added', v_existing.added_count, 'already_done', true);
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nothing to import' using errcode = 'P0001';
  end if;

  insert into public.import_batches (id, account_id, file_name, row_count, added_count, skipped_count)
  values (p_batch_id, p_account_id, left(coalesce(p_file_name, 'statement'), 200), p_row_count, 0, p_skipped_count);

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_category := nullif(v_row ->> 'category_id', '')::uuid;
    v_recipient := nullif(v_row ->> 'recipient_id', '')::uuid;
    v_name := nullif(trim(v_row ->> 'recipient_name'), '');

    -- Recipient memory: reuse a recipient with the same name (any capitalisation) or create it.
    if v_recipient is null and v_name is not null then
      select id into v_recipient from public.recipients where lower(name) = lower(v_name) limit 1;
      if v_recipient is null then
        insert into public.recipients (name, default_category_id) values (left(v_name, 80), v_category)
        returning id into v_recipient;
      end if;
    end if;
    if v_recipient is not null and v_category is not null then
      update public.recipients set default_category_id = v_category
       where id = v_recipient and default_category_id is distinct from v_category;
    end if;

    insert into public.transactions (
      date, type, amount_paise, account_id, to_account_id, category_id, recipient_id, note,
      source, import_batch_id, import_hash
    ) values (
      (v_row ->> 'date')::date,
      v_row ->> 'type',
      (v_row ->> 'amount_paise')::bigint,
      (v_row ->> 'account_id')::uuid,
      nullif(v_row ->> 'to_account_id', '')::uuid,
      v_category,
      v_recipient,
      left(nullif(v_row ->> 'note', ''), 500),
      'import',
      p_batch_id,
      v_row ->> 'import_hash'
    );
    v_added := v_added + 1;
  end loop;

  update public.import_batches set added_count = v_added where id = p_batch_id;
  return jsonb_build_object('batch_id', p_batch_id, 'added', v_added, 'already_done', false);
end;
$$;

revoke all on function public.commit_import(uuid, uuid, text, integer, integer, jsonb) from public, anon;
grant execute on function public.commit_import(uuid, uuid, text, integer, integer, jsonb) to authenticated;


-- =====================================================================
-- 20261022000004_restore_backup.sql
-- =====================================================================

-- Finance Tracker — restore a backup into an empty app, all or nothing.
-- "Empty" means no accounts and no transactions (starter categories are replaced by the backup's).
-- IDs from the backup are kept so every link survives; user_id is always the signed-in user.
-- Any bad row makes the whole restore fail and nothing changes.

create or replace function public.restore_backup(p_data jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if exists (select 1 from public.accounts where user_id = v_uid)
     or exists (select 1 from public.transactions where user_id = v_uid) then
    raise exception 'Restore only works on an empty app (no accounts or transactions yet)' using errcode = 'P0001';
  end if;

  delete from public.budgets where user_id = v_uid;
  delete from public.recurring_items where user_id = v_uid;
  delete from public.import_mappings where user_id = v_uid;
  delete from public.import_batches where user_id = v_uid;
  delete from public.recipients where user_id = v_uid;
  delete from public.settings where user_id = v_uid;
  delete from public.categories where user_id = v_uid;

  insert into public.accounts (id, name, type, opening_balance_paise, opening_date, nickname, card_due_day, archived)
  select id, name, type, opening_balance_paise, opening_date, nickname, card_due_day, archived
  from jsonb_to_recordset(coalesce(p_data -> 'accounts', '[]'))
    as x(id uuid, name text, type text, opening_balance_paise bigint, opening_date date, nickname text, card_due_day smallint, archived boolean);

  insert into public.categories (id, name, kind, archived)
  select id, name, kind, archived
  from jsonb_to_recordset(coalesce(p_data -> 'categories', '[]')) as x(id uuid, name text, kind text, archived boolean);

  insert into public.recipients (id, name, aliases, default_category_id)
  select id, name, coalesce(aliases, '{}'), default_category_id
  from jsonb_to_recordset(coalesce(p_data -> 'recipients', '[]')) as x(id uuid, name text, aliases text[], default_category_id uuid);

  insert into public.import_batches (id, account_id, file_name, row_count, added_count, skipped_count, created_at)
  select id, account_id, file_name, row_count, added_count, skipped_count, created_at
  from jsonb_to_recordset(coalesce(p_data -> 'import_batches', '[]'))
    as x(id uuid, account_id uuid, file_name text, row_count integer, added_count integer, skipped_count integer, created_at timestamptz);

  insert into public.recurring_items (id, name, type, amount_paise, account_id, to_account_id, category_id, day_of_month, next_due_date, instalments_left, active)
  select id, name, type, amount_paise, account_id, to_account_id, category_id, day_of_month, next_due_date, instalments_left, active
  from jsonb_to_recordset(coalesce(p_data -> 'recurring_items', '[]'))
    as x(id uuid, name text, type text, amount_paise bigint, account_id uuid, to_account_id uuid, category_id uuid,
         day_of_month smallint, next_due_date date, instalments_left integer, active boolean);

  insert into public.transactions (id, date, type, amount_paise, account_id, to_account_id, category_id, recipient_id, note, source,
                                   import_batch_id, import_hash, recurring_item_id, created_at)
  select id, date, type, amount_paise, account_id, to_account_id, category_id, recipient_id, note, source,
         import_batch_id, import_hash, recurring_item_id, created_at
  from jsonb_to_recordset(coalesce(p_data -> 'transactions', '[]'))
    as x(id uuid, date date, type text, amount_paise bigint, account_id uuid, to_account_id uuid, category_id uuid, recipient_id uuid,
         note text, source text, import_batch_id uuid, import_hash text, recurring_item_id uuid, created_at timestamptz);

  insert into public.budgets (id, category_id, monthly_limit_paise)
  select id, category_id, monthly_limit_paise
  from jsonb_to_recordset(coalesce(p_data -> 'budgets', '[]')) as x(id uuid, category_id uuid, monthly_limit_paise bigint);

  insert into public.import_mappings (id, account_id, mapping)
  select id, account_id, mapping
  from jsonb_to_recordset(coalesce(p_data -> 'import_mappings', '[]')) as x(id uuid, account_id uuid, mapping jsonb);

  insert into public.settings (user_id, default_account_id)
  values (v_uid, nullif(p_data -> 'settings' ->> 'default_account_id', '')::uuid);

  return jsonb_build_object(
    'accounts', (select count(*) from public.accounts where user_id = v_uid),
    'transactions', (select count(*) from public.transactions where user_id = v_uid)
  );
end;
$$;

revoke all on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;


commit;

-- Confirmation (read-only)
select 'Setup complete' as result,
       count(*) as tables_created
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';

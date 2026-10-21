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

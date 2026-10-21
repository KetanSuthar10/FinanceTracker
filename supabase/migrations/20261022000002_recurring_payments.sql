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

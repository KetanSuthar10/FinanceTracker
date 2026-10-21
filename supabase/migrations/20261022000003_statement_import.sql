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

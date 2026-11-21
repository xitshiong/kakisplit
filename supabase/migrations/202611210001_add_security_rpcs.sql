begin;

alter table public.sessions add column if not exists owner_id uuid references auth.users(id);
alter table public.sessions alter column owner_id set default auth.uid();
-- Both formats remain valid during the old-client deployment window.
alter table public.sessions add constraint sessions_code_format check (code ~ '^(?:[0-9]{4}|[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8})$') not valid;
alter table public.sessions add constraint sessions_qr_format check (
  qr_image is null or (length(qr_image) <= 1500000 and qr_image ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$')
) not valid;
alter table public.profiles add constraint profiles_qr_format check (
  qr_url is null or (length(qr_url) <= 1500000 and qr_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$')
) not valid;

create table public.ocr_usage (
  usage_day date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  requests integer not null check (requests between 1 and 30),
  primary key (usage_day, user_id)
);
alter table public.ocr_usage enable row level security;
revoke all on public.ocr_usage from public, anon, authenticated;

create function public.consume_ocr_quota() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  today date := (pg_catalog.now() at time zone 'UTC')::date;
  used integer;
begin
  if caller is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(71420618);
  select coalesce(sum(requests), 0) into used from public.ocr_usage where usage_day = today;
  if used >= 2000 then return false; end if;
  select requests into used from public.ocr_usage where usage_day = today and user_id = caller;
  if coalesce(used, 0) >= 30 then return false; end if;
  insert into public.ocr_usage values (today, caller, 1)
    on conflict (usage_day, user_id) do update set requests = public.ocr_usage.requests + 1;
  return true;
end $$;
revoke all on function public.consume_ocr_quota() from public, anon;
grant execute on function public.consume_ocr_quota() to authenticated;

create function public.get_session(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'code', code, 'items', items, 'qr_image', qr_image, 'paid', paid,
    'selections', selections, 'table_name', table_name, 'table_date', table_date, 'concluded', concluded
  ) from public.sessions
  where code = pg_catalog.upper(pg_catalog.regexp_replace(p_code, '[[:space:]-]', '', 'g'))
    and concluded is not true
  limit 1
$$;

create function public.mark_paid(p_code text, p_item_id text, p_name text, p_split_count integer default 1, p_expected_cents bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions%rowtype;
  entry jsonb;
  payers jsonb;
  total integer;
  item_price text;
  cents bigint;
  share bigint;
  selected_names jsonb;
begin
  p_name := pg_catalog.btrim(pg_catalog.regexp_replace(p_name, U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g'));
  if p_name is null or length(p_name) not between 1 and 100 or p_item_id is null or
     length(p_item_id) not between 1 and 200 or p_item_id in ('__proto__', 'constructor', 'prototype') or
     p_split_count is null or p_split_count not between 1 and 100 or
     (p_expected_cents is not null and p_expected_cents not between 0 and 9007199254740991) then
    return '{"success":false}'::jsonb;
  end if;
  select * into s from public.sessions where code = pg_catalog.upper(pg_catalog.regexp_replace(p_code, '[[:space:]-]', '', 'g')) for update;
  if not found or s.concluded is true then return '{"success":false}'::jsonb; end if;
  select pg_catalog.regexp_replace(pg_catalog.btrim(item->>'price'), '^(-?[0-9]+),([0-9]{1,2})$', '\1.\2')
    into item_price from pg_catalog.jsonb_array_elements(s.items::jsonb) item where item->>'id' = p_item_id limit 1;
  if item_price is null or length(item_price) > 30 or item_price !~ '^-?([0-9]+\.?[0-9]{0,2}|\.[0-9]{1,2})$' then return '{"success":false}'::jsonb; end if;
  if item_price::numeric < 0 or item_price::numeric * 100 > 9007199254740991 then return '{"success":false}'::jsonb; end if;
  cents := item_price::numeric * 100;
  entry := s.paid::jsonb -> p_item_id;
  if entry is null then
    payers := '[]'::jsonb;
    total := p_split_count;
  elsif pg_catalog.jsonb_typeof(entry) = 'string' then
    payers := pg_catalog.jsonb_build_array(entry);
    total := 1;
  else
    payers := entry->'payers';
    if pg_catalog.jsonb_typeof(payers) is distinct from 'array' or coalesce(entry->>'total', '0') !~ '^[0-9]{1,3}$' then
      return '{"success":false}'::jsonb;
    end if;
    total := coalesce(nullif((entry->>'total')::integer, 0), p_split_count);
    if total not between 1 and 100 then return '{"success":false}'::jsonb; end if;
  end if;
  if payers ? p_name then return '{"success":true,"alreadyPaid":true}'::jsonb; end if;
  if pg_catalog.jsonb_array_length(payers) >= total then return '{"success":false,"full":true}'::jsonb; end if;
  share := cents / total + case when pg_catalog.jsonb_array_length(payers) < cents % total then 1 else 0 end;
  if p_expected_cents is not null and p_expected_cents <> share then return '{"success":false,"amountChanged":true}'::jsonb; end if;
  selected_names := coalesce(s.selections::jsonb->p_item_id, '[]'::jsonb);
  if pg_catalog.jsonb_typeof(selected_names) is distinct from 'array' then selected_names := '[]'::jsonb; end if;
  select coalesce(pg_catalog.jsonb_agg(n), '[]'::jsonb) into selected_names
    from pg_catalog.jsonb_array_elements(selected_names) n
    where n <> pg_catalog.to_jsonb(p_name) and pg_catalog.jsonb_array_length(payers) + 1 < total;
  update public.sessions set paid = pg_catalog.jsonb_set(coalesce(s.paid::jsonb, '{}'::jsonb), array[p_item_id],
    pg_catalog.jsonb_build_object('payers', payers || pg_catalog.jsonb_build_array(p_name), 'total', total)),
    selections = pg_catalog.jsonb_set(coalesce(s.selections::jsonb, '{}'::jsonb), array[p_item_id], selected_names) where code = s.code;
  return '{"success":true}'::jsonb;
end $$;

create function public.set_selections(p_code text, p_name text, p_item_ids text[]) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions%rowtype;
  next_selections jsonb := '{}'::jsonb;
  pair record;
  names jsonb;
  item_id text;
  entry jsonb;
begin
  p_name := pg_catalog.btrim(pg_catalog.regexp_replace(p_name, U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g'));
  if p_name is null or length(p_name) not between 1 and 100 or p_item_ids is null or cardinality(p_item_ids) > 1000 then return false; end if;
  select * into s from public.sessions where code = pg_catalog.upper(pg_catalog.regexp_replace(p_code, '[[:space:]-]', '', 'g')) for update;
  if not found or s.concluded is true then return false; end if;
  if exists (select 1 from pg_catalog.unnest(p_item_ids) id where id is null or id in ('__proto__', 'constructor', 'prototype') or
    not exists (select 1 from pg_catalog.jsonb_array_elements(s.items::jsonb) item where item->>'id' = id)) then return false; end if;
  for pair in select * from pg_catalog.jsonb_each(coalesce(s.selections::jsonb, '{}'::jsonb)) loop
    if pg_catalog.jsonb_typeof(pair.value) = 'array' then
      select coalesce(pg_catalog.jsonb_agg(n), '[]'::jsonb) into names from pg_catalog.jsonb_array_elements(pair.value) n where n <> pg_catalog.to_jsonb(p_name);
      next_selections := pg_catalog.jsonb_set(next_selections, array[pair.key], names);
    end if;
  end loop;
  foreach item_id in array p_item_ids loop
    entry := s.paid::jsonb->item_id;
    if pg_catalog.jsonb_typeof(entry) = 'string' then continue; end if;
    if pg_catalog.jsonb_typeof(entry->'payers') = 'array' then
      if entry->'payers' ? p_name then continue; end if;
      if coalesce(entry->>'total', '') ~ '^[0-9]{1,3}$' and
        pg_catalog.jsonb_array_length(entry->'payers') >= greatest(1, (entry->>'total')::integer) then continue; end if;
    end if;
    names := coalesce(next_selections->item_id, '[]'::jsonb);
    if not names ? p_name then next_selections := pg_catalog.jsonb_set(next_selections, array[item_id], names || pg_catalog.jsonb_build_array(p_name)); end if;
  end loop;
  update public.sessions set selections = next_selections where code = s.code;
  return true;
end $$;

revoke all on function public.get_session(text), public.mark_paid(text,text,text,integer,bigint), public.set_selections(text,text,text[]) from public;
grant execute on function public.get_session(text), public.mark_paid(text,text,text,integer,bigint), public.set_selections(text,text,text[]) to anon, authenticated;
commit;

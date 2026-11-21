\set ON_ERROR_STOP on
-- Run only against a fresh disposable PostgreSQL database, never Supabase.
create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table public.sessions (
  code text primary key, items jsonb not null, qr_image text, paid jsonb default '{}',
  selections jsonb default '{}', table_name text, table_date date, concluded boolean default false
);
create table public.profiles (id uuid primary key references auth.users(id), full_name text, avatar_url text, qr_url text);
insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into public.sessions(code,items) values ('1234', '[{"id":"legacy","price":1}]');
alter table public.sessions enable row level security;
create policy old_broad on public.sessions using (true) with check (true);
grant all on public.sessions, public.profiles to anon, authenticated;

\ir ../migrations/202611210001_add_security_rpcs.sql
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
insert into public.sessions(code,items,table_name) values ('ABCDEFGH', '[{"id":"tea","price":3},{"id":"rice","price":4}]', 'Test');
insert into public.profiles(id,full_name) values ('00000000-0000-0000-0000-000000000001','Host');
reset role;
\ir ../migrations/202611210002_lockdown.sql

set role anon;
select set_config('request.jwt.claim.sub','',false);
do $$ begin
  assert public.get_session('abcd-efgh')->>'code' = 'ABCDEFGH';
  assert not public.get_session('ABCDEFGH') ? 'owner_id';
  assert public.get_session('ZZZZZZZZ') is null;
  assert public.set_selections('ABCDEFGH',E' \tAri\n ',array['tea']);
  assert public.set_selections('ABCDEFGH','Bela',array['tea']);
  assert public.set_selections('ABCDEFGH',U&'\00A0Ari\FEFF',array['rice']);
  assert public.get_session('ABCDEFGH')->'selections'->'tea' = '["Bela"]'::jsonb;
  assert public.get_session('ABCDEFGH')->'selections'->'rice' = '["Ari"]'::jsonb;
  assert not public.set_selections('ABCDEFGH','Ari',array['missing']);
  assert public.set_selections('ABCDEFGH','Ari',array[]::text[]);
  assert public.mark_paid('ABCDEFGH','missing','Guest',1) = '{"success":false}'::jsonb;
  assert public.mark_paid('ABCDEFGH','tea','Ari',2) = '{"success":true}'::jsonb;
  assert public.mark_paid('ABCDEFGH','tea','Ari',2) = '{"success":true,"alreadyPaid":true}'::jsonb;
  assert public.mark_paid('ABCDEFGH','tea','Bela',99) = '{"success":true}'::jsonb;
  assert public.mark_paid('ABCDEFGH','tea','Carl',2) = '{"success":false,"full":true}'::jsonb;
  assert public.mark_paid('ABCDEFGH','rice','',1) = '{"success":false}'::jsonb;
  assert public.mark_paid('ABCDEFGH','rice','Guest',101) = '{"success":false}'::jsonb;
  assert public.mark_paid('ABCDEFGH','rice',E' \tBob \n Doe\r ',1) = '{"success":true}'::jsonb;
  assert public.mark_paid('ABCDEFGH','rice',U&'\00A0Bob\2003Doe\FEFF',1) = '{"success":true,"alreadyPaid":true}'::jsonb;
  assert public.mark_paid('1234','legacy','Guest',1) = '{"success":true}'::jsonb;
  assert public.get_session('ABCDEFGH')->'selections'->'tea' = '[]'::jsonb;
  assert public.set_selections('ABCDEFGH','Ari',array['tea','rice']);
  assert public.get_session('ABCDEFGH')->'selections'->'tea' = '[]'::jsonb;
  assert public.get_session('ABCDEFGH')->'selections'->'rice' = '[]'::jsonb;
  begin
    update public.sessions set table_name = 'hijacked' where code = 'ABCDEFGH';
    raise exception 'Anon UPDATE unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.profiles;
    raise exception 'Anon profiles SELECT unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.consume_ocr_quota();
    raise exception 'Anon quota unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end $$;
\echo PASS: guest RPCs, duplicate/capacity/bad-item/legacy checks, atomic selections, anon table-write denial

reset role;
update public.sessions set items = items || '[{"id":"food","price":10},{"id":"free","price":0},{"id":"discount","price":-2},{"id":"invalid","price":"bad"},{"id":"cap","price":1000000},{"id":"unsafe","price":"90071992547409.92"},{"id":"fallback","price":5}]'::jsonb,
  paid = paid || '{"fallback":{"payers":[],"total":0}}'::jsonb,
  selections = selections || '{"food":["A","B","C"]}'::jsonb where code='ABCDEFGH';
set role anon;
do $$ begin
  assert public.mark_paid('ABCDEFGH','food','A',3,334) = '{"success":true}'::jsonb;
  assert public.get_session('ABCDEFGH')->'selections'->'food' = '["B","C"]'::jsonb;
  assert public.mark_paid('ABCDEFGH','food','B',3,334) = '{"success":false,"amountChanged":true}'::jsonb;
  assert public.get_session('ABCDEFGH')->'paid'->'food'->'payers' = '["A"]'::jsonb;
  assert public.mark_paid('ABCDEFGH','food','B',99,333) = '{"success":true}'::jsonb;
  assert public.mark_paid('ABCDEFGH','food','C',3,333) = '{"success":true}'::jsonb;
  assert public.get_session('ABCDEFGH')->'selections'->'food' = '[]'::jsonb;
  assert public.set_selections('ABCDEFGH','B',array['food']);
  assert public.get_session('ABCDEFGH')->'selections'->'food' = '[]'::jsonb;
  assert public.mark_paid('ABCDEFGH','free','A',1,0) = '{"success":true}'::jsonb;
  assert public.mark_paid('ABCDEFGH','discount','A',1,0) = '{"success":false}'::jsonb;
  assert public.mark_paid('ABCDEFGH','invalid','A',1,0) = '{"success":false}'::jsonb;
  assert public.mark_paid('ABCDEFGH','cap','A',1,100000000) = '{"success":true}'::jsonb;
  assert public.mark_paid('ABCDEFGH','unsafe','A',1,0) = '{"success":false}'::jsonb;
  assert public.mark_paid('ABCDEFGH','fallback','A',2,250) = '{"success":true}'::jsonb;
  assert public.get_session('ABCDEFGH')->'paid'->'fallback'->>'total' = '2';
end $$;
\echo PASS: locked cent quotes, zero shares, amount bounds, legacy split fallback, selection pruning

reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
set role authenticated;
do $$ declare n integer; begin
  select count(*) into n from public.sessions;
  assert n = 0;
  select count(*) into n from public.profiles;
  assert n = 0;
  update public.profiles set full_name='hijacked' where id='00000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0;
  update public.sessions set table_name='hijacked' where code='ABCDEFGH';
  get diagnostics n = row_count;
  assert n = 0;
  begin
    insert into public.sessions(code,items,owner_id) values ('ZZZZZZZZ','[]','00000000-0000-0000-0000-000000000001');
    raise exception 'Owner spoofing unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
do $$ declare n integer; begin
  select count(*) into n from public.sessions;
  assert n = 1;
  select count(*) into n from public.profiles;
  assert n = 1;
  update public.profiles set full_name='Owner profile' where id='00000000-0000-0000-0000-000000000001';
  update public.sessions set table_name='Owner update' where code='ABCDEFGH';
  begin
    insert into public.sessions(code,items) values ('9876','[]');
    raise exception 'New legacy code unexpectedly allowed';
  exception when check_violation then null; end;
  begin
    update public.sessions set qr_image='https://evil.test/qr' where code='ABCDEFGH';
    raise exception 'Remote QR unexpectedly allowed';
  exception when check_violation then null; end;
  for i in 1..30 loop assert public.consume_ocr_quota(); end loop;
  assert not public.consume_ocr_quota();
end $$;
\echo PASS: owner isolation, owner updates, code/QR constraints, 30/day user quota
reset role;
delete from public.ocr_usage;
insert into auth.users select md5(n::text)::uuid from generate_series(1,67) n;
insert into public.ocr_usage select (now() at time zone 'UTC')::date, md5(n::text)::uuid, case when n=67 then 20 else 30 end from generate_series(1,67) n;
set role authenticated;
do $$ begin assert not public.consume_ocr_quota(); end $$;
\echo PASS: global 2000/day quota
reset role;
update public.sessions set concluded=true where code='ABCDEFGH';
set role anon;
do $$ begin
  assert public.get_session('ABCDEFGH') is null;
  assert public.mark_paid('ABCDEFGH','rice','Guest',1) = '{"success":false}'::jsonb;
  assert not public.set_selections('ABCDEFGH','Guest',array['rice']);
end $$;
\echo PASS: concluded session denies guest access and writes
reset role;
update public.sessions set concluded=false, paid='{}', selections='{}' where code='ABCDEFGH';

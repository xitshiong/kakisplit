begin;

alter table public.sessions enable row level security;
alter table public.profiles enable row level security;
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename in ('sessions', 'profiles') loop
    execute pg_catalog.format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;
revoke all on public.sessions, public.profiles from public, anon, authenticated;
grant select, insert, update, delete on public.sessions, public.profiles to authenticated;
create policy sessions_owner on public.sessions to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy profiles_self on public.profiles to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Preserve legacy-code updates but prevent new low-entropy codes after rollout.
create function public.require_secure_session_code() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (TG_OP = 'INSERT' or new.code is distinct from old.code) and new.code !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$' then
    raise exception 'New tables require an eight-character code' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger secure_session_code before insert or update of code on public.sessions
  for each row execute function public.require_secure_session_code();
commit;

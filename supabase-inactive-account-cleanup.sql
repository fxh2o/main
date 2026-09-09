-- AniPasta: automatic inactive-account cleanup
-- A 30-day inactivity window is reset by meaningful account activity:
-- login, anime watch/history update, favourites, and account/profile actions.

alter table public.profiles
  add column if not exists last_activity_at timestamptz;

create index if not exists profiles_last_activity_at_idx
  on public.profiles (last_activity_at);

create or replace function public.delete_inactive_anipasta_accounts()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  deleted_count integer := 0;
  target record;
begin
  for target in
    select u.id
    from auth.users u
    left join public.profiles p on p.id = u.id
    where coalesce(p.last_activity_at, u.last_sign_in_at, u.created_at) < now() - interval '30 days'
  loop
    delete from public.watch_history where user_id = target.id;
    delete from public.favorites where user_id = target.id;
    delete from public.profiles where id = target.id;
    delete from auth.users where id = target.id;
    deleted_count := deleted_count + 1;
  end loop;

  return deleted_count;
end;
$$;

revoke all on function public.delete_inactive_anipasta_accounts() from public;
revoke all on function public.delete_inactive_anipasta_accounts() from anon;
revoke all on function public.delete_inactive_anipasta_accounts() from authenticated;

-- The existing daily pg_cron job can keep calling the same function.

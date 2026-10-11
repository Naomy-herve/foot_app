-- Migration non destructive pour un projet FOOT26 Supabase EXISTANT.
-- Crée un limiteur atomique pour les tentatives d'inscription et de connexion.
create table if not exists public.auth_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table public.auth_rate_limits enable row level security;

create or replace function public.foot26_allow_auth_attempt(
  p_key text,
  p_limit integer default 10,
  p_window_seconds integer default 900
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
  v_now timestamptz := now();
begin
  if p_key is null or length(p_key) < 16 or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;
  insert into public.auth_rate_limits (bucket_key, window_started_at, attempts)
  values (p_key, v_now, 1)
  on conflict (bucket_key) do update
    set attempts = case
          when public.auth_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1
          else public.auth_rate_limits.attempts + 1
        end,
        window_started_at = case
          when public.auth_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now
          else public.auth_rate_limits.window_started_at
        end
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end;
$$;
revoke all on function public.foot26_allow_auth_attempt(text, integer, integer) from public;
revoke all on function public.foot26_allow_auth_attempt(text, integer, integer) from anon;
revoke all on function public.foot26_allow_auth_attempt(text, integer, integer) from authenticated;
grant execute on function public.foot26_allow_auth_attempt(text, integer, integer) to service_role;
revoke all on table public.auth_rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.auth_rate_limits to service_role;

-- Compte de démonstration non créé automatiquement. Pour promouvoir votre compte :
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where lower(email) = lower('votre-email@example.com'));

-- Cashier PIN-only login. PINs are globally unique and stored as bcrypt hashes.
create table if not exists public.cashier_pin_credentials (
  cashier_id uuid primary key references public.profiles(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  pin_hash text not null,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.cashier_pin_credentials enable row level security;
revoke all on public.cashier_pin_credentials from anon, authenticated;
grant all on public.cashier_pin_credentials to service_role;

create table if not exists public.cashier_pin_login_attempts (
  ip_key text primary key,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.cashier_pin_login_attempts enable row level security;
revoke all on public.cashier_pin_login_attempts from anon, authenticated;
grant all on public.cashier_pin_login_attempts to service_role;

create or replace function public.platform_set_cashier_pin(
  p_cashier_id uuid, p_business_id uuid, p_pin text, p_actor_id uuid
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_existing record;
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN must contain exactly 6 digits'; end if;
  perform pg_advisory_xact_lock(hashtext('jiuze_cashier_pin_unique'));
  if not exists (select 1 from public.profiles where id=p_cashier_id and business_id=p_business_id and role='cashier') then
    raise exception 'Cashier not found in this business';
  end if;
  if exists (select 1 from public.cashier_pin_credentials c where c.cashier_id <> p_cashier_id and crypt(p_pin,c.pin_hash)=c.pin_hash) then
    raise exception 'This PIN is already assigned. Choose a different PIN.';
  end if;
  insert into public.cashier_pin_credentials(cashier_id,business_id,pin_hash,updated_by,updated_at)
  values(p_cashier_id,p_business_id,crypt(p_pin,gen_salt('bf',10)),p_actor_id,now())
  on conflict(cashier_id) do update set business_id=excluded.business_id,pin_hash=excluded.pin_hash,updated_by=excluded.updated_by,updated_at=now();
end;
$$;

create or replace function public.platform_verify_cashier_pin(p_pin text)
returns table(cashier_id uuid, business_id uuid)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{6}$' then return; end if;
  return query
    select c.cashier_id,c.business_id
    from public.cashier_pin_credentials c
    join public.profiles p on p.id=c.cashier_id and p.business_id=c.business_id and p.role='cashier'
    where crypt(p_pin,c.pin_hash)=c.pin_hash
    limit 1;
end;
$$;

create or replace function public.platform_cashier_pin_failure(p_ip_key text)
returns table(failed_attempts integer, locked_until timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_count integer; v_lock timestamptz;
begin
  insert into public.cashier_pin_login_attempts(ip_key,failed_attempts,updated_at)
  values(p_ip_key,1,now())
  on conflict(ip_key) do update set
    failed_attempts=case when cashier_pin_login_attempts.locked_until is not null and cashier_pin_login_attempts.locked_until < now() then 1 else cashier_pin_login_attempts.failed_attempts+1 end,
    locked_until=case when (case when cashier_pin_login_attempts.locked_until is not null and cashier_pin_login_attempts.locked_until < now() then 1 else cashier_pin_login_attempts.failed_attempts+1 end)>=5 then now()+interval '15 minutes' else null end,
    updated_at=now()
  returning cashier_pin_login_attempts.failed_attempts,cashier_pin_login_attempts.locked_until into v_count,v_lock;
  return query select v_count,v_lock;
end;
$$;

create or replace function public.platform_cashier_pin_clear_attempts(p_ip_key text)
returns void language sql security definer set search_path = public
as $$ delete from public.cashier_pin_login_attempts where ip_key=p_ip_key; $$;

revoke all on function public.platform_set_cashier_pin(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.platform_verify_cashier_pin(text) from public, anon, authenticated;
revoke all on function public.platform_cashier_pin_failure(text) from public, anon, authenticated;
revoke all on function public.platform_cashier_pin_clear_attempts(text) from public, anon, authenticated;
grant execute on function public.platform_set_cashier_pin(uuid,uuid,text,uuid) to service_role;
grant execute on function public.platform_verify_cashier_pin(text) to service_role;
grant execute on function public.platform_cashier_pin_failure(text) to service_role;
grant execute on function public.platform_cashier_pin_clear_attempts(text) to service_role;

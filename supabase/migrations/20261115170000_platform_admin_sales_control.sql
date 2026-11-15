-- JIUZE platform-wide sales support and audited return processing
create table if not exists public.platform_admin_sales_audit (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('refund_recorded')),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_admin_sales_audit_sale_created_idx
  on public.platform_admin_sales_audit (sale_id, created_at desc);
alter table public.platform_admin_sales_audit enable row level security;
revoke all on public.platform_admin_sales_audit from anon, authenticated;
grant all on public.platform_admin_sales_audit to service_role;

do $$
declare
  v_definition text;
  v_old_signature text := 'public.process_sale_return(p_sale_id uuid, p_items jsonb, p_refund_method text, p_refund_reference text DEFAULT NULL::text, p_reason text DEFAULT ''Customer return''::text)';
  v_new_signature text := 'public.platform_admin_process_sale_return(p_admin_user_id uuid, p_business_id uuid, p_sale_id uuid, p_items jsonb, p_refund_method text, p_refund_reference text DEFAULT NULL::text, p_reason text DEFAULT ''Customer return''::text)';
  v_old_business_lookup text := E'select business_id\n  into v_business_id\n  from public.profiles\n  where id = v_user_id;';
  v_new_business_lookup text := E'v_business_id := p_business_id;\n\n  if not exists (select 1 from public.platform_admins where user_id = v_user_id and role = ''super_admin'') then\n    raise exception ''Platform administrator access required'' using errcode = ''42501'';\n  end if;';
begin
  if to_regprocedure('public.platform_admin_process_sale_return(uuid,uuid,uuid,jsonb,text,text,text)') is not null then
    raise notice 'platform_admin_process_sale_return already exists';
    return;
  end if;

  v_definition := pg_get_functiondef('public.process_sale_return(uuid,jsonb,text,text,text)'::regprocedure);
  v_definition := replace(v_definition, 'public.process_sale_return(', 'public.platform_admin_process_sale_return(');
  v_definition := replace(v_definition, v_old_signature, v_new_signature);
  v_definition := replace(v_definition, 'v_user_id                 uuid := auth.uid();', 'v_user_id                 uuid := p_admin_user_id;');
  v_definition := replace(v_definition, v_old_business_lookup, v_new_business_lookup);
  v_definition := replace(v_definition, '  perform public.assert_subscription_access();' || E'\n', '');
  v_definition := replace(v_definition,
    '  return jsonb_build_object(',
    E'  insert into public.platform_admin_sales_audit (business_id, sale_id, actor_user_id, action, reason, metadata)\n  values (v_business_id, p_sale_id, v_user_id, ''refund_recorded'', v_reason, jsonb_build_object(''return_id'', v_return_id, ''return_receipt_number'', v_return_receipt_number, ''refund_amount'', v_total_refund, ''refund_method'', p_refund_method, ''refund_reference'', v_refund_reference));\n\n  return jsonb_build_object('
  );

  if position('p_admin_user_id' in v_definition) = 0
     or position('p_business_id' in v_definition) = 0
     or position('Platform administrator access required' in v_definition) = 0
     or position('platform_admin_sales_audit' in v_definition) = 0 then
    raise exception 'Could not safely adapt existing return procedure; no admin return function was created';
  end if;

  execute v_definition;
  revoke all on function public.platform_admin_process_sale_return(uuid,uuid,uuid,jsonb,text,text,text) from public, anon, authenticated;
  grant execute on function public.platform_admin_process_sale_return(uuid,uuid,uuid,jsonb,text,text,text) to service_role;
end $$;

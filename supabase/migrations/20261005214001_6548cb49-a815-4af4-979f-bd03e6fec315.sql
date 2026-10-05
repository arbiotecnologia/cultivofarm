create or replace function public.d51_5_p0d_ab_selftest()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_result jsonb;
begin
  if coalesce(current_setting('app.d51_5_p0d_selftest', true), '') <> 'enabled' then
    raise exception 'P0D_SELFTEST_DISABLED' using errcode = '42501';
  end if;

  -- Structural A/B assertions: every direct production surface must have a restrictive
  -- tenant policy; no historic true policy may survive; operational definers are not
  -- executable by signed-in callers until they embed resource-tenant checks.
  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('clientes','fazendas','talhoes','ordens_servico','lotes','envase','controle_qualidade')
      and p.policyname = 'tenant_isolation_d51_5'
      and p.permissive <> 'RESTRICTIVE'
  ) or (
    select count(*) from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('clientes','fazendas','talhoes','ordens_servico','lotes','envase','controle_qualidade')
      and p.policyname = 'tenant_isolation_d51_5'
      and p.permissive = 'RESTRICTIVE'
  ) <> 7 then
    raise exception 'P0D_RESTRICTIVE_TENANT_POLICY_MISSING';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('lotes','envase','controle_qualidade')
      and (p.qual = 'true' or p.with_check = 'true')
  ) then
    raise exception 'P0D_TRUE_POLICY_SURVIVED';
  end if;

  if has_function_privilege('authenticated', 'public.rpc_programar_os_v1(uuid,text,date)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rpc_avancar_esteira_laboratorio(uuid,text,text,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)', 'EXECUTE') then
    raise exception 'P0D_UNSCOPED_DEFINER_STILL_EXECUTABLE';
  end if;

  v_result := jsonb_build_object(
    'tenant_restrictive_policies', 7,
    'legacy_true_policies', 0,
    'unscoped_cockpit_rpcs_executable', false,
    'transactional', true
  );
  return v_result;
end
$fn$;
revoke execute on function public.d51_5_p0d_ab_selftest() from public, anon, authenticated;
grant execute on function public.d51_5_p0d_ab_selftest() to service_role;
comment on function public.d51_5_p0d_ab_selftest() is 'D51.5 P0-D structural A/B self-test; service role only and disabled unless transaction-local gate is enabled.';
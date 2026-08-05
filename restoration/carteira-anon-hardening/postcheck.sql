-- =====================================================================
-- POSTCHECK — CORREÇÃO 1 (HARDENING DE CARTEIRA E ANON)
-- Somente leitura. Fail-closed: qualquer desvio => EXCEPTION.
-- psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f postcheck.sql
-- =====================================================================
DO $pc$
DECLARE
  v_marker text; v_ref text;
  v_def text;
  v_roles text;
  v_anon int; v_public int; v_auth text; v_svc int;
  v_rls boolean;
  v_pol int;
BEGIN
  -- ambiente
  EXECUTE 'SELECT marker, project_ref FROM public._fiscal_staging_marker' INTO v_marker, v_ref;
  IF COALESCE(v_marker,'') <> 'STAGING' OR COALESCE(v_ref,'') <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: ambiente nao autorizado';
  END IF;

  -- 1. função canônica endurecida
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='can_user_access_cliente';
  IF v_def IS NULL THEN RAISE EXCEPTION 'POSTCHECK_FAIL: can_user_access_cliente ausente'; END IF;
  IF v_def NOT LIKE '%has_active_user_cliente_access%' THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: branch tecnico nao delega para has_active_user_cliente_access';
  END IF;
  IF v_def LIKE '%FROM user_clientes uc%' THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: leitura direta de user_clientes sem filtro ativo persiste';
  END IF;
  IF v_def NOT LIKE '%SECURITY DEFINER%' OR v_def NOT LIKE '%search_path TO ''public''%' THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: SECURITY DEFINER/search_path divergente';
  END IF;

  -- 2. policy de SELECT restrita a authenticated
  SELECT array_to_string(roles, ',') INTO v_roles
    FROM pg_policies
   WHERE schemaname='public' AND tablename='registros_consultor'
     AND policyname='registros_consultor_select_hardened';
  IF COALESCE(v_roles,'') <> 'authenticated' THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: policy de SELECT com roles=% (esperado authenticated)', v_roles;
  END IF;

  -- 3. nenhuma policy permissiva alcançando anon/public
  SELECT count(*) INTO v_pol
    FROM pg_policies
   WHERE schemaname='public' AND tablename='registros_consultor'
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_pol <> 0 THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: % policy(ies) de registros_consultor alcancam anon/public', v_pol;
  END IF;

  -- 4. ACLs
  SELECT count(*) INTO v_anon FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='registros_consultor' AND grantee='anon';
  IF v_anon <> 0 THEN RAISE EXCEPTION 'POSTCHECK_FAIL: anon ainda possui % grants', v_anon; END IF;

  SELECT count(*) INTO v_public FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='registros_consultor' AND grantee='PUBLIC';
  IF v_public <> 0 THEN RAISE EXCEPTION 'POSTCHECK_FAIL: PUBLIC possui grants'; END IF;

  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO v_auth
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='registros_consultor' AND grantee='authenticated';
  IF COALESCE(v_auth,'') <> 'DELETE,INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: grants de authenticated = % (esperado DELETE,INSERT,SELECT,UPDATE)', v_auth;
  END IF;

  SELECT count(*) INTO v_svc FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='registros_consultor' AND grantee='service_role';
  IF v_svc < 4 THEN RAISE EXCEPTION 'POSTCHECK_FAIL: service_role sem privilegios suficientes'; END IF;

  -- 5. RLS habilitada
  SELECT relrowsecurity INTO v_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='registros_consultor';
  IF COALESCE(v_rls,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: RLS desabilitada em registros_consultor';
  END IF;

  -- 6. triggers habilitados
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='registros_consultor'
       AND NOT t.tgisinternal AND t.tgenabled = 'D'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: trigger desabilitado em registros_consultor';
  END IF;

  -- 7. zero fixtures de teste residuais
  IF EXISTS (SELECT 1 FROM public.registros_consultor
              WHERE COALESCE(problema_principal,'') LIKE 'C1\_CARTEIRA\_%' ESCAPE '\'
                 OR COALESCE(codigo_visita,'') LIKE 'C1\_CARTEIRA\_%' ESCAPE '\') THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: fixtures C1_CARTEIRA_ residuais';
  END IF;

  RAISE NOTICE 'POSTCHECK_CARTEIRA_ANON_PASS';
END
$pc$;

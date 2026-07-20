
-- Fase 6A
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true AND p.prorettype='trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, PUBLIC', r.sig);
  END LOOP;
END $$;

-- Fase 6B
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname NOT IN ('rpc_validar_comprovante_entrega','rpc_validar_rastreio_produto')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_validar_comprovante_entrega(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_validar_rastreio_produto(uuid)   TO anon, authenticated;

-- Fase 6C: SECURITY DEFINER views → security_invoker
DO $$
DECLARE v_def text;
BEGIN
  -- _src_vw_esteira_laboratorio: recreate in-place using CREATE OR REPLACE (preserves matview dependency)
  SELECT pg_get_viewdef('public._src_vw_esteira_laboratorio'::regclass, true) INTO v_def;
  EXECUTE 'CREATE OR REPLACE VIEW public._src_vw_esteira_laboratorio WITH (security_invoker=true) AS ' || v_def;
  REVOKE ALL ON public._src_vw_esteira_laboratorio FROM anon, authenticated, PUBLIC;

  -- vw_os_integridade_esteira: same approach
  SELECT pg_get_viewdef('public.vw_os_integridade_esteira'::regclass, true) INTO v_def;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_os_integridade_esteira WITH (security_invoker=true) AS ' || v_def;
  GRANT SELECT ON public.vw_os_integridade_esteira TO anon, authenticated;
END $$;

-- Fase 6D: tighten always-true audit policies
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_senha_log;
CREATE POLICY "System can insert audit logs" ON public.audit_senha_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "catalog_audit_insert_any" ON public.catalog_technical_audit_logs;
CREATE POLICY "catalog_audit_insert_any" ON public.catalog_technical_audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

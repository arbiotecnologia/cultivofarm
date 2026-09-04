-- H7O P2 — Revogação individual de EXECUTE (authenticated) em helpers internos SECURITY DEFINER
-- sem consumidor direto comprovado, e retirada de grants excedentes em communication_provider_settings.
-- Escopo: staging ikaauvsflpmamgxmkhoq. Idempotente e reversível
-- (restoration/homologacao-h7/h7o-rollbacks/rollback-20260930010000.sql).
--
-- Evidência (restoration/homologacao-h7/h7o-inventario/secdef_classification.tsv + call_graph.tsv +
-- repo_refs.tsv + verificação de catálogo executada abaixo): cada assinatura é chamada APENAS por
-- funções SECURITY DEFINER (owner postgres, que mantém EXECUTE implícito) e não é referenciada por
-- frontend (src/), Edge Functions (supabase/functions/), policies, views, triggers, cron ou storage.
--
-- NÃO revogada (decisão documentada): rpc_regulatory_sod_override(uuid,text) — é ponto de entrada
-- administrativo desenhado para chamada direta (rpc_regulatory_review_decide orienta seu uso no HINT
-- REGULATORY_SEGREGATION_OF_DUTIES) e o harness fase-f2 exercita sua própria guarda como authenticated.
--
-- rpc_substituir_etiqueta_produto(uuid,text): DML, guarda fraca (apenas auth.uid() IS NOT NULL) e
-- ZERO consumidores em src/, supabase/functions/ e harnesses → revogada de authenticated
-- (service_role e owner preservados; rollback disponível).

-- Pré-condição fail-fast (catálogo): nenhuma das assinaturas pode ter consumidor por pg_depend
-- (policy/view/trigger/constraint/default), caller SECURITY INVOKER em qualquer schema, nem job do pg_cron.
DO $pre$
DECLARE
  v_sigs text[] := ARRAY[
    'public._assert_visita_editavel(uuid)',
    'public._comunicacao_require_admin()',
    'public._rpc_avancar_esteira_laboratorio_internal(uuid,text,text,uuid)',
    'public.can_checkin_technical_visit(uuid,uuid)',
    'public.can_user_access_cliente(uuid,uuid)',
    'public.can_view_bi_operacional(uuid)',
    'public.fn_cockpit_assert_operador()',
    'public.fn_entrega_assert_confirmador(text)',
    'public.fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb)',
    'public.fn_estoque_pode_operar(uuid,text)',
    'public.generate_production_orders_from_partner(uuid)',
    'public.get_b2b_user_role_for_partner(uuid,uuid)',
    'public.is_operational_staff(uuid)',
    'public.is_valid_b2b_partner_user(uuid,uuid)',
    'public.is_visit_org_manager(uuid,uuid)',
    'public.log_report_view(text,jsonb)',
    'public.rpc_gerar_alertas_operacionais()',
    'public.rpc_recalcular_prioridade_alerta(uuid)',
    'public.rpc_substituir_etiqueta_produto(uuid,text)'
  ];
  v_sig text;
  v_oid oid;
  v_name text;
  v_problems text := '';
  v_n int;
  v_has_cron boolean := EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');
BEGIN
  FOREACH v_sig IN ARRAY v_sigs LOOP
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NULL THEN
      v_problems := v_problems || format(' [ausente:%s]', v_sig);
      CONTINUE;
    END IF;
    SELECT proname INTO v_name FROM pg_proc WHERE oid = v_oid;

    -- (a) consumidores estruturais via pg_depend
    SELECT count(*) INTO v_n
      FROM pg_depend d
     WHERE d.refclassid = 'pg_proc'::regclass AND d.refobjid = v_oid AND d.deptype IN ('n','a')
       AND d.classid IN ('pg_rewrite'::regclass,'pg_policy'::regclass,'pg_trigger'::regclass,
                         'pg_constraint'::regclass,'pg_attrdef'::regclass,'pg_event_trigger'::regclass);
    IF v_n > 0 THEN v_problems := v_problems || format(' [pg_depend:%s=%s]', v_sig, v_n); END IF;

    -- (b) callers SECURITY INVOKER (qualquer schema não-sistema) — quebrariam ao perder EXECUTE
    SELECT count(*) INTO v_n
      FROM pg_proc f JOIN pg_namespace fn ON fn.oid = f.pronamespace
     WHERE f.oid <> v_oid
       AND fn.nspname NOT IN ('pg_catalog','information_schema')
       AND NOT f.prosecdef
       AND f.prosrc ~ ('\m' || v_name || '\s*\(');
    IF v_n > 0 THEN v_problems := v_problems || format(' [caller_invoker:%s=%s]', v_sig, v_n); END IF;

    -- (c) jobs do pg_cron
    IF v_has_cron THEN
      EXECUTE format('SELECT count(*) FROM cron.job j WHERE j.command ~ %L', '\m' || v_name || '\s*\(') INTO v_n;
      IF v_n > 0 THEN v_problems := v_problems || format(' [cron:%s=%s]', v_sig, v_n); END IF;
    END IF;
  END LOOP;

  IF v_problems <> '' THEN
    RAISE EXCEPTION 'H7O P2 ABORT: consumidores detectados:%', v_problems;
  END IF;
END
$pre$;

-- Revogações individuais (owner postgres e service_role preservados).
REVOKE EXECUTE ON FUNCTION public._assert_visita_editavel(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._comunicacao_require_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_checkin_technical_visit(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_user_access_cliente(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_view_bi_operacional(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_cockpit_assert_operador() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_entrega_assert_confirmador(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_estoque_pode_operar(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_production_orders_from_partner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_b2b_user_role_for_partner(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_operational_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_valid_b2b_partner_user(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_visit_org_manager(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_report_view(text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_gerar_alertas_operacionais() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_recalcular_prioridade_alerta(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_substituir_etiqueta_produto(uuid,text) FROM PUBLIC, anon, authenticated;

-- communication_provider_settings: RLS já habilitada sem policies (fail-closed); único leitor real é a
-- Edge Function communication-provider-settings via service_role. Remove grants excedentes ALL de anon/authenticated.
REVOKE ALL ON TABLE public.communication_provider_settings FROM PUBLIC, anon, authenticated;

-- Pós-condição fail-fast.
DO $post$
DECLARE
  v_bad text := '';
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public._assert_visita_editavel(uuid)',
    'public._comunicacao_require_admin()',
    'public._rpc_avancar_esteira_laboratorio_internal(uuid,text,text,uuid)',
    'public.can_checkin_technical_visit(uuid,uuid)',
    'public.can_user_access_cliente(uuid,uuid)',
    'public.can_view_bi_operacional(uuid)',
    'public.fn_cockpit_assert_operador()',
    'public.fn_entrega_assert_confirmador(text)',
    'public.fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb)',
    'public.fn_estoque_pode_operar(uuid,text)',
    'public.generate_production_orders_from_partner(uuid)',
    'public.get_b2b_user_role_for_partner(uuid,uuid)',
    'public.is_operational_staff(uuid)',
    'public.is_valid_b2b_partner_user(uuid,uuid)',
    'public.is_visit_org_manager(uuid,uuid)',
    'public.log_report_view(text,jsonb)',
    'public.rpc_gerar_alertas_operacionais()',
    'public.rpc_recalcular_prioridade_alerta(uuid)',
    'public.rpc_substituir_etiqueta_produto(uuid,text)'
  ] LOOP
    IF has_function_privilege('authenticated', v_sig, 'EXECUTE')
       OR has_function_privilege('anon', v_sig, 'EXECUTE') THEN
      v_bad := v_bad || ' ' || v_sig;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.communication_provider_settings', 'SELECT')
     OR has_table_privilege('anon', 'public.communication_provider_settings', 'SELECT') THEN
    v_bad := v_bad || ' communication_provider_settings(grant)';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.communication_provider_settings', 'SELECT') THEN
    v_bad := v_bad || ' communication_provider_settings(service_role perdeu SELECT)';
  END IF;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'H7O P2 ABORT: pós-condição violada:%', v_bad;
  END IF;
END
$post$;

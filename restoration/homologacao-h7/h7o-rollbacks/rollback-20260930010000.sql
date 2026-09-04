-- H7O P2 ROLLBACK — devolve EXECUTE a authenticated nas 19 assinaturas revogadas por
-- 20260930010000_h7o_p2_revogacoes_helpers_v1 e restaura os grants anteriores (ALL para anon/authenticated)
-- em public.communication_provider_settings. Estado anterior = pós-H7N. Idempotente.
-- Executar via restoration/os-e2e/staging-psql.sh -1 -f <este arquivo>.
begin;

GRANT EXECUTE ON FUNCTION public._assert_visita_editavel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._comunicacao_require_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_checkin_technical_visit(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_user_access_cliente(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_bi_operacional(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cockpit_assert_operador() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entrega_assert_confirmador(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_estoque_pode_operar(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_production_orders_from_partner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_b2b_user_role_for_partner(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_operational_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_b2b_partner_user(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_visit_org_manager(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_report_view(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_gerar_alertas_operacionais() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_recalcular_prioridade_alerta(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_substituir_etiqueta_produto(uuid,text) TO authenticated;

-- Estado anterior (excedente, mas fiel): ALL para anon/authenticated. RLS sem policies continua negando linhas.
GRANT ALL ON TABLE public.communication_provider_settings TO anon, authenticated;

DO $post$
DECLARE v_bad text := ''; v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public._assert_visita_editavel(uuid)','public._comunicacao_require_admin()',
    'public._rpc_avancar_esteira_laboratorio_internal(uuid,text,text,uuid)',
    'public.can_checkin_technical_visit(uuid,uuid)','public.can_user_access_cliente(uuid,uuid)',
    'public.can_view_bi_operacional(uuid)','public.fn_cockpit_assert_operador()',
    'public.fn_entrega_assert_confirmador(text)','public.fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb)',
    'public.fn_estoque_pode_operar(uuid,text)','public.generate_production_orders_from_partner(uuid)',
    'public.get_b2b_user_role_for_partner(uuid,uuid)','public.is_operational_staff(uuid)',
    'public.is_valid_b2b_partner_user(uuid,uuid)','public.is_visit_org_manager(uuid,uuid)',
    'public.log_report_view(text,jsonb)','public.rpc_gerar_alertas_operacionais()',
    'public.rpc_recalcular_prioridade_alerta(uuid)','public.rpc_substituir_etiqueta_produto(uuid,text)'
  ] LOOP
    IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN v_bad := v_bad || ' ' || v_sig; END IF;
  END LOOP;
  IF v_bad <> '' THEN RAISE EXCEPTION 'H7O P2 ROLLBACK ABORT: EXECUTE não restaurado:%', v_bad; END IF;
END $post$;
commit;

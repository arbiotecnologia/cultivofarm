REVOKE ALL ON FUNCTION public.fn_cockpit_stage(text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_cockpit_assert_operador() FROM anon;
REVOKE ALL ON FUNCTION public.fn_cockpit_is_hml_environment() FROM anon;
REVOKE ALL ON FUNCTION public.rpc_cockpit_metricas_v1() FROM anon;
REVOKE ALL ON FUNCTION public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_cockpit_cancelar_reserva_v1(uuid,uuid,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.seed_cockpit_fixtures(text) FROM anon;
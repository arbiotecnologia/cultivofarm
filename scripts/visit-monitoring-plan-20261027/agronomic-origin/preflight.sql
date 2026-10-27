-- READ-ONLY. Run on swzpzcwiasxmjutrmvkm only; abort if any value differs from README capture.
SELECT p.oid::regprocedure AS fn, md5(pg_get_functiondef(p.oid)) AS md5, p.proacl, p.prosecdef, pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p WHERE p.proname IN ('rpc_reprogramar_monitoramento_v1','rpc_criar_alerta_climatico_v1','guard_visit_plan_preservation',
 'save_visit_monitoring_plan_core','rpc_salvar_plano_monitoramento_visita_v1','_visita_lock_and_check','can_manage_technical_visit',
 'monitoring_refs_in_actor_tenant','technical_actor_ready','enforce_visit_immutability','rpc_atualizar_status_alerta_agronomico_v1',
 'acquire_gate','rpc_reprogramar_monitoramento_v2','rpc_vincular_origem_alerta_v1','rpc_listar_alertas_vinculaveis_v1') ORDER BY 1;
SELECT c.relname, t.tgname, t.tgfoid::regprocedure, t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE NOT t.tgisinternal AND c.relname IN ('alertas_agronomicos','registros_consultor','user_roles','profiles','monitoramento_avisos') ORDER BY 1,2;
SELECT polname, polcmd, pg_get_expr(polqual,polrelid) qual, pg_get_expr(polwithcheck,polrelid) chk FROM pg_policy
WHERE polrelid='public.alertas_agronomicos'::regclass ORDER BY 1;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.alertas_agronomicos'::regclass ORDER BY 1;
SELECT to_regclass('platform_private.visit_plan_write_tickets') tickets, to_regclass('platform_private.monitoring_alert_receipts') receipts;
-- Dependency: who else calls the v1 RPC (must be only the published client).
SELECT p.oid::regprocedure FROM pg_proc p WHERE p.prosrc LIKE '%rpc_reprogramar_monitoramento_v1%' AND p.proname<>'rpc_reprogramar_monitoramento_v1';

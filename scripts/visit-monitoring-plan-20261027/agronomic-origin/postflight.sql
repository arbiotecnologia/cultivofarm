-- READ-ONLY after install. Record outputs as new baseline hashes.
SELECT p.oid::regprocedure, md5(pg_get_functiondef(p.oid)), p.proacl FROM pg_proc p
WHERE p.proname IN ('rpc_reprogramar_monitoramento_v1','rpc_reprogramar_monitoramento_v2','rpc_vincular_origem_alerta_v1',
 'rpc_listar_alertas_vinculaveis_v1','reschedule_monitoring_core','link_alert_origin_core','guard_alert_origin_sync','list_linkable_alerts_core','guard_visit_plan_preservation','save_visit_monitoring_plan_core','rpc_salvar_plano_monitoramento_visita_v1') ORDER BY 1;
SELECT has_table_privilege('authenticated','platform_private.monitoring_alert_receipts','SELECT') AS auth_reads_receipts;

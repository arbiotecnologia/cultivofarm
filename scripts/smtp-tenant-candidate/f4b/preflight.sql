-- READ ONLY. Run on swzpzcwiasxmjutrmvkm before applying F4b. Returns no secret material.
SELECT current_setting('server_version_num') AS pg,
 to_regclass('platform_private.tenant_smtp_f4_gate') IS NOT NULL AS f4a_installed,
 (SELECT approved FROM platform_private.tenant_smtp_f4_gate) AS f4_gate,
 to_regclass('platform_private.tenant_smtp_dispatch_gate') IS NOT NULL AS f4b_already_present,
 has_schema_privilege('service_role','platform_private','USAGE') AS service_platform_private_usage_must_be_false,
 (SELECT count(*) FROM pg_policy WHERE polrelid='public.comunicacao_outbox'::regclass AND polname='notif3_global_client_containment' AND NOT polpermissive) AS restrictive_policy_must_be_1,
 (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.comunicacao_eventos'::regclass AND NOT tgisinternal) AS eventos_triggers_review,
 (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.portal_solicitacoes'::regclass AND NOT tgisinternal) AS solicitacoes_triggers_review,
 (SELECT count(*) FROM platform_private.tenant_smtp_activation WHERE active) AS active_tenants_must_be_0,
 md5(pg_get_functiondef('platform_private.notification_outbox_closed()'::regprocedure)) AS outbox_closed_md5,
 md5(pg_get_functiondef('public.rpc_claim_communication_outbox(integer,text,integer)'::regprocedure)) AS global_claim_md5;

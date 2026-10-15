-- Ref canônico verificado fora do SQL. SELECT-only; mismatch aborta.
SELECT 1 / CASE WHEN
 (SELECT md5(string_agg(t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\n' ORDER BY t.tgname))
 FROM pg_trigger t WHERE t.tgrelid='public.portal_solicitacoes'::regclass AND NOT t.tgisinternal)='ed8985865c3b137d37920d32af22ae95'
 AND (SELECT md5(string_agg(policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\n' ORDER BY policyname))
 FROM pg_policies WHERE schemaname='public' AND tablename='portal_solicitacoes')='60f15722ac8eb52e44fc8dbbb510196e'
 AND to_regprocedure('public.producer_request_mutation_guard()') IS NULL
 AND (SELECT md5(string_agg(column_name||'|'||udt_name||'|'||is_nullable||'|'||coalesce(column_default,''),E'\n' ORDER BY ordinal_position))
 FROM information_schema.columns WHERE table_schema='public' AND table_name='portal_solicitacoes')='e0affc7044459dd936434ed2eb383abc'
 AND (SELECT md5(pg_get_functiondef('public.get_cliente_ids_for_user(uuid)'::regprocedure)))='c80d5900692d960f649d0a9f7850fe2c'
 AND (SELECT md5(pg_get_functiondef('public.technical_actor_ready(uuid)'::regprocedure)))='b5d0994b6eb976b14122cd2a1ec798cf'
 AND (SELECT md5(pg_get_functiondef('public.technical_refs_in_actor_tenant(uuid,uuid,uuid)'::regprocedure)))='1d178d4acb1439a16600cab10b63f29e'
 AND (SELECT relowner::regrole::text FROM pg_class WHERE oid='public.portal_solicitacoes'::regclass)='postgres'
 AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='portal_solicitacoes' AND policyname LIKE 'producer_request_rollback_%')
 AND has_table_privilege('authenticated','public.portal_solicitacoes','INSERT,UPDATE')
 AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.portal_solicitacoes'::regclass)
 THEN 1 ELSE 0 END AS baseline_matches;
BEGIN READ ONLY;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
DO $guard$ DECLARE v_hash text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'canonical_ref_required'; END IF;
 SELECT md5(string_agg(x,'|' ORDER BY x)) INTO v_hash FROM (
 SELECT 'column:'||column_name||':'||data_type||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,'') x FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos'
 UNION ALL SELECT 'constraint:'||conname||':'||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.produtos'::regclass
 UNION ALL SELECT 'policy:'||policyname||':'||permissive||':'||roles::text||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,'') FROM pg_policies WHERE schemaname='public' AND tablename='produtos'
 UNION ALL SELECT 'trigger:'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)) FROM pg_trigger t WHERE t.tgrelid='public.produtos'::regclass AND NOT t.tgisinternal) c;
 IF v_hash IS DISTINCT FROM 'e7a6b74c06768dbc38a8c725ecbdc2d2' THEN RAISE EXCEPTION 'product_catalog_drift'; END IF;
 IF md5(pg_get_functiondef('platform_private.lab_item_is_manufacturable(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '853595394240e8f2a61ac2d621118271' THEN RAISE EXCEPTION 'manufacturability_drift'; END IF;
 IF EXISTS(SELECT 1 FROM public.produtos WHERE id='1986af48-709f-4bf4-85b4-3c9ed8a61019' OR codigo='AUD-APP-20261019-01' OR nome='TESTE AUDITORIA BIOLOGICO APLICACAO 20261019') THEN RAISE EXCEPTION 'fixture_destination_occupied'; END IF;
END $guard$;
ROLLBACK;

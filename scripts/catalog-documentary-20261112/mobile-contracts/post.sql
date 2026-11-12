BEGIN;
DO $$ DECLARE fn regprocedure; BEGIN
 IF EXISTS(SELECT 1 FROM platform_private.catalog_extensions_gate_v1 WHERE enabled) THEN RAISE EXCEPTION 'GATE_MUST_BE_OFF'; END IF;
 FOREACH fn IN ARRAY ARRAY['public.tenant_catalog_extensions_read_v1(text,text,uuid)'::regprocedure,'public.tenant_catalog_extensions_save_v1(text,text,uuid,uuid,timestamptz,jsonb,uuid)'::regprocedure,'public.tenant_catalog_active_families_v1()'::regprocedure] LOOP
  IF has_function_privilege('anon',fn,'EXECUTE') OR has_function_privilege('authenticated',fn,'EXECUTE') OR has_function_privilege('service_role',fn,'EXECUTE') THEN RAISE EXCEPTION 'CLIENT_EXECUTE_OPEN'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('platform_private.catalog_own_problems_v1'::regclass,'platform_private.catalog_profile_links_v1'::regclass) AND NOT relrowsecurity) THEN RAISE EXCEPTION 'RLS_MISSING'; END IF;
END $$;
COMMIT;

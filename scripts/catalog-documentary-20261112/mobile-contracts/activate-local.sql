-- DISPOSABLE LOCAL TEST ONLY. Never apply this activation to hosted environments.
BEGIN;
DO $$ BEGIN IF current_setting('catalog.test.disposable',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'DISPOSABLE_ONLY'; END IF; END $$;
UPDATE platform_private.catalog_extensions_gate_v1 SET enabled=true WHERE singleton;
GRANT USAGE ON SCHEMA platform_private TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.catalog_extensions_read_core_v1(text,text,uuid),platform_private.catalog_extensions_save_core_v1(text,text,uuid,uuid,timestamptz,jsonb,uuid),public.tenant_catalog_extensions_read_v1(text,text,uuid),public.tenant_catalog_extensions_save_v1(text,text,uuid,uuid,timestamptz,jsonb,uuid),public.tenant_catalog_active_families_v1() TO authenticated;
COMMIT;

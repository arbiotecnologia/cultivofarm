BEGIN;
UPDATE platform_private.catalog_extensions_gate_v1 SET enabled=false WHERE singleton;
REVOKE ALL ON FUNCTION platform_private.catalog_extensions_read_core_v1(text,text,uuid),platform_private.catalog_extensions_save_core_v1(text,text,uuid,uuid,timestamptz,jsonb,uuid),public.tenant_catalog_extensions_read_v1(text,text,uuid),public.tenant_catalog_extensions_save_v1(text,text,uuid,uuid,timestamptz,jsonb,uuid),public.tenant_catalog_active_families_v1() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;

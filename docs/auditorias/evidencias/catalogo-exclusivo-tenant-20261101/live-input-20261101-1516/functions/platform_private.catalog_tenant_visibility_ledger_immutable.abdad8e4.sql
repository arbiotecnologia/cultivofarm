CREATE OR REPLACE FUNCTION platform_private.catalog_tenant_visibility_ledger_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN RAISE EXCEPTION 'catalog_visibility_ledger_immutable' USING ERRCODE='42501'; END; $function$

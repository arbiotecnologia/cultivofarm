-- INSTALADO pelo auditor em 2026-10-16 (migration 20261016234052).
-- Arquivo de evidência: SQL exato lido do ledger supabase_migrations.schema_migrations.
-- NÃO reaplicar. MD5 live confirmado após aplicação: c610786fc9f6d6a44453b9e63c91e974
-- (baseline anterior: c0acb1dcd7f0b183f9500f4c264c1fa1).
-- ACL preservada: anon EXECUTE=false, authenticated EXECUTE=true.
-- Close the revoked-link gap in the two-argument overload only.
-- Preserve all other branches, signature, owner, ACL and search_path.
DO $migration$
DECLARE
  v_definition text;
  v_marker text := E'      AND uc.is_active = true\n      AND (uc.valid_from';
BEGIN
  SELECT pg_get_functiondef('public.can_user_access_cliente(uuid,uuid)'::regprocedure)
    INTO v_definition;
  IF md5(v_definition) IS DISTINCT FROM 'c0acb1dcd7f0b183f9500f4c264c1fa1' THEN
    RAISE EXCEPTION 'client_access_overload_definition_drift';
  END IF;
  IF (length(v_definition)-length(replace(v_definition,v_marker,'')))/length(v_marker) <> 1 THEN
    RAISE EXCEPTION 'client_access_overload_marker_drift';
  END IF;
  EXECUTE replace(v_definition,v_marker,E'      AND uc.is_active = true\n      AND uc.revoked_at IS NULL\n      AND (uc.valid_from');
END
$migration$;

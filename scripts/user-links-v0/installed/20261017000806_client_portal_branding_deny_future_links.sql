-- INSTALADO pelo auditor em 2026-10-17 (migration 20261017000806).
-- Arquivo de evidência: SQL exato lido do ledger supabase_migrations.schema_migrations.
-- NÃO reaplicar.
-- Única adição em public.save_client_portal_branding(uuid,text,text,text):
--   AND (uc.valid_from IS NULL OR uc.valid_from <= now())
-- MD5 da função: antes 36897b8731527d5a22ba4a995b337a93, depois
-- 2471d0af39864bf3093d24371aa6dbc6. ACL anon=false/authenticated=true preservada.
-- Hosted: 5 casos BEGIN/ROLLBACK PASS (válido/revogado/inativo/futuro/expirado);
-- perfil inativo negado pelo guard de tenant já existente.
DO $audit$
DECLARE source text;
BEGIN
  source := pg_get_functiondef('public.save_client_portal_branding(uuid,text,text,text)'::regprocedure);
  IF md5(source) <> '36897b8731527d5a22ba4a995b337a93' THEN
    RAISE EXCEPTION 'branding_preflight_changed';
  END IF;
  source := replace(source,
    '      AND uc.revoked_at IS NULL',
    E'      AND uc.revoked_at IS NULL\n      AND (uc.valid_from IS NULL OR uc.valid_from <= now())');
  EXECUTE source;
END
$audit$;

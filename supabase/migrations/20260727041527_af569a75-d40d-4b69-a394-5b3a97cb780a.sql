-- Fix: revoke anon EXECUTE from legacy 8-arg overload of rpc_create_portal_notification_secure.
-- Staging-only guard.
DO $$
DECLARE v_ref text;
BEGIN
  SELECT current_setting('app.settings.project_ref', true) INTO v_ref;
  -- Fallback: inspect DSN-independent marker. If not available, allow (project ref only enforced when set).
  IF v_ref IS NOT NULL AND v_ref <> '' AND v_ref <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'REF GUARD: expected ikaauvsflpmamgxmkhoq, got %', v_ref;
  END IF;
END $$;

-- Precheck: RPC alvo existe.
DO $$
BEGIN
  IF to_regprocedure('public.rpc_create_portal_notification_secure(uuid,text,text,text,text,text,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK: RPC alvo ausente (8-arg overload)';
  END IF;
END $$;

-- Ação: revoke amplo e re-grant mínimo.
REVOKE ALL ON FUNCTION public.rpc_create_portal_notification_secure(
  uuid, text, text, text, text, text, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_portal_notification_secure(
  uuid, text, text, text, text, text, uuid, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_portal_notification_secure(
  uuid, text, text, text, text, text, uuid, text
) TO authenticated, service_role;

-- Postcheck ACL via has_function_privilege por OID.
DO $$
DECLARE
  v_oid oid := to_regprocedure('public.rpc_create_portal_notification_secure(uuid,text,text,text,text,text,uuid,text)');
BEGIN
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK: anon ainda possui EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK: authenticated deveria ter EXECUTE';
  END IF;
  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK: service_role deveria ter EXECUTE';
  END IF;
  -- PUBLIC não deve ter (é a soma de todos; se anon foi removido, ok)
  RAISE NOTICE 'POSTCHECK OK: anon revogado; authenticated+service_role preservados';
END $$;

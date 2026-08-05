DO $guard$
DECLARE v_ref text; c_expected constant text := 'ikaauvsflpmamgxmkhoq'; c_prod constant text := 'navfzbwgwzruipouyfnk';
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: marcador de staging inexistente';
  END IF;
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS NULL OR v_ref = c_prod OR v_ref IS DISTINCT FROM c_expected THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente % nao autorizado', coalesce(v_ref,'<null>');
  END IF;
END $guard$;

DO $patch$
DECLARE v_oid oid; v_def text; v_new text;
BEGIN
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_criar_visita_idempotente';
  v_def := pg_get_functiondef(v_oid);
  v_new := replace(v_def, '''ajuste_solicitado'',', '');
  v_new := replace(v_new, ',''ajuste_solicitado''', '');
  v_new := replace(v_new, ''', ''ajuste_solicitado''', '''');
  IF v_new = v_def THEN
    RAISE NOTICE 'PATCH_SKIP: literal inexistente ja removido';
  ELSE
    EXECUTE v_new;
    RAISE NOTICE 'PATCH_OK';
  END IF;
END $patch$;

DO $verify$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_criar_visita_idempotente';
  IF position('ajuste_solicitado' in v_def) > 0 THEN
    RAISE EXCEPTION 'VERIFY_FAIL: literal invalido persiste';
  END IF;
  RAISE NOTICE 'VERIFY_OK';
END $verify$;
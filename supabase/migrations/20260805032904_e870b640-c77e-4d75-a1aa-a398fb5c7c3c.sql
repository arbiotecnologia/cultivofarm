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
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_criar_visita_idempotente';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'PATCH_ABORT: rpc_criar_visita_idempotente ausente';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF position('HAVING count(*) OVER () = 1' in v_def) = 0 THEN
    RAISE NOTICE 'PATCH_SKIP: defeito ja corrigido';
    RETURN;
  END IF;

  v_new := regexp_replace(
    v_def,
    'SELECT ts\.cultura_id, ts\.safra\s+INTO v_cultura, v_safra\s+FROM public\.talhao_safras ts\s+WHERE ts\.talhao_id = p_talhao_id\s+AND ts\.cultura_id IS NOT NULL\s+AND COALESCE\(ts\.status,''ativa''\) IN \(''ativa'',''em_andamento'',''plantada''\)\s+GROUP BY ts\.cultura_id, ts\.safra\s+HAVING count\(\*\) OVER \(\) = 1;',
    'WITH cand AS (
      SELECT DISTINCT ts.cultura_id, ts.safra
        FROM public.talhao_safras ts
       WHERE ts.talhao_id = p_talhao_id
         AND ts.cultura_id IS NOT NULL
         AND COALESCE(ts.status,''ativa'') IN (''ativa'',''em_andamento'',''plantada'')
    )
    SELECT c.cultura_id, c.safra
      INTO v_cultura, v_safra
      FROM cand c
     WHERE (SELECT count(*) FROM cand) = 1;',
    'g');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'PATCH_ABORT: bloco alvo nao localizado — nenhuma alteracao aplicada';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'PATCH_OK: resolucao de cultura corrigida';
END $patch$;

DO $verify$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_criar_visita_idempotente';
  IF position('OVER () = 1' in v_def) > 0 THEN
    RAISE EXCEPTION 'VERIFY_FAIL: window function em HAVING persiste';
  END IF;
  RAISE NOTICE 'VERIFY_OK';
END $verify$;
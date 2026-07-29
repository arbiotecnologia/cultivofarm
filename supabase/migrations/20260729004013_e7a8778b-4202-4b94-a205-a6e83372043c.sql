DO $guard$
DECLARE
  v_ref text;
  v_orig text;
  v_hash_before text;
  v_hash_mid text;
  v_hash_after text;
BEGIN
  -- 1) TRAVA DE STAGING (fail-fast; nunca executa em producao)
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'STAGING_GUARD: marker de staging ausente — execucao abortada';
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'STAGING_GUARD: project_ref corresponde a PRODUCAO — execucao abortada';
  END IF;
  IF v_ref <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: project_ref % nao e o staging esperado', v_ref;
  END IF;

  -- 2) CAPTURA
  SELECT pg_get_functiondef(p.oid), md5(pg_get_functiondef(p.oid))
    INTO v_orig, v_hash_before
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_b2b_partner_credit';
  IF v_orig IS NULL THEN RAISE EXCEPTION 'rpc_b2b_partner_credit nao encontrada'; END IF;

  -- 3) SUBSTITUICAO TEMPORARIA (apenas comentario; comportamento identico)
  EXECUTE regexp_replace(v_orig, 'BEGIN', 'BEGIN /* rollback-drill */');
  SELECT md5(pg_get_functiondef(p.oid)) INTO v_hash_mid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_b2b_partner_credit';
  IF v_hash_mid = v_hash_before THEN
    RAISE EXCEPTION 'DRILL_INVALIDO: substituicao temporaria nao alterou a definicao';
  END IF;

  -- 4) RESTAURACAO
  EXECUTE v_orig;
  SELECT md5(pg_get_functiondef(p.oid)) INTO v_hash_after
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_b2b_partner_credit';

  -- 5) ASSERT
  IF v_hash_after <> v_hash_before THEN
    RAISE EXCEPTION 'ROLLBACK_FALHOU: checksum % != % ', v_hash_after, v_hash_before;
  END IF;
  RAISE NOTICE 'ROLLBACK_DRILL_OK checksum=%', v_hash_after;
END;
$guard$;
-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É UMA MIGRATION HISTÓRICA
-- Origem: supabase/migrations/20260729004013_e7a8778b-4202-4b94-a205-a6e83372043c.sql
-- SHA-256 da origem: 396fb2be8dfaa2af97c41b4ba99fe57b4e737e7e11832c0a42eb4c4bf41f8ae3
-- Gerado por: restoration/promocao-producao-h9/gerar-promotion-sql.py (determinístico)
-- Transformação aplicada: to_regclass(marcador) -> true
-- O arquivo de origem NÃO foi alterado.
--
-- Guarda canônica: o runner valida o ref do alvo por canal externo e só então
-- executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela marcadora
-- de homologação é consultada.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

DO $guard$
DECLARE
  v_ref text;
  v_orig text;
  v_hash_before text;
  v_hash_mid text;
  v_hash_after text;
BEGIN
  -- 1) TRAVA normalizada (portatil): recusa apenas PRODUCAO comprovada
  IF true THEN
    EXECUTE 'SELECT project_ref FROM public._fiscal_staging_marker WHERE marker = ''STAGING'' LIMIT 1'
      INTO v_ref;
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'STAGING_GUARD: project_ref de PRODUCAO recusado';
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
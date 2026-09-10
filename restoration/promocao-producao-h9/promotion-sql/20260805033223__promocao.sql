-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É UMA MIGRATION HISTÓRICA
-- Origem: supabase/migrations/20260805033223_c8492f4a-28a1-442d-bcc0-1b8ef8f94259.sql
-- SHA-256 da origem: 4406c46d3b2fcfdafd53aebed6918a7203eff8ce66c89bb3ca2d00dbbb329daa
-- Gerado por: restoration/promocao-producao-h9/gerar-promotion-sql.py (determinístico)
-- Transformação aplicada: leitura de marcador -> GUC; literal de ref homologacao -> producao
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
DECLARE v_ref text; c_expected constant text := 'navfzbwgwzruipouyfnk'; c_prod constant text := 'navfzbwgwzruipouyfnk';
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: marcador de staging inexistente';
  END IF;
  SELECT current_setting('promocao.target_ref', true) INTO v_ref;
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
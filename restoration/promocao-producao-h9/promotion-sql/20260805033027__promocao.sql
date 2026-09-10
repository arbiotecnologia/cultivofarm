-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É UMA MIGRATION HISTÓRICA
-- Origem: supabase/migrations/20260805033027_574aecea-ac2f-461e-9d32-8490010cd146.sql
-- SHA-256 da origem: 345bbf52a22cbdc6b107f052f3a4356ca693ee2bb16d57ffffe350378175cce1
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

-- 1) Visibilidade: responsável por user_id OU por profile_id do usuário.
CREATE OR REPLACE FUNCTION public.is_visit_responsible(p_user_id uuid, p_registro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.registros_consultor r
     WHERE r.id = p_registro_id
       AND (
         r.consultor_responsavel = p_user_id
         OR r.created_by = p_user_id
         OR r.consultor_profile_id = p_user_id
         OR r.consultor_profile_id IN (
              SELECT pr.id FROM public.profiles pr WHERE pr.user_id = p_user_id
            )
       )
  )
$function$;

-- 2) Motor: grava consultor_profile_id coerente com consultor_responsavel.
DO $patch$
DECLARE v_oid oid; v_def text; v_new text;
BEGIN
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_criar_visita_idempotente';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'PATCH_ABORT: motor ausente'; END IF;

  v_def := pg_get_functiondef(v_oid);
  IF position('consultor_profile_id' in v_def) > 0 THEN
    RAISE NOTICE 'PATCH_SKIP: motor ja grava consultor_profile_id';
    RETURN;
  END IF;

  v_new := replace(v_def,
    'consultor_responsavel, created_by,',
    'consultor_responsavel, consultor_profile_id, created_by,');
  v_new := replace(v_new,
    'v_uid, v_uid, v_natureza',
    'v_uid, (SELECT pr.id FROM public.profiles pr WHERE pr.user_id = v_uid LIMIT 1), v_uid, v_natureza');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'PATCH_ABORT: bloco de INSERT nao localizado';
  END IF;
  EXECUTE v_new;
  RAISE NOTICE 'PATCH_OK: consultor_profile_id gravado pelo motor';
END $patch$;

-- 3) Mídias: índice único simples (não parcial) para permitir upsert idempotente.
DROP INDEX IF EXISTS public.registros_consultor_arquivos_client_uuid_uniq;
DROP INDEX IF EXISTS public.idx_registros_consultor_arquivos_client_uuid;
CREATE UNIQUE INDEX IF NOT EXISTS registros_consultor_arquivos_client_uuid_key
  ON public.registros_consultor_arquivos (client_uuid);

DO $verify$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_criar_visita_idempotente';
  IF position('consultor_profile_id' in v_def) = 0 THEN
    RAISE EXCEPTION 'VERIFY_FAIL: motor nao grava consultor_profile_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                  AND tablename='registros_consultor_arquivos'
                  AND indexname='registros_consultor_arquivos_client_uuid_key') THEN
    RAISE EXCEPTION 'VERIFY_FAIL: indice unico de midia ausente';
  END IF;
  RAISE NOTICE 'VERIFY_OK';
END $verify$;
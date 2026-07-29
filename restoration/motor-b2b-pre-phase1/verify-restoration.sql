-- =====================================================================
-- MOTOR B2B — VERIFICAÇÃO DA RESTAURAÇÃO (READ-ONLY)
-- Fase 0.1 — AR Bio
--
-- Ambiente permitido: STAGING ikaauvsflpmamgxmkhoq
-- Ambiente PROIBIDO : PRODUÇÃO navfzbwgwzruipouyfnk
--
-- Não escreve nada. Falha (exceção) se qualquer função divergir do
-- snapshot pré-Fase 1.
--
-- Uso:
--   psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 \
--        -f restoration/motor-b2b-pre-phase1/verify-restoration.sql
-- =====================================================================

\set ON_ERROR_STOP on

-- 1. TRAVA DE STAGING
DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker
   WHERE marker = 'STAGING' LIMIT 1;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'STAGING_GUARD: marker oficial ausente';
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'STAGING_GUARD: PRODUCAO detectada — recusado';
  END IF;
  IF v_ref <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: ref inesperado %', v_ref;
  END IF;
END;
$guard$;

-- 2. RELATÓRIO COMPARATIVO
SELECT
  s.proname,
  s.identity_args,
  s.checksum_md5                    AS checksum_snapshot,
  md5(pg_get_functiondef(p.oid))    AS checksum_atual,
  (s.checksum_md5 = md5(pg_get_functiondef(p.oid))) AS igual,
  s.security_definer                AS secdef_snapshot,
  p.prosecdef                       AS secdef_atual,
  s.proconfig                       AS search_path_snapshot,
  array_to_string(p.proconfig, ',') AS search_path_atual,
  s.acl                             AS grants_snapshot,
  array_to_string(p.proacl::text[], ' ') AS grants_atuais
FROM public._motor_b2b_pre_phase1_snapshot s
LEFT JOIN pg_proc p
  ON p.proname = s.proname
 AND pg_get_function_identity_arguments(p.oid) = s.identity_args
 AND p.pronamespace = 'public'::regnamespace
ORDER BY s.proname, s.identity_args;

-- 3. ASSERT FINAL
DO $assert$
DECLARE
  v_missing int;
  v_diff int;
  v_acl_diff int;
BEGIN
  SELECT count(*) INTO v_missing
  FROM public._motor_b2b_pre_phase1_snapshot s
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = s.proname
      AND pg_get_function_identity_arguments(p.oid) = s.identity_args);

  SELECT count(*) INTO v_diff
  FROM public._motor_b2b_pre_phase1_snapshot s
  JOIN pg_proc p
    ON p.pronamespace = 'public'::regnamespace
   AND p.proname = s.proname
   AND pg_get_function_identity_arguments(p.oid) = s.identity_args
  WHERE md5(pg_get_functiondef(p.oid)) <> s.checksum_md5;

  SELECT count(*) INTO v_acl_diff
  FROM public._motor_b2b_pre_phase1_snapshot s
  JOIN pg_proc p
    ON p.pronamespace = 'public'::regnamespace
   AND p.proname = s.proname
   AND pg_get_function_identity_arguments(p.oid) = s.identity_args
  WHERE COALESCE(array_to_string(p.proacl::text[], ' '), '') IS DISTINCT FROM COALESCE(s.acl, '');

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'VERIFY_FALHOU: % funcao(oes) do snapshot ausente(s)', v_missing;
  END IF;
  IF v_diff > 0 THEN
    RAISE EXCEPTION 'VERIFY_FALHOU: % funcao(oes) com checksum divergente', v_diff;
  END IF;
  IF v_acl_diff > 0 THEN
    RAISE WARNING 'VERIFY_ATENCAO: % funcao(oes) com GRANTs divergentes do snapshot', v_acl_diff;
  END IF;

  RAISE NOTICE 'VERIFY_OK: motor B2B identico ao snapshot pre-Fase 1';
END;
$assert$;

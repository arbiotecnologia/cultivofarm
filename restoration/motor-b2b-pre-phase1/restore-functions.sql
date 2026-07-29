-- =====================================================================
-- MOTOR B2B — RESTAURAÇÃO DAS RPCs AO ESTADO PRÉ-FASE 1
-- Fase 0.1 — AR Bio
--
-- Ambiente permitido: STAGING ikaauvsflpmamgxmkhoq
-- Ambiente PROIBIDO : PRODUÇÃO navfzbwgwzruipouyfnk
--
-- Este script restaura, a partir do snapshot imutável gravado em
-- public._motor_b2b_pre_phase1_snapshot:
--   * a definição completa de cada função (corpo, LANGUAGE, volatilidade);
--   * SECURITY DEFINER/INVOKER e search_path (embutidos no pg_get_functiondef);
--   * os GRANTs de EXECUTE exatamente como estavam (ACL capturada);
--   * os COMMENTs;
--   * e valida o checksum final contra o checksum capturado.
--
-- NÃO altera nenhum dado operacional (pedidos, parcelas, recebíveis,
-- produção, entregas, fiscal, BI, comunicação).
--
-- Uso:
--   psql "$PGURL_STAGING" --single-transaction -v ON_ERROR_STOP=1 \
--        -f restoration/motor-b2b-pre-phase1/restore-functions.sql
-- =====================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------
-- 1. TRAVA DE STAGING (fail-fast)
-- ---------------------------------------------------------------------
DO $guard$
DECLARE
  v_ref text;
BEGIN
  SELECT project_ref INTO v_ref
  FROM public._fiscal_staging_marker
  WHERE marker = 'STAGING'
  LIMIT 1;

  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'STAGING_GUARD: marker oficial de staging ausente — execucao abortada';
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'STAGING_GUARD: project_ref corresponde a PRODUCAO — execucao recusada';
  END IF;
  IF v_ref <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: project_ref % nao e o staging esperado', v_ref;
  END IF;

  IF to_regclass('public._motor_b2b_pre_phase1_snapshot') IS NULL THEN
    RAISE EXCEPTION 'SNAPSHOT_AUSENTE: _motor_b2b_pre_phase1_snapshot nao existe';
  END IF;

  RAISE NOTICE 'STAGING_GUARD OK (ref=%)', v_ref;
END;
$guard$;

-- ---------------------------------------------------------------------
-- 2. RESTAURAÇÃO (definição + search_path + comment + grants)
-- ---------------------------------------------------------------------
DO $restore$
DECLARE
  r record;
  v_sig text;
  v_grantee text;
  v_after text;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (proname, identity_args)
           proname, identity_args, definition, checksum_md5, acl, obj_comment
    FROM public._motor_b2b_pre_phase1_snapshot
    ORDER BY proname, identity_args, captured_at DESC
  LOOP
    v_sig := format('public.%I(%s)', r.proname, r.identity_args);

    -- 2.1 corpo + security + search_path
    EXECUTE r.definition;

    -- 2.2 comment
    IF r.obj_comment IS NOT NULL THEN
      EXECUTE format('COMMENT ON FUNCTION %s IS %L', v_sig, r.obj_comment);
    END IF;

    -- 2.3 grants: zera e reaplica exatamente a ACL capturada
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, service_role', v_sig);

    IF COALESCE(r.acl, '') = '' THEN
      -- ACL default do Postgres: EXECUTE para PUBLIC
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', v_sig);
    ELSE
      FOREACH v_grantee IN ARRAY string_to_array(r.acl, ' ') LOOP
        IF v_grantee IS NULL OR v_grantee = '' THEN CONTINUE; END IF;
        -- formato aclitem: "grantee=privs/grantor"; grantee vazio == PUBLIC
        IF split_part(v_grantee, '=', 1) = '' THEN
          EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', v_sig);
        ELSE
          EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',
                         v_sig, split_part(v_grantee, '=', 1));
        END IF;
      END LOOP;
    END IF;

    -- 2.4 assert de checksum
    SELECT md5(pg_get_functiondef(p.oid)) INTO v_after
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = r.proname
      AND pg_get_function_identity_arguments(p.oid) = r.identity_args;

    IF v_after IS DISTINCT FROM r.checksum_md5 THEN
      RAISE EXCEPTION 'RESTORE_FALHOU: % checksum % != esperado %',
        v_sig, COALESCE(v_after, 'null'), r.checksum_md5;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'RESTORE_OK: % funcoes restauradas e conferidas por checksum', v_count;
END;
$restore$;

COMMIT;

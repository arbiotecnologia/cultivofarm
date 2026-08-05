-- ============================================================================
-- POSTCHECK — CORRECAO RUNTIME FINAL DA VISITA TECNICA
-- Read-only. Executar apos a migration 20260805182000.
-- Valida: guard de ambiente, checksum SHA-256, owner, SECURITY DEFINER,
-- search_path, ausencia de grants PUBLIC/anon, ausencia de colunas inexistentes
-- referenciadas pela RPC de workspace, e o indice de idempotencia da
-- recomendacao (UNIQUE / valido / colunas / predicado).
-- ============================================================================

DO $post$
DECLARE
  c_prod    constant text := 'navfzbwgwzruipouyfnk';
  c_staging constant text := 'ikaauvsflpmamgxmkhoq';
  expected  constant jsonb := jsonb_build_object(
    'rpc_get_visita_workspace',       '702c390d4b8794cf12e69b70b0c1950d1e81a14f2f1508dd917ff9ff610cf19a',
    'rpc_upsert_recomendacao_visita', '118be4751fcd7e1e6ad3a587a30dfff89aceedf75419f9e8750e0bcee6453dbb'
  );
  v_ref  text;
  v_rows integer;
  v_got  text;
  v_def  text;
  v_n    integer;
  r      record;
  k      text;
BEGIN
  ---------------------------------------------------------------------------
  -- Guard fail-closed exato
  ---------------------------------------------------------------------------
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: tabela public._fiscal_staging_marker inexistente';
  END IF;

  SELECT count(*) INTO v_rows FROM public._fiscal_staging_marker WHERE marker = 'STAGING';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'GUARD_ABORT: esperada exatamente 1 linha marker=STAGING, encontradas %', v_rows;
  END IF;

  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker = 'STAGING';
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: project_ref nulo no marcador de staging';
  END IF;
  IF v_ref = c_prod THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente de producao recusado';
  END IF;
  IF v_ref IS DISTINCT FROM c_staging THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente % nao autorizado', v_ref;
  END IF;

  ---------------------------------------------------------------------------
  -- 1) Checksums, SECURITY DEFINER, search_path, owner, grants
  ---------------------------------------------------------------------------
  FOR k IN SELECT jsonb_object_keys(expected) LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = k;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'POSTCHECK_FAIL: %: esperada 1 assinatura, encontradas %', k, v_n;
    END IF;

    SELECT pg_get_functiondef(p.oid),
           encode(digest(pg_get_functiondef(p.oid), 'sha256'), 'hex')
      INTO v_def, v_got
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = k;

    IF v_got IS DISTINCT FROM (expected ->> k) THEN
      RAISE EXCEPTION 'POSTCHECK_FAIL: checksum divergente em % (got %)', k, v_got;
    END IF;

    SELECT p.prosecdef, pg_get_userbyid(p.proowner),
           array_to_string(p.proconfig, ','),
           has_function_privilege('anon', p.oid, 'EXECUTE'),
           has_function_privilege('public', p.oid, 'EXECUTE'),
           has_function_privilege('authenticated', p.oid, 'EXECUTE')
      INTO r
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = k;

    IF NOT r.prosecdef THEN
      RAISE EXCEPTION 'POSTCHECK_FAIL: % nao e SECURITY DEFINER', k;
    END IF;
    IF COALESCE(r.array_to_string, '') NOT LIKE '%search_path=public%' THEN
      RAISE EXCEPTION 'POSTCHECK_FAIL: % sem search_path=public (%)', k, r.array_to_string;
    END IF;
    IF r.has_function_privilege THEN
      RAISE EXCEPTION 'POSTCHECK_FAIL: % com EXECUTE para anon', k;
    END IF;
    IF r.has_function_privilege_1 THEN
      RAISE EXCEPTION 'POSTCHECK_FAIL: % com EXECUTE para PUBLIC', k;
    END IF;
    IF NOT r.has_function_privilege_2 THEN
      RAISE EXCEPTION 'POSTCHECK_FAIL: % sem EXECUTE para authenticated', k;
    END IF;

    IF k = 'rpc_get_visita_workspace' THEN
      IF v_def LIKE '%os.data_prevista%' THEN
        RAISE EXCEPTION 'POSTCHECK_FAIL: rpc_get_visita_workspace ainda referencia os.data_prevista';
      END IF;
      IF v_def NOT LIKE '%os.data_recomendada%' THEN
        RAISE EXCEPTION 'POSTCHECK_FAIL: rpc_get_visita_workspace nao projeta os.data_recomendada';
      END IF;
      IF v_def NOT LIKE '%''data_prevista'', os.data_recomendada%' THEN
        RAISE EXCEPTION 'POSTCHECK_FAIL: contrato JSON data_prevista nao preservado por alias';
      END IF;
      IF v_def NOT LIKE '%can_view_technical_visit%' THEN
        RAISE EXCEPTION 'POSTCHECK_FAIL: rpc_get_visita_workspace sem can_view_technical_visit';
      END IF;
    END IF;

    IF k = 'rpc_upsert_recomendacao_visita' THEN
      IF v_def NOT LIKE '%GET STACKED DIAGNOSTICS%CONSTRAINT_NAME%' THEN
        RAISE EXCEPTION 'POSTCHECK_FAIL: unique_violation nao inspeciona CONSTRAINT_NAME';
      END IF;
      IF v_def NOT LIKE '%uq_rec_registro_client_uuid%' THEN
        RAISE EXCEPTION 'POSTCHECK_FAIL: constraint de idempotencia nao verificada';
      END IF;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 2) Auditoria de colunas: nenhuma coluna inexistente em ordens_servico_onfarm
  ---------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ordens_servico_onfarm'
       AND column_name = 'data_recomendada'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: ordens_servico_onfarm.data_recomendada inexistente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ordens_servico_onfarm'
       AND column_name = 'data_prevista'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: premissa invalida — data_prevista existe em ordens_servico_onfarm';
  END IF;

  ---------------------------------------------------------------------------
  -- 3) Indice de idempotencia: UNIQUE, valido, colunas e predicado exatos
  ---------------------------------------------------------------------------
  SELECT i.indisunique, i.indisvalid, i.indislive, i.indpred IS NOT NULL AS tem_predicado,
         pg_get_indexdef(i.indexrelid) AS def,
         c.relname AS tabela
    INTO r
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_class c  ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = ic.relnamespace
   WHERE n.nspname = 'public' AND ic.relname = 'uq_rec_registro_client_uuid';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: indice uq_rec_registro_client_uuid inexistente';
  END IF;
  IF r.tabela <> 'registros_consultor_recomendacoes' THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: indice em tabela inesperada %', r.tabela;
  END IF;
  IF NOT r.indisunique THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: uq_rec_registro_client_uuid nao e UNIQUE';
  END IF;
  IF NOT r.indisvalid OR NOT r.indislive THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: uq_rec_registro_client_uuid invalido/nao vivo';
  END IF;
  IF NOT r.tem_predicado THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: uq_rec_registro_client_uuid sem predicado parcial';
  END IF;
  IF r.def NOT LIKE '%(registro_consultor_id, client_uuid)%' THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: colunas do indice divergentes: %', r.def;
  END IF;
  IF r.def NOT LIKE '%WHERE (client_uuid IS NOT NULL)%' THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: predicado do indice divergente: %', r.def;
  END IF;

  RAISE NOTICE 'POSTCHECK_RUNTIME_FINAL_PASS (ref=%)', v_ref;
END
$post$;

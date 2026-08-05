-- ============================================================================
-- POSTCHECK — CONSOLIDAÇÃO FINAL DA VISITA TÉCNICA
-- Read-only. Executar após a migration 20260805152009 (consolidação).
-- Valida checksum SHA-256, owner, SECURITY DEFINER, search_path e grants
-- (sem PUBLIC, sem anon) das 18 funções canônicas do fluxo de visita.
-- ============================================================================

DO $post$
DECLARE
  c_prod constant text := 'navfzbwgwzruipouyfnk';
  c_staging constant text := 'ikaauvsflpmamgxmkhoq';
  expected constant jsonb := jsonb_build_object(
    '_assert_visita_editavel',          '3eac6efbc7d2eaa68710dffea3d08da096760e05a781fa4c69e44d001b14f7d1',
    '_visita_lock_and_check',           '327d715371f80942302023fcce2f75bca53147320dd36bfa45bd02c930f15a96',
    'can_checkin_technical_visit',      'dc3f37b179ec7569f063dcf675a49b0d54252a2a3e934b37a35e58f969e4f8d8',
    'can_checkout_technical_visit',     'fd9b6fb5965bbc2c437bd6d3967936fb051783fa38b7b0653b52e8a669a8c9cb',
    'can_manage_technical_visit',       '8f8d4038e3d4fa6ed8dd6e96edef7806283f6e30d9e93225808e9f0d88ba59e3',
    'can_view_technical_visit',         'f9b41dd1b33e2366faa1023eb12e6595ba2617f5aae741213a5b2ae22e324b59',
    'has_active_user_cliente_access',   '1de581a4541af3775cfaafc52dd075a1d3a2e86522d4386d0c8fab1d2e7f7814',
    'is_active_visit_participant',      '3a90253979085df35e5d78166c595c67f337c3f7286593fae36305bbb72335c8',
    'is_visit_org_manager',             '754efe9f3794e32f56104da1e36e85285c2a3735117b7f7d38e9e6794edc47fa',
    'is_visit_responsible',             'cbcde4e2ec28a0bf4533f7e5173561732c31acde7e9c3f0b5a1a89d79712570c',
    'rpc_enviar_visita_aprovacao',      'beafbe378ac37b7ef5aa408774244d79b4363b9b50866f2f8b8dc6792f527b2c',
    'rpc_finalizar_visita_v2',          'd36f81f3191767a136e5b0e9f1031a33636dca972b7d363655be2a86a062a05d',
    'rpc_liberar_recomendacao_produtor','14402c2c923a40ddfcbbd0686c330b6adafe44c9488549e0e1dabc6b7d9dffe0',
    'rpc_realizar_checkin_visita',      '1d685c3d80b16d2f93185b5731faeeed9785340d2269cf8edd77c84034cfc346',
    'rpc_reprovar_visita',              '9c5dbc5dd96d4eb6b0f2d49898f7bee24b4a2a01e295ac24bbe37503c0b67071',
    'rpc_solicitar_ajuste_visita',      'a4d855bbc221c7a14f0cf53b66e544e5716ae0707297ba075fea4b7246c26a1c',
    'rpc_upsert_diagnostico_visita',    'c37f9f4db3d1fa20f6a4544147f3a45cb5647833ea9ce7e1ab6610d4b905b0ed',
    'rpc_upsert_recomendacao_visita',   'dc17f7b82d99c706284c3b5c87ebf38533ec1b46cf9cfbf00d4c17d703ce6107'
  );
  v_ref text;
  v_rows integer;
  r record;
  v_got text;
BEGIN
  -- Guard fail-closed exato: tabela obrigatoria, exatamente 1 linha STAGING,
  -- project_ref exatamente igual ao staging autorizado, producao recusada.
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
    RAISE EXCEPTION 'GUARD_ABORT: ambiente de producao nao autorizado';
  END IF;
  IF v_ref IS DISTINCT FROM c_staging THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente % nao autorizado', v_ref;
  END IF;

  FOR r IN SELECT key AS fname, value #>> '{}' AS sum FROM jsonb_each(expected) LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = r.fname) <> 1 THEN
      RAISE EXCEPTION 'POST FAIL: % ausente ou com overload', r.fname;
    END IF;

    SELECT encode(extensions.digest(convert_to(pg_get_functiondef(p.oid), 'UTF8'), 'sha256'), 'hex')
      INTO v_got
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fname;
    IF v_got IS DISTINCT FROM r.sum THEN
      RAISE EXCEPTION 'POST FAIL: checksum % esperado % obtido %', r.fname, r.sum, v_got;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = r.fname
                  AND has_function_privilege('anon', p.oid, 'EXECUTE')) THEN
      RAISE EXCEPTION 'POST FAIL: anon possui EXECUTE em %', r.fname;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
           aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE n.nspname = 'public' AND p.proname = r.fname
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'POST FAIL: PUBLIC possui EXECUTE em %', r.fname;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = r.fname
                      AND p.prosecdef
                      AND p.proconfig @> ARRAY['search_path=public']
                      AND pg_get_userbyid(p.proowner) = 'postgres') THEN
      RAISE EXCEPTION 'POST FAIL: owner/security/search_path incorretos em %', r.fname;
    END IF;

    RAISE NOTICE 'POST OK: %', r.fname;
  END LOOP;

  -- Nenhuma função do fluxo pode referenciar registros_consultor.data_aprovacao
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (SELECT jsonb_object_keys(expected))
       AND (
         pg_get_functiondef(p.oid) ILIKE '%registros_consultor.data_aprovacao%'
         OR pg_get_functiondef(p.oid) ~* 'UPDATE\s+public\.registros_consultor[^;]*data_aprovacao'
       )
  ) THEN
    RAISE EXCEPTION 'POST FAIL: referencia a registros_consultor.data_aprovacao';
  END IF;


  -- Chave logica unica da recomendacao (pre-requisito da concorrencia).
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'registros_consultor_recomendacoes'
       AND indexname = 'uq_rec_registro_client_uuid'
  ) THEN
    RAISE EXCEPTION 'POST FAIL: indice unico uq_rec_registro_client_uuid ausente';
  END IF;

  RAISE NOTICE 'POSTCHECK_CONSOLIDACAO_OK';
END
$post$;

-- ============================================================================
-- H9-E2 - prova adversarial de autorizacao sem oraculo (homologacao).
-- Executar SEMPRE dentro de BEGIN ... ROLLBACK externo (residuo zero).
-- Sem BEGIN/COMMIT internos.
--
-- Identidades reais de homologacao:
--   dono       77905960-8e07-4214-b1c9-516a381fcd28 (consultor_tecnico)
--   admin      b5c2ebd4-7cdf-4647-a585-6ec49f1b583a (administrador)
--   sem escopo 7c04c4d1-6892-44cc-97b4-25eae04f46ea (producao)
-- ============================================================================

SET LOCAL search_path = public;

DO $$
DECLARE
  v_dono   uuid := '77905960-8e07-4214-b1c9-516a381fcd28';
  v_admin  uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a';
  v_out    uuid := '7c04c4d1-6892-44cc-97b4-25eae04f46ea';
  v_tag    text := 'H9E2-AUTHZ';
  v_regA   uuid := gen_random_uuid();  -- visita real do dono, em_andamento
  v_regB   uuid := gen_random_uuid();  -- visita real do dono, em_andamento (checkout)
  v_ghost  uuid := gen_random_uuid();  -- registro inexistente
  v_cu_ex  uuid := gen_random_uuid();  -- client_uuid EXISTENTE em visitas_checkin
  v_cu_rnd uuid;
  v_pass   int := 0;
  v_fail   int := 0;
  v_surf   text[] := '{}';
  s        text;
  r        jsonb;
  v_id     uuid;

BEGIN
  ------------------------------------------------------------------ fixture
  INSERT INTO public.registros_consultor
    (id, natureza_registro, status, consultor_responsavel, created_by,
     observacoes_tecnicas, problema_principal)
  VALUES (v_regA,'visita','rascunho',v_dono,v_dono,v_tag,v_tag),
         (v_regB,'visita','rascunho',v_dono,v_dono,v_tag,v_tag);

  INSERT INTO public.technical_visit_assignments (registro_consultor_id, user_id, role, is_active)
  VALUES (v_regA, v_dono,'participante', true),
         (v_regB, v_dono,'participante', true);

  INSERT INTO public.visita_diagnosticos (registro_id, versao) VALUES (v_regA,1);

  UPDATE public.registros_consultor SET status='em_andamento' WHERE id IN (v_regA, v_regB);

  INSERT INTO public.visitas_checkin
    (registro_consultor_id, consultor_id, tipo_checkin, status, observacoes, data_hora_checkin, client_uuid)
  VALUES (v_regA, v_dono,'chegada_fazenda','realizado',v_tag, now() - interval '2 hours', v_cu_ex),
         (v_regB, v_dono,'chegada_fazenda','realizado',v_tag, now() - interval '2 hours', gen_random_uuid());

  ---------------------------------------------------- 1) nao autenticado (3 RPCs)
  PERFORM set_config('request.jwt.claims', NULL, true);

  BEGIN
    PERFORM public.finish_technical_visit_secure(v_regA, -21, -47, 5, NULL, NULL, v_tag, gen_random_uuid());
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL finish anon deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%unauthenticated%' THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS finish anon -> %', SQLERRM;
    ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL finish anon -> %', SQLERRM; END IF;
  END;

  BEGIN
    PERFORM public.rpc_realizar_checkin_visita(v_regA, gen_random_uuid(), 'chegada_fazenda'::public.tipo_checkin,
      -21,-47,5,NULL,v_tag,NULL,NULL,NULL,NULL,NULL,NULL);
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL checkin anon deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%unauthenticated%' THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS checkin anon -> %', SQLERRM;
    ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL checkin anon -> %', SQLERRM; END IF;
  END;

  BEGIN
    PERFORM public.rpc_realizar_checkout_visita(v_regB, gen_random_uuid(), -21,-47,5,NULL,v_tag,NULL,NULL);
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL checkout anon deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%unauthenticated%' THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS checkout anon -> %', SQLERRM;
    ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL checkout anon -> %', SQLERRM; END IF;
  END;

  ------------------------------------- 2) sem escopo: 4 combinacoes por RPC
  -- (registro inexistente | registro alheio real) x (client_uuid existente | aleatorio)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_out, 'role','authenticated')::text, true);

  v_surf := '{}';
  FOREACH s IN ARRAY ARRAY['ghost:existente','ghost:aleatorio','alheio:existente','alheio:aleatorio'] LOOP
    v_cu_rnd := CASE WHEN s LIKE '%existente' THEN v_cu_ex ELSE gen_random_uuid() END;
    BEGIN
      PERFORM public.finish_technical_visit_secure(
        CASE WHEN s LIKE 'ghost%' THEN v_ghost ELSE v_regA END,
        -21,-47,5,NULL,NULL,v_tag, v_cu_rnd);
      v_surf := v_surf || ('SEM_ERRO:' || s);
    EXCEPTION WHEN OTHERS THEN
      v_surf := v_surf || (SQLSTATE || '|' || SQLERRM);
    END;
  END LOOP;
  IF array_length(ARRAY(SELECT DISTINCT unnest(v_surf)),1) = 1
     AND v_surf[1] LIKE '42501|%not_visit_owner%' THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS finish sem escopo: 4 combinacoes indistinguiveis -> %', v_surf[1];
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL finish sem escopo: superficies distintas -> %', v_surf;
  END IF;

  v_surf := '{}';
  FOREACH s IN ARRAY ARRAY['ghost:existente','ghost:aleatorio','alheio:existente','alheio:aleatorio'] LOOP
    v_cu_rnd := CASE WHEN s LIKE '%existente' THEN v_cu_ex ELSE gen_random_uuid() END;
    BEGIN
      PERFORM public.rpc_realizar_checkin_visita(
        CASE WHEN s LIKE 'ghost%' THEN v_ghost ELSE v_regA END,
        v_cu_rnd, 'chegada_fazenda'::public.tipo_checkin, -21,-47,5,NULL,v_tag,NULL,NULL,NULL,NULL,NULL,NULL);
      v_surf := v_surf || ('SEM_ERRO:' || s);
    EXCEPTION WHEN OTHERS THEN
      v_surf := v_surf || (SQLSTATE || '|' || SQLERRM);
    END;
  END LOOP;
  IF array_length(ARRAY(SELECT DISTINCT unnest(v_surf)),1) = 1
     AND v_surf[1] LIKE '42501|%forbidden_visita_nao_atribuido%' THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS checkin sem escopo: 4 combinacoes indistinguiveis -> %', v_surf[1];
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL checkin sem escopo: superficies distintas -> %', v_surf;
  END IF;

  v_surf := '{}';
  FOREACH s IN ARRAY ARRAY['ghost:existente','ghost:aleatorio','alheio:existente','alheio:aleatorio'] LOOP
    v_cu_rnd := CASE WHEN s LIKE '%existente' THEN v_cu_ex ELSE gen_random_uuid() END;
    BEGIN
      PERFORM public.rpc_realizar_checkout_visita(
        CASE WHEN s LIKE 'ghost%' THEN v_ghost ELSE v_regB END,
        v_cu_rnd, -21,-47,5,NULL,v_tag,NULL,NULL);
      v_surf := v_surf || ('SEM_ERRO:' || s);
    EXCEPTION WHEN OTHERS THEN
      v_surf := v_surf || (SQLSTATE || '|' || SQLERRM);
    END;
  END LOOP;
  IF array_length(ARRAY(SELECT DISTINCT unnest(v_surf)),1) = 1
     AND v_surf[1] LIKE '42501|%forbidden_visita_nao_atribuido%' THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS checkout sem escopo: 4 combinacoes indistinguiveis -> %', v_surf[1];
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL checkout sem escopo: superficies distintas -> %', v_surf;
  END IF;

  --------------------------------------------- 3) acesso legitimo do dono
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role','authenticated')::text, true);

  v_cu_rnd := gen_random_uuid();
  r := public.rpc_realizar_checkin_visita(v_regA, v_cu_rnd, 'inicio_visita'::public.tipo_checkin,
       -21,-47,5,NULL,v_tag,NULL,NULL,NULL,NULL,NULL,NULL);
  IF (r->>'idempotent')::boolean = false AND (r->>'id') IS NOT NULL THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS checkin legitimo do dono';
  ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL checkin legitimo -> %', r; END IF;

  ------------------------------ 4) idempotencia sequencial (mesmo client_uuid)
  r := public.rpc_realizar_checkin_visita(v_regA, v_cu_rnd, 'inicio_visita'::public.tipo_checkin,
       -21,-47,5,NULL,v_tag,NULL,NULL,NULL,NULL,NULL,NULL);
  IF (r->>'idempotent')::boolean = true THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS checkin sequencial idempotente';
  ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL checkin sequencial -> %', r; END IF;

  ------------------------- 5) conflito por tipo (mesmo client_uuid, outro tipo)
  BEGIN
    PERFORM public.rpc_realizar_checkin_visita(v_regA, v_cu_rnd, 'chegada_talhao'::public.tipo_checkin,
      -21,-47,5,NULL,v_tag,NULL,NULL,NULL,NULL,NULL,NULL);
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL conflito por tipo nao detectado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%idempotency_conflict%' THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS conflito por tipo -> %', SQLERRM;
    ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL conflito por tipo -> %', SQLERRM; END IF;
  END;

  --------------------- 6) conflito por registro (mesmo client_uuid, outro registro)
  BEGIN
    PERFORM public.rpc_realizar_checkin_visita(v_regB, v_cu_rnd, 'inicio_visita'::public.tipo_checkin,
      -21,-47,5,NULL,v_tag,NULL,NULL,NULL,NULL,NULL,NULL);
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL conflito por registro nao detectado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%idempotency_conflict%' THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS conflito por registro -> %', SQLERRM;
    ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL conflito por registro -> %', SQLERRM; END IF;
  END;

  ------------------------------------------------- 7) GPS/justificativa ausentes
  BEGIN
    PERFORM public.rpc_realizar_checkin_visita(v_regA, gen_random_uuid(), 'chegada_talhao'::public.tipo_checkin,
      NULL,NULL,NULL,NULL,v_tag,NULL,NULL,NULL,NULL,NULL,NULL);
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL GPS ausente aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%gps_ou_justificativa_obrigatorio%' THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS GPS/justificativa obrigatorio';
    ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL GPS -> %', SQLERRM; END IF;
  END;

  ------------------------------------------------- 8) client_uuid obrigatorio
  BEGIN
    PERFORM public.rpc_realizar_checkout_visita(v_regB, NULL, -21,-47,5,NULL,v_tag,NULL,NULL);
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL client_uuid nulo aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%client_uuid_obrigatorio%' THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS client_uuid obrigatorio';
    ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL client_uuid -> %', SQLERRM; END IF;
  END;

  ----------------------------------- 9) checkout legitimo e idempotente
  v_cu_rnd := gen_random_uuid();
  r := public.rpc_realizar_checkout_visita(v_regB, v_cu_rnd, -21,-47,5,NULL,v_tag,NULL,NULL);
  v_id := (r->>'id')::uuid;
  r := public.rpc_realizar_checkout_visita(v_regB, v_cu_rnd, -21,-47,5,NULL,v_tag,NULL,NULL);
  IF (r->>'idempotent')::boolean = true AND (r->>'id')::uuid = v_id THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS checkout legitimo + idempotente sequencial';
  ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL checkout idempotente -> %', r; END IF;

  ----------------------------------- 10) finish legitimo, idempotente e admin
  v_cu_rnd := gen_random_uuid();
  SELECT f.checkout_id INTO v_id
    FROM public.finish_technical_visit_secure(v_regA,-21,-47,5,NULL,NULL,v_tag,v_cu_rnd) f;
  IF v_id IS NOT NULL THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS finish legitimo do dono';
  ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL finish legitimo'; END IF;

  IF (SELECT count(*) FROM public.visitas_checkin
       WHERE registro_consultor_id = v_regA AND tipo_checkin='checkout'::public.tipo_checkin) = 1 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS encerramento gravou tipo_checkin=checkout (exatamente 1)';
  ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL tipo_checkin do encerramento'; END IF;

  DECLARE v_id2 uuid; BEGIN
    SELECT f.checkout_id INTO v_id2
      FROM public.finish_technical_visit_secure(v_regA,-21,-47,5,NULL,NULL,v_tag,v_cu_rnd) f;
    IF v_id2 = v_id THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS finish sequencial idempotente (mesmo checkout_id)';
    ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL finish sequencial -> %', v_id2; END IF;
  END;

  -- estado incompativel: novo client_uuid em visita ja finalizada
  BEGIN
    PERFORM public.finish_technical_visit_secure(v_regA,-21,-47,5,NULL,NULL,v_tag,gen_random_uuid());
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL finish em visita finalizada aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%visit_not_in_progress%' THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS estado incompativel -> %', SQLERRM;
    ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL estado incompativel -> %', SQLERRM; END IF;
  END;

  -- administrador legitimo continua enxergando o resultado idempotente
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  DECLARE v_id3 uuid; BEGIN
    SELECT f.checkout_id INTO v_id3
      FROM public.finish_technical_visit_secure(v_regA,-21,-47,5,NULL,NULL,v_tag,v_cu_rnd) f;
    IF v_id3 = v_id THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS admin legitimo obtem o mesmo resultado';
    ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL admin legitimo -> %', v_id3; END IF;
  END;

  RAISE NOTICE '=== H9-E2 AUTHZ: % PASS / % FAIL ===', v_pass, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'H9E2_PROVA_FALHOU: % falhas', v_fail;
  END IF;
END $$;

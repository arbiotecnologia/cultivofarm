-- =====================================================================
-- FASE F2 — HARNESS DE RUNTIME AUTENTICADO (fora de migrations)
-- Staging ikaauvsflpmamgxmkhoq. Executa como papel `authenticated`
-- impersonando usuários reais via request.jwt.claims, exatamente como
-- o PostgREST faz. Tudo dentro de uma transação revertida no final:
-- nenhum dado permanece.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

DO $h$
DECLARE
  u_admin     uuid;
  u_gestor    uuid;
  u_fin       uuid;
  u_tec       uuid;
  u_parceiro  uuid;
  u_produtor  uuid;
  u_semrole   uuid;
  v_dossier   uuid;
  v_cand      uuid;
  v_pres      uuid;
  v_src       uuid;
  v_err       text;
  v_state     text;
  v_n         int;
  v_pass      int := 0;

BEGIN
  SELECT user_id INTO u_admin    FROM public.user_roles WHERE role = 'administrador'    LIMIT 1;
  SELECT user_id INTO u_gestor   FROM public.user_roles WHERE role = 'gestor'           LIMIT 1;
  SELECT user_id INTO u_fin      FROM public.user_roles WHERE role = 'financeiro'       LIMIT 1;
  SELECT user_id INTO u_tec      FROM public.user_roles WHERE role = 'tecnico_agronomo' LIMIT 1;
  SELECT user_id INTO u_parceiro FROM public.user_roles WHERE role = 'parceiro_b2b'     LIMIT 1;
  SELECT user_id INTO u_produtor FROM public.user_roles WHERE role = 'cliente_produtor' LIMIT 1;
  SELECT id INTO u_semrole FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id) LIMIT 1;

  SELECT id INTO v_dossier FROM public.microorganism_regulatory_dossiers
   WHERE status = 'DRAFT' AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  IF v_dossier IS NULL THEN RAISE EXCEPTION 'H00 FAIL: nenhum dossie DRAFT disponivel'; END IF;

  -- =================================================================
  -- H01 — Leitura permitida para papéis internos
  -- =================================================================
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.microorganism_regulatory_dossiers;
  IF v_n = 0 THEN RAISE EXCEPTION 'H01 FAIL: administrador nao le dossies'; END IF;
  v_pass := v_pass + 1;

  -- H02 — DML direto bloqueado por RLS mesmo com GRANT
  BEGIN
    UPDATE public.microorganism_regulatory_dossiers SET strain_code = 'X' WHERE id = v_dossier;
    IF FOUND THEN RAISE EXCEPTION 'H02 FAIL: UPDATE direto aplicado por authenticated'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO v_n FROM public.microorganism_regulatory_dossiers
   WHERE id = v_dossier AND strain_code = 'X';
  IF v_n <> 0 THEN RAISE EXCEPTION 'H02 FAIL: UPDATE direto persistiu'; END IF;
  v_pass := v_pass + 1;

  BEGIN
    INSERT INTO public.microorganism_ncm_candidates (dossier_id, ncm, justification, consulted_at, source_url)
    VALUES (v_dossier, '30029099', 'insercao direta nao deve passar por RLS', current_date,
            'https://www.gov.br/receitafederal/tipi');
    RAISE EXCEPTION 'H03 FAIL: INSERT direto aceito';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H03 FAIL%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- =================================================================
  -- H04..H06 — Papéis externos e sem papel não leem nada
  -- =================================================================
  RESET ROLE;
  FOREACH v_err IN ARRAY ARRAY['parceiro', 'produtor', 'semrole'] LOOP
    PERFORM set_config('request.jwt.claims', json_build_object(
      'sub', CASE v_err WHEN 'parceiro' THEN u_parceiro
                        WHEN 'produtor' THEN u_produtor
                        ELSE coalesce(u_semrole, gen_random_uuid()) END,
      'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM public.microorganism_regulatory_dossiers;
    IF v_n <> 0 THEN RAISE EXCEPTION 'H04 FAIL: papel % leu dossies', v_err; END IF;
    SELECT count(*) INTO v_n FROM public.microorganism_regulatory_documents;
    IF v_n <> 0 THEN RAISE EXCEPTION 'H05 FAIL: papel % leu documentos', v_err; END IF;
    RESET ROLE;
    v_pass := v_pass + 1;
  END LOOP;

  -- =================================================================
  -- H07 — Preparo: apenas administrador/gestor
  -- =================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_tec, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.rpc_regulatory_checklist_set(v_dossier, 'CEPA', 'CONFIRMED', NULL, NULL);
    RAISE EXCEPTION 'H07 FAIL: tecnico preparou dossie';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H07 FAIL%' THEN RAISE; END IF;
  END;
  RESET ROLE;
  v_pass := v_pass + 1;

  -- =================================================================
  -- H08..H12 — NCM com fonte oficial obrigatória (como gestor)
  -- =================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_gestor, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- H08 — sem fonte alguma
  BEGIN
    PERFORM public.rpc_regulatory_ncm_candidate_add(
      v_dossier, '30029099', 'justificativa longa o bastante para o gate', NULL, 'LOW', NULL, NULL, current_date);
    RAISE EXCEPTION 'H08 FAIL: candidato sem fonte aceito';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H08 FAIL%' THEN RAISE; END IF;
    IF v_err <> 'REGULATORY_NCM_SOURCE_REQUIRED' THEN
      RAISE EXCEPTION 'H08 FAIL: erro inesperado %', v_err;
    END IF;
  END;
  v_pass := v_pass + 1;

  -- H09 — URL não oficial
  BEGIN
    PERFORM public.rpc_regulatory_ncm_candidate_add(
      v_dossier, '30029099', 'justificativa longa o bastante para o gate', NULL, 'LOW', NULL,
      'https://consultoria.example.com/ncm', current_date);
    RAISE EXCEPTION 'H09 FAIL: URL nao oficial aceita';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H09 FAIL%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- H10 — sem data de consulta
  BEGIN
    PERFORM public.rpc_regulatory_ncm_candidate_add(
      v_dossier, '30029099', 'justificativa longa o bastante para o gate', NULL, 'LOW', NULL,
      'https://www.gov.br/receitafederal/tipi', NULL);
    RAISE EXCEPTION 'H10 FAIL: candidato sem consulted_at aceito';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H10 FAIL%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- H11 — URL oficial allowlisted é aceita
  v_cand := public.rpc_regulatory_ncm_candidate_add(
    v_dossier, '30029099', 'candidato de prova com fonte oficial allowlisted', NULL, 'LOW', NULL,
    'https://www.gov.br/receitafederal/tipi', current_date);
  IF v_cand IS NULL THEN RAISE EXCEPTION 'H11 FAIL: candidato com fonte oficial rejeitado'; END IF;
  v_pass := v_pass + 1;

  RESET ROLE;

  -- H12 — Aprovação exige fonte CADASTRADA + descrição + versão/data
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.rpc_regulatory_ncm_candidate_decide(v_cand, true, 'aprovado sem fonte cadastrada');
    RAISE EXCEPTION 'H12 FAIL: aprovacao sem fonte cadastrada';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H12 FAIL%' THEN RAISE; END IF;
    IF v_err <> 'REGULATORY_NCM_OFFICIAL_SOURCE_REQUIRED' THEN
      RAISE EXCEPTION 'H12 FAIL: erro inesperado %', v_err;
    END IF;
  END;
  v_pass := v_pass + 1;
  RESET ROLE;

  -- =================================================================
  -- H13..H15 — GTIN no motor
  -- =================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_gestor, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.rpc_regulatory_presentation_upsert(v_dossier, 987654,
      jsonb_build_object('label', 'probe', 'gtin', '7891000315508'));
    RAISE EXCEPTION 'H13 FAIL: GTIN com digito invalido aceito';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H13 FAIL%' THEN RAISE; END IF;
    IF v_err <> 'REGULATORY_GTIN_CHECK_DIGIT_INVALID' THEN
      RAISE EXCEPTION 'H13 FAIL: erro inesperado %', v_err;
    END IF;
  END;
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.rpc_regulatory_presentation_upsert(v_dossier, 987654,
      jsonb_build_object('label', 'probe', 'gtin_absent', true, 'gtin', '7891000315507'));
    RAISE EXCEPTION 'H14 FAIL: GTIN e SEM GTIN aceitos juntos';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H14 FAIL%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  v_pres := public.rpc_regulatory_presentation_upsert(v_dossier, 987654,
    jsonb_build_object('label', 'probe', 'gtin', '7891000315507'));
  IF v_pres IS NULL THEN RAISE EXCEPTION 'H15 FAIL: GTIN valido rejeitado'; END IF;
  v_pass := v_pass + 1;

  -- =================================================================
  -- H16..H18 — Storage escopado
  -- =================================================================
  BEGIN
    PERFORM public.rpc_regulatory_document_register(
      v_dossier, 'ROTULO', 'probe', 'arquivo-solto.pdf', repeat('a', 64));
    RAISE EXCEPTION 'H16 FAIL: path fora do padrao aceito';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H16 FAIL%' THEN RAISE; END IF;
    IF v_err <> 'REGULATORY_STORAGE_PATH_INVALID' THEN
      RAISE EXCEPTION 'H16 FAIL: erro inesperado %', v_err;
    END IF;
  END;
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.rpc_regulatory_document_register(
      v_dossier, 'ROTULO', 'probe',
      'dossiers/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/rotulo.pdf',
      repeat('a', 64));
    RAISE EXCEPTION 'H17 FAIL: path de outro dossie aceito';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H17 FAIL%' THEN RAISE; END IF;
    IF v_err <> 'REGULATORY_STORAGE_PATH_OUT_OF_SCOPE' THEN
      RAISE EXCEPTION 'H17 FAIL: erro inesperado %', v_err;
    END IF;
  END;
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.rpc_regulatory_document_register(
      v_dossier, 'ROTULO', 'probe',
      'dossiers/' || v_dossier || '/22222222-2222-2222-2222-222222222222/rotulo.pdf',
      repeat('a', 64));
    RAISE EXCEPTION 'H18 FAIL: documento registrado sem objeto no bucket';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H18 FAIL%' THEN RAISE; END IF;
    IF v_err <> 'REGULATORY_STORAGE_OBJECT_MISSING' THEN
      RAISE EXCEPTION 'H18 FAIL: erro inesperado %', v_err;
    END IF;
  END;
  v_pass := v_pass + 1;

  -- =================================================================
  -- H19..H22 — Segregação de funções e publicação
  -- =================================================================
  PERFORM public.rpc_regulatory_dossier_submit(v_dossier);
  RESET ROLE;

  -- Técnico aprova TECHNICAL
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_tec, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.rpc_regulatory_review_decide(v_dossier, 'TECHNICAL', 'APPROVED', 'prova de segregacao');

  -- H19 — mesma pessoa não pode aprovar REGULATORY
  BEGIN
    PERFORM public.rpc_regulatory_review_decide(v_dossier, 'REGULATORY', 'APPROVED', 'segunda camada mesma pessoa');
    RAISE EXCEPTION 'H19 FAIL: acumulo de camadas permitido';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H19 FAIL%' THEN RAISE; END IF;
    IF v_err <> 'REGULATORY_SEGREGATION_OF_DUTIES' THEN
      RAISE EXCEPTION 'H19 FAIL: erro inesperado %', v_err;
    END IF;
  END;
  v_pass := v_pass + 1;
  RESET ROLE;

  -- H20 — override emergencial exige administrador + justificativa forte
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_gestor, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.rpc_regulatory_sod_override(v_dossier, repeat('x', 50));
    RAISE EXCEPTION 'H20 FAIL: gestor concedeu override';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H20 FAIL%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.rpc_regulatory_sod_override(v_dossier, 'curta demais');
    RAISE EXCEPTION 'H21 FAIL: override com justificativa fraca aceito';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H21 FAIL%' THEN RAISE; END IF;
    IF v_err <> 'REGULATORY_OVERRIDE_JUSTIFICATION_WEAK' THEN
      RAISE EXCEPTION 'H21 FAIL: erro inesperado %', v_err;
    END IF;
  END;
  v_pass := v_pass + 1;

  -- H22 — Publicação bloqueada: aprovações incompletas
  BEGIN
    PERFORM public.rpc_regulatory_dossier_publish(v_dossier);
    RAISE EXCEPTION 'H22 FAIL: publicou sem tres aprovacoes';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'H22 FAIL%' THEN RAISE; END IF;
    IF v_err <> 'REGULATORY_APPROVALS_INCOMPLETE' THEN
      RAISE EXCEPTION 'H22 FAIL: erro inesperado %', v_err;
    END IF;
  END;
  v_pass := v_pass + 1;

  -- H23 — Rejeição devolve para DRAFT e nunca publica
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.rpc_regulatory_review_decide(v_dossier, 'FISCAL', 'REJECTED', 'prova de rejeicao');
  RESET ROLE;
  SELECT status INTO v_state FROM public.microorganism_regulatory_dossiers WHERE id = v_dossier;
  IF v_state <> 'DRAFT' THEN RAISE EXCEPTION 'H23 FAIL: rejeicao deixou o dossie em %', v_state; END IF;
  v_pass := v_pass + 1;

  -- H24 — Nenhum snapshot foi criado durante o harness
  SELECT count(*) INTO v_n FROM public.microorganism_regulatory_publication_snapshots
   WHERE dossier_id = v_dossier;
  IF v_n <> 0 THEN RAISE EXCEPTION 'H24 FAIL: snapshot criado indevidamente'; END IF;
  v_pass := v_pass + 1;

  RAISE NOTICE 'HARNESS RUNTIME AUTENTICADO F2-CORRECAO: %/24 PASS', v_pass;
  IF v_pass <> 24 THEN RAISE EXCEPTION 'HARNESS FAIL: % de 24', v_pass; END IF;
END $h$;

ROLLBACK;

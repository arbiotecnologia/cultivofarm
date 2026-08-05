-- Prova runtime das correções (2) e (3) — executa em transação e faz ROLLBACK.
-- Sem service_role como identidade funcional: cada RPC roda como role
-- `authenticated` com request.jwt.claims do usuário sob teste.
\set ON_ERROR_STOP on
BEGIN;

DO $guard$
DECLARE v_rows int; v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: marcador inexistente'; END IF;
  SELECT count(*) INTO v_rows FROM public._fiscal_staging_marker WHERE marker='STAGING';
  IF v_rows <> 1 THEN RAISE EXCEPTION 'GUARD_ABORT: linhas STAGING = %', v_rows; END IF;
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING';
  IF v_ref IS NULL OR v_ref = 'navfzbwgwzruipouyfnk' OR v_ref <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente % nao autorizado', coalesce(v_ref,'<null>'); END IF;
END $guard$;

DO $t$
DECLARE
  v_tec_atrib uuid := gen_random_uuid();   -- técnico atribuído (participante ativo)
  v_tec_livre uuid := gen_random_uuid();   -- técnico ligado ao cliente, NÃO atribuído
  v_cliente uuid;
  v_reg uuid;
  v_rec_uuid uuid := gen_random_uuid();
  v_versao int;
  v_count int;
  v_before jsonb;
  v_after jsonb;
  v_err text;
  v_state text;
  v_pass int := 0;
  v_fail int := 0;

BEGIN
  -- ---------- fixtures ----------
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (v_tec_atrib, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'harness_atrib_'||v_tec_atrib||'@example.invalid','x',now(),now(),now()),
         (v_tec_livre, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'harness_livre_'||v_tec_livre||'@example.invalid','x',now(),now(),now());

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_tec_atrib,'consultor_tecnico'::app_role), (v_tec_livre,'consultor_tecnico'::app_role);

  INSERT INTO public.clientes (nome, codigo_cliente)
  VALUES ('HARNESS CORRETIVA', 'HRN-'||substr(v_rec_uuid::text,1,8))
  RETURNING id INTO v_cliente;

  -- Ambos ligados ao cliente com manage (o vínculo NÃO pode bastar).
  INSERT INTO public.user_clientes (user_id, cliente_id, access_level, is_active)
  VALUES (v_tec_atrib, v_cliente, 'manage', true),
         (v_tec_livre, v_cliente, 'manage', true);

  INSERT INTO public.registros_consultor (cliente_id, status, created_by, natureza_registro)
  VALUES (v_cliente, 'rascunho'::status_registro_consultor, v_tec_atrib, 'visita'::natureza_registro_consultor)
  RETURNING id INTO v_reg;

  -- Somente o primeiro é participante ativo atribuído.
  INSERT INTO public.technical_visit_assignments (registro_consultor_id, user_id, role, is_active)
  VALUES (v_reg, v_tec_atrib, 'responsavel', true);

  -- ---------- C1: técnico ligado ao cliente, NÃO atribuído => forbidden_visita ----------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tec_livre, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.rpc_upsert_recomendacao_visita(v_reg, gen_random_uuid(),
      '{"recomendacao_tecnica":"tentativa indevida"}'::jsonb, NULL);
    RESET ROLE;
    RAISE NOTICE 'C1 FAIL: tecnico nao atribuido conseguiu gravar recomendacao'; v_fail := v_fail + 1;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM; RESET ROLE;
    IF v_err = 'forbidden_visita' THEN
      RAISE NOTICE 'C1 PASS: forbidden_visita para tecnico nao atribuido'; v_pass := v_pass + 1;
    ELSE
      RAISE NOTICE 'C1 FAIL: erro inesperado %', v_err; v_fail := v_fail + 1;
    END IF;
  END;

  SELECT count(*) INTO v_count FROM public.registros_consultor_recomendacoes WHERE registro_consultor_id = v_reg;
  IF v_count = 0 THEN RAISE NOTICE 'C1b PASS: contagem zero apos negativa'; v_pass := v_pass + 1;
  ELSE RAISE NOTICE 'C1b FAIL: % linhas gravadas', v_count; v_fail := v_fail + 1; END IF;

  -- ---------- C2: participante ativo atribuído consegue inserir ----------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tec_atrib, 'role','authenticated')::text, true);
  BEGIN
    SELECT (public.rpc_upsert_recomendacao_visita(v_reg, v_rec_uuid,
      '{"recomendacao_tecnica":"aplicar bio X"}'::jsonb, NULL)->>'versao')::int INTO v_versao;
    RESET ROLE;
    IF v_versao = 1 THEN RAISE NOTICE 'C2 PASS: participante inseriu recomendacao versao 1'; v_pass := v_pass + 1;
    ELSE RAISE NOTICE 'C2 FAIL: versao inesperada %', v_versao; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM; RESET ROLE;
    RAISE NOTICE 'C2 FAIL: %', v_err; v_fail := v_fail + 1;
  END;

  -- ---------- C3: versão DESATUALIZADA => version_conflict, registro inalterado ----------
  SELECT to_jsonb(r) - 'updated_at' INTO v_before
    FROM public.registros_consultor_recomendacoes r
   WHERE registro_consultor_id = v_reg AND client_uuid = v_rec_uuid;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tec_atrib, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.rpc_upsert_recomendacao_visita(v_reg, v_rec_uuid, '{"recomendacao_tecnica":"stale"}'::jsonb, 0);
    RESET ROLE;
    RAISE NOTICE 'C3 FAIL: versao desatualizada aceita'; v_fail := v_fail + 1;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM; v_state := SQLSTATE; RESET ROLE;
    IF v_err = 'version_conflict' AND v_state = 'P0001' THEN
      RAISE NOTICE 'C3 PASS: version_conflict P0001 (versao desatualizada)'; v_pass := v_pass + 1;
    ELSE RAISE NOTICE 'C3 FAIL: % / %', v_err, v_state; v_fail := v_fail + 1; END IF;
  END;

  -- ---------- C4: versão FUTURA => version_conflict, registro inalterado ----------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tec_atrib, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.rpc_upsert_recomendacao_visita(v_reg, v_rec_uuid, '{"recomendacao_tecnica":"futuro"}'::jsonb, 99);
    RESET ROLE;
    RAISE NOTICE 'C4 FAIL: versao futura aceita'; v_fail := v_fail + 1;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM; v_state := SQLSTATE; RESET ROLE;
    IF v_err = 'version_conflict' AND v_state = 'P0001' THEN
      RAISE NOTICE 'C4 PASS: version_conflict P0001 (versao futura)'; v_pass := v_pass + 1;
    ELSE RAISE NOTICE 'C4 FAIL: % / %', v_err, v_state; v_fail := v_fail + 1; END IF;
  END;

  SELECT to_jsonb(r) - 'updated_at' INTO v_after
    FROM public.registros_consultor_recomendacoes r
   WHERE registro_consultor_id = v_reg AND client_uuid = v_rec_uuid;
  IF v_before = v_after THEN RAISE NOTICE 'C5 PASS: recomendacao inalterada apos os dois conflitos'; v_pass := v_pass + 1;
  ELSE RAISE NOTICE 'C5 FAIL: recomendacao alterada'; v_fail := v_fail + 1; END IF;

  -- ---------- C6: versão EXATA => edição aceita ----------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tec_atrib, 'role','authenticated')::text, true);
  BEGIN
    SELECT (public.rpc_upsert_recomendacao_visita(v_reg, v_rec_uuid,
      '{"recomendacao_tecnica":"editada"}'::jsonb, 1)->>'versao')::int INTO v_versao;
    RESET ROLE;
    IF v_versao = 2 THEN RAISE NOTICE 'C6 PASS: edicao com versao exata -> versao 2'; v_pass := v_pass + 1;
    ELSE RAISE NOTICE 'C6 FAIL: versao %', v_versao; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM; RESET ROLE; RAISE NOTICE 'C6 FAIL: %', v_err; v_fail := v_fail + 1;
  END;

  -- ---------- C7: finalização por técnico NÃO atribuído => sem_permissao ----------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tec_livre, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.rpc_finalizar_visita_v2(v_reg, 1);
    RESET ROLE; RAISE NOTICE 'C7 FAIL: nao atribuido finalizou'; v_fail := v_fail + 1;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM; RESET ROLE;
    IF v_err = 'sem_permissao' THEN RAISE NOTICE 'C7 PASS: sem_permissao para nao atribuido'; v_pass := v_pass + 1;
    ELSE RAISE NOTICE 'C7 FAIL: erro inesperado %', v_err; v_fail := v_fail + 1; END IF;
  END;

  -- ---------- C8: participante atribuído passa da autorização (barra em cultura) ----------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tec_atrib, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.rpc_finalizar_visita_v2(v_reg,
      (SELECT version FROM public.registros_consultor WHERE id = v_reg));
    RESET ROLE; RAISE NOTICE 'C8 FAIL: finalizou sem cultura/checkin'; v_fail := v_fail + 1;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM; RESET ROLE;
    IF v_err IN ('cultura_obrigatoria','diagnostico_obrigatorio','checkin_obrigatorio') THEN
      RAISE NOTICE 'C8 PASS: participante autorizado, barrado por regra de negocio (%)', v_err; v_pass := v_pass + 1;
    ELSE RAISE NOTICE 'C8 FAIL: %', v_err; v_fail := v_fail + 1; END IF;
  END;

  RAISE NOTICE 'RESULTADO: % PASS / % FAIL', v_pass, v_fail;
  IF v_fail > 0 THEN RAISE EXCEPTION 'HARNESS_CORRETIVA_FAIL: % falhas', v_fail; END IF;
  RAISE NOTICE 'HARNESS_CORRETIVA_PASS';
END $t$;

ROLLBACK;

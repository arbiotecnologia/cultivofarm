-- =====================================================================
-- H5c — POSTCHECK ESTÁTICO + COMPORTAMENTAL DO CQ (staging ikaauvsflpmamgxmkhoq)
-- Cobre H5-003: autoria server-side, imutabilidade de resultado final e trilha,
-- append-only para reanálise, gate pela última análise e ausência de privilégio anon.
-- Transacional: TUDO é revertido com ROLLBACK ao final (zero resíduo).
-- Uso: bash restoration/os-e2e/staging-psql.sh -f restoration/homologacao-h5/40-h5c-cq-postcheck.sql
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: ambiente nao autorizado (%)', COALESCE(v_ref,'null');
  END IF;
END $guard$;

DO $post$
DECLARE
  v_pass int := 0;
  v_fail int := 0;
  v_ok boolean;
  v_src text;
  v_produto uuid;
  v_lote uuid;
  v_cq1 uuid;
  v_cq2 uuid;
  v_uid uuid;
  v_perfil uuid;
  v_other uuid;
  v_autor uuid;
  v_msg text;

BEGIN
  -- ---------- estático ----------
  v_ok := EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
     WHERE c.relname='controle_qualidade' AND p.proname='fn_cq_autoria_servidor' AND NOT t.tgisinternal);
  IF v_ok THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-E1 gatilho de autoria ativo';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-E1 gatilho de autoria ausente'; END IF;

  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc WHERE proname='fn_cq_autoria_servidor' LIMIT 1;
  v_ok := v_src ILIKE '%search_path%' AND v_src ILIKE '%SECURITY DEFINER%';
  IF v_ok THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-E2 secdef com search_path fixado';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-E2 secdef/search_path'; END IF;

  v_ok := NOT has_function_privilege('anon','public.fn_cq_autoria_servidor()','EXECUTE');
  IF v_ok THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-E3 anon sem EXECUTE na função de autoria';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-E3 anon com EXECUTE'; END IF;

  v_ok := EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
     WHERE c.relname='controle_qualidade' AND p.proname='fn_cq_resultado_imutavel' AND NOT t.tgisinternal);
  IF v_ok THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-E4 imutabilidade do resultado preservada (H5-B03)';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-E4 gatilho de imutabilidade ausente'; END IF;

  v_ok := NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polrelid='public.controle_qualidade'::regclass
      AND 'anon'::regrole = ANY (polroles));
  IF v_ok THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-E5 nenhuma policy de CQ concede acesso a anon';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-E5 policy de CQ exposta a anon'; END IF;

  v_ok := NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polrelid='public.controle_qualidade'::regclass AND polcmd='d');
  IF v_ok THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-E6 sem policy de DELETE dedicada (histórico protegido)';
  ELSE v_pass:=v_pass+1; RAISE NOTICE 'INFO H5-003-E6 existe policy de DELETE; gatilho de imutabilidade ainda barra registros finalizados'; END IF;

  -- ---------- comportamental (fixtures H5C-, revertidas no ROLLBACK) ----------
  SELECT id INTO v_produto FROM public.produtos ORDER BY created_at LIMIT 1;
  SELECT user_id INTO v_uid FROM public.profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_perfil FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  SELECT id INTO v_other FROM public.profiles WHERE user_id <> v_uid ORDER BY created_at LIMIT 1;
  IF v_uid IS NULL OR v_perfil IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'H5C_FIXTURE: sao necessarios ao menos 2 perfis para o teste de autoria';
  END IF;
  INSERT INTO public.lotes (codigo_lote, produto_id, data_producao, status, volume_produzido)
  VALUES ('H5C-'||substr(md5(random()::text),1,8), v_produto, now()::date, 'aguardando_cq', 100)
  RETURNING id INTO v_lote;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role','authenticated')::text, true);

  -- T1: autoria imposta pelo servidor mesmo sem informar responsavel_id
  INSERT INTO public.controle_qualidade (lote_id, data_analise, resultado, responsavel)
  VALUES (v_lote, now()::date, 'reprovado', 'H5C-analista')
  RETURNING id, responsavel_id INTO v_cq1, v_autor;
  IF v_autor = v_perfil THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-T1 responsavel_id preenchido com o perfil de auth.uid()';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-T1 autoria = % (esperado %)', v_autor, v_perfil; END IF;

  -- T2: autoria forjada é rejeitada
  BEGIN
    INSERT INTO public.controle_qualidade (lote_id, data_analise, resultado, responsavel_id)
    VALUES (v_lote, now()::date, 'aprovado', v_other);
    v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-T2 autoria forjada aceita';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'CQ_AUTORIA_FORJADA%' THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-T2 autoria forjada rejeitada';
    ELSE v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-T2 erro inesperado: %', v_msg; END IF;
  END;

  -- T3: UPDATE do resultado final é bloqueado
  BEGIN
    UPDATE public.controle_qualidade SET resultado='aprovado' WHERE id=v_cq1;
    v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-T3 resultado final sobrescrito';
  EXCEPTION WHEN check_violation THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-T3 resultado final imutável';
  END;

  -- T4: troca de autoria em UPDATE é bloqueada
  BEGIN
    UPDATE public.controle_qualidade SET responsavel_id=v_other WHERE id=v_cq1;
    v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-T4 autoria alterada por UPDATE';
  EXCEPTION WHEN check_violation THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-T4 autoria imutável em UPDATE';
  END;

  -- T5: DELETE de análise finalizada é bloqueado
  BEGIN
    DELETE FROM public.controle_qualidade WHERE id=v_cq1;
    v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-T5 histórico de CQ excluído';
  EXCEPTION WHEN check_violation THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-T5 DELETE de CQ finalizado bloqueado';
  END;

  -- T6: reanálise append-only preserva o histórico e governa o gate
  INSERT INTO public.controle_qualidade (lote_id, data_analise, resultado, responsavel)
  VALUES (v_lote, now()::date, 'aprovado', 'H5C-reanalise')
  RETURNING id INTO v_cq2;
  v_ok := (SELECT count(*) FROM public.controle_qualidade WHERE lote_id=v_lote) = 2
      AND EXISTS (SELECT 1 FROM public.controle_qualidade WHERE id=v_cq1 AND resultado='reprovado');
  IF v_ok THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-T6 reanálise cria novo registro e preserva o anterior';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-T6 histórico não preservado'; END IF;

  v_ok := (SELECT resultado::text FROM public.controle_qualidade
            WHERE lote_id=v_lote ORDER BY created_at DESC, seq DESC LIMIT 1) = 'aprovado';
  IF v_ok THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-003-T7 gate usa a última análise (aprovado)';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-003-T7 gate não usa a última análise'; END IF;

  PERFORM set_config('request.jwt.claims', '', true);

  RAISE NOTICE 'H5C POSTCHECK: % PASS / % FAIL', v_pass, v_fail;
  IF v_fail > 0 THEN RAISE EXCEPTION 'FAIL_H5C_POSTCHECK'; END IF;
  RAISE NOTICE 'PASS_H5C_POSTCHECK';
END $post$;

ROLLBACK;

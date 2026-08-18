-- H5c — postcheck do fechamento do bypass de UPDATE/DELETE em envase.
-- Transacional, termina em ROLLBACK. Staging ikaauvsflpmamgxmkhoq.
\set ON_ERROR_STOP on
BEGIN;

DO $t$
DECLARE
  v_pass int := 0; v_fail int := 0;
  v_prod uuid; v_lote uuid; v_env uuid; v_ok boolean;
BEGIN
  -- E1 gatilho ativo em UPDATE e DELETE
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
     WHERE t.tgrelid='public.envase'::regclass AND p.proname='fn_envase_material_imutavel'
       AND NOT t.tgisinternal AND (t.tgtype & 16) > 0 AND (t.tgtype & 8) > 0)
    INTO v_ok;
  IF v_ok THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-002-E1 gatilho cobre UPDATE e DELETE';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-002-E1 gatilho ausente/parcial'; END IF;

  SELECT (proconfig::text ILIKE '%search_path%') INTO v_ok FROM pg_proc WHERE proname='fn_envase_material_imutavel';
  IF v_ok THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-002-E2 search_path fixado';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-002-E2 search_path ausente'; END IF;

  SELECT NOT has_function_privilege('anon','public.fn_envase_material_imutavel()','EXECUTE') INTO v_ok;
  IF v_ok THEN v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-002-E3 anon sem EXECUTE';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-002-E3 anon com EXECUTE'; END IF;

  -- fixture
  SELECT id INTO v_prod FROM public.produtos WHERE ativo IS NOT FALSE LIMIT 1;
  INSERT INTO public.lotes (codigo_lote, produto_id, data_producao, status, volume_produzido)
  VALUES ('H5C-'||substr(md5(random()::text),1,8), v_prod, now()::date, 'aprovado', 10000)
  RETURNING id INTO v_lote;
  INSERT INTO public.controle_qualidade (lote_id, data_analise, resultado)
  VALUES (v_lote, now()::date, 'aprovado');
  INSERT INTO public.envase (lote_id, tipo_embalagem, volume_por_unidade, quantidade, data_envase)
  VALUES (v_lote, 'frasco_1L', 1000, 4, now()::date) RETURNING id INTO v_env;

  -- T1 aumento de quantidade via UPDATE deve falhar
  BEGIN
    UPDATE public.envase SET quantidade = 40 WHERE id = v_env;
    v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-002-T1 UPDATE de quantidade permitido (sobre-envase)';
  EXCEPTION WHEN check_violation THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-002-T1 UPDATE de quantidade bloqueado';
  END;

  -- T2 troca de lote bloqueada
  BEGIN
    UPDATE public.envase SET volume_por_unidade = 9000 WHERE id = v_env;
    v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-002-T2 UPDATE de volume_por_unidade permitido';
  EXCEPTION WHEN check_violation THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-002-T2 UPDATE de volume_por_unidade bloqueado';
  END;

  -- T3 DELETE bloqueado
  BEGIN
    DELETE FROM public.envase WHERE id = v_env;
    v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-002-T3 DELETE de envase permitido';
  EXCEPTION WHEN check_violation THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-002-T3 DELETE de envase bloqueado';
  END;

  -- T4 campos não materiais continuam editáveis (ex.: observacoes/operador)
  BEGIN
    UPDATE public.envase SET data_envase = data_envase WHERE id = v_env;
    v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-002-T4 UPDATE nao material permitido';
  EXCEPTION WHEN others THEN
    v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-002-T4 UPDATE nao material bloqueado: %', SQLERRM;
  END;

  -- T5 novo envase dentro do saldo continua funcionando
  BEGIN
    INSERT INTO public.envase (lote_id, tipo_embalagem, volume_por_unidade, quantidade, data_envase)
    VALUES (v_lote, 'frasco_1L', 1000, 6, now()::date);
    v_pass:=v_pass+1; RAISE NOTICE 'PASS H5-002-T5 envase dentro do saldo permitido';
  EXCEPTION WHEN others THEN
    v_fail:=v_fail+1; RAISE WARNING 'FAIL H5-002-T5 envase valido bloqueado: %', SQLERRM;
  END;

  RAISE NOTICE 'H5C ENVASE POSTCHECK: % PASS / % FAIL', v_pass, v_fail;
  IF v_fail > 0 THEN RAISE EXCEPTION 'FAIL_H5C_ENVASE_POSTCHECK'; END IF;
  RAISE NOTICE 'PASS_H5C_ENVASE_POSTCHECK';
END $t$;

ROLLBACK;

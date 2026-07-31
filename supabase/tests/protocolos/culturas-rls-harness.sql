-- Harness RLS/integridade — Módulo Protocolos (Culturas e Objetivos de Visita)
-- Ambiente: STAGING ikaauvsflpmamgxmkhoq apenas. NÃO executar em produção.
-- Execução: psql --single-transaction -f este-arquivo.sql
-- Todo o harness roda dentro de transação e termina com ROLLBACK: não persiste dados.

BEGIN;

DO $$
DECLARE
  v_admin uuid;
  v_prod  uuid;
  v_id    uuid;
  v_ok    boolean;
BEGIN
  SELECT ur.user_id INTO v_admin FROM public.user_roles ur WHERE ur.role = 'administrador' LIMIT 1;
  SELECT ur.user_id INTO v_prod  FROM public.user_roles ur WHERE ur.role = 'cliente_produtor' LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'harness: nenhum administrador disponível'; END IF;

  ---------------------------------------------------------------- T1
  -- Admin cria cultura
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  INSERT INTO public.culturas (nome) VALUES ('__HARNESS_Cultura__') RETURNING id INTO v_id;
  RAISE NOTICE 'T1 PASS admin insere cultura';

  ---------------------------------------------------------------- T2
  -- Duplicidade case-insensitive bloqueada
  BEGIN
    INSERT INTO public.culturas (nome) VALUES ('  __harness_cultura__ ');
    RAISE EXCEPTION 'T2 FAIL duplicidade case-insensitive aceita';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'T2 PASS duplicidade case-insensitive bloqueada';
  END;

  ---------------------------------------------------------------- T3
  -- Cultura sem uso pode ser excluída fisicamente
  BEGIN
    DELETE FROM public.culturas WHERE id = v_id;
    RAISE NOTICE 'T3 PASS cultura sem uso pode ser excluída';
  END;

  -- recria para os testes seguintes
  INSERT INTO public.culturas (nome) VALUES ('__HARNESS_Cultura__') RETURNING id INTO v_id;

  ---------------------------------------------------------------- T4
  -- Cultura em uso não pode ser excluída
  INSERT INTO public.objetivos_visita_sugestoes (cultura_id, texto, ativo)
  VALUES (v_id, '__HARNESS_objetivo__', true);
  SELECT public.fn_cultura_em_uso(v_id) INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'T4 FAIL fn_cultura_em_uso não detectou uso'; END IF;
  BEGIN
    DELETE FROM public.culturas WHERE id = v_id;
    RAISE EXCEPTION 'T4 FAIL exclusão de cultura em uso permitida';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'T4 PASS exclusão de cultura em uso bloqueada';
  END;

  ---------------------------------------------------------------- T5
  -- Desativação carimba auditoria
  UPDATE public.culturas SET ativo = false WHERE id = v_id;
  SELECT (desativada_em IS NOT NULL AND desativada_por IS NOT DISTINCT FROM v_admin)
    INTO v_ok FROM public.culturas WHERE id = v_id;
  IF NOT v_ok THEN RAISE EXCEPTION 'T5 FAIL auditoria de desativação ausente'; END IF;
  RAISE NOTICE 'T5 PASS desativação auditada';

  ---------------------------------------------------------------- T6
  -- Reativação limpa auditoria
  UPDATE public.culturas SET ativo = true WHERE id = v_id;
  SELECT (desativada_em IS NULL AND desativada_por IS NULL) INTO v_ok
    FROM public.culturas WHERE id = v_id;
  IF NOT v_ok THEN RAISE EXCEPTION 'T6 FAIL reativação não limpou auditoria'; END IF;
  RAISE NOTICE 'T6 PASS reativação limpa auditoria';

  ---------------------------------------------------------------- T7/T8
  -- Produtor: leitura permitida, escrita negada (culturas e objetivos)
  IF v_prod IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_prod, 'role','authenticated')::text, true);
    PERFORM 1 FROM public.culturas WHERE id = v_id;
    RAISE NOTICE 'T7 PASS produtor lê culturas';
    BEGIN
      UPDATE public.culturas SET nome = '__HACK__' WHERE id = v_id;
      IF FOUND THEN RAISE EXCEPTION 'T8 FAIL produtor alterou cultura'; END IF;
      RAISE NOTICE 'T8 PASS produtor não altera cultura';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'T8 PASS produtor bloqueado por RLS';
    END;
    BEGIN
      INSERT INTO public.objetivos_visita_sugestoes (cultura_id, texto, ativo)
      VALUES (v_id, '__HACK__', true);
      RAISE EXCEPTION 'T9 FAIL produtor inseriu objetivo de visita';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'T9 PASS produtor não insere objetivo de visita';
    END;
  ELSE
    RAISE NOTICE 'T7-T9 SKIP nenhum cliente_produtor disponível';
  END IF;

  RAISE NOTICE 'HARNESS CULTURAS: OK';
END $$;

ROLLBACK;

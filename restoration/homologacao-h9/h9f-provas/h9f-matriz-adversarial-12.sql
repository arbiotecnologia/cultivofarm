-- ============================================================================
-- H9-F2 — MATRIZ ADVERSARIAL 12/12 (ausencia de oraculo de existencia).
--
-- 3 RPCs de visita x 4 combinacoes de sonda:
--   (registro inexistente | registro alheio REAL) x (client_uuid EXISTENTE | aleatorio)
--
-- Criterio de aprovacao de cada caso: o usuario SEM ESCOPO recebe exatamente
-- a mesma superficie (SQLSTATE + mensagem) do caso de referencia do mesmo RPC.
-- Qualquer diferenca revela existencia de registro ou de client_uuid.
--
-- Executar SEMPRE dentro de BEGIN ... ROLLBACK externo (residuo zero).
-- Sem BEGIN/COMMIT internos. Somente homologacao ikaauvsflpmamgxmkhoq.
--
-- Identidades reais de homologacao:
--   dono       77905960-8e07-4214-b1c9-516a381fcd28 (consultor_tecnico)
--   sem escopo 7c04c4d1-6892-44cc-97b4-25eae04f46ea (producao)
-- ============================================================================

SET LOCAL search_path = public;

DO $$
DECLARE
  v_dono   uuid := '77905960-8e07-4214-b1c9-516a381fcd28';
  v_out    uuid := '7c04c4d1-6892-44cc-97b4-25eae04f46ea';
  v_tag    text := 'H9F-MATRIZ12';
  v_regA   uuid := gen_random_uuid();   -- visita real do dono (finish/checkin)
  v_regB   uuid := gen_random_uuid();   -- visita real do dono (checkout)
  v_ghost  uuid := gen_random_uuid();   -- registro inexistente
  v_cu_ex  uuid := gen_random_uuid();   -- client_uuid EXISTENTE em visitas_checkin
  v_cu     uuid;
  v_reg    uuid;
  v_pass   int := 0;
  v_fail   int := 0;
  v_ref    text;
  v_obs    text;
  s        text;
  rpc      text;
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

  ------------------------------------------------------- usuario SEM ESCOPO
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_out, 'role','authenticated')::text, true);

  FOREACH rpc IN ARRAY ARRAY['finish','checkin','checkout'] LOOP
    v_ref := NULL;
    FOREACH s IN ARRAY ARRAY['ghost:existente','ghost:aleatorio','alheio:existente','alheio:aleatorio'] LOOP
      v_cu  := CASE WHEN s LIKE '%existente' THEN v_cu_ex ELSE gen_random_uuid() END;
      v_reg := CASE
                 WHEN s LIKE 'ghost%' THEN v_ghost
                 WHEN rpc = 'checkout' THEN v_regB
                 ELSE v_regA
               END;
      BEGIN
        IF rpc = 'finish' THEN
          PERFORM public.finish_technical_visit_secure(v_reg, -21, -47, 5, NULL, NULL, v_tag, v_cu);
        ELSIF rpc = 'checkin' THEN
          PERFORM public.rpc_realizar_checkin_visita(v_reg, v_cu,
            'chegada_fazenda'::public.tipo_checkin, -21,-47,5,NULL,v_tag,
            NULL,NULL,NULL,NULL,NULL,NULL);
        ELSE
          PERFORM public.rpc_realizar_checkout_visita(v_reg, v_cu, -21,-47,5,NULL,v_tag,NULL,NULL);
        END IF;
        v_obs := 'SEM_ERRO';
      EXCEPTION WHEN OTHERS THEN
        v_obs := SQLSTATE || '|' || SQLERRM;
      END;

      IF v_ref IS NULL THEN
        v_ref := v_obs;
      END IF;

      IF v_obs = v_ref AND v_obs LIKE '42501|%' THEN
        v_pass := v_pass + 1;
        RAISE NOTICE 'PASS % [%] -> %', rpc, s, v_obs;
      ELSE
        v_fail := v_fail + 1;
        RAISE NOTICE 'FAIL % [%] -> % (referencia: %)', rpc, s, v_obs, v_ref;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE '=== H9-F MATRIZ ADVERSARIAL: % PASS / % FAIL (esperado 12/0) ===', v_pass, v_fail;
  IF v_fail > 0 OR v_pass <> 12 THEN
    RAISE EXCEPTION 'H9F_MATRIZ_FALHOU: % pass, % fail', v_pass, v_fail;
  END IF;
END $$;

-- H9-E1R - prova adversarial de public.finish_technical_visit_secure(...)
-- Executar SEMPRE dentro de BEGIN ... ROLLBACK externo. Sem BEGIN/COMMIT internos.
-- Requer psql -v fase=pre | pos e a tabela temporaria _h9e1r criada pelo ensaio.
--
-- Identidades reais de homologacao:
--   dono      77905960-8e07-4214-b1c9-516a381fcd28 (consultor_tecnico)
--   admin     b5c2ebd4-7cdf-4647-a585-6ec49f1b583a (administrador)
--   sem escopo 7c04c4d1-6892-44cc-97b4-25eae04f46ea (producao)

SET LOCAL search_path = public;

DO $$
DECLARE
  v_fase   text := current_setting('h9e1r.fase', true);
  v_dono   uuid := '77905960-8e07-4214-b1c9-516a381fcd28';
  v_admin  uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a';
  v_alheio uuid := '7c04c4d1-6892-44cc-97b4-25eae04f46ea';
  v_tag    text := 'H9E1R-' || v_fase;
  v_regA   uuid := gen_random_uuid();   -- em_andamento, com diagnostico, do dono
  v_regB   uuid := gen_random_uuid();   -- rascunho (estado incompativel)
  v_regC   uuid := gen_random_uuid();   -- em_andamento sem diagnostico
  v_regD   uuid := gen_random_uuid();   -- em_andamento, com diagnostico, do admin-alvo
  v_regE   uuid := gen_random_uuid();   -- em_andamento sem problema_principal
  v_cu     uuid := gen_random_uuid();   -- client_uuid do encerramento legitimo
  r        record;
  v_ck     uuid;
BEGIN
  PERFORM set_config('h9e1r.tag', v_tag, true);

  -- fixtures minimas e identificaveis
  INSERT INTO public.registros_consultor
    (id, natureza_registro, status, consultor_responsavel, created_by,
     observacoes_tecnicas, problema_principal)
  VALUES
    (v_regA,'visita','rascunho',v_dono, v_dono, v_tag,'H9E1R problema principal'),
    (v_regB,'visita','rascunho',v_dono, v_dono, v_tag,'H9E1R problema principal'),
    (v_regC,'visita','rascunho',v_dono, v_dono, v_tag,'H9E1R problema principal'),
    (v_regD,'visita','rascunho',v_admin,v_admin,v_tag,'H9E1R problema principal'),
    (v_regE,'visita','rascunho',v_dono, v_dono, v_tag, NULL);

  -- participantes ativos: alimentam is_active_visit_participant e
  -- has_completed_visit_presence (que ignora consultor_responsavel puro)
  INSERT INTO public.technical_visit_assignments (registro_consultor_id, user_id, role, is_active)
  VALUES (v_regA, v_dono, 'participante', true),
         (v_regD, v_admin,'participante', true);

  INSERT INTO public.visita_diagnosticos (registro_id, versao)
  VALUES (v_regA,1),(v_regD,1),(v_regE,1);

  UPDATE public.registros_consultor SET status='em_andamento'
   WHERE id IN (v_regA, v_regC, v_regD, v_regE);

  -- check-in de entrada, para que o ciclo exista antes do encerramento
  INSERT INTO public.visitas_checkin
    (registro_consultor_id, consultor_id, tipo_checkin, status, observacoes, data_hora_checkin)
  VALUES
    (v_regA, v_dono,  'chegada_fazenda'::public.tipo_checkin, 'realizado'::public.status_checkin, v_tag, now() - interval '2 hours'),
    (v_regD, v_admin, 'chegada_fazenda'::public.tipo_checkin, 'realizado'::public.status_checkin, v_tag, now() - interval '2 hours');

  ---------------------------------------------------------------- 1 nao autenticado
  BEGIN
    PERFORM public.finish_technical_visit_secure(gen_random_uuid());
    INSERT INTO _h9e1r VALUES (v_fase,'01-nao-autenticado','00000','PERMITIDO (inesperado)');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _h9e1r VALUES (v_fase,'01-nao-autenticado',SQLSTATE,left(SQLERRM,90));
  END;

  ---------------------------------------------------------------- 2 UUID inexistente
  BEGIN
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_dono,'role','authenticated')::text, true);
    PERFORM public.finish_technical_visit_secure(gen_random_uuid());
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'02-uuid-inexistente','00000','PERMITIDO (inesperado)');
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'02-uuid-inexistente',SQLSTATE,left(SQLERRM,90));
  END;

  ---------------------------------------------------------------- 3 registro alheio real
  BEGIN
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_alheio,'role','authenticated')::text, true);
    PERFORM public.finish_technical_visit_secure(v_regA);
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'03-registro-alheio','00000','PERMITIDO (inesperado)');
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'03-registro-alheio',SQLSTATE,left(SQLERRM,90));
  END;

  ---------------------------------------------------------------- 4 dono legitimo
  BEGIN
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_dono,'role','authenticated')::text, true);
    SELECT * INTO r FROM public.finish_technical_visit_secure(v_regA,NULL,NULL,NULL,NULL,NULL,v_tag,v_cu);
    PERFORM set_config('role','none',true);
    v_ck := r.checkout_id;
    INSERT INTO _h9e1r VALUES (v_fase,'04-dono-legitimo','00000',
      format('checkout=%s status=%s', r.checkout_id,
        (SELECT status FROM public.registros_consultor WHERE id=v_regA)));
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'04-dono-legitimo',SQLSTATE,left(SQLERRM,90));
  END;

  ---------------------------------------------------------------- 5 duplo clique (mesmo client_uuid)
  BEGIN
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_dono,'role','authenticated')::text, true);
    SELECT * INTO r FROM public.finish_technical_visit_secure(v_regA,NULL,NULL,NULL,NULL,NULL,v_tag,v_cu);
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'05-duplo-clique','00000',
      format('checkout=%s idempotente=%s', r.checkout_id, (r.checkout_id = v_ck)));
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'05-duplo-clique',SQLSTATE,left(SQLERRM,90));
  END;

  ---------------------------------------------------------------- 6 reuso conflitante do client_uuid
  BEGIN
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_dono,'role','authenticated')::text, true);
    PERFORM public.finish_technical_visit_secure(v_regC,NULL,NULL,NULL,NULL,NULL,v_tag,v_cu);
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'06-reuso-conflitante','00000','PERMITIDO (inesperado)');
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'06-reuso-conflitante',SQLSTATE,left(SQLERRM,90));
  END;

  ---------------------------------------------------------------- 7 estado incompativel (rascunho)
  BEGIN
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_dono,'role','authenticated')::text, true);
    PERFORM public.finish_technical_visit_secure(v_regB);
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'07-estado-incompativel','00000','PERMITIDO (inesperado)');
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'07-estado-incompativel',SQLSTATE,left(SQLERRM,90));
  END;

  ---------------------------------------------------------------- 8 sem diagnostico
  BEGIN
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_dono,'role','authenticated')::text, true);
    PERFORM public.finish_technical_visit_secure(v_regC);
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'08-sem-diagnostico','00000','PERMITIDO (inesperado)');
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'08-sem-diagnostico',SQLSTATE,left(SQLERRM,90));
  END;

  ---------------------------------------------------------------- 9 problema_principal obrigatorio
  BEGIN
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_dono,'role','authenticated')::text, true);
    PERFORM public.finish_technical_visit_secure(v_regE);
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'09-sem-problema-principal','00000','PERMITIDO (inesperado)');
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'09-sem-problema-principal',SQLSTATE,left(SQLERRM,90));
  END;

  ---------------------------------------------------------------- 10 administrador legitimo
  BEGIN
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
    SELECT * INTO r FROM public.finish_technical_visit_secure(v_regD,NULL,NULL,NULL,NULL,NULL,v_tag,gen_random_uuid());
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'10-administrador','00000',
      format('checkout=%s status=%s', r.checkout_id,
        (SELECT status FROM public.registros_consultor WHERE id=v_regD)));
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1r VALUES (v_fase,'10-administrador',SQLSTATE,left(SQLERRM,90));
  END;

  PERFORM set_config('request.jwt.claims', NULL, true);

  ---------------------------------------------------------------- 11 semantica do check-in gravado
  INSERT INTO _h9e1r
  SELECT v_fase, '11-tipos-gravados', '00000',
         COALESCE(string_agg(t.tipo_checkin::text || '=' || t.n, ' ' ORDER BY t.tipo_checkin::text), 'nenhum')
    FROM (SELECT c.tipo_checkin, count(*)::text AS n
            FROM public.visitas_checkin c
           WHERE c.observacoes = v_tag
           GROUP BY c.tipo_checkin) t;

  INSERT INTO _h9e1r
  SELECT v_fase, '12-checkout-do-encerramento', '00000',
         format('checkout=%s inicio_visita=%s',
           count(*) FILTER (WHERE c.tipo_checkin='checkout'::public.tipo_checkin),
           count(*) FILTER (WHERE c.tipo_checkin='inicio_visita'::public.tipo_checkin))
    FROM public.visitas_checkin c
   WHERE c.registro_consultor_id IN (v_regA, v_regD);

  INSERT INTO _h9e1r
  SELECT v_fase, '13-ciclo-fechado-consumidores', '00000',
         format('can_checkout_dono=%s presenca_completa=%s',
                public.can_checkout_technical_visit(v_dono, v_regA),
                public.has_completed_visit_presence(v_regA));
END $$;

-- 14: ACL efetiva para anon (superficie de execucao)
DO $$
BEGIN
  PERFORM set_config('role','anon',true);
  PERFORM public.finish_technical_visit_secure(gen_random_uuid());
  PERFORM set_config('role','none',true);
  INSERT INTO _h9e1r VALUES (current_setting('h9e1r.fase',true),'14-anon','00000','PERMITIDO (inesperado)');
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role','none',true);
  INSERT INTO _h9e1r VALUES (current_setting('h9e1r.fase',true),'14-anon',SQLSTATE,left(SQLERRM,90));
END $$;

-- H9-E1 — prova de convergência ponta a ponta: rascunho -> em_andamento -> finalizado.
-- Executar dentro de BEGIN ... ROLLBACK externo. Sem BEGIN/COMMIT internos.

SET LOCAL search_path = public;

CREATE TEMP TABLE _h9e1_e2e(passo text, sqlstate text, detalhe text) ON COMMIT DROP;

DO $$
DECLARE
  v_dono uuid := '77905960-8e07-4214-b1c9-516a381fcd28';
  v_reg  uuid := gen_random_uuid();
  r      record;
  f      record;
BEGIN
  INSERT INTO public.registros_consultor
    (id, natureza_registro, status, consultor_responsavel, created_by, observacoes_tecnicas, problema_principal)
  VALUES (v_reg, 'visita', 'rascunho', v_dono, v_dono, 'H9E1-E2E', 'H9E1-E2E problema principal');

  INSERT INTO public.visita_diagnosticos (registro_id, versao) VALUES (v_reg, 1);

  -- start
  BEGIN
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dono, 'role','authenticated')::text, true);
    SELECT * INTO r FROM public.start_technical_visit_secure(v_reg, NULL,NULL,NULL,NULL,NULL,'H9E1-E2E','H9E1-E2E sem gps', gen_random_uuid());
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_e2e VALUES ('1-start','00000', format('checkin=%s status=%s', r.checkin_id,
      (SELECT status FROM public.registros_consultor WHERE id=v_reg)));
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_e2e VALUES ('1-start', SQLSTATE, SQLERRM);
  END;

  -- finish
  BEGIN
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dono, 'role','authenticated')::text, true);
    SELECT * INTO f FROM public.finish_technical_visit_secure(v_reg, NULL,NULL,NULL,NULL,NULL,'H9E1-E2E', gen_random_uuid());
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_e2e VALUES ('2-finish','00000', format('checkout=%s status=%s', f.checkout_id,
      (SELECT status FROM public.registros_consultor WHERE id=v_reg)));
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_e2e VALUES ('2-finish', SQLSTATE, SQLERRM);
  END;

  -- regressão: transição proibida continua bloqueada (rascunho -> aprovado)
  BEGIN
    UPDATE public.registros_consultor SET status='aprovado' WHERE id=v_reg;
    INSERT INTO _h9e1_e2e VALUES ('3-regressao-finalizado-para-aprovado','00000','PERMITIDO (inesperado)');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _h9e1_e2e VALUES ('3-regressao-finalizado-para-aprovado', SQLSTATE, left(SQLERRM,120));
  END;

  -- regressão: finalizar sem problema_principal a partir de em_andamento
  DECLARE v_reg2 uuid := gen_random_uuid();
  BEGIN
    INSERT INTO public.registros_consultor
      (id, natureza_registro, status, consultor_responsavel, created_by, observacoes_tecnicas)
    VALUES (v_reg2, 'visita', 'rascunho', v_dono, v_dono, 'H9E1-E2E');
    UPDATE public.registros_consultor SET status='em_andamento' WHERE id=v_reg2;
    BEGIN
      UPDATE public.registros_consultor SET status='finalizado' WHERE id=v_reg2;
      INSERT INTO _h9e1_e2e VALUES ('4-regressao-sem-problema-principal','00000','PERMITIDO (inesperado)');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _h9e1_e2e VALUES ('4-regressao-sem-problema-principal', SQLSTATE, left(SQLERRM,120));
    END;
  END;

  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

RESET ROLE;
SELECT * FROM _h9e1_e2e ORDER BY passo;
SELECT count(*) AS status_log_e2e FROM public.registros_consultor_status_log l
  JOIN public.registros_consultor r ON r.id=l.registro_consultor_id
 WHERE r.observacoes_tecnicas='H9E1-E2E';

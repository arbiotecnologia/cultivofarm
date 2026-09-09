-- H9-E1 — prova dinâmica do fluxo de início de visita (homologação ikaauvsflpmamgxmkhoq).
-- Executar SEMPRE com \set ON_ERROR_STOP on dentro de BEGIN ... ROLLBACK externo.
-- Não contém BEGIN/COMMIT internos: todo controle de erro usa subtransações plpgsql.

\set QUIET on
SET LOCAL search_path = public;

-- Fixture mínima e identificável
CREATE TEMP TABLE _h9e1_fx ON COMMIT DROP AS
SELECT
  'H9E1-FIXTURE'::text                                   AS tag,
  '77905960-8e07-4214-b1c9-516a381fcd28'::uuid           AS dono,
  'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a'::uuid           AS admin,
  '3e16d523-1bc9-4502-a5d6-04d150747236'::uuid           AS sem_escopo,
  gen_random_uuid()                                      AS reg_dono,
  gen_random_uuid()                                      AS reg_admin,
  gen_random_uuid()                                      AS inexistente,
  gen_random_uuid()                                      AS cuid1;

INSERT INTO public.registros_consultor (id, natureza_registro, status, consultor_responsavel, created_by, observacoes_tecnicas)
SELECT reg_dono, 'visita'::natureza_registro_consultor, 'rascunho'::status_registro_consultor, dono, dono, tag FROM _h9e1_fx
UNION ALL
SELECT reg_admin, 'visita'::natureza_registro_consultor, 'rascunho'::status_registro_consultor, dono, dono, tag FROM _h9e1_fx;

CREATE TEMP TABLE _h9e1_result(caso text, sqlstate text, msg text, retorno text) ON COMMIT DROP;

DO $$
DECLARE
  f record;
  r record;
  v_out text;
BEGIN
  SELECT * INTO f FROM _h9e1_fx;

  -- 1) DONO LEGÍTIMO
  BEGIN
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', f.dono, 'role','authenticated')::text, true);
    SELECT * INTO r FROM public.start_technical_visit_secure(f.reg_dono, NULL,NULL,NULL,NULL,NULL,'H9E1-FIXTURE',
                                                             'H9E1-FIXTURE sem gps', f.cuid1);
    v_out := format('checkin=%s is_new=%s status=%s', r.checkin_id, r.is_new,
                    (SELECT status FROM public.registros_consultor WHERE id=f.reg_dono));
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('1-dono-legitimo','00000',NULL,v_out);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('1-dono-legitimo', SQLSTATE, SQLERRM, NULL);
  END;

  -- 2) DONO — CLIQUE REPETIDO (mesmo client_uuid)
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', f.dono, 'role','authenticated')::text, true);
    SELECT * INTO r FROM public.start_technical_visit_secure(f.reg_dono, NULL,NULL,NULL,NULL,NULL,'H9E1-FIXTURE',
                                                             'H9E1-FIXTURE sem gps', f.cuid1);
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('2-clique-repetido','00000',NULL, format('checkin=%s is_new=%s', r.checkin_id, r.is_new));
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('2-clique-repetido', SQLSTATE, SQLERRM, NULL);
  END;

  -- 3) ADMINISTRADOR em outro registro
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', f.admin, 'role','authenticated')::text, true);
    SELECT * INTO r FROM public.start_technical_visit_secure(f.reg_admin, NULL,NULL,NULL,NULL,NULL,'H9E1-FIXTURE',
                                                             'H9E1-FIXTURE sem gps', NULL);
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('3-admin','00000',NULL,
      format('checkin=%s is_new=%s status=%s', r.checkin_id, r.is_new,
             (SELECT status FROM public.registros_consultor WHERE id=f.reg_admin)));
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('3-admin', SQLSTATE, SQLERRM, NULL);
  END;

  -- 4) AUTENTICADO SEM ESCOPO
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', f.sem_escopo, 'role','authenticated')::text, true);
    SELECT * INTO r FROM public.start_technical_visit_secure(f.reg_dono, NULL,NULL,NULL,NULL,NULL,'H9E1-FIXTURE',
                                                             'H9E1-FIXTURE sem gps', NULL);
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('4-sem-escopo','00000',NULL, format('checkin=%s', r.checkin_id));
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('4-sem-escopo', SQLSTATE, SQLERRM, NULL);
  END;

  -- 5) REGISTRO INEXISTENTE (mesma identidade sem escopo) — deve ser indistinguível do caso 4
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', f.sem_escopo, 'role','authenticated')::text, true);
    SELECT * INTO r FROM public.start_technical_visit_secure(f.inexistente, NULL,NULL,NULL,NULL,NULL,'H9E1-FIXTURE',
                                                             'H9E1-FIXTURE sem gps', NULL);
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('5-inexistente','00000',NULL, format('checkin=%s', r.checkin_id));
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('5-inexistente', SQLSTATE, SQLERRM, NULL);
  END;

  -- 6) IDEMPOTÊNCIA ALHEIA: client_uuid do dono consultado por identidade sem escopo
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', f.sem_escopo, 'role','authenticated')::text, true);
    SELECT * INTO r FROM public.start_technical_visit_secure(f.reg_dono, NULL,NULL,NULL,NULL,NULL,'H9E1-FIXTURE',
                                                             'H9E1-FIXTURE sem gps', f.cuid1);
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('6-cuid-alheio','00000',NULL, format('checkin=%s is_new=%s', r.checkin_id, r.is_new));
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('6-cuid-alheio', SQLSTATE, SQLERRM, NULL);
  END;

  -- 7) ANON
  BEGIN
    PERFORM set_config('role','anon',true);
    PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
    SELECT * INTO r FROM public.start_technical_visit_secure(f.reg_dono, NULL,NULL,NULL,NULL,NULL,'H9E1-FIXTURE',
                                                             'H9E1-FIXTURE sem gps', NULL);
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('7-anon','00000',NULL, format('checkin=%s', r.checkin_id));
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO _h9e1_result VALUES ('7-anon', SQLSTATE, SQLERRM, NULL);
  END;

  PERFORM set_config('role','none',true);
  PERFORM set_config('request.jwt.claims', NULL, true);
  RESET ROLE;
END $$;

RESET ROLE;
SELECT caso, sqlstate, left(coalesce(msg, retorno), 160) AS detalhe FROM _h9e1_result ORDER BY caso;

-- Deltas
SELECT 'registros_em_andamento' AS metrica, count(*) FROM public.registros_consultor WHERE status='em_andamento'::status_registro_consultor
UNION ALL
SELECT 'checkins_fixture', count(*) FROM public.visitas_checkin WHERE observacoes = 'H9E1-FIXTURE'
UNION ALL
SELECT 'status_log_fixture', count(*) FROM public.registros_consultor_status_log l
  JOIN public.registros_consultor r ON r.id = l.registro_consultor_id WHERE r.observacoes_tecnicas = 'H9E1-FIXTURE';

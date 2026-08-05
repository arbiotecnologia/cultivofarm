-- =====================================================================
-- HARNESS RUNTIME T1–T14 — CORREÇÃO 1 (carteira + anon)
-- Sessões autenticadas reais: SET LOCAL ROLE authenticated + JWT claims.
-- Fixtures sintéticas criadas e descartadas por ROLLBACK.
-- psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f harness-runtime.sql
-- =====================================================================
BEGIN;

DO $g$
DECLARE v_m text; v_r text;
BEGIN
  EXECUTE 'SELECT marker, project_ref FROM public._fiscal_staging_marker' INTO v_m, v_r;
  IF COALESCE(v_m,'')<>'STAGING' OR COALESCE(v_r,'')<>'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'GUARD_ABORT';
  END IF;
END $g$;

CREATE TEMP TABLE t_result(t text, descricao text, esperado text, obtido text, status text) ON COMMIT DROP;

DO $h$
DECLARE
  u_admin uuid := gen_random_uuid();
  u_gestor uuid := gen_random_uuid();
  u_cons uuid := gen_random_uuid();
  u_agro uuid := gen_random_uuid();
  u_prodA uuid := gen_random_uuid();
  u_prodB uuid := gen_random_uuid();
  u_semv uuid := gen_random_uuid();
  u_partA uuid := gen_random_uuid();
  u_partB uuid := gen_random_uuid();
  c_A uuid := gen_random_uuid();
  c_B uuid := gen_random_uuid();
  r_ocoA uuid := gen_random_uuid();
  r_ocoB uuid := gen_random_uuid();
  r_visA uuid := gen_random_uuid();
  r_visB uuid := gen_random_uuid();
  r_visApr uuid := gen_random_uuid();
  pa uuid; pb uuid;
  n int; ok boolean;
  sfx text := 'C1_CARTEIRA_' || to_char(now(),'YYYYMMDDHH24MISS');

  PROCEDURE_dummy int;
BEGIN
  -- ---------------- fixtures ----------------
  INSERT INTO auth.users(id, instance_id, aud, role, email, encrypted_password,
                         email_confirmed_at, created_at, updated_at,
                         raw_app_meta_data, raw_user_meta_data)
  SELECT x.id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         sfx||'_'||x.tag||'@arbio-staging.test','x', now(), now(), now(),
         '{"provider":"email"}'::jsonb, '{}'::jsonb
  FROM (VALUES (u_admin,'admin'),(u_gestor,'gestor'),(u_cons,'cons'),(u_agro,'agro'),
               (u_prodA,'proda'),(u_prodB,'prodb'),(u_semv,'semv'),
               (u_partA,'parta'),(u_partB,'partb')) AS x(id, tag);

  INSERT INTO public.clientes(id, nome, codigo_cliente)
  VALUES (c_A, sfx||'_CLIENTE_A', sfx||'_A'), (c_B, sfx||'_CLIENTE_B', sfx||'_B');

  -- carteira: consultor e agrônomo vinculados APENAS ao cliente A
  INSERT INTO public.user_clientes(user_id, cliente_id, is_active, access_level)
  VALUES (u_cons, c_A, true, 'execute'),
         (u_agro, c_A, true, 'execute'),
         (u_prodA, c_A, true, 'read'),
         (u_prodB, c_B, true, 'read'),
         (u_gestor, c_A, true, 'manage');

  INSERT INTO public.user_roles(user_id, role) VALUES
    (u_admin,'administrador'),(u_gestor,'gestor'),
    (u_cons,'consultor_tecnico'),(u_agro,'tecnico_agronomo'),
    (u_prodA,'cliente_produtor'),(u_prodB,'cliente_produtor'),
    (u_partA,'parceiro_b2b'),(u_partB,'parceiro_b2b');


  -- registros: ocorrência e visita em cada cliente
  INSERT INTO public.registros_consultor(id, cliente_id, consultor_responsavel, created_by,
                                         natureza_registro, status, problema_principal)
  VALUES (r_ocoA, c_A, u_cons, u_cons, 'ocorrencia','rascunho', sfx||'_OCO_A'),
         (r_ocoB, c_B, u_semv, u_semv, 'ocorrencia','rascunho', sfx||'_OCO_B'),
         (r_visA, c_A, u_cons, u_cons, 'visita','rascunho', sfx||'_VIS_A'),
         (r_visB, c_B, u_semv, u_semv, 'visita','rascunho', sfx||'_VIS_B'),
         (r_visApr, c_A, u_cons, u_cons, 'visita','aprovado', sfx||'_VIS_APR');

  -- ---------------- helper de sessão ----------------
  -- T1 admin
  EXECUTE format($x$SELECT set_config('request.jwt.claims', %L, true)$x$,
                 json_build_object('sub',u_admin,'role','authenticated')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.registros_consultor
   WHERE problema_principal LIKE sfx||'%';
  RESET ROLE;
  INSERT INTO t_result VALUES ('T1','admin enxerga os 5 registros sinteticos','5',n::text,
    CASE WHEN n=5 THEN 'PASS' ELSE 'FAIL' END);

  -- T2 gestor
  EXECUTE format($x$SELECT set_config('request.jwt.claims', %L, true)$x$,
                 json_build_object('sub',u_gestor,'role','authenticated')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.registros_consultor WHERE problema_principal LIKE sfx||'%';
  RESET ROLE;
  INSERT INTO t_result VALUES ('T2','gestor autorizado preserva acesso','5',n::text,
    CASE WHEN n=5 THEN 'PASS' ELSE 'FAIL' END);

  -- T3/T4 consultor
  EXECUTE format($x$SELECT set_config('request.jwt.claims', %L, true)$x$,
                 json_build_object('sub',u_cons,'role','authenticated')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.registros_consultor
   WHERE id = r_ocoA;
  RESET ROLE;
  INSERT INTO t_result VALUES ('T3','consultor A le ocorrencia do cliente A (carteira)','1',n::text,
    CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE format($x$SELECT set_config('request.jwt.claims', %L, true)$x$,
                 json_build_object('sub',u_cons,'role','authenticated')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.registros_consultor WHERE id = r_ocoB;
  RESET ROLE;
  INSERT INTO t_result VALUES ('T4','consultor A NAO le ocorrencia do cliente B','0',n::text,
    CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);

  -- T5/T6 agrônomo
  EXECUTE format($x$SELECT set_config('request.jwt.claims', %L, true)$x$,
                 json_build_object('sub',u_agro,'role','authenticated')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.registros_consultor WHERE id = r_ocoA;
  RESET ROLE;
  INSERT INTO t_result VALUES ('T5','agronomo A le cliente A atribuido','1',n::text,
    CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE format($x$SELECT set_config('request.jwt.claims', %L, true)$x$,
                 json_build_object('sub',u_agro,'role','authenticated')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.registros_consultor WHERE id = r_ocoB;
  RESET ROLE;
  INSERT INTO t_result VALUES ('T6','agronomo A NAO le cliente B','0',n::text,
    CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);

  -- T7 técnico participante abre e edita visita atribuída
  EXECUTE format($x$SELECT set_config('request.jwt.claims', %L, true)$x$,
                 json_build_object('sub',u_cons,'role','authenticated')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.registros_consultor WHERE id = r_visA;
  UPDATE public.registros_consultor SET observacoes_tecnicas = 'edit-ok' WHERE id = r_visA;
  GET DIAGNOSTICS PROCEDURE_dummy = ROW_COUNT;
  RESET ROLE;
  INSERT INTO t_result VALUES ('T7','tecnico responsavel abre(1) e edita(1) visita atribuida','1/1',
    n::text||'/'||PROCEDURE_dummy::text,
    CASE WHEN n=1 AND PROCEDURE_dummy=1 THEN 'PASS' ELSE 'FAIL' END);

  -- T8 técnico não participante
  EXECUTE format($x$SELECT set_config('request.jwt.claims', %L, true)$x$,
                 json_build_object('sub',u_agro,'role','authenticated')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.registros_consultor WHERE id = r_visB;
  UPDATE public.registros_consultor SET observacoes_tecnicas = 'nope' WHERE id = r_visB;
  GET DIAGNOSTICS PROCEDURE_dummy = ROW_COUNT;
  RESET ROLE;
  INSERT INTO t_result VALUES ('T8','tecnico nao participante nao abre(0) nem edita(0) visita de outro cliente','0/0',
    n::text||'/'||PROCEDURE_dummy::text,
    CASE WHEN n=0 AND PROCEDURE_dummy=0 THEN 'PASS' ELSE 'FAIL' END);

  -- T9 produtor A lê próprio registro permitido (visita aprovada)
  EXECUTE format($x$SELECT set_config('request.jwt.claims', %L, true)$x$,
                 json_build_object('sub',u_prodA,'role','authenticated')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.registros_consultor WHERE id = r_visApr;
  RESET ROLE;
  INSERT INTO t_result VALUES ('T9','produtor A le proprio registro aprovado','1',n::text,
    CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);

  -- T10 produtor A não lê produtor B
  EXECUTE format($x$SELECT set_config('request.jwt.claims', %L, true)$x$,
                 json_build_object('sub',u_prodA,'role','authenticated')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.registros_consultor WHERE cliente_id = c_B;
  RESET ROLE;
  INSERT INTO t_result VALUES ('T10','produtor A NAO le registros do produtor B','0',n::text,
    CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);

  -- T11 parceiro A não lê parceiro B
  BEGIN
    EXECUTE format($x$SELECT set_config('request.jwt.claims', %L, true)$x$,
                   json_build_object('sub',u_partA,'role','authenticated')::text);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.registros_consultor WHERE problema_principal LIKE sfx||'%';
    RESET ROLE;
    INSERT INTO t_result VALUES ('T11','parceiro_b2b sem vinculo nao le registros de outro parceiro','0',n::text,
      CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO t_result VALUES ('T11','parceiro_b2b','0','erro: '||SQLERRM,'FAIL');
  END;

  -- T12 authenticated sem vínculo
  EXECUTE format($x$SELECT set_config('request.jwt.claims', %L, true)$x$,
                 json_build_object('sub',u_semv,'role','authenticated')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.registros_consultor WHERE cliente_id IN (c_A);
  RESET ROLE;
  INSERT INTO t_result VALUES ('T12','authenticated sem vinculo/role le zero do cliente A','0',n::text,
    CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);

  PERFORM set_config('request.jwt.claims', NULL, true);
END
$h$;

-- T13 anon: SELECT/INSERT/UPDATE/DELETE devem ser negados (42501)
DO $anon$
DECLARE v_out text := ''; n int; ok boolean := true;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.registros_consultor' INTO n;
    v_out := v_out||'SELECT=permitido('||n||') '; ok := false;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out||'SELECT=42501 ';
  END;
  BEGIN
    EXECUTE 'INSERT INTO public.registros_consultor(cliente_id) VALUES (gen_random_uuid())';
    v_out := v_out||'INSERT=permitido '; ok := false;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out||'INSERT=42501 ';
            WHEN OTHERS THEN v_out := v_out||'INSERT='||SQLSTATE||' '; ok := false;
  END;
  BEGIN
    EXECUTE 'UPDATE public.registros_consultor SET version = version WHERE false';
    v_out := v_out||'UPDATE=permitido '; ok := false;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out||'UPDATE=42501 ';
            WHEN OTHERS THEN v_out := v_out||'UPDATE='||SQLSTATE||' '; ok := false;
  END;
  BEGIN
    EXECUTE 'DELETE FROM public.registros_consultor WHERE false';
    v_out := v_out||'DELETE=permitido '; ok := false;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out||'DELETE=42501 ';
            WHEN OTHERS THEN v_out := v_out||'DELETE='||SQLSTATE||' '; ok := false;
  END;
  RESET ROLE;
  INSERT INTO t_result VALUES ('T13','anon negado em SELECT/INSERT/UPDATE/DELETE',
    'todos 42501', v_out, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END);
END
$anon$;

-- T15b overload (_user_id,_cliente_id) em sessao autenticada real
DO $ovl$
DECLARE
  u uuid := gen_random_uuid(); cA uuid := gen_random_uuid(); cB uuid := gen_random_uuid();
  sfx text := 'C1_CARTEIRA_OVL_'||to_char(clock_timestamp(),'HH24MISSMS');
  a boolean; b boolean;
BEGIN
  INSERT INTO auth.users(id, instance_id, aud, role, email, encrypted_password,
                         email_confirmed_at, created_at, updated_at,
                         raw_app_meta_data, raw_user_meta_data)
  VALUES (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          sfx||'@arbio-staging.test','x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);
  INSERT INTO public.clientes(id,nome,codigo_cliente) VALUES
    (cA, sfx||'_A', sfx||'_A'), (cB, sfx||'_B', sfx||'_B');
  INSERT INTO public.user_clientes(user_id,cliente_id,is_active,access_level)
    VALUES (u,cA,true,'execute');
  INSERT INTO public.user_roles(user_id,role) VALUES (u,'tecnico_agronomo');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',u,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT public.can_user_access_cliente(u, cA) INTO a;
  SELECT public.can_user_access_cliente(u, cB) INTO b;
  RESET ROLE;

  INSERT INTO t_result VALUES ('T15b','overload 2-arg: tecnico com carteira=true, fora da carteira=false',
    'true/false', COALESCE(a::text,'null')||'/'||COALESCE(b::text,'null'),
    CASE WHEN a IS TRUE AND b IS FALSE THEN 'PASS' ELSE 'FAIL' END);
END
$ovl$;

-- T14 ACLs e policies
DO $acl$
DECLARE v_anon int; v_pub int; v_auth text; v_polpub int;
BEGIN
  SELECT count(*) INTO v_anon FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='registros_consultor' AND grantee='anon';
  SELECT count(*) INTO v_pub FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='registros_consultor' AND grantee='PUBLIC';
  SELECT string_agg(privilege_type,',' ORDER BY privilege_type) INTO v_auth
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='registros_consultor' AND grantee='authenticated';
  SELECT count(*) INTO v_polpub FROM pg_policies
   WHERE schemaname='public' AND tablename='registros_consultor'
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  INSERT INTO t_result VALUES ('T14','PUBLIC/anon sem privilegios; authenticated minimo; nenhuma policy p/ anon',
    'anon=0 public=0 auth=DELETE,INSERT,SELECT,UPDATE polpub=0',
    'anon='||v_anon||' public='||v_pub||' auth='||COALESCE(v_auth,'-')||' polpub='||v_polpub,
    CASE WHEN v_anon=0 AND v_pub=0 AND COALESCE(v_auth,'')='DELETE,INSERT,SELECT,UPDATE' AND v_polpub=0
         THEN 'PASS' ELSE 'FAIL' END);
END
$acl$;

SELECT t, status, esperado, obtido, descricao FROM t_result ORDER BY
  (regexp_replace(t,'\D','','g'))::int, t;

SELECT 'RESUMO: '||count(*) FILTER (WHERE status='PASS')||' PASS / '
     ||count(*) FILTER (WHERE status='FAIL')||' FAIL' AS resumo FROM t_result;

ROLLBACK;

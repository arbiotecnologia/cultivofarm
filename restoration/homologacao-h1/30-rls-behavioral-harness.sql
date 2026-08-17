-- =====================================================================
-- FASE H1 — R-1: HARNESS COMPORTAMENTAL DE RLS (prova de isolamento)
-- Alvo autorizado: staging ikaauvsflpmamgxmkhoq
-- Execução: restoration/os-e2e/staging-psql.sh -f <este arquivo>
--
-- Características:
--  * UMA transação, sempre finalizada com ROLLBACK (nenhum dado permanece).
--  * Fixtures efêmeras identificadas pelo marcador H1-RLS-HARNESS.
--  * Cada asserção roda sob `SET LOCAL ROLE authenticated|anon` com
--    request.jwt.claims do usuário real de staging (auth.uid() efetivo).
--  * Falha => RAISE EXCEPTION com a lista de casos reprovados.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

-- Guarda de ambiente (fail-closed): recusa qualquer banco != staging.
DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: ambiente nao autorizado (%)', COALESCE(v_ref,'null');
  END IF;
END $guard$;

-- ---------------------------------------------------------------------
-- FIXTURES EFÊMERAS
-- ---------------------------------------------------------------------
-- Sujeito A : cliente_produtor 85998744-... (cliente real b05e3c22-...)
-- Sujeito B : parceiro_b2b     7d894a7d-... (cliente fixture 11111111-...)
-- Sujeito ADM: administrador   b5c2ebd4-...
-- ---------------------------------------------------------------------

INSERT INTO public.clientes (id, nome, codigo_cliente)
VALUES ('11111111-1111-4111-8111-111111111111','H1-RLS-HARNESS CLIENTE B','CLI-H1-HARNESS');

INSERT INTO public.user_clientes (user_id, cliente_id, principal)
VALUES ('7d894a7d-cdc8-40f1-9df1-1649d2f16422','11111111-1111-4111-8111-111111111111', true);

-- OS do cliente B, copiada da OS real do cliente A (preserva NOT NULL/enums)
CREATE TEMP TABLE tmp_os ON COMMIT DROP AS
  SELECT * FROM public.ordens_servico WHERE id = 'c6a00c9e-7a38-4c22-ab6c-ab47179e4c6f';
UPDATE tmp_os SET id          = '22222222-2222-4222-8222-222222222222',
                  cliente_id  = '11111111-1111-4111-8111-111111111111',
                  numero_os   = 'OS-H1-RLS-HARNESS-B';
INSERT INTO public.ordens_servico SELECT * FROM tmp_os;

-- Aplicações A e B
INSERT INTO public.aplicacoes (id, ordem_servico_id) VALUES
 ('33333333-3333-4333-8333-333333333333','c6a00c9e-7a38-4c22-ab6c-ab47179e4c6f'),
 ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222');

INSERT INTO public.aplicacao_emails (aplicacao_id, email, status) VALUES
 ('33333333-3333-4333-8333-333333333333','h1-harness-a@example.invalid','sent'),
 ('44444444-4444-4444-8444-444444444444','h1-harness-b@example.invalid','sent');

INSERT INTO public.aplicacao_evidencias (id, aplicacao_id, tipo, storage_path) VALUES
 ('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','foto','h1-harness/a.jpg'),
 ('66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444','foto','h1-harness/b.jpg');

INSERT INTO public.aplicacao_evidencias_vinculos (aplicacao_id, evidencia_id) VALUES
 ('33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555'),
 ('44444444-4444-4444-8444-444444444444','66666666-6666-4666-8666-666666666666');

-- Registro de consultor do cliente B, copiado do registro real do cliente A
CREATE TEMP TABLE tmp_rc ON COMMIT DROP AS
  SELECT * FROM public.registros_consultor WHERE id = '15dd9214-ca13-4e1e-9ba3-39d22185a66d';
UPDATE tmp_rc SET id                    = '77777777-7777-4777-8777-777777777777',
                  cliente_id            = '11111111-1111-4111-8111-111111111111',
                  client_uuid           = gen_random_uuid(),
                  codigo_visita         = NULL,
                  consultor_responsavel = NULL,
                  created_by            = NULL,
                  finalized_by          = NULL,
                  fazenda_id            = NULL,
                  talhao_id             = NULL,
                  solicitacao_id        = NULL;
INSERT INTO public.registros_consultor SELECT * FROM tmp_rc;

INSERT INTO public.registros_consultor_status_log (registro_consultor_id, status_novo) VALUES
 ('15dd9214-ca13-4e1e-9ba3-39d22185a66d','rascunho'),
 ('77777777-7777-4777-8777-777777777777','rascunho');

INSERT INTO public.portal_solicitacoes (id, cliente_id, user_id, tipo_demanda) VALUES
 ('88888888-8888-4888-8888-888888888888','b05e3c22-5e4a-4443-8f3c-70505045aa5b','85998744-78fd-41ae-b74e-2b763e7f8089','tecnica'),
 ('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111','7d894a7d-cdc8-40f1-9df1-1649d2f16422','tecnica');

INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, usuario_id) VALUES
 ('88888888-8888-4888-8888-888888888888','criada','85998744-78fd-41ae-b74e-2b763e7f8089'),
 ('99999999-9999-4999-8999-999999999999','criada','7d894a7d-cdc8-40f1-9df1-1649d2f16422');

INSERT INTO public.arquivos (entidade_tipo, entidade_id, arquivo_url) VALUES
 ('registro_consultor','15dd9214-ca13-4e1e-9ba3-39d22185a66d','h1-harness://a'),
 ('registro_consultor','77777777-7777-4777-8777-777777777777','h1-harness://b'),
 ('entidade_desconhecida','15dd9214-ca13-4e1e-9ba3-39d22185a66d','h1-harness://x');

-- Organização sem vínculo com nenhum dos sujeitos
INSERT INTO public.organizations (id, nome)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','H1-RLS-HARNESS ORG SEM VINCULO');

-- ---------------------------------------------------------------------
-- MOTOR DE ASSERÇÕES
-- ---------------------------------------------------------------------
CREATE TEMP TABLE h1_result (
  caso   text,
  esperado text,
  obtido text,
  status text
) ON COMMIT DROP;

DO $harness$
DECLARE
  u_a   uuid := '85998744-78fd-41ae-b74e-2b763e7f8089'; -- cliente_produtor (cliente A)
  u_b   uuid := '7d894a7d-cdc8-40f1-9df1-1649d2f16422'; -- parceiro_b2b (cliente fixture B)
  u_adm uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a'; -- administrador
  ap_a  uuid := '33333333-3333-4333-8333-333333333333';
  ap_b  uuid := '44444444-4444-4444-8444-444444444444';
  ev_a  uuid := '55555555-5555-4555-8555-555555555555';
  ev_b  uuid := '66666666-6666-4666-8666-666666666666';
  rc_a  uuid := '15dd9214-ca13-4e1e-9ba3-39d22185a66d';
  rc_b  uuid := '77777777-7777-4777-8777-777777777777';
  so_a  uuid := '88888888-8888-4888-8888-888888888888';
  so_b  uuid := '99999999-9999-4999-8999-999999999999';
  n     int;

  PROCEDURE_DUMMY int; -- placeholder (plpgsql não aceita procedures locais)
BEGIN
  -- helper interno: registra resultado
  CREATE TEMP TABLE IF NOT EXISTS h1_noop(i int);

  -- ===== aplicacao_emails =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_a,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.aplicacao_emails WHERE aplicacao_id = ap_a;
  INSERT INTO h1_result VALUES ('AE-1 A lê e-mail da própria aplicação','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
  SELECT count(*) INTO n FROM public.aplicacao_emails WHERE aplicacao_id = ap_b;
  INSERT INTO h1_result VALUES ('AE-2 A NÃO lê e-mail da aplicação de B','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_b,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.aplicacao_emails WHERE aplicacao_id = ap_b;
  INSERT INTO h1_result VALUES ('AE-3 B lê e-mail da própria aplicação','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
  SELECT count(*) INTO n FROM public.aplicacao_emails WHERE aplicacao_id = ap_a;
  INSERT INTO h1_result VALUES ('AE-4 B NÃO lê e-mail da aplicação de A','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_adm,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.aplicacao_emails WHERE aplicacao_id IN (ap_a, ap_b);
  INSERT INTO h1_result VALUES ('AE-5 admin (staff) lê ambos','2',n::text, CASE WHEN n=2 THEN 'PASS' ELSE 'FAIL' END);
  RESET ROLE;

  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.aplicacao_emails;
    INSERT INTO h1_result VALUES ('AE-6 anon não lê aplicacao_emails','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO h1_result VALUES ('AE-6 anon não lê aplicacao_emails','0','permission denied','PASS');
  END;
  RESET ROLE;

  -- ===== aplicacao_evidencias_vinculos =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_a,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.aplicacao_evidencias_vinculos WHERE aplicacao_id = ap_a;
  INSERT INTO h1_result VALUES ('AEV-1 A lê vínculo próprio','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
  SELECT count(*) INTO n FROM public.aplicacao_evidencias_vinculos WHERE aplicacao_id = ap_b;
  INSERT INTO h1_result VALUES ('AEV-2 A NÃO lê vínculo de B','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  RESET ROLE;

  -- cross INSERT (B tentando vincular na aplicação de A)
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_b,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.aplicacao_evidencias_vinculos (aplicacao_id, evidencia_id) VALUES (ap_a, ev_a);
    INSERT INTO h1_result VALUES ('AEV-3 B NÃO insere vínculo na aplicação de A','denied','inserido','FAIL');
    RAISE EXCEPTION 'H1_ROLLBACK_AEV3';
  EXCEPTION
    WHEN insufficient_privilege OR unique_violation THEN
      INSERT INTO h1_result VALUES ('AEV-3 B NÃO insere vínculo na aplicação de A','denied',SQLSTATE,
        CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END);
    WHEN OTHERS THEN
      IF SQLERRM = 'H1_ROLLBACK_AEV3' THEN NULL;
      ELSE INSERT INTO h1_result VALUES ('AEV-3 B NÃO insere vínculo na aplicação de A','denied',SQLSTATE,'FAIL');
      END IF;
  END;
  -- cross DELETE (B tentando apagar vínculo de A)
  BEGIN
    DELETE FROM public.aplicacao_evidencias_vinculos WHERE aplicacao_id = ap_a;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO h1_result VALUES ('AEV-4 B NÃO apaga vínculo de A','0 linhas',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('AEV-4 B NÃO apaga vínculo de A','0 linhas',SQLSTATE, CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END);
  END;
  -- próprio DELETE por B (parceiro não tem papel de gestão => negado por desenho)
  BEGIN
    DELETE FROM public.aplicacao_evidencias_vinculos WHERE aplicacao_id = ap_b;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO h1_result VALUES ('AEV-5 B (sem papel de gestão) não apaga nem o próprio vínculo','0 linhas',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('AEV-5 B (sem papel de gestão) não apaga nem o próprio vínculo','0 linhas',SQLSTATE,'PASS');
  END;
  RESET ROLE;

  -- admin insere vínculo legítimo (papel de gestão + evidência compatível)
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_adm,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.aplicacao_evidencias_vinculos (aplicacao_id, evidencia_id) VALUES (ap_a, ev_b);
    INSERT INTO h1_result VALUES ('AEV-6 admin insere vínculo legítimo','permitido','inserido','PASS');
    DELETE FROM public.aplicacao_evidencias_vinculos WHERE aplicacao_id = ap_a AND evidencia_id = ev_b;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('AEV-6 admin insere vínculo legítimo','permitido',SQLSTATE,'FAIL');
  END;
  RESET ROLE;

  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.aplicacao_evidencias_vinculos;
    INSERT INTO h1_result VALUES ('AEV-7 anon não lê vínculos','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO h1_result VALUES ('AEV-7 anon não lê vínculos','0','permission denied','PASS');
  END;
  BEGIN
    INSERT INTO public.aplicacao_evidencias_vinculos (aplicacao_id, evidencia_id) VALUES (ap_a, ev_b);
    INSERT INTO h1_result VALUES ('AEV-8 anon não insere vínculo','denied','inserido','FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('AEV-8 anon não insere vínculo','denied',SQLSTATE, CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END);
  END;
  RESET ROLE;

  -- ===== arquivos =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_a,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.arquivos WHERE arquivo_url = 'h1-harness://a';
  INSERT INTO h1_result VALUES ('ARQ-1 A lê arquivo da entidade pai própria','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
  SELECT count(*) INTO n FROM public.arquivos WHERE arquivo_url = 'h1-harness://b';
  INSERT INTO h1_result VALUES ('ARQ-2 A NÃO lê arquivo de entidade de outro cliente','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  SELECT count(*) INTO n FROM public.arquivos WHERE arquivo_url = 'h1-harness://x';
  INSERT INTO h1_result VALUES ('ARQ-3 entidade_tipo desconhecido negado (default deny)','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  BEGIN
    INSERT INTO public.arquivos (entidade_tipo, entidade_id, arquivo_url) VALUES ('registro_consultor', rc_a, 'h1-harness://a-insert');
    INSERT INTO h1_result VALUES ('ARQ-4 A insere arquivo na entidade própria','permitido','inserido','PASS');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('ARQ-4 A insere arquivo na entidade própria','permitido',SQLSTATE,'FAIL');
  END;
  BEGIN
    INSERT INTO public.arquivos (entidade_tipo, entidade_id, arquivo_url) VALUES ('registro_consultor', rc_b, 'h1-harness://cross-insert');
    INSERT INTO h1_result VALUES ('ARQ-5 A NÃO insere arquivo em entidade de B','denied','inserido','FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('ARQ-5 A NÃO insere arquivo em entidade de B','denied',SQLSTATE, CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END);
  END;
  BEGIN
    INSERT INTO public.arquivos (entidade_tipo, entidade_id, arquivo_url) VALUES ('entidade_desconhecida', rc_a, 'h1-harness://tipo-invalido');
    INSERT INTO h1_result VALUES ('ARQ-6 A NÃO insere com entidade_tipo desconhecido','denied','inserido','FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('ARQ-6 A NÃO insere com entidade_tipo desconhecido','denied',SQLSTATE, CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END);
  END;
  RESET ROLE;

  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.arquivos;
    INSERT INTO h1_result VALUES ('ARQ-7 anon não lê arquivos','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO h1_result VALUES ('ARQ-7 anon não lê arquivos','0','permission denied','PASS');
  END;
  RESET ROLE;

  -- ===== registros_consultor_status_log =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_a,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.registros_consultor_status_log WHERE registro_consultor_id = rc_a;
  INSERT INTO h1_result VALUES ('RCSL-1 A lê log do registro próprio','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
  SELECT count(*) INTO n FROM public.registros_consultor_status_log WHERE registro_consultor_id = rc_b;
  INSERT INTO h1_result VALUES ('RCSL-2 A NÃO lê log do registro de B','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  BEGIN
    INSERT INTO public.registros_consultor_status_log (registro_consultor_id, status_novo, changed_by) VALUES (rc_a,'rascunho',u_a);
    INSERT INTO h1_result VALUES ('RCSL-3 A insere log próprio com changed_by=self','permitido','inserido','PASS');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('RCSL-3 A insere log próprio com changed_by=self','permitido',SQLSTATE,'FAIL');
  END;
  BEGIN
    INSERT INTO public.registros_consultor_status_log (registro_consultor_id, status_novo, changed_by) VALUES (rc_a,'rascunho',u_b);
    INSERT INTO h1_result VALUES ('RCSL-4 A NÃO forja changed_by de outro usuário','denied','inserido','FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('RCSL-4 A NÃO forja changed_by de outro usuário','denied',SQLSTATE, CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END);
  END;
  BEGIN
    INSERT INTO public.registros_consultor_status_log (registro_consultor_id, status_novo, changed_by) VALUES (rc_b,'rascunho',u_a);
    INSERT INTO h1_result VALUES ('RCSL-5 A NÃO insere log no registro de B','denied','inserido','FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('RCSL-5 A NÃO insere log no registro de B','denied',SQLSTATE, CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END);
  END;
  RESET ROLE;

  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.registros_consultor_status_log;
    INSERT INTO h1_result VALUES ('RCSL-6 anon não lê trilha','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO h1_result VALUES ('RCSL-6 anon não lê trilha','0','permission denied','PASS');
  END;
  RESET ROLE;

  -- ===== solicitacoes_timeline =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_a,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.solicitacoes_timeline WHERE solicitacao_id = so_a;
  INSERT INTO h1_result VALUES ('ST-1 A lê timeline da própria solicitação','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
  SELECT count(*) INTO n FROM public.solicitacoes_timeline WHERE solicitacao_id = so_b;
  INSERT INTO h1_result VALUES ('ST-2 A NÃO lê timeline da solicitação de B','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  BEGIN
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, usuario_id) VALUES (so_a,'comentario',u_a);
    INSERT INTO h1_result VALUES ('ST-3 A insere evento próprio com usuario_id=self','permitido','inserido','PASS');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('ST-3 A insere evento próprio com usuario_id=self','permitido',SQLSTATE,'FAIL');
  END;
  BEGIN
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, usuario_id) VALUES (so_a,'comentario',u_b);
    INSERT INTO h1_result VALUES ('ST-4 A NÃO forja usuario_id de outro usuário','denied','inserido','FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('ST-4 A NÃO forja usuario_id de outro usuário','denied',SQLSTATE, CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END);
  END;
  BEGIN
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, usuario_id) VALUES (so_b,'comentario',u_a);
    INSERT INTO h1_result VALUES ('ST-5 A NÃO insere evento na solicitação de B','denied','inserido','FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('ST-5 A NÃO insere evento na solicitação de B','denied',SQLSTATE, CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END);
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_b,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.solicitacoes_timeline WHERE solicitacao_id = so_b;
  INSERT INTO h1_result VALUES ('ST-6 B lê timeline da própria solicitação','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
  SELECT count(*) INTO n FROM public.solicitacoes_timeline WHERE solicitacao_id = so_a;
  INSERT INTO h1_result VALUES ('ST-7 B NÃO lê timeline da solicitação de A','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  RESET ROLE;

  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.solicitacoes_timeline;
    INSERT INTO h1_result VALUES ('ST-8 anon não lê timeline','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO h1_result VALUES ('ST-8 anon não lê timeline','0','permission denied','PASS');
  END;
  RESET ROLE;

  -- ===== organizations =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_a,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.organizations;
  INSERT INTO h1_result VALUES ('ORG-1 produtor sem vínculo não vê organização','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_b,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.organizations;
  INSERT INTO h1_result VALUES ('ORG-2 parceiro vê apenas a organização do seu partner_account','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
  SELECT count(*) INTO n FROM public.organizations WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  INSERT INTO h1_result VALUES ('ORG-3 parceiro NÃO vê organização sem vínculo','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_adm,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.organizations;
  INSERT INTO h1_result VALUES ('ORG-4 admin vê todas as organizações','>=2',n::text, CASE WHEN n>=2 THEN 'PASS' ELSE 'FAIL' END);
  RESET ROLE;

  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.organizations;
    INSERT INTO h1_result VALUES ('ORG-5 anon não lê organizations','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO h1_result VALUES ('ORG-5 anon não lê organizations','0','permission denied','PASS');
  END;
  RESET ROLE;

  -- ===== EXECUTE anon nas funções revogadas / RPCs públicas mantidas =====
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.rpc_portal_partner_financial('00000000-0000-4000-8000-000000000000'::uuid);
    INSERT INTO h1_result VALUES ('FN-1 anon não executa rpc_portal_partner_financial','denied','executou','FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('FN-1 anon não executa rpc_portal_partner_financial','denied',SQLSTATE, CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END);
  END;
  BEGIN
    PERFORM public.rpc_notificar_gestor('h1-harness','teste');
    INSERT INTO h1_result VALUES ('FN-2 anon não executa rpc_notificar_gestor','denied','executou','FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('FN-2 anon não executa rpc_notificar_gestor','denied',SQLSTATE, CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END);
  END;
  -- RPCs públicas token-scoped: token inválido não pode revelar existência
  BEGIN
    SELECT count(*) INTO n FROM (SELECT public.rpc_validar_comprovante_entrega('00000000-0000-4000-8000-000000000000'::uuid) AS r) t
     WHERE (t.r->>'valido')::boolean IS DISTINCT FROM true;
    INSERT INTO h1_result VALUES ('FN-3 rpc_validar_comprovante_entrega com token inválido retorna inválido','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('FN-3 rpc_validar_comprovante_entrega com token inválido retorna inválido','1',SQLSTATE,'FAIL');
  END;
  BEGIN
    SELECT count(*) INTO n FROM (SELECT public.rpc_validar_rastreio_produto('00000000-0000-4000-8000-000000000000'::uuid) AS r) t
     WHERE (t.r->>'valido')::boolean IS DISTINCT FROM true;
    INSERT INTO h1_result VALUES ('FN-4 rpc_validar_rastreio_produto com token inválido retorna inválido','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO h1_result VALUES ('FN-4 rpc_validar_rastreio_produto com token inválido retorna inválido','1',SQLSTATE,'FAIL');
  END;
  RESET ROLE;

  -- ===== papel legítimo preservado: staff lê artefatos =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_adm,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.arquivos WHERE arquivo_url LIKE 'h1-harness://%';
  INSERT INTO h1_result VALUES ('STAFF-1 admin lê todos os arquivos do fixture','>=3',n::text, CASE WHEN n>=3 THEN 'PASS' ELSE 'FAIL' END);
  SELECT count(*) INTO n FROM public.registros_consultor_status_log WHERE registro_consultor_id IN (rc_a, rc_b);
  INSERT INTO h1_result VALUES ('STAFF-2 admin lê trilha de ambos os registros','>=2',n::text, CASE WHEN n>=2 THEN 'PASS' ELSE 'FAIL' END);
  SELECT count(*) INTO n FROM public.solicitacoes_timeline WHERE solicitacao_id IN (so_a, so_b);
  INSERT INTO h1_result VALUES ('STAFF-3 admin lê timeline de ambas as solicitações','>=2',n::text, CASE WHEN n>=2 THEN 'PASS' ELSE 'FAIL' END);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', NULL, true);
END $harness$;

\echo '=================== RESULTADO H1 R-1 ==================='
SELECT status, caso, esperado, obtido FROM h1_result ORDER BY caso;
SELECT status, count(*) FROM h1_result GROUP BY status ORDER BY 1;

DO $gate$
DECLARE v_fail int;
BEGIN
  SELECT count(*) INTO v_fail FROM h1_result WHERE status <> 'PASS';
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'H1_RLS_HARNESS_FAIL: % caso(s) reprovado(s)', v_fail;
  END IF;
  RAISE NOTICE 'H1_RLS_HARNESS_PASS: todos os casos passaram.';
END $gate$;

-- Nenhum dado de teste permanece.
ROLLBACK;

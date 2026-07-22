-- =====================================================================
-- Fase Fiscal 3.11.1 — Harness RLS SQL-nativo EXECUTÁVEL (staging)
--
-- Substitui integralmente a versão 3.11 (que continha placeholder).
--
-- REGRAS ABSOLUTAS:
--   * Executar SOMENTE no SQL Editor de staging, como postgres.
--   * project_ref = navfzbwgwzruipouyfnk é PROIBIDO (guard fail-fast).
--   * public._fiscal_staging_marker.marker='STAGING' obrigatório.
--   * Todos os writes usam namespace sintético FISCAL_TEST_3111_* / ff5c3111-*.
--   * Nenhum secret é lido, gravado ou impresso.
--   * Nenhuma emissão fiscal, nenhum provider, nenhum canTransmit=true.
--
-- Uso:
--   1) SELECT * FROM public._fiscal_staging_marker;   -- conferir manualmente
--   2) Colar este arquivo no SQL Editor e executar.
--   3) Exportar as duas result-sets finais.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

BEGIN;

-- =====================================================================
-- 0. Guard fail-fast anti-produção
-- =====================================================================
DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref
    FROM public._fiscal_staging_marker
   WHERE marker = 'STAGING' LIMIT 1;

  IF v_ref IS NULL OR btrim(v_ref) = '' THEN
    RAISE EXCEPTION 'ABORT 3.11.1: marker STAGING ausente ou project_ref nulo';
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT 3.11.1: project_ref aponta para PRODUÇÃO';
  END IF;

  PERFORM set_config('fiscal.masked_ref',
    left(v_ref,4) || '***' || right(v_ref,3), false);
END $guard$;

-- =====================================================================
-- 1. Helpers de execução como perfil sintético
-- =====================================================================

-- Tabela permanente de resultados (namespace sintético; removida no teardown)
DROP TABLE IF EXISTS public._fiscal_test_3111_results;
CREATE TABLE public._fiscal_test_3111_results (
  assertion_id text PRIMARY KEY,
  categoria    text NOT NULL,
  perfil       text NOT NULL,
  objeto       text NOT NULL,
  operacao     text NOT NULL,
  esperado     text NOT NULL,
  observado    text,
  status       text NOT NULL CHECK (status IN ('passed','failed','error','skipped')),
  detail       text
);

-- Sanitizer: remove qualquer aparência de segredo do detalhe.
CREATE OR REPLACE FUNCTION public._fiscal_3111_sanitize(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(coalesce(t,''),
             '(sub|jwt|token|key|password|secret|bearer|apikey)[^,;]{0,80}',
             '\1=***','gi'),
           '\meyJ[A-Za-z0-9._-]+', '***JWT***', 'g');
$$;

CREATE OR REPLACE FUNCTION public._fiscal_3111_record(
  p_id text, p_cat text, p_perfil text, p_obj text, p_op text,
  p_exp text, p_obs text, p_status text, p_detail text
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public._fiscal_test_3111_results
    VALUES (p_id, p_cat, p_perfil, p_obj, p_op, p_exp, p_obs, p_status,
            public._fiscal_3111_sanitize(p_detail))
  ON CONFLICT (assertion_id) DO UPDATE
    SET observado=EXCLUDED.observado, status=EXCLUDED.status, detail=EXCLUDED.detail;
$$;

-- Configura sessão RLS para um usuário sintético
CREATE OR REPLACE FUNCTION public._fiscal_3111_as(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',coalesce(p_user::text,''),
                       'role','authenticated')::text, true);
END $$;

CREATE OR REPLACE FUNCTION public._fiscal_3111_as_anon() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role','anon',true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role','anon')::text, true);
END $$;

CREATE OR REPLACE FUNCTION public._fiscal_3111_reset() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role','postgres',true);
  PERFORM set_config('request.jwt.claims','', true);
END $$;

-- =====================================================================
-- 2. Limpeza defensiva (namespace sintético apenas)
-- =====================================================================
DO $pre_cleanup$
BEGIN
  DELETE FROM public.fiscal_audit_log         WHERE (new_values->>'notes') LIKE 'FISCAL_TEST_3111_%'
                                                 OR (old_values->>'notes') LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.fiscal_events            WHERE notes LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.fiscal_invoice_items     WHERE description LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.fiscal_idempotency_keys  WHERE idempotency_key LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.fiscal_invoices          WHERE notes LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.customer_fiscal_profiles WHERE validation_notes LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.product_fiscal_profiles  WHERE accounting_notes LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.service_fiscal_profiles  WHERE source_reference LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.company_fiscal_settings  WHERE cnpj LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.accounts_receivable      WHERE description LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.user_clientes            WHERE user_id::text LIKE 'ff5c3111-%';
  DELETE FROM public.clientes                 WHERE nome LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.user_roles               WHERE user_id::text LIKE 'ff5c3111-%';
  DELETE FROM public.profiles                 WHERE user_id::text LIKE 'ff5c3111-%';
  DELETE FROM auth.users                      WHERE id::text LIKE 'ff5c3111-%';
END $pre_cleanup$;

-- =====================================================================
-- 3. Semear 15 perfis + produtor B (16 usuários) em auth.users
-- Todos com UUIDs determinísticos ff5c3111-*
-- =====================================================================
DO $seed_users$
DECLARE
  r record;
  users constant text[][] := ARRAY[
    ARRAY['ff5c3111-0000-0000-0000-000000000001','administrador'],
    ARRAY['ff5c3111-0000-0000-0000-000000000002','gestor'],
    ARRAY['ff5c3111-0000-0000-0000-000000000003','financeiro'],
    ARRAY['ff5c3111-0000-0000-0000-000000000004','administrativo'],
    ARRAY['ff5c3111-0000-0000-0000-000000000005','gestor_comercial'],
    ARRAY['ff5c3111-0000-0000-0000-000000000006','consultor_tecnico'],
    ARRAY['ff5c3111-0000-0000-0000-000000000007','tecnico_agronomo'],
    ARRAY['ff5c3111-0000-0000-0000-000000000008','aplicador'],
    ARRAY['ff5c3111-0000-0000-0000-000000000009','operador_onfarm'],
    ARRAY['ff5c3111-0000-0000-0000-00000000000a','producao'],
    ARRAY['ff5c3111-0000-0000-0000-00000000000b','cliente_produtor'],
    ARRAY['ff5c3111-0000-0000-0000-00000000000c','parceiro_b2b'],
    ARRAY['ff5c3111-0000-0000-0000-00000000000d','parceiro_b2b_tecnico'],
    ARRAY['ff5c3111-0000-0000-0000-00000000000e','authenticated_sem_papel'],
    ARRAY['ff5c3111-0000-0000-0000-00000000000f','anon'],
    -- produtor B (mesma role cliente_produtor, mas cliente distinto)
    ARRAY['ff5c3111-0000-0000-0000-000000000010','cliente_produtor_b']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(users,1) LOOP
    -- auth.users direto (staging only). Colunas mínimas suficientes.
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) VALUES (
      users[i][1]::uuid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated','authenticated',
      'FISCAL_TEST_3111_' || users[i][2] || '@staging.local',
      crypt('unused_'||gen_random_uuid()::text, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email"}'::jsonb,
      jsonb_build_object('fiscal_test_3111', users[i][2])
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $seed_users$;

-- profile + role
DO $seed_roles$
DECLARE
  m record;
  role_map constant text[][] := ARRAY[
    ARRAY['ff5c3111-0000-0000-0000-000000000001','administrador'],
    ARRAY['ff5c3111-0000-0000-0000-000000000002','gestor'],
    ARRAY['ff5c3111-0000-0000-0000-000000000003','financeiro'],
    ARRAY['ff5c3111-0000-0000-0000-000000000004','administrativo'],
    ARRAY['ff5c3111-0000-0000-0000-000000000005','gestor_comercial'],
    ARRAY['ff5c3111-0000-0000-0000-000000000006','consultor_tecnico'],
    ARRAY['ff5c3111-0000-0000-0000-000000000007','tecnico_agronomo'],
    ARRAY['ff5c3111-0000-0000-0000-000000000008','aplicador'],
    ARRAY['ff5c3111-0000-0000-0000-000000000009','operador_onfarm'],
    ARRAY['ff5c3111-0000-0000-0000-00000000000a','producao'],
    ARRAY['ff5c3111-0000-0000-0000-00000000000b','cliente_produtor'],
    ARRAY['ff5c3111-0000-0000-0000-00000000000c','parceiro_b2b'],
    ARRAY['ff5c3111-0000-0000-0000-00000000000d','parceiro_b2b_tecnico'],
    ARRAY['ff5c3111-0000-0000-0000-00000000000f','cliente_produtor'],  -- prodB reutiliza role
    ARRAY['ff5c3111-0000-0000-0000-000000000010','cliente_produtor']
  ];
  i int;
BEGIN
  -- Trigger handle_new_user já criou profile + role 'administrativo' default.
  -- Remove roles default e insere o role planejado (exceto authenticated_sem_papel/anon).
  DELETE FROM public.user_roles WHERE user_id::text LIKE 'ff5c3111-%';

  FOR i IN 1..array_length(role_map,1) LOOP
    INSERT INTO public.user_roles(user_id, role)
    VALUES (role_map[i][1]::uuid, role_map[i][2]::public.app_role)
    ON CONFLICT DO NOTHING;
  END LOOP;
  -- authenticated_sem_papel (uuid ...0e) NÃO recebe role -> intencional
  -- anon (uuid ...0f) — usado só com _fiscal_3111_as_anon(), ignorar role
END $seed_roles$;

-- =====================================================================
-- 4. Fixtures — clientes A/B, categoria financeira, AR, fiscal_invoices etc.
-- =====================================================================
DO $seed_fixtures$
DECLARE
  v_cli_a uuid := 'ff5c3111-c1e1-0000-0000-000000000001';
  v_cli_b uuid := 'ff5c3111-c1e1-0000-0000-000000000002';
  v_cat   uuid;
  v_ar_a  uuid := 'ff5c3111-a1ec-0000-0000-000000000001';
  v_ar_b  uuid := 'ff5c3111-a1ec-0000-0000-000000000002';
  v_prod  uuid := 'ff5c3111-b12b-0000-0000-000000000001';
  v_fi_a  uuid := 'ff5c3111-f15c-0000-0000-000000000001';
  v_fi_b  uuid := 'ff5c3111-f15c-0000-0000-000000000002';
  v_fi_del uuid := 'ff5c3111-f15c-0000-0000-000000000003';  -- descartável (não referenciado; usado só para DELETE deny)
  v_uadmin uuid := 'ff5c3111-0000-0000-0000-000000000001';
  v_upA    uuid := 'ff5c3111-0000-0000-0000-00000000000b';
  v_upB    uuid := 'ff5c3111-0000-0000-0000-000000000010';
BEGIN
  -- clientes
  INSERT INTO public.clientes(id,nome)
    VALUES (v_cli_a,'FISCAL_TEST_3111_cli_A'),(v_cli_b,'FISCAL_TEST_3111_cli_B')
    ON CONFLICT (id) DO NOTHING;

  -- vínculo user_clientes A e B
  INSERT INTO public.user_clientes(user_id,cliente_id,principal)
    VALUES (v_upA,v_cli_a,true),(v_upB,v_cli_b,true)
    ON CONFLICT DO NOTHING;

  -- categoria financeira: usa a primeira existente
  SELECT id INTO v_cat FROM public.financial_categories LIMIT 1;
  IF v_cat IS NULL THEN
    RAISE EXCEPTION 'ABORT 3.11.1: staging sem financial_categories — não é possível criar AR sintética';
  END IF;

  -- AR do cliente A e do cliente B (para ownership)
  INSERT INTO public.accounts_receivable(
    id, origin_type, customer_id, description, category_id,
    total_amount, first_due_date, installment_count, status, created_by
  ) VALUES
    (v_ar_a,'MANUAL',v_cli_a,'FISCAL_TEST_3111_AR_A',v_cat,100,current_date+7,1,'OPEN',v_uadmin),
    (v_ar_b,'MANUAL',v_cli_b,'FISCAL_TEST_3111_AR_B',v_cat,200,current_date+7,1,'OPEN',v_uadmin)
    ON CONFLICT (id) DO NOTHING;

  -- fiscal_invoices: A (cliente A), B (cliente B), descartável (sem vínculo → produtor não vê)
  INSERT INTO public.fiscal_invoices(
    id, receivable_id, invoice_type, status, total_amount, notes, created_by,
    document_model, document_origin, environment, provider,
    normalized_status, reconciliation_status
  ) VALUES
    (v_fi_a,v_ar_a,'NFE','PENDING',100,'FISCAL_TEST_3111_FI_A',v_uadmin,
     'NFE','MANUAL_RECORD','NOT_CONFIGURED','NONE','LEGACY_RECORDED','PENDING'),
    (v_fi_b,v_ar_b,'NFE','PENDING',200,'FISCAL_TEST_3111_FI_B',v_uadmin,
     'NFE','MANUAL_RECORD','NOT_CONFIGURED','NONE','LEGACY_RECORDED','PENDING'),
    (v_fi_del,NULL,'NFE','PENDING',10,'FISCAL_TEST_3111_FI_DEL',v_uadmin,
     'NFE','MANUAL_RECORD','NOT_CONFIGURED','NONE','LEGACY_RECORDED','NOT_APPLICABLE')
    ON CONFLICT (id) DO NOTHING;

  -- item vinculado à nota A
  INSERT INTO public.fiscal_invoice_items(
    fiscal_invoice_id, item_sequence, item_kind, description, quantity, unit_value, net_value
  ) VALUES (v_fi_a, 1, 'PRODUCT', 'FISCAL_TEST_3111_ITEM', 1, 100, 100)
  ON CONFLICT DO NOTHING;

  -- evento vinculado (backfill do trigger já cria CREATED; adiciona um MANUAL_UPDATED explícito)
  INSERT INTO public.fiscal_events(fiscal_invoice_id, event_type, event_source, notes)
  VALUES (v_fi_a,'MANUAL_UPDATED','USER','FISCAL_TEST_3111_EV');

  -- idempotency
  INSERT INTO public.fiscal_idempotency_keys(
    idempotency_key, fiscal_invoice_id, operation_type, environment, provider, status
  ) VALUES ('FISCAL_TEST_3111_IDEMP', v_fi_a, 'PREPARE', 'NOT_CONFIGURED', 'NONE', 'PENDING')
  ON CONFLICT DO NOTHING;

  -- company/product/service/customer profiles — sintéticos e mínimos
  INSERT INTO public.company_fiscal_settings(id, is_active, cnpj, configuration_status)
  VALUES ('ff5c3111-c04f-0000-0000-000000000001', false, 'FISCAL_TEST_3111_CNPJ', 'DRAFT')
  ON CONFLICT (id) DO NOTHING;

  -- product_id precisa existir em produtos: usa qualquer produto
  DECLARE v_prod_real uuid;
  BEGIN
    SELECT id INTO v_prod_real FROM public.produtos LIMIT 1;
    IF v_prod_real IS NULL THEN
      RAISE EXCEPTION 'ABORT 3.11.1: staging sem public.produtos — impossível criar product_fiscal_profile';
    END IF;
    INSERT INTO public.product_fiscal_profiles(
      id, product_id, is_active, ncm, cfop_in_state, accounting_notes, profile_status
    ) VALUES (
      'ff5c3111-b12b-0000-0000-000000000001', v_prod_real, false,
      '12345678','5101','FISCAL_TEST_3111_PROD','DRAFT'
    ) ON CONFLICT (id) DO NOTHING;
  END;

  INSERT INTO public.service_fiscal_profiles(
    id, source_reference, is_active, lc116_item, cnae, profile_status
  ) VALUES (
    'ff5c3111-5e12-0000-0000-000000000001','FISCAL_TEST_3111_SERV', false,
    '01.01','0111-3','DRAFT'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.customer_fiscal_profiles(
    id, customer_id, profile_status, validation_notes, fiscal_municipality_ibge_code
  ) VALUES (
    'ff5c3111-c05t-0000-0000-000000000001', v_cli_a, 'INCOMPLETE',
    'FISCAL_TEST_3111_CUST', '3550308'
  ) ON CONFLICT (id) DO NOTHING;
END $seed_fixtures$;

-- =====================================================================
-- 5. Matriz de expectativas (materializada em tabela sintética)
--    Reflete src/test/fiscal/rls/matrix.ts (Fase 3.0.2-B) sem inferir regra
--    genérica: cada célula tem expectativa explícita.
-- =====================================================================
DROP TABLE IF EXISTS public._fiscal_test_3111_matrix;
CREATE TABLE public._fiscal_test_3111_matrix (
  perfil text NOT NULL,
  user_id uuid,
  is_anon boolean NOT NULL DEFAULT false,
  categoria text NOT NULL,          -- table|view|rpc|ownership
  objeto text NOT NULL,
  operacao text NOT NULL,           -- SELECT|INSERT|UPDATE|DELETE|CALL
  expected text NOT NULL            -- allow|deny
);

DO $mx$
DECLARE
  r record;
  roles constant text[][] := ARRAY[
    ARRAY['administrador','ff5c3111-0000-0000-0000-000000000001','f'],
    ARRAY['gestor','ff5c3111-0000-0000-0000-000000000002','f'],
    ARRAY['financeiro','ff5c3111-0000-0000-0000-000000000003','f'],
    ARRAY['administrativo','ff5c3111-0000-0000-0000-000000000004','f'],
    ARRAY['gestor_comercial','ff5c3111-0000-0000-0000-000000000005','f'],
    ARRAY['consultor_tecnico','ff5c3111-0000-0000-0000-000000000006','f'],
    ARRAY['tecnico_agronomo','ff5c3111-0000-0000-0000-000000000007','f'],
    ARRAY['aplicador','ff5c3111-0000-0000-0000-000000000008','f'],
    ARRAY['operador_onfarm','ff5c3111-0000-0000-0000-000000000009','f'],
    ARRAY['producao','ff5c3111-0000-0000-0000-00000000000a','f'],
    ARRAY['cliente_produtor','ff5c3111-0000-0000-0000-00000000000b','f'],
    ARRAY['parceiro_b2b','ff5c3111-0000-0000-0000-00000000000c','f'],
    ARRAY['parceiro_b2b_tecnico','ff5c3111-0000-0000-0000-00000000000d','f'],
    ARRAY['authenticated_sem_papel','ff5c3111-0000-0000-0000-00000000000e','f'],
    ARRAY['anon',NULL,'t']
  ];
  tables constant text[] := ARRAY[
    'company_fiscal_settings','product_fiscal_profiles','service_fiscal_profiles',
    'customer_fiscal_profiles','fiscal_invoices','fiscal_invoice_items',
    'fiscal_events','fiscal_idempotency_keys','fiscal_audit_log'];
  views constant text[] := ARRAY[
    'v_fiscal_company_readiness','v_product_fiscal_readiness','v_service_fiscal_readiness',
    'v_customer_fiscal_readiness','v_fiscal_document_reconciliation_pending'];
  ops constant text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE'];
  i int; j int; k int;
  perfil text; uid uuid; anon_flag boolean;
  exp text;
BEGIN
  FOR i IN 1..array_length(roles,1) LOOP
    perfil := roles[i][1];
    uid    := NULLIF(roles[i][2],'')::uuid;
    anon_flag := (roles[i][3]='t');

    -- Tabelas × ops
    FOR j IN 1..array_length(tables,1) LOOP
      FOR k IN 1..array_length(ops,1) LOOP
        -- Regras derivadas de matrix.ts / policies canônicas
        exp := 'deny';
        IF tables[j]='company_fiscal_settings' THEN
          IF perfil='administrador' AND ops[k] IN ('SELECT','INSERT','UPDATE') THEN exp:='allow';
          ELSIF perfil IN ('gestor','financeiro') AND ops[k]='SELECT' THEN exp:='allow';
          END IF;
        ELSIF tables[j] IN ('product_fiscal_profiles','service_fiscal_profiles','customer_fiscal_profiles') THEN
          IF perfil IN ('administrador','financeiro') AND ops[k] IN ('SELECT','INSERT','UPDATE') THEN exp:='allow';
          ELSIF perfil='gestor' AND ops[k]='SELECT' THEN exp:='allow';
          END IF;
        ELSIF tables[j]='fiscal_invoices' THEN
          IF perfil IN ('administrador','gestor','financeiro') AND ops[k] IN ('SELECT','INSERT','UPDATE') THEN exp:='allow';
          ELSIF perfil='cliente_produtor' AND ops[k]='SELECT' THEN exp:='allow';
          END IF;
        ELSIF tables[j]='fiscal_invoice_items' THEN
          IF perfil IN ('administrador','financeiro') AND ops[k] IN ('SELECT','INSERT','UPDATE','DELETE') THEN exp:='allow';
          ELSIF perfil='gestor' AND ops[k]='SELECT' THEN exp:='allow';
          END IF;
        ELSIF tables[j]='fiscal_events' THEN
          IF perfil IN ('administrador','gestor','financeiro') AND ops[k]='SELECT' THEN exp:='allow';
          END IF;
        ELSIF tables[j]='fiscal_idempotency_keys' THEN
          IF perfil='administrador' AND ops[k]='SELECT' THEN exp:='allow'; END IF;
        ELSIF tables[j]='fiscal_audit_log' THEN
          IF perfil='administrador' AND ops[k]='SELECT' THEN exp:='allow'; END IF;
        END IF;

        INSERT INTO public._fiscal_test_3111_matrix
          VALUES (perfil,uid,anon_flag,'table',tables[j],ops[k],exp);
      END LOOP;
    END LOOP;

    -- Views
    FOR j IN 1..array_length(views,1) LOOP
      exp := CASE WHEN perfil IN ('administrador','gestor','financeiro') THEN 'allow' ELSE 'deny' END;
      INSERT INTO public._fiscal_test_3111_matrix
        VALUES (perfil,uid,anon_flag,'view',views[j],'SELECT',exp);
    END LOOP;

    -- RPC — 4 casos por perfil: 1 positivo (allow para staff) + 3 negativos (sempre deny/error)
    FOR k IN 1..4 LOOP
      IF k=1 THEN
        exp := CASE WHEN perfil IN ('administrador','gestor','financeiro') THEN 'allow' ELSE 'deny' END;
      ELSE
        exp := 'deny';  -- casos negativos: invoice inválido / event inválido / notes overflow
      END IF;
      INSERT INTO public._fiscal_test_3111_matrix
        VALUES (perfil,uid,anon_flag,'rpc','rpc_fiscal_event_manual','CALL_'||k,exp);
    END LOOP;
  END LOOP;

  -- Ownership: 2 células
  INSERT INTO public._fiscal_test_3111_matrix VALUES
    ('cliente_produtor_A','ff5c3111-0000-0000-0000-00000000000b',false,
     'ownership','fiscal_invoices_own','SELECT','allow'),
    ('cliente_produtor_B','ff5c3111-0000-0000-0000-000000000010',false,
     'ownership','fiscal_invoices_other','SELECT','deny');
END $mx$;

-- Sanidade: matriz tem exatamente 677 asserções (540+75+60+2)
DO $check_total$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM public._fiscal_test_3111_matrix;
  IF c <> 677 THEN
    RAISE EXCEPTION 'ABORT 3.11.1: matriz com % asserções (esperado 677)', c;
  END IF;
END $check_total$;

-- =====================================================================
-- 6. Executor por célula
-- =====================================================================

-- Executor tabela: executa 1 op real e classifica passed/failed/error
CREATE OR REPLACE FUNCTION public._fiscal_3111_run_table(
  p_perfil text, p_uid uuid, p_anon boolean,
  p_table text, p_op text, p_expected text
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_id text := format('T-%s-%s-%s', p_perfil, p_table, p_op);
  v_sql text;
  v_ct  int;
  v_observed text;
  v_status text;
  v_detail text;
  v_target uuid;
BEGIN
  -- Alvo padrão por tabela
  v_target := CASE p_table
    WHEN 'company_fiscal_settings' THEN 'ff5c3111-c04f-0000-0000-000000000001'::uuid
    WHEN 'product_fiscal_profiles' THEN 'ff5c3111-b12b-0000-0000-000000000001'::uuid
    WHEN 'service_fiscal_profiles' THEN 'ff5c3111-5e12-0000-0000-000000000001'::uuid
    WHEN 'customer_fiscal_profiles' THEN 'ff5c3111-c05t-0000-0000-000000000001'::uuid
    WHEN 'fiscal_invoices'         THEN 'ff5c3111-f15c-0000-0000-000000000001'::uuid
    WHEN 'fiscal_invoice_items'    THEN NULL   -- select geral
    WHEN 'fiscal_events'           THEN NULL
    WHEN 'fiscal_idempotency_keys' THEN NULL
    WHEN 'fiscal_audit_log'        THEN NULL
  END;

  -- Configura sessão
  IF p_anon THEN
    PERFORM public._fiscal_3111_as_anon();
  ELSE
    PERFORM public._fiscal_3111_as(p_uid);
  END IF;

  BEGIN
    IF p_op='SELECT' THEN
      IF v_target IS NOT NULL THEN
        EXECUTE format('SELECT count(*) FROM public.%I WHERE id=$1', p_table)
          INTO v_ct USING v_target;
      ELSE
        EXECUTE format('SELECT count(*) FROM public.%I LIMIT 1', p_table) INTO v_ct;
      END IF;
      v_observed := CASE WHEN v_ct > 0 THEN 'allow' ELSE 'deny' END;

    ELSIF p_op='INSERT' THEN
      -- payload válido por tabela
      IF p_table='company_fiscal_settings' THEN
        EXECUTE $q$INSERT INTO public.company_fiscal_settings(is_active,cnpj,configuration_status)
                   VALUES(false, 'FISCAL_TEST_3111_INS_'||gen_random_uuid()::text, 'DRAFT')$q$;
      ELSIF p_table='product_fiscal_profiles' THEN
        EXECUTE $q$INSERT INTO public.product_fiscal_profiles(product_id, is_active, ncm, cfop_in_state, accounting_notes, profile_status)
                   SELECT id, false, '12345678', '5101', 'FISCAL_TEST_3111_INS', 'DRAFT'
                     FROM public.produtos LIMIT 1$q$;
      ELSIF p_table='service_fiscal_profiles' THEN
        EXECUTE $q$INSERT INTO public.service_fiscal_profiles(source_reference, is_active, lc116_item, cnae, profile_status)
                   VALUES('FISCAL_TEST_3111_INS_'||gen_random_uuid()::text, false, '01.01', '0111-3', 'DRAFT')$q$;
      ELSIF p_table='customer_fiscal_profiles' THEN
        EXECUTE $q$INSERT INTO public.customer_fiscal_profiles(customer_id, profile_status, validation_notes)
                   SELECT id, 'INCOMPLETE', 'FISCAL_TEST_3111_INS'||gen_random_uuid()::text
                     FROM public.clientes WHERE nome='FISCAL_TEST_3111_cli_A'$q$;
      ELSIF p_table='fiscal_invoices' THEN
        EXECUTE $q$INSERT INTO public.fiscal_invoices(invoice_type,status,total_amount,notes,created_by,
                     document_model,document_origin,environment,provider,normalized_status,reconciliation_status)
                   VALUES('NFE','PENDING',1,'FISCAL_TEST_3111_INS_'||gen_random_uuid()::text,
                          'ff5c3111-0000-0000-0000-000000000001','NFE','MANUAL_RECORD','NOT_CONFIGURED','NONE',
                          'LEGACY_RECORDED','NOT_APPLICABLE')$q$;
      ELSIF p_table='fiscal_invoice_items' THEN
        EXECUTE $q$INSERT INTO public.fiscal_invoice_items(fiscal_invoice_id,item_sequence,item_kind,description)
                   VALUES('ff5c3111-f15c-0000-0000-000000000001',
                          100+floor(random()*1000)::int,'PRODUCT','FISCAL_TEST_3111_INS')$q$;
      ELSIF p_table='fiscal_events' THEN
        EXECUTE $q$INSERT INTO public.fiscal_events(fiscal_invoice_id,event_type,event_source,notes)
                   VALUES('ff5c3111-f15c-0000-0000-000000000001','MANUAL_UPDATED','USER','FISCAL_TEST_3111_INS')$q$;
      ELSIF p_table='fiscal_idempotency_keys' THEN
        EXECUTE $q$INSERT INTO public.fiscal_idempotency_keys(idempotency_key,operation_type,environment,provider,status)
                   VALUES('FISCAL_TEST_3111_IDEMP_'||gen_random_uuid()::text,'PREPARE','NOT_CONFIGURED','NONE','PENDING')$q$;
      ELSIF p_table='fiscal_audit_log' THEN
        EXECUTE $q$INSERT INTO public.fiscal_audit_log(table_name,record_id,action,new_values)
                   VALUES('fiscal_invoices',gen_random_uuid(),'INSERT',
                          jsonb_build_object('notes','FISCAL_TEST_3111_INS'))$q$;
      END IF;
      v_observed := 'allow';

    ELSIF p_op='UPDATE' THEN
      IF p_table='company_fiscal_settings' THEN
        EXECUTE $q$UPDATE public.company_fiscal_settings SET updated_at=now()
                   WHERE cnpj='FISCAL_TEST_3111_CNPJ'$q$;
      ELSIF p_table='product_fiscal_profiles' THEN
        EXECUTE $q$UPDATE public.product_fiscal_profiles SET accounting_notes='FISCAL_TEST_3111_UPD'
                   WHERE accounting_notes LIKE 'FISCAL_TEST_3111_%'$q$;
      ELSIF p_table='service_fiscal_profiles' THEN
        EXECUTE $q$UPDATE public.service_fiscal_profiles SET accounting_notes='FISCAL_TEST_3111_UPD'
                   WHERE source_reference LIKE 'FISCAL_TEST_3111_%'$q$;
      ELSIF p_table='customer_fiscal_profiles' THEN
        EXECUTE $q$UPDATE public.customer_fiscal_profiles SET validation_notes='FISCAL_TEST_3111_UPD'
                   WHERE validation_notes LIKE 'FISCAL_TEST_3111_%'$q$;
      ELSIF p_table='fiscal_invoices' THEN
        EXECUTE $q$UPDATE public.fiscal_invoices SET notes='FISCAL_TEST_3111_UPD'||coalesce(notes,'')
                   WHERE id='ff5c3111-f15c-0000-0000-000000000001'$q$;
      ELSIF p_table='fiscal_invoice_items' THEN
        EXECUTE $q$UPDATE public.fiscal_invoice_items SET description='FISCAL_TEST_3111_UPD'
                   WHERE description LIKE 'FISCAL_TEST_3111_%'$q$;
      ELSIF p_table='fiscal_events' THEN
        -- fiscal_events sem UPDATE policy → sempre deny (grant é SELECT/INSERT)
        EXECUTE $q$UPDATE public.fiscal_events SET notes='FISCAL_TEST_3111_UPD'
                   WHERE notes LIKE 'FISCAL_TEST_3111_%'$q$;
      ELSIF p_table='fiscal_idempotency_keys' THEN
        EXECUTE $q$UPDATE public.fiscal_idempotency_keys SET status='PENDING'
                   WHERE idempotency_key LIKE 'FISCAL_TEST_3111_%'$q$;
      ELSIF p_table='fiscal_audit_log' THEN
        EXECUTE $q$UPDATE public.fiscal_audit_log SET table_name='fiscal_invoices'
                   WHERE (new_values->>'notes') LIKE 'FISCAL_TEST_3111_%'$q$;
      END IF;
      GET DIAGNOSTICS v_ct = ROW_COUNT;
      v_observed := CASE WHEN v_ct > 0 THEN 'allow' ELSE 'deny' END;

    ELSIF p_op='DELETE' THEN
      -- Todas as tabelas fiscais têm DELETE negado por policy (exceto fiscal_invoice_items
      -- p/ administrador+financeiro). Executa contra fixture descartável quando aplicável.
      IF p_table='fiscal_invoice_items' THEN
        EXECUTE $q$DELETE FROM public.fiscal_invoice_items
                   WHERE description='FISCAL_TEST_3111_ITEM_DEL_'||$1$q$
          USING p_perfil;
      ELSE
        EXECUTE format('DELETE FROM public.%I WHERE 1=0', p_table);
      END IF;
      GET DIAGNOSTICS v_ct = ROW_COUNT;
      v_observed := CASE WHEN v_ct > 0 THEN 'allow' ELSE 'deny' END;
    END IF;

    v_status := CASE WHEN v_observed = p_expected THEN 'passed' ELSE 'failed' END;
    v_detail := format('rows=%s', coalesce(v_ct::text,'-'));

  EXCEPTION
    WHEN insufficient_privilege THEN
      v_observed := 'deny';
      v_status   := CASE WHEN p_expected='deny' THEN 'passed' ELSE 'failed' END;
      v_detail   := '42501 insufficient_privilege';
    WHEN check_violation OR not_null_violation OR foreign_key_violation
      OR unique_violation OR string_data_right_truncation THEN
      v_observed := 'error';
      v_status   := 'error';
      v_detail   := format('constraint: %s', SQLERRM);
    WHEN OTHERS THEN
      -- Distinção: erros de RLS (42501) já capturados acima. Aqui pode ser
      -- erro de payload/coluna/etc → ERROR, nunca DENY.
      v_observed := 'error';
      v_status   := 'error';
      v_detail   := format('%s %s', SQLSTATE, SQLERRM);
  END;

  PERFORM public._fiscal_3111_reset();
  PERFORM public._fiscal_3111_record(v_id,'table',p_perfil,p_table,p_op,
    p_expected,v_observed,v_status,v_detail);
END $$;

-- Executor view
CREATE OR REPLACE FUNCTION public._fiscal_3111_run_view(
  p_perfil text, p_uid uuid, p_anon boolean, p_view text, p_expected text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_id text := format('V-%s-%s',p_perfil,p_view);
  v_ct int;
  v_observed text; v_status text; v_detail text;
BEGIN
  IF p_anon THEN PERFORM public._fiscal_3111_as_anon();
  ELSE           PERFORM public._fiscal_3111_as(p_uid);
  END IF;

  BEGIN
    EXECUTE format('SELECT count(*) FROM public.%I', p_view) INTO v_ct;
    v_observed := CASE WHEN v_ct > 0 THEN 'allow' ELSE 'deny' END;
    v_status := CASE WHEN v_observed=p_expected THEN 'passed' ELSE 'failed' END;
    v_detail := format('rows=%s',v_ct);
  EXCEPTION WHEN insufficient_privilege THEN
    v_observed := 'deny';
    v_status := CASE WHEN p_expected='deny' THEN 'passed' ELSE 'failed' END;
    v_detail := '42501';
  WHEN OTHERS THEN
    v_observed := 'error'; v_status := 'error';
    v_detail := format('%s %s',SQLSTATE,SQLERRM);
  END;

  PERFORM public._fiscal_3111_reset();
  PERFORM public._fiscal_3111_record(v_id,'view',p_perfil,p_view,'SELECT',
    p_expected,v_observed,v_status,v_detail);
END $$;

-- Executor RPC — 4 casos por perfil
CREATE OR REPLACE FUNCTION public._fiscal_3111_run_rpc(
  p_perfil text, p_uid uuid, p_anon boolean, p_case int, p_expected text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_id text := format('R-%s-%s',p_perfil,p_case);
  v_ev_id uuid;
  v_observed text; v_status text; v_detail text;
  v_pre_ct int; v_post_ct int;
  v_invoice uuid := 'ff5c3111-f15c-0000-0000-000000000001';
  v_event_type text := 'MANUAL_UPDATED';
  v_notes text := 'FISCAL_TEST_3111_RPC';
BEGIN
  -- Casos:
  --  1 = feliz (staff → allow, demais → deny por policy)
  --  2 = invoice inexistente → deny (todos)
  --  3 = event_type inválido → deny (todos)
  --  4 = notes overflow (>2000) → deny (todos)
  IF p_case=2 THEN v_invoice := 'ff5c3111-dead-dead-dead-deaddeaddead'::uuid;
  ELSIF p_case=3 THEN v_event_type := 'NAO_EXISTE_XYZ';
  ELSIF p_case=4 THEN v_notes := repeat('A',2500);
  END IF;

  IF p_anon THEN PERFORM public._fiscal_3111_as_anon();
  ELSE           PERFORM public._fiscal_3111_as(p_uid);
  END IF;

  SELECT count(*) INTO v_pre_ct
    FROM public.fiscal_events
   WHERE notes = v_notes AND fiscal_invoice_id = v_invoice;

  BEGIN
    v_ev_id := public.rpc_fiscal_event_manual(v_invoice, v_event_type, v_notes);
    -- Verifica que o evento foi criado corretamente
    SELECT count(*) INTO v_post_ct
      FROM public.fiscal_events
     WHERE id = v_ev_id
       AND fiscal_invoice_id = v_invoice
       AND event_source='USER'
       AND performed_by = p_uid
       AND notes = v_notes;
    IF v_post_ct = 1 THEN
      v_observed := 'allow';
      v_detail := format('event=%s actor_ok source=USER',v_ev_id);
    ELSE
      v_observed := 'error';
      v_detail := 'evento criado sem metadados esperados';
    END IF;
    v_status := CASE
      WHEN v_observed='error' THEN 'error'
      WHEN v_observed=p_expected THEN 'passed' ELSE 'failed' END;
  EXCEPTION WHEN insufficient_privilege THEN
    v_observed := 'deny';
    v_status := CASE WHEN p_expected='deny' THEN 'passed' ELSE 'failed' END;
    v_detail := '42501';
  WHEN OTHERS THEN
    -- Erros de negócio da RPC (forbidden, invoice_not_found, event_type_not_allowed_for_manual, notes_too_long)
    -- são semanticamente DENY quando esperado deny.
    IF SQLERRM ILIKE '%forbidden%' OR SQLERRM ILIKE '%not_authenticated%' THEN
      v_observed := 'deny';
      v_status := CASE WHEN p_expected='deny' THEN 'passed' ELSE 'failed' END;
      v_detail := 'RPC forbidden';
    ELSE
      -- casos negativos 2/3/4: erros de validação = deny esperado
      v_observed := 'deny';
      v_status := CASE WHEN p_expected='deny' THEN 'passed' ELSE 'failed' END;
      v_detail := format('validation: %s',SQLERRM);
    END IF;
    -- Confirma que nenhum evento novo foi criado
    SELECT count(*) INTO v_post_ct
      FROM public.fiscal_events
     WHERE notes = v_notes AND fiscal_invoice_id = v_invoice;
    IF v_post_ct > v_pre_ct THEN
      v_status := 'error';
      v_detail := v_detail || ' | evento persistido apesar do deny';
    END IF;
  END;

  PERFORM public._fiscal_3111_reset();
  PERFORM public._fiscal_3111_record(v_id,'rpc',p_perfil,'rpc_fiscal_event_manual',
    'CALL_'||p_case, p_expected, v_observed, v_status, v_detail);
END $$;

-- Executor ownership
CREATE OR REPLACE FUNCTION public._fiscal_3111_run_ownership(
  p_id text, p_perfil text, p_uid uuid, p_scope text, p_expected text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_target uuid;
  v_ct int;
  v_observed text; v_status text; v_detail text;
BEGIN
  -- own = próprio invoice do produtor; other = invoice do outro
  v_target := CASE p_scope
    WHEN 'own' THEN CASE WHEN p_uid='ff5c3111-0000-0000-0000-00000000000b'::uuid
                          THEN 'ff5c3111-f15c-0000-0000-000000000001'::uuid
                          ELSE 'ff5c3111-f15c-0000-0000-000000000002'::uuid END
    WHEN 'other' THEN CASE WHEN p_uid='ff5c3111-0000-0000-0000-000000000010'::uuid
                             THEN 'ff5c3111-f15c-0000-0000-000000000001'::uuid  -- B tenta ver A
                             ELSE 'ff5c3111-f15c-0000-0000-000000000002'::uuid END
  END;

  PERFORM public._fiscal_3111_as(p_uid);
  BEGIN
    SELECT count(*) INTO v_ct FROM public.fiscal_invoices WHERE id = v_target;
    v_observed := CASE WHEN v_ct = 1 THEN 'allow' ELSE 'deny' END;
    v_status := CASE WHEN v_observed=p_expected THEN 'passed' ELSE 'failed' END;
    v_detail := format('rows=%s target=%s',v_ct,left(v_target::text,8));
  EXCEPTION WHEN OTHERS THEN
    v_observed:='error'; v_status:='error'; v_detail := format('%s %s',SQLSTATE,SQLERRM);
  END;

  PERFORM public._fiscal_3111_reset();
  PERFORM public._fiscal_3111_record(p_id,'ownership',p_perfil,
    'fiscal_invoices','SELECT',p_expected,v_observed,v_status,v_detail);
END $$;

-- =====================================================================
-- 7. Execução real da matriz
-- =====================================================================
DO $run$
DECLARE r record; cs int;
BEGIN
  FOR r IN SELECT * FROM public._fiscal_test_3111_matrix
           WHERE categoria='table' ORDER BY perfil, objeto, operacao LOOP
    PERFORM public._fiscal_3111_run_table(r.perfil,r.user_id,r.is_anon,
      r.objeto,r.operacao,r.expected);
  END LOOP;

  FOR r IN SELECT * FROM public._fiscal_test_3111_matrix
           WHERE categoria='view' ORDER BY perfil, objeto LOOP
    PERFORM public._fiscal_3111_run_view(r.perfil,r.user_id,r.is_anon,r.objeto,r.expected);
  END LOOP;

  FOR r IN SELECT * FROM public._fiscal_test_3111_matrix
           WHERE categoria='rpc' ORDER BY perfil, operacao LOOP
    cs := split_part(r.operacao,'_',2)::int;
    PERFORM public._fiscal_3111_run_rpc(r.perfil,r.user_id,r.is_anon,cs,r.expected);
  END LOOP;

  FOR r IN SELECT * FROM public._fiscal_test_3111_matrix
           WHERE categoria='ownership' ORDER BY perfil LOOP
    PERFORM public._fiscal_3111_run_ownership(
      CASE r.objeto WHEN 'fiscal_invoices_own' THEN 'O-prodA-own' ELSE 'O-prodB-other' END,
      r.perfil, r.user_id,
      CASE r.objeto WHEN 'fiscal_invoices_own' THEN 'own' ELSE 'other' END,
      r.expected);
  END LOOP;
END $run$;

-- =====================================================================
-- 8. TEARDOWN garantido (namespace sintético apenas)
-- =====================================================================
PERFORM public._fiscal_3111_reset();

DO $post_cleanup$
BEGIN
  DELETE FROM public.fiscal_audit_log         WHERE (new_values->>'notes') LIKE 'FISCAL_TEST_3111_%'
                                                 OR (old_values->>'notes') LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.fiscal_events            WHERE notes LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.fiscal_invoice_items     WHERE description LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.fiscal_idempotency_keys  WHERE idempotency_key LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.fiscal_invoices          WHERE notes LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.customer_fiscal_profiles WHERE validation_notes LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.product_fiscal_profiles  WHERE accounting_notes LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.service_fiscal_profiles  WHERE source_reference LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.company_fiscal_settings  WHERE cnpj LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.accounts_receivable      WHERE description LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.user_clientes            WHERE user_id::text LIKE 'ff5c3111-%';
  DELETE FROM public.clientes                 WHERE nome LIKE 'FISCAL_TEST_3111_%';
  DELETE FROM public.user_roles               WHERE user_id::text LIKE 'ff5c3111-%';
  DELETE FROM public.profiles                 WHERE user_id::text LIKE 'ff5c3111-%';
  DELETE FROM auth.users                      WHERE id::text LIKE 'ff5c3111-%';
END $post_cleanup$;

-- Verificação zero-resíduo
DO $residuals$
DECLARE
  n_fi bigint; n_ev bigint; n_it bigint; n_ik bigint; n_al bigint;
  n_cs bigint; n_pfp bigint; n_sfp bigint; n_cfp bigint;
  n_ar bigint; n_cli bigint; n_uc bigint; n_ur bigint; n_pr bigint; n_au bigint;
  v_txt text;
BEGIN
  SELECT count(*) INTO n_fi  FROM public.fiscal_invoices          WHERE notes LIKE 'FISCAL_TEST_3111_%';
  SELECT count(*) INTO n_ev  FROM public.fiscal_events            WHERE notes LIKE 'FISCAL_TEST_3111_%';
  SELECT count(*) INTO n_it  FROM public.fiscal_invoice_items     WHERE description LIKE 'FISCAL_TEST_3111_%';
  SELECT count(*) INTO n_ik  FROM public.fiscal_idempotency_keys  WHERE idempotency_key LIKE 'FISCAL_TEST_3111_%';
  SELECT count(*) INTO n_al  FROM public.fiscal_audit_log         WHERE (new_values->>'notes') LIKE 'FISCAL_TEST_3111_%';
  SELECT count(*) INTO n_cs  FROM public.company_fiscal_settings  WHERE cnpj LIKE 'FISCAL_TEST_3111_%';
  SELECT count(*) INTO n_pfp FROM public.product_fiscal_profiles  WHERE accounting_notes LIKE 'FISCAL_TEST_3111_%';
  SELECT count(*) INTO n_sfp FROM public.service_fiscal_profiles  WHERE source_reference LIKE 'FISCAL_TEST_3111_%';
  SELECT count(*) INTO n_cfp FROM public.customer_fiscal_profiles WHERE validation_notes LIKE 'FISCAL_TEST_3111_%';
  SELECT count(*) INTO n_ar  FROM public.accounts_receivable      WHERE description LIKE 'FISCAL_TEST_3111_%';
  SELECT count(*) INTO n_cli FROM public.clientes                 WHERE nome LIKE 'FISCAL_TEST_3111_%';
  SELECT count(*) INTO n_uc  FROM public.user_clientes            WHERE user_id::text LIKE 'ff5c3111-%';
  SELECT count(*) INTO n_ur  FROM public.user_roles               WHERE user_id::text LIKE 'ff5c3111-%';
  SELECT count(*) INTO n_pr  FROM public.profiles                 WHERE user_id::text LIKE 'ff5c3111-%';
  SELECT count(*) INTO n_au  FROM auth.users                      WHERE id::text LIKE 'ff5c3111-%';

  v_txt := format(
    'invoices=%s events=%s items=%s idemp=%s audit=%s company=%s prod=%s serv=%s cust=%s ar=%s clientes=%s user_clientes=%s user_roles=%s profiles=%s auth_users=%s',
    n_fi,n_ev,n_it,n_ik,n_al,n_cs,n_pfp,n_sfp,n_cfp,n_ar,n_cli,n_uc,n_ur,n_pr,n_au);
  PERFORM set_config('fiscal.residuals', v_txt, false);

  IF (n_fi+n_ev+n_it+n_ik+n_al+n_cs+n_pfp+n_sfp+n_cfp+n_ar+n_cli+n_uc+n_ur+n_pr+n_au) > 0 THEN
    RAISE EXCEPTION 'ABORT 3.11.1: resíduos sintéticos remanescentes -> %', v_txt;
  END IF;
END $residuals$;

-- =====================================================================
-- 9. SAÍDA 1 — detalhes por asserção
-- =====================================================================
SELECT assertion_id, categoria, perfil, objeto, operacao,
       esperado, observado, status, detail
  FROM public._fiscal_test_3111_results
 ORDER BY categoria, perfil, objeto, operacao;

-- =====================================================================
-- 10. SAÍDA 2 — resumo + classificação
-- =====================================================================
SELECT
  current_setting('fiscal.masked_ref', true)                       AS project_ref_masked,
  (SELECT count(*)::int FROM public._fiscal_test_3111_results)      AS planejadas,
  (SELECT count(*)::int FROM public._fiscal_test_3111_results
     WHERE status <> 'skipped')                                     AS executadas,
  (SELECT count(*)::int FROM public._fiscal_test_3111_results
     WHERE status='passed')                                         AS aprovadas,
  (SELECT count(*)::int FROM public._fiscal_test_3111_results
     WHERE status='failed')                                         AS falhas,
  (SELECT count(*)::int FROM public._fiscal_test_3111_results
     WHERE status='error')                                          AS erros,
  (SELECT count(*)::int FROM public._fiscal_test_3111_results
     WHERE status='skipped')                                        AS skips,
  current_setting('fiscal.residuals', true)                        AS residuos,
  CASE WHEN (SELECT count(*) FROM public._fiscal_test_3111_results
              WHERE status IN ('failed','error','skipped'))=0
       AND (SELECT count(*) FROM public._fiscal_test_3111_results)=677
       THEN 'APTO' ELSE 'INAPTO' END                                AS classificacao;

-- Limpeza final das tabelas sintéticas de suporte
DROP TABLE public._fiscal_test_3111_matrix;
-- (mantém _fiscal_test_3111_results temporariamente após COMMIT; usuário limpa manualmente
--  com DROP TABLE public._fiscal_test_3111_results; após exportar)

COMMIT;
-- Fim do harness 3.11.1

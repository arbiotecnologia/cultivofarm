DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN RAISE EXCEPTION 'STAGING_GUARD: ambiente invalido %', v_ref; END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS public._motor_b2b_fase0_2_harness (
  id bigserial PRIMARY KEY,
  test_code text NOT NULL,
  descricao text NOT NULL,
  identidade text NOT NULL,
  esperado text NOT NULL,
  obtido text NOT NULL,
  passou boolean NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public._motor_b2b_fase0_2_harness TO service_role;
ALTER TABLE public._motor_b2b_fase0_2_harness ENABLE ROW LEVEL SECURITY;

TRUNCATE public._motor_b2b_fase0_2_harness;

DO $fx$
DECLARE
  v_partner_a uuid := '6f22d1dc-2862-4fdf-a334-cd010de06bb1';
  v_partner_b uuid := '0f0f0f0f-0000-4000-8000-00000000000b';
  v_cli_a uuid := 'b05e3c22-5e4a-4443-8f3c-70505045aa5b';
  v_cli_b uuid := '0f0f0f0f-0000-4000-8000-0000000000cb';
  u_gestor_b uuid := '7c04c4d1-6892-44cc-97b4-25eae04f46ea';
  u_prod_b   uuid := '8e9c2ca1-eaf1-4e5b-9fe0-2cb729634dca';
  u_admin    uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a';
  o_a uuid := '0f0f0f0f-0000-4000-8000-0000000000a1';
  o_b uuid := '0f0f0f0f-0000-4000-8000-0000000000b1';
  t_a uuid := '0f0f0f0f-0000-4000-8000-0000000000a2';
  t_b uuid := '0f0f0f0f-0000-4000-8000-0000000000b2';
  ar_b2b_a uuid := '0f0f0f0f-0000-4000-8000-0000000000a3';
  ar_b2b_b uuid := '0f0f0f0f-0000-4000-8000-0000000000b3';
  ar_dir_a uuid := '0f0f0f0f-0000-4000-8000-0000000000a4';
  ar_dir_b uuid := '0f0f0f0f-0000-4000-8000-0000000000b4';
  v_cat uuid;
BEGIN
  SELECT id INTO v_cat FROM public.financial_categories LIMIT 1;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'HARNESS: nenhuma financial_category disponivel'; END IF;

  -- parceiro B + cliente B
  INSERT INTO public.partner_accounts (id, razao_social) VALUES (v_partner_b, 'FASE02-HARNESS Parceiro B')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.clientes (id, nome, codigo_cliente) VALUES (v_cli_b, 'FASE02-HARNESS Cliente B', 'FASE02-HARNESS-B')
    ON CONFLICT (id) DO NOTHING;

  -- vinculos sinteticos
  INSERT INTO public.partner_users (user_id, partner_id) VALUES (u_gestor_b, v_partner_b)
    ON CONFLICT (user_id) DO UPDATE SET partner_id = EXCLUDED.partner_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (u_gestor_b, 'parceiro_b2b') ON CONFLICT DO NOTHING;
  INSERT INTO public.user_clientes (user_id, cliente_id) VALUES (u_prod_b, v_cli_b) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (u_prod_b, 'cliente_produtor') ON CONFLICT DO NOTHING;

  -- pedidos
  INSERT INTO public.partner_orders (id, partner_id, status, total, cliente_id)
    VALUES (o_a, v_partner_a, 'rascunho', 100, v_cli_a) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.partner_orders (id, partner_id, status, total, cliente_id)
    VALUES (o_b, v_partner_b, 'rascunho', 100, v_cli_b) ON CONFLICT (id) DO NOTHING;

  -- terms + schedule
  INSERT INTO public.partner_order_payment_terms
    (id, partner_order_id, plan_code_snapshot, plan_name_snapshot, discount_percent_snapshot,
     monthly_interest_percent_snapshot, months_count_snapshot, first_due_date)
    VALUES (t_a, o_a, 'FASE02-HARNESS', 'FASE02-HARNESS A', 0, 0, 1, current_date)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.partner_order_payment_terms
    (id, partner_order_id, plan_code_snapshot, plan_name_snapshot, discount_percent_snapshot,
     monthly_interest_percent_snapshot, months_count_snapshot, first_due_date)
    VALUES (t_b, o_b, 'FASE02-HARNESS', 'FASE02-HARNESS B', 0, 0, 1, current_date)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.partner_order_payment_schedule (partner_order_id, payment_terms_id, installment_number, due_date, amount)
    SELECT o_a, t_a, 1, current_date, 100
    WHERE NOT EXISTS (SELECT 1 FROM public.partner_order_payment_schedule WHERE payment_terms_id = t_a);
  INSERT INTO public.partner_order_payment_schedule (partner_order_id, payment_terms_id, installment_number, due_date, amount)
    SELECT o_b, t_b, 1, current_date, 100
    WHERE NOT EXISTS (SELECT 1 FROM public.partner_order_payment_schedule WHERE payment_terms_id = t_b);

  -- recebiveis B2B (customer_id do produtor A, devedor = parceiro A)
  INSERT INTO public.accounts_receivable (id, category_id, created_by, description, first_due_date, origin_type, total_amount, customer_id, partner_id)
    VALUES (ar_b2b_a, v_cat, u_admin, 'FASE02-HARNESS AR B2B A', current_date, 'B2B_ORDER', 100, v_cli_a, v_partner_a)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.accounts_receivable (id, category_id, created_by, description, first_due_date, origin_type, total_amount, customer_id, partner_id)
    VALUES (ar_b2b_b, v_cat, u_admin, 'FASE02-HARNESS AR B2B B', current_date, 'B2B_ORDER', 100, v_cli_b, v_partner_b)
    ON CONFLICT (id) DO NOTHING;
  -- recebiveis diretos
  INSERT INTO public.accounts_receivable (id, category_id, created_by, description, first_due_date, origin_type, total_amount, customer_id, partner_id)
    VALUES (ar_dir_a, v_cat, u_admin, 'FASE02-HARNESS AR DIRETO A', current_date, 'MANUAL', 100, v_cli_a, NULL)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.accounts_receivable (id, category_id, created_by, description, first_due_date, origin_type, total_amount, customer_id, partner_id)
    VALUES (ar_dir_b, v_cat, u_admin, 'FASE02-HARNESS AR DIRETO B', current_date, 'MANUAL', 100, v_cli_b, NULL)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.accounts_receivable_installments (receivable_id, installment_number, due_date, original_amount, net_amount)
    SELECT x, 1, current_date, 100, 100
    FROM unnest(ARRAY[ar_b2b_a, ar_b2b_b, ar_dir_a, ar_dir_b]) x
    WHERE NOT EXISTS (SELECT 1 FROM public.accounts_receivable_installments i WHERE i.receivable_id = x);
END $fx$;

-- =====================  HARNESS  =====================
DO $h$
DECLARE
  r record;
  v_cnt int;
  v_sql text;
  v_claims text;
  tests jsonb := jsonb_build_array(
    jsonb_build_object('code','T1','desc','Administrador le terms e schedule','uid','b5c2ebd4-7cdf-4647-a585-6ec49f1b583a','sql','SELECT (SELECT count(*) FROM partner_order_payment_terms WHERE plan_code_snapshot=''FASE02-HARNESS'')::int + (SELECT count(*) FROM partner_order_payment_schedule s JOIN partner_order_payment_terms t ON t.id=s.payment_terms_id AND t.plan_code_snapshot=''FASE02-HARNESS'')::int','exp','4'),
    jsonb_build_object('code','T2','desc','Financeiro le terms e schedule','uid','d56793fa-acb3-4862-a180-498c20f5317f','sql','SELECT (SELECT count(*) FROM partner_order_payment_terms WHERE plan_code_snapshot=''FASE02-HARNESS'')::int + (SELECT count(*) FROM partner_order_payment_schedule s JOIN partner_order_payment_terms t ON t.id=s.payment_terms_id AND t.plan_code_snapshot=''FASE02-HARNESS'')::int','exp','4'),
    jsonb_build_object('code','T3','desc','Gestor comercial le terms e schedule','uid','497b0307-0b64-42f4-a2b1-fd3e220fac3b','sql','SELECT (SELECT count(*) FROM partner_order_payment_terms WHERE plan_code_snapshot=''FASE02-HARNESS'')::int + (SELECT count(*) FROM partner_order_payment_schedule s JOIN partner_order_payment_terms t ON t.id=s.payment_terms_id AND t.plan_code_snapshot=''FASE02-HARNESS'')::int','exp','4'),
    jsonb_build_object('code','T4','desc','Gestor B2B A le terms/schedule do parceiro A','uid','7d894a7d-cdc8-40f1-9df1-1649d2f16422','sql','SELECT (SELECT count(*) FROM partner_order_payment_terms WHERE plan_name_snapshot=''FASE02-HARNESS A'')::int + (SELECT count(*) FROM partner_order_payment_schedule s JOIN partner_order_payment_terms t ON t.id=s.payment_terms_id AND t.plan_name_snapshot=''FASE02-HARNESS A'')::int','exp','2'),
    jsonb_build_object('code','T5','desc','Gestor B2B A nao le parceiro B','uid','7d894a7d-cdc8-40f1-9df1-1649d2f16422','sql','SELECT (SELECT count(*) FROM partner_order_payment_terms WHERE plan_name_snapshot=''FASE02-HARNESS B'')::int + (SELECT count(*) FROM partner_order_payment_schedule s JOIN partner_order_payment_terms t ON t.id=s.payment_terms_id AND t.plan_name_snapshot=''FASE02-HARNESS B'')::int','exp','0'),
    jsonb_build_object('code','T6','desc','Tecnico B2B A nao le terms','uid','08832541-8155-43d2-bc4f-6a6bc407f7ae','sql','SELECT count(*)::int FROM partner_order_payment_terms','exp','0'),
    jsonb_build_object('code','T7','desc','Tecnico B2B A nao le schedule','uid','08832541-8155-43d2-bc4f-6a6bc407f7ae','sql','SELECT count(*)::int FROM partner_order_payment_schedule','exp','0'),
    jsonb_build_object('code','T8','desc','Produtor A nao le terms/schedule B2B','uid','85998744-78fd-41ae-b74e-2b763e7f8089','sql','SELECT (SELECT count(*) FROM partner_order_payment_terms)::int + (SELECT count(*) FROM partner_order_payment_schedule)::int','exp','0'),
    jsonb_build_object('code','T9','desc','Produtor A nao le recebivel B2B com seu customer_id','uid','85998744-78fd-41ae-b74e-2b763e7f8089','sql','SELECT count(*)::int FROM accounts_receivable WHERE origin_type=''B2B_ORDER''','exp','0'),
    jsonb_build_object('code','T10','desc','Produtor A nao le parcelas do recebivel B2B','uid','85998744-78fd-41ae-b74e-2b763e7f8089','sql','SELECT count(*)::int FROM accounts_receivable_installments i JOIN accounts_receivable ar ON ar.id=i.receivable_id AND ar.origin_type=''B2B_ORDER''','exp','0'),
    jsonb_build_object('code','T11','desc','Produtor A le recebivel direto proprio','uid','85998744-78fd-41ae-b74e-2b763e7f8089','sql','SELECT count(*)::int FROM accounts_receivable WHERE description=''FASE02-HARNESS AR DIRETO A''','exp','1'),
    jsonb_build_object('code','T12','desc','Produtor A le parcelas do recebivel direto proprio','uid','85998744-78fd-41ae-b74e-2b763e7f8089','sql','SELECT count(*)::int FROM accounts_receivable_installments i JOIN accounts_receivable ar ON ar.id=i.receivable_id WHERE ar.description=''FASE02-HARNESS AR DIRETO A''','exp','1'),
    jsonb_build_object('code','T13','desc','Produtor A nao le recebivel direto do produtor B','uid','85998744-78fd-41ae-b74e-2b763e7f8089','sql','SELECT count(*)::int FROM accounts_receivable WHERE description=''FASE02-HARNESS AR DIRETO B''','exp','0'),
    jsonb_build_object('code','T14','desc','Parceiro A le recebivel B2B proprio','uid','7d894a7d-cdc8-40f1-9df1-1649d2f16422','sql','SELECT count(*)::int FROM accounts_receivable WHERE description=''FASE02-HARNESS AR B2B A''','exp','1'),
    jsonb_build_object('code','T15','desc','Parceiro A nao le recebivel do parceiro B','uid','7d894a7d-cdc8-40f1-9df1-1649d2f16422','sql','SELECT count(*)::int FROM accounts_receivable WHERE description=''FASE02-HARNESS AR B2B B''','exp','0'),
    jsonb_build_object('code','T6b','desc','Tecnico B2B nao le recebivel B2B','uid','08832541-8155-43d2-bc4f-6a6bc407f7ae','sql','SELECT count(*)::int FROM accounts_receivable','exp','0'),
    jsonb_build_object('code','T8b','desc','Usuario autenticado sem vinculo nao le terms/schedule/AR','uid','c844a183-1ed9-4611-a465-0de352fa1c23','sql','SELECT (SELECT count(*) FROM partner_order_payment_terms)::int + (SELECT count(*) FROM partner_order_payment_schedule)::int + (SELECT count(*) FROM accounts_receivable)::int','exp','0')
  );
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(tests) t(v) LOOP
    v_claims := json_build_object('sub', r.v->>'uid', 'role','authenticated')::text;
    v_sql := r.v->>'sql';
    EXECUTE format('SET LOCAL request.jwt.claims = %L', v_claims);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      EXECUTE v_sql INTO v_cnt;
    EXCEPTION WHEN OTHERS THEN
      v_cnt := -1;
    END;
    RESET ROLE;
    INSERT INTO public._motor_b2b_fase0_2_harness (test_code, descricao, identidade, esperado, obtido, passou)
    VALUES (r.v->>'code', r.v->>'desc', r.v->>'uid', r.v->>'exp', v_cnt::text, v_cnt::text = (r.v->>'exp'));
  END LOOP;
  RESET ROLE;
END $h$;

-- T16: tecnico nao executa RPCs de aprovacao (verificacao de policy interna via has_role)
INSERT INTO public._motor_b2b_fase0_2_harness (test_code, descricao, identidade, esperado, obtido, passou)
SELECT 'T16','Tecnico B2B nao possui papel para aprovar/rejeitar payment terms','08832541-8155-43d2-bc4f-6a6bc407f7ae','false',
       (public.has_role('08832541-8155-43d2-bc4f-6a6bc407f7ae','administrador'::app_role)
        OR public.has_role('08832541-8155-43d2-bc4f-6a6bc407f7ae','financeiro'::app_role)
        OR public.has_role('08832541-8155-43d2-bc4f-6a6bc407f7ae','gestor_comercial'::app_role))::text,
       NOT (public.has_role('08832541-8155-43d2-bc4f-6a6bc407f7ae','administrador'::app_role)
        OR public.has_role('08832541-8155-43d2-bc4f-6a6bc407f7ae','financeiro'::app_role)
        OR public.has_role('08832541-8155-43d2-bc4f-6a6bc407f7ae','gestor_comercial'::app_role));

-- T17/T18: grants
INSERT INTO public._motor_b2b_fase0_2_harness (test_code, descricao, identidade, esperado, obtido, passou)
SELECT 'T17','anon nao executa RPCs sensiveis','anon','0',
  count(*)::text, count(*) = 0
FROM (VALUES ('approve_b2b_payment_terms_secure(uuid,text)'),('reject_b2b_payment_terms_secure(uuid,text)'),
             ('request_b2b_payment_terms_adjustment_secure(uuid,text)'),('add_b2b_payment_terms_note_secure(uuid,text)')) v(f)
WHERE has_function_privilege('anon', 'public.'||v.f, 'EXECUTE');

INSERT INTO public._motor_b2b_fase0_2_harness (test_code, descricao, identidade, esperado, obtido, passou)
SELECT 'T18','PUBLIC nao possui EXECUTE nas RPCs sensiveis','PUBLIC','0', count(*)::text, count(*)=0
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('approve_b2b_payment_terms_secure','reject_b2b_payment_terms_secure','request_b2b_payment_terms_adjustment_secure','add_b2b_payment_terms_note_secure')
  AND array_to_string(p.proacl::text[],' ') LIKE '=X/%';

-- T19: checksums das 17 funcoes do snapshot
INSERT INTO public._motor_b2b_fase0_2_harness (test_code, descricao, identidade, esperado, obtido, passou)
SELECT 'T19','Checksums das 17 funcoes identicos ao snapshot Fase 0.1','postgres','0', count(*)::text, count(*)=0
FROM public._motor_b2b_pre_phase1_snapshot s
JOIN pg_proc p ON p.pronamespace='public'::regnamespace AND p.proname=s.proname
 AND pg_get_function_identity_arguments(p.oid)=s.identity_args
WHERE md5(pg_get_functiondef(p.oid)) <> s.checksum_md5;
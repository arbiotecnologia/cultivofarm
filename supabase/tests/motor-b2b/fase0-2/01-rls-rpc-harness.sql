-- =====================================================================
-- MOTOR B2B — FASE 0.2 — HARNESS DE RLS E RPC (T1..T19)
--
-- NAO E MIGRATION. Execucao manual e explicita.
--
-- Ambiente permitido : STAGING ikaauvsflpmamgxmkhoq
-- Ambiente PROIBIDO  : PRODUCAO navfzbwgwzruipouyfnk
--
-- Caracteristicas de seguranca:
--  * usa APENAS identidades sinteticas FASE02 criadas dentro do script;
--  * NUNCA usa ON CONFLICT DO UPDATE em vinculo de usuario real;
--  * todas as fixtures (auth.users, partner_accounts, clientes, pedidos,
--    terms, schedule, recebiveis, parcelas, papeis e vinculos) sao criadas
--    dentro de uma subtransacao que SEMPRE sofre ROLLBACK ao final —
--    nenhum dado de staging e criado, alterado ou removido;
--  * somente as linhas de evidencia (contadores e status) sao persistidas.
--
-- Uso:
--   psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -f 01-rls-rpc-harness.sql
-- =====================================================================

\set ON_ERROR_STOP on

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'STAGING_GUARD: marker ausente'; END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN RAISE EXCEPTION 'STAGING_GUARD: PRODUCAO recusada'; END IF;
  IF v_ref <> 'ikaauvsflpmamgxmkhoq' THEN RAISE EXCEPTION 'STAGING_GUARD: ref inesperado %', v_ref; END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS public._motor_b2b_fase0_2_evidence (
  id bigserial PRIMARY KEY,
  test_code text NOT NULL,
  descricao text NOT NULL,
  identidade text NOT NULL,
  esperado text NOT NULL,
  obtido text NOT NULL,
  passou boolean NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public._motor_b2b_fase0_2_evidence FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public._motor_b2b_fase0_2_evidence TO service_role;
ALTER TABLE public._motor_b2b_fase0_2_evidence ENABLE ROW LEVEL SECURITY;

DELETE FROM public._motor_b2b_fase0_2_evidence;

DO $main$
DECLARE
  res jsonb := '[]'::jsonb;
  -- identidades 100% sinteticas
  u_admin uuid := '0f02aaaa-0000-4000-8000-000000000001';
  u_fin   uuid := '0f02aaaa-0000-4000-8000-000000000002';
  u_com   uuid := '0f02aaaa-0000-4000-8000-000000000003';
  u_gesa  uuid := '0f02aaaa-0000-4000-8000-000000000004';
  u_teca  uuid := '0f02aaaa-0000-4000-8000-000000000005';
  u_proda uuid := '0f02aaaa-0000-4000-8000-000000000006';
  u_prodb uuid := '0f02aaaa-0000-4000-8000-000000000007';
  u_none  uuid := '0f02aaaa-0000-4000-8000-000000000008';
  p_a uuid := '0f02bbbb-0000-4000-8000-00000000000a';
  p_b uuid := '0f02bbbb-0000-4000-8000-00000000000b';
  c_a uuid := '0f02cccc-0000-4000-8000-00000000000a';
  c_b uuid := '0f02cccc-0000-4000-8000-00000000000b';
  o_a uuid := '0f02dddd-0000-4000-8000-00000000000a';
  o_b uuid := '0f02dddd-0000-4000-8000-00000000000b';
  t_a uuid := '0f02eeee-0000-4000-8000-00000000000a';
  t_b uuid := '0f02eeee-0000-4000-8000-00000000000b';
  ar_ba uuid := '0f02ffff-0000-4000-8000-00000000000a';
  ar_bb uuid := '0f02ffff-0000-4000-8000-00000000000b';
  ar_da uuid := '0f02ffff-0000-4000-8000-00000000001a';
  ar_db uuid := '0f02ffff-0000-4000-8000-00000000001b';
  v_cat uuid;
  r record;
  v_cnt int;
  v_txt text;
  v_status_antes text;
  v_status_depois text;
  v_notes_depois text;
  v_rpc text;
  v_fail int;
  tests jsonb;
BEGIN
  BEGIN  -- ============ subtransacao descartavel ============
    SELECT id INTO v_cat FROM public.financial_categories LIMIT 1;
    IF v_cat IS NULL THEN RAISE EXCEPTION 'HARNESS: nenhuma financial_category disponivel'; END IF;

    -- 1. usuarios sinteticos (created_by_admin=true evita role default do trigger)
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    SELECT x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           x.email, '', now(), '{}'::jsonb,
           jsonb_build_object('nome','FASE02 HARNESS','created_by_admin','true'), now(), now()
    FROM (VALUES
      (u_admin,'fase02.admin@harness.invalid'),
      (u_fin,  'fase02.fin@harness.invalid'),
      (u_com,  'fase02.com@harness.invalid'),
      (u_gesa, 'fase02.gestora@harness.invalid'),
      (u_teca, 'fase02.tecnicoa@harness.invalid'),
      (u_proda,'fase02.produtora@harness.invalid'),
      (u_prodb,'fase02.produtorb@harness.invalid'),
      (u_none, 'fase02.semvinculo@harness.invalid')
    ) AS x(id,email);

    -- 2. parceiros e clientes sinteticos
    INSERT INTO public.partner_accounts (id, razao_social) VALUES
      (p_a,'FASE02-HARNESS Parceiro A'), (p_b,'FASE02-HARNESS Parceiro B');
    INSERT INTO public.clientes (id, nome, codigo_cliente) VALUES
      (c_a,'FASE02-HARNESS Cliente A','FASE02-HARNESS-A'),
      (c_b,'FASE02-HARNESS Cliente B','FASE02-HARNESS-B');

    -- 3. vinculos (somente usuarios sinteticos; INSERT puro, sem DO UPDATE)
    INSERT INTO public.partner_users (user_id, partner_id) VALUES (u_gesa,p_a),(u_teca,p_a);
    INSERT INTO public.user_clientes (user_id, cliente_id) VALUES (u_proda,c_a),(u_prodb,c_b);
    INSERT INTO public.user_roles (user_id, role) VALUES
      (u_admin,'administrador'),(u_fin,'financeiro'),(u_com,'gestor_comercial'),
      (u_gesa,'parceiro_b2b'),(u_teca,'parceiro_b2b_tecnico'),
      (u_proda,'cliente_produtor'),(u_prodb,'cliente_produtor');

    -- 4. pedidos, condicoes e cronogramas
    INSERT INTO public.partner_orders (id, partner_id, status, total, cliente_id) VALUES
      (o_a,p_a,'rascunho',100,c_a),(o_b,p_b,'rascunho',100,c_b);
    INSERT INTO public.partner_order_payment_terms
      (id, partner_order_id, plan_code_snapshot, plan_name_snapshot, discount_percent_snapshot,
       monthly_interest_percent_snapshot, months_count_snapshot, first_due_date) VALUES
      (t_a,o_a,'FASE02-HARNESS','FASE02-HARNESS A',0,0,1,current_date),
      (t_b,o_b,'FASE02-HARNESS','FASE02-HARNESS B',0,0,1,current_date);
    UPDATE public.partner_orders SET payment_terms_id = t_a WHERE id = o_a;
    UPDATE public.partner_orders SET payment_terms_id = t_b WHERE id = o_b;
    INSERT INTO public.partner_order_payment_schedule
      (partner_order_id, payment_terms_id, installment_number, due_date, amount) VALUES
      (o_a,t_a,1,current_date,100),(o_b,t_b,1,current_date,100);

    -- 5. recebiveis e parcelas
    INSERT INTO public.accounts_receivable
      (id, category_id, created_by, description, first_due_date, origin_type, total_amount, customer_id, partner_id) VALUES
      (ar_ba,v_cat,u_admin,'FASE02-HARNESS AR B2B A',current_date,'B2B_ORDER',100,c_a,p_a),
      (ar_bb,v_cat,u_admin,'FASE02-HARNESS AR B2B B',current_date,'B2B_ORDER',100,c_b,p_b),
      (ar_da,v_cat,u_admin,'FASE02-HARNESS AR DIRETO A',current_date,'MANUAL',100,c_a,NULL),
      (ar_db,v_cat,u_admin,'FASE02-HARNESS AR DIRETO B',current_date,'MANUAL',100,c_b,NULL);
    INSERT INTO public.accounts_receivable_installments
      (receivable_id, installment_number, due_date, original_amount, net_amount)
    SELECT x,1,current_date,100,100 FROM unnest(ARRAY[ar_ba,ar_bb,ar_da,ar_db]) x;

    -- ================= T1..T15 + complementares =================
    tests := jsonb_build_array(
      jsonb_build_object('code','T1','desc','Administrador le terms e schedule','uid',u_admin,'exp','4','sql',
        'SELECT (SELECT count(*) FROM partner_order_payment_terms WHERE plan_code_snapshot=''FASE02-HARNESS'')::int + (SELECT count(*) FROM partner_order_payment_schedule s JOIN partner_order_payment_terms t ON t.id=s.payment_terms_id AND t.plan_code_snapshot=''FASE02-HARNESS'')::int'),
      jsonb_build_object('code','T2','desc','Financeiro le terms e schedule','uid',u_fin,'exp','4','sql',
        'SELECT (SELECT count(*) FROM partner_order_payment_terms WHERE plan_code_snapshot=''FASE02-HARNESS'')::int + (SELECT count(*) FROM partner_order_payment_schedule s JOIN partner_order_payment_terms t ON t.id=s.payment_terms_id AND t.plan_code_snapshot=''FASE02-HARNESS'')::int'),
      jsonb_build_object('code','T3','desc','Gestor comercial le terms e schedule','uid',u_com,'exp','4','sql',
        'SELECT (SELECT count(*) FROM partner_order_payment_terms WHERE plan_code_snapshot=''FASE02-HARNESS'')::int + (SELECT count(*) FROM partner_order_payment_schedule s JOIN partner_order_payment_terms t ON t.id=s.payment_terms_id AND t.plan_code_snapshot=''FASE02-HARNESS'')::int'),
      jsonb_build_object('code','T4','desc','Gestor B2B A le terms/schedule do parceiro A','uid',u_gesa,'exp','2','sql',
        'SELECT (SELECT count(*) FROM partner_order_payment_terms WHERE plan_name_snapshot=''FASE02-HARNESS A'')::int + (SELECT count(*) FROM partner_order_payment_schedule s JOIN partner_order_payment_terms t ON t.id=s.payment_terms_id AND t.plan_name_snapshot=''FASE02-HARNESS A'')::int'),
      jsonb_build_object('code','T5','desc','Gestor B2B A nao le parceiro B','uid',u_gesa,'exp','0','sql',
        'SELECT (SELECT count(*) FROM partner_order_payment_terms WHERE plan_name_snapshot=''FASE02-HARNESS B'')::int + (SELECT count(*) FROM partner_order_payment_schedule s JOIN partner_order_payment_terms t ON t.id=s.payment_terms_id AND t.plan_name_snapshot=''FASE02-HARNESS B'')::int'),
      jsonb_build_object('code','T6','desc','Tecnico B2B A nao le terms','uid',u_teca,'exp','0','sql',
        'SELECT count(*)::int FROM partner_order_payment_terms'),
      jsonb_build_object('code','T7','desc','Tecnico B2B A nao le schedule','uid',u_teca,'exp','0','sql',
        'SELECT count(*)::int FROM partner_order_payment_schedule'),
      jsonb_build_object('code','T8','desc','Produtor A nao le terms/schedule B2B','uid',u_proda,'exp','0','sql',
        'SELECT (SELECT count(*) FROM partner_order_payment_terms)::int + (SELECT count(*) FROM partner_order_payment_schedule)::int'),
      jsonb_build_object('code','T9','desc','Produtor A nao le recebivel B2B com seu customer_id','uid',u_proda,'exp','0','sql',
        'SELECT count(*)::int FROM accounts_receivable WHERE origin_type=''B2B_ORDER'''),
      jsonb_build_object('code','T10','desc','Produtor A nao le parcelas do recebivel B2B','uid',u_proda,'exp','0','sql',
        'SELECT count(*)::int FROM accounts_receivable_installments i JOIN accounts_receivable ar ON ar.id=i.receivable_id AND ar.origin_type=''B2B_ORDER'''),
      jsonb_build_object('code','T11','desc','Produtor A le recebivel direto proprio','uid',u_proda,'exp','1','sql',
        'SELECT count(*)::int FROM accounts_receivable WHERE description=''FASE02-HARNESS AR DIRETO A'''),
      jsonb_build_object('code','T12','desc','Produtor A le parcelas do recebivel direto proprio','uid',u_proda,'exp','1','sql',
        'SELECT count(*)::int FROM accounts_receivable_installments i JOIN accounts_receivable ar ON ar.id=i.receivable_id WHERE ar.description=''FASE02-HARNESS AR DIRETO A'''),
      jsonb_build_object('code','T13','desc','Produtor A nao le recebivel direto do produtor B','uid',u_proda,'exp','0','sql',
        'SELECT count(*)::int FROM accounts_receivable WHERE description=''FASE02-HARNESS AR DIRETO B'''),
      jsonb_build_object('code','T14','desc','Parceiro A le recebivel B2B proprio','uid',u_gesa,'exp','1','sql',
        'SELECT count(*)::int FROM accounts_receivable WHERE description=''FASE02-HARNESS AR B2B A'''),
      jsonb_build_object('code','T15','desc','Parceiro A nao le recebivel do parceiro B','uid',u_gesa,'exp','0','sql',
        'SELECT count(*)::int FROM accounts_receivable WHERE description=''FASE02-HARNESS AR B2B B'''),
      jsonb_build_object('code','T15b','desc','Tecnico B2B nao le recebivel B2B','uid',u_teca,'exp','0','sql',
        'SELECT count(*)::int FROM accounts_receivable WHERE description LIKE ''FASE02-HARNESS%'''),
      jsonb_build_object('code','T15c','desc','Produtor B nao le dados do produtor A','uid',u_prodb,'exp','0','sql',
        'SELECT count(*)::int FROM accounts_receivable WHERE description=''FASE02-HARNESS AR DIRETO A'''),
      jsonb_build_object('code','T15d','desc','Autenticado sem vinculo nao le terms/schedule/AR','uid',u_none,'exp','0','sql',
        'SELECT (SELECT count(*) FROM partner_order_payment_terms)::int + (SELECT count(*) FROM partner_order_payment_schedule)::int + (SELECT count(*) FROM accounts_receivable)::int')
    );

    FOR r IN SELECT value v FROM jsonb_array_elements(tests) LOOP
      EXECUTE format('SET LOCAL request.jwt.claims = %L',
                     json_build_object('sub', r.v->>'uid','role','authenticated')::text);
      EXECUTE 'SET LOCAL ROLE authenticated';
      BEGIN
        EXECUTE (r.v->>'sql') INTO v_cnt;
      EXCEPTION WHEN OTHERS THEN v_cnt := -1;
      END;
      RESET ROLE;
      res := res || jsonb_build_array(jsonb_build_object(
        'code', r.v->>'code','desc', r.v->>'desc','ident', r.v->>'uid',
        'exp', r.v->>'exp','got', v_cnt::text,'pass', (v_cnt::text = (r.v->>'exp'))));
    END LOOP;

    -- ================= T16: execucao REAL das 4 RPCs sensiveis =================
    SELECT approval_status INTO v_status_antes FROM public.partner_order_payment_terms WHERE id = t_a;

    FOREACH v_rpc IN ARRAY ARRAY[
      'approve_b2b_payment_terms_secure',
      'reject_b2b_payment_terms_secure',
      'request_b2b_payment_terms_adjustment_secure',
      'add_b2b_payment_terms_note_secure'] LOOP
      FOR r IN SELECT * FROM (VALUES
          ('tecnico_b2b', u_teca::text, 'authenticated'),
          ('sem_vinculo', u_none::text, 'authenticated'),
          ('anon',        NULL,         'anon')) AS x(rotulo, uid, dbrole) LOOP
        v_txt := NULL;
        BEGIN
          IF r.uid IS NULL THEN
            EXECUTE 'SET LOCAL request.jwt.claims = ''{"role":"anon"}''';
          ELSE
            EXECUTE format('SET LOCAL request.jwt.claims = %L',
                           json_build_object('sub', r.uid,'role','authenticated')::text);
          END IF;
          EXECUTE format('SET LOCAL ROLE %I', r.dbrole);
          EXECUTE format('SELECT public.%I($1,$2)', v_rpc) USING o_a, 'FASE02-HARNESS TENTATIVA INDEVIDA';
          v_txt := 'SEM_ERRO';
        EXCEPTION WHEN OTHERS THEN
          v_txt := 'BLOQUEADO:' || SQLSTATE;
        END;
        RESET ROLE;
        res := res || jsonb_build_array(jsonb_build_object(
          'code','T16 ' || v_rpc || ' / ' || r.rotulo,
          'desc','Execucao real da RPC deve ser negada',
          'ident', COALESCE(r.uid,'anon'),
          'exp','BLOQUEADO','got', v_txt,'pass', v_txt LIKE 'BLOQUEADO:%'));
      END LOOP;
    END LOOP;

    SELECT approval_status, approval_notes INTO v_status_depois, v_notes_depois
      FROM public.partner_order_payment_terms WHERE id = t_a;
    res := res || jsonb_build_array(jsonb_build_object(
      'code','T16-efeito','desc','Nenhum efeito colateral nas condicoes apos as 12 tentativas',
      'ident','n/a','exp', COALESCE(v_status_antes,'<null>') || '|sem_nota',
      'got', COALESCE(v_status_depois,'<null>') || '|' || CASE WHEN COALESCE(v_notes_depois,'')='' THEN 'sem_nota' ELSE 'NOTA_CRIADA' END,
      'pass', (v_status_depois IS NOT DISTINCT FROM v_status_antes) AND COALESCE(v_notes_depois,'') = ''));

    RAISE EXCEPTION 'FASE02_HARNESS_ROLLBACK' USING ERRCODE = 'P0001';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'FASE02_HARNESS_ROLLBACK' THEN
        res := res || jsonb_build_array(jsonb_build_object(
          'code','FATAL','desc',SQLERRM,'ident','n/a','exp','sem erro','got',SQLERRM,'pass',false));
      END IF;
    WHEN OTHERS THEN
      res := res || jsonb_build_array(jsonb_build_object(
        'code','FATAL','desc',SQLERRM,'ident','n/a','exp','sem erro','got',SQLSTATE||' '||SQLERRM,'pass',false));
  END;  -- ===== fixtures revertidas aqui =====

  -- ================= T17/T18: ACLs (sem fixtures) =================
  SELECT count(*)::int INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('approve_b2b_payment_terms_secure','reject_b2b_payment_terms_secure',
        'request_b2b_payment_terms_adjustment_secure','add_b2b_payment_terms_note_secure')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  res := res || jsonb_build_array(jsonb_build_object('code','T17','desc','anon nao executa as 4 RPCs sensiveis',
    'ident','anon','exp','0','got',v_cnt::text,'pass',v_cnt=0));

  SELECT count(*)::int INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('approve_b2b_payment_terms_secure','reject_b2b_payment_terms_secure',
        'request_b2b_payment_terms_adjustment_secure','add_b2b_payment_terms_note_secure')
     AND array_to_string(COALESCE(p.proacl,'{}')::text[],' ') LIKE '%=X/%';
  res := res || jsonb_build_array(jsonb_build_object('code','T18','desc','PUBLIC nao possui EXECUTE nas 4 RPCs',
    'ident','PUBLIC','exp','0','got',v_cnt::text,'pass',v_cnt=0));

  -- T18b: anon sem privilegios nas tabelas B2B sensiveis
  SELECT count(*)::int INTO v_cnt
  FROM (VALUES ('partner_orders'),('partner_order_items'),('partner_users'),
               ('partner_order_payment_terms'),('partner_order_payment_schedule')) t(rel)
  WHERE has_table_privilege('anon', ('public.'||t.rel)::regclass, 'SELECT')
     OR has_table_privilege('anon', ('public.'||t.rel)::regclass, 'INSERT')
     OR has_table_privilege('anon', ('public.'||t.rel)::regclass, 'UPDATE')
     OR has_table_privilege('anon', ('public.'||t.rel)::regclass, 'DELETE');
  res := res || jsonb_build_array(jsonb_build_object('code','T18b','desc','anon sem privilegios nas 5 tabelas B2B',
    'ident','anon','exp','0','got',v_cnt::text,'pass',v_cnt=0));

  -- ================= T19: checksums das 17 RPCs =================
  SELECT count(*)::int INTO v_cnt
  FROM public._motor_b2b_pre_phase1_snapshot s
  JOIN pg_proc p ON p.pronamespace='public'::regnamespace AND p.proname=s.proname
   AND pg_get_function_identity_arguments(p.oid)=s.identity_args
  WHERE md5(pg_get_functiondef(p.oid)) <> s.checksum_md5;
  res := res || jsonb_build_array(jsonb_build_object('code','T19','desc','Checksums das 17 RPCs iguais ao snapshot Fase 0.1',
    'ident','n/a','exp','0','got',v_cnt::text,'pass',v_cnt=0));

  INSERT INTO public._motor_b2b_fase0_2_evidence (test_code, descricao, identidade, esperado, obtido, passou)
  SELECT e->>'code', e->>'desc', e->>'ident', e->>'exp', e->>'got', (e->>'pass')::boolean
  FROM jsonb_array_elements(res) e;

  SELECT count(*)::int INTO v_fail FROM public._motor_b2b_fase0_2_evidence WHERE NOT passou;
  RAISE NOTICE 'FASE02 HARNESS: % teste(s) com falha', v_fail;
END $main$;

SELECT test_code, esperado, obtido, passou FROM public._motor_b2b_fase0_2_evidence ORDER BY id;

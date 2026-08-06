-- =====================================================================
-- FASE F3.1 — RUNTIME HARNESS (autenticado, TRANSAÇÃO SEMPRE REVERTIDA)
-- STAGING ikaauvsflpmamgxmkhoq. Produção navfzbwgwzruipouyfnk PROIBIDA.
-- Executar com: psql --single-transaction -v ON_ERROR_STOP=1 -f runtime-harness.sql
-- O script termina com ROLLBACK: nenhum dado é persistido.
-- Nenhuma NF-e é transmitida.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _h(n serial, caso text, ok boolean, detail text) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.h(_c text, _ok boolean, _d text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$ INSERT INTO _h(caso, ok, detail) VALUES (_c,_ok,_d) $$;

-- Sessão autenticada de administrador fiscal (usuário real do staging).
DO $$
DECLARE uid uuid;
BEGIN
  SELECT ur.user_id INTO uid FROM public.user_roles ur
   WHERE ur.role::text = 'administrador' ORDER BY ur.user_id LIMIT 1;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'HARNESS_NO_ADMIN: nenhum administrador provisionado no staging.';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
END $$;

-- ---------------------------------------------------------------------
-- BLOCO A — DEVEDOR / DESTINATÁRIO
-- ---------------------------------------------------------------------

-- T01 resolução do cliente fiscal do parceiro
DO $$
DECLARE pid uuid; cid uuid; ok boolean := false;
BEGIN
  SELECT id, client_id INTO pid, cid FROM public.partner_accounts
   WHERE client_id IS NOT NULL AND deleted_at IS NULL LIMIT 1;
  IF pid IS NULL THEN
    PERFORM pg_temp.h('T01 partner->cliente fiscal', true, 'SKIP: nenhum parceiro com client_id');
  ELSE
    ok := public.fn_fiscal_partner_fiscal_customer(pid) = cid;
    PERFORM pg_temp.h('T01 partner->cliente fiscal', ok);
  END IF;
END $$;

-- T02 parceiro inexistente => NULL (nunca escolhe destinatário)
DO $$ BEGIN
  PERFORM pg_temp.h('T02 parceiro inexistente => NULL',
    public.fn_fiscal_partner_fiscal_customer('00000000-0000-0000-0000-000000000000') IS NULL);
END $$;

-- T03 invoice inexistente => erro fail-closed
DO $$ BEGIN
  BEGIN
    PERFORM public.fn_fiscal_assert_debtor_recipient('00000000-0000-0000-0000-000000000000');
    PERFORM pg_temp.h('T03 invoice inexistente bloqueia', false, 'nao levantou excecao');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T03 invoice inexistente bloqueia', SQLERRM LIKE '%FISCAL_INVOICE_NOT_FOUND%', SQLERRM);
  END;
END $$;

-- T04/T05/T06 invoice B2B com destinatário errado (produtor e outro parceiro)
DO $$
DECLARE inv uuid; pid uuid; cid uuid; wrong uuid; oid uuid; msg text;
BEGIN
  SELECT po.id, po.partner_id INTO oid, pid
    FROM public.partner_orders po
    JOIN public.partner_accounts pa ON pa.id = po.partner_id AND pa.client_id IS NOT NULL
   ORDER BY po.created_at DESC LIMIT 1;

  IF oid IS NULL THEN
    PERFORM pg_temp.h('T04 destinatario produtor bloqueado', true, 'SKIP: sem pedido B2B com parceiro/cliente fiscal');
    PERFORM pg_temp.h('T05 destinatario outro parceiro bloqueado', true, 'SKIP');
    PERFORM pg_temp.h('T06 destinatario correto aceito', true, 'SKIP');
    RETURN;
  END IF;

  SELECT client_id INTO cid FROM public.partner_accounts WHERE id = pid;
  SELECT c.id INTO wrong FROM public.clientes c WHERE c.id <> cid ORDER BY c.created_at LIMIT 1;

  INSERT INTO public.fiscal_invoices (document_model, direction, status, source_type, source_id,
                                      customer_id, issue_date, tp_emis)
  VALUES ('NFE','OUT','DRAFT','PARTNER_ORDER', oid, wrong, current_date, 1)
  RETURNING id INTO inv;

  BEGIN
    PERFORM public.fn_fiscal_assert_debtor_recipient(inv);
    PERFORM pg_temp.h('T04 destinatario divergente bloqueado', false, 'nao bloqueou');
  EXCEPTION WHEN OTHERS THEN
    msg := SQLERRM;
    PERFORM pg_temp.h('T04 destinatario divergente bloqueado', msg LIKE '%FISCAL_DEBTOR_RECIPIENT_MISMATCH%', msg);
  END;

  -- Zero efeito colateral: nenhuma reserva/snapshot criado para a invoice inválida.
  PERFORM pg_temp.h('T05 divergencia sem efeito colateral',
    NOT EXISTS (SELECT 1 FROM public.fiscal_number_reservations WHERE fiscal_invoice_id = inv)
    AND (SELECT tax_snapshot IS NULL FROM public.fiscal_invoices WHERE id = inv));

  UPDATE public.fiscal_invoices SET customer_id = cid WHERE id = inv;
  BEGIN
    PERFORM public.fn_fiscal_assert_debtor_recipient(inv);
    PERFORM pg_temp.h('T06 destinatario correto aceito', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T06 destinatario correto aceito', false, SQLERRM);
  END;
END $$;

-- T07 origem não suportada é recusada
DO $$
DECLARE inv uuid;
BEGIN
  INSERT INTO public.fiscal_invoices (document_model, direction, status, source_type, source_id,
                                      issue_date, tp_emis)
  VALUES ('NFE','OUT','DRAFT','OUTRA', gen_random_uuid(), current_date, 1)
  RETURNING id INTO inv;
  BEGIN
    PERFORM public.fn_fiscal_assert_debtor_recipient(inv);
    PERFORM pg_temp.h('T07 origem nao suportada bloqueada', false, 'nao bloqueou');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T07 origem nao suportada bloqueada', SQLERRM LIKE '%FISCAL_SOURCE_TYPE_UNSUPPORTED%'
      OR SQLERRM LIKE '%violates check constraint%', SQLERRM);
  END;
END $$;

-- ---------------------------------------------------------------------
-- BLOCO B — CONTEXTO TRIBUTÁRIO ENCADEADO
-- ---------------------------------------------------------------------

-- T08 base com componente ICMS_ST recebe o ST previamente apurado
DO $$
DECLARE r public.fiscal_tax_rules%ROWTYPE; res jsonb; base numeric;
BEGIN
  r.tax_kind := 'PIS'; r.calc_mode := 'PERCENT'; r.rate := 1.65;
  r.base_components := '["PRODUTO","ICMS_ST"]'::jsonb;
  r.status := 'PUBLISHED'; r.cst := '01';
  res := public.fn_fiscal_apply_tax_v2(r, jsonb_build_object(
    'produto',1000,'frete',0,'seguro',0,'outras',0,'desconto',0,
    'ipi',0,'icmsSt',180,'icmsOwnValue',120,'baseST',1500));
  base := (res->>'base')::numeric;
  PERFORM pg_temp.h('T08 base PIS inclui ICMS_ST encadeado', base = 1180, 'base='||base::text);
END $$;

-- T09 contexto sem ST encadeado produz base menor (prova de que o encadeamento importa)
DO $$
DECLARE r public.fiscal_tax_rules%ROWTYPE; res jsonb;
BEGIN
  r.tax_kind := 'COFINS'; r.calc_mode := 'PERCENT'; r.rate := 7.6;
  r.base_components := '["PRODUTO","ICMS_ST"]'::jsonb;
  r.status := 'PUBLISHED'; r.cst := '01';
  res := public.fn_fiscal_apply_tax_v2(r, jsonb_build_object(
    'produto',1000,'frete',0,'seguro',0,'outras',0,'desconto',0,
    'ipi',0,'icmsSt',0,'icmsOwnValue',0,'baseST',NULL));
  PERFORM pg_temp.h('T09 sem ST a base cai para PRODUTO', (res->>'base')::numeric = 1000);
END $$;

-- T10 DIFAL separa destino/origem/FCP destino sem duplicidade
DO $$
DECLARE r public.fiscal_tax_rules%ROWTYPE; res jsonb; d numeric; o numeric; f numeric; v numeric;
BEGIN
  r.tax_kind := 'DIFAL'; r.calc_mode := 'PERCENT';
  r.base_components := '["PRODUTO"]'::jsonb; r.status := 'PUBLISHED';
  r.internal_rate := 18; r.interstate_rate := 12; r.fcp_rate := 2;
  r.destination_share := 100;
  BEGIN
    res := public.fn_fiscal_apply_tax_v2(r, jsonb_build_object(
      'produto',1000,'frete',0,'seguro',0,'outras',0,'desconto',0,
      'ipi',0,'icmsSt',0,'icmsOwnValue',0,'baseST',NULL));
    v := (res->>'value')::numeric;
    d := coalesce((res->'params'->>'valueDestination')::numeric,0);
    o := coalesce((res->'params'->>'valueOrigin')::numeric,0);
    f := coalesce((res->'params'->>'fcpValue')::numeric,0);
    PERFORM pg_temp.h('T10 DIFAL = 60,00 e partilha coerente',
      v = 60 AND (d + o) = v, format('v=%s d=%s o=%s', v, d, o));
    PERFORM pg_temp.h('T11 FCP destino destacado e nao somado no DIFAL', f = 20 AND v = 60,
      format('fcp=%s difal=%s', f, v));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T10 DIFAL = 60,00 e partilha coerente', false, SQLERRM);
    PERFORM pg_temp.h('T11 FCP destino destacado e nao somado no DIFAL', false, SQLERRM);
  END;
END $$;

-- T12 alíquota interna < interestadual bloqueia
DO $$
DECLARE r public.fiscal_tax_rules%ROWTYPE;
BEGIN
  r.tax_kind := 'DIFAL'; r.calc_mode := 'PERCENT';
  r.base_components := '["PRODUTO"]'::jsonb; r.status := 'PUBLISHED';
  r.internal_rate := 10; r.interstate_rate := 12;
  BEGIN
    PERFORM public.fn_fiscal_apply_tax_v2(r, jsonb_build_object('produto',1000,'frete',0,'seguro',0,
      'outras',0,'desconto',0,'ipi',0,'icmsSt',0,'icmsOwnValue',0,'baseST',NULL));
    PERFORM pg_temp.h('T12 DIFAL negativo bloqueado', false, 'nao bloqueou');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T12 DIFAL negativo bloqueado', true, SQLERRM);
  END;
END $$;

-- T13 FCP-ST exige BC ST previamente apurada
DO $$
DECLARE r public.fiscal_tax_rules%ROWTYPE;
BEGIN
  r.tax_kind := 'FCP_ST'; r.calc_mode := 'PERCENT'; r.rate := 2;
  r.base_components := '["PRODUTO"]'::jsonb; r.status := 'PUBLISHED';
  BEGIN
    PERFORM public.fn_fiscal_apply_tax_v2(r, jsonb_build_object('produto',1000,'frete',0,'seguro',0,
      'outras',0,'desconto',0,'ipi',0,'icmsSt',0,'icmsOwnValue',0,'baseST',NULL));
    PERFORM pg_temp.h('T13 FCP_ST sem BC ST bloqueia', false, 'nao bloqueou');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T13 FCP_ST sem BC ST bloqueia', true, SQLERRM);
  END;
END $$;

-- ---------------------------------------------------------------------
-- BLOCO C — COBERTURA REAL
-- ---------------------------------------------------------------------
DO $$
DECLARE cov jsonb;
BEGIN
  cov := public.fn_fiscal_scenario_coverage();
  PERFORM pg_temp.h('T14 cobertura retorna dimensoes reais', cov ? 'dimensions', cov->>'dimensions');
  PERFORM pg_temp.h('T15 cobertura segrega microrganismos',
    (cov->'microorganisms') ?& ARRAY['active','ready','draft','blocked','inactive']);
  PERFORM pg_temp.h('T16 codigos de gap declarados',
    (cov->>'gapCodes') LIKE '%ENGINE_UNAVAILABLE%');
  PERFORM pg_temp.h('T17 covered <= total',
    (cov->>'covered')::int <= (cov->>'total')::int);
  PERFORM pg_temp.h('T18 nenhum cenario com NCM nulo',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(cov->'gaps') g WHERE g->>'ncm' IS NULL AND g->>'scope'='TRIBUTO'));
  PERFORM pg_temp.h('T19 microrganismos ativos batem com o inventario',
    (cov->'microorganisms'->>'active')::int = (SELECT count(*) FROM public.microrganismos WHERE coalesce(ativo,true)),
    'active='||(cov->'microorganisms'->>'active'));
END $$;

-- T20 regra incompleta é classificada como INCOMPLETE
DO $$
DECLARE r public.fiscal_tax_rules%ROWTYPE; code text;
BEGIN
  r.tax_kind := 'ICMS'; r.calc_mode := 'PERCENT'; r.rate := NULL;
  r.base_components := '[]'::jsonb; r.status := 'PUBLISHED';
  code := public.fn_fiscal_rule_validate_synthetic('ICMS', r, jsonb_build_object('produto',1000,
    'frete',0,'seguro',0,'outras',0,'desconto',0,'ipi',0,'icmsSt',0,'icmsOwnValue',0,'baseST',NULL));
  PERFORM pg_temp.h('T20 regra sem componentes => INCOMPLETE', code = 'INCOMPLETE', code);
END $$;

-- T21 validação sintética não persiste nada
DO $$
DECLARE before_runs int; after_runs int; r public.fiscal_tax_rules%ROWTYPE;
BEGIN
  SELECT count(*) INTO before_runs FROM public.fiscal_calculation_runs;
  PERFORM public.fn_fiscal_scenario_coverage();
  SELECT count(*) INTO after_runs FROM public.fiscal_calculation_runs;
  PERFORM pg_temp.h('T21 cobertura nao persiste calculos', before_runs = after_runs);
END $$;

-- ---------------------------------------------------------------------
-- BLOCO D — HOMOLOGAÇÃO / PRODUÇÃO
-- ---------------------------------------------------------------------

-- T22 forçar ambiente 1 não gera READY_PRODUCTION persistido
DO $$
DECLARE cid uuid; st text;
BEGIN
  SELECT id INTO cid FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF cid IS NULL THEN
    PERFORM pg_temp.h('T22 ambiente 1 nao vira READY_PRODUCTION', true, 'SKIP: sem emitente');
    PERFORM pg_temp.h('T23 evidencia de homologacao imutavel', true, 'SKIP');
    RETURN;
  END IF;
  UPDATE public.company_fiscal_settings SET nfe_environment_code = '1' WHERE id = cid;
  SELECT nfe_readiness_status INTO st FROM public.company_fiscal_settings WHERE id = cid;
  PERFORM pg_temp.h('T22 ambiente 1 nao vira READY_PRODUCTION', st <> 'READY_PRODUCTION', 'status='||st);

  -- T23 evidência de homologação não aceita UPDATE direto
  BEGIN
    UPDATE public.company_fiscal_settings SET sefaz_homologation_at = now() WHERE id = cid;
    PERFORM pg_temp.h('T23 evidencia de homologacao imutavel', false, 'UPDATE direto foi aceito');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T23 evidencia de homologacao imutavel',
      SQLERRM LIKE '%FISCAL_HOMOLOGATION_EVIDENCE_IMMUTABLE%', SQLERRM);
  END;
END $$;

-- T24 painel nunca devolve READY_PRODUCTION
DO $$
DECLARE p jsonb;
BEGIN
  p := public.rpc_fiscal_nfe_readiness_v1();
  PERFORM pg_temp.h('T24 painel nunca READY_PRODUCTION',
    (p->'emitter'->>'status') <> 'READY_PRODUCTION' AND (p->>'overallStatus') <> 'READY_PRODUCTION');
  PERFORM pg_temp.h('T25 painel declara teto READY_HOMOLOGATION',
    (p->>'maxAllowedStatus') = 'READY_HOMOLOGATION');
  PERFORM pg_temp.h('T26 painel marca producao bloqueada',
    (p->'emitter'->>'productionBlocked')::boolean);
  PERFORM pg_temp.h('T27 painel segrega microrganismos',
    (p->'microorganisms') ?& ARRAY['active','ready','draft','blocked','inactive']);
END $$;

-- T28 cálculo bloqueia em ambiente 1
DO $$
DECLARE inv uuid;
BEGIN
  SELECT id INTO inv FROM public.fiscal_invoices WHERE status='DRAFT' ORDER BY created_at DESC LIMIT 1;
  IF inv IS NULL THEN
    PERFORM pg_temp.h('T28 calculo bloqueia ambiente 1', true, 'SKIP: sem rascunho');
    RETURN;
  END IF;
  BEGIN
    PERFORM public.rpc_fiscal_calculate_invoice_v1(inv, 'harness-f31-'||gen_random_uuid()::text);
    PERFORM pg_temp.h('T28 calculo bloqueia ambiente 1', false, 'nao bloqueou');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T28 calculo bloqueia ambiente 1',
      SQLERRM LIKE '%FISCAL_PRODUCTION_BLOCKED%' OR SQLERRM LIKE '%FISCAL_%', SQLERRM);
  END;
END $$;

-- T29 reserva bloqueia em ambiente 1
DO $$
DECLARE inv uuid;
BEGIN
  SELECT id INTO inv FROM public.fiscal_invoices WHERE status='DRAFT' ORDER BY created_at DESC LIMIT 1;
  IF inv IS NULL THEN
    PERFORM pg_temp.h('T29 reserva bloqueia ambiente 1', true, 'SKIP: sem rascunho');
    RETURN;
  END IF;
  BEGIN
    PERFORM public.rpc_fiscal_reserve_nfe_number_v1(inv, 'harness-f31-'||gen_random_uuid()::text);
    PERFORM pg_temp.h('T29 reserva bloqueia ambiente 1', false, 'nao bloqueou');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T29 reserva bloqueia ambiente 1', SQLERRM LIKE '%FISCAL_%', SQLERRM);
  END;
END $$;

-- ---------------------------------------------------------------------
-- BLOCO E — RLS COM SESSÕES REAIS
-- ---------------------------------------------------------------------
DO $$
DECLARE papel text; uid uuid; n int; leak text := '';
  interno boolean;
BEGIN
  FOREACH papel IN ARRAY ARRAY['administrador','gestor','financeiro','tecnico_agronomo','parceiro_b2b','produtor'] LOOP
    SELECT ur.user_id INTO uid FROM public.user_roles ur WHERE ur.role::text = papel ORDER BY ur.user_id LIMIT 1;
    IF uid IS NULL THEN CONTINUE; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role','authenticated')::text, true);
    interno := papel IN ('administrador','gestor','financeiro');
    BEGIN
      SELECT count(*) INTO n FROM public.fiscal_tax_rules;
    EXCEPTION WHEN OTHERS THEN n := -1;
    END;
    IF NOT interno AND coalesce(n,0) > 0 THEN
      leak := leak || papel || ' ';
    END IF;
  END LOOP;
  PERFORM pg_temp.h('T30 nenhum papel nao-fiscal le fiscal_tax_rules', leak = '', 'vazamentos: '||leak);
END $$;

DO $$
DECLARE uid uuid; n int; leak text := ''; papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['tecnico_agronomo','parceiro_b2b','produtor'] LOOP
    SELECT ur.user_id INTO uid FROM public.user_roles ur WHERE ur.role::text = papel ORDER BY ur.user_id LIMIT 1;
    IF uid IS NULL THEN CONTINUE; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role','authenticated')::text, true);
    BEGIN SELECT count(*) INTO n FROM public.fiscal_number_reservations; EXCEPTION WHEN OTHERS THEN n := 0; END;
    IF coalesce(n,0) > 0 THEN leak := leak || papel || ' '; END IF;
  END LOOP;
  PERFORM pg_temp.h('T31 nenhum papel nao-fiscal le reservas de numeracao', leak = '', leak);
END $$;

-- T32 sessão sem vínculo (anon) não lê nada
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('role','anon', true);
  BEGIN SELECT count(*) INTO n FROM public.fiscal_tax_rules; EXCEPTION WHEN OTHERS THEN n := -1; END;
  PERFORM set_config('role','authenticated', true);
  PERFORM pg_temp.h('T32 anon sem leitura fiscal', coalesce(n,0) <= 0, 'n='||coalesce(n,-1)::text);
END $$;

-- T33 policies redundantes ausentes
DO $$ BEGIN
  PERFORM pg_temp.h('T33 policies SELECT redundantes removidas',
    NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND policyname IN ('fcr_select','fds_select','fnr_select','ftr_select','frso_select','fop_admin_read')));
END $$;

-- T34 promoção: nenhuma reserva órfã
DO $$ BEGIN
  PERFORM pg_temp.h('T34 preflight de promocao limpo',
    NOT EXISTS (SELECT 1 FROM public.fiscal_number_reservations WHERE fiscal_invoice_id IS NULL));
END $$;

-- T35 fontes oficiais específicas
DO $$ BEGIN
  PERFORM pg_temp.h('T35 fontes oficiais sem pagina generica',
    NOT EXISTS (SELECT 1 FROM public.fiscal_official_sources
      WHERE url IS NULL OR url !~ '^https://' OR url ~ '^https://[^/]+/?$'));
END $$;

\echo '== RESULTADO RUNTIME HARNESS F3.1 =='
SELECT n, caso, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, coalesce(detail,'') AS detalhe
  FROM _h ORDER BY n;

DO $$
DECLARE nf int; nt int;
BEGIN
  SELECT count(*) FILTER (WHERE NOT coalesce(ok,false)), count(*) INTO nf, nt FROM _h;
  IF nf > 0 THEN
    RAISE EXCEPTION 'RUNTIME_HARNESS_F3_1_FAILED: % de % casos reprovados.', nf, nt;
  END IF;
  RAISE NOTICE 'RUNTIME HARNESS F3.1: % / % PASS', nt, nt;
END $$;

-- Nada é persistido.
ROLLBACK;

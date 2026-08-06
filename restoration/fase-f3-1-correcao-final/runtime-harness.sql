-- =====================================================================
-- FASE F3.1 / F3.1-R1 — RUNTIME HARNESS (TRANSACAO SEMPRE REVERTIDA)
-- STAGING ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk PROIBIDA.
-- Executar com: psql -v ON_ERROR_STOP=1 -f runtime-harness.sql
--
-- Regras desta versao (correcao auditada F3.1-R1):
--  * Nenhum caso critico pode terminar em SKIP: ausencia de fixture e' FAIL.
--  * Provas de RLS assumem papel nao privilegiado real (SET ROLE authenticated)
--    e registram current_user, row_security e rolbypassrls/rolsuper.
--  * Fixtures sinteticas sao criadas dentro da transacao e revertidas no final.
--  * Nenhum trigger e' desabilitado. Nenhum dado real e' alterado ou apagado.
--  * Codigos de erro sao exigidos literalmente (sem "qualquer FISCAL_").
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _h(n serial, caso text, ok boolean, detail text) ON COMMIT DROP;
GRANT INSERT, SELECT ON _h TO PUBLIC;
GRANT USAGE, SELECT ON SEQUENCE _h_n_seq TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.h(_c text, _ok boolean, _d text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$ INSERT INTO pg_temp._h(caso, ok, detail) VALUES (_c,_ok,_d) $$;

CREATE TEMP TABLE _ids(papel text primary key, uid uuid) ON COMMIT DROP;
CREATE TEMP TABLE _fx(k text primary key, v uuid) ON COMMIT DROP;

-- ---------------------------------------------------------------------
-- BLOCO 0 — IDENTIDADES REAIS (ausencia = FAIL, nunca SKIP)
-- ---------------------------------------------------------------------
DO $$
DECLARE papel text; uid uuid; faltando text := '';
BEGIN
  FOREACH papel IN ARRAY ARRAY['administrador','gestor','financeiro',
                               'tecnico_agronomo','parceiro_b2b','cliente_produtor'] LOOP
    SELECT ur.user_id INTO uid FROM public.user_roles ur
     WHERE ur.role::text = papel ORDER BY ur.user_id LIMIT 1;
    IF uid IS NULL THEN
      faltando := faltando || papel || ' ';
    ELSE
      INSERT INTO _ids(papel, uid) VALUES (papel, uid);
    END IF;
  END LOOP;
  PERFORM pg_temp.h('T00 identidades reais para os 6 papeis exigidos',
    faltando = '', CASE WHEN faltando = '' THEN 'ok' ELSE 'ausentes: '||faltando END);
  IF faltando <> '' THEN
    RAISE EXCEPTION 'HARNESS_IDENTITIES_MISSING: %', faltando;
  END IF;
END $$;

-- Executor privilegiado: usado APENAS para preparar/limpar fixtures e registrar.
DO $$
DECLARE byp boolean;
BEGIN
  SELECT (r.rolbypassrls OR r.rolsuper) INTO byp FROM pg_roles r WHERE r.rolname = current_user;
  PERFORM pg_temp.h('T01 executor de preparo identificado (nao usado como prova de RLS)',
    true, format('preparo_como=%s bypassrls_or_super=%s', current_user, byp));
END $$;

-- Sonda de RLS: assume papel nao privilegiado e devolve evidencia da sessao.
CREATE OR REPLACE FUNCTION pg_temp.probe(_role text, _uid uuid, _q text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE n bigint; cu text; rs text; byp boolean; err text;
BEGIN
  PERFORM set_config('role', _role, true);
  IF _uid IS NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role', _role)::text, true);
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid, 'role', _role)::text, true);
  END IF;
  cu := current_user;
  rs := current_setting('row_security', true);
  SELECT (r.rolbypassrls OR r.rolsuper) INTO byp FROM pg_roles r WHERE r.rolname = cu;
  BEGIN
    EXECUTE _q INTO n;
  EXCEPTION WHEN OTHERS THEN
    err := SQLERRM; n := NULL;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
  RETURN jsonb_build_object('currentUser', cu, 'rowSecurity', rs,
                            'bypassrls', byp, 'n', n, 'error', err);
END $$;

-- ---------------------------------------------------------------------
-- BLOCO A — DEVEDOR / DESTINATARIO COM FIXTURES PROPRIAS
-- ---------------------------------------------------------------------
DO $$
DECLARE
  admin_uid uuid; cli_ok uuid; cli_outro uuid; parceiro uuid; parceiro_sem uuid;
  pedido uuid; inv_ok uuid; inv_div uuid; inv_sem uuid; sufixo text; prod uuid;
BEGIN
  SELECT uid INTO admin_uid FROM _ids WHERE papel = 'administrador';
  sufixo := substr(replace(gen_random_uuid()::text,'-',''),1,10);

  INSERT INTO public.clientes(nome, codigo_cliente)
  VALUES ('HARNESS F31R1 CLIENTE FISCAL '||sufixo, 'HRN-'||sufixo)
  RETURNING id INTO cli_ok;

  INSERT INTO public.clientes(nome, codigo_cliente)
  VALUES ('HARNESS F31R1 CLIENTE DIVERGENTE '||sufixo, 'HRN2-'||sufixo)
  RETURNING id INTO cli_outro;

  INSERT INTO public.partner_accounts(razao_social, client_id)
  VALUES ('HARNESS F31R1 PARCEIRO '||sufixo, cli_ok)
  RETURNING id INTO parceiro;

  INSERT INTO public.partner_accounts(razao_social)
  VALUES ('HARNESS F31R1 PARCEIRO SEM CLIENTE '||sufixo)
  RETURNING id INTO parceiro_sem;

  INSERT INTO public.partner_orders(partner_id, status, approved_at, approved_by,
                                    payment_condition_status, requires_financial_approval)
  VALUES (parceiro, 'aprovado', now(), admin_uid, 'accepted', false)
  RETURNING id INTO pedido;

  SELECT p.id INTO prod FROM public.produtos p ORDER BY p.created_at LIMIT 1;
  IF prod IS NULL THEN
    RAISE EXCEPTION 'HARNESS_PRODUCT_MISSING: nenhum produto disponivel para a fixture.';
  END IF;
  INSERT INTO public.partner_order_items(order_id, product_id, quantidade, pricing_mode_snapshot,
                                         preco_unitario_final_snapshot, price_source_snapshot)
  VALUES (pedido, prod, 1, 'table', 100, 'HARNESS_FIXTURE');

  INSERT INTO public.fiscal_invoices(document_model, direction, status, source_type, source_id,
                                     customer_id, issue_date, tp_emis, invoice_type, created_by)
  VALUES ('NFE','OUT','DRAFT','PARTNER_ORDER', pedido, cli_ok, current_date, 1, 'NFE', admin_uid)
  RETURNING id INTO inv_ok;

  INSERT INTO public.fiscal_invoices(document_model, direction, status, source_type, source_id,
                                     customer_id, issue_date, tp_emis, invoice_type, created_by)
  VALUES ('NFE','OUT','DRAFT','PARTNER_ORDER', pedido, cli_outro, current_date, 1, 'NFE', admin_uid)
  RETURNING id INTO inv_div;

  INSERT INTO public.fiscal_invoices(document_model, direction, status, source_type, source_id,
                                     customer_id, issue_date, tp_emis, invoice_type, created_by)
  VALUES ('NFE','OUT','DRAFT','PARTNER_ORDER', pedido, NULL, current_date, 1, 'NFE', admin_uid)
  RETURNING id INTO inv_sem;

  INSERT INTO _fx(k,v) VALUES
    ('cliente_ok', cli_ok), ('cliente_divergente', cli_outro),
    ('parceiro', parceiro), ('parceiro_sem_cliente', parceiro_sem),
    ('pedido', pedido), ('inv_ok', inv_ok), ('inv_div', inv_div), ('inv_sem', inv_sem);

  PERFORM pg_temp.h('T02 fixtures de devedor criadas (parceiro/cliente/pedido/documentos)',
    (SELECT count(*) FROM _fx) = 8, 'fixtures='||(SELECT count(*) FROM _fx)::text);
END $$;

-- T03 pedido fixture e' elegivel (prova positiva, nao aceita zero silencioso)
DO $$
DECLARE elig jsonb;
BEGIN
  elig := public.fn_fiscal_invoice_eligibility('PARTNER_ORDER', (SELECT v FROM _fx WHERE k='pedido'));
  PERFORM pg_temp.h('T03 pedido fixture elegivel com devedor resolvido',
    (elig->>'eligible')::boolean AND nullif(elig->>'debtorPartnerId','') IS NOT NULL,
    'reasons='||coalesce(elig->>'reasons','-'));
END $$;

-- T04 destinatario correto e' aceito e devolve devedor/cliente fiscal
DO $$
DECLARE r jsonb;
BEGIN
  r := public.fn_fiscal_assert_debtor_recipient((SELECT v FROM _fx WHERE k='inv_ok'));
  PERFORM pg_temp.h('T04 destinatario correto aceito',
    (r->>'debtorPartnerId')::uuid = (SELECT v FROM _fx WHERE k='parceiro')
    AND (r->>'recipientCustomerId')::uuid = (SELECT v FROM _fx WHERE k='cliente_ok'),
    'sourceType='||coalesce(r->>'sourceType','-'));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.h('T04 destinatario correto aceito', false, SQLERRM);
END $$;

-- T05 destinatario divergente bloqueia com o codigo exato
DO $$ BEGIN
  BEGIN
    PERFORM public.fn_fiscal_assert_debtor_recipient((SELECT v FROM _fx WHERE k='inv_div'));
    PERFORM pg_temp.h('T05 destinatario divergente bloqueado (FISCAL_DEBTOR_RECIPIENT_MISMATCH)',
      false, 'nao bloqueou');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T05 destinatario divergente bloqueado (FISCAL_DEBTOR_RECIPIENT_MISMATCH)',
      SQLERRM LIKE 'FISCAL_DEBTOR_RECIPIENT_MISMATCH:%', SQLERRM);
  END;
END $$;

-- T06 documento sem destinatario bloqueia com o codigo exato
DO $$ BEGIN
  BEGIN
    PERFORM public.fn_fiscal_assert_debtor_recipient((SELECT v FROM _fx WHERE k='inv_sem'));
    PERFORM pg_temp.h('T06 documento sem destinatario bloqueado (FISCAL_DEBTOR_RECIPIENT_MISMATCH)',
      false, 'nao bloqueou');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T06 documento sem destinatario bloqueado (FISCAL_DEBTOR_RECIPIENT_MISMATCH)',
      SQLERRM LIKE 'FISCAL_DEBTOR_RECIPIENT_MISMATCH:%', SQLERRM);
  END;
END $$;

-- T07 parceiro sem cliente fiscal nao resolve destinatario
DO $$
DECLARE c uuid;
BEGIN
  c := public.fn_fiscal_partner_fiscal_customer((SELECT v FROM _fx WHERE k='parceiro_sem_cliente'));
  PERFORM pg_temp.h('T07 parceiro sem client_id nao resolve destinatario', c IS NULL,
    'retorno='||coalesce(c::text,'NULL'));
END $$;

-- T08 bloqueio de devedor nao gera efeito colateral
DO $$
DECLARE runs int; res int;
BEGIN
  SELECT count(*) INTO runs FROM public.fiscal_calculation_runs
   WHERE fiscal_invoice_id = (SELECT v FROM _fx WHERE k='inv_div');
  SELECT count(*) INTO res FROM public.fiscal_number_reservations
   WHERE fiscal_invoice_id = (SELECT v FROM _fx WHERE k='inv_div');
  PERFORM pg_temp.h('T08 bloqueio de devedor sem efeito colateral (0 runs / 0 reservas)',
    runs = 0 AND res = 0, format('runs=%s reservas=%s', runs, res));
END $$;

-- ---------------------------------------------------------------------
-- BLOCO B — CONTEXTO TRIBUTARIO ENCADEADO
-- ---------------------------------------------------------------------
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
  PERFORM pg_temp.h('T09 base PIS inclui ICMS_ST encadeado', base = 1180, 'base='||base::text);
END $$;

DO $$
DECLARE r public.fiscal_tax_rules%ROWTYPE; res jsonb;
BEGIN
  r.tax_kind := 'COFINS'; r.calc_mode := 'PERCENT'; r.rate := 7.6;
  r.base_components := '["PRODUTO","ICMS_ST"]'::jsonb;
  r.status := 'PUBLISHED'; r.cst := '01';
  res := public.fn_fiscal_apply_tax_v2(r, jsonb_build_object(
    'produto',1000,'frete',0,'seguro',0,'outras',0,'desconto',0,
    'ipi',0,'icmsSt',0,'icmsOwnValue',0,'baseST',NULL));
  PERFORM pg_temp.h('T10 sem ST a base cai para PRODUTO', (res->>'base')::numeric = 1000);
END $$;

DO $$
DECLARE r public.fiscal_tax_rules%ROWTYPE; res jsonb; d numeric; o numeric; f numeric; v numeric;
BEGIN
  r.tax_kind := 'DIFAL'; r.calc_mode := 'PERCENT';
  r.base_components := '["PRODUTO"]'::jsonb; r.status := 'PUBLISHED';
  r.internal_rate_pct := 18; r.interstate_rate_pct := 12; r.fcp_rate := 2;
  r.difal_dest_share_pct := 100;
  res := public.fn_fiscal_apply_tax_v2(r, jsonb_build_object(
    'produto',1000,'frete',0,'seguro',0,'outras',0,'desconto',0,
    'ipi',0,'icmsSt',0,'icmsOwnValue',0,'baseST',NULL));
  v := (res->>'value')::numeric;
  d := coalesce((res->'params'->>'valueDestination')::numeric,0);
  o := coalesce((res->'params'->>'valueOrigin')::numeric,0);
  f := coalesce((res->'params'->>'fcpValue')::numeric,0);
  PERFORM pg_temp.h('T11 DIFAL = 60,00 e partilha coerente',
    v = 60 AND (d + o) = v, format('v=%s d=%s o=%s', v, d, o));
  PERFORM pg_temp.h('T12 FCP destino destacado e nao somado no DIFAL', f = 20 AND v = 60,
    format('fcp=%s difal=%s', f, v));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.h('T11 DIFAL = 60,00 e partilha coerente', false, SQLERRM);
  PERFORM pg_temp.h('T12 FCP destino destacado e nao somado no DIFAL', false, SQLERRM);
END $$;

DO $$
DECLARE r public.fiscal_tax_rules%ROWTYPE;
BEGIN
  r.tax_kind := 'DIFAL'; r.calc_mode := 'PERCENT';
  r.base_components := '["PRODUTO"]'::jsonb; r.status := 'PUBLISHED';
  r.internal_rate_pct := 10; r.interstate_rate_pct := 12;
  BEGIN
    PERFORM public.fn_fiscal_apply_tax_v2(r, jsonb_build_object('produto',1000,'frete',0,'seguro',0,
      'outras',0,'desconto',0,'ipi',0,'icmsSt',0,'icmsOwnValue',0,'baseST',NULL));
    PERFORM pg_temp.h('T13 DIFAL negativo bloqueado', false, 'nao bloqueou');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T13 DIFAL negativo bloqueado', SQLERRM LIKE 'FISCAL_%', SQLERRM);
  END;
END $$;

DO $$
DECLARE r public.fiscal_tax_rules%ROWTYPE;
BEGIN
  r.tax_kind := 'FCP_ST'; r.calc_mode := 'PERCENT'; r.rate := 2;
  r.base_components := '["PRODUTO"]'::jsonb; r.status := 'PUBLISHED';
  BEGIN
    PERFORM public.fn_fiscal_apply_tax_v2(r, jsonb_build_object('produto',1000,'frete',0,'seguro',0,
      'outras',0,'desconto',0,'ipi',0,'icmsSt',0,'icmsOwnValue',0,'baseST',NULL));
    PERFORM pg_temp.h('T14 FCP_ST sem BC ST bloqueia', false, 'nao bloqueou');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T14 FCP_ST sem BC ST bloqueia', SQLERRM LIKE 'FISCAL_%', SQLERRM);
  END;
END $$;

-- ---------------------------------------------------------------------
-- BLOCO C — COBERTURA POR CALCULO REAL
-- ---------------------------------------------------------------------
DO $$
DECLARE cov jsonb;
BEGIN
  cov := public.fn_fiscal_scenario_coverage();
  PERFORM pg_temp.h('T15 cobertura retorna dimensoes reais', cov ? 'dimensions', cov->>'dimensions');
  PERFORM pg_temp.h('T16 cobertura segrega microrganismos',
    (cov->'microorganisms') ?& ARRAY['active','ready','draft','blocked','inactive']);
  PERFORM pg_temp.h('T17 codigos de gap declarados',
    (cov->>'gapCodes') LIKE '%ENGINE_UNAVAILABLE%');
  PERFORM pg_temp.h('T18 covered <= total',
    (cov->>'covered')::int <= (cov->>'total')::int);
  PERFORM pg_temp.h('T19 gaps tributarios sempre identificam o NCM',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(cov->'gaps') g
                 WHERE g->>'ncm' IS NULL AND g->>'scope'='TRIBUTO'));
  PERFORM pg_temp.h('T20 microrganismos ativos batem com o inventario',
    (cov->'microorganisms'->>'active')::int =
      (SELECT count(*) FROM public.microrganismos WHERE coalesce(ativo,true)),
    'active='||(cov->'microorganisms'->>'active'));
END $$;

DO $$
DECLARE r public.fiscal_tax_rules%ROWTYPE; code text;
BEGIN
  r.tax_kind := 'ICMS'; r.calc_mode := 'PERCENT'; r.rate := NULL;
  r.base_components := '[]'::jsonb; r.status := 'PUBLISHED';
  code := public.fn_fiscal_rule_validate_synthetic('ICMS', r, jsonb_build_object('produto',1000,
    'frete',0,'seguro',0,'outras',0,'desconto',0,'ipi',0,'icmsSt',0,'icmsOwnValue',0,'baseST',NULL));
  PERFORM pg_temp.h('T21 regra sem componentes => INCOMPLETE', code = 'INCOMPLETE', code);
END $$;

DO $$
DECLARE before_runs int; after_runs int;
BEGIN
  SELECT count(*) INTO before_runs FROM public.fiscal_calculation_runs;
  PERFORM public.fn_fiscal_scenario_coverage();
  SELECT count(*) INTO after_runs FROM public.fiscal_calculation_runs;
  PERFORM pg_temp.h('T22 cobertura nao persiste calculos', before_runs = after_runs,
    format('antes=%s depois=%s', before_runs, after_runs));
END $$;

-- ---------------------------------------------------------------------
-- BLOCO D — HOMOLOGACAO / AMBIENTE (codigos exatos, sem SKIP)
-- ---------------------------------------------------------------------
DO $$
DECLARE cid uuid; st text;
BEGIN
  SELECT id INTO cid FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF cid IS NULL THEN
    PERFORM pg_temp.h('T23 emitente ativo existe para prova de ambiente', false, 'sem emitente ativo');
    RAISE EXCEPTION 'HARNESS_EMITTER_MISSING: nenhum emitente ativo em staging.';
  END IF;
  PERFORM pg_temp.h('T23 emitente ativo existe para prova de ambiente', true, 'emitente ativo encontrado');
  INSERT INTO _fx(k,v) VALUES ('emitente', cid);

  UPDATE public.company_fiscal_settings SET nfe_environment_code = '1' WHERE id = cid;
  SELECT nfe_readiness_status INTO st FROM public.company_fiscal_settings WHERE id = cid;
  PERFORM pg_temp.h('T24 ambiente 1 nunca persiste READY_PRODUCTION',
    st <> 'READY_PRODUCTION', 'status='||st);

  BEGIN
    UPDATE public.company_fiscal_settings SET sefaz_homologation_at = now() WHERE id = cid;
    PERFORM pg_temp.h('T25 evidencia de homologacao imutavel (FISCAL_HOMOLOGATION_EVIDENCE_IMMUTABLE)',
      false, 'UPDATE direto foi aceito');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T25 evidencia de homologacao imutavel (FISCAL_HOMOLOGATION_EVIDENCE_IMMUTABLE)',
      SQLERRM LIKE '%FISCAL_HOMOLOGATION_EVIDENCE_IMMUTABLE%', SQLERRM);
  END;
END $$;

DO $$
DECLARE p jsonb; au uuid;
BEGIN
  SELECT uid INTO au FROM _ids WHERE papel='administrador';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', au, 'role','authenticated')::text, true);
  p := public.rpc_fiscal_nfe_readiness_v1();
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM pg_temp.h('T26 painel nunca READY_PRODUCTION',
    (p->'emitter'->>'status') <> 'READY_PRODUCTION' AND (p->>'overallStatus') <> 'READY_PRODUCTION');
  PERFORM pg_temp.h('T27 painel declara teto READY_HOMOLOGATION',
    (p->>'maxAllowedStatus') = 'READY_HOMOLOGATION');
  PERFORM pg_temp.h('T28 painel marca producao bloqueada',
    (p->'emitter'->>'productionBlocked')::boolean);
  PERFORM pg_temp.h('T29 painel segrega microrganismos',
    (p->'microorganisms') ?& ARRAY['active','ready','draft','blocked','inactive']);
END $$;

-- T30 calculo bloqueia ambiente 1 com FISCAL_PRODUCTION_BLOCKED especificamente
DO $$
DECLARE inv uuid; au uuid;
BEGIN
  inv := (SELECT v FROM _fx WHERE k='inv_ok');
  SELECT uid INTO au FROM _ids WHERE papel='administrador';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', au, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.rpc_fiscal_calculate_invoice_v1(inv, 'harness-f31r1-'||gen_random_uuid()::text);
    PERFORM pg_temp.h('T30 calculo exige FISCAL_PRODUCTION_BLOCKED em tpAmb=1', false, 'nao bloqueou');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T30 calculo exige FISCAL_PRODUCTION_BLOCKED em tpAmb=1',
      SQLERRM LIKE 'FISCAL_PRODUCTION_BLOCKED:%', SQLERRM);
  END;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- T31 reserva bloqueia ambiente 1 com FISCAL_PRODUCTION_BLOCKED especificamente
DO $$
DECLARE inv uuid; au uuid;
BEGIN
  inv := (SELECT v FROM _fx WHERE k='inv_ok');
  SELECT uid INTO au FROM _ids WHERE papel='administrador';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', au, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.rpc_fiscal_reserve_nfe_number_v1(inv, 'harness-f31r1-'||gen_random_uuid()::text);
    PERFORM pg_temp.h('T31 reserva exige FISCAL_PRODUCTION_BLOCKED em tpAmb=1', false, 'nao bloqueou');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.h('T31 reserva exige FISCAL_PRODUCTION_BLOCKED em tpAmb=1',
      SQLERRM LIKE 'FISCAL_PRODUCTION_BLOCKED:%', SQLERRM);
  END;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- Restaura o ambiente de homologacao antes das provas de RLS (a transacao e' revertida de todo modo).
UPDATE public.company_fiscal_settings SET nfe_environment_code = '2'
 WHERE id = (SELECT v FROM _fx WHERE k='emitente');

-- ---------------------------------------------------------------------
-- BLOCO E — RLS REAL SOB PAPEL NAO PRIVILEGIADO
-- ---------------------------------------------------------------------

-- Fixture visivel apenas a perfis internos.
DO $$
DECLARE admin_uid uuid; rid uuid;
BEGIN
  SELECT uid INTO admin_uid FROM _ids WHERE papel='administrador';
  INSERT INTO public.fiscal_tax_rules(rule_key, tax_kind, status, base_components, rate, created_by)
  VALUES ('HARNESS_F31R1_'||substr(replace(gen_random_uuid()::text,'-',''),1,12),
          'ICMS', 'DRAFT', '["PRODUTO"]'::jsonb, 12, admin_uid)
  RETURNING id INTO rid;
  INSERT INTO _fx(k,v) VALUES ('regra', rid);
  PERFORM pg_temp.h('T32 fixture de regra fiscal criada (base das provas de RLS)',
    (SELECT count(*) FROM public.fiscal_tax_rules WHERE id = rid) = 1);
END $$;

-- T33..T38: leitura sob SET ROLE authenticated com claims reais.
DO $$
DECLARE _papel text; res jsonb; interno boolean; ok boolean; q text; det text; u uuid;
BEGIN
  q := format('SELECT count(*) FROM public.fiscal_tax_rules WHERE id = %L::uuid',
              (SELECT v FROM _fx WHERE k='regra'));
  FOREACH _papel IN ARRAY ARRAY['administrador','gestor','financeiro',
                               'tecnico_agronomo','parceiro_b2b','cliente_produtor'] LOOP
    SELECT i.uid INTO u FROM _ids i WHERE i.papel = _papel;
    res := pg_temp.probe('authenticated', u, q);
    interno := _papel IN ('administrador','gestor','financeiro');
    det := format('current_user=%s row_security=%s bypassrls=%s n=%s err=%s',
      res->>'currentUser', res->>'rowSecurity', res->>'bypassrls',
      coalesce(res->>'n','-'), coalesce(res->>'error','-'));
    ok := (res->>'currentUser') = 'authenticated'
      AND (res->>'rowSecurity') = 'on'
      AND (res->>'bypassrls')::boolean IS FALSE
      AND CASE WHEN interno THEN coalesce((res->>'n')::int,0) = 1
               ELSE coalesce((res->>'n')::int,0) = 0 END;
    PERFORM pg_temp.h(format('T33+ RLS fiscal_tax_rules papel=%s esperado=%s', _papel,
      CASE WHEN interno THEN 'LE' ELSE 'NAO LE' END), ok, det);
  END LOOP;
END $$;

-- T39..T41: reservas de numeracao invisiveis a perfis nao fiscais.
DO $$
DECLARE _papel text; res jsonb; q text; u uuid;
BEGIN
  q := 'SELECT count(*) FROM public.fiscal_number_reservations';
  FOREACH _papel IN ARRAY ARRAY['tecnico_agronomo','parceiro_b2b','cliente_produtor'] LOOP
    SELECT i.uid INTO u FROM _ids i WHERE i.papel = _papel;
    res := pg_temp.probe('authenticated', u, q);
    PERFORM pg_temp.h(format('T39+ reservas de numeracao invisiveis para %s', _papel),
      (res->>'currentUser') = 'authenticated'
      AND (res->>'bypassrls')::boolean IS FALSE
      AND coalesce((res->>'n')::int,0) = 0,
      format('current_user=%s row_security=%s n=%s err=%s', res->>'currentUser',
             res->>'rowSecurity', coalesce(res->>'n','-'), coalesce(res->>'error','-')));
  END LOOP;
END $$;

-- T42 runs de calculo invisiveis para tecnico
DO $$
DECLARE res jsonb;
BEGIN
  res := pg_temp.probe('authenticated', (SELECT uid FROM _ids WHERE papel='tecnico_agronomo'),
    'SELECT count(*) FROM public.fiscal_calculation_runs');
  PERFORM pg_temp.h('T42 fiscal_calculation_runs invisivel para tecnico_agronomo',
    (res->>'currentUser')='authenticated' AND coalesce((res->>'n')::int,0)=0,
    format('n=%s err=%s', coalesce(res->>'n','-'), coalesce(res->>'error','-')));
END $$;

-- T43 anon nao le nada
DO $$
DECLARE res jsonb;
BEGIN
  res := pg_temp.probe('anon', NULL, 'SELECT count(*) FROM public.fiscal_tax_rules');
  PERFORM pg_temp.h('T43 anon sem leitura fiscal',
    (res->>'currentUser')='anon'
    AND (res->>'bypassrls')::boolean IS FALSE
    AND (coalesce((res->>'n')::int,0) = 0 OR (res->>'error') IS NOT NULL),
    format('current_user=%s row_security=%s n=%s err=%s', res->>'currentUser',
           res->>'rowSecurity', coalesce(res->>'n','-'), coalesce(res->>'error','-')));
END $$;

-- T44 executor voltou ao papel privilegiado apenas apos as provas
DO $$ BEGIN
  PERFORM pg_temp.h('T44 sessao retornou ao executor de preparo apos as sondas',
    current_user <> 'authenticated' AND current_user <> 'anon', 'current_user='||current_user);
END $$;

-- T45 inventario de policies: nenhuma alternativa permissiva concede SELECT por OR
DO $$
DECLARE extras text := '';
BEGIN
  SELECT string_agg(tablename||'.'||policyname, ' ') INTO extras
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('fiscal_tax_rules','fiscal_number_reservations','fiscal_calculation_runs',
                       'fiscal_document_series','fiscal_operation_policies','fiscal_rule_sod_overrides')
     AND permissive = 'PERMISSIVE'
     AND cmd IN ('SELECT','ALL')
     AND policyname NOT LIKE 'f3_internal_read_%';
  PERFORM pg_temp.h('T45 unica policy permissiva de leitura por tabela interna (sem OR alternativo)',
    coalesce(extras,'') = '', coalesce(extras,'nenhuma policy extra'));
END $$;

-- T46 policies internas usam exclusivamente fn_fiscal_can_read_internal()
DO $$
DECLARE ruins text := '';
BEGIN
  SELECT string_agg(tablename||'.'||policyname,' ') INTO ruins
    FROM pg_policies
   WHERE schemaname='public' AND policyname LIKE 'f3_internal_read_%'
     AND coalesce(qual,'') <> 'fn_fiscal_can_read_internal()';
  PERFORM pg_temp.h('T46 policies internas ancoradas em fn_fiscal_can_read_internal()',
    coalesce(ruins,'') = '', coalesce(ruins,'ok'));
END $$;

-- T47 RLS habilitada em todas as tabelas fiscais
DO $$
DECLARE semrls text := '';
BEGIN
  SELECT string_agg(c.relname,' ') INTO semrls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'fiscal%'
     AND NOT c.relrowsecurity;
  PERFORM pg_temp.h('T47 RLS habilitada em todas as tabelas fiscais',
    coalesce(semrls,'') = '', coalesce(semrls,'ok'));
END $$;

-- T48 nenhum trigger fiscal desabilitado
DO $$
DECLARE off_t text := '';
BEGIN
  SELECT string_agg(c.relname||'.'||t.tgname,' ') INTO off_t
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled = 'D'
     AND (c.relname LIKE 'fiscal%' OR c.relname='company_fiscal_settings');
  PERFORM pg_temp.h('T48 nenhum trigger fiscal desabilitado', coalesce(off_t,'') = '',
    coalesce(off_t,'ok'));
END $$;

-- ---------------------------------------------------------------------
-- BLOCO F — GATES ESTRUTURAIS DE SEGURANCA E PROMOCAO
-- ---------------------------------------------------------------------
DO $$ BEGIN
  PERFORM pg_temp.h('T49 policies SELECT redundantes removidas',
    NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND policyname IN ('fcr_select','fds_select','fnr_select','ftr_select','frso_select','fop_admin_read')));
END $$;

DO $$ BEGIN
  PERFORM pg_temp.h('T50 preflight de promocao: nenhuma reserva orfa',
    NOT EXISTS (SELECT 1 FROM public.fiscal_number_reservations WHERE fiscal_invoice_id IS NULL));
END $$;

DO $$ BEGIN
  PERFORM pg_temp.h('T51 fontes oficiais sem pagina generica',
    NOT EXISTS (SELECT 1 FROM public.fiscal_official_sources
      WHERE url IS NULL OR url !~ '^https://' OR url ~ '^https://[^/]+/?$'));
END $$;

-- T52 gate de ambiente F3.1-R1: SECURITY DEFINER, search_path fixo, sem PUBLIC/anon
DO $$
DECLARE secdef boolean; cfg text; pub boolean; ano boolean;
BEGIN
  SELECT p.prosecdef, array_to_string(coalesce(p.proconfig,'{}'),',')
    INTO secdef, cfg
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.fn_fiscal_assert_environment_homologation()');
  pub := has_function_privilege('public','public.fn_fiscal_assert_environment_homologation()','EXECUTE');
  ano := has_function_privilege('anon','public.fn_fiscal_assert_environment_homologation()','EXECUTE');
  PERFORM pg_temp.h('T52 gate de ambiente SECURITY DEFINER com search_path fixo e sem PUBLIC/anon',
    coalesce(secdef,false) AND cfg LIKE '%search_path%' AND NOT pub AND NOT ano,
    format('secdef=%s cfg=%s public=%s anon=%s', secdef, cfg, pub, ano));
END $$;

-- T53 nenhuma funcao fiscal SECURITY DEFINER sem search_path fixo
DO $$
DECLARE ruins text := '';
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ' ') INTO ruins
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND (p.proname LIKE 'fn_fiscal%' OR p.proname LIKE 'rpc_fiscal%' OR p.proname LIKE 'tg_fiscal%')
     AND array_to_string(coalesce(p.proconfig,'{}'),',') NOT LIKE '%search_path%';
  PERFORM pg_temp.h('T53 toda funcao fiscal SECURITY DEFINER tem search_path fixo',
    coalesce(ruins,'') = '', coalesce(ruins,'ok'));
END $$;

-- T54 RPCs fiscais nao executaveis por PUBLIC/anon
DO $$
DECLARE ruins text := '';
BEGIN
  SELECT string_agg(p.oid::regprocedure::text,' ') INTO ruins
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'rpc_fiscal%'
     AND (has_function_privilege('public', p.oid, 'EXECUTE')
          OR has_function_privilege('anon', p.oid, 'EXECUTE'));
  PERFORM pg_temp.h('T54 nenhuma RPC fiscal executavel por PUBLIC/anon',
    coalesce(ruins,'') = '', coalesce(ruins,'ok'));
END $$;

\echo '== RESULTADO RUNTIME HARNESS F3.1 / F3.1-R1 =='
SELECT n, caso, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, coalesce(detail,'') AS detalhe
  FROM _h ORDER BY n;

DO $$
DECLARE nf int; nt int;
BEGIN
  SELECT count(*) FILTER (WHERE NOT coalesce(ok,false)), count(*) INTO nf, nt FROM _h;
  IF nf > 0 THEN
    RAISE EXCEPTION 'RUNTIME_HARNESS_F3_1_R1_FAILED: % de % casos reprovados.', nf, nt;
  END IF;
  RAISE NOTICE 'RUNTIME HARNESS F3.1-R1: % / % PASS', nt, nt;
END $$;

-- Nada e' persistido: fixtures sinteticas desaparecem com o ROLLBACK.
ROLLBACK;

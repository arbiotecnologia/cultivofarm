-- =====================================================================
-- FASE 1 — Verificacao do estado aplicado (read-only, 12 asserts)
-- Ambiente: staging ikaauvsflpmamgxmkhoq. Producao recusada.
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

DO $v$
DECLARE n int;
BEGIN
  -- 1 tabela canonica
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
   WHERE s.nspname='public' AND c.relname='commercial_price_rules';
  IF n <> 1 THEN RAISE EXCEPTION 'V1: commercial_price_rules ausente'; END IF;

  -- 2 RLS habilitada
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
   WHERE s.nspname='public' AND c.relname='commercial_price_rules' AND c.relrowsecurity;
  IF n <> 1 THEN RAISE EXCEPTION 'V2: RLS desabilitada'; END IF;

  -- 3 policies esperadas
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename='commercial_price_rules'
     AND policyname IN ('cpr_staff_all','cpr_partner_select_own','cpr_producer_select_own');
  IF n <> 3 THEN RAISE EXCEPTION 'V3: policies esperadas ausentes (%)', n; END IF;

  -- 4 anon sem qualquer privilegio
  IF has_table_privilege('anon','public.commercial_price_rules','SELECT')
     OR has_table_privilege('anon','public.commercial_price_rules','INSERT') THEN
    RAISE EXCEPTION 'V4: anon possui privilegio na matriz';
  END IF;

  -- 5 exclusao de sobreposicao
  SELECT count(*) INTO n FROM pg_constraint WHERE conname='cpr_no_overlap';
  IF n <> 1 THEN RAISE EXCEPTION 'V5: constraint cpr_no_overlap ausente'; END IF;

  -- 6 checks estruturais
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname IN ('cpr_buyer_identity_chk','cpr_item_xor_chk','cpr_volume_chk',
                     'cpr_condition_price_chk','cpr_plan_required_chk','cpr_validity_chk');
  IF n <> 6 THEN RAISE EXCEPTION 'V6: checks estruturais incompletos (%)', n; END IF;

  -- 7 indices de leitura
  SELECT count(*) INTO n FROM pg_indexes
   WHERE tablename='commercial_price_rules'
     AND indexname IN ('idx_cpr_partner_lookup','idx_cpr_producer_lookup');
  IF n <> 2 THEN RAISE EXCEPTION 'V7: indices de lookup ausentes (%)', n; END IF;

  -- 8 funcoes da fase
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
   WHERE s.nspname='public' AND p.proname IN
     ('fn_resolve_commercial_price','rpc_resolve_commercial_prices',
      'fn_b2b_credit_exposure','rpc_b2b_credit_exposure');
  IF n <> 4 THEN RAISE EXCEPTION 'V8: funcoes da Fase 1 ausentes (%)', n; END IF;

  -- 9 anon sem EXECUTE
  IF has_function_privilege('anon','public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.rpc_b2b_credit_exposure(uuid,numeric,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date)','EXECUTE') THEN
    RAISE EXCEPTION 'V9: anon possui EXECUTE em RPC da Fase 1';
  END IF;

  -- 10 funcao interna de credito restrita a service_role
  IF has_function_privilege('authenticated','public.fn_b2b_credit_exposure(uuid,numeric,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'V10: authenticated possui EXECUTE na funcao interna de credito';
  END IF;

  -- 11 guarda de credito com lock e exposicao projetada
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
   WHERE s.nspname='public' AND p.proname='tg_partner_orders_credit_guard'
     AND pg_get_functiondef(p.oid) LIKE '%pg_advisory_xact_lock%'
     AND pg_get_functiondef(p.oid) LIKE '%fn_b2b_credit_exposure%';
  IF n <> 1 THEN RAISE EXCEPTION 'V11: guarda de credito nao atualizada'; END IF;

  -- 12 somente as 2 funcoes de credito divergem do snapshot da Fase 0.1
  SELECT count(*) INTO n
  FROM public._motor_b2b_pre_phase1_snapshot s
  JOIN pg_proc p ON p.proname = s.proname
  JOIN pg_namespace ns ON ns.oid = p.pronamespace AND ns.nspname='public'
  WHERE md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM s.checksum_md5;
  IF n <> 2 THEN RAISE EXCEPTION 'V12: divergencias inesperadas no snapshot (% <> 2)', n; END IF;

  RAISE NOTICE 'FASE1_VERIFY: 12/12 asserts OK';
END $v$;

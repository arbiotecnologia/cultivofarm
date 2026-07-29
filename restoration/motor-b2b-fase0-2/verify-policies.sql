-- =====================================================================
-- MOTOR B2B — VERIFICACAO DA FASE 0.2 (READ-ONLY)
-- Confere se o estado endurecido esta vigente. Nao escreve nada.
--
-- Ambiente permitido: STAGING ikaauvsflpmamgxmkhoq
-- Ambiente PROIBIDO : PRODUCAO navfzbwgwzruipouyfnk
--
-- Uso:
--   psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 \
--        -f restoration/motor-b2b-fase0-2/verify-policies.sql
-- =====================================================================

\set ON_ERROR_STOP on

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'STAGING_GUARD: marker ausente'; END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN RAISE EXCEPTION 'STAGING_GUARD: PRODUCAO recusada'; END IF;
  IF v_ref <> 'ikaauvsflpmamgxmkhoq' THEN RAISE EXCEPTION 'STAGING_GUARD: ref inesperado %', v_ref; END IF;
END;
$guard$;

-- 1. Inventario das policies relevantes
SELECT tablename, policyname, cmd, permissive, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('partner_order_payment_terms','partner_order_payment_schedule',
                    'accounts_receivable','accounts_receivable_installments',
                    'partner_orders','partner_order_items','partner_users')
ORDER BY tablename, policyname;

-- 2. ACLs das RPCs sensiveis
SELECT p.proname, array_to_string(p.proacl::text[],' ') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('approve_b2b_payment_terms_secure','reject_b2b_payment_terms_secure',
                    'request_b2b_payment_terms_adjustment_secure','add_b2b_payment_terms_note_secure')
ORDER BY 1;

-- 3. Asserts
DO $assert$
DECLARE v int;
BEGIN
  -- 3.1 terms/schedule exigem papel parceiro_b2b no ramo do parceiro
  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname='public' AND policyname IN ('popt_select','pops_select')
     AND qual LIKE '%parceiro_b2b%';
  IF v <> 2 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: popt_select/pops_select sem exigencia de parceiro_b2b (%)', v; END IF;

  -- 3.2 ar_producer_read bloqueia B2B
  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname='public' AND tablename='accounts_receivable' AND policyname='ar_producer_read'
     AND qual LIKE '%partner_id IS NULL%' AND qual LIKE '%B2B_ORDER%';
  IF v <> 1 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: ar_producer_read nao bloqueia recebivel B2B'; END IF;

  -- 3.3 ari_producer_read valida o recebivel pai
  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname='public' AND tablename='accounts_receivable_installments' AND policyname='ari_producer_read'
     AND qual LIKE '%partner_id IS NULL%' AND qual LIKE '%B2B_ORDER%';
  IF v <> 1 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: ari_producer_read nao valida recebivel pai'; END IF;

  -- 3.4 anon/PUBLIC sem EXECUTE nas RPCs sensiveis
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('approve_b2b_payment_terms_secure','reject_b2b_payment_terms_secure',
                       'request_b2b_payment_terms_adjustment_secure','add_b2b_payment_terms_note_secure')
     AND (array_to_string(p.proacl::text[],' ') LIKE '%anon=X%'
          OR array_to_string(p.proacl::text[],' ') LIKE '=X/%');
  IF v > 0 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: % RPC(s) ainda com EXECUTE para anon/PUBLIC', v; END IF;

  -- 3.5 checksums das 17 funcoes do snapshot Fase 0.1
  SELECT count(*) INTO v
  FROM public._motor_b2b_pre_phase1_snapshot s
  JOIN pg_proc p ON p.pronamespace='public'::regnamespace AND p.proname=s.proname
   AND pg_get_function_identity_arguments(p.oid)=s.identity_args
  WHERE md5(pg_get_functiondef(p.oid)) <> s.checksum_md5;
  IF v > 0 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: % funcao(oes) divergente(s) do snapshot Fase 0.1', v; END IF;

  RAISE NOTICE 'FASE0.2 VERIFY_OK';
END;
$assert$;

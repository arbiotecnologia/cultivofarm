-- =====================================================================
-- MOTOR B2B — VERIFICACAO DO ESTADO ENDURECIDO DA FASE 0.2 (READ-ONLY)
-- Confere APENAS o estado seguro pos-hardening. Nao escreve nada.
-- O rollback correspondente e restore-policies.sql (uso emergencial).
--
-- Ambiente permitido: STAGING ikaauvsflpmamgxmkhoq
-- Ambiente PROIBIDO : PRODUCAO navfzbwgwzruipouyfnk
--
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

-- 3. Privilegios de anon nas tabelas B2B sensiveis (esperado: tudo false)
SELECT t.rel,
       has_table_privilege('anon', ('public.'||t.rel)::regclass,'SELECT') AS anon_select,
       has_table_privilege('anon', ('public.'||t.rel)::regclass,'INSERT') AS anon_insert,
       has_table_privilege('anon', ('public.'||t.rel)::regclass,'UPDATE') AS anon_update,
       has_table_privilege('anon', ('public.'||t.rel)::regclass,'DELETE') AS anon_delete
FROM (VALUES ('partner_orders'),('partner_order_items'),('partner_users'),
             ('partner_order_payment_terms'),('partner_order_payment_schedule')) t(rel)
ORDER BY 1;

-- 4. Asserts do estado seguro
DO $assert$
DECLARE v int;
BEGIN
  -- 4.1 terms/schedule exigem papel parceiro_b2b no ramo do parceiro
  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname='public' AND policyname IN ('popt_select','pops_select')
     AND qual LIKE '%parceiro_b2b%';
  IF v <> 2 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: popt_select/pops_select sem exigencia de parceiro_b2b (%)', v; END IF;

  -- 4.2 ar_producer_read bloqueia B2B
  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname='public' AND tablename='accounts_receivable' AND policyname='ar_producer_read'
     AND qual LIKE '%partner_id IS NULL%' AND qual LIKE '%B2B_ORDER%';
  IF v <> 1 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: ar_producer_read nao bloqueia recebivel B2B'; END IF;

  -- 4.3 ari_producer_read valida o recebivel pai
  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname='public' AND tablename='accounts_receivable_installments' AND policyname='ari_producer_read'
     AND qual LIKE '%partner_id IS NULL%' AND qual LIKE '%B2B_ORDER%';
  IF v <> 1 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: ari_producer_read nao valida recebivel pai'; END IF;

  -- 4.4 policy de parcelas do parceiro existe e exige papel parceiro_b2b
  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname='public' AND tablename='accounts_receivable_installments'
     AND policyname='ari_partner_select_own_b2b' AND qual LIKE '%parceiro_b2b%';
  IF v <> 1 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: ari_partner_select_own_b2b ausente ou permissiva'; END IF;

  -- 4.5 anon sem EXECUTE nas RPCs sensiveis
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('approve_b2b_payment_terms_secure','reject_b2b_payment_terms_secure',
                       'request_b2b_payment_terms_adjustment_secure','add_b2b_payment_terms_note_secure')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v > 0 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: % RPC(s) ainda executaveis por anon', v; END IF;

  -- 4.6 PUBLIC sem EXECUTE nas RPCs sensiveis
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('approve_b2b_payment_terms_secure','reject_b2b_payment_terms_secure',
                       'request_b2b_payment_terms_adjustment_secure','add_b2b_payment_terms_note_secure')
     AND EXISTS (SELECT 1 FROM unnest(COALESCE(p.proacl,'{}')::text[]) a WHERE a LIKE '=%');
  IF v > 0 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: % RPC(s) ainda com EXECUTE para PUBLIC', v; END IF;

  -- 4.7 anon sem privilegios nas 5 tabelas B2B
  SELECT count(*) INTO v
  FROM (VALUES ('partner_orders'),('partner_order_items'),('partner_users'),
               ('partner_order_payment_terms'),('partner_order_payment_schedule')) t(rel)
  WHERE has_table_privilege('anon', ('public.'||t.rel)::regclass,'SELECT')
     OR has_table_privilege('anon', ('public.'||t.rel)::regclass,'INSERT')
     OR has_table_privilege('anon', ('public.'||t.rel)::regclass,'UPDATE')
     OR has_table_privilege('anon', ('public.'||t.rel)::regclass,'DELETE');
  IF v > 0 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: % tabela(s) B2B ainda acessivel(is) por anon', v; END IF;

  -- 4.8 indice de apoio presente
  SELECT count(*) INTO v FROM pg_indexes
   WHERE schemaname='public' AND indexname='idx_ari_receivable';
  IF v <> 1 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: idx_ari_receivable ausente'; END IF;

  -- 4.9 checksums das 17 funcoes do snapshot Fase 0.1
  SELECT count(*) INTO v
  FROM public._motor_b2b_pre_phase1_snapshot s
  JOIN pg_proc p ON p.pronamespace='public'::regnamespace AND p.proname=s.proname
   AND pg_get_function_identity_arguments(p.oid)=s.identity_args
  WHERE md5(pg_get_functiondef(p.oid)) <> s.checksum_md5;
  IF v > 0 THEN RAISE EXCEPTION 'FASE0.2 VERIFY: % funcao(oes) divergente(s) do snapshot Fase 0.1', v; END IF;

  RAISE NOTICE 'FASE0.2 VERIFY_OK';
END;
$assert$;

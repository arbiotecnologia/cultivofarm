-- Motor B2B — Fase 7 — Harness ROLLBACK-ONLY (fora da cadeia de migrations).
-- Pré-requisito: executar _guard.sql antes (staging ikaauvsflpmamgxmkhoq).
-- Nenhum UUID real: tudo por parâmetro.
--
--   psql "$STAGING_DSN" -v ON_ERROR_STOP=1 \
--     -f _guard.sql -f harness-rollback-only.sql
--
-- Este script NÃO persiste nada: termina sempre em ROLLBACK.
-- Este script NÃO desabilita triggers em nenhuma hipótese.

\if :{?partner_id}
\else
  \echo 'AVISO: -v partner_id=''<uuid>'' nao informado; provas de pedido serao SKIP.'
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- V1. Integridade de triggers: nenhum trigger de usuário pode estar desabilitado.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE v_off int;
BEGIN
  SELECT count(*) INTO v_off
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND NOT t.tgisinternal
     AND t.tgenabled = 'D';
  IF v_off > 0 THEN
    RAISE EXCEPTION 'V1_FAIL: % trigger(s) de usuario desabilitado(s) em public', v_off;
  END IF;
  RAISE NOTICE 'V1_PASS: nenhum trigger de usuario desabilitado';
END
$v1$;

-- ---------------------------------------------------------------------------
-- V2. Ausência de fixtures/órfãos das provas anteriores.
-- ---------------------------------------------------------------------------
DO $v2$
DECLARE v_orders int; v_idem int; v_proofs int;
BEGIN
  SELECT count(*) INTO v_orders
    FROM public.partner_orders
   WHERE coalesce(observacoes,'') LIKE 'GATE-RUNTIME%'
      OR coalesce(observacoes,'') LIKE 'FASE7-PROOF%';

  SELECT count(*) INTO v_idem
    FROM public.partner_order_idempotency
   WHERE idempotency_key LIKE 'GATE-RUNTIME-%'
      OR idempotency_key LIKE 'FASE7-PROOF-%';

  v_proofs := CASE WHEN to_regclass('public._motor_b2b_fase7_proofs') IS NULL THEN 0 ELSE 1 END;

  RAISE NOTICE 'V2: orders_fixture=% idem_fixture=% proofs_table_present=%',
    v_orders, v_idem, v_proofs;

  IF v_orders > 0 OR v_idem > 0 THEN
    RAISE EXCEPTION 'V2_FAIL: fixtures remanescentes (orders=%, idempotency=%)', v_orders, v_idem;
  END IF;
  RAISE NOTICE 'V2_PASS: nenhuma fixture remanescente';
END
$v2$;

-- ---------------------------------------------------------------------------
-- V3. ACL: funções comerciais B2B não podem ser executáveis por anon/PUBLIC.
-- ---------------------------------------------------------------------------
DO $v3$
DECLARE v_leak int;
BEGIN
  SELECT count(*) INTO v_leak
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'create_partner_order_secure','approve_partner_order','reject_partner_order',
       'generate_b2b_receivable_secure','fn_resolve_commercial_price',
       'fn_b2b_resolve_base_unit_price','fn_b2b_cart_hash','rpc_b2b_partner_credit'
     )
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('public', p.oid, 'EXECUTE'));
  IF v_leak > 0 THEN
    RAISE EXCEPTION 'V3_FAIL: % funcao(oes) B2B executavel(is) por anon/PUBLIC', v_leak;
  END IF;
  RAISE NOTICE 'V3_PASS: nenhuma exposicao anon/PUBLIC em funcoes B2B';
END
$v3$;

-- Nada é persistido.
ROLLBACK;

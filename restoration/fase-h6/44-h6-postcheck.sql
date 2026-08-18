-- FASE H6 — POSTCHECK (staging). Somente leitura + testes em transacao revertida.
\set ON_ERROR_STOP on
\pset pager off

WITH t(check_id, ok) AS (
  VALUES
  ('H6-T01 coluna idempotency_key em receivable_payments',
   (SELECT count(*)=1 FROM information_schema.columns WHERE table_schema='public' AND table_name='receivable_payments' AND column_name='idempotency_key')),
  ('H6-T02 coluna idempotency_key em payable_payments',
   (SELECT count(*)=1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payable_payments' AND column_name='idempotency_key')),
  ('H6-T03 indice unico ux_rp_idempotency',
   (SELECT count(*)=1 FROM pg_indexes WHERE schemaname='public' AND indexname='ux_rp_idempotency')),
  ('H6-T04 indice unico ux_pp_idempotency',
   (SELECT count(*)=1 FROM pg_indexes WHERE schemaname='public' AND indexname='ux_pp_idempotency')),
  ('H6-T05 trigger append-only em receivable_payments',
   (SELECT count(*)=1 FROM pg_trigger WHERE tgname='trg_h6_rp_append_only' AND NOT tgisinternal)),
  ('H6-T06 trigger append-only em payable_payments',
   (SELECT count(*)=1 FROM pg_trigger WHERE tgname='trg_h6_pp_append_only' AND NOT tgisinternal)),
  ('H6-T07 sem policy de escrita direta em receivable_payments (exceto delete admin)',
   (SELECT count(*)=0 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
     WHERE c.relname='receivable_payments' AND p.polcmd IN ('a','w','*'))),
  ('H6-T08 sem policy de escrita direta em payable_payments (exceto delete admin)',
   (SELECT count(*)=0 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
     WHERE c.relname='payable_payments' AND p.polcmd IN ('a','w','*'))),
  ('H6-T09 policy de leitura financeira em receivable_payments',
   (SELECT count(*)=1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
     WHERE c.relname='receivable_payments' AND p.polname='rp_select_financial')),
  ('H6-T10 triggers de snapshot em AR/AP',
   (SELECT count(*)=4 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
     ('trg_h6_ar_snapshot','trg_h6_ap_snapshot','trg_h6_ari_snapshot','trg_h6_api_snapshot'))),
  ('H6-T11 anon sem privilegio em recurring_financial_templates',
   (SELECT NOT (has_table_privilege('anon','public.recurring_financial_templates','SELECT')
             OR has_table_privilege('anon','public.recurring_financial_templates','INSERT')
             OR has_table_privilege('anon','public.recurring_financial_templates','UPDATE')
             OR has_table_privilege('anon','public.recurring_financial_templates','DELETE')))),
  ('H6-T12 unicidade de competencia recorrente',
   (SELECT count(*)=1 FROM pg_indexes WHERE schemaname='public' AND indexname='ux_recurring_generation_success')),
  ('H6-T13 RPCs de baixa aceitam idempotency_key',
   (SELECT bool_and(pg_get_functiondef(p.oid) ILIKE '%idempotency_key%')
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN ('rpc_register_receivable_payment','rpc_register_payable_payment'))),
  ('H6-T14 RPCs de baixa sem EXECUTE para anon',
   (SELECT NOT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN ('rpc_register_receivable_payment','rpc_register_payable_payment'))),
  ('H6-T15 unicidade de titulo por entrega/pedido B2B preservada',
   (SELECT count(*)=2 FROM pg_indexes WHERE schemaname='public'
      AND indexname IN ('ux_ar_one_per_delivery','ux_ar_one_active_per_b2b_order'))),
  ('H6-T16 estorno unico por baixa',
   (SELECT count(*)=1 FROM pg_indexes WHERE schemaname='public' AND indexname='ux_receivable_payments_one_reversal'))
)
SELECT check_id, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado FROM t ORDER BY check_id;

-- Testes comportamentais em transacao revertida
BEGIN;
DO $$
DECLARE
  v_rp uuid;
  v_msg text;
  v_ok boolean;
BEGIN
  SELECT id INTO v_rp FROM public.receivable_payments ORDER BY created_at DESC LIMIT 1;
  IF v_rp IS NULL THEN
    RAISE NOTICE 'H6-B01 baixa imutavel : SKIP (sem baixas em staging)';
  ELSE
    v_ok := false;
    BEGIN
      UPDATE public.receivable_payments SET amount_received = amount_received + 1 WHERE id = v_rp;
    EXCEPTION WHEN OTHERS THEN
      v_ok := true; v_msg := SQLERRM;
    END;
    RAISE NOTICE 'H6-B01 baixa imutavel : %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  END IF;
END $$;

DO $$
DECLARE
  v_ar uuid;
  v_ok boolean := false;
BEGIN
  SELECT id INTO v_ar FROM public.accounts_receivable ORDER BY created_at DESC LIMIT 1;
  IF v_ar IS NULL THEN
    RAISE NOTICE 'H6-B02 snapshot imutavel : SKIP (sem titulos)';
  ELSE
    BEGIN
      UPDATE public.accounts_receivable SET total_amount = total_amount + 10 WHERE id = v_ar;
    EXCEPTION WHEN OTHERS THEN v_ok := true;
    END;
    RAISE NOTICE 'H6-B02 snapshot imutavel : %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;

    v_ok := false;
    BEGIN
      UPDATE public.accounts_receivable SET status = status WHERE id = v_ar;
      v_ok := true;
    EXCEPTION WHEN OTHERS THEN v_ok := false;
    END;
    RAISE NOTICE 'H6-B03 update de status permitido : %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  END IF;
END $$;

DO $$
DECLARE
  v_i uuid;
  v_ok boolean := false;
BEGIN
  SELECT id INTO v_i FROM public.accounts_receivable_installments ORDER BY created_at DESC LIMIT 1;
  IF v_i IS NULL THEN
    RAISE NOTICE 'H6-B04 parcela imutavel : SKIP';
  ELSE
    BEGIN
      UPDATE public.accounts_receivable_installments SET original_amount = original_amount + 5 WHERE id = v_i;
    EXCEPTION WHEN OTHERS THEN v_ok := true;
    END;
    RAISE NOTICE 'H6-B04 parcela imutavel : %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  END IF;
END $$;
ROLLBACK;

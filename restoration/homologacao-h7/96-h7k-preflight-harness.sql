-- FASE H7k — Harness funcional do preflight por campo (staging, transacional).
-- Cria massa sintética, executa `rpc_fiscal_preflight_v1` sob identidade real
-- de administrador e faz ROLLBACK ao final: não deixa resíduo no banco.
\set ON_ERROR_STOP on
\pset pager off
BEGIN;

DO $do$
DECLARE
  v_admin uuid;
  v_inv   uuid;
  v_res   jsonb;
  v_codes text;
BEGIN
  SELECT ur.user_id INTO v_admin
    FROM public.user_roles ur
   WHERE ur.role = 'administrador'::app_role
   ORDER BY ur.user_id LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'H7K HARNESS: nenhum administrador disponivel no staging.';
  END IF;

  INSERT INTO public.fiscal_invoices (invoice_type, status, total_amount, created_by)
  VALUES ('NFE', 'DRAFT', 1000.00, v_admin)
  RETURNING id INTO v_inv;

  -- Item deliberadamente inconsistente: líquido diverge de qtd x unitário.
  INSERT INTO public.fiscal_invoice_items
    (fiscal_invoice_id, item_sequence, description, quantity, unit_value, net_value, commercial_unit)
  VALUES (v_inv, 1, 'HARNESS H7K', 2, 10.00, 500.00, 'UN');

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  v_res := public.rpc_fiscal_preflight_v1(v_inv);

  SELECT string_agg(DISTINCT b->>'code', ',') INTO v_codes
    FROM jsonb_array_elements(v_res->'blockers') b;

  RAISE NOTICE 'H7K-T1 status=% canTransmit=%', v_res->>'status', v_res->>'canTransmit';
  RAISE NOTICE 'H7K-T2 codigos=%', coalesce(v_codes, '<nenhum>');
  RAISE NOTICE 'H7K-T3 campos=%', v_res->'fields';
  RAISE NOTICE 'H7K-T4 ambiente=%', v_res->>'environment';

  IF v_res->>'status' <> 'BLOCKED' THEN
    RAISE EXCEPTION 'H7K HARNESS FAIL: documento inconsistente nao foi bloqueado.';
  END IF;
  IF coalesce(v_codes,'') NOT LIKE '%FISCAL_ITEM_TOTAL_MISMATCH%' THEN
    RAISE EXCEPTION 'H7K HARNESS FAIL: divergencia aritmetica do item nao detectada.';
  END IF;
  IF coalesce(v_codes,'') NOT LIKE '%FISCAL_TOTAL_MISMATCH%' THEN
    RAISE EXCEPTION 'H7K HARNESS FAIL: divergencia de total nao detectada.';
  END IF;
  IF (v_res->>'canTransmit')::boolean THEN
    RAISE EXCEPTION 'H7K HARNESS FAIL: canTransmit verdadeiro com bloqueios.';
  END IF;

  RAISE NOTICE 'H7K HARNESS: PASS (4/4)';
END $do$;

ROLLBACK;

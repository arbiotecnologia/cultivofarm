-- Fase 6 — testes da trilha de auditoria (transação revertida, nenhum dado persistido)
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_user uuid;
  v_inv uuid;
  v_item uuid;
  v_n int;
  v_rec record;
BEGIN
  -- validador
  IF NOT fn_fiscal_tax_input_valid('{"ICMS":{"baseReductionPct":60,"baseReductionReason":"Convênio 100/97"}}') THEN
    RAISE EXCEPTION 'FAIL 1: motivo válido deveria ser aceito';
  END IF;
  IF fn_fiscal_tax_input_valid(jsonb_build_object('ICMS', jsonb_build_object('baseReductionPct', 60, 'baseReductionReason', repeat('x', 241)))) THEN
    RAISE EXCEPTION 'FAIL 2: motivo acima de 240 caracteres deveria ser rejeitado';
  END IF;
  IF fn_fiscal_tax_input_valid('{"ICMS":{"baseReductionPct":60,"vBC":4000}}') THEN
    RAISE EXCEPTION 'FAIL 3: valor calculado deveria ser rejeitado';
  END IF;
  IF fn_fiscal_tax_input_valid('{"ICMS":{"baseReductionPct":60,"baseReductionReason":123}}') THEN
    RAISE EXCEPTION 'FAIL 4: motivo não textual deveria ser rejeitado';
  END IF;

  SELECT id INTO v_user FROM auth.users LIMIT 1;

  INSERT INTO public.fiscal_invoices(invoice_type, status, created_by)
  VALUES ('NFE', 'DRAFT', v_user) RETURNING id INTO v_inv;

  INSERT INTO public.fiscal_invoice_items(fiscal_invoice_id, item_sequence, item_kind, tax_input_snapshot, tax_snapshot)
  VALUES (v_inv, 1, 'PRODUCT', '{}'::jsonb,
          jsonb_build_object('taxes', jsonb_build_array(jsonb_build_object(
            'taxKind','ICMS','ruleId','11111111-1111-1111-1111-111111111111','ruleKey','ICMS-SP',
            'ruleVersion',2,'legalBasis','Conv. ICMS 100/97','legalVersion','v1','baseReductionMode','MANUAL'))))
  RETURNING id INTO v_item;

  SELECT count(*) INTO v_n FROM public.fiscal_audit_log
   WHERE record_id = v_item AND action = 'BASE_REDUCTION_CHANGE';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 5: insert sem redução não deveria gerar trilha (%).', v_n; END IF;

  UPDATE public.fiscal_invoice_items
     SET tax_input_snapshot = '{"ICMS":{"baseReductionPct":60,"baseReductionReason":"Cesta básica"}}'
   WHERE id = v_item;

  SELECT * INTO v_rec FROM public.fiscal_audit_log
   WHERE record_id = v_item AND action = 'BASE_REDUCTION_CHANGE'
     AND (new_values->>'baseReductionPct')::numeric = 60 LIMIT 1;
  IF v_rec IS NULL THEN RAISE EXCEPTION 'FAIL 6: alteração de redução não gerou trilha'; END IF;
  IF (v_rec.new_values->>'baseReductionPct')::numeric <> 60 THEN RAISE EXCEPTION 'FAIL 7: percentual novo incorreto'; END IF;
  IF v_rec.old_values->'baseReductionPct' IS NOT NULL AND v_rec.old_values->>'baseReductionPct' <> '' THEN
    RAISE EXCEPTION 'FAIL 8: percentual anterior deveria ser nulo';
  END IF;
  IF v_rec.new_values->>'reason' <> 'Cesta básica' THEN RAISE EXCEPTION 'FAIL 9: motivo não registrado'; END IF;
  IF v_rec.new_values->>'ruleKey' <> 'ICMS-SP' OR v_rec.new_values->>'ruleVersion' <> '2'
     OR v_rec.new_values->>'legalBasis' <> 'Conv. ICMS 100/97'
     OR v_rec.new_values->>'baseReductionMode' <> 'MANUAL' THEN
    RAISE EXCEPTION 'FAIL 10: regra/fundamento legal não registrados';
  END IF;
  IF v_rec.new_values->>'taxKind' <> 'ICMS' THEN RAISE EXCEPTION 'FAIL 11: tributo não registrado'; END IF;

  -- alteração de outro campo não gera nova trilha
  UPDATE public.fiscal_invoice_items SET item_sequence = 1 WHERE id = v_item;
  SELECT count(*) INTO v_n FROM public.fiscal_audit_log
   WHERE record_id = v_item AND action = 'BASE_REDUCTION_CHANGE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 12: trilha duplicada sem mudança de redução (%).', v_n; END IF;

  -- alteração do percentual registra valor anterior
  UPDATE public.fiscal_invoice_items
     SET tax_input_snapshot = '{"ICMS":{"baseReductionPct":33.33}}' WHERE id = v_item;
  SELECT * INTO v_rec FROM public.fiscal_audit_log
   WHERE record_id = v_item AND action = 'BASE_REDUCTION_CHANGE'
     AND (new_values->>'baseReductionPct')::numeric = 33.33 LIMIT 1;
  IF v_rec IS NULL THEN RAISE EXCEPTION 'FAIL 13a: segunda alteração não registrada'; END IF;
  IF (v_rec.old_values->>'baseReductionPct')::numeric <> 60
     OR (v_rec.new_values->>'baseReductionPct')::numeric <> 33.33 THEN
    RAISE EXCEPTION 'FAIL 13: valores anterior/novo incorretos';
  END IF;

  -- documento congelado bloqueia alteração
  UPDATE public.fiscal_invoices SET status = 'AUTHORIZED' WHERE id = v_inv;
  BEGIN
    UPDATE public.fiscal_invoice_items SET tax_input_snapshot = '{"ICMS":{"baseReductionPct":10}}' WHERE id = v_item;
    RAISE EXCEPTION 'FAIL 14: documento congelado aceitou alteração de redução';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL;
  END;

  RAISE NOTICE 'PASS: 14/14 verificações da Fase 6';
END $$;

ROLLBACK;

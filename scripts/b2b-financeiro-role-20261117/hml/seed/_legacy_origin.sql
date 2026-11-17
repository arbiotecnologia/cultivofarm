-- Origem "legada provada" FICTÍCIA para o leitor de crédito de PRODUÇÃO (b2b_legacy_money_row): termos, cronograma, snapshot
-- econômico selado e auditoria INSERT das parcelas, todos marcados QA-FIN e manifestados. Exercita leitura/fórmula/isolamento;
-- NÃO prova a proveniência do writer canônico (é réplica sintética do que ele gravaria). Sem NF, sem cobrança.
CREATE OR REPLACE FUNCTION qa_b2bfin.seed_legacy_origin(p_order uuid, p_rec uuid, p_partner uuid, p_org uuid, p_label text) RETURNS void
LANGUAGE plpgsql SET search_path TO '' AS $f$
DECLARE t uuid := gen_random_uuid(); n int; tot numeric; sched jsonb;
BEGIN
 SELECT count(*), sum(original_amount) INTO n, tot FROM public.accounts_receivable_installments WHERE receivable_id = p_rec;
 IF n = 0 THEN RAISE EXCEPTION 'QA_SEED_INCOMPLETE: título % sem parcelas', p_label; END IF;
 INSERT INTO qa_b2bfin.manifest VALUES ('terms', p_label, 'public.partner_order_payment_terms', t);
 INSERT INTO public.partner_order_payment_terms (id, partner_order_id, plan_name_snapshot, plan_code_snapshot, discount_percent_snapshot,
   monthly_interest_percent_snapshot, months_count_snapshot, installment_count, first_due_date, table_amount, discount_amount,
   net_amount_after_discount, financial_interest_amount, final_amount, approval_status)
  SELECT t, p_order, 'QA-FIN fixture', 'QA-FIN', 0, 0, n, n, min(due_date), tot, 0, tot, 0, tot, 'not_required'
  FROM public.accounts_receivable_installments WHERE receivable_id = p_rec;
 INSERT INTO public.partner_order_payment_schedule (partner_order_id, payment_terms_id, installment_number, due_date, amount, principal_amount, interest_amount, status, receivable_installment_id)
  SELECT p_order, t, i.installment_number, i.due_date, i.original_amount, i.original_amount, 0, 'planned', i.id
  FROM public.accounts_receivable_installments i WHERE i.receivable_id = p_rec;
 INSERT INTO qa_b2bfin.manifest SELECT 'schedule', p_label, 'public.partner_order_payment_schedule', id FROM public.partner_order_payment_schedule WHERE payment_terms_id = t;
 SELECT jsonb_agg(to_jsonb(s) - ARRAY['created_at','status','receivable_installment_id'] ORDER BY s.installment_number) INTO sched
  FROM public.partner_order_payment_schedule s WHERE s.payment_terms_id = t;
 UPDATE public.partner_orders SET payment_terms_id = t, internal_economic_snapshot = jsonb_build_object('schema_version', '1',
   'sealed_by', 'QA-FIN-20261117 fixture sintética', 'qa_fixture', true,
   'origin', jsonb_build_object('organization_id', p_org, 'partner_id', p_partner),
   'terms', jsonb_build_object('id', t, 'partner_order_id', p_order, 'installment_count', n, 'final_amount', tot), 'schedule', sched)
  WHERE id = p_order;
 INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, reason)
  SELECT 'accounts_receivable_installments', i.id, 'INSERT', jsonb_build_object('receivable_id', i.receivable_id, 'organization_id', i.organization_id,
    'original_amount', i.original_amount, 'interest_amount', 0), 'QA-FIN-20261117 fixture sintética'
  FROM public.accounts_receivable_installments i WHERE i.receivable_id = p_rec
   AND NOT EXISTS (SELECT 1 FROM public.financial_audit_log f WHERE f.entity_type = 'accounts_receivable_installments' AND f.entity_id = i.id AND f.action = 'INSERT');
END $f$;

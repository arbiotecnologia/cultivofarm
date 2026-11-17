CREATE OR REPLACE FUNCTION platform_private.b2b_credit_balances(p_partner uuid, p_exclude uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE org uuid:=platform_private.b2b_integration_actor(p_partner); po record; i record; row jsonb; open_amount numeric:=0; overdue numeric:=0; committed numeric:=0; pending numeric:=0; balance numeric; residual numeric; tolerance int; debtor uuid;
BEGIN
 IF platform_private.b2b_credit_config_block(p_partner) IS NOT NULL THEN RAISE EXCEPTION 'CREDIT_SETTINGS_INCOMPLETE' USING ERRCODE='23514'; END IF;
 SELECT overdue_tolerance_days INTO tolerance FROM public.partner_financial_settings WHERE partner_id=p_partner AND active IS TRUE;
 IF tolerance IS NULL OR tolerance<0 THEN RAISE EXCEPTION 'CREDIT_SETTINGS_INCOMPLETE' USING ERRCODE='23514'; END IF;
 FOR i IN SELECT a.id AS receivable_id,s.id,s.due_date FROM public.accounts_receivable_installments s JOIN public.accounts_receivable a ON a.id=s.receivable_id
  WHERE a.organization_id=org AND s.organization_id=org AND a.status<>'CANCELED' AND s.status<>'CANCELED'
   AND (a.partner_id=p_partner OR EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=p_partner AND pa.client_id=a.customer_id
        AND pa.commercial_owner_organization_id=org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL)) LOOP
  debtor:=platform_private.b2b_receivable_partner_scope(i.receivable_id);
  IF debtor IS DISTINCT FROM p_partner THEN RAISE EXCEPTION 'CREDIT_PARTNER_CONFLICT' USING ERRCODE='23514'; END IF;
  row:=platform_private.b2b_proven_money_row_internal(i.id,org);
  IF row IS NULL THEN RAISE EXCEPTION 'CREDIT_MONEY_ORIGIN_UNPROVEN' USING ERRCODE='23514'; END IF;
  balance:=greatest((row->>'original_amount')::numeric+(row->>'interest_amount')::numeric-(row->>'financed_interest_amount')::numeric+(row->>'penalty_amount')::numeric-(row->>'discount_amount')::numeric-(row->>'received_amount')::numeric,0);
  open_amount:=open_amount+balance;
  IF i.due_date<CURRENT_DATE-tolerance THEN overdue:=overdue+balance; END IF;
 END LOOP;
 FOR po IN SELECT id,status::text AS status FROM public.partner_orders WHERE partner_id=p_partner AND id IS DISTINCT FROM p_exclude AND status::text IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','pendente','solicitado','em_analise_comercial','aguardando_aprovacao_credito','aguardando_ajuste_comercial','aguardando_itens') LOOP
  residual:=platform_private.b2b_order_residual(po.id);
  IF po.status IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue') THEN committed:=committed+residual; ELSE pending:=pending+residual; END IF;
 END LOOP;
 RETURN jsonb_build_object('saldo_em_aberto',open_amount,'saldo_vencido',overdue,'comprometido_nao_faturado',committed,'comprometido_pendente',pending);
END $function$

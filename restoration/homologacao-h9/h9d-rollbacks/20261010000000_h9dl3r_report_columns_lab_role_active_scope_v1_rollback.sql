-- ROLLBACK de 20261010000000 (homologação ikaauvsflpmamgxmkhoq).
-- Restaura byte a byte as definições vivas capturadas antes do forward.

CREATE OR REPLACE FUNCTION public.get_cliente_id_for_user(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN NOT public.fn_authz_uid_scope_ok(_user_id) THEN NULL::uuid ELSE (
    SELECT uc.cliente_id
      FROM public.user_clientes uc
     WHERE uc.user_id = _user_id
     ORDER BY uc.principal DESC, uc.created_at ASC
     LIMIT 1
  ) END
$function$
;

CREATE OR REPLACE FUNCTION public.get_cliente_ids_for_user(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.fn_authz_uid_scope_ok(_user_id) THEN ARRAY(
    SELECT cliente_id FROM public.user_clientes WHERE user_id = _user_id
    UNION
    SELECT cliente_id FROM public.profiles WHERE user_id = _user_id AND cliente_id IS NOT NULL
  ) ELSE ARRAY[]::uuid[] END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_report_monthly_financial(_from date, _to date, _cost_center uuid DEFAULT NULL::uuid, _regime text DEFAULT 'CASH'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  WITH rec AS (
    SELECT COALESCE(SUM(rp.amount_received),0) AS total
    FROM receivable_payments rp
    JOIN accounts_receivable_installments i ON i.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE rp.payment_date BETWEEN _from AND _to AND rp.is_reversal=false
      AND (_cost_center IS NULL OR ar.cost_center_id = _cost_center)
  ),
  pag AS (
    SELECT COALESCE(SUM(pp.amount_paid),0) AS total
    FROM payable_payments pp
    JOIN accounts_payable_installments i ON i.id = pp.installment_id
    JOIN accounts_payable ap ON ap.id = i.payable_id
    WHERE pp.payment_date BETWEEN _from AND _to AND pp.is_reversal=false
      AND (_cost_center IS NULL OR ap.cost_center_id = _cost_center)
  ),
  prev_rec AS (
    SELECT COALESCE(SUM(i.amount),0) AS total
    FROM accounts_receivable_installments i
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE i.due_date BETWEEN _from AND _to AND ar.status <> 'CANCELED'
      AND (_cost_center IS NULL OR ar.cost_center_id = _cost_center)
  ),
  prev_pag AS (
    SELECT COALESCE(SUM(i.amount),0) AS total
    FROM accounts_payable_installments i
    JOIN accounts_payable ap ON ap.id = i.payable_id
    WHERE i.due_date BETWEEN _from AND _to AND ap.status <> 'CANCELED'
      AND (_cost_center IS NULL OR ap.cost_center_id = _cost_center)
  ),
  overdue_rec AS (
    SELECT COALESCE(SUM(i.amount - COALESCE((SELECT SUM(rp.amount_received) FROM receivable_payments rp
      WHERE rp.installment_id = i.id AND rp.is_reversal=false),0)),0) AS total,
      COUNT(*) AS qty
    FROM accounts_receivable_installments i
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE i.status IN ('OPEN','PARTIAL','OVERDUE') AND i.due_date < CURRENT_DATE
      AND (_cost_center IS NULL OR ar.cost_center_id = _cost_center)
  ),
  overdue_pay AS (
    SELECT COUNT(*) AS qty FROM accounts_payable_installments i
    JOIN accounts_payable ap ON ap.id = i.payable_id
    WHERE i.status IN ('OPEN','PARTIAL','OVERDUE') AND i.due_date < CURRENT_DATE
      AND (_cost_center IS NULL OR ap.cost_center_id = _cost_center)
  ),
  nfe_pend AS (
    SELECT COUNT(*) AS qty FROM accounts_receivable ar
    WHERE ar.status <> 'CANCELED' AND (
      ar.fiscal_invoice_status = 'PENDING'
      OR (COALESCE(ar.fiscal_invoice_required,false)=true
          AND COALESCE(ar.fiscal_invoice_status,'PENDING') <> 'ISSUED'))
  ),
  by_cat AS (
    SELECT fc.name AS category, COALESCE(SUM(rp.amount_received),0) AS received
    FROM receivable_payments rp
    JOIN accounts_receivable_installments i ON i.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    LEFT JOIN financial_categories fc ON fc.id = ar.category_id
    WHERE rp.payment_date BETWEEN _from AND _to AND rp.is_reversal=false
      AND (_cost_center IS NULL OR ar.cost_center_id = _cost_center)
    GROUP BY fc.name
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', _from, 'to', _to),
    'regime', _regime,
    'received', (SELECT total FROM rec),
    'paid', (SELECT total FROM pag),
    'expected_receivable', (SELECT total FROM prev_rec),
    'expected_payable', (SELECT total FROM prev_pag),
    'net_cash', (SELECT total FROM rec) - (SELECT total FROM pag),
    'overdue_receivable_total', (SELECT total FROM overdue_rec),
    'overdue_receivable_count', (SELECT qty FROM overdue_rec),
    'overdue_payable_count', (SELECT qty FROM overdue_pay),
    'nfe_pending_count', (SELECT qty FROM nfe_pend),
    'by_category', COALESCE((SELECT jsonb_agg(jsonb_build_object('category',category,'received',received)) FROM by_cat), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END$function$
;

CREATE OR REPLACE FUNCTION public.get_report_nfe_pending(_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(receivable_id uuid, customer_name text, description text, total_amount numeric, issue_date date, fiscal_invoice_status text, fiscal_invoice_required boolean, origin_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT ar.id, COALESCE(c.nome, c.razao_social, '—'), ar.description,
         ar.total_amount, ar.issue_date,
         COALESCE(ar.fiscal_invoice_status, 'PENDING'),
         COALESCE(ar.fiscal_invoice_required, false),
         COALESCE(ar.origin_type, 'MANUAL')
  FROM accounts_receivable ar
  LEFT JOIN clientes c ON c.id = ar.cliente_id
  WHERE ar.status <> 'CANCELED'
    AND (ar.fiscal_invoice_status = 'PENDING'
         OR (COALESCE(ar.fiscal_invoice_required,false)=true
             AND COALESCE(ar.fiscal_invoice_status,'PENDING') <> 'ISSUED'))
  ORDER BY ar.issue_date DESC NULLS LAST;
END$function$
;

CREATE OR REPLACE FUNCTION public.get_report_payables(_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(installment_id uuid, payable_id uuid, supplier text, description text, category text, due_date date, amount numeric, paid numeric, balance numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _from date := (_filters->>'from')::date;
        _to date := (_filters->>'to')::date;
        _status text := _filters->>'status';
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT i.id, ap.id, COALESCE(ap.supplier_name,'—'), ap.description, fc.name,
         i.due_date, i.amount,
         COALESCE((SELECT SUM(pp.amount_paid) FROM payable_payments pp WHERE pp.installment_id = i.id AND pp.is_reversal=false),0),
         i.amount - COALESCE((SELECT SUM(pp.amount_paid) FROM payable_payments pp WHERE pp.installment_id = i.id AND pp.is_reversal=false),0),
         i.status
  FROM accounts_payable_installments i
  JOIN accounts_payable ap ON ap.id = i.payable_id
  LEFT JOIN financial_categories fc ON fc.id = ap.category_id
  WHERE (_from IS NULL OR i.due_date >= _from)
    AND (_to IS NULL OR i.due_date <= _to)
    AND (_status IS NULL OR i.status = _status)
    AND ap.status <> 'CANCELED'
  ORDER BY i.due_date;
END;$function$
;

CREATE OR REPLACE FUNCTION public.get_report_receivables(_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(installment_id uuid, receivable_id uuid, customer_name text, description text, category text, due_date date, amount numeric, paid numeric, balance numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _from date := (_filters->>'from')::date;
        _to date := (_filters->>'to')::date;
        _status text := _filters->>'status';
        _customer uuid := NULLIF(_filters->>'customer_id','')::uuid;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT i.id, ar.id, COALESCE(c.nome, c.razao_social, '—'), ar.description, fc.name,
         i.due_date, i.amount,
         COALESCE((SELECT SUM(rp.amount_received) FROM receivable_payments rp WHERE rp.installment_id = i.id AND rp.is_reversal=false),0),
         i.amount - COALESCE((SELECT SUM(rp.amount_received) FROM receivable_payments rp WHERE rp.installment_id = i.id AND rp.is_reversal=false),0),
         i.status
  FROM accounts_receivable_installments i
  JOIN accounts_receivable ar ON ar.id = i.receivable_id
  JOIN clientes c ON c.id = ar.customer_id
  LEFT JOIN financial_categories fc ON fc.id = ar.category_id
  WHERE (_from IS NULL OR i.due_date >= _from)
    AND (_to IS NULL OR i.due_date <= _to)
    AND (_status IS NULL OR i.status = _status)
    AND (_customer IS NULL OR ar.customer_id = _customer)
    AND ar.status <> 'CANCELED'
  ORDER BY i.due_date;
END;$function$
;

CREATE OR REPLACE FUNCTION public.lab_request_replanning(p_os_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_order_id uuid;
  v_planning_id uuid;
  v_partner_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'producao')
          OR public.has_role(v_uid,'gestor') OR public.has_role(v_uid,'laboratorio')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT partner_order_id INTO v_partner_order_id FROM public.ordens_servico WHERE id = p_os_id FOR UPDATE;
  IF v_partner_order_id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;

  SELECT id, partner_id INTO v_planning_id, v_partner_id
  FROM public.production_planning WHERE partner_order_id = v_partner_order_id FOR UPDATE;
  IF v_planning_id IS NULL THEN RAISE EXCEPTION 'planning_not_found'; END IF;

  INSERT INTO public.laboratorio_esteira_eventos (os_id, acao, etapa_nova, usuario_id, observacao)
  VALUES (p_os_id, 'replanejamento_solicitado', 'replanejar', v_uid, p_motivo);

  UPDATE public.production_planning
     SET status = 'replanejar', updated_at = now(),
         production_notes = COALESCE(production_notes || E'\n', '') ||
                            '[' || to_char(now(),'DD/MM/YYYY HH24:MI') || '] Replanejamento: ' || p_motivo
   WHERE id = v_planning_id;

  INSERT INTO public.production_timeline_events (partner_order_id, event_type, actor_id, meta)
  VALUES (v_partner_order_id, 'replanejamento_solicitado', v_uid,
          jsonb_build_object('planning_id', v_planning_id, 'os_id', p_os_id, 'motivo', p_motivo));

  INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_partner_order_id, v_partner_id, v_uid, 'replanejamento_solicitado',
          jsonb_build_object('planning_id', v_planning_id, 'os_id', p_os_id, 'motivo', p_motivo));

  PERFORM public.refresh_esteira_laboratorio();

  RETURN jsonb_build_object('ok', true, 'planning_id', v_planning_id);
END
$function$
;

CREATE OR REPLACE FUNCTION public.pode_acessar_recomendacao(_user_id uuid, _recomendacao_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.fn_authz_uid_scope_ok(_user_id) AND EXISTS (
    SELECT 1
    FROM public.registros_consultor_recomendacoes r
    JOIN public.registros_consultor rc ON rc.id = r.registro_consultor_id
    WHERE r.id = _recomendacao_id
      AND (
        public.has_role(_user_id, 'administrador'::app_role)
        OR public.has_role(_user_id, 'gestor'::app_role)
        OR public.has_role(_user_id, 'tecnico_agronomo'::app_role)
        OR public.has_role(_user_id, 'consultor_tecnico'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.user_clientes uc
          WHERE uc.user_id = _user_id AND uc.cliente_id = rc.cliente_id
        )
      )
  );
$function$
;


-- H7O P1 — Guardas explícitas (SQLSTATE 42501) em funções SECURITY DEFINER sensíveis.
-- Escopo: staging ikaauvsflpmamgxmkhoq. Idempotente (CREATE OR REPLACE) e reversível
-- (restoration/homologacao-h7/h7o-rollbacks/rollback-20260930000000.sql restaura os corpos originais).
--
-- Assinaturas, tipos de retorno, corpos funcionais e consumidores são preservados:
--   fn_generate_recurring_title(uuid,date,boolean)  — cron (fn_run_recurring_generation) e sessão interna
--                                                     continuam permitidos (auth.uid() IS NULL); UI manual
--                                                     (Recorrencias.tsx) exige staff financeiro.
--   recalc_partner_risk_score(uuid)                 — trigger trg_recalc_risk_on_ar_change (pg_trigger_depth()>0)
--                                                     e sessão interna preservados; UI (CentralGovernancaB2B)
--                                                     exige staff financeiro.
--   check_cliente/fazenda/talhao_dependencies(uuid) — staff operacional OU escopo do cliente
--                                                     (can_user_access_cliente(uid, cliente)).
--   rpc_validar_integridade_esteira(text,uuid)      — staff operacional (overload de 3 args não é tocada).
--   rpc_b2b_aging(uuid) / rpc_b2b_partner_profitability(date,date,uuid)
--                                                   — LANGUAGE sql → plpgsql; não autorizado recebe 42501
--                                                     em vez de 0 linhas; contrato tabular idêntico.
--
-- Pré-condição fail-fast: todas as assinaturas devem existir exatamente como esperado.
DO $pre$
DECLARE
  v_missing text := '';
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.fn_generate_recurring_title(uuid,date,boolean)',
    'public.recalc_partner_risk_score(uuid)',
    'public.check_cliente_dependencies(uuid)',
    'public.check_fazenda_dependencies(uuid)',
    'public.check_talhao_dependencies(uuid)',
    'public.rpc_validar_integridade_esteira(text,uuid)',
    'public.rpc_b2b_aging(uuid)',
    'public.rpc_b2b_partner_profitability(date,date,uuid)',
    'public.is_financial_staff(uuid)',
    'public.is_operational_staff(uuid)',
    'public.can_user_access_cliente(uuid,uuid)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      v_missing := v_missing || ' ' || v_sig;
    END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'H7O P1 ABORT: assinaturas ausentes:%', v_missing;
  END IF;
END
$pre$;

-- ---------------------------------------------------------------------------
-- 1) fn_generate_recurring_title — guarda no topo; corpo original intacto.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_generate_recurring_title(_template_id uuid, _reference_date date, _is_manual boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.recurring_financial_templates%ROWTYPE;
  v_new_id UUID;
  v_user UUID;
BEGIN
  -- H7O: sessão interna/cron (sem JWT) preservada; chamada autenticada exige staff financeiro.
  IF auth.uid() IS NOT NULL AND NOT public.is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501',
      HINT = 'H7O: geração de título recorrente restrita ao staff financeiro.';
  END IF;

  SELECT * INTO t FROM public.recurring_financial_templates WHERE id = _template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template não encontrado'; END IF;

  IF NOT t.active THEN
    INSERT INTO public.recurring_generation_log(template_id, reference_date, status, error_message, generated_by, generated_entity_type, amount)
    VALUES (_template_id, _reference_date, 'SKIPPED', 'Template inativo', auth.uid(), t.type, t.amount);
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
    VALUES ('RECURRING_TEMPLATE', _template_id, 'RECURRING_GENERATION_SKIPPED', jsonb_build_object('reference_date', _reference_date), auth.uid(), 'Template inativo');
    RETURN NULL;
  END IF;

  IF t.end_date IS NOT NULL AND _reference_date > t.end_date THEN
    INSERT INTO public.recurring_generation_log(template_id, reference_date, status, error_message, generated_by, generated_entity_type, amount)
    VALUES (_template_id, _reference_date, 'SKIPPED', 'Após data final', auth.uid(), t.type, t.amount);
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
    VALUES ('RECURRING_TEMPLATE', _template_id, 'RECURRING_GENERATION_SKIPPED', jsonb_build_object('reference_date', _reference_date), auth.uid(), 'Após data final');
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.recurring_generation_log WHERE template_id = _template_id AND reference_date = _reference_date AND status = 'SUCCESS') THEN
    INSERT INTO public.recurring_generation_log(template_id, reference_date, status, error_message, generated_by, generated_entity_type, amount)
    VALUES (_template_id, _reference_date, 'SKIPPED', 'Competência já gerada', auth.uid(), t.type, t.amount);
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
    VALUES ('RECURRING_TEMPLATE', _template_id, 'RECURRING_GENERATION_SKIPPED', jsonb_build_object('reference_date', _reference_date), auth.uid(), 'Competência já gerada');
    RETURN NULL;
  END IF;

  v_user := COALESCE(auth.uid(), t.created_by);

  IF t.type = 'RECEIVABLE' THEN
    INSERT INTO public.accounts_receivable(
      origin_type, customer_id, description, category_id, cost_center_id,
      total_amount, issue_date, first_due_date, installment_count, status,
      fiscal_invoice_required, fiscal_invoice_status, notes, created_by,
      recurring_template_id, reference_month, auto_generated, payment_method_id
    ) VALUES (
      'RECURRING', t.customer_id, t.description, t.category_id, t.cost_center_id,
      t.amount, CURRENT_DATE, _reference_date, 1, 'OPEN',
      COALESCE(t.fiscal_invoice_required, false),
      CASE WHEN COALESCE(t.fiscal_invoice_required, false) THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
      t.notes, v_user,
      t.id, date_trunc('month', _reference_date)::DATE, NOT _is_manual, t.payment_method_id
    ) RETURNING id INTO v_new_id;

    INSERT INTO public.recurring_generation_log(template_id, generated_entity_type, generated_entity_id, reference_date, amount, status, generated_by)
    VALUES (_template_id, 'RECEIVABLE', v_new_id, _reference_date, t.amount, 'SUCCESS', v_user);

    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
    VALUES ('RECURRING_TEMPLATE', _template_id, 'RECURRING_RECEIVABLE_GENERATED',
            jsonb_build_object('receivable_id', v_new_id, 'reference_date', _reference_date, 'amount', t.amount, 'manual', _is_manual),
            v_user);
  ELSE
    INSERT INTO public.accounts_payable(
      origin_type, supplier_name, description, category_id, cost_center_id,
      total_amount, issue_date, first_due_date, installment_count, status,
      notes, created_by,
      recurring_template_id, reference_month, auto_generated
    ) VALUES (
      'RECURRING', t.supplier_name, t.description, t.category_id, t.cost_center_id,
      t.amount, CURRENT_DATE, _reference_date, 1, 'OPEN',
      t.notes, v_user,
      t.id, date_trunc('month', _reference_date)::DATE, NOT _is_manual
    ) RETURNING id INTO v_new_id;

    INSERT INTO public.recurring_generation_log(template_id, generated_entity_type, generated_entity_id, reference_date, amount, status, generated_by)
    VALUES (_template_id, 'PAYABLE', v_new_id, _reference_date, t.amount, 'SUCCESS', v_user);

    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
    VALUES ('RECURRING_TEMPLATE', _template_id, 'RECURRING_PAYABLE_GENERATED',
            jsonb_build_object('payable_id', v_new_id, 'reference_date', _reference_date, 'amount', t.amount, 'manual', _is_manual),
            v_user);
  END IF;

  UPDATE public.recurring_financial_templates
    SET next_generation_date = public.fn_calc_next_generation_date(t.recurrence_frequency, _reference_date, t.due_day),
        updated_at = now()
    WHERE id = _template_id;

  UPDATE public.recurring_financial_templates
    SET active = false
    WHERE id = _template_id AND end_date IS NOT NULL AND next_generation_date > end_date;

  RETURN v_new_id;
END $function$;

-- ---------------------------------------------------------------------------
-- 2) recalc_partner_risk_score — trigger/sessão interna preservados; UI exige staff financeiro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_partner_risk_score(p_partner_id uuid)
 RETURNS partner_risk_scores
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dias_atraso numeric := 0;
  v_vencidos int := 0;
  v_pct numeric := 0;
  v_freq int := 0;
  v_meses int := 0;
  v_limite numeric := 0;
  v_aberto numeric := 0;
  v_score int := 0;
  v_level text := 'baixo';
  v_row public.partner_risk_scores;
BEGIN
  -- H7O: dentro de trigger (pg_trigger_depth()>0) ou sessão interna (sem JWT) segue livre;
  -- chamada autenticada direta exige staff financeiro.
  IF pg_trigger_depth() = 0 AND auth.uid() IS NOT NULL AND NOT public.is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501',
      HINT = 'H7O: recálculo de score de risco restrito ao staff financeiro.';
  END IF;

  IF p_partner_id IS NULL THEN RAISE EXCEPTION 'partner_id required'; END IF;

  SELECT COALESCE(AVG(GREATEST(0, CURRENT_DATE - ari.due_date)),0)::numeric,
         COUNT(*) FILTER (WHERE ari.status='OVERDUE' OR (ari.status IN ('OPEN','PARTIAL') AND ari.due_date < CURRENT_DATE))
    INTO v_dias_atraso, v_vencidos
  FROM accounts_receivable ar
  JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.origin_type='B2B_ORDER' AND ar.partner_id = p_partner_id
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  SELECT COALESCE(credit_limit,0) INTO v_limite FROM partner_financial_settings WHERE partner_id = p_partner_id;
  v_limite := COALESCE(v_limite,0);

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_aberto
  FROM accounts_receivable ar
  JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.origin_type='B2B_ORDER' AND ar.partner_id = p_partner_id
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  v_pct := CASE WHEN v_limite > 0 THEN LEAST(100,(v_aberto/v_limite)*100) ELSE 0 END;

  SELECT COUNT(*) INTO v_freq FROM partner_orders
   WHERE partner_id = p_partner_id AND created_at >= now() - interval '30 days'
     AND status NOT IN ('cancelado','reprovado');

  SELECT GREATEST(0, EXTRACT(YEAR FROM age(now(), pa.created_at))*12 + EXTRACT(MONTH FROM age(now(), pa.created_at)))::int
    INTO v_meses FROM partner_accounts pa WHERE id = p_partner_id;

  -- score (peso): atraso 35, vencidos 25, util 20, freq -10, relacionamento -10
  v_score := LEAST(100, GREATEST(0,
      ROUND(LEAST(v_dias_atraso/90.0,1)*35)
    + ROUND(LEAST(v_vencidos/5.0,1)*25)
    + ROUND((v_pct/100.0)*20)
    - ROUND(LEAST(v_freq/10.0,1)*10)
    - ROUND(LEAST(COALESCE(v_meses,0)/24.0,1)*10)
  ));
  v_level := CASE
    WHEN v_score <= 30 THEN 'baixo'
    WHEN v_score <= 60 THEN 'medio'
    WHEN v_score <= 80 THEN 'alto'
    ELSE 'critico' END;

  INSERT INTO partner_risk_scores (partner_id, score, risk_level, dias_medio_atraso, titulos_vencidos, pct_credito_utilizado, freq_compras_30d, meses_relacionamento, calculado_em)
  VALUES (p_partner_id, v_score, v_level, v_dias_atraso, v_vencidos, v_pct, v_freq, COALESCE(v_meses,0), now())
  ON CONFLICT (partner_id) DO UPDATE SET
    score = EXCLUDED.score,
    risk_level = EXCLUDED.risk_level,
    dias_medio_atraso = EXCLUDED.dias_medio_atraso,
    titulos_vencidos = EXCLUDED.titulos_vencidos,
    pct_credito_utilizado = EXCLUDED.pct_credito_utilizado,
    freq_compras_30d = EXCLUDED.freq_compras_30d,
    meses_relacionamento = EXCLUDED.meses_relacionamento,
    calculado_em = now()
  RETURNING * INTO v_row;

  INSERT INTO financial_governance_audit_log(usuario_id, partner_id, acao, dados_novos)
  VALUES (auth.uid(), p_partner_id, 'score_recalculado', to_jsonb(v_row));

  RETURN v_row;
END;$function$;

-- ---------------------------------------------------------------------------
-- 3) check_*_dependencies — LANGUAGE sql → plpgsql (mesmo JSON), guarda operacional/escopo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_cliente_dependencies(_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- H7O: staff operacional OU usuário com acesso ao cliente (carteira/vínculo ativo).
  IF NOT (public.is_operational_staff(v_uid)
          OR (_cliente_id IS NOT NULL AND public.can_user_access_cliente(v_uid, _cliente_id))) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501',
      HINT = 'H7O: consulta de dependências restrita ao staff operacional ou ao escopo do cliente.';
  END IF;

  RETURN jsonb_build_object(
    'fazendas',              (SELECT count(*) FROM fazendas WHERE cliente_id = _cliente_id),
    'talhoes',               (SELECT count(*) FROM talhoes t JOIN fazendas f ON f.id = t.fazenda_id WHERE f.cliente_id = _cliente_id),
    'ordens_servico',        (SELECT count(*) FROM ordens_servico WHERE cliente_id = _cliente_id),
    'ordens_servico_onfarm', (SELECT count(*) FROM ordens_servico_onfarm WHERE cliente_id = _cliente_id),
    'registros_consultor',   (SELECT count(*) FROM registros_consultor WHERE cliente_id = _cliente_id),
    'portal_solicitacoes',   (SELECT count(*) FROM portal_solicitacoes WHERE cliente_id = _cliente_id),
    'entregas',              (SELECT count(*) FROM entregas WHERE cliente_id = _cliente_id),
    'usuarios',              (SELECT count(*) FROM profiles WHERE cliente_id = _cliente_id)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.check_fazenda_dependencies(_fazenda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente uuid;
BEGIN
  SELECT f.cliente_id INTO v_cliente FROM fazendas f WHERE f.id = _fazenda_id;
  -- H7O: staff operacional OU usuário com acesso ao cliente dono da fazenda.
  IF NOT (public.is_operational_staff(v_uid)
          OR (v_cliente IS NOT NULL AND public.can_user_access_cliente(v_uid, v_cliente))) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501',
      HINT = 'H7O: consulta de dependências restrita ao staff operacional ou ao escopo do cliente.';
  END IF;

  RETURN jsonb_build_object(
    'talhoes',               (SELECT count(*) FROM talhoes WHERE fazenda_id = _fazenda_id),
    'ordens_servico',        (SELECT count(*) FROM ordens_servico WHERE fazenda_id = _fazenda_id),
    'ordens_servico_onfarm', (SELECT count(*) FROM ordens_servico_onfarm WHERE fazenda_id = _fazenda_id),
    'registros_consultor',   (SELECT count(*) FROM registros_consultor WHERE fazenda_id = _fazenda_id),
    'portal_solicitacoes',   (SELECT count(*) FROM portal_solicitacoes WHERE fazenda_id = _fazenda_id),
    'alertas_agronomicos',   (SELECT count(*) FROM alertas_agronomicos WHERE fazenda_id = _fazenda_id),
    'clima_dados',           (SELECT count(*) FROM clima_dados WHERE fazenda_id = _fazenda_id)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.check_talhao_dependencies(_talhao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente uuid;
BEGIN
  SELECT f.cliente_id INTO v_cliente
    FROM talhoes t JOIN fazendas f ON f.id = t.fazenda_id
   WHERE t.id = _talhao_id;
  -- H7O: staff operacional OU usuário com acesso ao cliente dono do talhão.
  IF NOT (public.is_operational_staff(v_uid)
          OR (v_cliente IS NOT NULL AND public.can_user_access_cliente(v_uid, v_cliente))) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501',
      HINT = 'H7O: consulta de dependências restrita ao staff operacional ou ao escopo do cliente.';
  END IF;

  RETURN jsonb_build_object(
    'ordens_servico',        (SELECT count(*) FROM ordens_servico WHERE talhao_id = _talhao_id),
    'ordens_servico_onfarm', (SELECT count(*) FROM ordens_servico_onfarm WHERE talhao_id = _talhao_id),
    'registros_consultor',   (SELECT count(*) FROM registros_consultor WHERE talhao_id = _talhao_id),
    'portal_solicitacoes',   (SELECT count(*) FROM portal_solicitacoes WHERE talhao_id = _talhao_id),
    'alertas_agronomicos',   (SELECT count(*) FROM alertas_agronomicos WHERE talhao_id = _talhao_id)
  );
END
$function$;

-- ---------------------------------------------------------------------------
-- 4) rpc_validar_integridade_esteira(text,uuid) — staff operacional.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_validar_integridade_esteira(p_origem text, p_os_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_integridade record;
BEGIN
    -- H7O: leitura de integridade da esteira restrita ao staff operacional.
    IF NOT public.is_operational_staff(auth.uid()) THEN
        RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501',
          HINT = 'H7O: validação de integridade da esteira restrita ao staff operacional.';
    END IF;

    SELECT * INTO v_integridade FROM vw_os_integridade_esteira WHERE os_id = p_os_id AND origem_os = p_origem;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Dados de integridade não encontrados');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'pode_finalizar', v_integridade.pode_finalizar,
        'detalhes', jsonb_build_object(
            'tem_programacao', v_integridade.tem_programacao,
            'tem_lote', v_integridade.tem_lote,
            'cq_resultado', v_integridade.cq_resultado,
            'tem_envase', v_integridade.tem_envase,
            'tem_estoque', v_integridade.tem_estoque,
            'entrega_confirmada', v_integridade.entrega_confirmada,
            'entrega_status', v_integridade.entrega_status
        )
    );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5) rpc_b2b_aging — plpgsql com 42501 (mesmos papéis do guard H7N; mesma consulta).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_b2b_aging(p_partner_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(faixa text, qtd_titulos integer, valor numeric, parceiros integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  -- H7O: autorização explícita (antes: filtro h7n_guarded devolvia 0 linhas).
  IF NOT (public.has_role(auth.uid(), 'administrador'::public.app_role)
       OR public.has_role(auth.uid(), 'gestor'::public.app_role)
       OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
       OR public.has_role(auth.uid(), 'gestor_comercial'::public.app_role)
       OR public.has_role(auth.uid(), 'administrativo'::public.app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501',
      HINT = 'H7O: aging B2B restrito a administrador/gestor/financeiro/gestor_comercial/administrativo.';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT ar.partner_id, ari.id,
           (ari.original_amount - ari.received_amount) AS saldo,
           GREATEST(0, (current_date - ari.due_date)) AS dias
    FROM public.accounts_receivable ar
    JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
    WHERE ar.origin_type = 'B2B_ORDER'
      AND ar.status <> 'CANCELED'
      AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
      AND (p_partner_id IS NULL OR ar.partner_id = p_partner_id)
  ), faixas AS (
    SELECT CASE
             WHEN dias <= 30 THEN '0-30'
             WHEN dias <= 60 THEN '31-60'
             WHEN dias <= 90 THEN '61-90'
             ELSE '90+'
           END AS faixa, partner_id, saldo
    FROM base
  )
  SELECT faixa, COUNT(*)::int, COALESCE(SUM(saldo),0), COUNT(DISTINCT partner_id)::int
  FROM faixas GROUP BY faixa
  ORDER BY CASE faixa WHEN '0-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 ELSE 4 END;
END
$function$;

-- ---------------------------------------------------------------------------
-- 6) rpc_b2b_partner_profitability — plpgsql com 42501 (mesmos papéis; mesma consulta).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_b2b_partner_profitability(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_partner_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(partner_id uuid, partner_name text, total_comprado numeric, total_recebido numeric, total_aberto numeric, ticket_medio numeric, qtd_pedidos integer, prazo_medio_pgto numeric, inadimplencia_pct numeric, risk_score integer, risk_level text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  -- H7O: autorização explícita (antes: filtro h7n_guarded devolvia 0 linhas).
  IF NOT (public.has_role(auth.uid(), 'administrador'::public.app_role)
       OR public.has_role(auth.uid(), 'gestor'::public.app_role)
       OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
       OR public.has_role(auth.uid(), 'gestor_comercial'::public.app_role)
       OR public.has_role(auth.uid(), 'administrativo'::public.app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501',
      HINT = 'H7O: rentabilidade B2B restrita a administrador/gestor/financeiro/gestor_comercial/administrativo.';
  END IF;

  RETURN QUERY
  WITH pedidos AS (
    SELECT po.partner_id, COUNT(*) AS qtd, SUM(po.total) AS total
    FROM partner_orders po
    WHERE po.status NOT IN ('cancelado','reprovado','rascunho')
      AND (p_from IS NULL OR po.created_at >= p_from)
      AND (p_to   IS NULL OR po.created_at <= (p_to + 1))
      AND (p_partner_id IS NULL OR po.partner_id = p_partner_id)
    GROUP BY po.partner_id
  ),
  recebidos AS (
    SELECT ar.partner_id,
      SUM(ari.received_amount) AS rec,
      SUM(ari.original_amount - ari.received_amount) FILTER (WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE')) AS aberto,
      AVG(CASE WHEN ari.paid_at IS NOT NULL THEN EXTRACT(EPOCH FROM (ari.paid_at - ar.issue_date))/86400 END) AS prazo_med,
      SUM(ari.original_amount - ari.received_amount) FILTER (WHERE ari.due_date < CURRENT_DATE AND ari.status IN ('OPEN','PARTIAL','OVERDUE')) AS vencido
    FROM accounts_receivable ar
    JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
    WHERE ar.origin_type='B2B_ORDER'
      AND (p_partner_id IS NULL OR ar.partner_id = p_partner_id)
    GROUP BY ar.partner_id
  )
  SELECT pa.id, COALESCE(pa.nome_fantasia, pa.razao_social),
    COALESCE(p.total,0),
    COALESCE(r.rec,0),
    COALESCE(r.aberto,0),
    CASE WHEN COALESCE(p.qtd,0) > 0 THEN ROUND(p.total/p.qtd,2) ELSE 0 END,
    COALESCE(p.qtd,0)::int,
    ROUND(COALESCE(r.prazo_med,0)::numeric,2),
    CASE WHEN COALESCE(p.total,0) > 0 THEN ROUND((COALESCE(r.vencido,0)/p.total)*100,2) ELSE 0 END,
    COALESCE(prs.score,0),
    COALESCE(prs.risk_level,'baixo')
  FROM partner_accounts pa
  LEFT JOIN pedidos p ON p.partner_id = pa.id
  LEFT JOIN recebidos r ON r.partner_id = pa.id
  LEFT JOIN partner_risk_scores prs ON prs.partner_id = pa.id
  WHERE pa.ativo = true AND pa.deleted_at IS NULL
    AND (p_partner_id IS NULL OR pa.id = p_partner_id)
    AND (p.qtd IS NOT NULL OR r.rec IS NOT NULL)
  ORDER BY COALESCE(p.total,0) DESC;
END
$function$;

-- ---------------------------------------------------------------------------
-- ACLs: inalteradas (authenticated/service_role). Reafirma ausência de anon/PUBLIC.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_generate_recurring_title(uuid,date,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recalc_partner_risk_score(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_cliente_dependencies(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_fazenda_dependencies(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_talhao_dependencies(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_validar_integridade_esteira(text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_b2b_aging(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_b2b_partner_profitability(date,date,uuid) FROM PUBLIC, anon;

-- Pós-condição fail-fast: todas as 8 funções contêm a guarda 42501 e continuam SECURITY DEFINER com search_path fixo.
DO $post$
DECLARE
  v_bad text := '';
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.prosrc, p.prosecdef, p.proconfig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.oid IN (
         'public.fn_generate_recurring_title(uuid,date,boolean)'::regprocedure,
         'public.recalc_partner_risk_score(uuid)'::regprocedure,
         'public.check_cliente_dependencies(uuid)'::regprocedure,
         'public.check_fazenda_dependencies(uuid)'::regprocedure,
         'public.check_talhao_dependencies(uuid)'::regprocedure,
         'public.rpc_validar_integridade_esteira(text,uuid)'::regprocedure,
         'public.rpc_b2b_aging(uuid)'::regprocedure,
         'public.rpc_b2b_partner_profitability(date,date,uuid)'::regprocedure)
  LOOP
    IF r.prosrc NOT LIKE '%42501%' OR NOT r.prosecdef OR r.proconfig IS NULL
       OR has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      v_bad := v_bad || ' ' || r.proname;
    END IF;
  END LOOP;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'H7O P1 ABORT: pós-condição violada em:%', v_bad;
  END IF;
END
$post$;

-- ============================================================
-- FASE 7 (correção consolidada) — evidências runtime P1..P10
-- Ambiente: STAGING ikaauvsflpmamgxmkhoq (fail-fast abaixo)
-- ============================================================
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker) THEN
    RAISE EXCEPTION 'ambiente_nao_staging: marker ausente';
  END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS public._motor_b2b_fase7_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  proof text NOT NULL,
  result text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public._motor_b2b_fase7_proofs TO authenticated;
GRANT ALL ON public._motor_b2b_fase7_proofs TO service_role;
ALTER TABLE public._motor_b2b_fase7_proofs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_b2b_proofs" ON public._motor_b2b_fase7_proofs;
CREATE POLICY "admin_read_b2b_proofs" ON public._motor_b2b_fase7_proofs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'administrador'::app_role));

DO $harness$
DECLARE
  v_run uuid := gen_random_uuid();
  v_admin uuid;
  v_partner uuid;
  v_partner_user uuid;
  v_plan uuid;
  v_item uuid;
  v_items jsonb;
  v_cart jsonb;
  v_hash text;
  v_final numeric;
  v_res jsonb;
  v_order_a uuid;
  v_order_b uuid;
  v_recv jsonb;
  v_recv_id uuid;
  v_status text;
  v_n int;
  v_err text;
BEGIN
  PERFORM set_config('search_path','public',true);

  SELECT user_id INTO v_admin FROM public.user_roles WHERE role='administrador' LIMIT 1;
  SELECT pa.id INTO v_partner FROM public.partner_accounts pa WHERE pa.ativo LIMIT 1;
  SELECT pu.user_id INTO v_partner_user FROM public.partner_users pu WHERE pu.partner_id=v_partner LIMIT 1;
  SELECT id INTO v_plan FROM public.commercial_payment_plans WHERE code='cash_7d' AND active LIMIT 1;
  SELECT p.id INTO v_item FROM public.produtos p
    WHERE p.ativo AND p.b2b_enabled AND COALESCE(p.valor_litro_brl,0) > 0 LIMIT 1;

  IF v_admin IS NULL OR v_partner IS NULL OR v_partner_user IS NULL OR v_plan IS NULL OR v_item IS NULL THEN
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details)
    VALUES (v_run,'P0-PRECONDICOES','FAIL',jsonb_build_object(
      'admin',v_admin,'partner',v_partner,'partner_user',v_partner_user,'plan',v_plan,'item',v_item));
    RETURN;
  END IF;

  INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details)
  VALUES (v_run,'P0-PRECONDICOES','PASS',jsonb_build_object(
    'partner',v_partner,'plan_code','cash_7d','item',v_item));

  -- impersona admin
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);

  v_items := jsonb_build_array(jsonb_build_object('item_tipo','produto','item_id',v_item,'quantidade',10));

  -- P1: resolução de carrinho + hash autoritativo
  BEGIN
    v_cart := public.fn_resolve_b2b_cart(v_partner, v_plan, v_items, current_date);
    v_final := CASE WHEN COALESCE((v_cart->>'quote_required')::boolean,false) THEN 0
                    ELSE public.fn_b2b_apply_interest((v_cart->>'net_amount')::numeric,
                         (SELECT interest_type FROM public.commercial_payment_plans WHERE id=v_plan),
                         (SELECT monthly_interest_percent FROM public.commercial_payment_plans WHERE id=v_plan),
                         (SELECT months_count FROM public.commercial_payment_plans WHERE id=v_plan)) END;
    v_hash := public.fn_b2b_cart_hash(v_partner, v_plan, v_cart, v_final);
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
      (v_run,'P1-CART-HASH', CASE WHEN v_hash IS NOT NULL AND COALESCE((v_cart->>'net_amount')::numeric,0) > 0 THEN 'PASS' ELSE 'FAIL' END,
       jsonb_build_object('net_amount',v_cart->>'net_amount','final',v_final,'quote_required',v_cart->>'quote_required','hash_len',length(v_hash)));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P1-CART-HASH','FAIL',jsonb_build_object('error',v_err));
    RETURN;
  END;

  -- P2: criação de pedido com hash correto
  BEGIN
    v_res := public.create_partner_order_secure(v_partner,'FASE7-PROOF',v_items,NULL,v_plan,NULL,NULL,v_hash,'F7-'||v_run::text||'-A');
    v_order_a := (v_res->>'order_id')::uuid;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
      (v_run,'P2-CREATE-ORDER', CASE WHEN v_order_a IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, jsonb_build_object('result',v_res));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P2-CREATE-ORDER','FAIL',jsonb_build_object('error',v_err));
    RETURN;
  END;

  -- P3: hash inválido deve ser rejeitado
  BEGIN
    PERFORM public.create_partner_order_secure(v_partner,'FASE7-PROOF',v_items,NULL,v_plan,NULL,NULL,'hash_invalido','F7-'||v_run::text||'-X');
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P3-HASH-INVALIDO','FAIL',jsonb_build_object('esperado','price_changed','obtido','sem erro'));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
      (v_run,'P3-HASH-INVALIDO', CASE WHEN v_err LIKE 'price_changed%' THEN 'PASS' ELSE 'FAIL' END, jsonb_build_object('error',v_err));
  END;

  -- P4: replay com mesma chave retorna o MESMO pedido (idempotência)
  BEGIN
    v_res := public.create_partner_order_secure(v_partner,'FASE7-PROOF',v_items,NULL,v_plan,NULL,NULL,v_hash,'F7-'||v_run::text||'-A');
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
      (v_run,'P4-IDEMPOTENCIA-REPLAY', CASE WHEN (v_res->>'order_id')::uuid = v_order_a THEN 'PASS' ELSE 'FAIL' END,
       jsonb_build_object('order_a',v_order_a,'replay',v_res->>'order_id'));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P4-IDEMPOTENCIA-REPLAY','FAIL',jsonb_build_object('error',v_err));
  END;

  -- P5: mesma chave + carrinho divergente => idempotency_conflict
  BEGIN
    PERFORM public.create_partner_order_secure(v_partner,'FASE7-PROOF',v_items,NULL,v_plan,NULL,NULL,v_hash||'z','F7-'||v_run::text||'-A');
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P5-IDEMPOTENCIA-CONFLITO','FAIL',jsonb_build_object('esperado','idempotency_conflict','obtido','sem erro'));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
      (v_run,'P5-IDEMPOTENCIA-CONFLITO', CASE WHEN v_err LIKE 'idempotency_conflict%' THEN 'PASS' ELSE 'FAIL' END, jsonb_build_object('error',v_err));
  END;

  -- P5b: unicidade física (partner_id, idempotency_key)
  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname='public' AND tablename='partner_order_idempotency' AND indexdef ILIKE '%UNIQUE%(partner_id, idempotency_key)%';
  INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
    (v_run,'P5B-UNIQUE-INDEX', CASE WHEN v_n=1 THEN 'PASS' ELSE 'FAIL' END, jsonb_build_object('indices',v_n));

  -- segundo pedido para provas de rejeição/segregação
  BEGIN
    v_res := public.create_partner_order_secure(v_partner,'FASE7-PROOF',v_items,NULL,v_plan,NULL,NULL,v_hash,'F7-'||v_run::text||'-B');
    v_order_b := (v_res->>'order_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P0-ORDER-B','FAIL',jsonb_build_object('error',v_err));
  END;

  -- P6: parceiro (não interno) não pode aprovar
  IF v_order_b IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_partner_user,'role','authenticated')::text, true);
    BEGIN
      PERFORM public.approve_partner_order(v_order_b, 'tentativa indevida', NULL);
      INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P6-SEGREGACAO-APROVACAO','FAIL',jsonb_build_object('esperado','forbidden','obtido','sem erro'));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
        (v_run,'P6-SEGREGACAO-APROVACAO', CASE WHEN v_err LIKE 'forbidden%' THEN 'PASS' ELSE 'FAIL' END, jsonb_build_object('error',v_err));
    END;

    -- P10: catálogo com preço para o parceiro
    BEGIN
      SELECT count(*) INTO v_n FROM public.get_partner_catalog_secure(v_partner) c
       WHERE (to_jsonb(c)->>'preco_unitario') IS NOT NULL;
      INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
        (v_run,'P10-CATALOGO-PRECIFICADO', CASE WHEN v_n > 0 THEN 'PASS' ELSE 'FAIL' END, jsonb_build_object('itens_com_preco',v_n));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P10-CATALOGO-PRECIFICADO','FAIL',jsonb_build_object('error',v_err));
    END;

    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  END IF;

  -- P7: aprovação pelo admin
  BEGIN
    PERFORM public.approve_partner_order(v_order_a, 'aprovado no harness', NULL);
    SELECT status::text INTO v_status FROM public.partner_orders WHERE id=v_order_a;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
      (v_run,'P7-APROVACAO', CASE WHEN v_status='aprovado' THEN 'PASS' ELSE 'FAIL' END, jsonb_build_object('status',v_status));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P7-APROVACAO','FAIL',jsonb_build_object('error',v_err));
  END;

  -- P7b: dupla aprovação bloqueada
  BEGIN
    PERFORM public.approve_partner_order(v_order_a, 'dupla', NULL);
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P7B-DUPLA-APROVACAO','FAIL',jsonb_build_object('esperado','already_processed','obtido','sem erro'));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
      (v_run,'P7B-DUPLA-APROVACAO', CASE WHEN v_err LIKE 'already_processed%' THEN 'PASS' ELSE 'FAIL' END, jsonb_build_object('error',v_err));
  END;

  -- P8: rejeição de pedido já aprovado deve falhar
  BEGIN
    PERFORM public.reject_partner_order(v_order_a, 'tentativa apos aprovacao');
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P8-REJEICAO-POS-APROVACAO','FAIL',jsonb_build_object('obtido','sem erro'));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P8-REJEICAO-POS-APROVACAO','PASS',jsonb_build_object('error',v_err));
  END;

  -- P8b: rejeição válida do pedido B
  IF v_order_b IS NOT NULL THEN
    BEGIN
      PERFORM public.reject_partner_order(v_order_b, 'reprovado no harness');
      SELECT status::text INTO v_status FROM public.partner_orders WHERE id=v_order_b;
      INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
        (v_run,'P8B-REJEICAO-VALIDA', CASE WHEN v_status='reprovado' THEN 'PASS' ELSE 'FAIL' END, jsonb_build_object('status',v_status));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P8B-REJEICAO-VALIDA','FAIL',jsonb_build_object('error',v_err));
    END;
  END IF;

  -- P9: geração de recebível + parcelas
  BEGIN
    v_recv := public.generate_b2b_receivable_secure(v_order_a);
    v_recv_id := NULLIF(v_recv->>'receivable_id','')::uuid;
    SELECT count(*) INTO v_n FROM public.accounts_receivable_installments WHERE receivable_id = v_recv_id;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
      (v_run,'P9-RECEBIVEL', CASE WHEN v_recv_id IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
       jsonb_build_object('resultado',v_recv,'parcelas',v_n));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES (v_run,'P9-RECEBIVEL','FAIL',jsonb_build_object('error',v_err));
  END;

  -- P9b: recebível não pode ser duplicado
  BEGIN
    v_res := public.generate_b2b_receivable_secure(v_order_a);
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
      (v_run,'P9B-RECEBIVEL-IDEMPOTENTE',
       CASE WHEN NULLIF(v_res->>'receivable_id','')::uuid = v_recv_id THEN 'PASS' ELSE 'FAIL' END,
       jsonb_build_object('primeiro',v_recv_id,'segundo',v_res->>'receivable_id'));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
      (v_run,'P9B-RECEBIVEL-IDEMPOTENTE','PASS',jsonb_build_object('bloqueado_com_erro',v_err));
  END;

  -- ============ LIMPEZA DAS FIXTURES ============
  DELETE FROM public.partner_order_payment_schedule WHERE partner_order_id IN (v_order_a, v_order_b);
  DELETE FROM public.partner_order_financial_links WHERE partner_order_id IN (v_order_a, v_order_b);
  IF v_recv_id IS NOT NULL THEN
    DELETE FROM public.accounts_receivable_installments WHERE receivable_id = v_recv_id;
    DELETE FROM public.accounts_receivable WHERE id = v_recv_id;
  END IF;
  DELETE FROM public.partner_order_idempotency WHERE order_id IN (v_order_a, v_order_b);
  DELETE FROM public.partner_order_payment_terms WHERE partner_order_id IN (v_order_a, v_order_b);
  DELETE FROM public.partner_order_items WHERE order_id IN (v_order_a, v_order_b);
  DELETE FROM public.partner_order_audit_logs WHERE order_id IN (v_order_a, v_order_b);
  DELETE FROM public.partner_orders WHERE id IN (v_order_a, v_order_b);

  SELECT count(*) INTO v_n FROM public.partner_orders WHERE id IN (v_order_a, v_order_b);
  INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
    (v_run,'P11-CLEANUP', CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL' END, jsonb_build_object('pedidos_remanescentes',v_n));

  PERFORM set_config('request.jwt.claims', NULL, true);
END $harness$;
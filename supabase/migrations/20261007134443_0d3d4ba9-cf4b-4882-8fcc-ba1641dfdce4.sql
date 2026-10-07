-- Destino canônico confirmado: swzpzcwiasxmjutrmvkm.
-- Correção focal FINANCIAL_TENANT_REQUIRED; sem outbox/retry ou dados reais.
DO $fix$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.generate_b2b_receivable_secure_impl(uuid)'::regprocedure);
 IF position('b2b_f1_financial_tenant' IN d)>0 THEN RETURN; END IF;
 IF position('  v_uf text;' IN d)=0 OR position('    origin_type, origin_id, customer_id, partner_id, description,' IN d)=0 OR position('      receivable_id, installment_number, due_date,' IN d)=0 THEN RAISE EXCEPTION 'b2b_f1_financial_anchor_missing'; END IF;
 d:=replace(d,'  v_uf text;',E'  v_uf text;\n  v_org uuid;\n  v_org_count integer; -- b2b_f1_financial_tenant');
 d:=replace(d,'  -- GATE Fase C: elegibilidade server-side',E'  -- Deterministic partner ownership, never caller-supplied organization.\n  SELECT count(*), min(o.id::text)::uuid INTO v_org_count,v_org\n    FROM public.organizations o WHERE o.partner_account_id=v_order.partner_id;\n  IF v_org_count <> 1 OR v_org IS NULL THEN\n    RAISE EXCEPTION ''B2B_FINANCIAL_TENANT_AMBIGUOUS'' USING ERRCODE=''42501'';\n  END IF;\n  IF v_uid IS NOT NULL THEN\n    PERFORM platform_private.assert_b2b_partner_scope(v_uid,v_order.partner_id);\n    IF NOT public.is_platform_superadmin(v_uid) AND public.h15_actor_organization() IS DISTINCT FROM v_org THEN\n      RAISE EXCEPTION ''B2B_FINANCIAL_TENANT_MISMATCH'' USING ERRCODE=''42501'';\n    END IF;\n  END IF;\n\n  -- GATE Fase C: elegibilidade server-side');
 d:=replace(d,'    origin_type, origin_id, customer_id, partner_id, description,','    organization_id, origin_type, origin_id, customer_id, partner_id, description,');
 d:=replace(d,'''B2B_ORDER'', p_partner_order_id,','v_org, ''B2B_ORDER'', p_partner_order_id,');
 d:=replace(d,'      receivable_id, installment_number, due_date,','      organization_id, receivable_id, installment_number, due_date,');
 d:=replace(d,'      v_receivable_id, v_sch.installment_number, v_sch.due_date,','      v_org, v_receivable_id, v_sch.installment_number, v_sch.due_date,');
 EXECUTE d;
END $fix$;
REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) TO service_role;
-- Rollback reviewed: restore implementation from pre-fix inventory (20260917000000),
-- retain service-only ACL and current wrapper tenant checks; reopens title failure.

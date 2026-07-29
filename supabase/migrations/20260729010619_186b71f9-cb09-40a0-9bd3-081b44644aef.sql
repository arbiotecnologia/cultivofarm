DO $c$
DECLARE
  v_ref text;
  v_partner_b uuid := '0f0f0f0f-0000-4000-8000-00000000000b';
  v_cli_b uuid := '0f0f0f0f-0000-4000-8000-0000000000cb';
  u_gestor_b uuid := '7c04c4d1-6892-44cc-97b4-25eae04f46ea';
  u_prod_b uuid := '8e9c2ca1-eaf1-4e5b-9fe0-2cb729634dca';
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN RAISE EXCEPTION 'STAGING_GUARD: ambiente invalido %', v_ref; END IF;

  DELETE FROM public.accounts_receivable_installments i
   USING public.accounts_receivable ar
   WHERE ar.id = i.receivable_id AND ar.description LIKE 'FASE02-HARNESS%';
  DELETE FROM public.accounts_receivable WHERE description LIKE 'FASE02-HARNESS%';

  DELETE FROM public.partner_order_payment_schedule s
   USING public.partner_order_payment_terms t
   WHERE t.id = s.payment_terms_id AND t.plan_code_snapshot = 'FASE02-HARNESS';
  DELETE FROM public.partner_order_payment_terms WHERE plan_code_snapshot = 'FASE02-HARNESS';

  DELETE FROM public.partner_order_audit_logs WHERE order_id IN (
    '0f0f0f0f-0000-4000-8000-0000000000a1','0f0f0f0f-0000-4000-8000-0000000000b1');
  DELETE FROM public.partner_orders WHERE id IN (
    '0f0f0f0f-0000-4000-8000-0000000000a1','0f0f0f0f-0000-4000-8000-0000000000b1');

  DELETE FROM public.user_roles WHERE user_id = u_prod_b AND role = 'cliente_produtor';
  DELETE FROM public.user_clientes WHERE user_id = u_prod_b AND cliente_id = v_cli_b;
  DELETE FROM public.user_roles WHERE user_id = u_gestor_b AND role = 'parceiro_b2b';
  DELETE FROM public.partner_users WHERE user_id = u_gestor_b AND partner_id = v_partner_b;
  DELETE FROM public.clientes WHERE id = v_cli_b;
  DELETE FROM public.partner_accounts WHERE id = v_partner_b;
END $c$;
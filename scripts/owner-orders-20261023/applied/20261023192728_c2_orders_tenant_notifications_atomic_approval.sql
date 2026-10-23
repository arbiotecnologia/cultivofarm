-- C2-ORD safety slice: notifications and atomic approval only; writer remains unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE FUNCTION pg_temp.c2_swap(d text, o text, n text, tag text) RETURNS text LANGUAGE plpgsql AS $s$
BEGIN
  IF o IS NULL OR length(o) = 0 OR (length(d) - length(replace(d, o, ''))) / length(o) <> 1 THEN
    RAISE EXCEPTION 'fragment_not_unique:%', tag;
  END IF;
  RETURN replace(d, o, n);
END $s$;

DO $$ BEGIN
IF md5(pg_get_functiondef('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'::regprocedure)) <> '85be378d0751a26470cb98cc641a230f'
OR md5(pg_get_functiondef('public.approve_partner_order(uuid,text,date)'::regprocedure)) <> '8e266945b058393ce780b1d10b20f6b3'
OR md5(pg_get_functiondef('public.tg_auto_b2b_receivable()'::regprocedure)) <> '0b11150214b3bded49e1a7e1a4b0e80e' THEN RAISE EXCEPTION 'baseline_drift'; END IF;
END $$;
CREATE FUNCTION platform_private.c2_order_internal_recipients(_partner uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT DISTINCT ur.user_id
    FROM public.partner_accounts pa
    JOIN public.organizations o ON o.id = pa.commercial_owner_organization_id AND o.ativo IS TRUE AND o.status = 'ativa'
    JOIN public.profiles p ON p.organization_id = o.id AND p.ativo IS TRUE
    JOIN public.user_roles ur ON ur.user_id = p.user_id
   WHERE pa.id = _partner AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
     AND ur.role IN ('administrador'::public.app_role,'gestor_comercial'::public.app_role);
$function$;
CREATE FUNCTION platform_private.c2_order_partner_recipients(_partner uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT DISTINCT pu.user_id
    FROM public.partner_users pu
    JOIN public.partner_accounts pa ON pa.id = pu.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
    JOIN public.profiles p ON p.user_id = pu.user_id AND p.ativo IS TRUE AND p.organization_id = pu.tenant_id
   WHERE pu.partner_id = _partner AND pu.revoked_at IS NULL
     AND (pu.valid_from IS NULL OR pu.valid_from <= now())
     AND public.is_valid_b2b_partner_user(pu.user_id, pu.partner_id);
$function$;
REVOKE ALL ON FUNCTION platform_private.c2_order_internal_recipients(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform_private.c2_order_partner_recipients(uuid) FROM PUBLIC, anon, authenticated;

DO $$ DECLARE d text; BEGIN
  -- (G) notificação de novo pedido: só admin/gestor_comercial ativos do tenant dono.
  d := pg_get_functiondef('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'::regprocedure);
  d := pg_temp.c2_swap(d,
$o$    SELECT DISTINCT ur.user_id FROM public.user_roles ur
     WHERE ur.role IN ('administrador','gestor_comercial')$o$,
$n$    SELECT r AS user_id FROM platform_private.c2_order_internal_recipients(p_partner_id) r -- c2_ord_recipients$n$, 'create_recipients');
  EXECUTE d;
  -- (G) notificação de aprovação: só vínculos vigentes e perfis ativos.
  d := pg_get_functiondef('public.approve_partner_order(uuid,text,date)'::regprocedure);
  d := pg_temp.c2_swap(d,
$o$  FOR v_partner_user IN SELECT user_id FROM public.partner_users WHERE partner_id = v_pid LOOP$o$,
$n$  FOR v_partner_user IN SELECT r FROM platform_private.c2_order_partner_recipients(v_pid) r LOOP -- c2_ord_recipients$n$, 'approve_recipients');
  EXECUTE d;

  -- (E) aprovação atômica com cobrança na aprovação.
  d := pg_get_functiondef('public.tg_auto_b2b_receivable()'::regprocedure);
  d := pg_temp.c2_swap(d,
$o$    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, acao, dados_novos)$o$,
$n$    EXCEPTION WHEN OTHERS THEN
      -- c2_ord_atomic_approval: sem título, a aprovação não acontece (rollback do UPDATE).
      IF v_settings.billing_trigger = 'na_aprovacao' THEN
        RAISE EXCEPTION 'B2B_APPROVAL_BILLING_FAILED: %', SQLERRM USING ERRCODE='P0001';
      END IF;
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, acao, dados_novos)$n$, 'trigger');
  EXECUTE d;

END $$;
DO $$ BEGIN
IF EXISTS (
 SELECT 1 FROM public.partner_accounts pa
 CROSS JOIN LATERAL platform_private.c2_order_internal_recipients(pa.id) r
 JOIN public.profiles p ON p.user_id=r
 WHERE p.organization_id IS DISTINCT FROM pa.commercial_owner_organization_id OR p.ativo IS NOT TRUE
) THEN RAISE EXCEPTION 'recipient_tenant_postcondition_failed'; END IF;
IF EXISTS (
 SELECT 1 FROM public.partner_accounts pa
 CROSS JOIN LATERAL platform_private.c2_order_partner_recipients(pa.id) r
 WHERE NOT EXISTS (SELECT 1 FROM public.partner_users pu JOIN public.profiles p ON p.user_id=pu.user_id
 WHERE pu.user_id=r AND pu.partner_id=pa.id AND pu.revoked_at IS NULL AND p.ativo IS TRUE AND p.organization_id=pu.tenant_id)
) THEN RAISE EXCEPTION 'recipient_link_postcondition_failed'; END IF;
IF has_function_privilege('authenticated','platform_private.c2_order_internal_recipients(uuid)','EXECUTE')
OR has_function_privilege('anon','platform_private.c2_order_internal_recipients(uuid)','EXECUTE')
OR has_function_privilege('authenticated','platform_private.c2_order_partner_recipients(uuid)','EXECUTE')
OR has_function_privilege('anon','platform_private.c2_order_partner_recipients(uuid)','EXECUTE')
THEN RAISE EXCEPTION 'helper_acl_exposed'; END IF;
END $$;
COMMIT;

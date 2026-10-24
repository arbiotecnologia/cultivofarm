CREATE FUNCTION platform_private.c2_external_origin_contract_valid(s jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
 SELECT coalesce(
  (s->>'contract'='C2_EXTERNAL_ORDER_ORIGIN_V1' AND platform_private.b2b_internal_origin_valid(s))
  OR (jsonb_typeof(s)='object' AND s->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' AND s->>'schema_version'='1'
      AND nullif(s->>'organization_id','') IS NOT NULL AND s->>'organization_id'=s->>'creditor_organization_id'
      AND nullif(s->>'actor_user_id','') IS NOT NULL AND nullif(s->>'partner_id','') IS NOT NULL
      AND s->'accounting_validated'='false'::jsonb
      AND NOT (s ? 'issuer_organization_id') AND NOT (s ? 'issuer_legal_name') AND NOT (s ? 'issuer_cnpj')
      AND s->>'issuer_state' IS NOT NULL),false)
$function$;
ALTER FUNCTION platform_private.c2_external_origin_contract_valid(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.c2_external_origin_contract_valid(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION platform_private.c2_accounting_promotion_ok(o jsonb, n jsonb, order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
 SELECT coalesce(o->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1'
  AND n->>'contract'='C2_EXTERNAL_ORDER_ORIGIN_V1' AND platform_private.b2b_internal_origin_valid(n)
  AND n->>'organization_id'=o->>'organization_id' AND n->>'partner_id'=o->>'partner_id' AND n->>'actor_user_id'=o->>'actor_user_id'
  AND n->>'promoted_from_contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1'
  AND platform_private.has_ticket('c2_accounting_promote',order_id),false)
$function$;
ALTER FUNCTION platform_private.c2_accounting_promotion_ok(jsonb,jsonb,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.c2_accounting_promotion_ok(jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION platform_private.c2_accounting_pending_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
 -- While pending, only commercial review/quote, rejection or cancellation are possible: no approval,
 -- credit decision, economics seal, receivable, production, NF or delivery.
 -- INSERT: the canonical create may land in em_analise_comercial, aguardando_cotacao or (insufficient credit)
 -- aguardando_aprovacao_credito; nothing operational/financial may be set at creation.
 IF TG_OP='INSERT' THEN
  IF NEW.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' AND (
     NEW.status::text NOT IN ('em_analise_comercial','aguardando_cotacao','aguardando_aprovacao_credito')
     OR NEW.ready_for_production IS TRUE OR NEW.receivable_generated IS TRUE OR NEW.internal_economic_snapshot IS NOT NULL
     OR NEW.credit_approved_at IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
   RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1'
    AND NEW.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' THEN
  -- aguardando_aprovacao_credito may only stay as is (no hidden credit decision) or leave to cancel/reject.
  IF NOT (NEW.status::text IN ('em_analise_comercial','aguardando_cotacao','cancelado','reprovado')
          OR (NEW.status=OLD.status AND OLD.status::text='aguardando_aprovacao_credito'))
     OR (OLD.status::text='aguardando_aprovacao_credito' AND NEW.status::text IN ('em_analise_comercial','aguardando_cotacao'))
     OR NEW.ready_for_production IS TRUE OR NEW.receivable_generated IS TRUE OR NEW.internal_economic_snapshot IS NOT NULL
     OR NEW.credit_approved_at IS DISTINCT FROM OLD.credit_approved_at OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
   RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $function$;
ALTER FUNCTION platform_private.c2_accounting_pending_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.c2_accounting_pending_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_c2_accounting_pending BEFORE INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION platform_private.c2_accounting_pending_guard();

CREATE FUNCTION public.c2_promote_accounting_pending_order_v1(p_order_id uuid, p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE uid uuid:=auth.uid(); o public.partner_orders; cs public.company_fiscal_settings; n integer; org uuid; v1 jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.partner_orders WHERE id=p_order_id FOR UPDATE;
 -- Same denial for missing and foreign orders: no existence oracle.
 IF NOT FOUND OR NOT platform_private.b2b_internal_commercial_actor()
    OR public.h15_actor_organization()::text IS DISTINCT FROM o.c2_external_origin_snapshot->>'organization_id'
    OR NOT platform_private.c2p1_settings_allowed(o.partner_id,true) THEN
  RAISE EXCEPTION 'C2AP_ORDER_DENIED' USING ERRCODE='42501';
 END IF;
 IF o.c2_external_origin_snapshot->>'contract' IS DISTINCT FROM 'C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' THEN RAISE EXCEPTION 'C2AP_NOT_PENDING' USING ERRCODE='22023'; END IF;
 IF p_expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'C2AP_STALE' USING ERRCODE='40001'; END IF;
 IF o.status::text NOT IN ('em_analise_comercial','aguardando_cotacao','aguardando_aprovacao_credito') THEN RAISE EXCEPTION 'C2AP_STATUS_DENIED' USING ERRCODE='42501'; END IF;
 org:=(o.c2_external_origin_snapshot->>'organization_id')::uuid;
 SELECT count(*) INTO n FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active;
 IF n=1 THEN SELECT * INTO cs FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active FOR SHARE; END IF;
 IF n<>1 OR cs.configuration_status IS DISTINCT FROM 'VALIDATED' OR cs.accounting_validated_at IS NULL OR nullif(btrim(cs.legal_name),'') IS NULL OR nullif(btrim(cs.cnpj),'') IS NULL THEN
  RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501';
 END IF;
 v1:=jsonb_build_object('contract','C2_EXTERNAL_ORDER_ORIGIN_V1','schema_version','1','organization_id',org,'creditor_organization_id',org,'issuer_organization_id',org,'company_settings_id',cs.id,'company_configuration_version',cs.configuration_version,'issuer_legal_name',cs.legal_name,'issuer_cnpj',cs.cnpj,'actor_user_id',o.c2_external_origin_snapshot->>'actor_user_id','partner_id',o.partner_id,'promoted_from_contract','C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1','accounting_promoted_by',uid,'accounting_promoted_at',now());
 PERFORM platform_private.issue_ticket('c2_accounting_promote',p_order_id);
 UPDATE public.partner_orders SET c2_external_origin_snapshot=v1, updated_at=now() WHERE id=p_order_id;
 INSERT INTO public.partner_order_audit_logs(id,order_id,partner_id,usuario_id,acao,dados_anteriores,dados_novos,created_at)
 VALUES(gen_random_uuid(),p_order_id,o.partner_id,uid,'c2_accounting_pending_promoted',jsonb_build_object('origin',o.c2_external_origin_snapshot),jsonb_build_object('origin',v1),now());
 RETURN jsonb_build_object('order_id',p_order_id,'contract','C2_EXTERNAL_ORDER_ORIGIN_V1');
END $function$;
ALTER FUNCTION public.c2_promote_accounting_pending_order_v1(uuid,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.c2_promote_accounting_pending_order_v1(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.c2_promote_accounting_pending_order_v1(uuid,timestamptz) TO authenticated,service_role;

BEGIN;
DO $s$ BEGIN
 IF to_regclass('public.ordens_servico') IS NULL THEN
  CREATE TABLE public.ordens_servico(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, partner_order_id uuid REFERENCES public.partner_orders(id),
   partner_order_item_id uuid, origem text, produto_id uuid, microrganismo_id uuid);
  REVOKE ALL ON public.ordens_servico FROM PUBLIC; END IF;
 IF to_regclass('public.entregas') IS NULL THEN
  CREATE TABLE public.entregas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, partner_order_id uuid, receivable_id uuid,
   ordem_servico_id uuid REFERENCES public.ordens_servico(id), ordem_servico_onfarm_id uuid, cliente_id uuid, produto_id uuid, status text, quantidade_entregue numeric);
  REVOKE ALL ON public.entregas FROM PUBLIC; END IF;
END $s$;
CREATE TABLE IF NOT EXISTS platform_private.delivery_context_20261030(txid bigint NOT NULL PRIMARY KEY, actor uuid NOT NULL, organization_id uuid NOT NULL,
  action text NOT NULL, target uuid, consumed boolean DEFAULT false NOT NULL, item uuid, delivery uuid, mutation text);
CREATE TABLE platform_private.b2b_resale_logistics_gate_v1(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO platform_private.b2b_resale_logistics_gate_v1(singleton,enabled) VALUES(true,false);
ALTER TABLE platform_private.b2b_resale_logistics_gate_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.b2b_resale_logistics_gate_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.is_valid_b2b_partner_user(p_user_id uuid, p_partner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT platform_private.platform_actor_access_ready(p_user_id)
 AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id
 JOIN public.partner_users pu ON pu.user_id=p.user_id
 JOIN public.partner_accounts pa ON pa.id=pu.partner_id
 JOIN public.organizations owner ON owner.id=pa.commercial_owner_organization_id
 WHERE p.user_id=p_user_id AND pa.id=p_partner_id AND p.ativo AND o.ativo AND o.status='ativa'
 AND owner.ativo AND owner.status='ativa' AND pa.ativo AND pa.deleted_at IS NULL
 AND p.organization_id=pu.tenant_id AND pu.tenant_id=owner.id
 AND (o.partner_account_id IS NULL OR o.partner_account_id=pa.id)
 AND pu.revoked_at IS NULL AND pu.valid_from<=now())
 AND (SELECT count(*) FROM public.partner_users WHERE user_id=p_user_id)=1
 AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user_id AND role IN ('parceiro_b2b','parceiro_b2b_tecnico'))
 AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user_id AND role NOT IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor'));
$function$;
CREATE OR REPLACE FUNCTION public.b2b_phase1_partner_visible(p_partner uuid, p_technical boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.b2b_phase1_partner_visible(p_partner,p_technical); $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_phase1_partner_visible(p_partner uuid, p_technical boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s record; u uuid:=auth.uid(); BEGIN
 IF u IS NULL OR p_partner IS NULL THEN RETURN false; END IF;
 IF public.is_platform_superadmin(u) THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor')) THEN
  RETURN public.is_valid_b2b_partner_user(u,p_partner)
   AND (public.has_role(u,'parceiro_b2b') OR (p_technical AND public.has_role(u,'parceiro_b2b_tecnico')));
 END IF;
 SELECT * INTO s FROM platform_private.b2b_actor_scope(u);
 RETURN s.profile_ok AND s.partner_valid AND s.org_partner=p_partner;
END $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_owner_internal_partner_readable(p_partner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Read-only predicate. Internal staff (administrador/gestor_comercial/financeiro) of the active organization that
  -- commercially owns an active partner. External roles or active partner links deny. Reads no partner_orders (no recursion).
  SELECT auth.uid() IS NOT NULL AND p_partner IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()
                    AND r.role::text IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor'))
    AND NOT EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.user_id = auth.uid() AND pu.revoked_at IS NULL)
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()
                AND r.role::text IN ('administrador','gestor_comercial','financeiro'))
    AND EXISTS (SELECT 1 FROM public.partner_accounts pa
                JOIN public.organizations owner ON owner.id = pa.commercial_owner_organization_id
                     AND owner.ativo IS TRUE AND owner.status = 'ativa'
                WHERE pa.id = p_partner AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
                  AND pa.commercial_owner_organization_id = platform_private.h15_actor_organization())
$function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_phase1_order_visible(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.partner_orders o WHERE o.id=p_order AND public.b2b_phase1_partner_visible(o.partner_id,false));
$function$;
CREATE FUNCTION platform_private.b2b_resale_delivery_order_valid_v1(e public.entregas)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)
  AND e.id IS NOT NULL AND e.organization_id IS NOT NULL AND e.partner_order_id IS NOT NULL
  AND e.receivable_id IS NULL AND e.ordem_servico_id IS NOT NULL AND e.ordem_servico_onfarm_id IS NULL
  AND e.cliente_id IS NULL AND EXISTS(
   SELECT 1 FROM public.ordens_servico os
   JOIN public.partner_orders po ON po.id=os.partner_order_id AND po.id=e.partner_order_id
   JOIN public.partner_accounts pa ON pa.id=po.partner_id AND pa.commercial_owner_organization_id=os.organization_id
    AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
   WHERE os.id=e.ordem_servico_id AND os.organization_id=e.organization_id AND os.origem='b2b'
    AND os.partner_order_item_id IS NOT NULL AND os.produto_id=e.produto_id AND os.microrganismo_id IS NULL
    AND po.status::text IN ('aprovado','aguardando_entrega','em_separacao','enviado','entregue','faturado')
    AND po.ready_for_production IS FALSE AND po.receivable_generated IS FALSE
    AND po.payment_condition_status='defined' AND po.financial_approval_status NOT IN ('pending','rejected')
    AND platform_private.c2_external_origin_contract_valid(po.c2_external_origin_snapshot) IS TRUE
    AND po.internal_economic_snapshot IS NOT NULL AND po.internal_origin_snapshot IS NULL
  )) IS TRUE;
$$;

REVOKE ALL ON FUNCTION platform_private.b2b_resale_delivery_order_valid_v1(public.entregas) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION platform_private.b2b_resale_delivery_status_transition_valid_v1(o public.partner_orders,n public.partner_orders)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 RETURN (
  EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)
  AND platform_private.b2b_internal_commercial_actor() IS TRUE
  AND o.id=n.id AND o.status::text='aprovado' AND n.status::text='entregue'
  AND o.ready_for_production IS FALSE AND n.ready_for_production IS FALSE
  AND n.receivable_generated IS FALSE
  AND (to_jsonb(n)-ARRAY['status','updated_at']) IS NOT DISTINCT FROM (to_jsonb(o)-ARRAY['status','updated_at'])
  AND EXISTS(
   SELECT 1 FROM platform_private.delivery_context_20261030 dc
   JOIN public.entregas e ON e.id=dc.target AND e.partner_order_id=n.id
   JOIN public.ordens_servico os ON os.id=e.ordem_servico_id AND os.partner_order_id=n.id
   JOIN public.partner_accounts pa ON pa.id=n.partner_id
    AND pa.commercial_owner_organization_id=dc.organization_id AND pa.commercial_owner_organization_id=os.organization_id
   WHERE dc.txid=txid_current() AND dc.actor=auth.uid() AND dc.action='confirm' AND dc.mutation='done'
    AND e.organization_id=dc.organization_id AND e.status::text='entregue' AND e.receivable_id IS NULL
    AND platform_private.b2b_resale_delivery_order_valid_v1(e) IS TRUE
  )
  AND NOT EXISTS(
   SELECT 1 FROM public.entregas e JOIN public.ordens_servico os ON os.id=e.ordem_servico_id
   WHERE os.partner_order_id=n.id AND e.status::text NOT IN ('entregue','cancelada')
  )
  -- TODOS os itens precisam ter exatamente sua quantidade confirmada. Uma OS ou
  -- entrega de outro item nunca completa este item; canceladas não somam, e
  -- excesso também impede a transição. O snapshot econômico permanece o mesmo.
  AND NOT EXISTS(
   SELECT 1 FROM public.partner_order_items i
   LEFT JOIN public.ordens_servico os ON os.partner_order_item_id=i.id
    AND os.partner_order_id=n.id AND os.origem='b2b'
   LEFT JOIN public.entregas e ON e.ordem_servico_id=os.id AND e.partner_order_id=n.id
    AND e.status::text='entregue' AND e.receivable_id IS NULL
   WHERE i.order_id=n.id
   GROUP BY i.id,i.quantidade
   HAVING coalesce(sum(e.quantidade_entregue),0) IS DISTINCT FROM i.quantidade
  )
  -- Nenhuma entrega confirmada pode ficar fora dos itens imutáveis do pedido.
  AND NOT EXISTS(
   SELECT 1 FROM public.entregas e
   JOIN public.ordens_servico os ON os.id=e.ordem_servico_id AND os.partner_order_id=n.id
   LEFT JOIN public.partner_order_items i ON i.id=os.partner_order_item_id AND i.order_id=n.id
   WHERE e.partner_order_id=n.id AND e.status::text='entregue' AND i.id IS NULL
  )
  ) IS TRUE;
END;
$$;

REVOKE ALL ON FUNCTION platform_private.b2b_resale_delivery_status_transition_valid_v1(public.partner_orders,public.partner_orders) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.b2b_phase1_order_visible(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.b2b_phase1_order_visible(p_order); $function$;
CREATE OR REPLACE FUNCTION public.fn_b2b_status_is_approved_or_later(p_status partner_order_status)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_status = 'aprovado' OR public.fn_b2b_status_is_operational(p_status)
$function$;
CREATE OR REPLACE FUNCTION public.get_partner_order_payment_terms_secure(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- B2B_ORDER_PAYMENT_TERMS_READ_V1: somente leitura; não aprova, não altera e não expõe credit_decision_snapshot.
DECLARE v_uid uuid := auth.uid(); v_partner uuid; v_n integer; v_terms jsonb;
BEGIN
  IF v_uid IS NULL OR p_order_id IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  SELECT o.partner_id INTO v_partner FROM public.partner_orders o WHERE o.id = p_order_id;
  -- Mesmas portas do guard restritivo de SELECT de partner_orders; pedido inexistente nega igual (sem oráculo).
  IF v_partner IS NULL OR NOT (platform_private.b2b_phase1_partner_visible(v_partner, false) IS TRUE
                               OR platform_private.b2b_owner_internal_partner_readable(v_partner) IS TRUE) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  -- Mesma regra de papel da policy permissiva popt_select.
  IF NOT (platform_private.has_role(v_uid, 'administrador'::public.app_role) OR platform_private.has_role(v_uid, 'financeiro'::public.app_role)
          OR platform_private.has_role(v_uid, 'gestor_comercial'::public.app_role)
          OR (platform_private.has_role(v_uid, 'parceiro_b2b'::public.app_role)
              AND EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = v_partner AND pu.user_id = v_uid))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO v_n FROM public.partner_order_payment_terms t WHERE t.partner_order_id = p_order_id;
  IF v_n > 1 THEN RAISE EXCEPTION 'payment_terms_ambiguous' USING ERRCODE='P0001'; END IF;
  SELECT jsonb_build_object('id', t.id, 'partner_order_id', t.partner_order_id, 'payment_plan_id', t.payment_plan_id, 'plan_name_snapshot', t.plan_name_snapshot, 'plan_code_snapshot', t.plan_code_snapshot, 'pricing_mode_snapshot', t.pricing_mode_snapshot, 'discount_percent_snapshot', t.discount_percent_snapshot, 'monthly_interest_percent_snapshot', t.monthly_interest_percent_snapshot, 'months_count_snapshot', t.months_count_snapshot, 'interest_type_snapshot', t.interest_type_snapshot, 'installment_count', t.installment_count, 'first_due_date', t.first_due_date, 'table_amount', t.table_amount, 'discount_amount', t.discount_amount, 'net_amount_after_discount', t.net_amount_after_discount, 'financial_interest_amount', t.financial_interest_amount, 'final_amount', t.final_amount, 'approval_status', t.approval_status, 'approved_at', t.approved_at, 'approval_notes', t.approval_notes, 'created_at', t.created_at, 'updated_at', t.updated_at) INTO v_terms FROM public.partner_order_payment_terms t WHERE t.partner_order_id = p_order_id;
  RETURN jsonb_build_object('contract', 'B2B_ORDER_PAYMENT_TERMS_READ_V1', 'order_id', p_order_id,
                            'present', v_terms IS NOT NULL, 'terms', v_terms);
END $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_actor_scope(_uid uuid)
 RETURNS TABLE(profile_ok boolean, org_partner uuid, user_partner uuid, user_partner_count integer, partner_valid boolean, has_catalog boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH pr AS (
    SELECT o.partner_account_id
      FROM public.profiles p JOIN public.organizations o ON o.id = p.organization_id
     WHERE p.user_id = _uid AND p.ativo = true AND o.ativo = true AND o.status = 'ativa'
     LIMIT 1
  ), pu AS (
    SELECT count(*)::int c, min(partner_id::text)::uuid pid
      FROM public.partner_users
     WHERE user_id = _uid AND revoked_at IS NULL
  ), valid AS (
    -- Caminho fornecedor: vínculo só resolve o parceiro com a cadeia completa
    -- perfil→organização→tenant→proprietário comprovada no servidor.
    SELECT CASE WHEN (SELECT c FROM pu) = 1
                 AND public.is_valid_b2b_partner_user(_uid, (SELECT pid FROM pu))
                 AND EXISTS (
                   SELECT 1
                     FROM public.partner_users puv
                     JOIN public.partner_accounts pa ON pa.id = puv.partner_id
                     JOIN public.organizations owner ON owner.id = pa.commercial_owner_organization_id
                     JOIN public.profiles pf ON pf.user_id = puv.user_id
                     JOIN public.organizations porg ON porg.id = pf.organization_id
                    WHERE puv.user_id = _uid
                      AND puv.partner_id = (SELECT pid FROM pu)
                      AND puv.revoked_at IS NULL
                      AND (puv.valid_from IS NULL OR puv.valid_from <= now())
                      AND pf.ativo = true
                      AND porg.ativo = true AND porg.status = 'ativa'
                      AND pf.organization_id = puv.tenant_id
                      AND puv.tenant_id = pa.commercial_owner_organization_id
                      AND pa.ativo = true AND pa.deleted_at IS NULL
                      AND owner.ativo = true AND owner.status = 'ativa'
                 )
              THEN (SELECT pid FROM pu) END AS pid
  )
  SELECT EXISTS (SELECT 1 FROM pr),
         -- Organização com parceiro explícito prevalece; sem ela, o vínculo autorizado
         -- validado resolve o parceiro. Se ambos existirem e divergirem, org_partner
         -- permanece o da organização e os consumidores negam por mismatch.
         COALESCE((SELECT partner_account_id FROM pr), (SELECT pid FROM valid)),
         (SELECT pid FROM valid),
         (SELECT c FROM pu),
         CASE WHEN (SELECT partner_account_id FROM pr) IS NOT NULL
              THEN EXISTS (SELECT 1 FROM pr JOIN public.partner_accounts pa ON pa.id = pr.partner_account_id
                            WHERE pa.ativo = true AND pa.deleted_at IS NULL)
              ELSE (SELECT pid FROM valid) IS NOT NULL END,
         EXISTS (SELECT 1 FROM platform_private.entitlements_for_user(_uid) e WHERE e.feature_key = 'catalogo_precos');
$function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_internal_commercial_actor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT auth.uid() IS NOT NULL AND public.h15_actor_organization() IS NOT NULL AND platform_private.platform_actor_access_ready(auth.uid()) AND (public.has_role(auth.uid(),'administrador'::public.app_role) OR public.has_role(auth.uid(),'gestor_comercial'::public.app_role)) AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role IN ('parceiro_b2b','parceiro_b2b_tecnico')); $function$;
CREATE OR REPLACE FUNCTION platform_private.c2_partner_order_attempt_authz(p_uid uuid, p_partner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_is_internal boolean; v_is_partner boolean; v_is_partner_tech boolean; v_user_partner uuid;
BEGIN
  -- Espelha a autorização do create canônico (mesma ordem/mensagens). Chamado antes E
  -- depois do lock b2b_idem; cada chamada lê um snapshot novo (READ COMMITTED).
  IF p_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  PERFORM platform_private.c2_order_actor_scope(p_uid, p_partner_id);
  v_is_internal := public.has_role(p_uid,'administrador'::public.app_role)
                OR public.has_role(p_uid,'financeiro'::public.app_role)
                OR public.has_role(p_uid,'gestor_comercial'::public.app_role);
  v_is_partner      := public.has_role(p_uid,'parceiro_b2b'::public.app_role);
  v_is_partner_tech := public.has_role(p_uid,'parceiro_b2b_tecnico'::public.app_role);
  v_user_partner    := public.get_user_partner_id();
  IF public.has_role(p_uid,'cliente_produtor'::public.app_role) AND NOT (v_is_internal OR v_is_partner) THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED';
  END IF;
  IF v_is_partner_tech AND NOT (v_is_internal OR v_is_partner) THEN
    RAISE EXCEPTION 'partner_tech_cannot_create_order';
  END IF;
  IF NOT v_is_internal THEN
    IF NOT v_is_partner OR v_user_partner IS NULL OR v_user_partner <> p_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;
  PERFORM 1 FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner_not_found'; END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_internal_order_snapshot_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE org uuid; uid uuid:=auth.uid(); cs public.company_fiscal_settings; candidate_count integer; economic jsonb; terms public.partner_order_payment_terms; items jsonb; schedule jsonb;
BEGIN

 -- Explicit external proof; NULL internal origin alone never authorizes a legacy order.
 IF TG_OP='INSERT' AND platform_private.has_ticket('c2_external_order_create',NEW.partner_id) THEN
  IF NEW.c2_external_origin_snapshot IS NOT NULL OR NEW.internal_origin_snapshot IS NOT NULL OR NEW.internal_economic_snapshot IS NOT NULL
  THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_SERVER_ONLY' USING ERRCODE='42501'; END IF;
  IF NOT platform_private.c2_owner_order_create_allowed(uid,NEW.partner_id) OR NEW.created_by IS DISTINCT FROM uid
  THEN RAISE EXCEPTION 'C2_EXTERNAL_CREATE_DENIED' USING ERRCODE='42501'; END IF;
  SELECT p.commercial_owner_organization_id,p.client_id INTO org,NEW.cliente_id FROM public.partner_accounts p WHERE p.id=NEW.partner_id FOR SHARE;
  SELECT count(*) INTO candidate_count FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active;
  IF candidate_count>1 THEN RAISE EXCEPTION 'B2B_INTERNAL_ISSUER_AMBIGUOUS' USING ERRCODE='42501'; END IF;
  IF candidate_count=1 THEN SELECT * INTO cs FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active FOR SHARE; END IF;
  IF candidate_count=1 AND cs.configuration_status='VALIDATED' AND cs.accounting_validated_at IS NOT NULL AND nullif(btrim(cs.legal_name),'') IS NOT NULL AND nullif(btrim(cs.cnpj),'') IS NOT NULL THEN
    NEW.c2_external_origin_snapshot:=jsonb_build_object('contract','C2_EXTERNAL_ORDER_ORIGIN_V1','schema_version','1','organization_id',org,'creditor_organization_id',org,'issuer_organization_id',org,'company_settings_id',cs.id,'company_configuration_version',cs.configuration_version,'issuer_legal_name',cs.legal_name,'issuer_cnpj',cs.cnpj,'actor_user_id',uid,'partner_id',NEW.partner_id);
  ELSE
   -- C2_ACCOUNTING_PENDING_V1: honest non-fiscal request; no issuer identity/attestation is copied or invented.
   NEW.c2_external_origin_snapshot:=jsonb_build_object('contract','C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1','schema_version','1','organization_id',org,'creditor_organization_id',org,'actor_user_id',uid,'partner_id',NEW.partner_id,'issuer_state',CASE WHEN candidate_count=0 THEN 'NOT_CONFIGURED' ELSE coalesce(cs.configuration_status,'UNKNOWN') END,'company_settings_id',cs.id,'accounting_validated',false);
  END IF;
  PERFORM platform_private.c2_external_origin_assert(NEW.c2_external_origin_snapshot,NEW.partner_id,NEW.cliente_id);
  IF NEW.ready_for_production OR NEW.status NOT IN ('em_analise_comercial','aguardando_cotacao','aguardando_aprovacao_credito') THEN RAISE EXCEPTION 'C2_EXTERNAL_INITIAL_STATE_DENIED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='INSERT' AND NEW.c2_external_origin_snapshot IS NOT NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_SERVER_ONLY' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (OLD.c2_external_origin_snapshot IS NOT NULL OR NEW.c2_external_origin_snapshot IS NOT NULL) THEN
  IF (NEW.c2_external_origin_snapshot IS DISTINCT FROM OLD.c2_external_origin_snapshot AND NOT platform_private.c2_accounting_promotion_ok(OLD.c2_external_origin_snapshot,NEW.c2_external_origin_snapshot,NEW.id)) OR NEW.internal_origin_snapshot IS DISTINCT FROM OLD.internal_origin_snapshot OR NEW.internal_economic_snapshot IS DISTINCT FROM OLD.internal_economic_snapshot
  THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_IMMUTABLE' USING ERRCODE='42501'; END IF;
  PERFORM platform_private.c2_external_origin_assert(OLD.c2_external_origin_snapshot,OLD.partner_id,OLD.cliente_id);
  PERFORM platform_private.c2_external_origin_assert(NEW.c2_external_origin_snapshot,NEW.partner_id,NEW.cliente_id);
  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'B2B_INTERNAL_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
  IF NEW.ready_for_production OR (public.fn_b2b_status_is_operational(NEW.status) AND platform_private.b2b_resale_delivery_status_transition_valid_v1(OLD,NEW) IS NOT TRUE) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status IN ('cancelado','reprovado') THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMINAL_STATUS' USING ERRCODE='42501'; END IF;
  IF OLD.internal_economic_snapshot IS NOT NULL AND (to_jsonb(NEW)-ARRAY['status','updated_at','approval_notes','estimated_delivery_date','financial_status','receivable_generated','receivable_generated_at','receivable_generated_by','future_financial_link','commercial_notes','payment_due_date','payment_method']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','approval_notes','estimated_delivery_date','financial_status','receivable_generated','receivable_generated_at','receivable_generated_by','future_financial_link','commercial_notes','payment_due_date','payment_method']) THEN RAISE EXCEPTION 'B2B_INTERNAL_ECONOMICS_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF NEW.status='aprovado' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF NOT (public.has_role(uid,'administrador'::public.app_role) OR public.has_role(uid,'gestor_comercial'::public.app_role)) OR OLD.status NOT IN ('em_analise_comercial','solicitado','rascunho') OR NEW.payment_condition_status IS DISTINCT FROM 'defined' THEN RAISE EXCEPTION 'B2B_INTERNAL_APPROVAL_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO terms FROM public.partner_order_payment_terms t WHERE t.id=NEW.payment_terms_id AND t.partner_order_id=NEW.id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMS_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NEW.total IS NULL OR NEW.total::text IN ('NaN','Infinity','-Infinity') OR NEW.total<0 OR terms.final_amount IS DISTINCT FROM NEW.total OR NEW.desconto_total<0 THEN RAISE EXCEPTION 'B2B_INTERNAL_TOTAL_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id) OR EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id AND (i.quantidade IS NULL OR i.quantidade<=0 OR i.quantidade::text IN ('NaN','Infinity','-Infinity') OR i.preco_unitario IS NULL OR i.preco_unitario<0 OR i.preco_unitario::text IN ('NaN','Infinity','-Infinity') OR i.desconto_percentual IS NULL OR i.desconto_percentual<0 OR i.desconto_percentual>100 OR i.desconto_percentual::text IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'B2B_INTERNAL_ITEM_INVALID' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(to_jsonb(i)-ARRAY['created_at'] ORDER BY i.id) INTO items FROM public.partner_order_items i WHERE i.order_id=NEW.id;
  SELECT jsonb_agg(to_jsonb(s)-ARRAY['created_at','status','receivable_installment_id'] ORDER BY s.installment_number,s.id) INTO schedule FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id AND s.payment_terms_id=terms.id;
  IF schedule IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_SCHEDULE_REQUIRED' USING ERRCODE='22023'; END IF;
 IF NEW.subtotal IS NULL OR NEW.desconto_total IS NULL OR NEW.subtotal::text IN ('NaN','Infinity','-Infinity') OR NEW.desconto_total::text IN ('NaN','Infinity','-Infinity') OR NEW.subtotal<0 OR NEW.desconto_total<0 OR NEW.desconto_total>NEW.subtotal OR terms.discount_percent_snapshot IS NULL OR terms.discount_percent_snapshot::text IN ('NaN','Infinity','-Infinity') OR terms.discount_percent_snapshot<0 OR terms.discount_percent_snapshot>100 THEN RAISE EXCEPTION 'B2B_INTERNAL_TOTAL_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id AND (i.subtotal IS NULL OR i.subtotal<0 OR i.subtotal::text IN ('NaN','Infinity','-Infinity'))) OR (SELECT round(sum(i.subtotal),2) FROM public.partner_order_items i WHERE i.order_id=NEW.id) IS DISTINCT FROM round(terms.net_amount_after_discount,2) THEN RAISE EXCEPTION 'B2B_INTERNAL_ITEM_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id AND (s.payment_terms_id IS DISTINCT FROM terms.id OR s.installment_number<=0 OR s.due_date IS NULL OR s.amount IS NULL OR s.principal_amount IS NULL OR s.interest_amount IS NULL OR s.amount<0 OR s.principal_amount<0 OR s.interest_amount<0 OR s.amount::text IN ('NaN','Infinity','-Infinity') OR s.principal_amount::text IN ('NaN','Infinity','-Infinity') OR s.interest_amount::text IN ('NaN','Infinity','-Infinity'))) OR (SELECT count(*) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM terms.installment_count::bigint OR (SELECT count(DISTINCT s.installment_number) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM terms.installment_count::bigint OR (SELECT round(sum(s.amount),2) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM round(terms.final_amount,2) THEN RAISE EXCEPTION 'B2B_INTERNAL_SCHEDULE_INVALID' USING ERRCODE='22023'; END IF;
  economic:=jsonb_build_object('schema_version','1','origin',OLD.c2_external_origin_snapshot,'items',items,'terms',to_jsonb(terms)-ARRAY['updated_at','approval_status','approved_by','approved_at','approval_notes'],'schedule',schedule,'subtotal',NEW.subtotal,'discount',NEW.desconto_total,'total',NEW.total,'sealed_by',uid);
  NEW.internal_economic_snapshot:=economic;

 END IF;
 RETURN NEW;
 END IF;
 IF TG_OP='INSERT' THEN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  org:=public.h15_actor_organization();
  IF org IS NULL OR NOT public.fn_cc_can_prepare(uid) OR NOT public._saas_user_has_feature(uid,'pedidos_b2b') THEN RAISE EXCEPTION 'B2B_INTERNAL_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
  -- No client/CNPJ/organizations.partner_account_id inference. All caller snapshots rejected.
  IF NEW.internal_origin_snapshot IS NOT NULL OR NEW.internal_economic_snapshot IS NOT NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_SERVER_ONLY' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO candidate_count FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active IS TRUE;
  IF candidate_count<>1 THEN RAISE EXCEPTION 'B2B_INTERNAL_ISSUER_AMBIGUOUS' USING ERRCODE='42501'; END IF;
  SELECT * INTO cs FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active IS TRUE FOR SHARE;
  IF cs.configuration_status IS DISTINCT FROM 'VALIDATED' OR cs.accounting_validated_at IS NULL OR nullif(btrim(cs.legal_name),'') IS NULL OR nullif(btrim(cs.cnpj),'') IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_ISSUER_NOT_VALIDATED' USING ERRCODE='42501'; END IF;
  NEW.internal_origin_snapshot:=jsonb_build_object('schema_version','1','organization_id',org,'creditor_organization_id',org,'issuer_organization_id',org,'company_settings_id',cs.id,'company_configuration_version',cs.configuration_version,'issuer_legal_name',cs.legal_name,'issuer_cnpj',cs.cnpj,'actor_user_id',uid,'partner_id',NEW.partner_id);
  PERFORM platform_private.b2b_internal_assert_origin(NEW.internal_origin_snapshot,NEW.partner_id,NEW.cliente_id);
  IF NEW.ready_for_production IS TRUE THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF; IF NEW.status IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado') THEN RAISE EXCEPTION 'B2B_INTERNAL_INITIAL_STATUS_DENIED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.internal_origin_snapshot IS DISTINCT FROM OLD.internal_origin_snapshot OR NEW.internal_economic_snapshot IS DISTINCT FROM OLD.internal_economic_snapshot THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF OLD.internal_origin_snapshot IS NULL THEN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado') THEN RAISE EXCEPTION 'B2B_INTERNAL_LEGACY_ORIGIN_UNPROVEN' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 PERFORM platform_private.b2b_internal_assert_origin(OLD.internal_origin_snapshot,OLD.partner_id,OLD.cliente_id);
 IF NEW.partner_id IS DISTINCT FROM OLD.partner_id OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'B2B_INTERNAL_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF OLD.internal_economic_snapshot IS NOT NULL AND (to_jsonb(NEW)-ARRAY['status','updated_at','approval_notes','estimated_delivery_date','ready_for_production','financial_status','receivable_generated','receivable_generated_at','receivable_generated_by','future_financial_link','commercial_notes']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','approval_notes','estimated_delivery_date','ready_for_production','financial_status','receivable_generated','receivable_generated_at','receivable_generated_by','future_financial_link','commercial_notes']) THEN RAISE EXCEPTION 'B2B_INTERNAL_ECONOMICS_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status IN ('cancelado','reprovado') THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMINAL_STATUS' USING ERRCODE='42501'; END IF;
 IF NEW.ready_for_production IS TRUE THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF; IF public.fn_b2b_status_is_operational(NEW.status) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF; IF NEW.ready_for_production IS TRUE AND NEW.status<>'aprovado' THEN RAISE EXCEPTION 'B2B_INTERNAL_UNSEALED_OPERATION' USING ERRCODE='42501'; END IF; IF NEW.status='aprovado' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF NOT (public.has_role(uid,'administrador'::public.app_role) OR public.has_role(uid,'gestor_comercial'::public.app_role)) OR OLD.status NOT IN ('em_analise_comercial','solicitado','rascunho') OR NEW.payment_condition_status IS DISTINCT FROM 'defined' THEN RAISE EXCEPTION 'B2B_INTERNAL_APPROVAL_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO terms FROM public.partner_order_payment_terms t WHERE t.id=NEW.payment_terms_id AND t.partner_order_id=NEW.id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMS_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NEW.total IS NULL OR NEW.total::text IN ('NaN','Infinity','-Infinity') OR NEW.total<0 OR terms.final_amount IS DISTINCT FROM NEW.total OR NEW.desconto_total<0 THEN RAISE EXCEPTION 'B2B_INTERNAL_TOTAL_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id) OR EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id AND (i.quantidade IS NULL OR i.quantidade<=0 OR i.quantidade::text IN ('NaN','Infinity','-Infinity') OR i.preco_unitario IS NULL OR i.preco_unitario<0 OR i.preco_unitario::text IN ('NaN','Infinity','-Infinity') OR i.desconto_percentual IS NULL OR i.desconto_percentual<0 OR i.desconto_percentual>100 OR i.desconto_percentual::text IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'B2B_INTERNAL_ITEM_INVALID' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(to_jsonb(i)-ARRAY['created_at'] ORDER BY i.id) INTO items FROM public.partner_order_items i WHERE i.order_id=NEW.id;
  SELECT jsonb_agg(to_jsonb(s)-ARRAY['created_at','status','receivable_installment_id'] ORDER BY s.installment_number,s.id) INTO schedule FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id AND s.payment_terms_id=terms.id;
  IF schedule IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_SCHEDULE_REQUIRED' USING ERRCODE='22023'; END IF;
 IF NEW.subtotal IS NULL OR NEW.desconto_total IS NULL OR NEW.subtotal::text IN ('NaN','Infinity','-Infinity') OR NEW.desconto_total::text IN ('NaN','Infinity','-Infinity') OR NEW.subtotal<0 OR NEW.desconto_total<0 OR NEW.desconto_total>NEW.subtotal OR terms.discount_percent_snapshot IS NULL OR terms.discount_percent_snapshot::text IN ('NaN','Infinity','-Infinity') OR terms.discount_percent_snapshot<0 OR terms.discount_percent_snapshot>100 THEN RAISE EXCEPTION 'B2B_INTERNAL_TOTAL_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id AND (i.subtotal IS NULL OR i.subtotal<0 OR i.subtotal::text IN ('NaN','Infinity','-Infinity'))) OR (SELECT round(sum(i.subtotal),2) FROM public.partner_order_items i WHERE i.order_id=NEW.id) IS DISTINCT FROM round(terms.net_amount_after_discount,2) THEN RAISE EXCEPTION 'B2B_INTERNAL_ITEM_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id AND (s.payment_terms_id IS DISTINCT FROM terms.id OR s.installment_number<=0 OR s.due_date IS NULL OR s.amount IS NULL OR s.principal_amount IS NULL OR s.interest_amount IS NULL OR s.amount<0 OR s.principal_amount<0 OR s.interest_amount<0 OR s.amount::text IN ('NaN','Infinity','-Infinity') OR s.principal_amount::text IN ('NaN','Infinity','-Infinity') OR s.interest_amount::text IN ('NaN','Infinity','-Infinity'))) OR (SELECT count(*) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM terms.installment_count::bigint OR (SELECT count(DISTINCT s.installment_number) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM terms.installment_count::bigint OR (SELECT round(sum(s.amount),2) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM round(terms.final_amount,2) THEN RAISE EXCEPTION 'B2B_INTERNAL_SCHEDULE_INVALID' USING ERRCODE='22023'; END IF;
  economic:=jsonb_build_object('schema_version','1','origin',OLD.internal_origin_snapshot,'items',items,'terms',to_jsonb(terms)-ARRAY['updated_at','approval_status','approved_by','approved_at','approval_notes'],'schedule',schedule,'subtotal',NEW.subtotal,'discount',NEW.desconto_total,'total',NEW.total,'sealed_by',uid);
  NEW.internal_economic_snapshot:=economic;
 ELSIF NEW.status IS DISTINCT FROM OLD.status AND public.fn_b2b_status_is_operational(NEW.status) AND OLD.internal_economic_snapshot IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_UNSEALED_OPERATION' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $function$;
COMMIT;

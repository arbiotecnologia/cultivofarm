-- C2 PILOT ECONOMIC APPROVAL V1 — candidato revisável; nunca aplicar daqui.
-- Camada econômica isolada: aprovações explícitas (comercial/crédito) com autor+data em ledger privado append-only,
-- sem alterar partner_orders (status, approved_*, credit_*, internal_economic_snapshot, flags operacionais) nem
-- os corpos LIVE de approve_partner_order/approve_b2b_credit/c2_accounting_pending_guard.

CREATE TABLE platform_private.c2_pilot_econ_gate_v1(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid,reason text NOT NULL);
INSERT INTO platform_private.c2_pilot_econ_gate_v1(singleton,enabled,reason) VALUES(true,false,'INSTALLED_CLOSED');
CREATE TABLE platform_private.c2_pilot_econ_allowlist_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.partner_orders(id),
 organization_id uuid NOT NULL,partner_id uuid NOT NULL,actor_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('commercial','credit')),
 valid_from timestamptz NOT NULL DEFAULT now(),valid_until timestamptz NOT NULL,
 revoked_at timestamptz,revoke_reason text,created_at timestamptz NOT NULL DEFAULT now(),reason text NOT NULL CHECK(length(btrim(reason))>=5),
 CHECK(valid_until>valid_from AND valid_until<=valid_from+interval '24 hours'),CHECK(revoked_at IS NULL OR revoked_at>=valid_from));
CREATE UNIQUE INDEX c2_pilot_econ_allowlist_active_uq ON platform_private.c2_pilot_econ_allowlist_v1(order_id,kind,actor_id) WHERE revoked_at IS NULL;
CREATE TABLE platform_private.c2_pilot_econ_approvals_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.partner_orders(id),
 kind text NOT NULL CHECK(kind IN ('commercial','credit')),actor_id uuid NOT NULL,actor_role text NOT NULL,
 organization_id uuid NOT NULL,partner_id uuid NOT NULL,allowlist_id uuid NOT NULL REFERENCES platform_private.c2_pilot_econ_allowlist_v1(id),
 evidence_hash text NOT NULL CHECK(evidence_hash ~ '^[0-9a-f]{32}$'),evidence jsonb NOT NULL,
 idempotency_key text NOT NULL UNIQUE CHECK(length(idempotency_key) BETWEEN 16 AND 128),
 notes text,approved_at timestamptz NOT NULL DEFAULT now(),UNIQUE(order_id,kind));
CREATE FUNCTION platform_private.c2_pilot_econ_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN RAISE EXCEPTION 'C2_PILOT_ECON_APPROVAL_IMMUTABLE' USING ERRCODE='42501';END$$;
CREATE TRIGGER c2_pilot_econ_approvals_no_change BEFORE UPDATE OR DELETE OR TRUNCATE ON platform_private.c2_pilot_econ_approvals_v1
FOR EACH STATEMENT EXECUTE FUNCTION platform_private.c2_pilot_econ_immutable_v1();
ALTER TABLE platform_private.c2_pilot_econ_gate_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.c2_pilot_econ_allowlist_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.c2_pilot_econ_approvals_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.c2_pilot_econ_gate_v1,platform_private.c2_pilot_econ_allowlist_v1,platform_private.c2_pilot_econ_approvals_v1 FROM PUBLIC,anon,authenticated,service_role;

-- Barreira: nenhuma entrada (inclusive o núcleo legado que aceita reason_code OK sem assinatura) cria previsão
-- para pedido C2 pendente de contabilidade ou listado no piloto, salvo o core do piloto com ticket da própria transação.
CREATE FUNCTION platform_private.c2_pilot_forecast_insert_barrier_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (EXISTS(SELECT 1 FROM public.partner_orders po WHERE po.id=NEW.order_id
      AND po.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1')
     OR EXISTS(SELECT 1 FROM platform_private.c2_pilot_econ_allowlist_v1 a WHERE a.order_id=NEW.order_id))
    AND NOT platform_private.has_ticket('c2_pilot_forecast_create',NEW.order_id) THEN
  RAISE EXCEPTION 'C2_PILOT_FORECAST_ENTRY_DENIED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER c2_pilot_forecast_insert_barrier BEFORE INSERT ON platform_private.b2b_financial_forecasts
FOR EACH ROW EXECUTE FUNCTION platform_private.c2_pilot_forecast_insert_barrier_v1();

-- Evidência econômica real da resposta cotada; falha fechada se incompleta/divergente. Não lê reason_code.
CREATE FUNCTION platform_private.c2_pilot_econ_evidence_v1(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE po public.partner_orders;q platform_private.b2b_order_condition_quote_snapshots;t public.partner_order_payment_terms;
 org uuid;n integer;sched jsonb;qrows jsonb;items jsonb;isum numeric;ev jsonb;
BEGIN
 SELECT * INTO po FROM public.partner_orders WHERE id=p_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:order' USING ERRCODE='42501';END IF;
 IF po.c2_external_origin_snapshot->>'contract' IS DISTINCT FROM 'C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1'
    OR platform_private.c2_external_origin_contract_valid(po.c2_external_origin_snapshot) IS NOT TRUE THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:origin' USING ERRCODE='42501';END IF;
 IF po.status::text<>'em_analise_comercial' OR po.approved_at IS NOT NULL OR po.approved_by IS NOT NULL
    OR po.credit_approved_at IS NOT NULL OR po.credit_approved_by IS NOT NULL OR po.internal_economic_snapshot IS NOT NULL
    OR po.ready_for_production IS TRUE OR po.receivable_generated IS TRUE THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:order_state' USING ERRCODE='42501';END IF;
 SELECT pa.commercial_owner_organization_id INTO org FROM public.partner_accounts pa
  WHERE pa.id=po.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
 IF org IS NULL THEN RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:partner' USING ERRCODE='42501';END IF;
 IF po.payment_terms_id IS NULL OR coalesce(po.payment_condition_status,'')<>'defined' THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:condition' USING ERRCODE='42501';END IF;
 SELECT count(*) INTO n FROM platform_private.b2b_order_condition_quote_snapshots WHERE order_id=po.id;
 IF n<>1 THEN RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:quote_snapshot' USING ERRCODE='42501';END IF;
 SELECT * INTO q FROM platform_private.b2b_order_condition_quote_snapshots WHERE order_id=po.id;
 SELECT count(*) INTO n FROM public.partner_order_audit_logs WHERE order_id=po.id AND acao='quote_responded';
 IF n<>1 THEN RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:quote_event' USING ERRCODE='42501';END IF;
 IF q.organization_id IS DISTINCT FROM org OR q.partner_id IS DISTINCT FROM po.partner_id OR q.payment_terms_id IS DISTINCT FROM po.payment_terms_id
    OR q.actor_id IS NULL OR q.plan_id IS DISTINCT FROM po.payment_plan_id OR q.due_basis IS DISTINCT FROM 'nf_issue' OR q.estimated IS NOT TRUE
    OR q.principal IS NULL OR q.principal<=0 OR q.financed_interest IS NULL OR q.financed_interest<0 OR q.financed_total IS NULL
    OR q.financed_total<>q.principal+q.financed_interest OR q.financed_total<>po.final_amount_with_interest OR q.financed_total<>po.total
    OR q.condition_method IS NULL OR q.condition_method IS DISTINCT FROM q.choice->>'payment_method' OR q.condition->>'method' IS DISTINCT FROM q.condition_method
    OR (q.condition->>'organization_id')::uuid IS DISTINCT FROM org OR q.condition->>'payment_method_id' IS NULL
    OR jsonb_typeof(q.rows)<>'array' OR jsonb_array_length(q.rows)<1
    OR jsonb_array_length(q.rows)<>coalesce((q.condition->>'installment_count')::integer,-1) THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:quote_fields' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payment_methods m WHERE m.id=(q.condition->>'payment_method_id')::uuid AND m.active IS TRUE) THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:payment_method' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_quote_response_receipts r WHERE r.order_id=po.id AND r.actor_id=q.actor_id) THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:quote_receipt' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM public.partner_order_payment_terms WHERE id=po.payment_terms_id AND partner_order_id=po.id;
 IF NOT FOUND OR t.final_amount IS DISTINCT FROM q.financed_total OR t.installment_count IS DISTINCT FROM jsonb_array_length(q.rows) THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:terms' USING ERRCODE='42501';END IF;
 IF t.approval_status NOT IN ('not_required','approved') THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_TERMS_NOT_SETTLED:%',t.approval_status USING ERRCODE='42501';END IF;
 SELECT jsonb_agg(jsonb_build_object('installment_number',x->'installment_number','amount',(x->>'amount')::numeric,'due_date',x->>'due_date') ORDER BY (x->>'installment_number')::integer)
  INTO qrows FROM jsonb_array_elements(q.rows)x;
 SELECT jsonb_agg(jsonb_build_object('installment_number',to_jsonb(s.installment_number),'amount',s.amount,'due_date',s.due_date::text) ORDER BY s.installment_number)
  INTO sched FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=po.id AND s.payment_terms_id=po.payment_terms_id;
 IF sched IS NULL OR sched IS DISTINCT FROM qrows OR (SELECT sum((x->>'amount')::numeric) FROM jsonb_array_elements(qrows)x)<>q.financed_total
    OR EXISTS(SELECT 1 FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=po.id AND s.receivable_installment_id IS NOT NULL) THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:schedule' USING ERRCODE='42501';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'packaging_id',i.packaging_id_snapshot,'quantidade',i.quantidade,'preco_unitario',i.preco_unitario,'subtotal',i.subtotal) ORDER BY i.id),
        sum(i.subtotal) INTO items,isum FROM public.partner_order_items i WHERE i.order_id=po.id;
 IF items IS NULL OR isum IS DISTINCT FROM q.principal
    OR EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=po.id AND (i.packaging_id_snapshot IS NULL OR i.preco_unitario IS NULL OR i.preco_unitario<=0 OR i.quantidade IS NULL OR i.quantidade<=0
       OR i.quantidade<>trunc(i.quantidade) OR i.subtotal IS DISTINCT FROM round(i.quantidade*i.preco_unitario,2))) THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE:items' USING ERRCODE='42501';END IF;
 ev:=jsonb_build_object('contract','C2_PILOT_ECONOMIC_EVIDENCE_V1','order_id',po.id,'organization_id',org,'partner_id',po.partner_id,
  'payment_terms_id',po.payment_terms_id,'terms_approval_status',t.approval_status,'plan_id',q.plan_id,'quote_actor_id',q.actor_id,
  'method',q.condition_method,'payment_method_id',q.condition->>'payment_method_id','due_basis',q.due_basis,'estimated',q.estimated,
  'principal',q.principal,'financed_interest',q.financed_interest,'financed_total',q.financed_total,
  'request_hash',q.request_hash,'cart_hash',q.cart_hash,'schedule',qrows,'items',items);
 RETURN ev||jsonb_build_object('evidence_hash',md5(ev::text));
END$$;

-- Competência: comercial = administrador/gestor_comercial; crédito = administrador/financeiro (vendedor e externos nunca).
CREATE FUNCTION platform_private.c2_pilot_econ_actor_v1(p_kind text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;r text;
BEGIN
 IF p_kind='commercial' THEN
  org:=platform_private.c2p1_internal_actor(ARRAY['administrador','gestor_comercial']::public.app_role[]);
  SELECT x INTO r FROM unnest(ARRAY['gestor_comercial','administrador'])x WHERE public.has_role(auth.uid(),x::public.app_role) LIMIT 1;
 ELSIF p_kind='credit' THEN
  org:=platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro']::public.app_role[]);
  SELECT x INTO r FROM unnest(ARRAY['financeiro','administrador'])x WHERE public.has_role(auth.uid(),x::public.app_role) LIMIT 1;
 ELSE RAISE EXCEPTION 'C2_PILOT_ECON_KIND_INVALID' USING ERRCODE='22023';END IF;
 IF org IS NULL OR r IS NULL OR public.has_role(auth.uid(),'vendedor'::public.app_role) THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('organization_id',org,'role',r);
END$$;

CREATE FUNCTION platform_private.c2_pilot_econ_approve_core_v1(p_order uuid,p_kind text,p_key text,p_expected_hash text,p_notes text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid();act jsonb;po public.partner_orders;org uuid;ev jsonb;al platform_private.c2_pilot_econ_allowlist_v1;
 ap platform_private.c2_pilot_econ_approvals_v1;prev platform_private.c2_pilot_econ_approvals_v1;en boolean;
 c platform_private.c2_pilot_econ_approvals_v1;k platform_private.c2_pilot_econ_approvals_v1;f platform_private.b2b_financial_forecasts;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'C2_PILOT_ECON_DENIED:auth' USING ERRCODE='42501';END IF;
 IF p_kind NOT IN ('commercial','credit') THEN RAISE EXCEPTION 'C2_PILOT_ECON_KIND_INVALID' USING ERRCODE='22023';END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 16 AND 128 THEN RAISE EXCEPTION 'C2_PILOT_ECON_KEY_INVALID' USING ERRCODE='22023';END IF;
 IF p_expected_hash IS NULL OR p_expected_hash !~ '^[0-9a-f]{32}$' THEN RAISE EXCEPTION 'C2_PILOT_ECON_EXPECTED_HASH_REQUIRED' USING ERRCODE='22023';END IF;
 -- Pré-filtro sem lock.
 act:=platform_private.c2_pilot_econ_actor_v1(p_kind);
 IF act IS NULL THEN RAISE EXCEPTION 'C2_PILOT_ECON_DENIED:role' USING ERRCODE='42501';END IF;
 -- Locks na ordem dos writers canônicos: pedido -> allowlist -> gate -> ledger.
 SELECT * INTO po FROM public.partner_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'C2_PILOT_ECON_DENIED:scope' USING ERRCODE='42501';END IF;
 SELECT pa.commercial_owner_organization_id INTO org FROM public.partner_accounts pa
  WHERE pa.id=po.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL FOR SHARE OF pa;
 -- Reautorização após as esperas.
 act:=platform_private.c2_pilot_econ_actor_v1(p_kind);
 IF act IS NULL THEN RAISE EXCEPTION 'C2_PILOT_ECON_DENIED:role' USING ERRCODE='42501';END IF;
 IF org IS NULL OR (act->>'organization_id')::uuid IS DISTINCT FROM org THEN RAISE EXCEPTION 'C2_PILOT_ECON_DENIED:scope' USING ERRCODE='42501';END IF;
 -- Replay exato pela mesma chave (antes de exigir estado ainda aberto), sempre após reautorização.
 SELECT * INTO prev FROM platform_private.c2_pilot_econ_approvals_v1 WHERE idempotency_key=p_key;
 IF FOUND THEN
  IF prev.order_id<>p_order OR prev.kind<>p_kind OR prev.actor_id<>uid OR prev.evidence_hash<>p_expected_hash THEN
   RAISE EXCEPTION 'C2_PILOT_ECON_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
  SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE order_id=p_order;
  RETURN jsonb_build_object('contract','C2_PILOT_ECON_APPROVAL_V1','replayed',true,'approval_id',prev.id,'kind',prev.kind,
   'approved_by',prev.actor_id,'approved_at',prev.approved_at,'forecast_id',f.id);
 END IF;
 SELECT a.* INTO al FROM platform_private.c2_pilot_econ_allowlist_v1 a
  WHERE a.order_id=p_order AND a.kind=p_kind AND a.actor_id=uid AND a.organization_id=org AND a.partner_id=po.partner_id AND a.revoked_at IS NULL
  ORDER BY a.id LIMIT 1 FOR UPDATE;
 SELECT g.enabled INTO en FROM platform_private.c2_pilot_econ_gate_v1 g WHERE g.singleton FOR SHARE;
 IF en IS NOT TRUE THEN RAISE EXCEPTION 'C2_PILOT_ECON_DISABLED' USING ERRCODE='42501';END IF;
 IF al.id IS NULL OR al.valid_from>pg_catalog.clock_timestamp() OR al.valid_until<=pg_catalog.clock_timestamp() THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_NOT_GRANTED' USING ERRCODE='42501';END IF;
 ev:=platform_private.c2_pilot_econ_evidence_v1(p_order);
 IF ev->>'evidence_hash'<>p_expected_hash THEN RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_CHANGED' USING ERRCODE='PT409';END IF;
 IF EXISTS(SELECT 1 FROM platform_private.c2_pilot_econ_approvals_v1 WHERE order_id=p_order AND kind=p_kind) THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_ALREADY_APPROVED' USING ERRCODE='PT409';END IF;
 IF EXISTS(SELECT 1 FROM platform_private.c2_pilot_econ_approvals_v1 WHERE order_id=p_order AND evidence_hash<>p_expected_hash) THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_EVIDENCE_CHANGED' USING ERRCODE='PT409';END IF;
 INSERT INTO platform_private.c2_pilot_econ_approvals_v1(order_id,kind,actor_id,actor_role,organization_id,partner_id,allowlist_id,evidence_hash,evidence,idempotency_key,notes)
 VALUES(p_order,p_kind,uid,act->>'role',org,po.partner_id,al.id,p_expected_hash,ev,p_key,nullif(btrim(p_notes),'')) RETURNING * INTO ap;
 SELECT * INTO c FROM platform_private.c2_pilot_econ_approvals_v1 WHERE order_id=p_order AND kind='commercial';
 SELECT * INTO k FROM platform_private.c2_pilot_econ_approvals_v1 WHERE order_id=p_order AND kind='credit';
 IF c.id IS NOT NULL AND k.id IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecasts WHERE order_id=p_order) THEN
   RAISE EXCEPTION 'C2_PILOT_FORECAST_ALREADY_EXISTS' USING ERRCODE='PT409';END IF;
  INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(txid_current(),'c2_pilot_forecast_create',p_order);
  INSERT INTO platform_private.b2b_financial_forecasts(order_id,organization_id,partner_id,total_amount,residual_amount,state,
   economic_snapshot,schedule_snapshot,items_snapshot,credit_decision_snapshot,commercial_approved_by,commercial_approved_at,credit_approved_by,credit_approved_at)
  VALUES(p_order,org,po.partner_id,(ev->>'financed_total')::numeric,(ev->>'financed_total')::numeric,'aguardando_fiscal',
   ev||jsonb_build_object('source','C2_PILOT_ECONOMIC_APPROVAL_V1','commercial_approval_id',c.id,'credit_approval_id',k.id),
   ev->'schedule',ev->'items',
   jsonb_build_object('source','C2_PILOT_EXPLICIT_CREDIT_APPROVAL_V1','approval_id',k.id,'approved_by',k.actor_id,'approved_at',k.approved_at,'role',k.actor_role),
   c.actor_id,c.approved_at,k.actor_id,k.approved_at) RETURNING * INTO f;
  INSERT INTO platform_private.b2b_financial_forecast_events(forecast_id,event_type,event_reference,payload,actor_id)
  VALUES(f.id,'PREVISION_CREATED',f.id::text,jsonb_build_object('total',f.total_amount,'estimated',true,'source','C2_PILOT_ECONOMIC_APPROVAL_V1'),uid);
  DELETE FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope='c2_pilot_forecast_create' AND target=p_order;
 END IF;
 RETURN jsonb_build_object('contract','C2_PILOT_ECON_APPROVAL_V1','replayed',false,'approval_id',ap.id,'kind',ap.kind,
  'approved_by',ap.actor_id,'approved_at',ap.approved_at,'forecast_id',f.id);
END$$;

CREATE FUNCTION public.c2_pilot_economic_approve_v1(p_order uuid,p_kind text,p_idempotency_key text,p_expected_evidence_hash text,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT platform_private.c2_pilot_econ_approve_core_v1(p_order,p_kind,p_idempotency_key,p_expected_evidence_hash,p_notes);
$$;

-- Leitura escopada: só ator competente do tenant vendedor; evidência só quando há concessão vigente do próprio ator.
CREATE FUNCTION public.c2_pilot_economic_state_v1(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid();ac jsonb;ak jsonb;org uuid;po public.partner_orders;en boolean;ev jsonb;evr text;g_c boolean;g_k boolean;f platform_private.b2b_financial_forecasts;
BEGIN
 ac:=platform_private.c2_pilot_econ_actor_v1('commercial');ak:=platform_private.c2_pilot_econ_actor_v1('credit');
 IF uid IS NULL OR (ac IS NULL AND ak IS NULL) THEN RAISE EXCEPTION 'C2_PILOT_ECON_DENIED:role' USING ERRCODE='42501';END IF;
 SELECT * INTO po FROM public.partner_orders WHERE id=p_order;
 SELECT pa.commercial_owner_organization_id INTO org FROM public.partner_accounts pa WHERE pa.id=po.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
 IF org IS NULL OR org IS DISTINCT FROM coalesce((ac->>'organization_id')::uuid,(ak->>'organization_id')::uuid) THEN
  RAISE EXCEPTION 'C2_PILOT_ECON_DENIED:scope' USING ERRCODE='42501';END IF;
 SELECT enabled INTO en FROM platform_private.c2_pilot_econ_gate_v1 WHERE singleton;
 g_c:=ac IS NOT NULL AND EXISTS(SELECT 1 FROM platform_private.c2_pilot_econ_allowlist_v1 a WHERE a.order_id=p_order AND a.kind='commercial' AND a.actor_id=uid AND a.organization_id=org AND a.partner_id=po.partner_id AND a.revoked_at IS NULL AND a.valid_from<=clock_timestamp() AND a.valid_until>clock_timestamp());
 g_k:=ak IS NOT NULL AND EXISTS(SELECT 1 FROM platform_private.c2_pilot_econ_allowlist_v1 a WHERE a.order_id=p_order AND a.kind='credit' AND a.actor_id=uid AND a.organization_id=org AND a.partner_id=po.partner_id AND a.revoked_at IS NULL AND a.valid_from<=clock_timestamp() AND a.valid_until>clock_timestamp());
 IF en IS TRUE AND (g_c OR g_k) THEN
  BEGIN ev:=platform_private.c2_pilot_econ_evidence_v1(p_order);EXCEPTION WHEN insufficient_privilege THEN evr:=SQLERRM;END;
 END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE order_id=p_order;
 RETURN jsonb_build_object('contract','C2_PILOT_ECON_STATE_V1','order_id',p_order,'pilot_enabled',coalesce(en,false),
  'evidence',ev,'evidence_block_reason',evr,
  'approvals',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',x.kind,'approved_by',x.actor_id,'actor_role',x.actor_role,'approved_at',x.approved_at,'evidence_hash',x.evidence_hash) ORDER BY x.approved_at),'[]'::jsonb)
               FROM platform_private.c2_pilot_econ_approvals_v1 x WHERE x.order_id=p_order),
  'can_approve_commercial',coalesce(en,false) AND g_c AND ev IS NOT NULL AND NOT EXISTS(SELECT 1 FROM platform_private.c2_pilot_econ_approvals_v1 WHERE order_id=p_order AND kind='commercial'),
  'can_approve_credit',coalesce(en,false) AND g_k AND ev IS NOT NULL AND NOT EXISTS(SELECT 1 FROM platform_private.c2_pilot_econ_approvals_v1 WHERE order_id=p_order AND kind='credit'),
  'forecast',CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('forecast_id',f.id,'state',f.state,'total_amount',f.total_amount,'due_dates_estimated',true,'created_at',f.created_at) END,
  'operational_blocked',true,'fiscal_blocked',true,'billing_blocked',true,'shipping_blocked',true);
END$$;

REVOKE ALL ON FUNCTION platform_private.c2_pilot_econ_immutable_v1(),platform_private.c2_pilot_forecast_insert_barrier_v1(),
 platform_private.c2_pilot_econ_evidence_v1(uuid),platform_private.c2_pilot_econ_actor_v1(text),
 platform_private.c2_pilot_econ_approve_core_v1(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.c2_pilot_econ_approve_core_v1(uuid,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.c2_pilot_economic_approve_v1(uuid,text,text,text,text),public.c2_pilot_economic_state_v1(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.c2_pilot_economic_approve_v1(uuid,text,text,text,text),public.c2_pilot_economic_state_v1(uuid) TO authenticated;

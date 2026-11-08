#!/usr/bin/env python3
"""Candidato NOVO de logística B2B para revenda; somente espelho/PG descartável.

Os corpos alterados são lidos da composição recém-instalada. Nenhum SQL é
transcrito de uma baseline LIVE nem executado fora do harness. O gate nasce
fechado, writers novos são privados e rollback é deny-only.
"""
import hashlib
import json
from pathlib import Path

CHANGED = [
    "private.guard_os_separate_approval()",
    "platform_private.trg_lab_os_biological_only()",
    "platform_private.stock_motor_refs(uuid,uuid,uuid,jsonb)",
    "platform_private.stock_p1_guard()",
    "platform_private.delivery_mutation_guard_20261030()",
    "platform_private.delivery_proof_row_ok_20261030(public.entregas,uuid,text)",
    "platform_private.delivery_confirm_recheck_v1(uuid,uuid)",
    "public.rpc_entrega_cancelar_v1(uuid,text,timestamptz)",
    "public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)",
    "public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)",
    "platform_private.delivery_confirm_apply_v1(uuid,timestamptz,text,jsonb)",
    "platform_private.delivery_send_apply_v1(uuid,timestamptz,text)",
    "public.trg_entrega_sync_partner_order_fn()",
    "platform_private.b2b_internal_order_snapshot_guard()",
]
NEW = [
    "platform_private.b2b_resale_os_valid_v1(public.ordens_servico)",
    "platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico)",
    "platform_private.b2b_resale_delivery_lineage_valid_v1(public.estoque_produto,public.entregas,public.lotes)",
    "platform_private.b2b_resale_delivery_order_valid_v1(public.entregas)",
    "platform_private.b2b_resale_delivery_status_transition_valid_v1(public.partner_orders,public.partner_orders)",
    "platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)",
]


def one(body, old, new, label, count=1):
    assert body.count(old) == count, f"anchor drift {label}: {body.count(old)} != {count}"
    return body.replace(old, new)


def install(B, out):
    out = Path(out) / "logistics"
    out.mkdir(parents=True, exist_ok=True)
    values = ",".join("('" + x.replace("'", "''") + "')" for x in CHANGED)
    raw = json.loads(B.last(f"""SELECT coalesce(jsonb_agg(jsonb_build_object(
      'signature',v.signature,'body',pg_get_functiondef(p.oid),'md5',md5(pg_get_functiondef(p.oid)),
      'owner',r.rolname,'acl',coalesce(p.proacl::text,''))),'[]'::jsonb)
      FROM (VALUES {values}) v(signature) JOIN pg_proc p ON p.oid=to_regprocedure(v.signature)
      JOIN pg_roles r ON r.oid=p.proowner;"""))
    assert len(raw) == len(CHANGED), (len(raw), raw)
    defs = {x["signature"]: x for x in raw}
    (out / "raw-current.json").write_text(json.dumps(raw, indent=2) + "\n")

    ddl = r"""
CREATE TABLE platform_private.b2b_resale_logistics_gate_v1(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO platform_private.b2b_resale_logistics_gate_v1(singleton,enabled) VALUES(true,false);
ALTER TABLE platform_private.b2b_resale_logistics_gate_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.b2b_resale_logistics_gate_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE platform_private.b2b_resale_os_requests_v1(
 request_key text NOT NULL,actor uuid NOT NULL,organization_id uuid NOT NULL,
 order_id uuid NOT NULL,order_item_id uuid NOT NULL UNIQUE,fingerprint text NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor,organization_id,request_key));
ALTER TABLE platform_private.b2b_resale_os_requests_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.b2b_resale_os_requests_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE UNIQUE INDEX b2b_resale_os_item_unique_v1 ON public.ordens_servico(partner_order_item_id)
 WHERE origem='b2b' AND partner_order_item_id IS NOT NULL;

CREATE FUNCTION platform_private.b2b_resale_os_valid_v1(o public.ordens_servico)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)
  AND o.id IS NOT NULL AND o.origem='b2b' AND o.status::text='pronto_entrega'
  AND o.organization_id IS NOT NULL AND o.partner_order_id IS NOT NULL AND o.partner_order_item_id IS NOT NULL
  AND o.produto_id IS NOT NULL AND o.microrganismo_id IS NULL AND o.cliente_id IS NULL
  AND o.fazenda_id IS NULL AND o.talhao_id IS NULL AND o.volume_total_ml IS NULL AND o.area_hectares IS NULL
  AND EXISTS(
   SELECT 1 FROM public.partner_orders po
   JOIN public.partner_accounts pa ON pa.id=po.partner_id AND pa.commercial_owner_organization_id=o.organization_id
    AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
   JOIN public.partner_order_items i ON i.id=o.partner_order_item_id AND i.order_id=po.id
   JOIN public.produtos p ON p.id=i.product_id AND p.owner_organization_id=o.organization_id
    AND p.ativo IS TRUE AND p.familia_catalogo IN ('quimico','fertilizante_adubo')
   WHERE po.id=o.partner_order_id AND po.status::text='aprovado' AND po.ready_for_production IS FALSE
    AND po.receivable_generated IS FALSE AND po.payment_condition_status='defined'
    AND po.financial_approval_status NOT IN ('pending','rejected')
    AND platform_private.c2_external_origin_contract_valid(po.c2_external_origin_snapshot) IS TRUE
    AND po.internal_economic_snapshot IS NOT NULL AND po.internal_origin_snapshot IS NULL
    AND i.product_id=o.produto_id AND i.microrganismo_id IS NULL
    AND i.quantidade>0 AND i.quantidade=trunc(i.quantidade) AND i.unidade_medida='unidade'
    AND i.packaging_id_snapshot IS NOT NULL AND i.packaging_version_snapshot>0
    AND i.packaging_unidade_conteudo_snapshot IN ('kg','g','l','ml')
    AND ((i.packaging_unidade_conteudo_snapshot IN ('kg','g') AND i.packaging_peso_liquido_kg_snapshot>0)
      OR (i.packaging_unidade_conteudo_snapshot IN ('l','ml') AND i.packaging_peso_liquido_kg_snapshot IS NULL))
  )) IS TRUE;
$$;
REVOKE ALL ON FUNCTION platform_private.b2b_resale_os_valid_v1(public.ordens_servico) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION platform_private.b2b_resale_os_operational_valid_v1(o public.ordens_servico)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)
  AND o.id IS NOT NULL AND o.origem='b2b' AND o.status::text='pronto_entrega'
  AND o.organization_id IS NOT NULL AND o.partner_order_id IS NOT NULL AND o.partner_order_item_id IS NOT NULL
  AND o.produto_id IS NOT NULL AND o.microrganismo_id IS NULL AND o.cliente_id IS NULL
  AND o.fazenda_id IS NULL AND o.talhao_id IS NULL AND o.volume_total_ml IS NULL AND o.area_hectares IS NULL
  AND EXISTS(
   SELECT 1 FROM public.partner_orders po
    JOIN public.partner_accounts pa ON pa.id=po.partner_id AND pa.commercial_owner_organization_id=o.organization_id
    AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
   JOIN public.partner_order_items i ON i.id=o.partner_order_item_id AND i.order_id=po.id
   JOIN public.produtos p ON p.id=i.product_id AND p.owner_organization_id=o.organization_id
    AND p.ativo IS TRUE AND p.familia_catalogo IN ('quimico','fertilizante_adubo')
   WHERE po.id=o.partner_order_id AND po.status::text IN ('aprovado','aguardando_entrega','em_separacao','enviado','entregue','faturado')
    AND po.ready_for_production IS FALSE AND po.receivable_generated IS FALSE
    AND po.payment_condition_status='defined' AND po.financial_approval_status NOT IN ('pending','rejected')
    AND platform_private.c2_external_origin_contract_valid(po.c2_external_origin_snapshot) IS TRUE
    AND po.internal_economic_snapshot IS NOT NULL AND po.internal_origin_snapshot IS NULL
    AND i.product_id=o.produto_id AND i.microrganismo_id IS NULL
    AND i.quantidade>0 AND i.quantidade=trunc(i.quantidade) AND i.unidade_medida='unidade'
    AND i.packaging_id_snapshot IS NOT NULL AND i.packaging_version_snapshot>0
    AND i.packaging_unidade_conteudo_snapshot IN ('kg','g','l','ml')
    AND ((i.packaging_unidade_conteudo_snapshot IN ('kg','g') AND i.packaging_peso_liquido_kg_snapshot>0)
      OR (i.packaging_unidade_conteudo_snapshot IN ('l','ml') AND i.packaging_peso_liquido_kg_snapshot IS NULL))
  )) IS TRUE;
$$;
REVOKE ALL ON FUNCTION platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION platform_private.b2b_resale_delivery_lineage_valid_v1(s public.estoque_produto,e public.entregas,l public.lotes)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)
  AND platform_private.finished_product_delivery_valid_v1(s,e,l) IS TRUE
  AND e.partner_order_id IS NOT NULL AND e.cliente_id IS NULL
  AND s.reservado_para_os_id=e.ordem_servico_id AND s.reservado_para_os_tipo='b2b'
  AND s.reservado_para_partner_order_id=e.partner_order_id AND s.reservado_para_cliente_id IS NULL
  AND EXISTS(
   SELECT 1 FROM public.ordens_servico os
   JOIN public.partner_orders po ON po.id=os.partner_order_id AND po.id=e.partner_order_id
   JOIN public.partner_accounts pa ON pa.id=po.partner_id AND pa.commercial_owner_organization_id=os.organization_id
   WHERE os.id=e.ordem_servico_id AND os.organization_id=e.organization_id AND os.origem='b2b'
    AND os.partner_order_item_id IS NOT NULL AND os.produto_id=e.produto_id AND os.microrganismo_id IS NULL
    AND po.status::text IN ('aprovado','aguardando_entrega','em_separacao','enviado','entregue','faturado')
    AND po.ready_for_production IS FALSE AND po.receivable_generated IS FALSE
    AND platform_private.c2_external_origin_contract_valid(po.c2_external_origin_snapshot) IS TRUE
    AND po.internal_economic_snapshot IS NOT NULL AND po.internal_origin_snapshot IS NULL
    AND s.reservado_para_partner_id=po.partner_id
    AND EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.id=os.partner_order_item_id AND i.order_id=po.id
      AND i.product_id=os.produto_id AND i.microrganismo_id IS NULL AND i.quantidade>0 AND i.quantidade=trunc(i.quantidade)
      AND i.packaging_id_snapshot=s.embalagem_id AND i.packaging_version_snapshot=s.embalagem_versao)
  )) IS TRUE;
$$;
REVOKE ALL ON FUNCTION platform_private.b2b_resale_delivery_lineage_valid_v1(public.estoque_produto,public.entregas,public.lotes) FROM PUBLIC,anon,authenticated,service_role;

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
 ) IS TRUE;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.b2b_resale_delivery_status_transition_valid_v1(public.partner_orders,public.partner_orders) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION platform_private.b2b_resale_os_create_v1(
 p_order_id uuid,p_order_item_id uuid,p_expected_updated_at timestamptz,p_request_key text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='3s' AS $resale$
DECLARE v_uid uuid:=auth.uid();v_org uuid;v_order public.partner_orders%ROWTYPE;
 v_item public.partner_order_items%ROWTYPE;v_prev platform_private.b2b_resale_os_requests_v1%ROWTYPE;
 v_os uuid:=gen_random_uuid();v_fp text;v_result jsonb;
BEGIN
 IF platform_private.b2b_internal_commercial_actor() IS NOT TRUE THEN RAISE EXCEPTION 'B2B_RESALE_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 v_org:=platform_private.stock_motor_actor('reserva');
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled) THEN RAISE EXCEPTION 'B2B_RESALE_GATE_CLOSED' USING ERRCODE='42501';END IF;
 IF p_order_id IS NULL OR p_order_item_id IS NULL OR p_expected_updated_at IS NULL OR p_request_key IS NULL
  OR length(btrim(p_request_key))<8 OR length(p_request_key)>128 THEN RAISE EXCEPTION 'B2B_RESALE_REQUEST_INVALID' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('b2b_resale_os_request:'||p_request_key,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('b2b_resale_os_item:'||p_order_item_id::text,0));
 v_org:=platform_private.stock_motor_actor('reserva');
 IF platform_private.b2b_internal_commercial_actor() IS NOT TRUE THEN RAISE EXCEPTION 'B2B_RESALE_SCOPE_CHANGED' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled) THEN RAISE EXCEPTION 'B2B_RESALE_GATE_CLOSED' USING ERRCODE='42501';END IF;
 SELECT * INTO v_order FROM public.partner_orders po WHERE po.id=p_order_id
  AND EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=po.partner_id AND pa.commercial_owner_organization_id=v_org AND pa.ativo AND pa.deleted_at IS NULL)
  AND platform_private.c2_external_origin_contract_valid(po.c2_external_origin_snapshot) IS TRUE
  AND po.internal_economic_snapshot IS NOT NULL AND po.internal_origin_snapshot IS NULL AND po.ready_for_production IS FALSE;
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_RESALE_ORDER_SCOPE_DENIED' USING ERRCODE='42501';END IF;
 v_fp:=encode(extensions.digest(jsonb_build_object('contract','B2B_RESALE_OS_V1','actor',v_uid,'org',v_org,'order',p_order_id,'item',p_order_item_id,'observed',p_expected_updated_at)::text,'sha256'),'hex');
 SELECT * INTO v_prev FROM platform_private.b2b_resale_os_requests_v1 WHERE actor=v_uid AND organization_id=v_org AND request_key=p_request_key;
 IF FOUND THEN
  IF v_prev.fingerprint IS DISTINCT FROM v_fp OR v_prev.order_id IS DISTINCT FROM p_order_id OR v_prev.order_item_id IS DISTINCT FROM p_order_item_id THEN RAISE EXCEPTION 'B2B_RESALE_REPLAY_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN v_prev.result||jsonb_build_object('replay',true);
 END IF;
 SELECT * INTO v_order FROM public.partner_orders WHERE id=p_order_id FOR UPDATE;
 IF v_order.status::text IS DISTINCT FROM 'aprovado' OR v_order.updated_at IS DISTINCT FROM p_expected_updated_at
  OR v_order.receivable_generated IS TRUE OR v_order.payment_condition_status IS DISTINCT FROM 'defined'
  OR v_order.financial_approval_status IN ('pending','rejected') THEN RAISE EXCEPTION 'B2B_RESALE_ORDER_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO v_item FROM public.partner_order_items i WHERE i.id=p_order_item_id AND i.order_id=p_order_id
  AND i.product_id IS NOT NULL AND i.microrganismo_id IS NULL AND i.quantidade>0 AND i.quantidade=trunc(i.quantidade)
  AND i.unidade_medida='unidade' AND i.packaging_id_snapshot IS NOT NULL AND i.packaging_version_snapshot>0
  AND i.packaging_unidade_conteudo_snapshot IN ('kg','g','l','ml')
  AND EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=i.product_id AND p.owner_organization_id=v_org AND p.ativo
   AND p.familia_catalogo IN ('quimico','fertilizante_adubo')) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_RESALE_ITEM_DENIED' USING ERRCODE='42501';END IF;
 INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(txid_current(),'b2b_resale_os_create_v1',v_os);
 INSERT INTO public.ordens_servico(id,organization_id,cliente_id,fazenda_id,talhao_id,produto_id,microrganismo_id,
  volume_total_ml,area_hectares,prioridade,status,tipo_item,partner_order_id,partner_order_item_id,origem)
 VALUES(v_os,v_org,NULL,NULL,NULL,v_item.product_id,NULL,NULL,NULL,'media','pronto_entrega','produto',p_order_id,p_order_item_id,'b2b');
 DELETE FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope='b2b_resale_os_create_v1' AND target=v_os;
 v_result:=jsonb_build_object('ok',true,'replay',false,'contract','B2B_RESALE_OS_V1','os_id',v_os,'order_id',p_order_id,'order_item_id',p_order_item_id);
 INSERT INTO platform_private.b2b_resale_os_requests_v1(request_key,actor,organization_id,order_id,order_item_id,fingerprint,result)
 VALUES(p_request_key,v_uid,v_org,p_order_id,p_order_item_id,v_fp,v_result);
 RETURN v_result;
EXCEPTION WHEN OTHERS THEN
 DELETE FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope='b2b_resale_os_create_v1';
 RAISE;
END;$resale$;
REVOKE ALL ON FUNCTION platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
"""

    sig = "private.guard_os_separate_approval()"
    body = defs[sig]["body"]
    body = one(body, " IF TG_OP='INSERT' THEN\n -- Criação normal", """ IF TG_OP='INSERT' THEN
 IF EXISTS(SELECT 1 FROM platform_private.authz_tickets t WHERE t.txid=txid_current() AND t.scope='b2b_resale_os_create_v1' AND t.target=NEW.id)
  AND platform_private.b2b_resale_os_valid_v1(NEW) IS TRUE THEN RETURN NEW;END IF;
 -- Criação normal""", "OS separate approval ticket")
    defs[sig]["new"] = body

    sig = "platform_private.trg_lab_os_biological_only()"
    body = defs[sig]["body"]
    body = one(body, "BEGIN\n  IF TG_OP='UPDATE'", """BEGIN
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM platform_private.authz_tickets t WHERE t.txid=txid_current() AND t.scope='b2b_resale_os_create_v1' AND t.target=NEW.id)
   AND platform_private.b2b_resale_os_valid_v1(NEW) IS TRUE THEN RETURN NEW;END IF;
  IF TG_OP='UPDATE'""", "OS biological ticket")
    defs[sig]["new"] = body

    sig = "platform_private.stock_motor_refs(uuid,uuid,uuid,jsonb)"
    body = defs[sig]["body"]
    body = one(body, " v_os_cliente uuid; v_os_order uuid;", " v_os_cliente uuid; v_os_order uuid; v_resale boolean:=false;", "stock refs declaration")
    body = one(body, "BEGIN\n IF v_cliente IS NOT NULL", """BEGIN
 IF v_tipo='b2b' AND v_order IS NOT NULL AND v_os IS NOT NULL AND platform_private.b2b_internal_commercial_actor() IS TRUE THEN
  SELECT platform_private.b2b_resale_os_valid_v1(o) INTO v_resale FROM public.ordens_servico o WHERE o.id=v_os AND o.organization_id=p_org;
 END IF;
 v_resale:=coalesce(v_resale,false);
 IF v_cliente IS NOT NULL""", "stock refs seller resale")
    body = one(body, "IF v_partner IS NOT NULL AND NOT coalesce(public.b2b_phase1_partner_visible(v_partner,false),false) THEN", "IF v_partner IS NOT NULL AND NOT v_resale AND NOT coalesce(public.b2b_phase1_partner_visible(v_partner,false),false) THEN", "stock refs partner")
    body = one(body, "IF v_order IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_orders o WHERE o.id=v_order AND o.partner_id=v_partner AND public.b2b_phase1_order_visible(o.id)) THEN", "IF v_order IS NOT NULL AND NOT v_resale AND NOT EXISTS(SELECT 1 FROM public.partner_orders o WHERE o.id=v_order AND o.partner_id=v_partner AND public.b2b_phase1_order_visible(o.id)) THEN", "stock refs order")
    defs[sig]["new"] = body

    sig = "platform_private.stock_p1_guard()"
    body = defs[sig]["body"]
    body = one(body, " v_lote public.lotes%ROWTYPE;", " v_lote public.lotes%ROWTYPE;\n v_resale boolean:=false;", "stock row guard declaration")
    body = one(body, "BEGIN\n IF auth.uid() IS NULL", """BEGIN
 IF TG_OP IN ('INSERT','UPDATE') AND NEW.reservado_para_os_id IS NOT NULL AND NEW.reservado_para_os_tipo='b2b'
  AND NEW.reservado_para_partner_id IS NOT NULL AND NEW.reservado_para_partner_order_id IS NOT NULL
  AND platform_private.b2b_internal_commercial_actor() IS TRUE THEN
  SELECT platform_private.b2b_resale_os_valid_v1(o) INTO v_resale
   FROM public.ordens_servico o
   WHERE o.id=NEW.reservado_para_os_id AND o.organization_id=v_org
    AND o.partner_order_id=NEW.reservado_para_partner_order_id
    AND EXISTS(SELECT 1 FROM public.partner_orders po WHERE po.id=o.partner_order_id AND po.partner_id=NEW.reservado_para_partner_id);
 END IF;
 v_resale:=coalesce(v_resale,false);
 IF auth.uid() IS NULL""", "stock row guard seller resale")
    body = one(body, "IF NEW.reservado_para_partner_id IS NOT NULL AND NOT coalesce(public.b2b_phase1_partner_visible(NEW.reservado_para_partner_id,false),false) THEN", "IF NEW.reservado_para_partner_id IS NOT NULL AND NOT v_resale AND NOT coalesce(public.b2b_phase1_partner_visible(NEW.reservado_para_partner_id,false),false) THEN", "stock row guard partner")
    body = one(body, "IF NEW.reservado_para_partner_order_id IS NOT NULL AND NOT EXISTS (", "IF NEW.reservado_para_partner_order_id IS NOT NULL AND NOT v_resale AND NOT EXISTS (", "stock row guard order")
    defs[sig]["new"] = body

    sig = "platform_private.delivery_mutation_guard_20261030()"
    body = defs[sig]["body"]
    body = one(body, "OR NEW.partner_order_id IS NOT NULL OR NEW.receivable_id IS NOT NULL OR NEW.ordem_servico_onfarm_id IS NOT NULL", "OR (NEW.partner_order_id IS NOT NULL AND platform_private.b2b_resale_delivery_order_valid_v1(NEW) IS NOT TRUE) OR NEW.receivable_id IS NOT NULL OR NEW.ordem_servico_onfarm_id IS NOT NULL", "delivery mutation resale order")
    body = one(body, "  AND OLD.partner_order_id IS NULL AND NEW.partner_order_id IS NULL\n", "  AND (NEW.partner_order_id IS NULL OR platform_private.b2b_resale_delivery_order_valid_v1(NEW) IS TRUE)\n", "delivery proof resale lineage")
    defs[sig]["new"] = body

    sig = "platform_private.delivery_proof_row_ok_20261030(public.entregas,uuid,text)"
    body = defs[sig]["body"]
    body = one(body, """ IF p_e.id IS NULL OR p_e.organization_id IS DISTINCT FROM p_org OR p_e.cliente_id IS NULL
 OR p_e.partner_order_id IS NOT NULL OR p_e.ordem_servico_onfarm_id IS NOT NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=p_e.cliente_id AND organization_id=p_org) THEN RETURN false; END IF;""", """ IF p_e.id IS NULL OR p_e.organization_id IS DISTINCT FROM p_org OR p_e.ordem_servico_onfarm_id IS NOT NULL THEN RETURN false; END IF;
 IF p_e.partner_order_id IS NULL THEN
  IF p_e.cliente_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=p_e.cliente_id AND organization_id=p_org) THEN RETURN false; END IF;
 ELSIF platform_private.b2b_resale_delivery_order_valid_v1(p_e) IS NOT TRUE THEN RETURN false;
 END IF;""", "proof row resale lineage")
    defs[sig]["new"] = body

    sig = "platform_private.delivery_confirm_recheck_v1(uuid,uuid)"
    body = defs[sig]["body"]
    body = one(body, """IF NOT FOUND OR e.ordem_servico_id IS NULL OR e.partner_order_id IS NOT NULL OR e.ordem_servico_onfarm_id IS NOT NULL OR e.receivable_id IS NOT NULL OR e.os_faturamento_base_id IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM public.ordens_servico o JOIN public.clientes c ON c.id=o.cliente_id WHERE o.id=e.ordem_servico_id AND o.organization_id=p_org AND c.organization_id=p_org AND o.cliente_id=e.cliente_id AND o.origem='agronomica' AND o.partner_order_id IS NULL)
 OR EXISTS(SELECT 1 FROM public.production_order_link WHERE ordem_servico_id=e.ordem_servico_id)
 THEN RAISE EXCEPTION 'DELIVERY_CONFIRM_SCOPE_DENIED' USING ERRCODE='42501'; END IF;""", """IF NOT FOUND OR e.ordem_servico_id IS NULL OR e.ordem_servico_onfarm_id IS NOT NULL OR e.receivable_id IS NOT NULL OR e.os_faturamento_base_id IS NOT NULL
 OR (e.partner_order_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.ordens_servico o JOIN public.clientes c ON c.id=o.cliente_id WHERE o.id=e.ordem_servico_id AND o.organization_id=p_org AND c.organization_id=p_org AND o.cliente_id=e.cliente_id AND o.origem='agronomica' AND o.partner_order_id IS NULL))
 OR (e.partner_order_id IS NOT NULL AND platform_private.b2b_resale_delivery_order_valid_v1(e) IS NOT TRUE)
 OR EXISTS(SELECT 1 FROM public.production_order_link WHERE ordem_servico_id=e.ordem_servico_id)
 THEN RAISE EXCEPTION 'DELIVERY_CONFIRM_SCOPE_DENIED' USING ERRCODE='42501'; END IF;""", "confirmation recheck resale")
    defs[sig]["new"] = body

    sig = "public.rpc_entrega_cancelar_v1(uuid,text,timestamptz)"
    body = defs[sig]["body"]
    body = one(body, """IF v_e.ordem_servico_onfarm_id IS NOT NULL OR v_e.partner_order_id IS NOT NULL OR v_e.receivable_id IS NOT NULL OR v_e.status::text='entregue'
 OR NOT EXISTS(SELECT 1 FROM public.ordens_servico WHERE id=v_e.ordem_servico_id AND organization_id=v_org AND origem='agronomica' AND partner_order_id IS NULL)
 THEN RAISE EXCEPTION 'DELIVERY_CANCEL_ORIGIN_CLOSED' USING ERRCODE='42501'; END IF;""", """IF v_e.ordem_servico_onfarm_id IS NOT NULL OR v_e.receivable_id IS NOT NULL OR v_e.status::text='entregue'
 OR (v_e.partner_order_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.ordens_servico WHERE id=v_e.ordem_servico_id AND organization_id=v_org AND origem='agronomica' AND partner_order_id IS NULL))
 OR (v_e.partner_order_id IS NOT NULL AND platform_private.b2b_resale_delivery_order_valid_v1(v_e) IS NOT TRUE)
 THEN RAISE EXCEPTION 'DELIVERY_CANCEL_ORIGIN_CLOSED' USING ERRCODE='42501'; END IF;""", "cancel origin")
    body = one(body, " PERFORM 1 FROM public.ordens_servico WHERE id=v_e.ordem_servico_id AND organization_id=v_org AND origem='agronomica' AND partner_order_id IS NULL AND cliente_id=v_e.cliente_id FOR UPDATE;\n IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_CANCEL_ORIGIN_CLOSED' USING ERRCODE='42501'; END IF;", " IF v_e.partner_order_id IS NULL THEN PERFORM 1 FROM public.ordens_servico WHERE id=v_e.ordem_servico_id AND organization_id=v_org AND origem='agronomica' AND partner_order_id IS NULL AND cliente_id=v_e.cliente_id FOR UPDATE;\n ELSE PERFORM 1 FROM public.ordens_servico WHERE id=v_e.ordem_servico_id AND organization_id=v_org AND origem='b2b' AND partner_order_id=v_e.partner_order_id AND cliente_id IS NULL FOR UPDATE;\n END IF;\n IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_CANCEL_ORIGIN_CLOSED' USING ERRCODE='42501'; END IF;", "cancel OS lock")
    body = one(body, " PERFORM 1 FROM public.clientes WHERE id=v_e.cliente_id AND organization_id=v_org FOR SHARE;\n IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;", " IF v_e.cliente_id IS NOT NULL THEN PERFORM 1 FROM public.clientes WHERE id=v_e.cliente_id AND organization_id=v_org FOR SHARE;\n  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;\n END IF;", "cancel optional client")
    body = one(body, "IF v_e.status::text NOT IN ('separado','em_rota') OR v_s.reservado_para_os_id IS DISTINCT FROM v_e.ordem_servico_id OR v_s.reservado_para_os_tipo IS DISTINCT FROM 'manual' THEN", "IF v_e.status::text NOT IN ('separado','em_rota') OR v_s.reservado_para_os_id IS DISTINCT FROM v_e.ordem_servico_id OR v_s.reservado_para_os_tipo IS DISTINCT FROM (CASE WHEN v_e.partner_order_id IS NULL THEN 'manual' ELSE 'b2b' END)\n OR (v_e.partner_order_id IS NOT NULL AND (v_s.reservado_para_cliente_id IS NOT NULL OR v_s.reservado_para_partner_order_id IS DISTINCT FROM v_e.partner_order_id OR v_s.reservado_para_partner_id IS DISTINCT FROM (SELECT partner_id FROM public.partner_orders WHERE id=v_e.partner_order_id))) THEN", "cancel stock lineage")
    defs[sig]["new"] = body

    sig = "public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)"
    body = defs[sig]["body"]
    body = one(body, " v_result jsonb:='[]'; v_index integer:=0; v_ent uuid; v_reserved uuid; v_current timestamptz; v_original_client uuid;", " v_result jsonb:='[]'; v_index integer:=0; v_ent uuid; v_reserved uuid; v_current timestamptz; v_original_client uuid; v_partner uuid;", "group declaration")
    body = one(body, " IF p_origem IS DISTINCT FROM 'manual' OR p_os_id IS NULL THEN", " IF p_origem NOT IN ('manual','b2b') OR p_os_id IS NULL THEN", "group origin")
    old_scope = "IF NOT FOUND OR v_os.partner_order_id IS NOT NULL OR v_os.origem IS DISTINCT FROM 'agronomica' THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;"
    new_scope = "IF NOT FOUND OR (p_origem='manual' AND (v_os.partner_order_id IS NOT NULL OR v_os.origem IS DISTINCT FROM 'agronomica')) OR (p_origem='b2b' AND platform_private.b2b_resale_os_operational_valid_v1(v_os) IS NOT TRUE) THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;"
    body = one(body, old_scope, new_scope, "group OS scope", 2)
    body = one(body, "'origin','manual'", "'origin',p_origem", "group fingerprint")
    body = one(body, "IF v_os.cliente_id IS DISTINCT FROM v_original_client OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=v_os.cliente_id AND organization_id=v_org)", "IF v_os.cliente_id IS DISTINCT FROM v_original_client OR (p_origem='manual' AND NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=v_os.cliente_id AND organization_id=v_org))", "group replay client")
    body = one(body, "WHERE e.id IS NULL OR e.organization_id IS DISTINCT FROM v_org OR e.ordem_servico_id IS DISTINCT FROM p_os_id OR e.cliente_id IS DISTINCT FROM v_os.cliente_id)", "WHERE e.id IS NULL OR e.organization_id IS DISTINCT FROM v_org OR e.ordem_servico_id IS DISTINCT FROM p_os_id OR e.cliente_id IS DISTINCT FROM v_os.cliente_id OR e.partner_order_id IS DISTINCT FROM (CASE WHEN p_origem='b2b' THEN v_os.partner_order_id ELSE NULL END))", "group replay lineage")
    body = one(body, " IF v_os.cliente_id IS DISTINCT FROM v_original_client OR v_os.updated_at IS DISTINCT FROM p_os_observed THEN", " SELECT partner_id INTO v_partner FROM public.partner_orders WHERE id=v_os.partner_order_id;\n IF v_os.cliente_id IS DISTINCT FROM v_original_client OR v_os.updated_at IS DISTINCT FROM p_os_observed THEN", "group partner")
    body = one(body, " PERFORM 1 FROM public.clientes WHERE id=v_os.cliente_id AND organization_id=v_org FOR SHARE;\n IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;", " IF p_origem='manual' THEN PERFORM 1 FROM public.clientes WHERE id=v_os.cliente_id AND organization_id=v_org FOR SHARE;\n  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;\n ELSIF v_os.cliente_id IS NOT NULL OR v_partner IS NULL THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;", "group client")
    body = one(body, """IF v_row.reservado_para_os_id IS DISTINCT FROM p_os_id OR v_row.reservado_para_os_tipo IS DISTINCT FROM 'manual'
    OR v_row.reservado_para_cliente_id IS DISTINCT FROM v_os.cliente_id OR v_row.reservado_para_partner_id IS NOT NULL
    OR v_row.reservado_para_partner_order_id IS NOT NULL OR v_row.quantidade_reservada IS DISTINCT FROM v_row.quantidade
    OR v_row.quantidade IS DISTINCT FROM (v_item->>'quantidade')::numeric THEN RAISE EXCEPTION 'DELIVERY_RESERVATION_NOT_OWNED' USING ERRCODE='PT409'; END IF;""", """IF (p_origem='manual' AND (v_row.reservado_para_os_id IS DISTINCT FROM p_os_id OR v_row.reservado_para_os_tipo IS DISTINCT FROM 'manual'
      OR v_row.reservado_para_cliente_id IS DISTINCT FROM v_os.cliente_id OR v_row.reservado_para_partner_id IS NOT NULL
      OR v_row.reservado_para_partner_order_id IS NOT NULL OR v_row.quantidade_reservada IS DISTINCT FROM v_row.quantidade
      OR v_row.quantidade IS DISTINCT FROM (v_item->>'quantidade')::numeric))
     OR (p_origem='b2b' AND (v_row.reservado_para_os_id IS DISTINCT FROM p_os_id OR v_row.reservado_para_os_tipo IS DISTINCT FROM 'b2b'
      OR v_row.reservado_para_cliente_id IS NOT NULL OR v_row.reservado_para_partner_id IS DISTINCT FROM v_partner
      OR v_row.reservado_para_partner_order_id IS DISTINCT FROM v_os.partner_order_id OR v_row.quantidade_reservada IS DISTINCT FROM v_row.quantidade
      OR v_row.quantidade IS DISTINCT FROM (v_item->>'quantidade')::numeric))
     THEN RAISE EXCEPTION 'DELIVERY_RESERVATION_NOT_OWNED' USING ERRCODE='PT409'; END IF;""", "group reserved ownership")
    body = one(body, "jsonb_build_object('os_id',p_os_id,'os_tipo','manual','cliente_id',v_os.cliente_id)", "jsonb_build_object('os_id',p_os_id,'os_tipo',p_origem,'cliente_id',v_os.cliente_id,'partner_id',v_partner,'partner_order_id',v_os.partner_order_id)", "group stock permits", 2)
    body = one(body, "v_batch:=public.rpc_estoque_reservar_v1(p_os_id,'manual',v_free,'delivery-reserve:'||md5(jsonb_build_array(v_actor,v_org,p_request_key)::text),jsonb_build_object('cliente_id',v_os.cliente_id));", "v_batch:=public.rpc_estoque_reservar_v1(p_os_id,p_origem,v_free,'delivery-reserve:'||md5(jsonb_build_array(v_actor,v_org,p_request_key)::text),CASE WHEN p_origem='b2b' THEN jsonb_build_object('partner_id',v_partner,'partner_order_id',v_os.partner_order_id) ELSE jsonb_build_object('cliente_id',v_os.cliente_id) END);", "group reserve")
    body = one(body, "v_call:=public.rpc_cockpit_criar_entrega_v1(p_os_id,'manual',v_reserved,v_qty,p_dados||jsonb_build_object('cliente_id',v_os.cliente_id));", "v_call:=public.rpc_cockpit_criar_entrega_v1(p_os_id,p_origem,v_reserved,v_qty,p_dados||CASE WHEN p_origem='b2b' THEN '{}'::jsonb ELSE jsonb_build_object('cliente_id',v_os.cliente_id) END);", "group create")
    body = one(body, "AND quantidade_entregue=v_qty AND receivable_id IS NULL AND partner_order_id IS NULL)", "AND quantidade_entregue=v_qty AND receivable_id IS NULL AND partner_order_id IS NOT DISTINCT FROM (CASE WHEN p_origem='b2b' THEN v_os.partner_order_id ELSE NULL END))", "group delivery ack")
    body = one(body, "jsonb_build_object('referencia_tipo','entrega','referencia_id',v_ent,'os_id',p_os_id,'os_tipo','manual','cliente_id',v_os.cliente_id)", "jsonb_build_object('referencia_tipo','entrega','referencia_id',v_ent,'os_id',p_os_id,'os_tipo',p_origem,'cliente_id',v_os.cliente_id,'partner_id',v_partner,'partner_order_id',v_os.partner_order_id)", "group expedition")
    defs[sig]["new"] = body

    sig = "public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)"
    body = defs[sig]["body"]
    body = one(body, "  v_cliente_os uuid;", "  v_cliente_os uuid;\n  v_os public.ordens_servico%ROWTYPE;", "create OS declaration")
    body = one(body, "  ELSE\n    SELECT cliente_id INTO v_cliente_os\n    FROM public.ordens_servico\n    WHERE id = p_os_id;\n  END IF;", "  ELSE\n    SELECT * INTO v_os FROM public.ordens_servico WHERE id = p_os_id;\n    v_cliente_os:=v_os.cliente_id;\n  END IF;", "create OS row")
    body = one(body, "  IF NOT FOUND THEN\n    RAISE EXCEPTION 'COCKPIT_ENTREGA_OS_NAO_ENCONTRADA';\n  END IF;", "  IF NOT FOUND THEN\n    RAISE EXCEPTION 'COCKPIT_ENTREGA_OS_NAO_ENCONTRADA';\n  END IF;\n  IF v_origem='b2b' AND platform_private.b2b_resale_os_valid_v1(v_os) IS NOT TRUE THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501';END IF;", "create resale OS")
    body = one(body, "  IF v_est.reservado_para_cliente_id IS NOT NULL", "  IF v_origem='b2b' AND (v_est.reservado_para_partner_order_id IS DISTINCT FROM v_os.partner_order_id OR v_est.reservado_para_partner_id IS DISTINCT FROM (SELECT partner_id FROM public.partner_orders WHERE id=v_os.partner_order_id)) THEN RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ENTREGA_PARCEIRO' USING ERRCODE='42501';END IF;\n  IF v_est.reservado_para_cliente_id IS NOT NULL", "create stock partner")
    body = one(body, "    data_saida, motorista, veiculo,\n    origem_estoque", "    data_saida, motorista, veiculo, partner_order_id,\n    origem_estoque", "create delivery partner column")
    body = one(body, "    nullif(p_dados->>'veiculo',''),\n    v_est.origem_estoque", "    nullif(p_dados->>'veiculo',''), CASE WHEN v_origem='b2b' THEN v_os.partner_order_id ELSE NULL END,\n    v_est.origem_estoque", "create delivery partner value")
    defs[sig]["new"] = body

    for sig, label in (("platform_private.delivery_confirm_apply_v1(uuid,timestamptz,text,jsonb)", "confirm"), ("platform_private.delivery_send_apply_v1(uuid,timestamptz,text)", "send")):
        body = defs[sig]["body"]
        body = one(body, "OR e.lote_id IS DISTINCT FROM initial.lote_id THEN", "OR e.lote_id IS DISTINCT FROM initial.lote_id OR e.partner_order_id IS DISTINCT FROM initial.partner_order_id THEN", label + " partner root")
        body = one(body, " PERFORM 1 FROM public.clientes WHERE id=e.cliente_id AND organization_id=org FOR SHARE;", " IF e.cliente_id IS NOT NULL THEN PERFORM 1 FROM public.clientes WHERE id=e.cliente_id AND organization_id=org FOR SHARE; END IF;", label + " optional client")
        body = one(body, " OR s.reservado_para_os_id IS DISTINCT FROM e.ordem_servico_id OR s.reservado_para_os_tipo IS DISTINCT FROM 'manual' OR s.reservado_para_cliente_id IS DISTINCT FROM e.cliente_id OR s.reservado_para_partner_order_id IS NOT NULL", " OR (e.partner_order_id IS NULL AND (s.reservado_para_os_id IS DISTINCT FROM e.ordem_servico_id OR s.reservado_para_os_tipo IS DISTINCT FROM 'manual' OR s.reservado_para_cliente_id IS DISTINCT FROM e.cliente_id OR s.reservado_para_partner_order_id IS NOT NULL))\n OR (e.partner_order_id IS NOT NULL AND platform_private.b2b_resale_delivery_lineage_valid_v1(s,e,l) IS NOT TRUE)", label + " resale lineage")
        if label == "send":
            body = one(body, "os_tipo='manual' AND lote_id=l.id", "os_tipo=CASE WHEN e.partner_order_id IS NOT NULL THEN 'b2b' ELSE 'manual' END AND lote_id=l.id", "send ledger origin")
        else:
            body = one(body, "os_tipo='manual' AND lote_id=l.id", "os_tipo=CASE WHEN e.partner_order_id IS NOT NULL THEN 'b2b' ELSE 'manual' END AND lote_id=l.id", "confirm ledger origin", 2)
            # O avanço canônico consulta vw_os_integridade_esteira, cuja família
            # de toda ordens_servico é 'manual'. A origem comercial B2B continua
            # em ordens_servico.origem, partner_order_id e no ledger acima.
            assert "ack:=public._rpc_avancar_esteira_laboratorio_internal(e.ordem_servico_id,'manual','enviar_entrega',NULL);" in body, "anchor drift confirm canonical advance family"
        defs[sig]["new"] = body

    sig = "public.trg_entrega_sync_partner_order_fn()"
    body = defs[sig]["body"]
    body = one(body, "WHERE os.partner_order_id = v_partner_order_id;", "WHERE os.partner_order_id = v_partner_order_id AND e.status <> 'cancelada';", "delivered count excludes cancellations")
    defs[sig]["new"] = body

    sig = "platform_private.b2b_internal_order_snapshot_guard()"
    body = defs[sig]["body"]
    body = one(body, "IF NEW.ready_for_production OR public.fn_b2b_status_is_operational(NEW.status) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;", "IF NEW.ready_for_production OR (public.fn_b2b_status_is_operational(NEW.status) AND platform_private.b2b_resale_delivery_status_transition_valid_v1(OLD,NEW) IS NOT TRUE) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;", "exact confirmed delivery order transition")
    defs[sig]["new"] = body

    candidate = ddl + "\n\n" + "\n\n".join(defs[x]["new"].rstrip().rstrip(";") + ";" for x in CHANGED) + "\n"
    pre = ["-- Candidato B2B_RESALE_LOGISTICS_V1 INATIVO/NÃO APROVADO; somente composição local nova."]
    for sig in CHANGED:
        x = defs[sig]
        lit = lambda s: "'" + str(s).replace("'", "''") + "'"
        pre.append(f"""DO $$DECLARE p oid:=to_regprocedure({lit(sig)});BEGIN
 IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM {lit(x['md5'])} THEN RAISE EXCEPTION 'B2B_RESALE_PRE_FUNCTION_DRIFT {sig}';END IF;
 IF (SELECT r.rolname FROM pg_proc f JOIN pg_roles r ON r.oid=f.proowner WHERE f.oid=p) IS DISTINCT FROM {lit(x['owner'])} THEN RAISE EXCEPTION 'B2B_RESALE_PRE_OWNER_DRIFT {sig}';END IF;
 IF (SELECT coalesce(f.proacl::text,'') FROM pg_proc f WHERE f.oid=p) IS DISTINCT FROM {lit(x['acl'])} THEN RAISE EXCEPTION 'B2B_RESALE_PRE_ACL_DRIFT {sig}';END IF;
END$$;""")
    pre.append("DO $$BEGIN IF to_regclass('platform_private.b2b_resale_logistics_gate_v1') IS NOT NULL OR to_regclass('platform_private.b2b_resale_os_requests_v1') IS NOT NULL OR to_regprocedure('platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)') IS NOT NULL THEN RAISE EXCEPTION 'B2B_RESALE_PRE_OBJECT_EXISTS';END IF;END$$;")
    install_sql = "\n\n".join(pre) + "\n\n" + candidate
    (out / "candidate.sql.review").write_text(candidate)
    (out / "install.sql.review").write_text(install_sql)
    loaded = B.run_raw(install_sql)
    (out / "install.stdout.txt").write_text(loaded.stdout)
    (out / "install.stderr.txt").write_text(loaded.stderr)
    (out / "install.exitcode").write_text(str(loaded.returncode) + "\n")
    assert loaded.returncode == 0, loaded.stderr
    assert B.last("SELECT enabled FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton;") == "f"
    (out / "pre-metadata.json").write_text(json.dumps(raw, indent=2) + "\n")
    return {"out": out, "candidate_sha256": hashlib.sha256(candidate.encode()).hexdigest(), "changed": CHANGED, "new": NEW}


def finish(B, out):
    out = Path(out) / "logistics"
    B.sql("UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false WHERE singleton;")
    values = ",".join("('" + x.replace("'", "''") + "')" for x in CHANGED + NEW)
    post = json.loads(B.last(f"""SELECT coalesce(jsonb_agg(jsonb_build_object('signature',v.signature,'md5',md5(pg_get_functiondef(p.oid)),'owner',r.rolname,'acl',coalesce(p.proacl::text,''))),'[]'::jsonb)
      FROM (VALUES {values}) v(signature) JOIN pg_proc p ON p.oid=to_regprocedure(v.signature) JOIN pg_roles r ON r.oid=p.proowner;"""))
    assert len(post) == len(CHANGED) + len(NEW)
    blocks = []
    for x in post:
        lit = lambda s: "'" + str(s).replace("'", "''") + "'"
        blocks.append(f"""DO $$DECLARE p oid:=to_regprocedure({lit(x['signature'])});BEGIN
 IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM {lit(x['md5'])} THEN RAISE EXCEPTION 'B2B_RESALE_POST_DRIFT {x['signature']}';END IF;
 IF (SELECT r.rolname FROM pg_proc f JOIN pg_roles r ON r.oid=f.proowner WHERE f.oid=p) IS DISTINCT FROM {lit(x['owner'])} THEN RAISE EXCEPTION 'B2B_RESALE_POST_OWNER_DRIFT {x['signature']}';END IF;
 IF (SELECT coalesce(f.proacl::text,'') FROM pg_proc f WHERE f.oid=p) IS DISTINCT FROM {lit(x['acl'])} THEN RAISE EXCEPTION 'B2B_RESALE_POST_ACL_DRIFT {x['signature']}';END IF;
END$$;""")
    blocks.append("DO $$BEGIN IF EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE enabled) THEN RAISE EXCEPTION 'B2B_RESALE_POST_GATE_OPEN';END IF;END$$;")
    post_sql = "\n\n".join(blocks) + "\n"
    (out / "postflight.sql.review").write_text(post_sql)
    checked = B.run_raw(post_sql)
    assert checked.returncode == 0, checked.stderr
    rollback = "UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false WHERE singleton;\nREVOKE ALL ON FUNCTION platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text),platform_private.b2b_resale_os_valid_v1(public.ordens_servico),platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico),platform_private.b2b_resale_delivery_lineage_valid_v1(public.estoque_produto,public.entregas,public.lotes),platform_private.b2b_resale_delivery_order_valid_v1(public.entregas),platform_private.b2b_resale_delivery_status_transition_valid_v1(public.partner_orders,public.partner_orders) FROM PUBLIC,anon,authenticated,service_role;\n-- Deny-only: não apaga OS, estoque, entregas, recibos nem histórico e não restaura definições anteriores.\n"
    (out / "rollback.sql.review").write_text(rollback)
    rolled = B.run_raw(rollback)
    (out / "rollback.stdout.txt").write_text(rolled.stdout)
    (out / "rollback.stderr.txt").write_text(rolled.stderr)
    (out / "rollback.exitcode").write_text(str(rolled.returncode) + "\n")
    assert rolled.returncode == 0, rolled.stderr
    (out / "post-metadata.json").write_text(json.dumps(post, indent=2) + "\n")
    manifest = {"status": "INACTIVE_NOT_APPROVED_NON_INSTALLABLE_PENDING_INDEPENDENT_REVIEW", "hosted": False, "default_enabled": False, "new_client_grants": [], "changed_functions": CHANGED, "new_functions": NEW, "files": {}}
    for p in out.iterdir():
        if p.is_file():
            manifest["files"][p.name] = {"sha256": hashlib.sha256(p.read_bytes()).hexdigest(), "bytes": p.stat().st_size}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest

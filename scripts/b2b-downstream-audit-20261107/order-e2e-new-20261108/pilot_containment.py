#!/usr/bin/env python3
"""Mandatory fail-closed ARBio pilot containment overlay; disposable PG only.

The legacy singleton remains a master switch, never sufficient authority. This
layer is installed while both switches are OFF and replaces every new operational
entry point before any authenticated pilot activation. No hosted I/O.
"""
import hashlib
import json
from pathlib import Path

GATE = "platform_private.resale_pilot_allowlist_v1"
SCOPE = "platform_private.resale_pilot_scope_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)"
ALLOW = "platform_private.resale_pilot_allowed_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)"
DELIVERY_SCOPE = "platform_private.resale_pilot_delivery_scope_v1(text,text,uuid,uuid,uuid)"
DELIVERY = "platform_private.resale_pilot_delivery_allowed_v1(text,text,uuid,uuid,uuid)"
CHANGED = [
    "platform_private.finished_product_delivery_valid_v1(public.estoque_produto,public.entregas,public.lotes)",
    "platform_private.finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date)",
    "public.rpc_finished_product_purchase_capability_v1()",
    "platform_private.b2b_resale_os_valid_v1(public.ordens_servico)",
    "platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico)",
    "platform_private.b2b_resale_delivery_lineage_valid_v1(public.estoque_produto,public.entregas,public.lotes)",
    "platform_private.b2b_resale_delivery_order_valid_v1(public.entregas)",
    "platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)",
    "public.rpc_b2b_resale_os_availability_v1(uuid)",
    "public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)",
    "public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)",
    "public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)",
    "public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)",
    "platform_private.delivery_send_apply_v1(uuid,timestamptz,text)",
    "platform_private.delivery_confirm_apply_v1(uuid,timestamptz,text,jsonb)",
    "public.rpc_entrega_cancelar_v1(uuid,text,timestamptz)",
    "platform_private.delivery_proof_apply_20261030(text,uuid,text,jsonb)",
    "public.rpc_entrega_comprovacao_preflight_v1(uuid,text)",
]


def one(body, old, new, label, count=1):
    assert body.count(old) == count, f"PILOT_ANCHOR_DRIFT:{label}:{body.count(old)}!={count}"
    return body.replace(old, new)


def many(body, old, new, label):
    assert body.count(old) >= 1, f"PILOT_ANCHOR_DRIFT:{label}:0"
    return body.replace(old, new)


def foundation():
    return r"""
CREATE TABLE platform_private.resale_pilot_allowlist_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 gate text NOT NULL CHECK(gate IN ('finished_product','b2b_resale')),
 operation text NOT NULL CHECK(operation IN ('purchase','read','os_create','reserve','delivery_create','send','proof','confirm','cancel')),
 actor_id uuid NOT NULL,organization_id uuid NOT NULL,
 partner_id uuid,order_id uuid,order_item_id uuid,product_id uuid,stock_id uuid,delivery_id uuid,
 synthetic boolean NOT NULL DEFAULT true CHECK(synthetic IS TRUE),
 valid_from timestamptz NOT NULL DEFAULT now(),valid_until timestamptz NOT NULL,
 revoked_at timestamptz,revoked_by uuid,revoke_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid,
 CHECK(valid_until>valid_from),
 CHECK((revoked_at IS NULL) OR (revoked_at>=valid_from)),
 CHECK(
  (operation='purchase' AND gate='finished_product' AND partner_id IS NULL AND order_id IS NULL AND order_item_id IS NULL AND product_id IS NOT NULL AND stock_id IS NULL AND delivery_id IS NULL)
  OR (operation='read' AND gate='b2b_resale' AND partner_id IS NOT NULL AND order_id IS NOT NULL AND order_item_id IS NULL AND product_id IS NULL AND stock_id IS NULL AND delivery_id IS NULL)
  OR (operation='os_create' AND gate='b2b_resale' AND partner_id IS NOT NULL AND order_id IS NOT NULL AND order_item_id IS NOT NULL AND product_id IS NOT NULL AND stock_id IS NULL AND delivery_id IS NULL)
  OR (operation IN ('reserve','delivery_create') AND ((gate='b2b_resale' AND partner_id IS NOT NULL AND order_id IS NOT NULL AND order_item_id IS NOT NULL) OR (gate='finished_product' AND partner_id IS NULL AND order_id IS NULL AND order_item_id IS NULL)) AND product_id IS NOT NULL AND stock_id IS NOT NULL AND delivery_id IS NULL)
  OR (operation IN ('send','proof','confirm','cancel') AND product_id IS NOT NULL AND stock_id IS NOT NULL AND delivery_id IS NOT NULL)
 ));
ALTER TABLE platform_private.resale_pilot_allowlist_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.resale_pilot_allowlist_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION platform_private.resale_pilot_scope_v1(
 p_gate text,p_operation text,p_actor uuid,p_org uuid,p_partner uuid,p_order uuid,
 p_item uuid,p_product uuid,p_stock uuid,p_delivery uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT (
  (CASE p_gate
    WHEN 'finished_product' THEN EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE singleton AND enabled IS TRUE)
    WHEN 'b2b_resale' THEN EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)
    ELSE false END)
  AND p_actor IS NOT NULL AND p_org IS NOT NULL
  AND EXISTS(
   SELECT 1 FROM platform_private.resale_pilot_allowlist_v1 a
   WHERE a.gate=p_gate AND (p_operation IS NULL OR a.operation=p_operation)
    AND a.actor_id=p_actor AND a.organization_id=p_org AND a.synthetic IS TRUE
    AND a.valid_from<=pg_catalog.clock_timestamp() AND a.valid_until>pg_catalog.clock_timestamp() AND a.revoked_at IS NULL
    AND a.partner_id IS NOT DISTINCT FROM p_partner
    AND a.order_id IS NOT DISTINCT FROM p_order
    AND a.order_item_id IS NOT DISTINCT FROM p_item
    AND a.product_id IS NOT DISTINCT FROM p_product
    AND a.stock_id IS NOT DISTINCT FROM p_stock
    AND a.delivery_id IS NOT DISTINCT FROM p_delivery
  )) IS TRUE;
$$;
REVOKE ALL ON FUNCTION platform_private.resale_pilot_scope_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION platform_private.resale_pilot_allowed_v1(
 p_gate text,p_operation text,p_actor uuid,p_org uuid,p_partner uuid,p_order uuid,
 p_item uuid,p_product uuid,p_stock uuid,p_delivery uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_grant record;
BEGIN
 IF NOT (CASE p_gate
   WHEN 'finished_product' THEN EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE singleton AND enabled IS TRUE)
   WHEN 'b2b_resale' THEN EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)
   ELSE false END) OR p_actor IS NULL OR p_org IS NULL THEN RETURN false; END IF;
 -- A autorização final serializa com UPDATE/revogação na MESMA linha. O tempo é
 -- medido somente DEPOIS da espera do lock: now() não pode manter grant expirado.
 FOR v_grant IN
  SELECT a.* FROM platform_private.resale_pilot_allowlist_v1 a
  WHERE a.gate=p_gate AND (p_operation IS NULL OR a.operation=p_operation)
   AND a.actor_id=p_actor AND a.organization_id=p_org
   AND a.partner_id IS NOT DISTINCT FROM p_partner
   AND a.order_id IS NOT DISTINCT FROM p_order
   AND a.order_item_id IS NOT DISTINCT FROM p_item
   AND a.product_id IS NOT DISTINCT FROM p_product
   AND a.stock_id IS NOT DISTINCT FROM p_stock
   AND a.delivery_id IS NOT DISTINCT FROM p_delivery
  ORDER BY a.id FOR UPDATE
 LOOP
  IF v_grant.synthetic IS TRUE AND v_grant.revoked_at IS NULL
   AND v_grant.valid_from<=pg_catalog.clock_timestamp()
   AND v_grant.valid_until>pg_catalog.clock_timestamp() THEN RETURN true; END IF;
 END LOOP;
 RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.resale_pilot_allowed_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION platform_private.resale_pilot_delivery_scope_v1(
 p_gate text,p_operation text,p_actor uuid,p_org uuid,p_delivery uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.entregas e
  JOIN public.estoque_produto s ON s.id=e.estoque_produto_id
  LEFT JOIN public.ordens_servico os ON os.id=e.ordem_servico_id
  LEFT JOIN public.partner_orders po ON po.id=e.partner_order_id
  WHERE e.id=p_delivery AND e.organization_id=p_org
   AND ((p_gate='finished_product' AND e.partner_order_id IS NULL)
     OR (p_gate='b2b_resale' AND e.partner_order_id IS NOT NULL))
   AND platform_private.resale_pilot_scope_v1(p_gate,p_operation,p_actor,p_org,
    po.partner_id,e.partner_order_id,os.partner_order_item_id,e.produto_id,s.id,e.id) IS TRUE
 );
$$;
REVOKE ALL ON FUNCTION platform_private.resale_pilot_delivery_scope_v1(text,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION platform_private.resale_pilot_delivery_allowed_v1(
 p_gate text,p_operation text,p_actor uuid,p_org uuid,p_delivery uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.entregas e
  JOIN public.estoque_produto s ON s.id=e.estoque_produto_id
  LEFT JOIN public.ordens_servico os ON os.id=e.ordem_servico_id
  LEFT JOIN public.partner_orders po ON po.id=e.partner_order_id
  WHERE e.id=p_delivery AND e.organization_id=p_org
   AND ((p_gate='finished_product' AND e.partner_order_id IS NULL)
     OR (p_gate='b2b_resale' AND e.partner_order_id IS NOT NULL))
   AND platform_private.resale_pilot_allowed_v1(p_gate,p_operation,p_actor,p_org,
    po.partner_id,e.partner_order_id,os.partner_order_item_id,e.produto_id,s.id,e.id) IS TRUE
 );
$$;
REVOKE ALL ON FUNCTION platform_private.resale_pilot_delivery_allowed_v1(text,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
"""


def _os_guard(body, variable="o"):
    old = "EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)"
    new = f"platform_private.resale_pilot_scope_v1('b2b_resale',NULL,auth.uid(),{variable}.organization_id,(SELECT po.partner_id FROM public.partner_orders po WHERE po.id={variable}.partner_order_id),{variable}.partner_order_id,{variable}.partner_order_item_id,{variable}.produto_id,NULL,NULL)"
    body = one(body, old, new, "OS guard " + variable)
    return one(body, " STABLE SECURITY DEFINER", " VOLATILE SECURITY DEFINER", "OS guard volatility " + variable)


def _order_refs(order="p_order_id", item="p_order_item_id", product="p_product_id"):
    return order, item, product


def build_bodies(raw):
    defs = {r["signature"]: dict(r) for r in raw}
    for sig in (
        "platform_private.b2b_resale_os_valid_v1(public.ordens_servico)",
        "platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico)",
    ):
        defs[sig]["new"] = _os_guard(defs[sig]["body"])

    sig = "platform_private.b2b_resale_delivery_lineage_valid_v1(public.estoque_produto,public.entregas,public.lotes)"
    body = defs[sig]["body"]
    body = one(body,
        "EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)",
        "platform_private.resale_pilot_delivery_scope_v1('b2b_resale',NULL,auth.uid(),e.organization_id,e.id)",
        "delivery lineage scoped")
    defs[sig]["new"] = one(body, " STABLE SECURITY DEFINER", " VOLATILE SECURITY DEFINER", "delivery lineage volatility")

    sig = "platform_private.b2b_resale_delivery_order_valid_v1(public.entregas)"
    body = defs[sig]["body"]
    body = one(body,
        "SELECT (EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)",
        "SELECT (EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)\n  AND (e.status::text='separado' OR platform_private.resale_pilot_delivery_scope_v1('b2b_resale',NULL,auth.uid(),e.organization_id,e.id) IS TRUE)",
        "delivery order scoped")
    defs[sig]["new"] = one(body, " STABLE SECURITY DEFINER", " VOLATILE SECURITY DEFINER", "delivery order volatility")

    sig = "platform_private.finished_product_delivery_valid_v1(public.estoque_produto,public.entregas,public.lotes)"
    body = defs[sig]["body"]
    body = one(body,
        "SELECT (platform_private.finished_product_stock_valid_v1(s) IS TRUE",
        "SELECT ((e.status::text='separado' OR e.partner_order_id IS NOT NULL OR e.origem_estoque IS NULL OR platform_private.resale_pilot_delivery_scope_v1('finished_product',NULL,auth.uid(),e.organization_id,e.id) IS TRUE)\n  AND platform_private.finished_product_stock_valid_v1(s) IS TRUE",
        "physical delivery scoped")
    defs[sig]["new"] = one(body, " STABLE SECURITY DEFINER", " VOLATILE SECURITY DEFINER", "physical delivery volatility")

    sig = "platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)"
    body = defs[sig]["body"]
    body = one(body,
        "EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled)",
        "platform_private.resale_pilot_allowed_v1('b2b_resale','os_create',v_uid,v_org,(SELECT po.partner_id FROM public.partner_orders po WHERE po.id=p_order_id),p_order_id,p_order_item_id,(SELECT i.product_id FROM public.partner_order_items i WHERE i.id=p_order_item_id AND i.order_id=p_order_id),NULL,NULL)",
        "private OS pilot", 2)
    body = one(body,
        "EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)",
        "platform_private.resale_pilot_allowed_v1('b2b_resale','os_create',v_uid,v_org,v_order.partner_id,p_order_id,p_order_item_id,v_item.product_id,NULL,NULL)",
        "private OS post-lock pilot")
    body = body.replace("B2B_RESALE_GATE_CLOSED", "RESALE_PILOT_SCOPE_DENIED")
    defs[sig]["new"] = body

    sig = "public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)"
    body = defs[sig]["body"]
    body = one(body,
        "EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)",
        "platform_private.resale_pilot_allowed_v1('b2b_resale','os_create',actor,org,(SELECT po.partner_id FROM public.partner_orders po WHERE po.id=p_order_id),p_order_id,p_order_item_id,(SELECT i.product_id FROM public.partner_order_items i WHERE i.id=p_order_item_id AND i.order_id=p_order_id),NULL,NULL)",
        "public OS pilot")
    body = body.replace("B2B_RESALE_GATE_CLOSED", "RESALE_PILOT_SCOPE_DENIED")
    defs[sig]["new"] = body

    sig = "public.rpc_b2b_resale_os_availability_v1(uuid)"
    body = defs[sig]["body"]
    body = one(body,
        "SELECT coalesce(bool_and(g.enabled),false) INTO gate_open\n  FROM platform_private.b2b_resale_logistics_gate_v1 g WHERE g.singleton;",
        "SELECT platform_private.resale_pilot_allowed_v1('b2b_resale','read',actor,org,v_order.partner_id,p_order_id,NULL,NULL,NULL,NULL) INTO gate_open;",
        "reader scoped")
    body = one(body,
        " SELECT count(*) INTO duplicate_os FROM (",
        " IF EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE) AND gate_open IS NOT TRUE THEN RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;\n SELECT count(*) INTO duplicate_os FROM (",
        "reader outside allowlist denied")
    body = one(body,
        " IF auth.uid() IS DISTINCT FROM actor OR platform_private.b2b_internal_commercial_actor() IS NOT TRUE",
        " IF platform_private.resale_pilot_allowed_v1('b2b_resale','read',actor,org,v_order.partner_id,p_order_id,NULL,NULL,NULL,NULL) IS DISTINCT FROM gate_open THEN RAISE EXCEPTION 'RESALE_PILOT_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;\n IF auth.uid() IS DISTINCT FROM actor OR platform_private.b2b_internal_commercial_actor() IS NOT TRUE",
        "reader revalidation")
    defs[sig]["new"] = body

    sig = "platform_private.finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date)"
    body = defs[sig]["body"]
    old = "NOT EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE singleton AND enabled)"
    body = one(body, old,
        "NOT platform_private.resale_pilot_allowed_v1('finished_product','purchase',v_uid,v_org,NULL,NULL,NULL,p_produto_id,NULL,NULL)",
        "purchase pilot", 2)
    body = body.replace("FINISHED_PRODUCT_GATE_CLOSED", "RESALE_PILOT_SCOPE_DENIED")
    first = " IF NOT platform_private.resale_pilot_allowed_v1('finished_product','purchase',v_uid,v_org,NULL,NULL,NULL,p_produto_id,NULL,NULL) THEN\n  RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501';\n END IF;\n v_org:=platform_private.stock_motor_actor('entrada');"
    body = one(body, first, " v_org:=platform_private.stock_motor_actor('entrada');\n" + first.rsplit("\n v_org:=platform_private.stock_motor_actor('entrada');", 1)[0], "purchase actor before first scoped check")
    defs[sig]["new"] = body

    sig = "public.rpc_finished_product_purchase_capability_v1()"
    body = defs[sig]["body"]
    body = one(body,
        "v_available:=EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE singleton AND enabled IS TRUE);",
        "v_available:=EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE singleton AND enabled IS TRUE)\n  AND EXISTS(SELECT 1 FROM platform_private.resale_pilot_allowlist_v1 a WHERE a.gate='finished_product' AND a.operation='purchase' AND a.actor_id=auth.uid() AND a.organization_id=v_org AND a.synthetic AND a.valid_from<=now() AND a.valid_until>now() AND a.revoked_at IS NULL);",
        "purchase capability scoped")
    defs[sig]["new"] = body

    sig = "public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)"
    body = defs[sig]["body"]
    body = one(body, "  v_parent_ctx jsonb;", "  v_parent_ctx jsonb;\n  v_org uuid;\n  v_order_item uuid;", "reserve declarations")
    check = """  IF v_item.origem_estoque IS NOT NULL THEN
    v_org:=platform_private.stock_motor_actor('reserva');
    SELECT os.partner_order_item_id INTO v_order_item FROM public.ordens_servico os WHERE os.id=p_os_id AND os.organization_id=v_org;
    IF p_os_tipo='b2b' THEN
      IF platform_private.resale_pilot_allowed_v1('b2b_resale','reserve',auth.uid(),v_org,p_partner_id,p_partner_order_id,v_order_item,v_item.produto_id,p_item_id,NULL) IS NOT TRUE THEN RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
    ELSIF p_os_tipo='manual' THEN
      IF platform_private.resale_pilot_allowed_v1('finished_product','reserve',auth.uid(),v_org,NULL,NULL,NULL,v_item.produto_id,p_item_id,NULL) IS NOT TRUE THEN RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
    ELSE RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  END IF;
"""
    body = one(body, "  PERFORM platform_private.stock_motor_item(p_item_id,'reserva',jsonb_build_object('os_id',p_os_id,'os_tipo',p_os_tipo,'cliente_id',p_cliente_id,'partner_id',p_partner_id,'partner_order_id',p_partner_order_id));\n  IF v_item.status::text <> 'disponivel'", "  PERFORM platform_private.stock_motor_item(p_item_id,'reserva',jsonb_build_object('os_id',p_os_id,'os_tipo',p_os_tipo,'cliente_id',p_cliente_id,'partner_id',p_partner_id,'partner_order_id',p_partner_order_id));\n" + check + "  IF v_item.status::text <> 'disponivel'", "reserve scoped")
    defs[sig]["new"] = body

    sig = "public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)"
    body = defs[sig]["body"]
    scope = "IF NOT FOUND OR (p_origem='manual' AND (v_os.partner_order_id IS NOT NULL OR v_os.origem IS DISTINCT FROM 'agronomica')) OR (p_origem='b2b' AND platform_private.b2b_resale_os_operational_valid_v1(v_os) IS NOT TRUE) THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;"
    check = scope + """
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(p_itens) x
  JOIN public.estoque_produto s ON s.id=(x.value->>'item_id')::uuid
  WHERE (p_origem='b2b' AND platform_private.resale_pilot_allowed_v1('b2b_resale','delivery_create',v_actor,v_org,(SELECT po.partner_id FROM public.partner_orders po WHERE po.id=v_os.partner_order_id),v_os.partner_order_id,v_os.partner_order_item_id,s.produto_id,s.id,NULL) IS NOT TRUE)
    OR (p_origem='manual' AND s.origem_estoque IS NOT NULL AND platform_private.resale_pilot_allowed_v1('finished_product','delivery_create',v_actor,v_org,NULL,NULL,NULL,s.produto_id,s.id,NULL) IS NOT TRUE)
 ) THEN RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;"""
    body = one(body, scope, check, "group pilot before replay and after lock", 2)
    defs[sig]["new"] = body

    sig = "public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)"
    body = defs[sig]["body"]
    anchor = "  IF v_origem='b2b' AND platform_private.b2b_resale_os_valid_v1(v_os) IS NOT TRUE THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501';END IF;"
    check = anchor + """
  IF v_est.origem_estoque IS NOT NULL AND ((v_origem='b2b' AND platform_private.resale_pilot_allowed_v1('b2b_resale','delivery_create',auth.uid(),v_os.organization_id,(SELECT po.partner_id FROM public.partner_orders po WHERE po.id=v_os.partner_order_id),v_os.partner_order_id,v_os.partner_order_item_id,v_est.produto_id,v_est.id,NULL) IS NOT TRUE)
   OR (v_origem='manual' AND platform_private.resale_pilot_allowed_v1('finished_product','delivery_create',auth.uid(),v_os.organization_id,NULL,NULL,NULL,v_est.produto_id,v_est.id,NULL) IS NOT TRUE)) THEN RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501';END IF;"""
    body = one(body, anchor, check, "short delivery writer pilot")
    defs[sig]["new"] = body

    for sig, operation in (
        ("platform_private.delivery_send_apply_v1(uuid,timestamptz,text)", "send"),
        ("platform_private.delivery_confirm_apply_v1(uuid,timestamptz,text,jsonb)", "confirm"),
    ):
        body = defs[sig]["body"]
        anchor = " e:=platform_private.delivery_confirm_recheck_v1(p_entrega,org);"
        body = many(body, anchor, anchor + f"\n IF (e.partner_order_id IS NOT NULL OR e.origem_estoque IS NOT NULL) AND platform_private.resale_pilot_delivery_allowed_v1(CASE WHEN e.partner_order_id IS NULL THEN 'finished_product' ELSE 'b2b_resale' END,'{operation}',v_actor,org,e.id) IS NOT TRUE THEN RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;", operation + " every replay and writer revalidation")
        defs[sig]["new"] = body

    sig = "public.rpc_entrega_cancelar_v1(uuid,text,timestamptz)"
    body = defs[sig]["body"]
    anchor = " PERFORM platform_private.delivery_gate_20261030(v_org,'cancel');"
    body = many(body, anchor, anchor + "\n IF (v_e.partner_order_id IS NOT NULL OR v_e.origem_estoque IS NOT NULL) AND platform_private.resale_pilot_delivery_allowed_v1(CASE WHEN v_e.partner_order_id IS NULL THEN 'finished_product' ELSE 'b2b_resale' END,'cancel',v_actor,v_org,v_e.id) IS NOT TRUE THEN RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;", "cancel every replay and writer revalidation")
    defs[sig]["new"] = body

    sig = "platform_private.delivery_proof_apply_20261030(text,uuid,text,jsonb)"
    body = defs[sig]["body"]
    anchor = " v_e:=platform_private.delivery_proof_recheck_20261030(p_entrega,v_org,p_action);"
    body = many(body, anchor, anchor + "\n IF (v_e.partner_order_id IS NOT NULL OR v_e.origem_estoque IS NOT NULL) AND platform_private.resale_pilot_delivery_allowed_v1(CASE WHEN v_e.partner_order_id IS NULL THEN 'finished_product' ELSE 'b2b_resale' END,'proof',v_uid,v_org,v_e.id) IS NOT TRUE THEN RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;", "proof every replay and writer revalidation")
    defs[sig]["new"] = body

    sig = "public.rpc_entrega_comprovacao_preflight_v1(uuid,text)"
    body = defs[sig]["body"]
    anchor = " IF NOT FOUND OR NOT platform_private.delivery_proof_row_ok_20261030(v_e,v_org,p_action) THEN RAISE EXCEPTION 'DELIVERY_PROOF_SCOPE_DENIED' USING ERRCODE='42501'; END IF;"
    body = one(body, anchor, anchor + "\n IF (v_e.partner_order_id IS NOT NULL OR v_e.origem_estoque IS NOT NULL) AND platform_private.resale_pilot_delivery_allowed_v1(CASE WHEN v_e.partner_order_id IS NULL THEN 'finished_product' ELSE 'b2b_resale' END,'proof',auth.uid(),v_org,v_e.id) IS NOT TRUE THEN RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;", "proof preflight pilot")
    defs[sig]["new"] = body
    return defs


def install(B, out):
    out = Path(out) / "pilot-containment"
    out.mkdir(parents=True, exist_ok=True)
    assert B.last("SELECT enabled FROM platform_private.finished_product_gate_v1 WHERE singleton;") == "f"
    assert B.last("SELECT enabled FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton;") == "f"
    values = ",".join("('" + s.replace("'", "''") + "')" for s in CHANGED)
    raw = json.loads(B.last(f"""SELECT coalesce(jsonb_agg(jsonb_build_object('signature',v.signature,'body',pg_get_functiondef(p.oid),'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',coalesce(p.proacl::text,''))),'[]'::jsonb)
      FROM (VALUES {values}) v(signature) JOIN pg_proc p ON p.oid=to_regprocedure(v.signature);"""))
    assert len(raw) == len(CHANGED), (len(raw), len(CHANGED))
    defs = build_bodies(raw)
    pre = ["DO $$BEGIN IF to_regclass('platform_private.resale_pilot_allowlist_v1') IS NOT NULL OR to_regprocedure('platform_private.resale_pilot_allowed_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'PILOT_CONTAINMENT_ALREADY_EXISTS'; END IF;END$$;"]
    for row in raw:
        lit = lambda s: "'" + str(s).replace("'", "''") + "'"
        pre.append(f"DO $$DECLARE p oid:=to_regprocedure({lit(row['signature'])});BEGIN IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM {lit(row['md5'])} OR (SELECT pg_get_userbyid(pr.proowner) FROM pg_proc pr WHERE pr.oid=p) IS DISTINCT FROM {lit(row['owner'])} OR coalesce((SELECT pr.proacl::text FROM pg_proc pr WHERE pr.oid=p),'') IS DISTINCT FROM {lit(row['acl'])} THEN RAISE EXCEPTION 'PILOT_PRE_DRIFT {row['signature']}';END IF;END$$;")
    candidate = foundation() + "\n" + "\n\n".join(defs[s]["new"].rstrip().rstrip(";") + ";" for s in CHANGED) + "\n"
    sql = "BEGIN;SET LOCAL lock_timeout='3s';\n" + "\n".join(pre) + "\n" + candidate + "\nCOMMIT;\n"
    (out / "01-pre.sql.readonly").write_text("BEGIN READ ONLY;\n" + "\n".join(pre) + "\nROLLBACK;\n")
    (out / "02-install.sql.review").write_text(sql)
    (out / "candidate.sql.review").write_text(candidate)
    loaded = B.run_raw(sql)
    (out / "install.stderr.txt").write_text(loaded.stderr)
    assert loaded.returncode == 0, loaded.stderr
    values2 = ",".join("('" + s.replace("'", "''") + "')" for s in CHANGED + [ALLOW, DELIVERY])
    post = json.loads(B.last(f"""SELECT coalesce(jsonb_agg(jsonb_build_object('signature',v.signature,'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',coalesce(p.proacl::text,'')) ORDER BY v.signature),'[]'::jsonb) FROM (VALUES {values2}) v(signature) JOIN pg_proc p ON p.oid=to_regprocedure(v.signature);"""))
    assert len(post) == len(CHANGED) + 2
    blocks = []
    for row in post:
        blocks.append(f"DO $$DECLARE p oid:=to_regprocedure('{row['signature']}');BEGIN IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM '{row['md5']}' OR (SELECT pg_get_userbyid(pr.proowner) FROM pg_proc pr WHERE pr.oid=p) IS DISTINCT FROM '{row['owner']}' OR coalesce((SELECT pr.proacl::text FROM pg_proc pr WHERE pr.oid=p),'') IS DISTINCT FROM '{row['acl']}' THEN RAISE EXCEPTION 'PILOT_POST_DRIFT {row['signature']}';END IF;END$$;")
    blocks.append("DO $$BEGIN IF EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE enabled) OR EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE enabled) OR has_table_privilege('authenticated','platform_private.resale_pilot_allowlist_v1','SELECT,INSERT,UPDATE,DELETE') OR has_function_privilege('authenticated','platform_private.resale_pilot_allowed_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'PILOT_POST_NOT_CLOSED';END IF;END$$;")
    (out / "03-post.sql.readonly").write_text("BEGIN READ ONLY;\n" + "\n".join(blocks) + "\nROLLBACK;\n")
    checked = B.run_raw((out / "03-post.sql.readonly").read_text())
    assert checked.returncode == 0, checked.stderr
    rollback = """UPDATE platform_private.finished_product_gate_v1 SET enabled=false WHERE singleton;
UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false WHERE singleton;
REVOKE ALL ON FUNCTION platform_private.resale_pilot_allowed_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid),platform_private.resale_pilot_delivery_allowed_v1(text,text,uuid,uuid,uuid),platform_private.delivery_proof_apply_20261030(text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_finished_product_purchase_capability_v1(),public.rpc_finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date),public.rpc_b2b_resale_os_availability_v1(uuid),public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
-- Deny-only: allowlist, recibos e histórico permanecem; gates nunca são reabertos.
"""
    (out / "04-rollback-deny.sql.review").write_text(rollback)
    (out / "pre-metadata.json").write_text(json.dumps(raw, indent=2) + "\n")
    (out / "post-metadata.json").write_text(json.dumps(post, indent=2) + "\n")
    manifest = {"status": "INACTIVE_REVIEW_ONLY_NOT_APPROVED", "hosted": False, "default_enabled": False, "master_switch_is_not_authority": True, "client_allowlist_access": False, "changed_functions": CHANGED, "new_functions": [ALLOW, DELIVERY], "candidate_sha256": hashlib.sha256(candidate.encode()).hexdigest()}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (out / "README.md").write_text(Path(__file__).with_name("pilot-containment.README.md").read_text())
    return out

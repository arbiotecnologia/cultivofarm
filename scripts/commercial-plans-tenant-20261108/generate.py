#!/usr/bin/env python3
"""Gera o candidato de isolamento por tenant a partir das capturas LIVE pinadas."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parent
CAPTURE = ROOT / "capture" / "functions"
PINS = json.loads((ROOT / "capture" / "live-pins.json").read_text())
REF = "swzpzcwiasxmjutrmvkm"


def source(name: str) -> str:
    text = (CAPTURE / f"{name}.sql").read_text()
    signature = next(sig for sig in PINS["functions"] if sig.split("(", 1)[0] == name)
    assert hashlib.md5(text.encode()).hexdigest() == PINS["functions"][signature], name
    return text


def edit(text: str, old: str, new: str) -> str:
    count = text.count(old)
    assert count == 1, f"Âncora esperada uma vez, encontrada {count}: {old[:120]!r}"
    return text.replace(old, new)


def owner_check(text: str, declaration: str) -> str:
    text = edit(text, declaration, declaration + " v_org uuid := platform_private.commercial_plan_actor_organization();")
    needle = "IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;"
    return edit(text, needle, needle + "\n  IF v_org IS NULL THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501'; END IF;")


def build_functions() -> dict[str, str]:
    out: dict[str, str] = {}

    name = "rpc_admin_list_commercial_plans"
    s = owner_check(source(name), "        v_offset integer := greatest(coalesce(p_offset,0),0);")
    s = edit(s, "    WHERE (p_search IS NULL", "    WHERE p.organization_id = v_org\n      AND (p_search IS NULL")
    out[name] = s

    name = "rpc_admin_create_commercial_plan"
    s = owner_check(source(name), "DECLARE v_id uuid;")
    s = edit(s, "active, sort_order, created_by, updated_by, valid_from, valid_until, version, version_reason\n", "active, sort_order, created_by, updated_by, valid_from, valid_until, version, version_reason, organization_id\n")
    s = edit(s, "    nullif(p_payload->>'valid_until','')::timestamptz, 1, nullif(btrim(coalesce(p_payload->>'motivo','')),'')\n", "    nullif(p_payload->>'valid_until','')::timestamptz, 1, nullif(btrim(coalesce(p_payload->>'motivo','')),''), v_org\n")
    out[name] = s

    name = "rpc_admin_version_commercial_plan"
    s = owner_check(source(name), "DECLARE v_old public.commercial_payment_plans%ROWTYPE; v_new_id uuid; v_next integer; v_code text;")
    s = edit(s, "FROM public.commercial_payment_plans WHERE id = p_plan_id FOR UPDATE", "FROM public.commercial_payment_plans WHERE id = p_plan_id AND organization_id = v_org FOR UPDATE")
    marker = "  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;"
    s = edit(s, marker, marker + "\n  IF platform_private.commercial_plan_actor_organization() IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501'; END IF;")
    s = edit(s, "    version, root_plan_id, version_reason\n", "    version, root_plan_id, version_reason, organization_id\n")
    s = edit(s, "    v_next, coalesce(v_old.root_plan_id, v_old.id), nullif(btrim(coalesce(p_motivo,'')),'')\n", "    v_next, coalesce(v_old.root_plan_id, v_old.id), nullif(btrim(coalesce(p_motivo,'')),'') , v_org\n")
    out[name] = s

    for name in ("rpc_admin_update_commercial_plan_metadata", "rpc_admin_set_commercial_plan_active"):
        s = owner_check(source(name), "DECLARE v_old public.commercial_payment_plans%ROWTYPE;")
        needle = "FROM public.commercial_payment_plans WHERE id = p_plan_id FOR UPDATE"
        s = edit(s, needle, "FROM public.commercial_payment_plans WHERE id = p_plan_id AND organization_id = v_org FOR UPDATE")
        marker = "  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;"
        s = edit(s, marker, marker + "\n  IF platform_private.commercial_plan_actor_organization() IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501'; END IF;")
        out[name] = s

    name = "rpc_admin_set_default_commercial_plan"
    s = owner_check(source(name), "DECLARE v_old public.commercial_payment_plans%ROWTYPE; v_prev public.commercial_payment_plans%ROWTYPE;")
    s = edit(s, "hashtext('cpp_default_plan')", "hashtext('cpp_default_plan:' || v_org::text)")
    needle = "  PERFORM pg_advisory_xact_lock(hashtext('cpp_default_plan:' || v_org::text));"
    s = edit(s, needle, needle + "\n  IF platform_private.commercial_plan_actor_organization() IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501'; END IF;")
    s = edit(s, "FROM public.commercial_payment_plans WHERE id = p_plan_id FOR UPDATE", "FROM public.commercial_payment_plans WHERE id = p_plan_id AND organization_id = v_org FOR UPDATE")
    s = edit(s, "   WHERE is_default AND id <> p_plan_id FOR UPDATE", "   WHERE organization_id = v_org AND is_default AND id <> p_plan_id FOR UPDATE")
    s = edit(s, "   WHERE is_default AND id <> p_plan_id;", "   WHERE organization_id = v_org AND is_default AND id <> p_plan_id;")
    out[name] = s

    name = "rpc_admin_reorder_commercial_plans"
    s = owner_check(source(name), "DECLARE v_item jsonb;")
    s = edit(s, "DECLARE v_item jsonb;", "DECLARE v_item jsonb; v_ids uuid[]; v_requested integer; v_matched integer;")
    needle = "  IF jsonb_typeof(p_orders) <> 'array' THEN RAISE EXCEPTION 'orders_payload_invalid'; END IF;"
    s = edit(s, needle, needle + "\n  SELECT array_agg((x->>'id')::uuid), count(*) INTO v_ids, v_requested FROM jsonb_array_elements(p_orders) x;\n  SELECT count(*) INTO v_matched FROM public.commercial_payment_plans p WHERE p.id = ANY(v_ids) AND p.organization_id = v_org;\n  IF v_matched IS DISTINCT FROM v_requested THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501'; END IF;")
    s = edit(s, "hashtext('cpp_reorder')", "hashtext('cpp_reorder:' || v_org::text)")
    needle = "  PERFORM pg_advisory_xact_lock(hashtext('cpp_reorder:' || v_org::text));"
    s = edit(s, needle, needle + "\n  IF platform_private.commercial_plan_actor_organization() IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501'; END IF;\n  SELECT count(*) INTO v_matched FROM public.commercial_payment_plans p WHERE p.id = ANY(v_ids) AND p.organization_id = v_org;\n  IF v_matched IS DISTINCT FROM v_requested THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501'; END IF;")
    s = edit(s, "     WHERE id = (v_item->>'id')::uuid;", "     WHERE id = (v_item->>'id')::uuid AND organization_id = v_org;")
    out[name] = s

    name = "rpc_b2b_list_selectable_payment_plans"
    s = source(name)
    s = edit(s, "DECLARE v_uid uuid := auth.uid(); v_admin boolean;", "DECLARE v_uid uuid := auth.uid(); v_admin boolean; v_org uuid;")
    needle = "  RETURN QUERY\n  SELECT p.id"
    s = edit(s, needle, "  v_org := platform_private.commercial_plan_actor_organization();\n" + needle)
    old = """    AND (
      v_admin
      OR EXISTS (
        SELECT 1
          FROM public.commercial_payment_plan_assignments a
          JOIN public.partner_users pu ON pu.partner_id = a.partner_id
         WHERE a.plan_id = p.id
           AND a.status = 'published'
           AND a.buyer_scope = 'partner'
           AND pu.user_id = v_uid
           AND a.valid_from <= CURRENT_DATE
           AND (a.valid_until IS NULL OR a.valid_until >= CURRENT_DATE)
      )
    )"""
    s = edit(s, old, "    AND ((v_admin AND p.organization_id = v_org) OR platform_private.commercial_plan_buyer_visible(p.id, v_uid))")
    out[name] = s

    name = "platform_private.c2p1_assignment_fence"
    s = source(name)
    needle = " PERFORM 1 FROM public.clientes WHERE id IN (NEW.customer_id,CASE WHEN TG_OP='UPDATE' THEN OLD.customer_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;"
    s = edit(s, needle, needle + "\n PERFORM 1 FROM public.commercial_payment_plans WHERE id IN (NEW.plan_id,CASE WHEN TG_OP='UPDATE' THEN OLD.plan_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;")
    needle = " IF TG_OP='UPDATE' AND NOT platform_private.c2p1_assignment_allowed(OLD.buyer_scope,OLD.partner_id,OLD.customer_id)"
    s = edit(s, needle, " IF TG_OP='UPDATE' AND NOT platform_private.commercial_plan_scope_allowed(OLD.plan_id,OLD.buyer_scope,OLD.partner_id,OLD.customer_id)")
    s = edit(s, " IF NOT platform_private.c2p1_assignment_allowed(NEW.buyer_scope,NEW.partner_id,NEW.customer_id)", " IF NOT platform_private.commercial_plan_scope_allowed(NEW.plan_id,NEW.buyer_scope,NEW.partner_id,NEW.customer_id)")
    out[name] = s

    name = "platform_private.c2p1_history_allowed"
    s = source(name)
    s = edit(s, "AND platform_private.c2p1_assignment_allowed(a.buyer_scope,a.partner_id,a.customer_id))", "AND platform_private.commercial_plan_scope_allowed(a.plan_id,a.buyer_scope,a.partner_id,a.customer_id))")
    out[name] = s

    name = "platform_private.c2p1_item_allowed"
    s = source(name)
    s = edit(s, " SELECT platform_private.c2p1_assignment_allowed(p_scope,p_partner,p_customer) AND", " SELECT platform_private.commercial_plan_scope_allowed(p_plan,p_scope,p_partner,p_customer) AND\n platform_private.c2p1_assignment_allowed(p_scope,p_partner,p_customer) AND")
    out[name] = s

    name = "platform_private.c2p1_item_fence"
    s = source(name)
    needle = " PERFORM 1 FROM public.commercial_payment_plan_assignments WHERE id IN(r.assignment_id,CASE WHEN TG_OP='UPDATE' THEN OLD.assignment_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;"
    s = edit(s, needle, needle + "\n PERFORM 1 FROM public.commercial_payment_plans WHERE id IN(r.plan_id,CASE WHEN TG_OP='UPDATE' THEN OLD.plan_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;")
    out[name] = s

    name = "platform_private.c2p1_rule_fence"
    s = source(name)
    needle = " PERFORM 1 FROM public.clientes WHERE id IN(r.customer_id,CASE WHEN TG_OP='UPDATE' THEN OLD.customer_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;"
    s = edit(s, needle, needle + "\n PERFORM 1 FROM public.commercial_payment_plans WHERE id IN(r.plan_id,CASE WHEN TG_OP='UPDATE' THEN OLD.plan_id ELSE NULL END) ORDER BY id FOR SHARE NOWAIT;")
    s = edit(s, " IF NOT platform_private.c2p1_assignment_allowed(r.buyer_scope,r.partner_id,r.customer_id)\n OR (TG_OP='UPDATE' AND NOT platform_private.c2p1_assignment_allowed(OLD.buyer_scope,OLD.partner_id,OLD.customer_id))", " IF NOT platform_private.commercial_plan_scope_allowed(r.plan_id,r.buyer_scope,r.partner_id,r.customer_id)\n OR (TG_OP='UPDATE' AND NOT platform_private.commercial_plan_scope_allowed(OLD.plan_id,OLD.buyer_scope,OLD.partner_id,OLD.customer_id))")
    out[name] = s

    name = "rpc_cc_list_assignments"
    s = source(name)
    s = edit(s, "    WHERE platform_private.c2p1_assignment_allowed(a.buyer_scope,a.partner_id,a.customer_id)", "    WHERE platform_private.commercial_plan_scope_allowed(a.plan_id,a.buyer_scope,a.partner_id,a.customer_id)")
    out[name] = s

    name = "rpc_cc_validate_matrix"
    s = source(name)
    s = edit(s, " IF NOT platform_private.c2p1_assignment_allowed(p_buyer_scope,p_partner_id,p_customer_id)", " IF NOT platform_private.commercial_plan_scope_allowed(p_plan_id,p_buyer_scope,p_partner_id,p_customer_id)")
    out[name] = s

    name = "rpc_cc_simulate_price"
    s = source(name)
    needle = " -- Read-only canonical resolver; no order, credit, receivable, snapshot or fiscal writes."
    s = edit(s, needle, " IF NOT platform_private.commercial_plan_partner_visible(p_plan_id,p_partner_id) THEN RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;\n" + needle)
    out[name] = s

    name = "b2b_payment_condition_config_list"
    s = source(name)
    s = edit(s, "     WHERE v.organization_id = v_org AND v.version =", "     WHERE v.organization_id = v_org AND platform_private.commercial_plan_admin_allowed(v.plan_id) AND v.version =")
    s = edit(s, "FROM public.commercial_payment_plans p WHERE p.active IS TRUE AND p.superseded_by_id IS NULL)", "FROM public.commercial_payment_plans p WHERE p.organization_id = v_org AND p.active IS TRUE AND p.superseded_by_id IS NULL)")
    out[name] = s

    name = "platform_private.b2b_resolve_condition"
    s = source(name)
    needle = " SELECT v.* INTO c FROM platform_private.b2b_condition_versions v"
    s = edit(s, needle, " IF NOT platform_private.commercial_plan_partner_visible(p_plan,p_partner) THEN RAISE EXCEPTION 'payment_condition_unavailable' USING ERRCODE='PT409'; END IF;\n" + needle)
    s = edit(s, " JOIN public.commercial_payment_plans p ON p.id=v.plan_id AND p.active IS TRUE", " JOIN public.commercial_payment_plans p ON p.id=v.plan_id AND p.organization_id=org AND p.active IS TRUE")
    s = edit(s, " FROM public.commercial_payment_plans p WHERE p.id=p_plan;", " FROM public.commercial_payment_plans p WHERE p.id=p_plan AND p.organization_id=org;")
    out[name] = s

    for name in ("b2b_payment_condition_publish", "b2b_payment_condition_retire", "b2b_payment_condition_assign"):
        s = source(name)
        needle = "  IF platform_private.b2b_condition_cfg_actor(false) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;"
        s = edit(s, needle, needle + "\n  IF NOT platform_private.commercial_plan_admin_allowed(p_plan_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;")
        if name == "b2b_payment_condition_publish":
            s = edit(s, "FROM public.commercial_payment_plans p WHERE p.id=p_plan_id FOR SHARE", "FROM public.commercial_payment_plans p WHERE p.id=p_plan_id AND p.organization_id=v_org FOR SHARE")
            marker = "  IF pl.active IS NOT TRUE OR pl.superseded_by_id IS NOT NULL THEN RAISE EXCEPTION 'plan_inactive' USING ERRCODE='P0001'; END IF;"
            s = edit(s, marker, "  IF NOT platform_private.commercial_plan_admin_allowed(p_plan_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;\n" + marker)
        else:
            marker = "   ORDER BY v.version DESC LIMIT 1 FOR UPDATE;"
            s = edit(s, marker, marker + "\n  IF NOT platform_private.commercial_plan_admin_allowed(p_plan_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;")
        out[name] = s

    name = "simulate_b2b_payment_plan_secure"
    s = source(name)
    needle = "  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF; IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;"
    s = edit(s, needle, "  IF NOT FOUND OR NOT platform_private.commercial_plan_partner_visible(p_payment_plan_id,p_partner_id) THEN RAISE EXCEPTION 'plan_not_found'; END IF; IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;")
    out[name] = s

    name = "create_partner_order_secure"
    s = source(name)
    needle = "  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;\n  IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;"
    s = edit(s, needle, "  IF NOT FOUND OR NOT platform_private.commercial_plan_partner_visible(p_payment_plan_id,p_partner_id) THEN RAISE EXCEPTION 'plan_not_found'; END IF;\n  IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;")
    out[name] = s

    name = "convert_partner_simulation_to_order_secure"
    s = source(name)
    needle = "  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF; IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;"
    s = edit(s, needle, "  IF NOT FOUND OR NOT platform_private.commercial_plan_partner_visible(p_payment_plan_id,v_partner_id) THEN RAISE EXCEPTION 'plan_not_found'; END IF; IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;")
    out[name] = s

    name = "respond_b2b_order_quote_secure"
    s = source(name)
    needle = "  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF; IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;"
    s = edit(s, needle, "  IF NOT FOUND OR NOT platform_private.commercial_plan_partner_visible(v_order.payment_plan_id,v_order.partner_id) THEN RAISE EXCEPTION 'plan_not_found'; END IF; IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;")
    out[name] = s

    return out


HELPERS = r"""
CREATE OR REPLACE FUNCTION platform_private.commercial_plan_actor_organization()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro','gestor_comercial']::public.app_role[]);
$$;

CREATE OR REPLACE FUNCTION platform_private.commercial_plan_target_organization(p_scope text,p_partner uuid,p_customer uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE
 WHEN p_scope='partner' AND p_partner IS NOT NULL AND p_customer IS NULL THEN (
   SELECT pa.commercial_owner_organization_id FROM public.partner_accounts pa
   JOIN public.organizations o ON o.id=pa.commercial_owner_organization_id
   WHERE pa.id=p_partner AND pa.ativo IS TRUE AND pa.deleted_at IS NULL AND o.ativo IS TRUE AND o.status='ativa')
 WHEN p_scope='producer' AND p_partner IS NULL AND p_customer IS NOT NULL THEN (
   SELECT c.organization_id FROM public.clientes c JOIN public.organizations o ON o.id=c.organization_id
   WHERE c.id=p_customer AND c.status_cliente='ativo' AND o.ativo IS TRUE AND o.status='ativa')
 ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION platform_private.commercial_plan_admin_allowed(p_plan_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(EXISTS(SELECT 1 FROM public.commercial_payment_plans p
 WHERE p.id=p_plan_id AND p.organization_id IS NOT NULL
 AND p.organization_id=platform_private.commercial_plan_actor_organization()),false);
$$;

CREATE OR REPLACE FUNCTION platform_private.commercial_plan_scope_allowed(p_plan_id uuid,p_scope text,p_partner uuid,p_customer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(EXISTS(SELECT 1 FROM public.commercial_payment_plans p
 WHERE p.id=p_plan_id AND p.organization_id IS NOT NULL
 AND p.organization_id=platform_private.commercial_plan_target_organization(p_scope,p_partner,p_customer)
 AND p.organization_id=platform_private.commercial_plan_actor_organization()
 AND platform_private.c2p1_assignment_allowed(p_scope,p_partner,p_customer)),false);
$$;

CREATE OR REPLACE FUNCTION platform_private.commercial_plan_buyer_visible(p_plan_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(p_user_id IS NOT NULL AND public.has_role(p_user_id,'parceiro_b2b'::public.app_role) IS TRUE
 AND EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.user_id=p_user_id AND pr.ativo IS TRUE)
 AND EXISTS(SELECT 1 FROM public.commercial_payment_plans p
 JOIN public.commercial_payment_plan_assignments a ON a.plan_id=p.id AND a.buyer_scope='partner' AND a.status='published'
 AND a.valid_from<=CURRENT_DATE AND (a.valid_until IS NULL OR a.valid_until>=CURRENT_DATE)
 JOIN public.partner_accounts pa ON pa.id=a.partner_id AND pa.commercial_owner_organization_id=p.organization_id
 AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
 JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE AND o.status='ativa'
 JOIN public.partner_users pu ON pu.partner_id=pa.id AND pu.user_id=p_user_id AND pu.tenant_id=p.organization_id
 AND pu.revoked_at IS NULL AND COALESCE(pu.valid_from,'-infinity'::timestamptz)<=now()
 WHERE p.id=p_plan_id AND p.organization_id IS NOT NULL AND p.active IS TRUE AND p.superseded_by_id IS NULL
 AND p.valid_from<=now() AND (p.valid_until IS NULL OR p.valid_until>now())),false);
$$;

CREATE OR REPLACE FUNCTION platform_private.commercial_plan_partner_visible(p_plan_id uuid,p_partner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(EXISTS(SELECT 1 FROM public.commercial_payment_plans p
 JOIN public.partner_accounts pa ON pa.id=p_partner_id AND pa.commercial_owner_organization_id=p.organization_id
 AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
 JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE AND o.status='ativa'
 WHERE p.id=p_plan_id AND p.organization_id IS NOT NULL AND (
   p.organization_id=platform_private.commercial_plan_actor_organization()
   OR (public.has_role(auth.uid(),'parceiro_b2b'::public.app_role) IS TRUE AND EXISTS(
     SELECT 1 FROM public.commercial_payment_plan_assignments a
     JOIN public.partner_users pu ON pu.partner_id=a.partner_id AND pu.user_id=auth.uid() AND pu.tenant_id=p.organization_id
     AND pu.revoked_at IS NULL AND COALESCE(pu.valid_from,'-infinity'::timestamptz)<=now()
     JOIN public.profiles pr ON pr.user_id=auth.uid() AND pr.ativo IS TRUE
     WHERE a.plan_id=p.id AND a.partner_id=p_partner_id AND a.buyer_scope='partner' AND a.status='published'
     AND a.valid_from<=CURRENT_DATE AND (a.valid_until IS NULL OR a.valid_until>=CURRENT_DATE))))
 ),false);
$$;

CREATE OR REPLACE FUNCTION platform_private.commercial_plan_tenant_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
   RAISE EXCEPTION 'COMMERCIAL_PLAN_TENANT_IMMUTABLE' USING ERRCODE='42501';
 END IF;
 IF NEW.organization_id IS NULL THEN RAISE EXCEPTION 'COMMERCIAL_PLAN_TENANT_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NEW.root_plan_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.commercial_payment_plans r WHERE r.id=NEW.root_plan_id AND r.organization_id=NEW.organization_id) THEN
   RAISE EXCEPTION 'COMMERCIAL_PLAN_ROOT_TENANT_MISMATCH' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION platform_private.commercial_b3_version_tenant_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.commercial_payment_plans p WHERE p.id=NEW.plan_id AND p.organization_id=NEW.organization_id) THEN
   RAISE EXCEPTION 'COMMERCIAL_PLAN_TENANT_MISMATCH' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION platform_private.commercial_plan_actor_organization(),platform_private.commercial_plan_target_organization(text,uuid,uuid),platform_private.commercial_plan_partner_visible(uuid,uuid),platform_private.commercial_plan_tenant_guard(),platform_private.commercial_b3_version_tenant_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION platform_private.commercial_plan_admin_allowed(uuid),platform_private.commercial_plan_scope_allowed(uuid,text,uuid,uuid),platform_private.commercial_plan_buyer_visible(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.commercial_plan_admin_allowed(uuid),platform_private.commercial_plan_scope_allowed(uuid,text,uuid,uuid),platform_private.commercial_plan_buyer_visible(uuid,uuid) TO authenticated;
"""

BACKFILL = r"""
ALTER TABLE public.commercial_payment_plans
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;

WITH evidence AS (
  SELECT COALESCE(p.root_plan_id,p.id) AS family_id,pr.organization_id
  FROM public.commercial_payment_plans p JOIN public.profiles pr ON pr.user_id=p.created_by
  WHERE pr.organization_id IS NOT NULL
  UNION
  SELECT COALESCE(p.root_plan_id,p.id),pa.commercial_owner_organization_id
  FROM public.commercial_payment_plans p
  JOIN public.commercial_payment_plan_assignments a ON a.plan_id=p.id
  JOIN public.partner_accounts pa ON pa.id=a.partner_id
  WHERE pa.commercial_owner_organization_id IS NOT NULL
  UNION
  SELECT COALESCE(p.root_plan_id,p.id),c.organization_id
  FROM public.commercial_payment_plans p
  JOIN public.commercial_payment_plan_assignments a ON a.plan_id=p.id
  JOIN public.clientes c ON c.id=a.customer_id
  WHERE c.organization_id IS NOT NULL
  UNION
  SELECT COALESCE(p.root_plan_id,p.id),v.organization_id
  FROM public.commercial_payment_plans p
  JOIN platform_private.b2b_condition_versions v ON v.plan_id=p.id
), families AS (
  SELECT COALESCE(root_plan_id,id) AS family_id FROM public.commercial_payment_plans
), resolved AS (
  SELECT f.family_id,min(e.organization_id::text)::uuid AS organization_id
  FROM families f JOIN evidence e ON e.family_id=f.family_id
  GROUP BY f.family_id HAVING count(DISTINCT e.organization_id)=1
)
UPDATE public.commercial_payment_plans p SET organization_id=r.organization_id
FROM resolved r WHERE COALESCE(p.root_plan_id,p.id)=r.family_id;

DROP INDEX public.uq_cpp_single_default;
CREATE UNIQUE INDEX uq_cpp_single_default ON public.commercial_payment_plans(organization_id) NULLS NOT DISTINCT WHERE is_default;
CREATE INDEX idx_cpp_tenant_sort ON public.commercial_payment_plans(organization_id,active,sort_order);
"""

FENCES = r"""
CREATE TRIGGER commercial_plan_tenant_guard BEFORE INSERT OR UPDATE ON public.commercial_payment_plans
FOR EACH ROW EXECUTE FUNCTION platform_private.commercial_plan_tenant_guard();
CREATE TRIGGER commercial_b3_version_tenant_guard BEFORE INSERT ON platform_private.b2b_condition_versions
FOR EACH ROW EXECUTE FUNCTION platform_private.commercial_b3_version_tenant_guard();

CREATE POLICY cpp_tenant_read ON public.commercial_payment_plans FOR SELECT TO authenticated
USING(platform_private.commercial_plan_admin_allowed(id) OR platform_private.commercial_plan_buyer_visible(id,auth.uid()));
ALTER POLICY cppa_admin_read ON public.commercial_payment_plan_assignments
USING(platform_private.commercial_plan_scope_allowed(plan_id,buyer_scope,partner_id,customer_id));
ALTER POLICY cpr_internal_select ON public.commercial_price_rules
USING(platform_private.commercial_plan_scope_allowed(plan_id,buyer_scope,partner_id,customer_id));
"""

ACL_PRESERVE = r"""
REVOKE ALL ON public.commercial_payment_plans FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.commercial_payment_plans FROM authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.commercial_payment_plan_assignments,public.commercial_condition_item_prices,public.commercial_price_rules FROM anon,authenticated;
REVOKE ALL ON FUNCTION public._cpp_validate_payload(jsonb),public._cpp_audit(text,uuid,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
"""


def preflight(new_hashes: dict[str, str] | None = None) -> str:
    lines = ["-- READONLY PRE: gerado; nenhum dado ou objeto é alterado.", "DO $$", "DECLARE sig text; expected text; BEGIN", f"  IF current_setting('commercial_plans.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'COMMERCIAL_PLAN_REF_NOT_VERIFIED'; END IF;", "  IF to_regclass('public.commercial_payment_plans') IS NULL OR to_regclass('platform_private.b2b_condition_versions') IS NULL THEN RAISE EXCEPTION 'COMMERCIAL_PLAN_BASE_MISSING'; END IF;", "  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='commercial_payment_plans' AND column_name='organization_id') THEN RAISE EXCEPTION 'COMMERCIAL_PLAN_ALREADY_INSTALLED'; END IF;", "  IF (SELECT md5(string_agg(column_name||':'||data_type,',' ORDER BY ordinal_position)) FROM information_schema.columns WHERE table_schema='public' AND table_name='commercial_payment_plans') IS DISTINCT FROM 'fa11d3b5c4d1737c9a5e98cdece94c55' THEN RAISE EXCEPTION 'COMMERCIAL_PLAN_COLUMNS_DRIFT'; END IF;", "  IF (SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='commercial_payment_plans' AND indexname='uq_cpp_single_default') IS DISTINCT FROM 'CREATE UNIQUE INDEX uq_cpp_single_default ON public.commercial_payment_plans USING btree ((true)) WHERE is_default' THEN RAISE EXCEPTION 'COMMERCIAL_PLAN_DEFAULT_INDEX_DRIFT'; END IF;"]
    for signature, expected in sorted(PINS["functions"].items()):
        qualified = signature if "." in signature.split("(", 1)[0] else "public." + signature
        lines.append(f"  IF to_regprocedure('{qualified}') IS NULL OR md5(pg_get_functiondef('{qualified}'::regprocedure)) IS DISTINCT FROM '{expected}' THEN RAISE EXCEPTION 'COMMERCIAL_PLAN_PIN_DRIFT: {qualified}'; END IF;")
    lines += ["END $$;", "WITH evidence AS (SELECT COALESCE(p.root_plan_id,p.id) AS family_id,pr.organization_id FROM public.commercial_payment_plans p JOIN public.profiles pr ON pr.user_id=p.created_by WHERE pr.organization_id IS NOT NULL UNION SELECT COALESCE(p.root_plan_id,p.id),pa.commercial_owner_organization_id FROM public.commercial_payment_plans p JOIN public.commercial_payment_plan_assignments a ON a.plan_id=p.id JOIN public.partner_accounts pa ON pa.id=a.partner_id WHERE pa.commercial_owner_organization_id IS NOT NULL UNION SELECT COALESCE(p.root_plan_id,p.id),c.organization_id FROM public.commercial_payment_plans p JOIN public.commercial_payment_plan_assignments a ON a.plan_id=p.id JOIN public.clientes c ON c.id=a.customer_id WHERE c.organization_id IS NOT NULL UNION SELECT COALESCE(p.root_plan_id,p.id),v.organization_id FROM public.commercial_payment_plans p JOIN platform_private.b2b_condition_versions v ON v.plan_id=p.id), families AS (SELECT COALESCE(root_plan_id,id) AS family_id FROM public.commercial_payment_plans), candidates AS (SELECT f.family_id,count(DISTINCT e.organization_id) n FROM families f LEFT JOIN evidence e ON e.family_id=f.family_id GROUP BY f.family_id) SELECT count(*) AS families,count(*) FILTER(WHERE n=1) AS unambiguous,count(*) FILTER(WHERE n>1) AS denied_ambiguous,count(*) FILTER(WHERE n=0) AS denied_without_evidence FROM candidates;"]
    return "\n".join(lines) + "\n"


def postflight(new_hashes: dict[str, str]) -> str:
    lines = ["-- READONLY POST: estrutura e corpos candidatos; não certifica JWT/RLS hosted.", "DO $$", "BEGIN", f"  IF current_setting('commercial_plans.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'COMMERCIAL_PLAN_REF_NOT_VERIFIED'; END IF;", "  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='commercial_payment_plans' AND column_name='organization_id') THEN RAISE EXCEPTION 'COMMERCIAL_PLAN_TENANT_COLUMN_MISSING'; END IF;", "  IF (SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='commercial_payment_plans' AND indexname='uq_cpp_single_default') IS DISTINCT FROM 'CREATE UNIQUE INDEX uq_cpp_single_default ON public.commercial_payment_plans USING btree (organization_id) NULLS NOT DISTINCT WHERE is_default' THEN RAISE EXCEPTION 'COMMERCIAL_PLAN_TENANT_DEFAULT_INDEX_MISSING'; END IF;", "  IF EXISTS(SELECT 1 FROM public.commercial_payment_plans p LEFT JOIN public.organizations o ON o.id=p.organization_id WHERE p.organization_id IS NOT NULL AND o.id IS NULL) THEN RAISE EXCEPTION 'COMMERCIAL_PLAN_ORPHAN_TENANT'; END IF;"]
    for signature, expected in sorted(new_hashes.items()):
        qualified = signature if "." in signature.split("(", 1)[0] else "public." + signature
        lines.append(f"  IF md5(pg_get_functiondef('{qualified}'::regprocedure)) IS DISTINCT FROM '{expected}' THEN RAISE EXCEPTION 'COMMERCIAL_PLAN_POST_DRIFT: {qualified}'; END IF;")
    lines += ["END $$;", "SELECT count(*) AS plans,count(organization_id) AS owned,count(*)-count(organization_id) AS denied_unresolved FROM public.commercial_payment_plans;"]
    return "\n".join(lines) + "\n"


def rollback() -> str:
    functions = [
        "public.rpc_admin_list_commercial_plans(text,text,integer,integer)","public.rpc_admin_create_commercial_plan(jsonb)","public.rpc_admin_version_commercial_plan(uuid,jsonb,text)","public.rpc_admin_update_commercial_plan_metadata(uuid,text,text,integer)","public.rpc_admin_set_commercial_plan_active(uuid,boolean,text)","public.rpc_admin_set_default_commercial_plan(uuid)","public.rpc_admin_reorder_commercial_plans(jsonb)","public.rpc_b2b_list_selectable_payment_plans()","public.rpc_cc_list_assignments(text)","public.rpc_cc_validate_matrix(uuid,text,uuid,uuid)","public.rpc_cc_simulate_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric)","public.b2b_payment_condition_config_list()","public.b2b_payment_condition_publish(uuid,text,uuid,uuid,integer,integer,numeric,integer)","public.b2b_payment_condition_retire(uuid,text,integer)","public.b2b_payment_condition_assign(uuid,uuid,text,integer,boolean)","public.b2b_list_payment_condition_options_secure(uuid,uuid)","public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)","public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)","public.convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean)","public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)"]
    return "-- DENY-ONLY: não restaura funções nem índice global vulneráveis; preserva dados, versões e cercas.\nBEGIN;\n" + "\n".join(f"REVOKE ALL ON FUNCTION {f} FROM PUBLIC,anon,authenticated;" for f in functions) + "\nALTER POLICY cpp_tenant_read ON public.commercial_payment_plans USING(false);\nALTER POLICY cppa_admin_read ON public.commercial_payment_plan_assignments USING(false);\nALTER POLICY ccip_admin_read ON public.commercial_condition_item_prices USING(false);\nALTER POLICY cpr_internal_select ON public.commercial_price_rules USING(false);\nCOMMIT;\n"


def main() -> None:
    functions = build_functions()
    new_hashes: dict[str, str] = {}
    for name, text in functions.items():
        signature = next(sig for sig in PINS["functions"] if sig.split("(", 1)[0] == name)
        new_hashes[signature] = hashlib.md5(text.encode()).hexdigest()
        assert new_hashes[signature] != PINS["functions"][signature], f"Função sem delta: {name}"
    function_sql = "\n".join(text.rstrip() + ";" for text in functions.values())
    install = "-- REVIEW ONLY; não aplicar sem autorização. Gerado de capturas LIVE completas.\nBEGIN;\nSET LOCAL lock_timeout='3s';\n" + preflight().replace("-- READONLY PRE: gerado; nenhum dado ou objeto é alterado.\n", "") + BACKFILL + HELPERS + FENCES + "\n" + function_sql + "\n" + ACL_PRESERVE + "\nCOMMIT;\n"
    (ROOT / "01-pre.sql.readonly").write_text(preflight())
    (ROOT / "02-install.sql.review").write_text(install)
    (ROOT / "03-post.sql.readonly").write_text(postflight(new_hashes))
    (ROOT / "04-rollback-deny.sql.review").write_text(rollback())
    manifest = {"project_ref": REF, "source_functions": PINS["functions"], "candidate_functions": new_hashes, "outputs": {}}
    for filename in ("01-pre.sql.readonly", "02-install.sql.review", "03-post.sql.readonly", "04-rollback-deny.sql.review"):
        manifest["outputs"][filename] = hashlib.sha256((ROOT / filename).read_bytes()).hexdigest()
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(f"OK: {len(functions)} funções candidatas; 4 artefatos gerados")


if __name__ == "__main__":
    main()

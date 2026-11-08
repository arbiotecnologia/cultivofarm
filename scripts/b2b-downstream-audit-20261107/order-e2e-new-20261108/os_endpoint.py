"""Public session caller candidate; generated only against disposable composition."""
import hashlib
import json
from pathlib import Path

RPC = 'public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)'
HELPER = 'platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)'
DEPENDENCIES = [HELPER, 'platform_private.b2b_internal_commercial_actor()',
                'platform_private.stock_motor_actor(text)',
                'platform_private.c2_external_origin_contract_valid(jsonb)']

def install(B, out):
    out = Path(out) / 'os-endpoint'; out.mkdir()
    values = ','.join("('" + s + "')" for s in DEPENDENCIES)
    captured = json.loads(B.last(f"""SELECT jsonb_agg(jsonb_build_object(
      'signature',v.sig,'md5',md5(pg_get_functiondef(p.oid)),
      'owner',pg_get_userbyid(p.proowner),'acl',coalesce(p.proacl::text,'')) ORDER BY v.sig)
      FROM (VALUES {values}) v(sig) JOIN pg_proc p ON p.oid=to_regprocedure(v.sig);"""))
    assert len(captured) == len(DEPENDENCIES)
    quote = lambda s: "'" + s.replace("'", "''") + "'"
    pre = [f"DO $$BEGIN IF to_regprocedure('{RPC}') IS NOT NULL THEN RAISE EXCEPTION 'RESALE_ENDPOINT_ALREADY_EXISTS'; END IF; END$$;"]
    for row in captured:
        pre.append(f"""DO $$DECLARE p oid:=to_regprocedure({quote(row['signature'])}); BEGIN
 IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM {quote(row['md5'])}
 OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=p) IS DISTINCT FROM {quote(row['owner'])}
 OR (SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid=p) IS DISTINCT FROM {quote(row['acl'])}
 THEN RAISE EXCEPTION 'RESALE_ENDPOINT_DEPENDENCY_DRIFT'; END IF; END$$;""")
    ddl = r"""
CREATE FUNCTION public.rpc_b2b_resale_os_create_v1(
 p_order_id uuid,p_order_item_id uuid,p_expected_updated_at timestamptz,p_request_key text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='' SET lock_timeout='3s' AS $rpc$
DECLARE actor uuid:=auth.uid(); org uuid; result jsonb;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
 THEN RAISE EXCEPTION 'B2B_RESALE_ISOLATION_DENIED' USING ERRCODE='42501'; END IF;
 IF actor IS NULL OR platform_private.b2b_internal_commercial_actor() IS NOT TRUE
 THEN RAISE EXCEPTION 'B2B_RESALE_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 org:=platform_private.stock_motor_actor('reserva');
 IF p_order_id IS NULL OR p_order_item_id IS NULL OR p_expected_updated_at IS NULL
 OR NOT isfinite(p_expected_updated_at) OR p_request_key IS NULL
 OR length(btrim(p_request_key))<8 OR length(p_request_key)>128
 THEN RAISE EXCEPTION 'B2B_RESALE_REQUEST_INVALID' USING ERRCODE='22023'; END IF;
 -- Exact helper lock order. No unowned row lock or existence oracle.
 IF NOT EXISTS(SELECT 1 FROM public.partner_orders po JOIN public.partner_accounts pa ON pa.id=po.partner_id
  WHERE po.id=p_order_id AND pa.commercial_owner_organization_id=org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL)
 THEN RAISE EXCEPTION 'B2B_RESALE_ORDER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('b2b_resale_os_request:'||p_request_key,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('b2b_resale_os_item:'||p_order_item_id::text,0));
 PERFORM 1 FROM public.partner_orders WHERE id=p_order_id FOR UPDATE;
 PERFORM 1 FROM public.partner_order_items WHERE id=p_order_item_id AND order_id=p_order_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_RESALE_ITEM_DENIED' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS DISTINCT FROM actor OR platform_private.b2b_internal_commercial_actor() IS NOT TRUE
 OR platform_private.stock_motor_actor('reserva') IS DISTINCT FROM org
 THEN RAISE EXCEPTION 'B2B_RESALE_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)
 THEN RAISE EXCEPTION 'B2B_RESALE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 -- Replays also require current approved-origin authority, not just a receipt.
 IF NOT EXISTS(SELECT 1 FROM public.partner_orders po JOIN public.partner_accounts pa ON pa.id=po.partner_id
  WHERE po.id=p_order_id AND pa.commercial_owner_organization_id=org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
  AND po.status::text IN ('aprovado','entregue') AND po.ready_for_production IS FALSE
  AND po.receivable_generated IS FALSE AND po.payment_condition_status='defined'
  AND po.financial_approval_status NOT IN ('pending','rejected')
  AND platform_private.c2_external_origin_contract_valid(po.c2_external_origin_snapshot) IS TRUE
  AND po.internal_economic_snapshot IS NOT NULL AND po.internal_origin_snapshot IS NULL)
 THEN RAISE EXCEPTION 'B2B_RESALE_ORDER_CONFLICT' USING ERRCODE='PT409'; END IF;
 -- No actor, org, price, quantity or accounting input; existing core owns CAS/receipt/INSERT.
 result:=platform_private.b2b_resale_os_create_v1(p_order_id,p_order_item_id,p_expected_updated_at,p_request_key);
 IF auth.uid() IS DISTINCT FROM actor OR platform_private.b2b_internal_commercial_actor() IS NOT TRUE
 OR platform_private.stock_motor_actor('reserva') IS DISTINCT FROM org
 THEN RAISE EXCEPTION 'B2B_RESALE_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
 IF result->>'contract' IS DISTINCT FROM 'B2B_RESALE_OS_V1' OR (result->>'ok')::boolean IS NOT TRUE
 OR result->>'order_id' IS DISTINCT FROM p_order_id::text
 OR result->>'order_item_id' IS DISTINCT FROM p_order_item_id::text OR result->>'os_id' IS NULL
 THEN RAISE EXCEPTION 'B2B_RESALE_ACK_INVALID' USING ERRCODE='PT409'; END IF;
 RETURN result;
END;$rpc$;
REVOKE ALL ON FUNCTION public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text) TO authenticated;
"""
    sql = 'BEGIN;\n' + '\n'.join(pre) + ddl + '\nCOMMIT;\n'
    (out/'01-pre.sql.readonly').write_text('BEGIN READ ONLY;\n'+'\n'.join(pre)+'\nROLLBACK;\n')
    (out/'02-install.sql.review').write_text(sql)
    B.sql(sql)
    post = B.last(f"SELECT md5(pg_get_functiondef('{RPC}'::regprocedure));")
    post_sql = f"""BEGIN READ ONLY;
DO $$BEGIN
 IF md5(pg_get_functiondef('{RPC}'::regprocedure)) IS DISTINCT FROM '{post}'
 OR NOT has_function_privilege('authenticated','{RPC}','EXECUTE')
 OR has_function_privilege('anon','{RPC}','EXECUTE') OR has_function_privilege('service_role','{RPC}','EXECUTE')
 OR has_function_privilege('authenticated','{HELPER}','EXECUTE') OR has_function_privilege('service_role','{HELPER}','EXECUTE')
 THEN RAISE EXCEPTION 'RESALE_ENDPOINT_POST_DRIFT'; END IF; END$$;
ROLLBACK;
"""
    (out/'03-post.sql.readonly').write_text(post_sql); B.sql(post_sql)
    rollback = f'BEGIN;\nREVOKE ALL ON FUNCTION {RPC} FROM PUBLIC,anon,authenticated,service_role;\nUPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false WHERE singleton;\nCOMMIT;\n'
    (out/'04-rollback-deny.sql.review').write_text(rollback)
    (out/'manifest.json').write_text(json.dumps(dict(status='INACTIVE_REVIEW_ONLY',hosted=False,
       dependencies=captured,endpoint=RPC,helper_acl_unchanged=True,post_md5=post,
       install_sha256=hashlib.sha256(sql.encode()).hexdigest(),
       acl_delta={'authenticated':'EXECUTE endpoint only','service_role':'none','helper':'unchanged deny'}),indent=2)+'\n')
    return out
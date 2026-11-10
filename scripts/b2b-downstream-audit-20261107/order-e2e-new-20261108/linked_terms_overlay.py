"""Inactive, pinned consumer delta: read linked approval without rewriting economics."""
import hashlib
import json
from pathlib import Path


def install(B, out):
    out = Path(out) / 'linked-terms-overlay'
    out.mkdir()
    signatures = [
        'platform_private.b2b_resale_os_valid_v1(public.ordens_servico)',
        'platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico)',
        'platform_private.b2b_resale_delivery_order_valid_v1(public.entregas)',
        'platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)',
        'public.rpc_b2b_resale_os_availability_v1(uuid)',
        'public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)',
    ]
    predicate = """EXISTS(SELECT 1 FROM public.partner_order_payment_terms t
      WHERE t.id={alias}.payment_terms_id AND t.partner_order_id={alias}.id
       AND {alias}.payment_condition_status IN ('defined','approved')
       AND (({alias}.requires_financial_approval IS FALSE AND {alias}.financial_approval_status NOT IN ('pending','rejected'))
        OR (t.approval_status='approved' AND t.approved_by IS NOT NULL AND t.approved_at IS NOT NULL)))"""
    rows = []
    for sig in signatures:
        row = json.loads(B.last(f"SELECT jsonb_build_object('signature','{sig}','body',pg_get_functiondef(p.oid),'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',coalesce(p.proacl::text,'')) FROM pg_proc p WHERE oid='{sig}'::regprocedure;"))
        body = row['body']
        for alias in ('po', 'v_order'):
            import re
            pattern = rf"{alias}\.payment_condition_status='defined'\s+AND {alias}\.financial_approval_status NOT IN \('pending','rejected'\)"
            body = re.sub(pattern, predicate.format(alias=alias), body)
        old = "v_order.payment_condition_status IS DISTINCT FROM 'defined'\n  OR v_order.financial_approval_status IN ('pending','rejected')"
        body = body.replace(old, 'NOT (' + predicate.format(alias='v_order') + ')')
        assert body != row['body'], sig
        row['candidate'] = body
        row['post_md5'] = hashlib.md5(body.encode()).hexdigest()
        rows.append(row)
    def pins(post=False):
        return '\n'.join(f"""DO $$DECLARE p oid:=to_regprocedure('{r['signature']}');BEGIN
 IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM '{r['post_md5'] if post else r['md5']}'
 OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=p) IS DISTINCT FROM '{r['owner']}'
 OR (SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid=p) IS DISTINCT FROM '{r['acl']}'
 THEN RAISE EXCEPTION 'LINKED_TERMS_CONSUMER_DRIFT';END IF;END$$;""" for r in rows)
    pre, post = pins(), pins(True)
    install_sql = 'BEGIN;\n' + pre + '\n' + ';\n'.join(r['candidate'] for r in rows) + ';\n' + post + '\nCOMMIT;'
    rollback = "BEGIN;\n" + post + "\nUPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false WHERE singleton;\nREVOKE ALL ON FUNCTION public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;\nCOMMIT;"
    for name, text in [('01-pre.sql.readonly','BEGIN READ ONLY;\n'+pre+'\nROLLBACK;'),('02-install.sql.review',install_sql),('03-post.sql.readonly','BEGIN READ ONLY;\n'+post+'\nROLLBACK;'),('04-rollback-deny.sql.review',rollback)]:
        (out/name).write_text(text+'\n')
    (out/'manifest.json').write_text(json.dumps(dict(status='REVIEW_ONLY_INACTIVE_NOT_APPROVED',hosted=False,rows=rows,acl_unchanged=True),indent=2)+'\n')
    B.sql(install_sql)
    return out
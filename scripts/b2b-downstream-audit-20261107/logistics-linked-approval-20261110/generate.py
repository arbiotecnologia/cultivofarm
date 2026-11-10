"""Gera o delta mínimo: troca SOMENTE o predicado financeiro legado (cabeçalho congelado) dos 6 consumidores
da logística de revenda pela fonte canônica (aprovação comercial + termos vinculados do mesmo pedido).
Fonte: corpos LIVE congelados dos artefatos instalados (61 pilot, 71 rowtype) com md5 LIVE. Nunca editar 02/04 à mão."""
import hashlib, json, re
from pathlib import Path
H = Path(__file__).resolve().parent
R = H.parent / "order-e2e-new-20261108"
SRC = {
 "platform_private.b2b_resale_os_valid_v1(public.ordens_servico)": ("production-rollout-posplans-20261108/61-pilot-containment-install.sql.review", "platform_private.b2b_resale_os_valid_v1(", "804e2a33cdf204ed9fa179f2afa2bf6e", 1),
 "platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico)": ("production-rollout-posplans-20261108/61-pilot-containment-install.sql.review", "platform_private.b2b_resale_os_operational_valid_v1(", "7cd8ee22794bf57e6592867259c9397e", 1),
 "platform_private.b2b_resale_delivery_order_valid_v1(public.entregas)": ("production-rollout-posplans-20261108/61-pilot-containment-install.sql.review", "platform_private.b2b_resale_delivery_order_valid_v1(", "bd76345c3bceaa5e6203013920427df4", 1),
 "platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)": ("production-rollout-posplans-20261108/61-pilot-containment-install.sql.review", "platform_private.b2b_resale_os_create_v1(", "c5b1da90e1f649fe0eeb99deac7094ee", 2),
 "public.rpc_b2b_resale_os_availability_v1(uuid)": ("production-rollout-posplans-20261108-reader-rowtype-overlay/71-reader-rowtype-install.sql.review", "public.rpc_b2b_resale_os_availability_v1(", "e9767fcbcbfb831b92ee7f1523b1262e", 1),
 "public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)": ("production-rollout-posplans-20261108/61-pilot-containment-install.sql.review", "public.rpc_b2b_resale_os_create_v1(", "6a249b41a6e729835ff86cfc2b40e25b", 1),
}
CANON = """({a}.approved_by IS NOT NULL AND {a}.approved_at IS NOT NULL
    AND {a}.payment_condition_status IN ('defined','approved') AND {a}.financial_approval_status IS DISTINCT FROM 'rejected'
    AND (({a}.credit_approved_at IS NULL) = ({a}.credit_approved_by IS NULL))
    AND (({a}.requires_financial_approval IS FALSE AND {a}.financial_approval_status NOT IN ('pending','rejected'))
     OR EXISTS(SELECT 1 FROM public.partner_order_payment_terms t
       WHERE t.id={a}.payment_terms_id AND t.partner_order_id={a}.id
        AND t.approval_status='approved' AND t.approved_by IS NOT NULL AND t.approved_at IS NOT NULL)))"""
FENCES = ('B2B_RESALE_SCOPE_CHANGED','B2B_RESALE_GATE_CLOSED','RESALE_PILOT_SCOPE_DENIED','p_expected_updated_at','FOR UPDATE','FOR SHARE','resale_pilot_scope_v1','auth.uid()')

def extract(path, head):
    lines = (R / path).read_text().splitlines(keepends=True)
    st = [i for i, l in enumerate(lines) if l.startswith("CREATE OR REPLACE FUNCTION " + head)]
    assert len(st) == 1, (path, head, len(st))
    en = next(i for i in range(st[0], len(lines)) if lines[i].startswith("$function$"))
    return "".join(lines[st[0]:en]) + "$function$"

def build():
    rows = []
    for sig, (path, head, live_md5, expected) in SRC.items():
        live = extract(path, head)
        # md5 LIVE é de pg_get_functiondef; conferido no espelho após instalar o artefato verbatim (mirror_flow.py).
        body, n = live, 0
        for a in ("po", "v_order"):
            body, c = re.subn(rf"{a}\.payment_condition_status='defined'\s+AND {a}\.financial_approval_status NOT IN \('pending','rejected'\)", CANON.format(a=a).replace("\\", "\\\\"), body); n += c
        old = "v_order.payment_condition_status IS DISTINCT FROM 'defined'\n  OR v_order.financial_approval_status IN ('pending','rejected')"
        n += body.count(old); body = body.replace(old, "NOT " + CANON.format(a="v_order"))
        assert n == expected, (sig, n)
        assert all(body.count(f) == live.count(f) for f in FENCES), sig
        assert "financial_approval_status NOT IN ('pending','rejected'))\n     OR EXISTS" in body
        rows.append(dict(signature=sig, source=path, live_md5=live_md5, live=live, candidate=body, replaced=n))
    return rows

def pins(rows, key):
    out = []
    for r in rows:
        exp = r[key] if key == "live_md5" else ":" + r["signature"].split("(")[0] + ":"
        out.append(f"""DO $$DECLARE p oid:=to_regprocedure('{r['signature']}');BEGIN
 IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM '{exp}' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=p)<>'postgres'
 THEN RAISE EXCEPTION 'LINKED_APPROVAL_CONSUMER_DRIFT %','{r['signature']}';END IF;END$$;""")
    return "\n".join(out)

ACL = """DO $$DECLARE r record;BEGIN FOR r IN SELECT * FROM (VALUES {vals}) v(s,a) LOOP
 IF (SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid=to_regprocedure(r.s)) IS DISTINCT FROM r.a THEN RAISE EXCEPTION 'LINKED_APPROVAL_ACL_DRIFT %',r.s;END IF;END LOOP;END$$;"""

def main():
    rows = build()
    acl = json.loads((H / "acl-live.json").read_text())  # medido no espelho alinhado ao LIVE; auditor confere no PRE hospedado
    acl_sql = ACL.format(vals=",".join(f"('{s}','{a}')" for s, a in acl.items()))
    pre = "BEGIN READ ONLY;\n" + pins(rows, "live_md5") + "\n" + acl_sql + "\nSELECT 'PRE_PASS';\nROLLBACK;\n"
    install = "BEGIN;\n" + pins(rows, "live_md5") + "\n" + acl_sql + "\n" + ";\n".join(r["candidate"] for r in rows) + ";\n" + acl_sql + "\nCOMMIT;\n"
    post = "BEGIN READ ONLY;\n" + pins(rows, "candidate") + "\n" + acl_sql + "\nSELECT 'POST_PASS';\nROLLBACK;\n"
    rollback = "BEGIN;\n" + ";\n".join(r["live"] for r in rows) + ";\n" + acl_sql + "\n" + pins(rows, "live_md5") + "\nCOMMIT;\n"
    for n, t in [("01-pre.sql.readonly", pre), ("02-install.sql.review", install), ("03-post.sql.readonly", post), ("04-rollback-restore-legacy-strict.sql.review", rollback)]:
        (H / n).write_text(t)
    (H / "manifest.json").write_text(json.dumps({"status": "REVIEW_ONLY_INACTIVE_NOT_APPROVED", "hosted": False, "rows": [{k: r[k] for k in ("signature", "source", "live_md5", "replaced")} | {"candidate_sha256": hashlib.sha256(r["candidate"].encode()).hexdigest()} for r in rows]}, indent=1) + "\n")
    return rows

if __name__ == "__main__":
    for r in main(): print(r["signature"], r["replaced"])

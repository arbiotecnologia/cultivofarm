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
    AND EXISTS(SELECT 1 FROM public.partner_order_payment_terms t
       WHERE t.id={a}.payment_terms_id AND t.partner_order_id={a}.id
        AND ((t.approval_status='approved' AND t.approved_by IS NOT NULL AND t.approved_at IS NOT NULL)
          OR ({a}.requires_financial_approval IS FALSE AND {a}.financial_approval_status NOT IN ('pending','rejected')
              AND t.approval_status='not_required'))))"""
# Fixados da revisão pós-234 (dispensa respeita termos rejeitados; medidos no espelho): md5(pg_get_functiondef) medido após instalar o candidato.
CANDIDATE_MD5 = {
 "platform_private.b2b_resale_os_valid_v1(public.ordens_servico)": "b37a9d5555f82fb4c5bf922d5cc8bc3f",
 "platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico)": "5900213e18ecdf01c5d0cf53bcb91892",
 "platform_private.b2b_resale_delivery_order_valid_v1(public.entregas)": "8c2cc49c13c18a172c882f6d58c3529f",
 "platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)": "7ed7bfeb8fea7e912d8aa051cfd773ec",
 "public.rpc_b2b_resale_os_availability_v1(uuid)": "eb1809572a26bcfad39e2e080c3c06e2",
 "public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)": "61c35d679563f96b9dc2a8af7e6d3d95"
}
# ACL fixada (medida no espelho alinhado; PRE hospedado somente leitura deu PRE_PASS com ela).
ACL_PINNED = {
 "platform_private.b2b_resale_os_valid_v1(public.ordens_servico)": "{postgres=X/postgres}",
 "platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico)": "{postgres=X/postgres}",
 "platform_private.b2b_resale_delivery_order_valid_v1(public.entregas)": "{postgres=X/postgres}",
 "platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)": "{postgres=X/postgres}",
 "public.rpc_b2b_resale_os_availability_v1(uuid)": "{postgres=X/postgres,authenticated=X/postgres}",
 "public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)": "{postgres=X/postgres,authenticated=X/postgres}",
}
FILES = ("01-pre.sql.readonly", "02-install.sql.review", "03-post.sql.readonly", "04-rollback-restore-legacy-strict.sql.review")
FENCES = ('B2B_RESALE_SCOPE_CHANGED','B2B_RESALE_GATE_CLOSED','RESALE_PILOT_SCOPE_DENIED','p_expected_updated_at','FOR UPDATE','FOR SHARE','resale_pilot_scope_v1','auth.uid()')

def extract(path, head):
    lines = (R / path).read_text().splitlines(keepends=True)
    st = [i for i, l in enumerate(lines) if l.startswith("CREATE OR REPLACE FUNCTION " + head)]
    assert len(st) == 1, (path, head, len(st))
    a = next(i for i in range(st[0], len(lines)) if lines[i].rstrip("\n").endswith("AS $function$"))
    en = next(i for i in range(a + 1, len(lines)) if "$function$" in lines[i])
    last = lines[en][:lines[en].index("$function$")] + "$function$"
    return "".join(lines[st[0]:en]) + last

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
        assert "AND t.approval_status='not_required'))))" in body and "OR EXISTS(SELECT 1 FROM public.partner_order_payment_terms" not in body
        rows.append(dict(signature=sig, source=path, live_md5=live_md5, live=live, candidate=body, replaced=n))
    return rows

def pins(rows, key):
    out = []
    for r in rows:
        exp = r["live_md5"] if key == "live_md5" else CANDIDATE_MD5[r["signature"]]
        out.append(f"""DO $$DECLARE p oid:=to_regprocedure('{r['signature']}');BEGIN
 IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM '{exp}' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=p)<>'postgres'
 THEN RAISE EXCEPTION 'LINKED_APPROVAL_CONSUMER_DRIFT %','{r['signature']}';END IF;END$$;""")
    return "\n".join(out)

ACL = """DO $$DECLARE r record;BEGIN FOR r IN SELECT * FROM (VALUES {vals}) v(s,a) LOOP
 IF (SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid=to_regprocedure(r.s)) IS DISTINCT FROM r.a THEN RAISE EXCEPTION 'LINKED_APPROVAL_ACL_DRIFT %',r.s;END IF;END LOOP;END$$;"""

def render():
    rows = build()
    assert set(CANDIDATE_MD5) == set(SRC) == set(ACL_PINNED)
    acl = ACL_PINNED
    acl_sql = ACL.format(vals=",".join(f"('{s}','{a}')" for s, a in acl.items()))
    pre = "BEGIN READ ONLY;\n" + pins(rows, "live_md5") + "\n" + acl_sql + "\nSELECT 'PRE_PASS';\nROLLBACK;\n"
    install = "BEGIN;\n" + pins(rows, "live_md5") + "\n" + acl_sql + "\n" + ";\n".join(r["candidate"] for r in rows) + ";\n" + acl_sql + "\n" + pins(rows, "candidate") + "\nCOMMIT;\n"
    post = "BEGIN READ ONLY;\n" + pins(rows, "candidate") + "\n" + acl_sql + "\nSELECT 'POST_PASS';\nROLLBACK;\n"
    rollback = "BEGIN;\n" + ";\n".join(r["live"] for r in rows) + ";\n" + acl_sql + "\n" + pins(rows, "live_md5") + "\nCOMMIT;\n"
    texts = dict(zip(FILES, (pre, install, post, rollback)))
    for t in texts.values():
        assert not re.search(r"'(:[a-z_.]+:)'", t) and "{" + "a}" not in t, "placeholder left"
    return rows, texts

def verify_on_disk():
    """Fontes finais == gerador: bytes no disco idênticos ao render(); devolve sha256 por arquivo."""
    rows, texts = render()
    for n, t in texts.items():
        assert (H / n).read_bytes() == t.encode(), ("FINAL_FILE_DIVERGES_FROM_GENERATOR", n)
    return rows, {n: hashlib.sha256(t.encode()).hexdigest() for n, t in texts.items()}

def main():
    rows, texts = render()
    for n, t in texts.items():
        (H / n).write_text(t)
    (H / "acl-live.json").write_text(json.dumps(ACL_PINNED, indent=1) + "\n")
    (H / "manifest.json").write_text(json.dumps({"status": "REVIEW_ONLY_INACTIVE_NOT_APPROVED", "hosted": False, "files_sha256": {n: hashlib.sha256(t.encode()).hexdigest() for n, t in texts.items()}, "rows": [{k: r[k] for k in ("signature", "source", "live_md5", "replaced")} | {"candidate_sha256": hashlib.sha256(r["candidate"].encode()).hexdigest(), "candidate_md5_pinned": CANDIDATE_MD5[r["signature"]], "acl_pinned": ACL_PINNED[r["signature"]]} for r in rows]}, indent=1) + "\n")
    return rows

if __name__ == "__main__":
    for r in main(): print(r["signature"], r["replaced"])

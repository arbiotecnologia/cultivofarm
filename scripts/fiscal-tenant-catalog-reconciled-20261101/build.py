"""Gera install.sql.review a partir do template + capturas READ ONLY (anexo materializado).
Determinístico; nunca conecta a banco. Pins vêm da captura hosted, não do harness."""
import hashlib, json, pathlib, sys
H = pathlib.Path(__file__).resolve().parent
ROOT = H.parents[1]
EV = ROOT / "docs/auditorias/evidencias/reconciliacao-fiscal-catalogo-20261101/original-80c64c38"
LIVE = json.loads((EV / "live_readonly_audit.json").read_text())[0]["audit"]
FISC = json.loads((EV / "live_fiscal_details.json").read_text())[0]["audit"]
TABLE = "product_fiscal_profiles"
PINNED_FUNCS = [
    "platform_private.global_product_fiscal_before_write()",
    "platform_private.global_product_fiscal_statement_gate()",
    "platform_private.global_product_fiscal_write_ready()",
    "platform_private.global_product_fiscal_read_ready()",
    "platform_private.platform_actor_access_ready(uuid)",
    "platform_private.h15_actor_organization()",
    "fiscal_audit_trigger()",
]


def q(s): return "'" + s.replace("'", "''") + "'"
def md5(s): return hashlib.md5(s.encode()).hexdigest()


def fn(sig):
    for f in LIVE["functions"] + FISC["functions"]:
        if f["signature"] == sig:
            return f
    raise SystemExit(f"capture missing {sig}")


def regproc(sig):
    return sig if sig.startswith("platform_private.") else "public." + sig


def policy_line(p):
    return "|".join([p["policyname"], p["cmd"], p["permissive"], ",".join(p["roles"]),
                     p["qual"] or "~", p["with_check"] or "~"])


def policies():
    return sorted(policy_line(p) for p in LIVE["policies"] if p["tablename"] == TABLE)


def triggers():
    return sorted(t["definition"] for t in LIVE["triggers"] if t["table"] == TABLE)


def grants():
    return sorted({f'{g["grantee"]}:{g["privilege_type"]}' for g in LIVE["grants"]
                   if g["table_name"] == TABLE and g["grantee"] in ("anon", "authenticated", "service_role")})


def default_acl():
    for d in FISC["default_acl"]:
        if d["owner"] == "postgres" and d["schema"] == "public" and d["type"] == "f":
            return sorted(d["acl"])
    raise SystemExit("default acl missing")


def constraints():
    return sorted(FISC["constraints"])


def pins():
    out = ["DO $pins$ BEGIN"]
    for sig in PINNED_FUNCS:
        f = fn(sig)
        out.append(f"  IF md5(pg_get_functiondef({q(regproc(sig))}::regprocedure)) <> {q(md5(f['definition']))} THEN"
                   f" RAISE EXCEPTION 'PRE: body drift {sig}'; END IF;")
        acl = ",".join(q(a) for a in sorted(f["acl"]))
        out.append(f"  IF (SELECT array_agg(a::text ORDER BY a::text) FROM pg_proc p, unnest(p.proacl) a WHERE p.oid={q(regproc(sig))}::regprocedure)"
                   f" IS DISTINCT FROM ARRAY[{acl}]::text[] THEN RAISE EXCEPTION 'PRE: ACL drift {sig}'; END IF;")
    pol = "\n".join(policies())
    out.append("  IF (SELECT md5(string_agg(policyname||'|'||cmd||'|'||permissive||'|'||array_to_string(roles,',')||'|'||"
               "coalesce(qual,'~')||'|'||coalesce(with_check,'~'), E'\\n' ORDER BY policyname||'|'||cmd||'|'||permissive||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'~')||'|'||coalesce(with_check,'~') COLLATE \"C\"))"
               f" FROM pg_policies WHERE schemaname='public' AND tablename='{TABLE}') <> {q(md5(pol))}"
               " THEN RAISE EXCEPTION 'PRE: policy definition drift (same count is not enough)'; END IF;")
    trg = "\n".join(triggers())
    out.append(f"  IF (SELECT md5(string_agg(pg_get_triggerdef(oid), E'\\n' ORDER BY pg_get_triggerdef(oid) COLLATE \"C\")) FROM pg_trigger"
               f" WHERE tgrelid='public.{TABLE}'::regclass AND NOT tgisinternal) <> {q(md5(trg))}"
               " THEN RAISE EXCEPTION 'PRE: trigger drift'; END IF;")
    # Capture lacks tgenabled; enabled-origin is an explicit assumption re-pinned at hosted recapture.
    out.append(f"  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.{TABLE}'::regclass AND NOT tgisinternal AND tgenabled<>'O')"
               " THEN RAISE EXCEPTION 'PRE: trigger disabled/replica-only'; END IF;")
    gr = "\n".join(grants())
    out.append("  IF (SELECT md5(string_agg(grantee||':'||privilege_type, E'\\n' ORDER BY grantee||':'||privilege_type COLLATE \"C\")) FROM"
               f" (SELECT DISTINCT grantee::text, privilege_type::text FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='{TABLE}'"
               f" AND grantee IN ('anon','authenticated','service_role')) g) <> {q(md5(gr))} THEN RAISE EXCEPTION 'PRE: table grant drift'; END IF;")
    da = ",".join(q(a) for a in default_acl())
    out.append("  IF (SELECT array_agg(a::text ORDER BY a::text) FROM pg_default_acl d, unnest(d.defaclacl) a WHERE d.defaclrole='postgres'::regrole"
               f" AND d.defaclnamespace='public'::regnamespace AND d.defaclobjtype='f') IS DISTINCT FROM ARRAY[{da}]::text[]"
               " THEN RAISE EXCEPTION 'PRE: default ACL drift'; END IF;")
    cons = "\n".join(constraints())
    out.append(f"  IF (SELECT md5(string_agg(pg_get_constraintdef(oid), E'\\n' ORDER BY pg_get_constraintdef(oid) COLLATE \"C\")) FROM pg_constraint"
               f" WHERE conrelid='public.{TABLE}'::regclass AND contype<>'n') <> {q(md5(cons))} THEN RAISE EXCEPTION 'PRE: constraint drift'; END IF;")
    out.append(f"  IF NOT (SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid='public.{TABLE}'::regclass)"
               " THEN RAISE EXCEPTION 'PRE: RLS flag drift'; END IF;")
    out.append("END $pins$;")
    return "\n".join(out)


def build():
    t = (H / "install.template.sql").read_text()
    a10acl = ",".join(q(a) for a in sorted(fn("platform_private.global_product_fiscal_before_write()")["acl"]))
    s = t.replace("-- @@PINS@@", pins()).replace("@@A10_ACL@@", a10acl)
    (H / "install.sql.review").write_text(s)
    meta = dict(policies=policies(), triggers=triggers(), grants=grants(), default_acl=default_acl(),
                constraints=constraints(), functions={s: md5(fn(s)["definition"]) for s in PINNED_FUNCS})
    (H / "pre-pins.json").write_text(json.dumps(meta, indent=1, sort_keys=True))
    return s


if __name__ == "__main__":
    build()
    print(hashlib.sha256((H / "install.sql.review").read_bytes()).hexdigest())

"""Candidate (REVIEW ONLY, never hosted): seller-owner visibility in respond_b2b_order_quote_secure.

Diagnosis (LIVE bodies, auditor capture 09/11): respond -> public.b2b_phase1_order_visible -> platform_private.b2b_phase1_order_visible
-> platform_private.b2b_phase1_partner_visible. For an internal user without an external role it returns
b2b_actor_scope(u).org_partner = partner; org_partner is the actor's own organization.partner_account_id (or a valid partner link).
The seller admin of the owner organization has neither, so the visibility gate denies the authorized seller after
c2_external_origin_assert / b2b_internal_assert_origin already proved owner authority -> functional defect, not drift.

Delta: only inside respond, the 3 occurrences of `public.b2b_phase1_order_visible(p_order_id)` become
`(public.b2b_phase1_order_visible(p_order_id) OR platform_private.b2b_owner_internal_partner_readable(<order partner>))`.
The global visibility functions are untouched; b2b_owner_internal_partner_readable (LIVE fa72ca18…) admits only internal
administrador/gestor_comercial/financeiro of the active owner org (h15), with no external role and no active partner link;
the existing has_role(administrador|gestor_comercial) check still follows, so financeiro stays denied.
"""
import hashlib, pathlib, re

SIG = "public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)"
LIVE_MD5 = "4926a99c3fa3086b34ff25bb4b4038bb"   # auditor read 09/11 (live-capture-verified-20261109.json)
OLD = "public.b2b_phase1_order_visible(p_order_id)"
NEW = ("(public.b2b_phase1_order_visible(p_order_id) OR platform_private.b2b_owner_internal_partner_readable("
       "(SELECT po_v.partner_id FROM public.partner_orders po_v WHERE po_v.id=p_order_id)))")
DEP_PINS = {"platform_private.b2b_owner_internal_partner_readable(uuid)": "fa72ca18fc673cb4a5ff4867e65137cd",
            "public.b2b_phase1_order_visible(uuid)": None,  # filled from live-exact-7 capture
            "platform_private.b2b_phase1_partner_visible(uuid,boolean)": "915f516e605af7cc14584e2e762a2661"}


def _meta_sql(sig, md5, acl, tag):
    return (f"DO $c$DECLARE p oid:=to_regprocedure('{sig}');BEGIN IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM '{md5}'"
            f" OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=p) IS DISTINCT FROM 'postgres'"
            + (f" OR (SELECT array(SELECT x::text FROM unnest(proacl) x ORDER BY 1) FROM pg_proc WHERE oid=p) IS DISTINCT FROM (SELECT array(SELECT x FROM unnest('{acl}'::text[]) x ORDER BY 1))" if acl is not None else "")
            + f" THEN RAISE EXCEPTION '{tag} {sig}';END IF;END$c$;")


def build(psql, out_dir, order_visible_md5):
    """Generate PRE/INSTALL/POST/ROLLBACK from the mirror body whose md5 equals the LIVE pin. Returns dict or raises."""
    body = psql(f"SELECT pg_get_functiondef('{SIG}'::regprocedure)").stdout.rstrip("\n") + "\n"
    if hashlib.md5(body.encode()).hexdigest() != LIVE_MD5:
        raise SystemExit("RESPOND_FIX_BASE_NOT_LIVE")
    if body.count(OLD) != 3:
        raise SystemExit("RESPOND_FIX_PATTERN_COUNT %d" % body.count(OLD))
    acl = psql(f"SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid='{SIG}'::regprocedure").stdout.strip()
    new_body = body.replace(OLD, NEW)
    pins = dict(DEP_PINS); pins["public.b2b_phase1_order_visible(uuid)"] = order_visible_md5
    deps = "\n".join(_meta_sql(k, v, None, "RESPOND_FIX_DEP_DRIFT") for k, v in pins.items())
    pre = ("-- READ ONLY. Abort unless the hosted body/owner/ACL equal the reviewed LIVE pins (ACL pinned from mirror: auditor must confirm).\n"
           "BEGIN READ ONLY;\nDO $r$BEGIN IF current_setting('app.reviewed_ref',true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE NOTICE 'RESPOND_FIX_REF_NOT_ASSERTED (mirror)';END IF;END$r$;\n"
           + _meta_sql(SIG, LIVE_MD5, acl, "RESPOND_FIX_PRE_DRIFT") + "\n" + deps + "\nDO $o$BEGIN RAISE NOTICE 'RESPOND_FIX_PRE_OK';END$o$;\nROLLBACK;\n")
    return {"body": body, "new_body": new_body, "acl": acl, "pre": pre, "deps": deps}


def finish(psql, built, out_dir):
    """Install in the mirror, derive the POST pin from the installed body, write the package files."""
    install = ("BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='60s';\n" + _meta_sql(SIG, LIVE_MD5, built["acl"], "RESPOND_FIX_PRE_DRIFT") + "\n"
               + built["deps"] + "\n" + built["new_body"].rstrip("\n") + ";\nCOMMIT;\n")
    r = psql(install)
    new_md5 = psql(f"SELECT md5(pg_get_functiondef('{SIG}'::regprocedure))").stdout.strip()
    post = ("BEGIN READ ONLY;\n" + _meta_sql(SIG, new_md5, built["acl"], "RESPOND_FIX_POST_DRIFT") + "\n"
            "DO $o$BEGIN RAISE NOTICE 'RESPOND_FIX_POST_OK';END$o$;\nROLLBACK;\n")
    rollback = ("BEGIN;\nSET LOCAL lock_timeout='5s';\n" + _meta_sql(SIG, new_md5, built["acl"], "RESPOND_FIX_ROLLBACK_DRIFT") + "\n"
                + built["body"].rstrip("\n") + ";\n" + _meta_sql(SIG, LIVE_MD5, built["acl"], "RESPOND_FIX_ROLLBACK_NOT_RESTORED") + "\nCOMMIT;\n")
    d = pathlib.Path(out_dir) / "seller-respond-fix"; d.mkdir(exist_ok=True)
    files = {"90-respond-fix-pre.sql.readonly": built["pre"], "91-respond-fix-install.sql.review": install,
             "92-respond-fix-post.sql.readonly": post, "97-respond-fix-rollback.sql.review": rollback,
             "respond.live-4926a99c.sql": built["body"], "respond.candidate.sql": built["new_body"]}
    for k, v in files.items():
        (d / k).write_text(v)
    import difflib
    (d / "respond.diff").write_text("".join(difflib.unified_diff(built["body"].splitlines(True), built["new_body"].splitlines(True), "respond.live-4926a99c.sql", "respond.candidate.sql")))
    sha = {k: hashlib.sha256((d / k).read_bytes()).hexdigest() for k in sorted(files) + ["respond.diff"]}
    return {"install_rc": r.returncode, "install_err": (r.stderr or "")[-500:], "new_md5": new_md5, "acl": built["acl"], "sha256": sha,
            "post": post, "rollback": rollback}

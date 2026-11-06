#!/usr/bin/env python3
"""PG descartável — upgrade V2 a partir do estado instalado (9c99095). Reaproveita o harness do pacote
(corpos LIVE reais, mesmas costuras declaradas). Não é prova JWT/RLS hospedada."""
import importlib.util, json, pathlib, runpy, sys
HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("h", HERE.parent / "test-local-pg.py"); h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
g = runpy.run_path(str(HERE / "generate.py"), run_name="lib")
md = lambda sig: h.psql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))").stdout.strip()

def main():
    tmp = h.boot()
    try:
        r = h.runfile(HERE / "captured" / "v1-02-install.sql.review.applied"); h.check("estado instalado (02 do 9c99095) reproduzido", r.returncode == 0, r.stderr[-300:])
        h.check("helper local == helper LIVE ca57c161", md(g["SIG"]) == g["V1_MD5"], md(g["SIG"]))
        h.check("motor local == motor LIVE 6bc0e12a", md(g["CRP_SIG"]) == g["CRP_LIVE_MD5"])
        h.ok_amounts("instalado: comprador misto 21/2.10/18.90 (aprovado pelo auditor)", h.sim(h.UB, h.P, [h.PACK_LINE, h.LIQ_LINE]), 21, 2.1, 18.9)
        H = "SELECT platform_private.b2b_partner_cart_volume_price('%s','%s',NULL,'hectare',NULL);" % (h.P, h.LIQ)
        r = h.as_user(h.UB, H, "postgres"); h.check("instalado: v1 libera hectare ao comprador (motivo do upgrade)", r.returncode == 0, r.stderr)
        for n, ok in (("01-pre.sql.readonly", "PRE_OK"), ("02-upgrade.sql.review", None), ("03-post.sql.readonly", "POST_OK")):
            r = h.runfile(HERE / n); h.check(f"{n}", r.returncode == 0 and (ok is None or ok in r.stderr), r.stderr[-300:])
        r = h.runfile(HERE / "02-upgrade.sql.review"); h.check("rerun do upgrade recusado", r.returncode != 0, r.stderr[-150:])
        r = h.runfile(HERE.parent / "02-install.sql.review"); h.check("02 original recusado sobre estado instalado", r.returncode != 0, r.stderr[-150:])
        h.matrix("post")
        r = h.runfile(HERE / "04-rollback-to-v1.sql.review"); h.check("04 rollback para v1", r.returncode == 0, r.stderr[-300:])
        h.check("rollback: helper volta a ca57c161", md(g["SIG"]) == g["V1_MD5"])
        h.ok_amounts("rollback: comprador misto continua 18.90", h.sim(h.UB, h.P, [h.PACK_LINE, h.LIQ_LINE]), 21, 2.1, 18.9)
    finally:
        h.stop(tmp)
    fails = [c for c in h.checks if not c["ok"]]
    (HERE / "evidence-local-pg.json").write_text(json.dumps({"package": "B2B_CART_CATALOG_FENCE_V2_UPGRADE", "hosted_proof": False,
        "passed": len(h.checks) - len(fails), "total": len(h.checks), "checks": h.checks}, indent=2, ensure_ascii=False) + "\n")
    print(f"{'PASS' if not fails else 'FAIL'} {len(h.checks) - len(fails)}/{len(h.checks)}"); return 1 if fails else 0

sys.exit(main())

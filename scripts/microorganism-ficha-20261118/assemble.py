#!/usr/bin/env python3
"""Offline, fail-closed installer assembly from a reviewed per-environment capture.
Does not connect or apply SQL. Root reviews generated install/pre/post/release/rollback.
No automatic repinning/transplanting of divergent dependency bodies.
"""
import hashlib
import json
from pathlib import Path
import sys

def write_lf(path, text):
    path.write_text(text, encoding="utf-8", newline="\n")

H = Path(__file__).resolve().parent
capture = json.loads(Path(sys.argv[1]).read_text())
ref = capture.get("ref")
if ref not in ("swzpzcwiasxmjutrmvkm", "vrlcdwmlytukrjezrrnf"):
    raise SystemExit("REF_DENIED")
catalog = capture["catalog"]
functions = catalog.get("functions") or []
pins = {f["signature"]: f["md5"] for f in functions}
required = {
    "platform_private.catalog_tenant_actor(text)": "5e0ce9cc9122f1c21d76e29a13de8b59",
    "tenant_catalog_root_save(text,uuid,jsonb,timestamp with time zone,uuid)": "7db253bcc2150276ea2bb2f7bd90e471",
    "platform_private.tenant_catalog_receipt(uuid,uuid,text)": "e0215d187cf055064e05c76a13dd55d4",
}
for signature, pin in required.items():
    if pins.get(signature) != pin:
        raise SystemExit(f"DEPENDENCY_BLOCKED: {signature}; review foundation delta, never repin")
if any("[REDACTED]" in f.get("definition", "") for f in functions):
    raise SystemExit("CAPTURE_REDACTED: recapture definitions locally")
if {c["root"] for c in catalog.get("config") or []} != {"microrganismos", "microorganism_technical_profiles"}:
    raise SystemExit("ROOT_CONFIG_BLOCKED")
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
post = json.loads((H / "evidence/local-post-function-pins.json").read_text())
checks = "\n".join(f"IF md5(pg_get_functiondef(to_regprocedure('{signature}'))) IS DISTINCT FROM '{pin}' THEN RAISE EXCEPTION 'PIN_DRIFT:{signature}'; END IF;" for signature, pin in pins.items())
post_checks = "\n".join(f"IF md5(pg_get_functiondef(to_regprocedure('{signature}'))) IS DISTINCT FROM '{pin}' THEN RAISE EXCEPTION 'POST_PIN_DRIFT:{signature}'; END IF;" for signature, pin in post.items())
body = (H / "02-install.sql.review").read_text()
start = body.index("CREATE TABLE platform_private.micro_ficha_gate_v1")
body = body[start:body.rindex("COMMIT;")]
if "$installbody$" in body:
    raise SystemExit("DELIMITER_COLLISION")
install = f"""-- Explicit reviewed destination: {ref}; SQL does not authorize connection.
BEGIN;
DO $install$ BEGIN
{checks}
IF to_regprocedure('public.tenant_microorganism_ficha_save_v1(uuid,timestamptz,timestamptz,jsonb,jsonb,uuid)') IS NOT NULL THEN
 {post_checks}
 -- Exact rerun is a no-op: never reopens a rollback or changes release state.
ELSE
 EXECUTE $installbody${body}$installbody$;
 {post_checks}
END IF;
END $install$;
COMMIT;
"""
write_lf(out / "02-install.sql.review", install)
write_lf(out / "01-pre.sql.review", f"-- Destination {ref}\nDO $pre$ BEGIN\n{checks}\nEND $pre$;\n")
write_lf(out / "03-post.sql.review", f"DO $post$ BEGIN\n{post_checks}\nEND $post$;\nSELECT enabled FROM platform_private.micro_ficha_gate_v1;\n")
for name in ("04-rollback.sql.review", "05-release.sql.review"):
    write_lf(out / name, (H / name).read_text().replace("BEGIN;", f"BEGIN;\nDO $pins$ BEGIN\n{post_checks}\nEND $pins$;", 1))
write_lf(out / "binding.json", json.dumps({"ref": ref, "edge_env": {"CATALOG_DOCUMENTARY_PROJECT_REF": ref}, "capture_sha256": hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest()}, indent=2) + "\n")
print(json.dumps({"ref": ref, "output": str(out), "applied": False}))
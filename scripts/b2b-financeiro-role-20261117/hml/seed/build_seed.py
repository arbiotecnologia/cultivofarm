#!/usr/bin/env python3
"""Gera 05/06 autocontidos (SQL editor do HML não tem \\ir) a partir dos templates + _lib.sql e grava SHA256."""
import hashlib; from pathlib import Path
D = Path(__file__).resolve().parent; lib = (D / "_lib.sql").read_text(); legacy = (D / "_legacy_origin.sql").read_text(); disc = (D / "_discover.sql").read_text()
import re, json
cap = (D / "captured/c11-triggers.sql").read_text()
pins = {}
for m in re.finditer(r"CREATE OR REPLACE FUNCTION ([\w.]+)\(\)\n.*?AS \$function\$(.*?)\$function\$", cap, re.S):
    n = m.group(1) if "." in m.group(1) else "public." + m.group(1)
    k = n + "()"
    pins[k] = hashlib.md5(m.group(2).encode()).hexdigest()
assert len(pins) == 38, len(pins)
(D / "c11-pins.json").write_text(json.dumps(pins, indent=1, sort_keys=True) + "\n")
for t, o in [("06a-cleanup-dryrun.template.sql", "06a-cleanup-dryrun-hml.sql.rollback"), ("04-register-saas.template.sql", "04-register-saas-hml.sql.review"), ("05-seed.template.sql", "05-seed-hml.sql.review"), ("06-cleanup.template.sql", "06-cleanup-hml.sql.review")]:
    s = (D / t).read_text(); assert s.count("{{LIB}}") == (0 if t.startswith(("04", "06a")) else 1), t
    (D / o).write_text(s.replace("{{LIB}}", lib).replace("{{LEGACY}}", legacy).replace("{{DISCOVER}}", disc).replace("{{PINS}}", json.dumps(pins, sort_keys=True)))
(D / "SHA256SUMS").write_text("".join(f"{hashlib.sha256((D/f).read_bytes()).hexdigest()}  {f}\n" for f in
    ["_lib.sql", "_legacy_origin.sql", "04-register-saas-hml.sql.review", "05-seed-hml.sql.review", "06a-cleanup-dryrun-hml.sql.rollback", "06-cleanup-hml.sql.review", "_discover.sql", "07-verify-clean-hml.sql.readonly", "captured/c11-triggers.sql", "c11-pins.json"] ))

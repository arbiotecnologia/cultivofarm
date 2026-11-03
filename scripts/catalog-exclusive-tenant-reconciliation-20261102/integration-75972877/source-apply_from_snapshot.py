#!/usr/bin/env python3
"""Aplica o pacote v4 no ORIGINAL lendo bytes exatos do snapshot read-only desta cópia isolada.
Uso: apply_from_snapshot.py <snapshot_desta_copia> <raiz_do_original> [--apply]
Sem --apply: só verifica (nada escrito). Fontes: add/replace = <snapshot>/<path>; merged_3way = <snapshot>/scripts/
original-integration-20261102/export/merged/<path>. Cada fonte precisa bater sha256 do MANIFEST; cada destino
replace/merged precisa bater original_sha256; add exige destino ausente ou já idêntico. Qualquer divergência aborta antes
de escrever (rebase, nunca sobrescrever). keep_original/never_integrate nunca são tocados."""
import hashlib, json, os, sys
snap, orig = sys.argv[1], sys.argv[2]; apply = "--apply" in sys.argv
E = os.path.join(snap, "scripts/original-integration-20261102/export")
man = json.load(open(os.path.join(E, "MANIFEST.json")))
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
plan, err = [], []
for x in man["files"]:
    a = x["action"]
    if a not in ("add", "replace", "merged_3way"): continue
    src = os.path.join(E, "merged", x["path"]) if a == "merged_3way" else os.path.join(snap, x["path"])
    dst = os.path.join(orig, x["path"])
    if not os.path.isfile(src) or sha(src) != x["sha256"]: err.append(f"source_mismatch:{x['path']}"); continue
    if a == "add":
        if os.path.exists(dst) and sha(dst) != x["sha256"]: err.append(f"add_target_exists_different:{x['path']}"); continue
    elif os.path.isfile(dst) and sha(dst) == x["sha256"]: pass  # já aplicado (idempotente)
    elif not os.path.isfile(dst) or sha(dst) != x["original_sha256"]: err.append(f"original_sha256_mismatch:{x['path']}"); continue
    plan.append((src, dst))
for src, _ in plan:
    if src.startswith(os.path.join(snap, "src")) and b"vrlcdwmlytukrjezrrnf" in open(src, "rb").read(): err.append(f"homolog_marker:{src}")
print(json.dumps(dict(counts=man["summary"]["counts"], planned=len(plan), errors=err[:50], n_errors=len(err), apply=apply)))
if err: sys.exit(2)
if apply:
    for src, dst in plan:
        os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst, "wb").write(open(src, "rb").read())
    bad = [d for (s, d) in plan if sha(d) != sha(s)]
    print("POST", "OK" if not bad else bad); sys.exit(1 if bad else 0)

#!/usr/bin/env python3
"""H7O — Classificação individual das funções SECURITY DEFINER executáveis por authenticated.

Entrada: secdef_catalog.tsv (catálogo do staging) + repo_refs.tsv (consumidores no repositório).
Saída:   secdef_classification.tsv (uma linha por ASSINATURA) + resumo no stdout.

Categorias (exclusivas; precedência de cima para baixo):
  trigger                       - função de trigger (prorettype=trigger)
  publica_necessaria            - EXECUTE para anon por design (QR/token)
  estrutural_rls_view_cron_edge - referenciada por policy/view/constraint/default/índice/event trigger (pg_depend),
                                  por job pg_cron ou por Edge Function
  rpc_autenticada_com_guarda    - chamada direta pelo app/testes E guarda EFETIVA no corpo (papel/escopo/raise/uid_check)
  rpc_autenticada_sem_guarda    - chamada direta pelo app/testes SEM guarda efetiva (auth.uid() só como valor não conta)
  helper_interno                - sem consumidor direto; tem callers que exigem EXECUTE do chamador
                                  (função INVOKER ou trigger INVOKER exposta) -> NÃO revogar
  candidata_revogacao           - sem consumidor direto; callers exclusivamente SECURITY DEFINER (ou sem callers)
Guarda efetiva: qualquer linha classificada como role/scope/raise/uid_check/trigger_depth.
"""
import csv, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CAT = os.path.join(HERE, "secdef_catalog.tsv")
REF = os.path.join(HERE, "repo_refs.tsv")
OUT = os.path.join(HERE, "secdef_classification.tsv")

ROLE = re.compile(r"has_role\(|is_executivo|get_partner_papel|_require_admin|_comunicacao_require|fn_b2b_assert|fn_h6_assert|fn_fin_assert|fn_fiscal_assert", re.I)
SCOPE = re.compile(r"get_cliente_ids?_for_user|get_user_partner_id|_portal_cliente_user_has_link|is_active_visit_participant|is_visit_responsible|fn_onfarm_scope|can_checkout|_assert_visita", re.I)
RAISE = re.compile(r"42501|permission_denied|insufficient_privilege|n[aã]o autorizado|acesso negado|not authorized|rls_deny", re.I)
UID_CHECK = re.compile(r"auth\.uid\(\)\s+is\s+null|auth\.uid\(\)\s+is\s+not\s+null|=\s*auth\.uid\(\)|auth\.uid\(\)\s*=|auth\.uid\(\)\s*(<>|!=)|auth\.uid\(\)\s+in\b|in\s*\(\s*select.*auth\.uid\(\)|<>\s*auth\.uid\(\)|any\s*\(\s*get_cliente|request\.jwt|auth\.jwt\(\)", re.I)
TRIGGER_DEPTH = re.compile(r"pg_trigger_depth", re.I)
UID_VALUE_ONLY = re.compile(r"(:=|,|\(|values\s*\()\s*auth\.uid\(\)\s*(,|\)|;)|auth\.uid\(\)\s*(,|\)|;)\s*$|coalesce\(\s*auth\.uid\(\)", re.I)

def guard_kinds(lines):
    kinds = set()
    for l in lines.split(" || "):
        l = l.strip()
        if not l:
            continue
        if ROLE.search(l): kinds.add("role")
        if SCOPE.search(l): kinds.add("scope")
        if RAISE.search(l): kinds.add("raise")
        if TRIGGER_DEPTH.search(l): kinds.add("trigger_depth")
        if UID_CHECK.search(l): kinds.add("uid_check")
        elif "auth.uid()" in l.lower() and UID_VALUE_ONLY.search(l): kinds.add("uid_value_only")
        elif "auth.uid()" in l.lower(): kinds.add("uid_other")
    return kinds

with open(REF, encoding="utf-8") as fh:
    refs = {r["name"]: r for r in csv.DictReader(fh, delimiter="\t")}

rows = []
with open(CAT, encoding="utf-8") as fh:
    lines = [l for l in fh if not l.startswith("#")]
reader = csv.DictReader(lines, delimiter="\t")
for r in reader:
    name = r["sig"].split("(", 1)[0]
    ref = refs.get(name, {})
    fe = int(ref.get("fe_strong_n", 0) or 0) + int(ref.get("fe_weak_n", 0) or 0)
    edge = int(ref.get("edge_strong_n", 0) or 0) + int(ref.get("edge_weak_n", 0) or 0)
    tests = int(ref.get("tests_n", 0) or 0)
    harness = int(ref.get("harness_n", 0) or 0)
    kinds = guard_kinds(r["guard_lines"])
    effective = bool(kinds & {"role", "scope", "raise", "uid_check", "trigger_depth"})
    dep = r["dep_consumers"]
    cron = r["cron_jobs"]
    callers_def = r["callers_definer"]
    callers_inv = r["callers_invoker"]
    callers_trg = r["callers_trigger"]
    callers_trg_inv = r["callers_trigger_invoker_exposed"]
    n_callers = int(r["n_callers"] or 0)
    direct = fe > 0 or tests > 0

    if r["kind"] == "trigger":
        cat = "trigger"
    elif r["acl_anon"] == "anon":
        cat = "publica_necessaria"
    elif dep or cron or edge > 0:
        cat = "estrutural_rls_view_cron_edge"
    elif direct and effective:
        cat = "rpc_autenticada_com_guarda"
    elif direct:
        cat = "rpc_autenticada_sem_guarda"
    elif callers_inv or callers_trg_inv:
        cat = "helper_interno"
    else:
        cat = "candidata_revogacao"

    # risco
    if cat in ("rpc_autenticada_sem_guarda",):
        risk = "ALTO" if r["dml"] == "DML" else "MEDIO"
    elif cat == "candidata_revogacao":
        risk = "BAIXO" if effective else ("MEDIO" if r["dml"] == "DML" else "BAIXO")
    elif cat == "helper_interno":
        risk = "BAIXO" if effective else "MEDIO"
    elif cat == "publica_necessaria":
        risk = "MEDIO"
    else:
        risk = "BAIXO"

    consumer = []
    if ref.get("fe_strong"): consumer.append("app:" + ref["fe_strong"].split(" ; ")[0])
    elif ref.get("fe_weak"): consumer.append("app~:" + ref["fe_weak"].split(" ; ")[0])
    if ref.get("edge_strong"): consumer.append("edge:" + ref["edge_strong"].split(" ; ")[0])
    elif ref.get("edge_weak"): consumer.append("edge~:" + ref["edge_weak"].split(" ; ")[0])
    if ref.get("tests"): consumer.append("test:" + ref["tests"].split(" ; ")[0])
    if dep: consumer.append(dep)
    if cron: consumer.append("cron:" + cron)
    if callers_def: consumer.append("callers_def:" + callers_def)
    if callers_inv: consumer.append("callers_inv:" + callers_inv)
    if callers_trg: consumer.append("callers_trg:" + callers_trg)
    if harness: consumer.append(f"harness:{harness}")

    rows.append({
        "sig": r["sig"], "categoria": cat, "risco": risk,
        "guard_kinds": ",".join(sorted(kinds)) or "-",
        "guard_efetiva": "sim" if effective else "nao",
        "dml": r["dml"], "acl_anon": r["acl_anon"],
        "fe_refs": fe, "edge_refs": edge, "test_refs": tests, "harness_refs": harness,
        "n_callers": n_callers, "callers_definer": callers_def, "callers_invoker": callers_inv,
        "callers_trigger": callers_trg, "dep_consumers": dep, "cron_jobs": cron,
        "consumidor_evidencia": " | ".join(consumer)[:600],
        "guard_evidencia": r["guard_lines"][:400],
        "proconfig": r["proconfig"], "body_md5": r["body_md5"],
        "acao_h7o": "",
    })

with open(OUT, "w", encoding="utf-8", newline="") as fh:
    fh.write("# H7O classificação individual — staging ikaauvsflpmamgxmkhoq — categorias exclusivas; evidência = consumidor real (arquivo:linha, pg_depend, cron, callers)\n")
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()), delimiter="\t")
    w.writeheader()
    for r in rows:
        w.writerow(r)

from collections import Counter
c = Counter(r["categoria"] for r in rows)
print(f"assinaturas: {len(rows)}")
for k, v in sorted(c.items(), key=lambda x: -x[1]):
    print(f"  {v:4d}  {k}")
print("riscos:", dict(Counter(r["risco"] for r in rows)))

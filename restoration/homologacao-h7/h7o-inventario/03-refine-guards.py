#!/usr/bin/env python3
"""H7O — Refinamento: guarda DELEGADA via grafo de chamadas.

Muitas RPCs delegam a autorização a helpers (`_visita_lock_and_check`, `fn_cockpit_assert_operador`,
`can_manage_technical_visit`, ...). Este passo lê os corpos (arquivo temporário fora do repositório,
/tmp/h7o_bodies.tsv, gerado do staging) e:
  1) identifica helpers de autorização: corpo com padrão de papel/escopo/RAISE 42501 e que
     (retorna boolean) OU (lança 42501/insufficient_privilege) OU (nome assert/require/can_/is_/pode/lock_and_check);
  2) para cada assinatura classificada como rpc_autenticada_sem_guarda ou candidata_revogacao sem guarda própria,
     verifica se chama (por nome, no corpo) algum helper de autorização -> guarda delegada (evidência: nome do helper);
  3) regrava secdef_classification.tsv com guard_kinds += delegada:<helper> e categoria ajustada.
Também produz call_graph.tsv (target -> funções public/private chamadas) para auditoria manual.
"""
import csv, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
CLS = os.path.join(HERE, "secdef_classification.tsv")
BODIES = "/tmp/h7o_bodies.tsv"
GRAPH = os.path.join(HERE, "call_graph.tsv")

ROLE = re.compile(r"has_role\(|is_executivo|get_partner_papel|_require_admin|_comunicacao_require", re.I)
SCOPE = re.compile(r"get_cliente_ids?_for_user|get_user_partner_id|_portal_cliente_user_has_link|is_active_visit_participant|is_visit_responsible|fn_onfarm_scope", re.I)
RAISE = re.compile(r"42501|permission_denied|insufficient_privilege|n[aã]o autorizado|acesso negado|not authorized", re.I)
UIDC = re.compile(r"auth\.uid\(\)\s+is\s+null|=\s*auth\.uid\(\)|auth\.uid\(\)\s*=|auth\.uid\(\)\s+in\b", re.I)
HELPER_NAME = re.compile(r"(^|_)(assert|require|can_|is_|pode|lock_and_check|guard|allowed|check_access|has_access)", re.I)

bodies = {}
by_name = {}
with open(BODIES, encoding="utf-8") as fh:
    for row in csv.reader(fh, delimiter="\t"):
        if len(row) != 7:
            continue
        nsp, sig, secdef, is_trg, rettype, auth_exec, body = row
        body = body.replace("<NL>", "\n")
        name = sig.split("(", 1)[0]
        bodies[(nsp, sig)] = dict(nsp=nsp, sig=sig, name=name, secdef=secdef == "t", is_trg=is_trg == "t",
                                 rettype=rettype, auth_exec=auth_exec == "t", body=body)
        by_name.setdefault(name, []).append((nsp, sig))

all_names = sorted(by_name.keys(), key=len, reverse=True)
name_rx = {n: re.compile(r"(?<![A-Za-z0-9_])" + re.escape(n) + r"\s*\(") for n in all_names}

def guard_own(body):
    b = "\n".join(l for l in body.split("\n") if not l.strip().startswith("--"))
    return bool(ROLE.search(b) or SCOPE.search(b) or RAISE.search(b) or UIDC.search(b))

helpers = set()
for (nsp, sig), f in bodies.items():
    if f["is_trg"]:
        continue
    if not guard_own(f["body"]):
        continue
    # helper de autorização: nome de helper (assert/require/can_/is_/pode/lock_and_check/guard) E
    # (retorna boolean OU lança 42501/insufficient_privilege). RPCs de negócio NÃO contam como guarda delegada.
    if HELPER_NAME.search(f["name"]) and (f["rettype"] == "boolean" or RAISE.search(f["body"])):
        helpers.add(f["name"])
# helpers manifestamente de autorização (confirmados por leitura no H7N/H7O)
helpers |= {"has_role", "is_executivo", "get_user_partner_id", "get_cliente_ids_for_user", "get_cliente_id_for_user",
            "_visita_lock_and_check", "fn_cockpit_assert_operador", "fn_entrega_assert_confirmador", "fn_estoque_pode_operar",
            "_assert_visita_editavel", "_comunicacao_require_admin", "can_manage_technical_visit", "can_view_technical_visit",
            "is_visit_org_manager", "can_checkin_technical_visit", "is_operational_staff", "can_view_bi_operacional"}

def calls(body):
    out = set()
    for n in all_names:
        if n in body and name_rx[n].search(body):
            out.add(n)
    return out

# grafo para todos os alvos classificados
rows = []
with open(CLS, encoding="utf-8") as fh:
    lines = [l for l in fh if not l.startswith("#")]
reader = csv.DictReader(lines, delimiter="\t")
fields = reader.fieldnames
for r in reader:
    rows.append(r)

graph_lines = []
changed = 0
for r in rows:
    sig = r["sig"]
    f = bodies.get(("public", sig))
    if not f:
        continue
    called = calls(f["body"]) - {f["name"]}
    graph_lines.append((sig, ",".join(sorted(called))))
    delegated = sorted(c for c in called if c in helpers)
    if delegated and r["guard_efetiva"] == "nao":
        r["guard_kinds"] = (r["guard_kinds"].replace("-", "") + ("," if r["guard_kinds"] != "-" else "") + "delegada:" + "+".join(delegated)).strip(",")
        r["guard_efetiva"] = "sim(delegada)"
        if r["categoria"] == "rpc_autenticada_sem_guarda":
            r["categoria"] = "rpc_autenticada_com_guarda"
            r["risco"] = "BAIXO"
            changed += 1
        r["guard_evidencia"] = ("delegada -> " + ",".join(delegated) + " | " + r["guard_evidencia"])[:400]
    elif delegated:
        r["guard_kinds"] += ",delegada:" + "+".join(delegated)

with open(GRAPH, "w", encoding="utf-8") as fh:
    fh.write("# H7O grafo de chamadas (alvo -> funções public/private referenciadas por nome no corpo)\n")
    for sig, c in graph_lines:
        fh.write(f"{sig}\t{c}\n")

with open(CLS, "w", encoding="utf-8", newline="") as fh:
    fh.write("# H7O classificação individual — staging ikaauvsflpmamgxmkhoq — categorias exclusivas; evidência = consumidor real (arquivo:linha, pg_depend, cron, callers); guarda própria ou delegada (helper nomeado)\n")
    w = csv.DictWriter(fh, fieldnames=fields, delimiter="\t")
    w.writeheader()
    for r in rows:
        w.writerow(r)

from collections import Counter
print(f"helpers de autorização identificados: {len(helpers)}")
print(f"reclassificadas sem_guarda -> com_guarda(delegada): {changed}")
c = Counter(r["categoria"] for r in rows)
for k, v in sorted(c.items(), key=lambda x: -x[1]):
    print(f"  {v:4d}  {k}")
print("riscos:", dict(Counter(r["risco"] for r in rows)))

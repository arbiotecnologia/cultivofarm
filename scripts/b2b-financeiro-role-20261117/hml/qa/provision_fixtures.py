#!/usr/bin/env python3
"""Provisiona contas QA SINTÉTICAS do Financeiro B2B pelos caminhos canônicos, sem e-mail, e gera o fixture manifest.
Executado SOMENTE pelo auditor, após revisão do root. Não usa service_role, não grava SQL, não cria títulos/pedidos/NF.
Caminho: Edge create-user (ramo interno com senha local, email_confirm, nenhum envio; papel temporário mínimo `aplicador`)
 -> Edge tenant-user-admin op=change_access_type (CAS, transação canônica 02c) para b2b_finance / b2b -> nova sessão -> capability.
Revogado: sessão emitida enquanto Financeiro, depois transição canônica para interno; o token ANTIGO vai a QA_FIN_REVOKED.
Entradas (ambiente local): TARGET=hml|rehearsal, ANON_KEY, ADMIN_AB_JWT, ADMIN_C_JWT, PARTNER_A/B/C (parceiros QA-FIN-* já existentes),
 ORDER_PAYLOAD_JSON (payload válido de pedido sintético p/ negativo), TITLES_JSON opcional (sentinelas confirmados por C10; nunca criados aqui).
Saídas: fixture-manifest.json (sem segredos), qa-tokens.env e qa-state.private.json (0600, NUNCA versionar; e-mail+senha
 para navegador/retomada, nunca impressos). Estado é persistido ANTES de cada login/transição; reexecução retoma contas já
 criadas em vez de criar novas. Sem TITLES_JSON o resultado nunca é aprovação total (títulos BLOCKED_NO_ROWS)."""
import json, os, secrets, sys, urllib.request, urllib.error, uuid
REFS = {"hml": "vrlcdwmlytukrjezrrnf", "rehearsal": "swzpzcwiasxmjutrmvkm"}
T = os.environ.get("TARGET")
if T not in REFS: sys.exit("REFUSED: TARGET")
if T == "rehearsal" and os.environ.get("REHEARSAL_CONFIRM") != "SINTETICO-ISOLADO-ROOT-REVISOU": sys.exit("REFUSED: REHEARSAL_CONFIRM")
REF = REFS[T]; URL = f"https://{REF}.supabase.co"; KEY = os.environ["ANON_KEY"]; E = os.environ
FORBIDDEN = {"d7edc250-25a4-4ee2-8b62-27c1645cdfc0"}
def call(tok, method, path, body=None):
    req = urllib.request.Request(URL + path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": "Bearer " + (tok or KEY), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or "null")
        except Exception: return e.code, None
def need(ok, msg):
    if not ok: sys.exit("STOP: " + msg)  # fail-closed; nada é desfeito automaticamente, root reconcilia pelo manifesto parcial
def signin(email, pw):
    s, j = call(None, "POST", "/auth/v1/token?grant_type=password", {"email": email, "password": pw}); need(s == 200, f"signin {s}"); return j["access_token"], j["user"]["id"]
def link(admin, uid):
    s, j = call(admin, "POST", "/rest/v1/rpc/tenant_admin_partner_link_v1", {"p_user_id": uid}); need(s == 200, f"link_read {s}"); return (j or {}).get("link")
def transition(admin, uid, target, roles, remove, partner=None):
    lk = link(admin, uid)
    args = {"user_id": uid, "target": target, "roles": roles, "remove_roles": remove, "expected_link_version": (lk or {}).get("version"),
            "idempotency_key": str(uuid.uuid4()), "reason": "QA sintético Financeiro B2B"}
    if target == "b2b_finance" and not lk: args["partner_id"] = partner  # só cria vínculo; alvo b2b recusa partner_id (partner_not_allowed)
    need(target == "b2b_finance" or lk, f"{target} exige vínculo existente")
    s, j = call(admin, "POST", "/functions/v1/tenant-user-admin", {"op": "change_access_type", "args": args}); need(s == 200, f"transition {target} {s} {(j or {}).get('error') if isinstance(j, dict) else ''}")
P = {k: E[f"PARTNER_{k}"] for k in "ABC"}
need(not (set(P.values()) & FORBIDDEN) and len(set(P.values())) == 3, "parceiros proibidos/repetidos")
ADM = {"A": E["ADMIN_AB_JWT"], "B": E["ADMIN_AB_JWT"], "C": E["ADMIN_C_JWT"]}
for k, pid in P.items():
    s, j = call(ADM[k], "GET", f"/rest/v1/partner_accounts?id=eq.{pid}&select=id,razao_social,commercial_owner_organization_id")
    need(s == 200 and len(j) == 1 and str(j[0]["razao_social"]).startswith("QA-FIN-"), f"parceiro {k} não é fixture QA-FIN- visível ao admin")
    P[k] = {"id": pid, "org": j[0]["commercial_owner_organization_id"]}
need(P["A"]["org"] == P["B"]["oSTATE = "qa-state.private.json"
def persist(st):
    tmp = STATE + ".tmp"; fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.write(fd, json.dumps(st, indent=1).encode()); os.fsync(fd); os.close(fd); os.replace(tmp, STATE)
st = json.load(open(STATE)) if os.path.exists(STATE) else {"ref": REF, "accounts": {}}
need(st["ref"] == REF, "estado de outro ref")
def manifest():
    json.dump({"ref": REF, "synthetic": True, "partners": P,
               "users": {l: {"user_id": a.get("user_id"), "steps": a["steps"]} for l, a in st["accounts"].items()}},
              open("fixture-manifest.json", "w"), indent=1)
def make(label, admin):
    a = st["accounts"].get(label)
    if not a:  # credenciais gravadas ANTES do create-user: falha posterior nunca deixa conta sem registro
        a = st["accounts"][label] = {"email": f"qa-fin-{label.lower()}-{secrets.token_hex(4)}@" + E.get("QA_EMAIL_DOMAIN", "qa-fin.invalid"),
             "password": secrets.token_urlsafe(24) + "9a", "idem": str(uuid.uuid4()), "steps": []}; persist(st)
    if "created" not in a["steps"]:
        s, j = call(admin, "POST", "/functions/v1/create-user", {"email": a["email"], "password": a["password"], "nome": f"QA FIN {label}",
                                                                "roles": ["aplicador"], "idempotency_key": a["idem"]})
        need(s in (200, 201), f"create-user {label} {s}"); a["steps"].append("created"); persist(st)
    if not a.get("user_id"): a["user_id"] = signin(a["email"], a["password"])[1]; persist(st); manifest()
    return a
def step(a, name, fn):
    if name in a["steps"]: return
    fn(); a["steps"].append(name); persist(st); manifest()
def link_id(admin, uid, pid):
    s, j = call(admin, "GET", f"/rest/v1/partner_users?user_id=eq.{uid}&revoked_at=is.null&select=id,user_id,partner_id,papel")
    need(s == 200 and isinstance(j, list) and len(j) == 1 and j[0]["partner_id"] == pid and j[0]["papel"] == "financeiro",
         "leitura admin do vínculo exato do fixture (id ausente no PARTNER_LINK_V1)")
    return j[0]["id"]
toks = {}
for k in "ABC":
    a = make(f"FIN_{k}", ADM[k]); uid = a["user_id"]
    step(a, "to_finance", lambda: transition(ADM[k], uid, "b2b_finance", ["parceiro_b2b_financeiro"], ["aplicador"], P[k]["id"]))
    tok, _ = signin(a["email"], a["password"]); s, c = call(tok, "POST", "/rest/v1/rpc/b2b_finance_capability_v1", {})
    need(s == 200 and c.get("allowed") and c.get("partner_id") == P[k]["id"], f"cap FIN_{k}")
    lk = link(ADM[k], uid); need(lk and lk["partner_id"] == P[k]["id"] and lk["papel"] == "financeiro", f"link FIN_{k}")
    toks[f"QA_FIN_{k}"] = tok
    P[k].update(finance_user=uid, link_id=link_id(ADM[k], uid, P[k]["id"]), titles=titles.get(k, []),
                order_payload={**order, "partner_id": P[k]["id"]}, credit_limit=lim.get(P[k]["id"])); manifest()
for label, roles in [("GESTOR_A", ["parceiro_b2b"]), ("TECNICO_A", ["parceiro_b2b_tecnico"])]:
    # create-user HML rejeita papéis B2B; b2b exige vínculo existente e recusa partner_id: primeiro b2b_finance com parceiro,
    # depois b2b removendo SOMENTE o financeiro; transition() relê o vínculo, logo o CAS usa a versão pós-bump.
    a = make(label, ADM["A"]); uid = a["user_id"]
    step(a, "to_finance", lambda: transition(ADM["A"], uid, "b2b_finance", ["parceiro_b2b_financeiro"], ["aplicador"], P["A"]["id"]))
    step(a, "to_b2b", lambda: transition(ADM["A"], uid, "b2b", roles, ["parceiro_b2b_financeiro"]))
    tok = signin(a["email"], a["password"])[0]; s, c = call(tok, "POST", "/rest/v1/rpc/b2b_finance_capability_v1", {})
    need(s == 200 and c.get("allowed") is False, f"{label} ainda financeiro"); toks[f"QA_{label}"] = tok
a = make("FIN_REV", ADM["A"]); uid = a["user_id"]
step(a, "to_finance", lambda: transition(ADM["A"], uid, "b2b_finance", ["parceiro_b2b_financeiro"], ["aplicador"], P["A"]["id"]))
need("revoked" not in a["steps"] or "QA_FIN_REVOKED" in os.environ, "revogação já feita sem token antigo salvo: recriar só após reconciliação pelo root")
if "revoked" not in a["steps"]:
    old, _ = signin(a["email"], a["password"]); toks["QA_FIN_REVOKED"] = old
    fd = os.open("qa-revoked-token.env", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600); os.write(fd, f"export QA_FIN_REVOKED={old}\n".encode()); os.close(fd)
    step(a, "revoked", lambda: transition(ADM["A"], uid, "internal", ["aplicador"], ["parceiro_b2b_financeiro"]))
else: toks["QA_FIN_REVOKED"] = os.environ["QA_FIN_REVOKED"]
manifest()
fd = os.open("qa-tokens.env", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, "".join(f"export {k}={v}\n" for k, v in toks.items()).encode()); os.close(fd)
n = {k: len(P[k]["titles"]) for k in "ABC"}
print("OK manifest+tokens (credenciais em", STATE, "não impressas); títulos sentinela:", n,
      "" if all(n.values()) else "-> SEM TÍTULOS: isolamento de títulos BLOCKED_NO_ROWS, sem aprovação total")

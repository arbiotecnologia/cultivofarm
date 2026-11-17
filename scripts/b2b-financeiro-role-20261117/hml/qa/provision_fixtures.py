#!/usr/bin/env python3
"""Provisiona contas QA SINTÉTICAS do Financeiro B2B pelos caminhos canônicos, sem e-mail, e gera o fixture manifest.
Executado SOMENTE pelo auditor, após revisão do root. Não usa service_role, não grava SQL, não cria títulos/pedidos/NF.
Caminho: Edge create-user (ramo interno com senha local, email_confirm, nenhum envio; papel temporário mínimo `aplicador`)
 -> Edge tenant-user-admin op=change_access_type (CAS, transação canônica 02c) para b2b_finance / b2b -> nova sessão -> capability.
Revogado: sessão emitida enquanto Financeiro, depois transição canônica para interno; o token ANTIGO vai a QA_FIN_REVOKED.
Entradas (ambiente local): TARGET=hml|rehearsal, ANON_KEY, ADMIN_AB_JWT, ADMIN_C_JWT, PARTNER_A/B/C (parceiros QA-FIN-* já existentes),
 ORDER_PAYLOAD_JSON (payload válido de pedido sintético p/ negativo), TITLES_JSON opcional (sentinelas confirmados por C10; nunca criados aqui).
Saídas: fixture-manifest.json (sem segredos) e qa-tokens.env (0600, NUNCA versionar)."""
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
    if partner and not lk: args["partner_id"] = partner
    s, j = call(admin, "POST", "/functions/v1/tenant-user-admin", {"op": "change_access_type", "args": args}); need(s == 200, f"transition {target} {s} {(j or {}).get('error') if isinstance(j, dict) else ''}")
P = {k: E[f"PARTNER_{k}"] for k in "ABC"}
need(not (set(P.values()) & FORBIDDEN) and len(set(P.values())) == 3, "parceiros proibidos/repetidos")
ADM = {"A": E["ADMIN_AB_JWT"], "B": E["ADMIN_AB_JWT"], "C": E["ADMIN_C_JWT"]}
for k, pid in P.items():
    s, j = call(ADM[k], "GET", f"/rest/v1/partner_accounts?id=eq.{pid}&select=id,razao_social,commercial_owner_organization_id")
    need(s == 200 and len(j) == 1 and str(j[0]["razao_social"]).startswith("QA-FIN-"), f"parceiro {k} não é fixture QA-FIN- visível ao admin")
    P[k] = {"id": pid, "org": j[0]["commercial_owner_organization_id"]}
need(P["A"]["org"] == P["B"]["org"] != P["C"]["org"], "topologia A/B mesma empresa, C outra")
s, j = call(ADM["A"], "GET", f"/rest/v1/partner_financial_settings?partner_id=in.({P['A']['id']},{P['B']['id']},{P['C']['id']})&select=partner_id,credit_limit")
lim = {r["partner_id"]: r["credit_limit"] for r in (j or [])} if s == 200 else {}
order = json.load(open(E["ORDER_PAYLOAD_JSON"])); titles = json.load(open(E["TITLES_JSON"])) if E.get("TITLES_JSON") else {}
toks, users = {}, {}
def make(label, admin):
    email = f"qa-fin-{label.lower()}-{secrets.token_hex(4)}@" + E.get("QA_EMAIL_DOMAIN", "qa-fin.invalid"); pw = secrets.token_urlsafe(24) + "9a"
    s, j = call(admin, "POST", "/functions/v1/create-user", {"email": email, "password": pw, "nome": f"QA FIN {label}", "roles": ["aplicador"], "idempotency_key": str(uuid.uuid4())})
    need(s in (200, 201), f"create-user {label} {s}"); tok, uid = signin(email, pw); users[label] = {"user_id": uid, "email_domain": "qa-fin.invalid"}; return email, pw, uid
for k in "ABC":
    email, pw, uid = make(f"FIN_{k}", ADM[k]); transition(ADM[k], uid, "b2b_finance", ["parceiro_b2b_financeiro"], ["aplicador"], P[k]["id"])
    tok, _ = signin(email, pw); s, c = call(tok, "POST", "/rest/v1/rpc/b2b_finance_capability_v1", {}); need(s == 200 and c.get("allowed") and c.get("partner_id") == P[k]["id"], f"cap FIN_{k}")
    lk = link(ADM[k], uid); toks[f"QA_FIN_{k}"] = tok
    P[k].update(finance_user=uid, link_id=lk["id"], titles=titles.get(k, []), order_payload={**order, "partner_id": P[k]["id"]}, credit_limit=lim.get(P[k]["id"]))
for label, roles in [("GESTOR_A", ["parceiro_b2b"]), ("TECNICO_A", ["parceiro_b2b_tecnico"])]:
    # create-user HML v2 rejeita papéis B2B (tenant_role_unavailable) e o alvo `b2b` exige vínculo existente:
    # único caminho canônico que cria vínculo é b2b_finance; depois fin→b2b converte papel+vínculo (testado: fin_para_gestor).
    email, pw, uid = make(label, ADM["A"]); transition(ADM["A"], uid, "b2b_finance", ["parceiro_b2b_financeiro"], ["aplicador"], P["A"]["id"])
    transition(ADM["A"], uid, "b2b", roles, ["parceiro_b2b_financeiro"]); tok = signin(email, pw)[0]
    s, c = call(tok, "POST", "/rest/v1/rpc/b2b_finance_capability_v1", {}); need(s == 200 and c.get("allowed") is False, f"{label} ainda financeiro"); toks[f"QA_{label}"] = tok
email, pw, uid = make("FIN_REV", ADM["A"]); transition(ADM["A"], uid, "b2b_finance", ["parceiro_b2b_financeiro"], ["aplicador"], P["A"]["id"])
old, _ = signin(email, pw); transition(ADM["A"], uid, "internal", ["aplicador"], ["parceiro_b2b_financeiro"]); toks["QA_FIN_REVOKED"] = old
json.dump({"ref": REF, "synthetic": True, "partners": P, "users": users}, open("fixture-manifest.json", "w"), indent=1)
fd = os.open("qa-tokens.env", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, "".join(f"export {k}={v}\n" for k, v in toks.items()).encode()); os.close(fd)
print("OK manifest+tokens; títulos sentinela:", {k: len(P[k]["titles"]) for k in P})

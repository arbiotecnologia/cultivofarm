#!/usr/bin/env python3
"""Suíte JWT/PostgREST hospedada do Financeiro B2B (rev.3, achados da revisão independente sobre ba877bd).
Alvos permitidos: TARGET=hml (vrlcdwmlytukrjezrrnf) | TARGET=rehearsal (swzpzcwiasxmjutrmvkm, exige REHEARSAL_CONFIRM).
Entrada: MANIFEST=caminho do fixture-manifest.json (gerado por provision_fixtures.py) e, no ambiente local do auditor,
ANON_KEY + JWTs QA_FIN_A/B/C, QA_GESTOR_A, QA_TECNICO_A, QA_FIN_REVOKED (OBRIGATÓRIO). Nada é impresso além de status/códigos.
Regras de prova:
 - Obrigações: contrato estrito C2_OWN_OBLIGATIONS_V1 no ENVELOPE (partner_id do envelope, títulos sem partner_id);
   IDs de título/parcela/pedido devem ser EXATAMENTE os sentinelas do manifesto; sentinela ausente => BLOCKED_NO_ROWS.
 - Negação só conta com HTTP 401/403 + SQLSTATE 42501 + mensagem de domínio exata (ou ACL de tabela "permission denied").
   404/500/PGRST202/erro de coluna => FAIL (PGRST202 aceito só onde o manifesto registra catálogo provando ausência).
 - SELECT direto: nenhuma linha alheia; partner_users pode conter só o próprio vínculo (id/user/partner do manifesto).
 - Escritas negativas: payload válido do manifesto, alvo restrito a IDs QA; PATCH reescreve o MESMO valor (sem efeito se vazar);
   qualquer escrita aceita => FAIL + registro em leaks[] para limpeza pelo root.
 - Navegador/CSV: prova separada (ROTEIRO.md), nunca inferida desta suíte."""
import hashlib, json, os, sys, urllib.request, urllib.error
REFS = {"hml": "vrlcdwmlytukrjezrrnf", "rehearsal": "swzpzcwiasxmjutrmvkm"}
T = os.environ.get("TARGET"); 
if T not in REFS: sys.exit("REFUSED: TARGET=hml|rehearsal")
if T == "rehearsal" and os.environ.get("REHEARSAL_CONFIRM") != "SINTETICO-ISOLADO-ROOT-REVISOU": sys.exit("REFUSED: REHEARSAL_CONFIRM")
REF = REFS[T]; URL = f"https://{REF}.supabase.co"
M = json.load(open(os.environ["MANIFEST"]))
if M.get("ref") != REF or M.get("synthetic") is not True: sys.exit("REFUSED: manifesto de outro ref ou não sintético")
KEY = os.environ["ANON_KEY"]; E = os.environ.get
TOK = {k: E(k) for k in ["QA_FIN_A", "QA_FIN_B", "QA_FIN_C", "QA_GESTOR_A", "QA_TECNICO_A", "QA_FIN_REVOKED"]}
miss = [k for k, v in TOK.items() if not v]
if miss: sys.exit("REFUSED: tokens ausentes " + ",".join(miss))
P = M["partners"]  # {"A": {"id","org","finance_user","link_id","titles":[{"id","order_id","installments":[ids]}], "order_payload":{...}}, ...}
h = lambda s: hashlib.sha256(str(s).encode()).hexdigest()[:12]
res, leaks = [], []
def call(tok, method, path, body=None, prefer=None):
    req = urllib.request.Request(URL + path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": "Bearer " + (tok or KEY), "Content-Type": "application/json", **({"Prefer": prefer} if prefer else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        try: j = json.loads(e.read() or "null")
        except Exception: j = None
        return e.code, j
rpc = lambda tok, fn, a=None: call(tok, "POST", f"/rest/v1/rpc/{fn}", a or {})
def rec(name, status, http, detail=""):
    res.append({"name": name, "status": status, "http": http, "detail": str(detail)[:80]}); print(status, name, http)
def check(name, ok, http, detail=""): rec(name, "PASS" if ok else "FAIL", http, detail)
def denied(j, http, msgs):
    return http in (401, 403) and isinstance(j, dict) and j.get("code") == "42501" and (j.get("message") in msgs or any(j.get("message", "").startswith(m) for m in msgs if m.endswith(" ")))
ACL = ("permission denied for table ", "permission denied for function ")
RLS_INS = ("new row violates row-level security policy ",)
def envelope_ok(j, own):
    if not isinstance(j, dict) or set(j) != {"contract", "partner_id", "rows", "limit", "documents_enabled"}: return False
    if j["contract"] != "C2_OWN_OBLIGATIONS_V1" or j["partner_id"] != own or j["limit"] != 50 or j["documents_enabled"] is not False: return False
    tk = {"id", "order_id", "numero", "created_at", "total", "status", "installments"}; ik = {"id", "numero", "vencimento", "valor", "recebido", "status"}
    return all(isinstance(t, dict) and set(t) == tk and all(set(i) == ik for i in t["installments"]) for t in j["rows"])
def ids(j):
    t = {r["id"] for r in j["rows"]}; o = {r["order_id"] for r in j["rows"]}; i = {x["id"] for r in j["rows"] for x in r["installments"]}; return t, o, i
def sentinels(p):
    return {t["id"] for t in p["titles"]}, {t["order_id"] for t in p["titles"]}, {i for t in p["titles"] for i in t["installments"]}
foreign_all = lambda me: [P[k] for k in P if k != me]
for nm, tk in [("A", "QA_FIN_A"), ("B", "QA_FIN_B"), ("C", "QA_FIN_C")]:
    tok, p = TOK[tk], P[nm]; own = p["id"]
    s, j = rpc(tok, "b2b_finance_capability_v1")
    check(f"cap_{nm}", s == 200 and isinstance(j, dict) and j.get("contract") == "B2B_FINANCE_ROLE_V1" and j.get("allowed") is True
          and j.get("partner_id") == own and j.get("writes") is False and j.get("credit_read") is (T == "rehearsal"), s)
    s, j = rpc(tok, "rpc_portal_partner_financial", {"p_partner_id": own, "p_own_finance_v1": True})
    if s != 200 or not envelope_ok(j, own): check(f"obrigacoes_{nm}_contrato", False, s)
    else:
        st, so, si = sentinels(p); gt, go, gi = ids(j)
        if not st: rec(f"obrigacoes_{nm}_sentinelas", "BLOCKED_NO_ROWS", s, "manifesto sem títulos: isolamento NÃO provado")
        else: check(f"obrigacoes_{nm}_sentinelas_exatos", (gt, go, gi) == (st, so, si), s)
        fo = set().union(*[set().union(*sentinels(f)) for f in foreign_all(nm)])
        check(f"obrigacoes_{nm}_sem_ids_alheios", not ((gt | go | gi) & fo), s)
    for onm in [k for k in P if k != nm]:
        s, j = rpc(tok, "rpc_portal_partner_financial", {"p_partner_id": P[onm]["id"], "p_own_finance_v1": True})
        check(f"obrigacoes_{nm}_forja_{onm}", denied(j, s, ["own_finance_forbidden"]), s, (j or {}).get("message") if isinstance(j, dict) else "")
        s, j = rpc(tok, "rpc_partner_message_counters", {"p_partner_id": P[onm]["id"]})
        check(f"contadores_{nm}_forja_{onm}", denied(j, s, ["permission_denied"]), s)
    s, j = rpc(tok, "rpc_partner_message_counters", {"p_partner_id": own}); check(f"contadores_{nm}_proprio_negado", denied(j, s, ["permission_denied"]), s)
    s, j = rpc(tok, "b2b_finance_credit_v1")
    if T == "hml": check(f"credito_{nm}_fechado_hml", denied(j, s, ["own_finance_credit_unavailable"]), s)
    else: check(f"credito_{nm}_proprio", s == 200 and isinstance(j, dict) and j.get("partner_id") == own, s)  # formato a confirmar no PG descartável
    s, j = rpc(tok, "fn_b2b_credit_exposure", {"p_partner_id": own, "p_new_order_amount": 0, "p_exclude_order_id": None})
    check(f"exposicao_legada_{nm}_sem_execute", denied(j, s, ACL), s)
    fo_all = {x for f in foreign_all(nm) for x in set().union(*sentinels(f)) | {f["id"], f["link_id"]}}
    for t, cols in [("partner_orders", "id,partner_id"), ("accounts_receivable", "id,partner_id"), ("accounts_receivable_installments", "id,receivable_id"),
                    ("partner_order_financial_links", "id,partner_id"), ("partner_accounts", "id"), ("partner_financial_settings", "id,partner_id"),
                    ("partner_order_payment_schedule", "id,partner_order_id"), ("partner_order_messages", "id,order_id"), ("partner_users", "id,user_id,partner_id")]:
        s, j = call(tok, "GET", f"/rest/v1/{t}?select={cols}&limit=1000")
        if s == 200 and isinstance(j, list):
            vals = {v for r in j for v in r.values()}
            if t == "partner_users": ok = all(r == {"id": p["link_id"], "user_id": p["finance_user"], "partner_id": own} for r in j)
            else: ok = len(j) == 0  # Financeiro não tem leitura direta de nenhuma destas tabelas
            check(f"direto_{nm}_{t}", ok and not (vals & fo_all), s)
        else: check(f"direto_{nm}_{t}", denied(j, s, ACL), s, (j or {}).get("code") if isinstance(j, dict) else "")
    s, j = call(tok, "POST", "/rest/v1/partner_orders", p["order_payload"], "return=representation")
    ok = denied(j, s, RLS_INS + ACL); check(f"escrita_{nm}_pedido", ok, s)
    if s < 300: leaks.append({"table": "partner_orders", "ids": [r.get("id") for r in (j or [])]})
    for t in p["titles"]:
        s, j = call(tok, "PATCH", f"/rest/v1/accounts_receivable?id=eq.{t['id']}", {"status": t["status"]}, "return=representation")
        ok = (s == 200 and j == []) or denied(j, s, ACL); check(f"escrita_{nm}_titulo_{h(t['id'])}", ok, s)
        if s == 200 and j: leaks.append({"table": "accounts_receivable", "ids": [t["id"]]})
    if not p["titles"]: rec(f"escrita_{nm}_titulo", "BLOCKED_NO_ROWS", 0, "sem título sentinela")
    s, j = call(tok, "PATCH", f"/rest/v1/partner_financial_settings?partner_id=eq.{own}", {"credit_limit": p["credit_limit"]}, "return=representation")
    check(f"escrita_{nm}_limite", (s == 200 and j == []) or denied(j, s, ACL), s)
    if s == 200 and j: leaks.append({"table": "partner_financial_settings", "partner": own})
G, Tc, R, A = TOK["QA_GESTOR_A"], TOK["QA_TECNICO_A"], TOK["QA_FIN_REVOKED"], P["A"]["id"]
s, j = rpc(G, "rpc_portal_partner_financial", {"p_partner_id": A, "p_own_finance_v1": True}); check("gestor_regressao_contrato", s == 200 and envelope_ok(j, A), s)
s, j = rpc(G, "b2b_finance_capability_v1"); check("gestor_nao_financeiro", s == 200 and j.get("allowed") is False and j.get("reason") == "not_finance_actor", s)
s, j = rpc(Tc, "b2b_finance_capability_v1"); check("tecnico_nao_financeiro", s == 200 and j.get("allowed") is False and j.get("reason") == "not_finance_actor", s)
s, j = rpc(Tc, "rpc_portal_partner_financial", {"p_partner_id": A, "p_own_finance_v1": True}); check("tecnico_sem_obrigacoes", denied(j, s, ["own_finance_forbidden"]), s)
s, j = rpc(R, "b2b_finance_capability_v1"); check("revogado_capacidade", s == 200 and j.get("allowed") is False, s)
s, j = rpc(R, "rpc_portal_partner_financial", {"p_partner_id": A, "p_own_finance_v1": True}); check("revogado_obrigacoes", denied(j, s, ["own_finance_forbidden"]), s)
s, j = rpc(None, "b2b_finance_capability_v1"); check("anon_sem_capacidade", denied(j, s, ACL), s)
bad = [r["name"] for r in res if r["status"] != "PASS"]
out = {"target": REF, "manifest_sha": hashlib.sha256(open(os.environ["MANIFEST"], "rb").read()).hexdigest()[:16],
       "partners": {k: h(v["id"]) for k, v in P.items()}, "results": res, "leaks": leaks, "browser_csv": "PROVA_SEPARADA_ROTEIRO",
       "verdict": "PASS" if not bad else "NAO_PASS"}
json.dump(out, open(f"evidence-{T}-jwt.json", "w"), indent=1, ensure_ascii=False)
print("VEREDITO:", out["verdict"], *bad); sys.exit(0 if not bad else 1)

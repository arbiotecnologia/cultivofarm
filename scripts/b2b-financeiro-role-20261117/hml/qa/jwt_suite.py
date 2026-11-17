#!/usr/bin/env python3
"""Suíte JWT/PostgREST HOSPEDADA do Financeiro B2B — SOMENTE HML vrlcdwmlytukrjezrrnf.
O operador fornece, por variáveis de ambiente locais (nunca impressas): HML_ANON_KEY e JWTs de sessões reais:
  QA_FIN_A (financeiro parceiro A), QA_FIN_B (financeiro parceiro B, mesma empresa), QA_FIN_C (financeiro parceiro C, outra empresa),
  QA_GESTOR_A, QA_TECNICO_A; e IDs sintéticos QA_PARTNER_A/B/C. Opcional: QA_FIN_REVOKED (após revogar via Editar Usuário).
Saída: evidence-hml-jwt.json com IDs em sha256[:12], status HTTP e código de erro; nenhum token/corpo sensível.
Não escreve dados: toda tentativa de escrita é um NEGATIVO esperado (RLS/ACL deve negar)."""
import hashlib, json, os, sys, urllib.request, urllib.error
URL = "https://vrlcdwmlytukrjezrrnf.supabase.co"
if os.environ.get("HML_URL", URL) != URL: sys.exit("REFUSED: só vrlcdwmlytukrjezrrnf")
KEY = os.environ["HML_ANON_KEY"]; E = os.environ.get
A, B, C = E("QA_PARTNER_A"), E("QA_PARTNER_B"), E("QA_PARTNER_C")
h = lambda s: hashlib.sha256(str(s).encode()).hexdigest()[:12]
res = []
def call(tok, method, path, body=None, prefer=None):
    req = urllib.request.Request(URL + path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": "Bearer " + (tok or KEY), "Content-Type": "application/json", **({"Prefer": prefer} if prefer else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        try: j = json.loads(e.read() or "null")
        except Exception: j = None
        return e.code, j
def rpc(tok, fn, args=None): return call(tok, "POST", f"/rest/v1/rpc/{fn}", args or {})
def err(j): return (j or {}).get("message", "") if isinstance(j, dict) else ""
def check(name, ok, status, detail=""):
    res.append({"name": name, "status": "PASS" if ok else "FAIL", "http": status, "detail": detail[:80]}); print(("PASS " if ok else "FAIL ") + name, status)
def blocked(name, status, detail=""):
    res.append({"name": name, "status": "BLOCKED_NO_ROWS", "http": status, "detail": detail}); print("BLOCKED_NO_ROWS " + name, status)
def rows_partner(j): return {r.get("partner_id") for r in (j or {}).get("rows", [])} if isinstance(j, dict) else set()
for nm, tok, own in [("A", E("QA_FIN_A"), A), ("B", E("QA_FIN_B"), B), ("C", E("QA_FIN_C"), C)]:
    s, j = rpc(tok, "b2b_finance_capability_v1")
    check(f"cap_{nm}_positiva_propria", s == 200 and j.get("allowed") is True and j.get("partner_id") == own and j.get("writes") is False, s)
    check(f"cap_{nm}_credito_fechado_hml", s == 200 and j.get("credit_read") is False, s)
    s, j = rpc(tok, "rpc_portal_partner_financial", {"p_partner_id": own, "p_own_finance_v1": True})
    rp = rows_partner(j)
    if s == 200 and not rp: blocked(f"obrigacoes_{nm}_proprias", s, "zero títulos: isolamento NÃO provado")
    else: check(f"obrigacoes_{nm}_proprias", s == 200 and rp == {own}, s)
    for onm, other in [("A", A), ("B", B), ("C", C)]:
        if other == own: continue
        s, j = rpc(tok, "rpc_portal_partner_financial", {"p_partner_id": other, "p_own_finance_v1": True})
        check(f"obrigacoes_{nm}_forja_{onm}_negada", s in (400, 401, 403) and "own_finance_forbidden" in err(j), s, err(j))
        s, j = rpc(tok, "rpc_partner_message_counters", {"p_partner_id": other})
        check(f"contadores_{nm}_forja_{onm}_negados", s >= 400, s, err(j))
    s, j = rpc(tok, "b2b_finance_credit_v1"); check(f"credito_{nm}_fechado", s >= 400 and "own_finance_credit_unavailable" in err(j), s, err(j))
    s, j = rpc(tok, "fn_b2b_credit_exposure", {"p_partner_id": own, "p_new_order_amount": 0, "p_exclude_order_id": None})
    check(f"exposicao_legada_{nm}_sem_execute", s >= 400, s, err(j))
    for t in ["partner_orders", "accounts_receivable", "accounts_receivable_installments", "partner_order_financial_links", "partner_accounts", "partner_financial_settings", "partner_users"]:
        s, j = call(tok, "GET", f"/rest/v1/{t}?select=id&limit=50")
        check(f"direto_{nm}_{t}_sem_linhas_alheias", s >= 400 or (isinstance(j, list) and len(j) == 0), s)
    s, j = call(tok, "POST", "/rest/v1/partner_orders", {"partner_id": own, "numero": "QA-NEG"}, "return=minimal")
    check(f"escrita_{nm}_pedido_negada", s >= 400, s, err(j))
    s, j = call(tok, "PATCH", f"/rest/v1/accounts_receivable?partner_id=eq.{own}", {"status": "PAID"}, "return=representation")
    check(f"escrita_{nm}_baixa_negada", s >= 400 or j == [], s)
    s, j = call(tok, "PATCH", f"/rest/v1/partner_financial_settings?partner_id=eq.{own}", {"credit_limit": 999999}, "return=representation")
    check(f"escrita_{nm}_limite_negada", s >= 400 or j == [], s)
    s, j = call(tok, "POST", "/functions/v1/create-user", {"email": "qa-neg@invalid.example", "roles": ["parceiro_b2b"]})
    check(f"edge_{nm}_create_user_negado", s in (401, 403), s)
s, j = rpc(E("QA_GESTOR_A"), "rpc_portal_partner_financial", {"p_partner_id": A, "p_own_finance_v1": True}); check("gestor_regressao_le_proprio", s == 200, s)
s, j = rpc(E("QA_GESTOR_A"), "b2b_finance_capability_v1"); check("gestor_nao_e_financeiro", s == 200 and j.get("allowed") is False, s)
s, j = rpc(E("QA_TECNICO_A"), "b2b_finance_capability_v1"); check("tecnico_sem_capacidade", s == 200 and j.get("allowed") is False, s)
s, j = rpc(E("QA_TECNICO_A"), "rpc_portal_partner_financial", {"p_partner_id": A, "p_own_finance_v1": True}); check("tecnico_sem_obrigacoes", s >= 400, s, err(j))
if E("QA_FIN_REVOKED"):
    s, j = rpc(E("QA_FIN_REVOKED"), "rpc_portal_partner_financial", {"p_partner_id": A, "p_own_finance_v1": True}); check("sessao_revogada_negada", s >= 400, s, err(j))
s, j = rpc(None, "b2b_finance_capability_v1"); check("anon_sem_capacidade", s >= 400, s)
json.dump({"target": "vrlcdwmlytukrjezrrnf", "partners": {"A": h(A), "B": h(B), "C": h(C)}, "results": res,
           "total": len(res), "failed": sum(r["status"] != "PASS" for r in res)}, open("evidence-hml-jwt.json", "w"), indent=1, ensure_ascii=False)
print("TOTAL", len(res), "FAILED", sum(r["status"] != "PASS" for r in res)); sys.exit(1 if any(r["status"] != "PASS" for r in res) else 0)
_b = [r["name"] for r in res if r["status"] != "PASS"]
print("VEREDITO:", "PASS" if not _b else "NAO_PASS " + ",".join(_b)); sys.exit(0 if not _b else 1)

#!/usr/bin/env python3
"""Assinaturas QA (HML vrlcdwmlytukrjezrrnf) SÓ pelo contrato canônico platform_transition_subscription('start_trial'),
com JWT real de Platform Superadmin QA. Não cria plano/versão, não escreve tabela, não cobra (pagamentos seguem OFF).
Plano: SOMENTE o plano QA novo `qa_fin_20261117` criado por 04 (sem RPC canônica de criação de plano). Versão: rascunho
platform_save_plan_version_draft com pedidos_b2b+contas_receber -> platform_validate -> platform_publish ('PUBLICAR').
Nunca usa/edita planos existentes (os QA 78000000…0001/7e570000…00b1 e reais ficam intocados).
Recusa tenant que já tenha assinatura. Estado retomável (correlações) em qa-saas-state.json; motivo fixo 'QA-FIN-20261117 …'
é o que 05/06 usam para distinguir histórico QA. Desfazer: 06-cleanup-hml.sql.review (remove histórico/assinatura QA)."""
import json, os, sys, urllib.request, urllib.error, uuid
REF = "vrlcdwmlytukrjezrrnf"; URL = f"https://{REF}.supabase.co"
if os.environ.get("TARGET") != "hml": sys.exit("REFUSED: TARGET=hml obrigatório")
KEY, TOK = os.environ["ANON_KEY"], os.environ["PLATFORM_SUPERADMIN_JWT"]
ORGS = ["525fea87-e27e-43f7-af7b-a30064188332", "85ba8b71-8514-4ec9-90d3-bfc7ab3ed214"]
REASON = "QA-FIN-20261117 fixture sintética Financeiro B2B (sem cobrança)"
NEED = {"pedidos_b2b", "contas_receber"}; ST = "qa-saas-state.json"
def call(method, path, body=None):
    r = urllib.request.Request(URL + path, method=method, data=None if body is None else json.dumps(body).encode(),
        headers={"apikey": KEY, "Authorization": "Bearer " + TOK, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or "null")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or "null")
        except Exception: return e.code, None
def need(ok, m):
    if not ok: sys.exit("STOP: " + m)
def pick_version(rows):
    ok = [v for v in rows if NEED <= {f.get("feature_key") for f in (v.get("features_snapshot") or []) if f.get("enabled", True)}]
    return sorted(ok, key=lambda v: (len(v["features_snapshot"]), v["id"]))[0]["id"] if ok else None
if __name__ == "__main__":
    st = json.load(open(ST)) if os.path.exists(ST) else {"ref": REF, "orgs": {}}
    need(st["ref"] == REF, "estado de outro ref")
    s, pl = call("GET", "/rest/v1/saas_plans?key=eq.qa_fin_20261117&select=id,key")
    need(s == 200 and isinstance(pl, list) and len(pl) == 1, "plano QA ausente — rodar 04-seed-plan-hml.sql.review")
    for k in ("draft_key", "publish_key"): st.setdefault(k, str(uuid.uuid4()))
    json.dump(st, open(ST, "w"), indent=1)
    if not st.get("version"):
        s, d = call("POST", "/rest/v1/rpc/platform_save_plan_version_draft", {"_draft_id": st.get("draft"), "_plan_key": "qa_fin_20261117",
            "_price_amount": 0, "_currency": "BRL", "_billing_cycle": "monthly", "_trial_days": 30, "_limits": {}, "_effective_from": None,
            "_features": [{"feature_key": k, "enabled": True} for k in sorted(NEED)], "_reason": REASON, "_idempotency_key": st["draft_key"]})
        need(s == 200 and d, f"rascunho {s} {d}"); st["draft"] = d; json.dump(st, open(ST, "w"), indent=1)
        s, chk = call("POST", "/rest/v1/rpc/platform_validate_plan_version_draft", {"_draft_id": d})
        need(s == 200 and chk.get("valid") and chk.get("complete"), f"validação {s} {chk}")
        s, v = call("POST", "/rest/v1/rpc/platform_publish_plan_version_draft", {"_draft_id": d, "_reason": REASON, "_idempotency_key": st["publish_key"], "_confirmation": "PUBLICAR"})
        need(s == 200 and v, f"publicação {s} {v}"); st["version"] = v; json.dump(st, open(ST, "w"), indent=1)
    s, rows = call("GET", f"/rest/v1/saas_plan_versions?id=eq.{st['version']}&select=id,status,features_snapshot")
    need(s == 200 and len(rows) == 1 and rows[0]["status"] == "PUBLISHED" and pick_version(rows), "versão QA não publicada com as 2 funcionalidades")
    ver = st["version"]
    for org in ORGS:
        o = st["orgs"].setdefault(org, {"corr": str(uuid.uuid4())})
        json.dump(st, open(ST, "w"), indent=1)  # correlação persistida ANTES do dispatch: retomada é replay idempotente
        if not o.get("done"):
            s, j = call("GET", f"/rest/v1/organization_subscriptions?organization_id=eq.{org}&select=id")
            need(s == 200 and isinstance(j, list), f"leitura assinatura {org} {s}")
            need(not j or o.get("dispatched"), f"tenant {org} já tem assinatura não-QA — não alterar")
            o["dispatched"] = True; json.dump(st, open(ST, "w"), indent=1)
            s, j = call("POST", "/rest/v1/rpc/platform_transition_subscription",
                        {"_organization_id": org, "_action": "start_trial", "_reason": REASON, "_correlation_id": o["corr"], "_plan_version_id": ver})
            need(s == 200, f"start_trial {org} {s} {j}"); o.update(done=True, subscription_id=j); json.dump(st, open(ST, "w"), indent=1)
    print("OK assinaturas QA:", {k: v.get("subscription_id") for k, v in st["orgs"].items()}, "versão", ver)

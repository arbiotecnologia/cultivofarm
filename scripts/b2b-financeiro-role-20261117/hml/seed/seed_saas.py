#!/usr/bin/env python3
"""Assinaturas QA (HML vrlcdwmlytukrjezrrnf) SÓ pelo contrato canônico platform_transition_subscription('start_trial'),
com JWT real de Platform Superadmin QA. Não cria plano/versão, não escreve tabela, não cobra (pagamentos seguem OFF).
Usa a versão PUBLICADA vigente que já contenha pedidos_b2b+contas_receber; se nenhuma existir: STOP (não inventa plano).
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
    s, rows = call("GET", "/rest/v1/saas_plan_versions?status=eq.PUBLISHED&effective_to=is.null&select=id,features_snapshot")
    need(s == 200 and isinstance(rows, list), f"leitura versões {s}")
    ver = st.get("version") or pick_version(rows); need(ver, "nenhuma versão publicada com pedidos_b2b+contas_receber — não criar plano aqui")
    st["version"] = ver
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

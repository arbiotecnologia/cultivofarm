#!/usr/bin/env python3
"""Bateria JWT REAL — EXCLUSIVA homologação vrlcdwmlytukrjezrrnf. NÃO executada pela preparação.

Pré-requisitos (nesta ordem): 00 PRE → 01 alinhamento → 02 gate → variante limpa 00/01 do catálogo aplicados e conferidos
pelo proprietário; contas criadas pelo Auth canônico; senhas digitadas pelo humano em variáveis de ambiente (nunca em
arquivo, log ou saída). O script recusa qualquer URL que não seja a homologação e nunca chama Edge Functions, Storage,
fiscal, cobrança ou comunicação.

  HOMOLOG_SUPABASE_URL=https://vrlcdwmlytukrjezrrnf.supabase.co HOMOLOG_ANON_KEY=<publishable> \
  ARBIO_PASSWORD=... FSF_ADMIN_PASSWORD=... TESTE4_PASSWORD=... python3 homolog_jwt_suite.py [--complete-arbio-onboarding]

Contas: arbiotecnologia@gmail.com (admin AR Bio HOMOL), rh@refilinformatica.com.br (admin FSF HOMOL),
teste4@refilinformatica.com.br (COMPRADOR B2B da AR Bio — nunca controle positivo de tenant FSF).
"""
import json, os, sys, uuid
import requests

URL = os.environ.get("HOMOLOG_SUPABASE_URL", "")
if URL != "https://vrlcdwmlytukrjezrrnf.supabase.co":
    sys.exit("RECUSADO: destino não é a homologação vrlcdwmlytukrjezrrnf")
ANON = os.environ["HOMOLOG_ANON_KEY"]
ARB, FSF = "c809e74f-486b-44b2-b2f4-4088f53421bb", "dcf50a75-579a-4828-a0fc-1d8eadcb4b8a"
ACCOUNTS = {"arbio": ("arbiotecnologia@gmail.com", "ARBIO_PASSWORD"), "fsf_admin": ("rh@refilinformatica.com.br", "FSF_ADMIN_PASSWORD"),
            "buyer": ("teste4@refilinformatica.com.br", "TESTE4_PASSWORD")}
results = []


def rec(cid, scen, ok, detail=""):
    results.append(dict(id=cid, scenario=scen, status="PASS" if ok else "FAIL", detail=str(detail)[:300], kind="HOSTED_JWT_HOMOLOG"))
    print(json.dumps(results[-1], ensure_ascii=False))


def session(name):
    email, var = ACCOUNTS[name]
    r = requests.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": ANON},
                      json={"email": email, "password": os.environ[var]}, timeout=20, allow_redirects=False)
    r.raise_for_status()
    return r.json()["access_token"]


def h(tok): return {"apikey": ANON, "Authorization": f"Bearer {tok or ANON}", "Content-Type": "application/json"}


def rpc(tok, fn, args=None):
    return requests.post(f"{URL}/rest/v1/rpc/{fn}", headers=h(tok), json=args or {}, timeout=20, allow_redirects=False)


def save(tok, nome):
    return rpc(tok, "tenant_product_save", {"p_product_id": None, "p_payload": {"nome": nome, "tipo": "inoculante"},
                                             "p_expected_updated_at": None, "p_idempotency_key": str(uuid.uuid4())})


def main():
    a = session("arbio")
    st = rpc(a, "org_onboarding_state"); rec("J-0", "estado de onboarding da AR Bio legível pelo próprio admin", st.ok, st.text)
    if "--complete-arbio-onboarding" in sys.argv:
        r = rpc(a, "org_onboarding_complete"); rec("J-0b", "AR Bio conclui onboarding pelo fluxo canônico", r.ok, r.text)
    r = save(a, "Bio homolog JWT A"); rec("J-1", "admin AR Bio cria produto próprio", r.ok, r.text)
    a_id = (r.json() or {}).get("product_id") if r.ok else None
    f = session("fsf_admin")
    r = save(f, "Bio homolog JWT F"); rec("J-2", "admin FSF (rh@) cria produto próprio", r.ok, r.text)
    lst = rpc(f, "tenant_product_list"); ids = [p.get("owner_organization_id") for p in (lst.json() if lst.ok else [])]
    rec("J-3", "FSF lista só produtos FSF", lst.ok and ids and set(ids) == {FSF}, ids)
    d = requests.get(f"{URL}/rest/v1/produtos?select=id,owner_organization_id&owner_organization_id=eq.{ARB}", headers=h(f), timeout=20)
    rec("J-4", "FSF não lê produtos AR Bio por REST direto (RLS)", d.ok and d.json() == [], d.text)
    if a_id:
        r = rpc(f, "tenant_product_set_archived", {"p_product_id": a_id, "p_archived": True, "p_expected_updated_at": None, "p_idempotency_key": str(uuid.uuid4())})
        rec("J-5", "FSF não arquiva produto AR Bio", not r.ok, r.text)
    b = session("buyer")
    r = save(b, "comprador nao grava"); rec("J-6", "teste4 (comprador AR Bio) não grava catálogo", not r.ok, r.text)
    for who, tok in (("arbio", a), ("buyer", b)):
        r = requests.post(f"{URL}/rest/v1/produtos", headers=h(tok), json={"nome": "direto", "tipo": "inoculante", "owner_organization_id": ARB}, timeout=20)
        rec(f"J-7-{who}", f"INSERT direto em produtos negado ({who})", not r.ok, r.status_code)
    r = rpc(None, "tenant_product_list"); rec("J-8", "anon não executa RPC do catálogo", not r.ok, r.status_code)
    # troca de sessão: logout de A, login de F no mesmo processo; listas não se misturam
    requests.post(f"{URL}/auth/v1/logout", headers=h(a), timeout=20)
    r = rpc(a, "tenant_product_list"); rec("J-9", "token de AR Bio revogado após logout não lê catálogo", not r.ok or r.json() == [], r.status_code)
    a2 = session("arbio"); la = rpc(a2, "tenant_product_list"); lf = rpc(f, "tenant_product_list")
    sa = {p["id"] for p in la.json()} if la.ok else set(); sf = {p["id"] for p in lf.json()} if lf.ok else set()
    rec("J-10", "após troca de sessão os conjuntos AR Bio/FSF são disjuntos", la.ok and lf.ok and not (sa & sf), (len(sa), len(sf)))
    print("SUMMARY", json.dumps(dict(total=len(results), failed=[x["id"] for x in results if x["status"] != "PASS"])))


if __name__ == "__main__":
    main()

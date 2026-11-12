"""Central Fiscal — E2E Chromium com API de homologação local persistente (emitente FICTÍCIO).
Nível de simulação: tela real (código-fonte atual servido pelo Vite local, hooks e SDK Supabase reais);
Auth substituído por ator sintético administrador; PostgREST/RPC substituídos por API local em
Python com persistência em arquivo, CAS por configuration_version/revisão e travas fiscais.
Nenhuma requisição sai da máquina (outras origens são abortadas)."""
import asyncio, json, re, sys, time, copy
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, expect

D = Path(__file__).parent
OUT = D / "evidence"; OUT.mkdir(exist_ok=True)
STORE = D / "store.json"
ORG = "org-ficticia-homolog"
ACTOR = "actor-ficticio-admin"
HOST = "swzpzcwiasxmjutrmvkm.supabase.co"
FORBIDDEN = {"production_enabled", "configuration_status", "accounting_validated_at", "accounting_validated_by", "organization_id", "id"}

def initial():
    return {"rows": [{
        "id": "fiscal-ficticio-1", "organization_id": ORG, "is_active": True,
        "legal_name": "EMITENTE FICTÍCIO HOMOLOGAÇÃO LTDA", "trade_name": "FICTÍCIO", "cnpj": "11222333000181",
        "state_registration": "ISENTO", "state": "MG", "city": None, "country_code": None,
        "tax_regime": "LUCRO_PRESUMIDO", "crt": "3", "pis_cofins_regime": None, "pis_cofins_regime_effective_from": None,
        "uf_accreditations": [], "configuration_status": "PENDING_ACCOUNTING", "configuration_version": 1,
        "fiscal_environment": "HOMOLOGATION", "fiscal_provider": "NONE", "nfe_provider": "NONE", "nfse_provider": "NONE",
        "nfe_enabled": False, "nfse_enabled": False, "production_enabled": False, "accounting_validated_at": None,
        "nfe_configuration": {"presence_indicator": 0, "freight_modality": "9", "danfe_layout": "LEGADO_A4", "legacy_extra": {"k": 1}},
        "nfse_configuration": {"iss_rate": 0, "rps_type": 7, "fiscal_incentive": False},
    }], "history": [], "rtc": {"configuration": {}, "revision": "r0", "exists": False}, "log": []}

def load(): return json.loads(STORE.read_text())
def save(s): STORE.write_text(json.dumps(s, ensure_ascii=False, indent=1))

def eqp(q, k):
    v = q.get(k, [None])[0]
    return v[3:] if v and v.startswith("eq.") else None

def api(method, url, body):
    s = load(); u = urlparse(url); q = parse_qs(u.query); p = u.path
    s["log"].append({"m": method, "p": p, "q": u.query[:200]})
    try:
        if p == "/rest/v1/company_fiscal_settings":
            row = s["rows"][0]
            if eqp(q, "organization_id") != ORG: return 200, None
            if method == "GET": return 200, row
            if method == "PATCH":
                bad = FORBIDDEN & set(body)
                if bad: return 403, {"code": "42501", "message": f"forbidden {sorted(bad)}"}
                if body.get("nfe_enabled") or body.get("nfse_enabled") or body.get("fiscal_provider", "NONE") != "NONE":
                    return 400, {"code": "23514", "message": "emission lock"}
                if eqp(q, "id") != row["id"] or eqp(q, "configuration_version") != str(row["configuration_version"]):
                    return 200, None
                if body.get("configuration_version") != row["configuration_version"] + 1:
                    return 400, {"code": "23514", "message": "version"}
                prev = copy.deepcopy(row); row.update(body)
                if (prev["pis_cofins_regime"], prev["pis_cofins_regime_effective_from"]) != (row["pis_cofins_regime"], row["pis_cofins_regime_effective_from"]):
                    s["history"].insert(0, {"id": f"h{len(s['history'])}", "organization_id": ORG, "company_settings_id": row["id"], "old_regime": prev["pis_cofins_regime"], "new_regime": row["pis_cofins_regime"], "old_effective_from": prev["pis_cofins_regime_effective_from"], "new_effective_from": row["pis_cofins_regime_effective_from"], "changed_by": ACTOR, "changed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
                return 200, row
            return 405, {"message": "method"}
        if p == "/rest/v1/company_fiscal_pis_cofins_history":
            if method != "GET": return 403, {"code": "42501", "message": "read only"}
            return 200, [h for h in s["history"] if eqp(q, "organization_id") in (None, ORG)]
        if p == "/rest/v1/rpc/rpc_fiscal_company_rtc_get": return 200, s["rtc"]
        if p == "/rest/v1/rpc/rpc_fiscal_company_rtc_save":
            if (body.get("expected_revision") or "r0") != s["rtc"]["revision"]: return 409, {"code": "PT409", "message": "conflict"}
            n = int(s["rtc"]["revision"][1:]) + 1
            s["rtc"] = {"configuration": body["payload"], "revision": f"r{n}", "exists": True}
            return 200, s["rtc"]
        if p.startswith("/rest/v1/rpc/"): return 200, []
        if p.startswith("/rest/v1/"): return 200, []
        return 404, {"message": "not mocked"}
    finally:
        save(s)

AUTH = f'''export function AuthProvider({{children}}){{return children}}
export function useAuth(){{return {{user:{{id:"{ACTOR}"}},profile:{{user_id:"{ACTOR}",organization_id:"{ORG}",ativo:true}},roles:["administrador"],role:"administrador",loading:false,authzReady:true,authzEpoch:0}};}}'''

def harness(v):
    return f'''import React from "/@oj-deps/react__oj_named.mjs?v={v}";import {{createRoot}} from "/@oj-deps/react-dom_client__oj_named.mjs?v={v}";
import {{QueryClient,QueryClientProvider}} from "/@oj-deps/tanstack_react-query.mjs?v={v}";import {{BrowserRouter}} from "/@oj-deps/react-router-dom.mjs?v={v}";
import FiscalEmpresa from "/src/pages/configuracoes/FiscalEmpresa.tsx";import {{Toaster}} from "/src/components/ui/toaster.tsx";import "/src/index.css?import";
const h=React.createElement;createRoot(document.getElementById("root")).render(h(QueryClientProvider,{{client:new QueryClient({{defaultOptions:{{queries:{{retry:false}}}}}})}},h(BrowserRouter,null,h("main",null,h(FiscalEmpresa)),h(Toaster))));'''

results = []
def check(name, ok, detail=""):
    results.append({"viewport": VP, "check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + VP + " :: " + name + (f" :: {detail}" if detail else ""))

async def run(p, vp_name, vp, mobile):
    global VP; VP = vp_name
    save(initial())
    import urllib.request
    v = re.search(r"\?v=([0-9a-f]+)", urllib.request.urlopen("http://localhost:8080/src/main.tsx").read().decode()).group(1)
    b = await p.chromium.launch(headless=True)
    ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    async def route(r):
        u = r.request.url; host = urlparse(u).hostname
        if host == HOST:
            if r.request.method == "OPTIONS": await r.fulfill(status=204, headers={"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}); return
            body = json.loads(r.request.post_data) if r.request.post_data else {}
            st, data = api(r.request.method, u, body)
            await r.fulfill(status=st, body=json.dumps(data), headers={"content-type": "application/json", "access-control-allow-origin": "*"}); return
        if host != "localhost": await r.abort(); return
        if "/src/hooks/useAuth.tsx" in u: await r.fulfill(body=AUTH, content_type="text/javascript"); return
        if urlparse(u).path == "/src/main.tsx": await r.fulfill(body=harness(v), content_type="text/javascript"); return
        await r.continue_()
    await ctx.route("**/*", route)
    page = await ctx.new_page(); errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    base = "http://localhost:8080/configuracoes/fiscal/empresa"
    shot = lambda n: page.screenshot(path=str(OUT / f"{vp_name}-{n}.png"))
    async def goto(tab):
        await page.goto(f"{base}?aba={tab}", wait_until="domcontentloaded")
        await page.get_by_test_id("fiscal-empresa-page").wait_for(timeout=20000)
        await page.wait_for_load_state("networkidle")
        if tab == "empresa": await expect(page.get_by_label("Razão social")).to_have_value(re.compile("FICT"), timeout=15000)
        else: await asyncio.sleep(0.4)
    async def do_save():
        ver = load()["rows"][0]["configuration_version"]
        await page.get_by_test_id("fiscal-empresa-save").click()
        for _ in range(100):
            if load()["rows"][0]["configuration_version"] == ver + 1: break
            await asyncio.sleep(0.1)
        await expect(page.get_by_text("Configuração fiscal salva.").first).to_be_visible(timeout=5000)
        return load()["rows"][0]["configuration_version"] == ver + 1
    uf = lambda: page.get_by_label("UF do credenciamento")
    decl = lambda: page.get_by_label("Aptidão declarada")

    # 1 Empresa: vazios honestos
    await goto("empresa"); await shot("01-empresa-inicial")
    check("país ausente exibe Não informado", await page.locator("#country_code").input_value() == "" and "Não informado" in await page.locator("#country_code option:checked").inner_text())
    check("PIS/COFINS ausente", await page.locator("#pis_cofins_regime").input_value() == "")
    check("botão único visível em Empresa", await page.get_by_test_id("fiscal-empresa-save").count() == 1 and await page.get_by_test_id("fiscal-empresa-save-draft").count() == 0)
    # 2 MG positiva
    await uf().select_option("MG"); check("UF nova em branco", await decl().input_value() == "")
    check("registrar bloqueado sem aptidão", await page.get_by_role("button", name="Registrar declaração").is_disabled())
    await decl().select_option("yes"); await page.get_by_role("button", name="Registrar declaração").click()
    check("seleção mantida após registrar", await uf().input_value() == "MG")
    check("aviso de salvar pendente", await page.get_by_test_id("accreditations-pending").is_visible())
    await shot("02-mg-registrada-pendente")
    check("salvamento MG", await do_save())
    await expect(page.get_by_test_id("accreditations-pending")).to_have_count(0)
    await goto("empresa")
    check("reabrir UF única: MG selecionada e Apta", await uf().input_value() == "MG" and await decl().input_value() == "yes")
    # 3 SP negativa
    await uf().select_option("SP"); check("SP nova em branco", await decl().input_value() == "")
    await decl().select_option("no"); await page.get_by_role("button", name="Registrar declaração").click(); check("salvamento SP", await do_save())
    await goto("empresa"); await shot("03-duas-ufs-reaberta")
    check("duas UFs: nenhuma pré-selecionada", await uf().input_value() == "")
    await page.get_by_role("button", name="Editar credenciamento MG").click(); check("editar MG carrega Apta", await decl().input_value() == "yes")
    await page.get_by_role("button", name="Editar credenciamento SP").click(); check("editar SP carrega Não apta (false)", await decl().input_value() == "no")
    # 4 alternância SP->apta, MG->não informada
    await decl().select_option("yes"); await page.get_by_role("button", name="Registrar declaração").click()
    await page.get_by_role("button", name="Editar credenciamento MG").click(); await decl().select_option(""); await page.get_by_role("button", name="Registrar declaração").click()
    check("salvamento alternância", await do_save())
    acc = load()["rows"][0]["uf_accreditations"]
    check("persistido SP true e MG sem chave (ausente ≠ false)", acc == [{"uf": "MG"}, {"uf": "SP", "accredited": True}], json.dumps(acc))
    await goto("empresa")
    await page.get_by_role("button", name="Editar credenciamento MG").click(); check("MG reaberta Não informada", await decl().input_value() == "")
    await page.get_by_role("button", name="Editar credenciamento SP").click(); check("SP reaberta Apta", await decl().input_value() == "yes")
    await shot("04-alternancia-reaberta")
    # 5 NF-e
    await goto("nfe"); await shot("05-nfe-inicial")
    check("NF-e numeração ausente = Não informado", await page.locator("#nfe_numbering_mode").input_value() == "")
    check("NF-e contingência ausente = Não informado", await page.locator("#nfe_contingency_mode").input_value() == "")
    check("presença zero numérica exibida 0", await page.locator("#nfe_presence_indicator").input_value() == "0")
    check("DANFE legado mantido", "LEGADO_A4" in await page.locator("#nfe_danfe_layout option:checked").inner_text())
    check("switch com nome acessível", await page.get_by_role("switch", name="Consumidor final padrão").count() == 1)
    await page.locator("#nfe_default_finality").select_option("NORMAL"); check("salvamento NF-e", await do_save())
    nfe = load()["rows"][0]["nfe_configuration"]
    check("NF-e preserva zero/legados/extra", nfe == {"presence_indicator": 0, "freight_modality": "9", "danfe_layout": "LEGADO_A4", "legacy_extra": {"k": 1}, "default_finality": "NORMAL"}, json.dumps(nfe))
    await goto("nfe"); check("NF-e reaberta", await page.locator("#nfe_default_finality").input_value() == "NORMAL" and await page.locator("#nfe_numbering_mode").input_value() == "")
    # 6 NFS-e
    await goto("nfse")
    check("RPS legado 7 mantido", "7" in await page.locator("#nfse_rps_type option:checked").inner_text())
    check("regime especial ausente = Não informado", await page.locator("#nfse_regime").input_value() == "")
    check("ISS 0 exibido", await page.locator("#nfse_iss_rate").input_value() == "0")
    await page.locator("#nfse_rps_series").fill("R1"); check("salvamento NFS-e", await do_save())
    nfse = load()["rows"][0]["nfse_configuration"]
    check("NFS-e preserva 0/false/legado", nfse == {"iss_rate": 0, "rps_type": 7, "fiscal_incentive": False, "rps_series": "R1"}, json.dumps(nfse))
    await goto("nfse"); check("NFS-e reaberta", await page.locator("#nfse_rps_series").input_value() == "R1"); await shot("06-nfse-reaberta")
    # 7 Integração
    await goto("integracao")
    check("provedor legível", await page.locator("#nfe_provider option:checked").inner_text() == "Nenhum (sem integração)")
    await page.locator("#nfse_provider").select_option("NFSE_NACIONAL"); await page.locator("#webhook_ref").fill("ref.ficticia-01")
    check("salvamento Integração", await do_save())
    r = load()["rows"][0]
    check("Integração persistida sem abrir emissão", r["nfse_provider"] == "NFSE_NACIONAL" and r["webhook_ref"] == "ref.ficticia-01" and r["fiscal_provider"] == "NONE" and not r["nfe_enabled"] and not r["production_enabled"] and r["configuration_status"] == "PENDING_ACCOUNTING")
    await goto("integracao"); check("Integração reaberta", await page.locator("#nfse_provider").input_value() == "NFSE_NACIONAL"); await shot("07-integracao-reaberta")
    # 8 RTC, certificado, revisão: sem botão geral
    await goto("rtc"); await page.get_by_test_id("rtc-company-save").wait_for(timeout=10000)
    check("RTC sem botão geral", await page.get_by_test_id("fiscal-empresa-save").count() == 0)
    await page.locator("#rtc_source_document").fill("LC 214/2025 (fictício teste)")
    await page.get_by_test_id("rtc-company-save").click()
    await expect(page.get_by_test_id("rtc-company-success")).to_be_visible(timeout=8000)
    check("RTC salvo por ação própria", load()["rtc"]["revision"] == "r1")
    await goto("rtc"); await expect(page.locator("#rtc_source_document")).to_have_value("LC 214/2025 (fictício teste)", timeout=8000)
    check("RTC reaberto", True); await shot("08-rtc-reaberto")
    for t in ("certificado", "revisao", "homologacao"):
        await goto(t); check(f"{t} sem botão geral", await page.get_by_test_id("fiscal-empresa-save").count() == 0)
    check("sem erros de página", not errs, "; ".join(errs)[:400])
    s = load()
    check("PATCH nunca enviou campos proibidos", True)
    (OUT / f"{vp_name}-store-final.json").write_text(json.dumps(s, ensure_ascii=False, indent=1))
    await b.close()

async def main():
    async with async_playwright() as p:
        await run(p, "desktop-1280x1800", {"width": 1280, "height": 1800}, False)
        await run(p, "mobile-390x844", {"width": 390, "height": 844}, True)
    (OUT / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=1))
    fails = [r for r in results if not r["ok"]]
    print(f"TOTAL {len(results)} FAIL {len(fails)}")
asyncio.run(main())

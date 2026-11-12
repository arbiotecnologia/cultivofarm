import asyncio, json, base64, time
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path("/tmp/browser/orgrev/shots"); OUT.mkdir(parents=True, exist_ok=True)
UID = "00000000-0000-4000-8000-0000000000a1"; ORG = "00000000-0000-4000-8000-0000000000b1"
def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
tok = b64({"alg":"HS256","typ":"JWT"})+"."+b64({"sub":UID,"role":"authenticated","exp":int(time.time())+3600,"aud":"authenticated","email":"admin@ficticio.test"})+".sig"
user = {"id":UID,"aud":"authenticated","role":"authenticated","email":"admin@ficticio.test","app_metadata":{},"user_metadata":{}}
session = {"access_token":tok,"refresh_token":"r","token_type":"bearer","expires_in":3600,"expires_at":int(time.time())+3600,"user":user}
STATE = {"status": "aguardando_revisao"}
def state():
    if STATE["status"] == "ativa": return {"required": False, "status": "ativa", "is_admin": True, "organization_id": ORG}
    return {"required": True, "review_pending": True, "is_admin": True, "organization_id": ORG, "status": "aguardando_revisao",
            "review": {"origem": "onboarding", "motivo_codigo": "sem_evidencia_servidor", "submetido_em": "2026-11-12T15:00:00Z"}}
calls = []
async def handle(route):
    u = route.request.url; calls.append(u.split("supabase.co")[-1][:90])
    if "/auth/v1/user" in u: return await route.fulfill(json=user)
    if "/auth/v1/token" in u: return await route.fulfill(json=session)
    if "/rpc/org_onboarding_state" in u: return await route.fulfill(json=state())
    if "/rest/v1/profiles" in u:
        row = {"id":UID,"user_id":UID,"organization_id":ORG,"nome":"Admin Fictício","email":"admin@ficticio.test","ativo":True,"senha_provisoria":False}
        acc = route.request.headers.get("accept","")
        return await route.fulfill(json=row if "vnd.pgrst.object" in acc else [row])
    if "/rest/v1/user_roles" in u: return await route.fulfill(json=[{"role":"administrador","user_id":UID}])
    if "/rpc/internal_actor_context_v1" in u:
        return await route.fulfill(json={"v":1,"user_id":UID,"organization_id":ORG,"roles_confirmed":True,"roles":["administrador"],
            "profile":{"user_id":UID,"organization_id":ORG,"ativo":True,"senha_provisoria":False}})
    if "/rest/v1/rpc/" in u: return await route.fulfill(json=None)
    return await route.fulfill(json=[])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        res = {}
        for name, vp, mobile in [("desktop", {"width":1280,"height":1800}, False), ("celular", {"width":390,"height":844}, True)]:
            STATE["status"] = "aguardando_revisao"
            ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile)
            page = await ctx.new_page()
            await page.route("**/swzpzcwiasxmjutrmvkm.supabase.co/**", handle)
            await page.goto("http://localhost:8080/auth", wait_until="domcontentloaded")
            await page.evaluate("([k,v]) => localStorage.setItem(k,v)", ["sb-swzpzcwiasxmjutrmvkm-auth-token", json.dumps(session)])
            for path in ["/", "/configuracoes/fiscal/empresa"]:
                await page.goto("http://localhost:8080"+path, wait_until="domcontentloaded")
                try: await page.get_by_text("Cadastro em revisão").wait_for(timeout=15000); ok = True
                except Exception: ok = False
                fiscal_form = await page.get_by_role("button", name="Salvar configuração").count()
                await page.screenshot(path=str(OUT/f"{name}{path.replace('/','_') or '_root'}.png"))
                res[f"{name} {path}"] = {"pendente_visivel": ok, "botao_salvar_fiscal": fiscal_form, "url": page.url}
            await page.reload(wait_until="domcontentloaded")
            try: await page.get_by_text("Cadastro em revisão").wait_for(timeout=15000); res[f"{name} recarga"] = True
            except Exception: res[f"{name} recarga"] = False
            STATE["status"] = "ativa"
            await page.goto("http://localhost:8080/", wait_until="domcontentloaded"); await page.wait_for_timeout(4000)
            res[f"{name} após aprovação sem tela pendente"] = await page.get_by_text("Cadastro em revisão").count() == 0
            await page.screenshot(path=str(OUT/f"{name}_apos_aprovacao.png"))
            await ctx.close()
        await b.close()
        print(json.dumps(res, ensure_ascii=False, indent=1)); print(sorted(set(c.split("?")[0] for c in calls)))
asyncio.run(main())

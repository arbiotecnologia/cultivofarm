import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
BASE=Path('/tmp/browser/responsive-116');ROOT=Path('/dev-server/scripts/responsive-layout-116');OUT=ROOT/'navigation';OUT.mkdir(exist_ok=True)
ns={};exec((BASE/'survey.py').read_text().split('async def run():')[0],ns)
ROLES=['administrador','gestor','consultor_tecnico','aplicador','operador_onfarm','cliente_produtor','administrativo','tecnico_agronomo','producao','financeiro','gestor_comercial','vendedor','parceiro_b2b','parceiro_b2b_tecnico','superadmin']
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);ctx=await b.new_context(viewport={'width':390,'height':844});page=await ctx.new_page()
  async def route(r):
   u=r.request.url
   if not u.startswith('http://localhost:8080'):return await r.abort()
   if '/src/hooks/useAuth.tsx' in u:return await r.fulfill(content_type='application/javascript',body=ns['AUTH'])
   if '/src/integrations/supabase/client.ts' in u:return await r.fulfill(content_type='application/javascript',body=(BASE/'fixtures.js').read_text())
   if r.request.resource_type=='document':return await r.fulfill(content_type='text/html',body=ns['HTML'])
   await r.continue_()
  await ctx.route('**/*',route);records=json.loads((OUT/'results.json').read_text()) if (OUT/'results.json').exists() else []
  for role in ROLES:
   target='/plataforma' if role=='superadmin' else '/portal-parceiro/catalogo' if role.startswith('parceiro_b2b') else '/app/catalogo' if role in ['consultor_tecnico','tecnico_agronomo','aplicador'] else '/portal/acompanhamento' if role=='cliente_produtor' else '/financeiro/receber' if role=='financeiro' else '/comercial/pedidos-b2b' if role in ['gestor_comercial','vendedor'] else '/base-tecnica'
   for w,h in [(390,844),(1440,900)]:
    if any(r['profile']==role and r['viewport']==[w,h] for r in records):continue
    await page.set_viewport_size({'width':w,'height':h});await page.goto('http://localhost:8080'+target+'?reviewRole='+role,wait_until='domcontentloaded');await page.wait_for_timeout(500)
    shot=OUT/f'{role}-{w}.png';await page.screenshot(path=str(shot));rec={'profile':role,'viewport':[w,h],'requested':target,'actual':page.url,'mode':'REAL_APP_ROUTES_GUARDS_SYNTHETIC_SESSION','artifact':str(shot.relative_to(ROOT)),'body':(await page.locator('body').inner_text())[:1800],'links':await page.get_by_role('link').evaluate_all('(xs)=>xs.map(x=>({text:x.textContent,href:x.getAttribute("href")}))')};records.append(rec);(OUT/'results.json').write_text(json.dumps(records,ensure_ascii=False,separators=(',',':')))
  await b.close();print('navigation scenarios',len(records))
asyncio.run(main())

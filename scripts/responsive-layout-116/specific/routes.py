import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
R=Path('/dev-server/scripts/responsive-layout-116');O=R/'specific';ns={};exec((R/'harness/survey.py').read_text().split('async def run():')[0],ns)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':390,'height':844});page=await c.new_page();records=[]
  async def intercept(r):
   u=r.request.url
   if not u.startswith('http://localhost:8080'):return await r.abort()
   path=u.split('http://localhost:8080')[-1].split('?')[0]
   if path=='/src/hooks/useAuth.tsx':return await r.fulfill(content_type='application/javascript',body=ns['AUTH'])
   if path=='/src/integrations/supabase/client.ts':return await r.fulfill(content_type='application/javascript',body=(O/'route-fixtures.js').read_text())
   if path=='/__specific-read-fixtures.js':return await r.fulfill(content_type='application/javascript',body=(O/'read-fixtures.js').read_text())
   if r.request.resource_type=='document':return await r.fulfill(content_type='text/html',body=ns['HTML'])
   await r.continue_()
  await c.route('**/*',intercept)
  for role,path,expected in [('cliente_produtor','/portal/fazendas/33333333-3333-4333-8333-333333333333','Fazenda sintética'),('parceiro_b2b','/portal-parceiro/fichas','Produto sintético'),('administrador','/cockpit-laboratorio','Consulta disponível'),('financeiro','/financeiro/recibos','QA-116-2026'),('financeiro','/estoque','permissão')]:
   for w,h in [(390,844),(1440,900)]:
    await page.set_viewport_size({'width':w,'height':h});await page.goto('http://localhost:8080'+path+'?reviewRole='+role,wait_until='domcontentloaded');await page.wait_for_timeout(800)
    body=await page.locator('body').inner_text();ok=expected.casefold() in body.casefold();shot=O/f'route-{role}-{path.split("/")[1]}-{w}.png';await page.screenshot(path=str(shot));records.append({'profile':role,'route':path,'viewport':[w,h],'actual':page.url,'expected':expected,'asserted_content':ok,'mode':'REAL_APP_ROUTES_GUARDS_CONTEXTUAL_READS','result':'PASS_ROUTE_ASSERTION' if ok else 'ROUTE_GAP','artifact':str(shot.relative_to(R)),'body':body[:900]});(O/'routes.json').write_text(json.dumps(records,ensure_ascii=False,separators=(',',':')));print(role,path,w,ok,body[:100],flush=True)
  await b.close()
asyncio.run(main())

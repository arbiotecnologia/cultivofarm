import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  ctx=await browser.new_context(viewport={'width':1280,'height':1800}, service_workers='block')
  outbound=[]
  async def route(r):
   if r.request.url.startswith('http://localhost:8080'):
    await r.continue_()
   else:
    outbound.append({'origin':r.request.url.split('/')[2], 'method':r.request.method})
    await r.abort()
  await ctx.route('**/*',route)
  page=await ctx.new_page()
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080',wait_until='domcontentloaded')
  await page.get_by_role('status').filter(has_text='HOMOLOGAÇÃO').wait_for(timeout=30000)
  await page.screenshot(path='/tmp/browser/homolog/desktop.png')
  checks=await page.evaluate('''async () => {
   const m=await import('/src/integrations/supabase/homologPreparation.ts');
   const results=[];
   for (const [url,method] of [
    ['https://swzpzcwiasxmjutrmvkm.supabase.co/auth/v1/user','GET'],
    ['https://vrlcdwmlytukrjezrrnf.supabase.co/rest/v1/entregas','POST'],
    ['https://vrlcdwmlytukrjezrrnf.supabase.co/functions/v1/create-user','POST'],
    ['https://vrlcdwmlytukrjezrrnf.supabase.co/storage/v1/object/a/b','POST'],
    ['https://brasilapi.com.br/api/cnpj/v1/1','GET']]) {
     try {await fetch(url,{method});results.push(false)} catch {results.push(true)}
   }
   let socketBlocked=false; try {new WebSocket('wss://swzpzcwiasxmjutrmvkm.supabase.co/realtime/v1')}catch{socketBlocked=true}
   localStorage.setItem('sb-swzpzcwiasxmjutrmvkm-auth-token','synthetic-not-a-session');
   const storage=m.isolatedAuthStorage(localStorage);
   return {requestsBlocked:results,socketBlocked,productionStorageIgnored:storage.getItem('sb-swzpzcwiasxmjutrmvkm-auth-token')===null,homologSessionAbsent:storage.getItem(m.HOMOLOG_SESSION_KEY)===null};
  }''')
  await page.reload(wait_until='domcontentloaded')
  await page.get_by_role('status').filter(has_text='HOMOLOGAÇÃO').wait_for()
  await page.set_viewport_size({'width':390,'height':844})
  await page.screenshot(path='/tmp/browser/homolog/mobile.png')
  print(json.dumps({'url':page.url,'checks':checks,'externalAttemptsIntercepted':outbound,'pageErrors':errors},ensure_ascii=False))
  await browser.close()
asyncio.run(main())

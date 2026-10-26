"""Real Chromium/IndexedDB, controlled transport. No hosted calls, no credentials."""
import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
D=Path(__file__).resolve().parent
URL='http://localhost:8080/scripts/owner-orders-20261023/durable-attempt-20261026/journal-prototype.mjs'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800})
  async def page():
   tab=await context.new_page()
   await tab.route('**/*',lambda route:route.abort() if 'supabase' in route.request.url else route.continue_())
   await tab.goto('http://localhost:8080')
   await tab.evaluate("async u=>{window.j=await import(u);window.scope=await j.journalScope('actor-a','org-a','partner-a');window.current=true;window.res={schema:1,key:'00000000-0000-4000-8000-000000000001',generation:1,state:'uncertain'};}",URL)
   return tab
  a,b=await page(),await page()
  passes=[]
  def ok(name,value):
   assert value,name;passes.append(name);print('PASS',name)
  ok('BEFORE: separate memory tabs produce different opaque keys',await a.evaluate('crypto.randomUUID()')!=await b.evaluate('crypto.randomUUID()'))
  ok('empty storage blocks, never generates key',await a.evaluate("async()=>{try{await j.read(scope);return false}catch(e){return e.message==='missing_requires_server_recovery'}}"))
  await asyncio.gather(a.evaluate('j.adopt(scope,res,()=>current)'),b.evaluate('j.adopt(scope,res,()=>current)'))
  ok('two pages same origin share reservation transactionally',await a.evaluate('(async()=> (await j.read(scope)).key===res.key)()') and await b.evaluate('(async()=> (await j.read(scope)).key===res.key)()'))
  await a.close();a=await page()
  ok('close/reopen survives crash before fetch',await a.evaluate('(async()=> (await j.read(scope)).key===res.key)()'))
  await b.evaluate("async()=>{window.old={...res};res={...res,key:'00000000-0000-4000-8000-000000000002',generation:2};await j.adopt(scope,res,()=>current)}")
  ok('old response cannot overwrite new generation',await a.evaluate("async()=>{try{await j.adopt(scope,res,()=>current);return false}catch(e){return e.message==='stale_generation'}}"))
  ok('revalidation detects foreign generation before dispatch',await a.evaluate("async()=>{try{await j.beforeDispatch(scope,res,()=>current,async()=>res);return false}catch(e){return e.message==='dispatch_blocked'}}"))
  await b.evaluate("async()=>{res={...res,state:'committed'};await j.adopt(scope,res,()=>current)}")
  await b.close();b=await page()
  ok('commit-before-ack local marker survives tab closure',await b.evaluate('(async()=> (await j.read(scope)).state===\'committed\')()'))
  ok('A/B scopes differ without persisting identity',await b.evaluate("(async()=>scope!==await j.journalScope('actor-b','org-b','partner-a'))()"))
  ok('revoked context never adopts or dispatches',await b.evaluate("async()=>{current=false;try{await j.adopt(scope,res,()=>current);return false}catch(e){return e.message==='context_or_contract_invalid'}}"))
  await b.evaluate('current=true')
  ok('storage unavailable fails closed',await b.evaluate("async()=>{const original=IDBFactory.prototype.open;IDBFactory.prototype.open=()=>{throw Error('denied')};try{await j.read(scope);return false}catch(e){return e.message==='storage_unavailable'}finally{IDBFactory.prototype.open=original}}"))
  await b.evaluate("async()=>await new Promise((resolve,reject)=>{const q=indexedDB.open('c2-order-journal-review-v1',1);q.onsuccess=()=>{const d=q.result,t=d.transaction('slots','readwrite');t.objectStore('slots').put({schema:999},scope);t.oncomplete=()=>{d.close();resolve()};t.onerror=reject}})")
  ok('corruption never silently repairs/reserves',await b.evaluate("async()=>{try{await j.read(scope);return false}catch(e){return e.message==='storage_corrupt'}}"))
  await context.close()
  # Another browser context has no local journal, proving storage is not authority.
  other=await browser.new_context(viewport={'width':1280,'height':1800})
  c=await other.new_page();await c.goto('http://localhost:8080')
  ok('independent browser context missing journal remains blocked',await c.evaluate("async u=>{const j=await import(u);try{await j.read(await j.journalScope('actor-a','org-a','partner-a'));return false}catch(e){return e.message==='missing_requires_server_recovery'}}",URL))
  await browser.close();print('TOTAL',len(passes),'PASS real IndexedDB; controlled transport, no hosted JWT/RLS')
asyncio.run(main())
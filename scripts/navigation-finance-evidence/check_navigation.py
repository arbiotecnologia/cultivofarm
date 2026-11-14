import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
BASE=Path('/tmp/browser/navigation-finance')
HTML='''<html><head><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module">
import '/src/index.css';
import React from '/node_modules/.vite/deps/react.js?v=fe84c25a';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js?v=dd26e840';
import {MemoryRouter,Routes,Route} from '/node_modules/.vite/deps/react-router-dom.js?v=df20045b';
import {QueryClient,QueryClientProvider} from '/node_modules/.vite/deps/@tanstack_react-query.js?v=a9da551e';
import Protocolos from '/src/pages/Protocolos.tsx';
window.role=new URLSearchParams(location.search).get('role')||'financeiro';window.calls=[];
const e=React.createElement,qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
ReactDOM.createRoot(document.getElementById('root')).render(e(QueryClientProvider,{client:qc},e(MemoryRouter,{initialEntries:['/base-tecnica?tab=servicos']},e(Routes,null,e(Route,{path:'/base-tecnica',element:e(Protocolos)}),e(Route,{path:'/sem-permissao',element:e('output',null,'Acesso bloqueado')})))));
</script></body></html>'''
AUTH="export const useAuth=()=>({user:{id:'synthetic-actor'},profile:{user_id:'synthetic-actor',organization_id:'synthetic-org',ativo:true},roles:[window.role],role:window.role,loading:false,authzReady:true,authzEpoch:0,checkAuthzAccess:()=>true});"
CLIENT="""export const SUPABASE_URL='https://synthetic.invalid';export const SUPABASE_PUBLISHABLE_KEY='synthetic-key';export const supabase={from:(table)=>{const q={select:()=>q,eq:()=>q,not:()=>q,order:()=>q,limit:()=>q,abortSignal:()=>q,then:(resolve)=>{window.calls.push({table,method:'READ'});resolve({data:table==='catalog_services'?[{id:'00000000-0000-4000-8000-000000000001',name:'Serviço sintético',code:'QA',unit:'UN',unit_price:10,is_active:true,updated_at:'2026-11-14T00:00:00Z'}]:[],error:null});}};return q;},rpc:async(name,args)=>{window.calls.push({rpc:name,args});if(name==='tenant_product_list')return {data:[],error:null};if(name==='tenant_display_name_v1')return {data:'Empresa sintética',error:null};return {data:null,error:{code:'42501',message:'synthetic denied'}};},functions:{invoke:async()=>{throw Error('Edge not authorized in test')}}};"""
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);context=await browser.new_context(viewport={'width':1280,'height':1800});page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def handle(route):
   u=route.request.url
   if not u.startswith('http://localhost:8080'):return await route.abort()
   if '/__finance-nav' in u:return await route.fulfill(content_type='text/html',body=HTML)
   if '/src/hooks/useAuth.ts' in u:return await route.fulfill(content_type='application/javascript',body=AUTH)
   if '/src/integrations/supabase/client.ts' in u:return await route.fulfill(content_type='application/javascript',body=CLIENT)
   await route.continue_()
  await context.route('**/*',handle)
  await page.goto('http://localhost:8080/__finance-nav?role=financeiro');await page.wait_for_timeout(1500);print(errors);await page.get_by_role('heading',name='Serviços da empresa').wait_for();await page.get_by_text('Serviço sintético',exact=True).wait_for();await page.screenshot(path=str(BASE/'financeiro-servicos.png'))
  result={'financeiro':{'tabs':await page.get_by_role('tab').all_text_contents(),'novoServico':await page.get_by_role('button',name='Novo serviço',exact=True).count(),'calls':await page.evaluate('window.calls')}}
  await page.get_by_role('tab',name='Produtos',exact=True).click();await page.get_by_text('Nenhum produto encontrado',exact=True).wait_for();result['financeiro']['productCrud']=await page.get_by_role('button',name='Novo produto',exact=True).count();await page.screenshot(path=str(BASE/'financeiro-produtos.png'))
  await page.goto('http://localhost:8080/__finance-nav?role=administrativo');await page.get_by_text('Serviço sintético',exact=True).wait_for();result['administrativo']={'newService':await page.get_by_role('button',name='Novo serviço',exact=True).count(),'view':await page.get_by_role('button',name='Ver',exact=True).count()};await page.screenshot(path=str(BASE/'administrativo-readonly.png'))
  await page.goto('http://localhost:8080/__finance-nav?role=consultor_tecnico');await page.get_by_text('Acesso bloqueado',exact=True).wait_for();result['consultor']={'blocked':True,'calls':await page.evaluate('window.calls')};await page.screenshot(path=str(BASE/'consultor-blocked.png'));result['errors']=errors;(BASE/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));await browser.close()
asyncio.run(main())

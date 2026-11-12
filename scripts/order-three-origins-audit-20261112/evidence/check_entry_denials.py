import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
D=Path(__file__).parent
AUTH='''export function useAuth(){return {user:{id:"synthetic-A"},profile:{user_id:"synthetic-A",organization_id:"synthetic-org",ativo:true},roles:["administrador"],role:"administrador",loading:false,authzReady:true,authzEpoch:0};}'''
CLIENT='''const chain=()=>{const q={then:f=>Promise.resolve({data:[],error:null}).then(f)};for(const n of ["select","eq","neq","in","order","limit","range","abortSignal","maybeSingle","not"])q[n]=()=>q;return q;}; export const SUPABASE_PUBLISHABLE_KEY="synthetic-key";export const SUPABASE_URL="https://swzpzcwiasxmjutrmvkm.supabase.co";export const supabase={from:()=>chain(),rpc:(name)=>{const q=chain();q.then=f=>Promise.resolve({data:name==="tenant_catalog_active_families_v1"?[{value:"biologico",label:"Biológicos"},{value:"quimico",label:"Produtos químicos"},{value:"fertilizante_adubo",label:"Fertilizantes/Adubos"}]:[],error:null}).then(f);return q;},functions:{invoke:async()=>({data:null,error:new Error("review only")})},auth:{getSession:async()=>({data:{session:null}})},channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{},storage:{from:()=>({})}};'''
HARNESS='''import React from "/node_modules/.vite/deps/react.js?v=ea1afdd8";import ReactDOM from "/node_modules/.vite/deps/react-dom_client.js?v=ea1afdd8";import {QueryClient,QueryClientProvider} from "/node_modules/.vite/deps/@tanstack_react-query.js?v=ea1afdd8";import {MemoryRouter} from "/node_modules/.vite/deps/react-router-dom.js?v=ea1afdd8";import ComercialNovoPedido from "/src/pages/comercial/ComercialNovoPedido.tsx";import VendedorNovoPedido from "/src/pages/comercial/VendedorNovoPedido.tsx";import "/src/index.css";const h=React.createElement;ReactDOM.createRoot(document.getElementById("root")).render(h(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},h(MemoryRouter,{initialEntries:[location.pathname]},h("main",null,location.pathname.includes("minha-carteira")?h(VendedorNovoPedido):h(ComercialNovoPedido)))));'''
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={"width":1280,"height":1800})
  active_path=''
  async def route(r):
   u=r.request.url
   if not u.startswith('http://localhost:8080'): await r.abort();return
   if '/src/hooks/useAuth.tsx' in u: await r.fulfill(body=AUTH.replace("administrador", "vendedor" if "minha-carteira" in active_path else "gestor_comercial"),content_type='text/javascript');return
   if '/src/integrations/supabase/client.ts' in u: await r.fulfill(body=CLIENT,content_type='text/javascript');return
   if '/src/main.tsx' in u: await r.fulfill(body=HARNESS,content_type='text/javascript');return
   await r.continue_()
  await context.route('**/*',route)
  page=await context.new_page(); errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
  for active_path in ['/comercial/pedidos-b2b/novo','/comercial/minha-carteira/pedido']:
   await page.goto('http://localhost:8080'+active_path,wait_until='networkidle')
   text=await page.locator('body').inner_text()
   await page.screenshot(path=str(D/('seller.png' if 'minha-carteira' in active_path else 'commercial.png')))
   print(json.dumps({'route':active_path,'role':'vendedor' if 'minha-carteira' in active_path else 'gestor_comercial','layer':'browser synthetic empty RPC boundary, no SQL','text':text,'errors':errors,'orders_created':0},ensure_ascii=False))
   assert await page.get_by_role('button',name='Enviar pedido',exact=True).count()==0
  await browser.close()
asyncio.run(main())

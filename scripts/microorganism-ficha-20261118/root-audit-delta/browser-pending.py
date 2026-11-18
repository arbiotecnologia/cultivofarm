import asyncio,json,re
from pathlib import Path
from playwright.async_api import async_playwright
BASE='http://localhost:8080'
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for w,h in [(1280,1800),(390,844)]:
   c=await b.new_context(viewport={'width':w,'height':h});page=await c.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   auth='export function useAuth(){return {user:{id:"QA-A"},profile:{user_id:"QA-A",organization_id:"00000000-0000-4000-8000-000000000011",ativo:true},roles:["administrador"],role:"administrador",loading:false,authzReady:true,authzEpoch:0};}'
   client='''window.__row={id:'00000000-0000-4000-8000-000000000001',nome:'Microrganismo QA — ficha integrada',nome_cientifico:'Bacillus subtilis',tipo:'bacteria',descricao:'Descrição inicial',codigo:'QA-27',updated_at:'2026-11-18T00:00:00Z',owner_organization_id:'00000000-0000-4000-8000-000000000011'};window.__extra={};window.__profile=null;window.__evidence=[];
function query(table){let single=false;const q=new Proxy({}, {get(_,key){if(key==='then')return (resolve)=>Promise.resolve({data:table==='microrganismos'?(single?window.__row:[window.__row]):table==='microorganism_technical_profiles'?(single?window.__profile:window.__profile?[window.__profile]:[]):[],error:null}).then(resolve);return (...args)=>{if(key==='single'||key==='maybeSingle')single=true;return q;};}});return q;}
export const SUPABASE_PUBLISHABLE_KEY='synthetic';export const SUPABASE_URL='https://swzpzcwiasxmjutrmvkm.supabase.co';export const supabase={from:query,rpc(fn,args){if(fn==='tenant_micro_document_list_v1'){const q=Promise.resolve({data:[],error:null});q.abortSignal=()=>q;return q;}if(fn==='tenant_microorganism_ficha_read_v1'){const q=Promise.resolve({data:{extra:window.__extra,evidence:window.__evidence},error:null});q.abortSignal=()=>q;return q;}if(fn==='tenant_microorganism_ficha_save_v1'){window.__row={...window.__row,...args.p_payload.root,updated_at:'2026-11-18T00:01:00Z'};window.__extra={...window.__extra,...args.p_payload.extra};window.__profile={...window.__profile,...args.p_payload.content,id:'00000000-0000-4000-8000-000000000021',microrganismo_id:window.__row.id,updated_at:'2026-11-18T00:01:00Z',status_validacao:'rascunho'};window.__evidence=args.p_evidence;return Promise.resolve({data:{ok:true,id:window.__row.id,updated_at:window.__row.updated_at,replayed:false},error:null});}return Promise.resolve({data:[],error:null});},functions:{invoke:async()=>({data:{candidates:[{key:'species',name:'Bacillus subtilis (espécie)',manufacturer:null,registration:null,sources:[{url:'https://example.org/ficha',title:'Fonte sintética QA',excerpt:'Trecho de teste'}]}],suggestions:[{candidate_key:'species',field:'resumo_curto',value:'Resumo documentado QA',sources:[{url:'https://example.org/ficha',title:'Fonte sintética QA',excerpt:'Trecho de teste'}]}]},error:null})},storage:{from:()=>({})},auth:{getSession:async()=>({data:{session:null}})}};'''
   async def auth_route(route):await route.fulfill(body=auth,content_type='application/javascript')
   async def client_route(route):await route.fulfill(body=client,content_type='application/javascript')
   await page.route('**/src/hooks/useAuth.tsx*',auth_route);await page.route('**/src/integrations/supabase/client.ts*',client_route)
   async def entry(route):
    original=await route.fetch();text=await original.text();react=re.search(r'from "([^\"]*react-dom_client[^\"]*)"',text).group(1)
    body=f'''import * as React from '/@oj-deps/react__oj_named.mjs?v=7e38a16b';import {{createRoot}} from '{react}';import {{QueryClient,QueryClientProvider}} from '/@oj-deps/tanstack_react-query.mjs?v=7e38a16b';import {{MemoryRouter}} from '/@oj-deps/react-router-dom.mjs?v=7e38a16b';import '/src/index.css';import {{MicroorganismFichaEditor}} from '/src/components/protocolos/MicroorganismFichaEditor.tsx';import {{supabase}} from '/src/integrations/supabase/client.ts';
const qc=new QueryClient();function Harness(){{const [open,setOpen]=React.useState(true);return React.createElement(QueryClientProvider,{{client:qc}},React.createElement(MemoryRouter,null,open?React.createElement(MicroorganismFichaEditor,{{item:window.__row,onClose:()=>setOpen(false),onSaved:()=>setOpen(false)}}):React.createElement('button',{{onClick:()=>setOpen(true)}},'Reabrir ficha')));}}createRoot(document.getElementById('root')).render(React.createElement(Harness));'''
    await route.fulfill(body=body,content_type='application/javascript')
   await page.route('**/src/main.tsx*',entry)
   await page.goto(BASE,wait_until='domcontentloaded');await page.wait_for_timeout(2500);print('page errors',errors);await page.get_by_label('Nome',exact=True).wait_for(timeout=20000)
   await page.get_by_role('button',name='Fontes e histórico',exact=True).click()
   await page.get_by_role('button',name='Adicionar fonte documental',exact=True).click()
   await page.locator('#child-fonte_titulo').fill('Fonte pendente QA')
   await page.locator('#child-fonte_url').fill('javascript:alert(1)')
   await page.get_by_role('button',name='Salvar ficha',exact=True).click()
   await page.get_by_text('Aplique ou cancele a alteração de vínculo antes de salvar a ficha.',exact=True).wait_for()
   assert await page.locator('#child-fonte_titulo').input_value()=='Fonte pendente QA'
   await page.get_by_role('button',name='Aplicar ao rascunho',exact=True).click()
   await page.get_by_text('Informe uma URL HTTPS sem credenciais, espaços ou caracteres de controle.',exact=True).wait_for()
   await page.locator('#child-fonte_url').fill('https://www.embrapa.br/documento')
   await page.get_by_role('button',name='Aplicar ao rascunho',exact=True).click()
   await page.get_by_text('Alteração no rascunho: Fonte pendente QA',exact=True).wait_for()
   await page.screenshot(path=f'/tmp/browser/root-relations/pending-{w}.png')
   assert not errors
   print(json.dumps({'viewport':w,'save_pending_blocked':True,'draft_preserved':True,'unsafe_url_blocked':True,'valid_source_staged':True,'limits':'synthetic transport/Auth, real editor; NOT hosted'}))
   await c.close()
  await b.close()
asyncio.run(main())

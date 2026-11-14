import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/layout-review'); phase=sys.argv[1] if len(sys.argv)>1 else 'before'
HTML='''<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module">
import '/src/index.css';import React from '/node_modules/.vite/deps/react.js?v=d55b057d';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js?v=1e9e86b4';import {MemoryRouter} from '/node_modules/.vite/deps/react-router-dom.js?v=39152e0a';import {QueryClient,QueryClientProvider} from '/node_modules/.vite/deps/@tanstack_react-query.js?v=884d3db8';import Configuracoes from '/src/pages/Configuracoes.tsx';import {MobileCard,PageHeader} from '/src/components/ResponsiveHelpers.tsx';import {Button} from '/src/components/ui/button.tsx';import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel} from '/src/components/ui/alert-dialog.tsx';import {Tabs,TabsList,TabsTrigger} from '/src/components/ui/tabs.tsx';import {Table,TableBody,TableRow,TableCell} from '/src/components/ui/table.tsx';
window.calls=[];const e=React.createElement,qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}}),mode=new URLSearchParams(location.search).get('mode');
const text='NomeMuitoLongoSemEspacos'.repeat(8);
const shared=e('main',{className:'p-4 space-y-4'},e(PageHeader,{title:text,description:text,action:e(Button,null,'Ação')}),e(MobileCard,{title:text,subtitle:text,status:'Ativo',content:[{label:'Nome',value:text}],actions:[e(Button,{key:1},'Consultar detalhes completos'),e(Button,{key:2},'Outra ação disponível')]}),e(Tabs,{defaultValue:'1'},e(TabsList,null,...[1,2,3,4,5].map(i=>e(TabsTrigger,{key:i,value:String(i)},'Título longo da aba '+i)))),e(Table,null,e(TableBody,null,e(TableRow,null,e(TableCell,null,text)))),e(Button,{onClick:()=>window.alertOpen()},'Abrir confirmação'));
function Confirm(){const [open,set]=React.useState(false);window.alertOpen=()=>set(true);return e(AlertDialog,{open,onOpenChange:set},e(AlertDialogContent,null,e(AlertDialogTitle,null,text),e(AlertDialogDescription,null,('Descrição longa '+text+' ').repeat(6)),e(AlertDialogFooter,null,e(AlertDialogCancel,null,'Cancelar'))));}
ReactDOM.createRoot(document.getElementById('root')).render(e(QueryClientProvider,{client:qc},e(MemoryRouter,{initialEntries:['/configuracoes?tab=usuarios']},mode==='shared'?e(React.Fragment,null,shared,e(Confirm)):e('main',{className:'p-4'},e(Configuracoes)))));
</script></body></html>'''
AUTH="export const useAuth=()=>({user:{id:'synthetic-actor'},profile:{user_id:'synthetic-actor',nome:'Administrador sintético',organization_id:'synthetic-org',ativo:true},roles:['administrador'],role:'administrador',loading:false,authzReady:true,authzEpoch:0,checkAuthzAccess:()=>true});"
CLIENT="""export const SUPABASE_URL='https://synthetic.invalid';export const SUPABASE_PUBLISHABLE_KEY='synthetic-key';export const supabase={from:table=>{const q=new Proxy({}, {get:(_,k)=>k==='then'?resolve=>{window.calls.push({table,read:true});resolve({data:table==='partner_accounts'?[{id:'11111111-1111-4111-8111-111111111111',razao_social:'ParceiroComNomeExtensoSemEspacos'.repeat(7)}]:table==='clientes'?[{id:'22222222-2222-4222-8222-222222222222',nome:'ClienteComNomeExtensoSemEspacos'.repeat(7)}]:[],count:1,error:null});}:()=>q});return q;},rpc:async(name,args)=>{window.calls.push({rpc:name});if(name==='tenant_admin_list_users')return {data:{items:[],total:0},error:null};if(name==='org_onboarding_state')return {data:{nome:'EmpresaComNomeExtensoSemEspacos'.repeat(7)},error:null};return {data:null,error:{code:'42501',message:'synthetic denied'}};},functions:{invoke:async()=>{throw Error('Writes forbidden in visual harness')}},auth:{getSession:async()=>({data:{session:null},error:null})}};"""
GEOMETRY='''() => {const d=document.querySelector('[role=dialog]'); const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};return {dialog:d?rect(d):null,bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth,radios:[...document.querySelectorAll('[role=radio]')].map(e=>({text:e.textContent,rect:rect(e),overflow:e.scrollWidth>e.clientWidth,spans:[...e.querySelectorAll('span')].map(rect)})),buttons:d?[...d.querySelectorAll('button')].filter(e=>e.textContent.includes('Criar Usuário')||e.textContent.includes('Fechar')||e.textContent.includes('Close')).map(e=>({text:e.textContent,rect:rect(e)})):[]};}'''
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);ctx=await b.new_context(viewport={'width':464,'height':522});page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   u=r.request.url
   if not u.startswith('http://localhost:8080'):return await r.abort()
   if '/__layout-review' in u:return await r.fulfill(content_type='text/html',body=HTML)
   if '/src/hooks/useAuth.ts' in u:return await r.fulfill(content_type='application/javascript',body=AUTH)
   if '/src/integrations/supabase/client.ts' in u:return await r.fulfill(content_type='application/javascript',body=CLIENT)
   await r.continue_()
  await ctx.route('**/*',route); results=[]
  for w,h in ([(464,522)] if phase=='before' else [(320,568),(360,640),(390,844),(464,522),(768,1024),(1280,1800),(1920,1080),(640,900),(464,522),(320,568)]):
   await page.set_viewport_size({'width':w,'height':h});await page.goto('http://localhost:8080/__layout-review');await page.wait_for_timeout(2500);print('errors',errors,await page.locator('body').inner_text(),flush=True);await page.get_by_role('button',name='Novo Usuário',exact=True).click(timeout=10000);await page.wait_for_timeout(300)
   if phase=='after' and len(results)>=24: await page.evaluate("document.documentElement.style.fontSize='32px'")
   for name in (['Interno'] if phase=='before' else ['Interno','Parceiro B2B','Cliente Produtor']):
    await page.get_by_role('radio',name=name).click();await page.wait_for_timeout(200);await page.get_by_role('radio',name=name).scroll_into_view_if_needed();await page.screenshot(path=str(OUT/f'{phase}-{w}-{len(results)}-selector.png'));await page.get_by_label('Nome *',exact=True).fill('NomeMuitoLongoSemEspacos'*8);await page.get_by_label('Email *',exact=True).fill('cadastro-sintetico@example.invalid');g=await page.evaluate(GEOMETRY);
    if phase=='after':
     if g['bodyWidth']>w: print('overflow-elements',await page.evaluate("[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,25).map(e=>({tag:e.tagName,cl:e.className,text:e.textContent.slice(0,90),right:e.getBoundingClientRect().right}))"),flush=True)
     assert g['bodyWidth']<=w, g
     assert not any(r['overflow'] for r in g['radios']), g
     for r in g['radios']:
      assert r['spans'][1]['y']>=r['spans'][0]['bottom'],r
     assert g['dialog']['x']>=0 and g['dialog']['right']<=w and g['dialog']['y']>=0 and g['dialog']['bottom']<=h,g
     print('final-geometry',g,flush=True) if len(results)>=27 else None
     for bt in g['buttons']: assert bt['rect']['y']>=0 and bt['rect']['bottom']<=h,bt
    g.update(width=w,height=h,kind=name,mode='text-zoom-200-percent' if len(results)>=24 else 'reflow-200-percent' if w==640 else 'viewport');results.append(g);await page.screenshot(path=str(OUT/f'{phase}-{w}-{name.replace(" ","-")}.png'))
   if phase=='after':
    await page.get_by_role('button',name='Criar Usuário',exact=True).click();await page.get_by_role('alert').first.wait_for();await page.screenshot(path=str(OUT/f'{phase}-{w}-{len(results)}-validation.png'))
   await page.get_by_role('button',name='Close' if phase=='before' else 'Fechar',exact=True).click();await page.get_by_role('dialog').wait_for(state='hidden')
  for w,h in [(320,568),(464,522),(1280,1800)]:
   await page.set_viewport_size({'width':w,'height':h});await page.goto('http://localhost:8080/__layout-review?mode=shared');await page.wait_for_timeout(1000);print('shared errors',errors,await page.locator('body').inner_text(),flush=True);await page.get_by_role('button',name='Abrir confirmação').wait_for(timeout=5000);await page.wait_for_timeout(300);results.append({'shared':True,'width':w,'pageWidth':await page.evaluate('document.documentElement.scrollWidth')});await page.screenshot(path=str(OUT/f'{phase}-shared-{w}.png'));await page.get_by_role('tablist').screenshot(path=str(OUT/f'{phase}-tabs-{w}.png'));await page.get_by_role('region',name='Tabela rolável').screenshot(path=str(OUT/f'{phase}-table-{w}.png')) if phase=='after' else None;await page.get_by_role('button',name='Abrir confirmação').click();await page.wait_for_timeout(350);await page.screenshot(path=str(OUT/f'{phase}-alert-{w}.png'));results.append({'alert':True,'width':w,'height':h,'rect':await page.get_by_role('alertdialog').evaluate('(e)=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,scroll:e.scrollHeight,client:e.clientHeight}}')})
  if phase=='after':
   assert not errors,errors
   for r in results:
    if r.get('shared'):assert r['pageWidth']<=r['width'],r
    if r.get('alert'):assert r['rect']['y']>=0 and r['rect']['bottom']<=r['height'] and r['rect']['right']<=r['width'],r
  (OUT/f'{phase}.json').write_text(json.dumps({'results':results,'errors':errors},indent=2));print(json.dumps({'results':results,'errors':errors}));await b.close()
asyncio.run(main())

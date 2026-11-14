import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
BASE=Path('/tmp/browser/responsive-116');OUT=Path('/dev-server/scripts/responsive-layout-116/focused');OUT.mkdir(exist_ok=True);phase=sys.argv[1]
ns={};exec((BASE/'survey.py').read_text().split('async def run():')[0],ns);AUTH=ns['AUTH'];CLIENT=(BASE/'fixtures.js').read_text()
HTML=ns['HTML'].replace("import App from '/src/App.tsx';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));",'''import {QueryClient,QueryClientProvider} from '/node_modules/.vite/deps/@tanstack_react-query.js?v=884d3db8';import {MemoryRouter} from '/node_modules/.vite/deps/react-router-dom.js?v=39152e0a';import {BulkAlvosDialog} from '/src/components/protocolos/catalog/BulkAlvosDialog.tsx';import {EvidenciasTabs} from '/src/components/visita/EvidenciasTabs.tsx';import Configuracoes from '/src/pages/Configuracoes.tsx';const e=React.createElement,kind=new URLSearchParams(location.search).get('case');const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});const child=kind==='bulk'?e(BulkAlvosDialog,{open:true,onOpenChange:()=>{},kind:'produto',parentId:'33333333-3333-4333-8333-333333333333'}):kind==='evidence'?e(EvidenciasTabs,{registroId:'33333333-3333-4333-8333-333333333333',arquivos:[],notes:[],onNotesChange:()=>{}}):e(Configuracoes);ReactDOM.createRoot(document.getElementById('root')).render(e(QueryClientProvider,{client:qc},e(MemoryRouter,{initialEntries:['/configuracoes?tab=usuarios']},e('main',{className:'p-4'},child))));''')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);ctx=await b.new_context(viewport={'width':390,'height':844});page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def intercept(r):
   u=r.request.url
   if not u.startswith('http://localhost:8080'):return await r.abort()
   if '/src/hooks/useAuth.tsx' in u:return await r.fulfill(content_type='application/javascript',body=AUTH)
   if '/src/integrations/supabase/client.ts' in u:return await r.fulfill(content_type='application/javascript',body=CLIENT)
   if r.request.resource_type=='document':return await r.fulfill(content_type='text/html',body=HTML)
   await r.continue_()
  await ctx.route('**/*',intercept);records=[]
  for kind in ['bulk','evidence','config']:
   for w,h in [(320,568),(390,844),(464,522),(1440,900)]:
    await page.set_viewport_size({'width':w,'height':h});await page.goto('http://localhost:8080/__focused?case='+kind);await page.wait_for_timeout(650)
    if kind=='config':await page.get_by_role('button',name='Novo Usuário',exact=True).click()
    await page.wait_for_timeout(250)
    tabs=page.get_by_role('tab') if kind!='config' else page.get_by_role('radio')
    for i in range(await tabs.count()):
     tab=tabs.nth(i);await tab.click();await page.wait_for_timeout(150);await tab.scroll_into_view_if_needed()
     metrics=await page.evaluate('''()=>{const selectors=['[role=tablist]','[role=radiogroup]'];return selectors.flatMap(s=>[...document.querySelectorAll(s)]).filter(e=>e.getBoundingClientRect().height>0).map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON(),children:[...e.children].map(c=>({text:c.textContent,rect:c.getBoundingClientRect().toJSON(),sw:c.scrollWidth,cw:c.clientWidth,sh:c.scrollHeight,ch:c.clientHeight,children:[...c.children].map(n=>({text:n.textContent,rect:n.getBoundingClientRect().toJSON()}))}))}))}''')
     shot=OUT/f'{phase}-{kind}-{w}-tab{i}.png';await page.screenshot(path=str(shot));records.append({'kind':kind,'viewport':[w,h],'tab':i,'artifact':str(shot.relative_to(OUT.parent)),'metrics':metrics})
     if await page.get_by_role('dialog').count():
      controls=page.get_by_role('dialog').last.locator('button,input,textarea');await controls.last.scroll_into_view_if_needed();await page.screenshot(path=str(OUT/f'{phase}-{kind}-{w}-last{i}.png'))
  (OUT/f'{phase}.json').write_text(json.dumps({'records':records,'errors':errors},ensure_ascii=False,indent=2));print('scenarios',len(records),'errors',errors);await b.close()
asyncio.run(main())

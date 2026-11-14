import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
R=Path('/dev-server/scripts/responsive-layout-116');O=R/'final';ns={};exec((R/'harness/survey.py').read_text().split('async def run():')[0],ns)
roles=['administrador','gestor','consultor_tecnico','aplicador','operador_onfarm','cliente_produtor','administrativo','tecnico_agronomo','producao','financeiro','gestor_comercial','vendedor','parceiro_b2b','parceiro_b2b_tecnico','superadmin']
CASES=[('role','/relatorios',[84,85]),('role','/entregas',[17,75]),('role','/consultor-tecnico',[73]),('role','/visita-tecnica/33333333-3333-4333-8333-333333333333',[52]),('role','/comercial/pedidos-b2b',[100]),('role','/configuracoes/fiscal/produtos',[101]),('technical','/app/visita/33333333-3333-4333-8333-333333333333',[88]),('b2b','/portal-parceiro/fichas',[115,116]),('clients','/clientes',[96,97])]
BOOT="""import {MemoryRouter,Routes,Route} from '/node_modules/.vite/deps/react-router-dom.js?v=39152e0a';import {QueryClient,QueryClientProvider} from '/node_modules/.vite/deps/@tanstack_react-query.js?v=884d3db8';const e=React.createElement;const kind=KIND;let C;if(kind==='role')C=(await import('/src/App.tsx')).RoleGuard;else if(kind==='technical')C=(await import('/src/components/guards/TechnicalFeatureGuard.tsx')).TechnicalFeatureGuard;else if(kind==='b2b')C=(await import('/src/components/guards/B2BRouteGuard.tsx')).B2BRouteGuard;else C=(await import('/src/pages/Clientes.tsx')).default;const q=new QueryClient({defaultOptions:{queries:{retry:false}}});ReactDOM.createRoot(document.getElementById('root')).render(e(QueryClientProvider,{client:q},e(MemoryRouter,{initialEntries:[PATH]},e(Routes,null,e(Route,{path:PATH,element:e(C,null,e('p',{'data-original-guard-passed':true},'Guard original permitiu montagem'))}),e(Route,{path:'*',element:e('p',{'data-original-guard-denied':true},'Guard original redirecionou')})))));"""
async def main():
 batch=int(sys.argv[1]);current=None
 async with async_playwright() as p:
  b=await p.chromium.launch();c=await b.new_context(viewport={'width':390,'height':844});page=await c.new_page();page.set_default_timeout(2500)
  async def intercept(r):
   if not r.request.url.startswith('http://localhost:8080'):return await r.abort()
   path=r.request.url.split('http://localhost:8080')[-1].split('?')[0]
   if path=='/src/hooks/useAuth.tsx':return await r.fulfill(content_type='application/javascript',body=ns['AUTH'])
   if path=='/src/integrations/supabase/client.ts':return await r.fulfill(content_type='application/javascript',body=(O/'fixtures.js').read_text())
   if path=='/__specific-read-fixtures.js':return await r.fulfill(content_type='application/javascript',body=(R/'specific/read-fixtures.js').read_text())
   if r.request.resource_type=='document':return await r.fulfill(content_type='text/html',body=ns['HTML'].replace("import App from '/src/App.tsx';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));",BOOT.replace('KIND',json.dumps(current[0])).replace('PATH',json.dumps(current[1]))))
   await r.continue_()
  await c.route('**/*',intercept)
  for ix,case in enumerate(CASES):
   if ix%3!=batch:continue
   current=case;dest=O/f'guards-{case[2][0]}.json';rows=json.loads(dest.read_text()) if dest.exists() else []
   for role in roles:
    for w,h in [(390,844),(1440,900)]:
     if any(x['profile']==role and x['viewport']==[w,h] for x in rows):continue
     await page.set_viewport_size({'width':w,'height':h});await page.goto('http://localhost:8080'+case[1]+'?reviewRole='+role);await page.wait_for_timeout(500)
     passed=await page.locator('[data-original-guard-passed]').count();denied=await page.locator('[data-original-guard-denied]').count();controls={}
     if case[0]=='clients':
      controls={n:await page.get_by_role('tab',name=n,exact=True).count()>0 for n in ['Produtores','Parceiros B2B']};controls['Novo Produtor']=await page.get_by_role('button',name='Novo Produtor',exact=True).count()>0
     rec={'ids':case[2],'profile':role,'viewport':[w,h],'route':case[1],'kind':case[0],'result':'ORIGINAL_GUARD_ALLOWED' if passed else 'ORIGINAL_GUARD_REDIRECT_DENIED' if denied else 'ORIGINAL_CONSUMER_CONTROLS' if controls else 'GAP_GUARD_LOADING_OR_UNAVAILABLE','controls':controls,'type':'ORIGINAL_GUARD_SYNTHETIC_SESSION_NOT_PRODUCTION','fixture':'final/fixtures.js'}
     shot=O/f'guards-{case[2][0]}-{role}-{w}.png';await page.screenshot(path=str(shot));rec['evidence']=str(shot.relative_to(R));rows.append(rec);dest.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
   print(case[2],len(rows),flush=True)
  await b.close()
asyncio.run(main())

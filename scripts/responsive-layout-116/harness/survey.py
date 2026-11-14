import asyncio,json,re,sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/dev-server/scripts/responsive-layout-116');TMP=Path('/tmp/browser/responsive-116');OUT=ROOT/'survey';OUT.mkdir(exist_ok=True)
AUTH='''import React from '/node_modules/.vite/deps/react.js?v=d55b057d';const id='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222';const role=new URLSearchParams(location.search).get('reviewRole')||'administrador';window.reviewRole=role;const user={id,email:'qa@example.invalid'};const noop=()=>{};const actor={user,session:{user,expires_at:2000000000,access_token:'synthetic'},profile:{id,user_id:id,nome:'Sessão sintética '+role,email:user.email,organization_id:org,ativo:true,senha_provisoria:false},roles:[role],role,primaryRole:role,loading:false,error:null,authzReady:true,authzEpoch:0,authzState:'valid',authzLatchBlocked:false,authzSigningOut:false,authzResidualScope:false,checkAuthzAccess:()=>true,signOut:async()=>{},refresh:async()=>{},revalidateAuthz:noop,setSafeOSDraft:noop,takeSafeOSDraft:()=>null,setSafePartnerOrderDraft:noop,takeSafePartnerOrderDraft:()=>null};export const useAuth=()=>actor;export const AuthProvider=({children})=>children;'''
HTML='''<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module">import '/src/index.css';import React from '/node_modules/.vite/deps/react.js?v=d55b057d';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js?v=1e9e86b4';import App from '/src/App.tsx';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>'''
MEASURE='''e=>{const r=e.getBoundingClientRect();const visible=n=>{const x=n.getBoundingClientRect(),s=getComputedStyle(n);return x.width>0&&x.height>0&&s.visibility!=='hidden'};return {id:e.dataset.reviewOccurrence,tag:e.tagName,role:e.getAttribute('role'),text:e.textContent.slice(0,2000),rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height},scroll:{w:e.scrollWidth,h:e.scrollHeight,cw:e.clientWidth,ch:e.clientHeight},clipped:[...e.querySelectorAll('label,button,[role=tab],h2,h3')].filter(visible).filter(n=>n.scrollWidth>n.clientWidth+2||n.scrollHeight>n.clientHeight+2).map(n=>({text:n.textContent.slice(0,180),tag:n.tagName,w:n.clientWidth,sw:n.scrollWidth,h:n.clientHeight,sh:n.scrollHeight})),controls:[...e.querySelectorAll('input,select,textarea,button,[role=tab]')].filter(visible).map(n=>({tag:n.tagName,text:(n.textContent||n.getAttribute('aria-label')||'').slice(0,100),disabled:n.disabled}))}}'''
async def run():
 items=json.loads((ROOT/'route-candidates.json').read_text());routes={}
 for c in items:
  for r in c['routes']:
   if r['path'] not in ['*','/'] and not r['path'].startswith('/protocolos'):routes.setdefault(r['path'],[]).append(c['id'])
 # Canonical pages prioritized: dialog-bearing pages first, then others. No fabricated app routes.
 ordered=sorted(routes,key=lambda x:(not any('Dialog' in items[i-1]['tag'] for i in routes[x]),len(routes[x])==1,x))
 roles=['administrador','gestor','consultor_tecnico','aplicador','operador_onfarm','cliente_produtor','administrativo','tecnico_agronomo','producao','financeiro','gestor_comercial','vendedor','parceiro_b2b','parceiro_b2b_tecnico','superadmin']
 results=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);ctx=await b.new_context(viewport={'width':1440,'height':900});page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def intercept(r):
   u=r.request.url
   if not u.startswith('http://localhost:8080'):return await r.abort()
   path=u.split('http://localhost:8080')[-1].split('?')[0]
   if path=='/src/hooks/useAuth.tsx':return await r.fulfill(content_type='application/javascript',body=AUTH)
   if path=='/src/integrations/supabase/client.ts':return await r.fulfill(content_type='application/javascript',body=(TMP/'fixtures.js').read_text())
   f=TMP/'modules'/path.lstrip('/').replace('/','__')
   if f.is_file():return await r.fulfill(content_type='application/javascript',body=f.read_text())
   if r.request.resource_type=='document':return await r.fulfill(content_type='text/html',body=HTML)
   await r.continue_()
  await ctx.route('**/*',intercept)
  if len(sys.argv)>1:ordered=[x for x in ordered if re.search(sys.argv[1],x)]
  for route in ordered:
   path=re.sub(r':\w+','33333333-3333-4333-8333-333333333333',route)
   selected=['superadmin'] if route.startswith('/plataforma') else (['administrador','cliente_produtor'] if route.startswith('/portal/') else roles)
   for role in selected:
    errors.clear();await page.goto('http://localhost:8080'+path+'?reviewRole='+role,wait_until='domcontentloaded');await page.wait_for_timeout(450)
    try:
     levels=await page.evaluate('''async ([route,role])=>{const {canAccess}=await import('/src/lib/permissions.ts');return canAccess(role,route)}''',[path,role])
    except:levels='unknown'
    if levels is False and not route.startswith(('/portal','/app')):
     results.append({'route':route,'profile':role,'level':levels,'status':'ROLE_STATIC_DENIED','url':page.url});continue
    for w,h in [(390,844),(1440,900)]:
     await page.goto('http://localhost:8080'+path+'?reviewRole='+role,wait_until='domcontentloaded');await page.wait_for_timeout(450)
     await page.set_viewport_size({'width':w,'height':h});await page.wait_for_timeout(120)
     slug=re.sub('[^a-zA-Z0-9-]','_',route)+'-'+role+'-'+str(w)
     rec={'route':route,'profile':role,'viewport':[w,h],'level':levels,'url':page.url,'expected':routes[route],'states':[]}
     async def capture(state):
      mounted=[]
      for loc in await page.locator('[data-review-occurrence]:visible').all():
       try:
        await loc.scroll_into_view_if_needed(timeout=700);g=await loc.evaluate(MEASURE);mounted.append(g)
       except Exception as e:mounted.append({'error':str(e)[:150]})
      shot=OUT/(slug+'-'+state+'.png');await page.screenshot(path=str(shot));rec['states'].append({'name':state,'artifact':str(shot.relative_to(ROOT)),'mounted':mounted,'body':(await page.locator('body').inner_text())[:5000]})
     async def open_controls():
      buttons=await page.get_by_role('button').all()
      for bt in buttons:
       try:
        name=(await bt.inner_text()).strip();aria=await bt.get_attribute('aria-label') or ''
        if not re.search(r'^(Novo|Nova|Adicionar|Cadastrar|Detalhes|Histórico|Auditoria|Editar|Gerenciar|Ver detalhes|Ver histórico|Criar recorrência)',name or aria,re.I):continue
        if re.search(r'Publicar|Excluir|Remover|Aprovar|Cancelar|Enviar|Salvar|Confirmar',name,re.I):continue
        if not await bt.is_visible() or not await bt.is_enabled():continue
        await bt.click(timeout=800);await page.wait_for_timeout(150)
        if await page.get_by_role('dialog').count():
         await capture('opened-'+str(len(rec['states'])))
         dialog=page.get_by_role('dialog').last
         controls=dialog.locator('input,textarea,button')
         if await controls.count():await controls.last.scroll_into_view_if_needed(timeout=700)
         await capture('last-action-'+str(len(rec['states'])))
         for tab in await dialog.get_by_role('tab').all():
          await tab.click(timeout=700);await capture('dialog-tab-'+str(len(rec['states'])))
         close=dialog.get_by_role('button',name='Fechar',exact=True)
         if await close.count():await close.click(timeout=800)
         else:await page.keyboard.press('Escape')
       except Exception as e:rec.setdefault('interaction_errors',[]).append(str(e)[:200])
     await capture('entry');await open_controls()
     # Only navigate tabs and open dialogs, never press submit/publish/approve/remove.
     for tab in await page.get_by_role('tab').all():
      try:
       await tab.click(timeout=700);await page.wait_for_timeout(450);await capture('tab-'+str(len(rec['states'])));await open_controls()
      except:pass
     rec['errors']=list(errors);rec['calls']=await page.evaluate('window.reviewCalls||[]');rec['writes']=await page.evaluate('window.reviewWrites||[]');results.append(rec)
     (OUT/('results-'+re.sub('[^a-zA-Z0-9]','_',sys.argv[1] if len(sys.argv)>1 else 'all')+'.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2));print(route,role,w,'mounted',sorted(set(g.get('id') for s in rec['states'] for g in s['mounted'] if g.get('id'))),'errors',len(errors),flush=True)
   (OUT/('results-'+re.sub('[^a-zA-Z0-9]','_',sys.argv[1] if len(sys.argv)>1 else 'all')+'.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2))
  await b.close()
asyncio.run(run())

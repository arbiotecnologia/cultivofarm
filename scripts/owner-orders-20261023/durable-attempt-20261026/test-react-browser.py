import asyncio,json,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/dev-server'); OUT=Path('/tmp/browser/durable-react-replay'); OUT.mkdir(parents=True,exist_ok=True)
A='11111111-1111-4111-8111-111111111111';O='22222222-2222-4222-8222-222222222222';P='33333333-3333-4333-8333-333333333333';K='44444444-4444-4444-8444-444444444444';ID='55555555-5555-4555-8555-555555555555'
state={'key':K,'generation':1,'state':'uncertain','orders':{},'calls':[],'cap':'active','failcreate':False,'bad':None,'revoke':False,'predecessors':[],'loseadvance':False}
plan={'id':'plan-1','name':'À vista','code':'CASH','plan_type':'cash','max_days':0,'months_count':1,'installment_count':1,'discount_percent':0,'monthly_interest_percent':0,'interest_type':'none','requires_credit_approval':False,'requires_guarantee':False,'requires_financial_approval':False,'minimum_order_amount':None,'sort_order':1}
html='''<html><body><div id="root"></div><script type="module">
 import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module">
import React from '/node_modules/.vite/deps/react.js?v=a850068f';import ReactDOM from'/node_modules/.vite/deps/react-dom_client.js?v=a850068f';import{QueryClient,QueryClientProvider}from'/node_modules/.vite/deps/@tanstack_react-query.js?v=a850068f';import{MemoryRouter,Routes,Route,Outlet}from'/node_modules/.vite/deps/react-router-dom.js?v=a850068f';import NovoPedido from '/src/pages/portal-parceiro/NovoPedido.tsx';import '/src/index.css';
window.testActor='ACTOR';window.testReady=true;
function Parent(){return React.createElement(Outlet,{context:{partner:{id:'PARTNER'},afterCreatePath:'/portal-parceiro/pedidos'}})}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})},React.createElement(MemoryRouter,{initialEntries:['/portal-parceiro/catalogo']},React.createElement(Routes,null,React.createElement(Route,{element:React.createElement(Parent)},React.createElement(Route,{path:'/portal-parceiro/catalogo',element:React.createElement(NovoPedido)})),React.createElement(Route,{path:'/portal-parceiro/pedidos',element:React.createElement('p',null,'Pedidos exibidos')})))));
</script></body></html>'''.replace('ACTOR',A).replace('PARTNER',P)
auth=f'''export function useAuth(){{return {{user:{{id:window.testActor}},profile:{{user_id:window.testActor,organization_id:'{O}',ativo:true,senha_provisoria:false}},roles:['parceiro_b2b'],role:'parceiro_b2b',loading:false,authzReady:true,authzEpoch:0,checkAuthzAccess:()=>window.testReady}}}}'''
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);ctx=await browser.new_context(viewport={'width':1280,'height':1800}); passes=[]
  async def route(r):
   url=r.request.url
   if '/src/hooks/useAuth.tsx' in url:return await r.fulfill(body=auth,content_type='application/javascript')
   if url.split('?')[0].endswith('/src/hooks/usePartnerCatalogTecnico.ts'):return await r.fulfill(body='export function usePartnerCatalogTecnico(){return {data:[]}};export function useRealtimePartnerCatalogTecnico(){}',content_type='application/javascript')
   if url.startswith('http://localhost:8080') and '/__durable_test' in url:return await r.fulfill(body=html,content_type='text/html')
   if 'supabase.co' not in url:return await r.continue_()
   if r.request.method=='OPTIONS':return await r.fulfill(status=200,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
   headers={'access-control-allow-origin':'*','content-type':'application/json'};name=url.split('/rpc/')[-1].split('?')[0];args=r.request.post_data_json if r.request.method=='POST' else {};state['calls'].append((name,args))
   data=None;status=200
   if '/auth/' in url:return await r.fulfill(status=401,headers=headers,body='{}')
   if name=='partner_order_journal_capability_v1':
    if state['cap']=='missing':status=404;data={'code':'PGRST202','message':'Could not find public.partner_order_journal_capability_v1'}
    elif state['cap']=='error':status=503;data={'code':'XX000','message':'unavailable'}
    else:data={'contract':'C2_ORDER_JOURNAL_V1','enabled':True,'actor_id':A,'organization_id':O,'partner_id':P}
   elif name=='recover_partner_order_attempt_v1':
    if args.get('p_advance'):
     if args.get('p_expected_generation')!=state['generation'] or args.get('p_expected_key')!=state['key'] or (state['state']=='committed' and args.get('p_ack_order')!=ID):status=409;data={'code':'PT409','message':'CAS'}
     else:
      state['predecessors'].append({'key':state['key'],'generation':state['generation'],'state':state['state'],**({'order_id':ID,'numero':'PB-LOCAL'} if state['state']=='committed' else {})})
      state.update(key=f"66666666-6666-4666-8666-{state['generation']+1:012d}",generation=state['generation']+1,state='reserved')
      if state['loseadvance']:return await r.abort('failed')
    if data is None:data={'contract':'C2_ORDER_JOURNAL_V1','key':state['key'],'generation':state['generation'],'state':state['bad'] or state['state'],'predecessors':state['predecessors'],**({'order_id':ID,'numero':'PB-LOCAL'} if state['state']=='committed' else {})}
    if state['revoke']:await asyncio.sleep(.2)
   elif name=='close_partner_order_attempt_v1':state['state']='closed';data={'contract':'C2_ORDER_ATTEMPT_CLOSURE_V1','state':'closed'}
   elif name=='get_partner_catalog_secure':data=[{'catalog_contract':'C1B_DUAL_TENANT_V1','item_id':P,'product_id':P,'item_tipo':'produto','produto_nome':'Produto local','produto_codigo':'LOCAL','familia_catalogo':'biologico','valor_litro_brl':10,'preco_parceiro':10,'desconto_percentual':0,'unidade_preco_principal':'litro','ficha_aprovada':False}]
   elif name=='rpc_b2b_list_selectable_payment_plans':data=[plan]
   elif name=='simulate_b2b_payment_plan_secure':data={'partner_id':P,'pricing_mode':'discount_from_base','quote_required':False,'cart_hash':'real-controlled-hash','payment_plan':plan,'amounts':{'table_amount':10,'discount_amount':0,'net_amount_after_discount':10,'financial_interest_amount':0,'final_amount':10},'schedule':[{'installment_number':1,'due_date':'2026-11-05','amount':10,'principal_amount':10,'interest_amount':0}],'warnings':[]}
   elif name=='create_partner_order_secure':
    key=args['p_idempotency_key'];state['orders'][key]=ID;state['state']='committed'
    if state['failcreate']:return await r.abort('failed')
    data={'id':ID,'numero':'PB-LOCAL','total':10}
   elif '/rest/v1/catalogo_volumes' in url:data=[{'id':'vol-1','item_tipo':'produto','produto_id':P,'microrganismo_id':None,'volume_ml':1000,'rotulo':'1 L','preco_brl':10,'moeda':'BRL','ativo':True,'ordem':1}]
   elif '/rest/v1/partner_orders' in url:data={'id':ID,'c2_external_origin_snapshot':{'contract':'C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1','accounting_validated':False}}
   else:return await r.fulfill(status=404,headers=headers,body=json.dumps({'code':'TEST_UNEXPECTED','message':name}))
   await r.fulfill(status=status,headers=headers,body=json.dumps(data))
  await ctx.route('**/*',route)
  async def tab():
   page=await ctx.new_page();page.on('pageerror',lambda e:print('PAGEERROR',str(e)));page.on('console',lambda m:print('CONSOLE',m.text) if m.type=='error' else None);await page.goto('http://localhost:8080/__durable_test');await page.get_by_role('button',name='Adicionar ao pedido',exact=True).wait_for();return page
  def ok(label,value=True):assert value,label;passes.append(label);print('PASS',label)
  async def fill(page):
   await page.get_by_role('button',name='Adicionar ao pedido',exact=True).click();await page.get_by_role('button',name='Adicionar ao carrinho',exact=True).click();await page.get_by_role('button',name='Continuar para condição de pagamento',exact=True).first.click();await page.get_by_role('button',name=re.compile('À vista')).click();await page.get_by_role('button',name='Enviar pedido para análise',exact=True).wait_for()
  a,b=await tab(),await tab();await a.get_by_text('Tentativa identificada pelo servidor.',exact=False).wait_for();await b.get_by_text('Tentativa identificada pelo servidor.',exact=False).wait_for()
  ok('two actual NovoPedido tabs share server reservation')
  await b.get_by_role('button',name='Verificar e encerrar envio anterior',exact=True).click();await b.get_by_text('Envio anterior encerrado sem pedido.',exact=False).wait_for()
  state['loseadvance']=True;await b.get_by_role('button',name='Iniciar nova tentativa',exact=True).click();await b.get_by_text('Não foi possível confirmar o envio anterior.',exact=False).wait_for();state['loseadvance']=False
  await a.get_by_role('button',name='Verificar envio anterior',exact=True).click();await a.get_by_text('Tentativa identificada pelo servidor.',exact=False).wait_for();ok('A uncertain / B close+advance lost ACK / A recovers server generation',state['generation']==2)
  await b.close();b=await tab();await b.get_by_text('Tentativa identificada pelo servidor.',exact=False).wait_for();ok('reopen after lost advance ACK recovers same generation without cache deletion',state['generation']==2)
  # Retain obsolete local uncertainty in a separate same-origin context, as if B never observed terminal state.
  lag=await browser.new_context(viewport={'width':1280,'height':1800});await lag.route('**/*',route);c=await lag.new_page();await c.goto('http://localhost:8080/__durable_test');await c.get_by_role('button',name='Adicionar ao pedido',exact=True).wait_for()
  await c.evaluate("async()=>{const q=await new Promise(res=>{let r=indexedDB.open('c2-order-journal-v1',1);r.onsuccess=()=>res(r.result)});await new Promise(res=>{const t=q.transaction('slots','readwrite');t.objectStore('slots').openCursor().onsuccess=e=>{const c=e.target.result;if(c)c.update({schema:1,key:'44444444-4444-4444-8444-444444444444',generation:1,state:'uncertain'})};t.oncomplete=res});q.close()}")
  await c.get_by_role('button',name='Verificar envio anterior',exact=True).click();await c.get_by_text('Tentativa identificada pelo servidor.',exact=False).wait_for();ok('stale uncertain IndexedDB is reconciled by canonical predecessor, not cleared');await c.close();await lag.close()
  activekey=state['key']
  await fill(a);await fill(b);state['failcreate']=True
  await asyncio.gather(a.get_by_role('button',name='Enviar pedido para análise',exact=True).click(),b.get_by_role('button',name='Enviar pedido para análise',exact=True).click());await asyncio.sleep(.7)
  ok('controlled HTTP lost replies create one order with server key',list(state['orders'])==[activekey]);await a.screenshot(path=str(OUT/'1_lost.png'))
  await a.close();await b.close();state['failcreate']=False;a=await tab();await a.get_by_text('Pedido PB-LOCAL já registrado.',exact=False).wait_for();ok('close and reopen finds committed server order without cart');await a.screenshot(path=str(OUT/'2_recovered.png'))
  await a.evaluate("async()=>{await new Promise((res,rej)=>{let q=indexedDB.deleteDatabase('c2-order-journal-v1');q.onsuccess=res;q.onerror=rej})}");await a.close();a=await tab();await a.get_by_text('Pedido PB-LOCAL já registrado.',exact=False).wait_for();ok('total IndexedDB loss does not create first-use key')
  a.on('dialog',lambda d:d.dismiss());await a.get_by_role('button',name='Confirmar pedido existente e iniciar novo',exact=True).click();ok('dismissed confirmation never advances',state['generation']==2)
  await a.close();a=await tab();a.on('dialog',lambda d:d.accept());await a.get_by_role('button',name='Confirmar pedido existente e iniciar novo',exact=True).click();await a.get_by_text('Tentativa identificada pelo servidor.',exact=False).wait_for();ok('explicit ACK carries exact UUID and CAS',state['generation']==3 and state['calls'][-1][1].get('p_ack_order')==ID)
  await a.get_by_role('button',name='Verificar e encerrar envio anterior',exact=True).click();await a.get_by_text('Envio anterior encerrado sem pedido.',exact=False).wait_for();ok('close never auto-advances',state['generation']==3);await a.screenshot(path=str(OUT/'3_closed.png'))
  await a.close();a=await tab();await a.get_by_text('Envio anterior encerrado sem pedido.',exact=False).wait_for();ok('reopen closed waits explicit new-attempt click',state['generation']==3)
  state['bad']='unknown';await a.close();a=await tab();await a.get_by_text('Não foi possível confirmar o envio anterior.',exact=False).wait_for();ok('unknown canonical receipt blocks rather than deadend fallback');state['bad']=None
  await a.close();await ctx.clear_cookies();a=await tab();await a.evaluate("async()=>{await new Promise((res,rej)=>{let q=indexedDB.deleteDatabase('c2-order-journal-v1');q.onsuccess=res;q.onerror=rej})}");await a.close();state['cap']='missing';a=await tab();await a.get_by_role('button',name='Adicionar ao pedido',exact=True).wait_for();await asyncio.sleep(.2);ok('RPC absent in fresh tab preserves legacy 001b',await a.locator('[data-journal]').count()==0);await a.close()
  state['cap']='error';a=await tab();await a.get_by_text('Não foi possível confirmar o envio anterior.',exact=False).wait_for();ok('capability network/server error is not missing fallback');await a.close()
  state['cap']='active';state['revoke']=True;a=await tab();await a.evaluate('window.testReady=false');await asyncio.sleep(.5);ok('revoked during recovery never exposes committed receipt',await a.get_by_text('Pedido PB-LOCAL já registrado.',exact=False).count()==0);await a.close();state['revoke']=False
  a=await ctx.new_page();await a.goto('http://localhost:8080/__durable_test');await a.evaluate('window.testActor="77777777-7777-4777-8777-777777777777"');await a.get_by_text('Não foi possível confirmar o envio anterior.',exact=False).wait_for();ok('foreign actor capability fails closed without order reveal',await a.get_by_text('Pedido PB-LOCAL já registrado.',exact=False).count()==0);await a.close()
  a=await ctx.new_page();await a.goto('http://localhost:8080/__durable_test');await a.evaluate("()=>{IDBFactory.prototype.open=()=>{throw Error('denied')}}");await a.get_by_text('Não foi possível confirmar o envio anterior.',exact=False).wait_for();ok('real browser storage failure prevents dispatch');await a.close()
  print('TOTAL',len(passes),'PASS React/HTTP/IndexedDB real; synthetic Auth, no hosted writes');await browser.close()
asyncio.run(main())

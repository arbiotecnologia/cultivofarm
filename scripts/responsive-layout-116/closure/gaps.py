import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
R=Path('/dev-server/scripts/responsive-layout-116');O=R/'closure';ns={};exec((R/'specific/run.py').read_text().split('async def main():')[0],ns)
CASES=[{'ids':[68,69],'file':'src/pages/Configuracoes.tsx','export':'default','route':'/configuracoes','profiles':['administrador'],'kind':'config-new','tab':'Usuários','open':'Novo Usuário','expected':'Interno','trigger':'Configurações > Usuários > Novo Usuário'}, {'ids':[52],'file':'src/components/visita/EvidenciasTabs.tsx','export':'EvidenciasTabs','route':'/visita-tecnica/33333333-3333-4333-8333-333333333333','profiles':['administrador','gestor','consultor_tecnico','tecnico_agronomo'],'kind':'evidence','expected':'Fotos','trigger':'Visita > Evidências > Fotos/Notas'}, {'ids':[110],'file':'src/pages/portal/PortalAcompanhamento.tsx','export':'default','route':'/portal/acompanhamento','profiles':['cliente_produtor','administrador','gestor'],'kind':'history','tab':'Histórico','expected':'Todas as fazendas','trigger':'Portal produtor vinculado > Acompanhamento > Histórico > Fazendas'}, {'ids':[113],'file':'src/pages/portal/PortalOrdensServico.tsx','export':'default','route':'/portal/ordens-servico','profiles':['cliente_produtor','administrador','gestor'],'kind':'laudo','open':'Laudo Digital','expected':'Laudo de Análise','trigger':'Portal produtor > OS com laudo > Ver laudo'}, {'ids':[100],'file':'src/pages/comercial/PedidosB2B.tsx','export':'default','route':'/comercial/pedidos','profiles':['administrador','gestor_comercial'],'kind':'order','open':'Abrir','expected':'Pedido QA-116','trigger':'Comercial > Pedidos > Detalhes'}, {'ids':[75],'file':'src/pages/Entregas.tsx','export':'default','route':'/entregas','profiles':['administrador','gestor','administrativo'],'kind':'delivery-proof','open':'Evidências','expected':'Evidências e termos','trigger':'Entregas > entrega > Evidências'}, {'ids':[101],'file':'src/pages/configuracoes/FiscalProdutos.tsx','export':'default','route':'/configuracoes/fiscal/produtos','profiles':['administrador','gestor','financeiro'],'kind':'fiscal-filter','expected':'Produtos','trigger':'Fiscal > Produtos > Filtrar por tipo de item'}, {'ids':[112],'file':'src/pages/portal/PortalLayout.tsx','export':'default','route':'/portal','profiles':['cliente_produtor','administrador','gestor'],'kind':'producer-picker','expected':'Produtor sintético','trigger':'Portal produtor com dois vínculos > seletor de cliente'}, {'ids':[116],'file':'src/pages/portal-parceiro/PortalParceiroLayout.tsx','export':'default','route':'/portal-parceiro/fichas','profiles':['administrador','gestor_comercial'],'kind':'partner-picker','expected':'Ver como','trigger':'Portal parceiro interno > Ver como'}, {'ids':[88],'file':'src/pages/app/MobileVisitaWizard.tsx','export':'default','route':'/app/visita/33333333-3333-4333-8333-333333333333','profiles':['administrador','gestor','consultor_tecnico','tecnico_agronomo'],'kind':'wizard-full','expected':'Identificação','trigger':'Campo > Visita existente > Identificação'}]
BOOT=ns['BOOT'].replace("const props={};", "const props={};if(d.kind==='evidence')Object.assign(props,{registroId:id,arquivos:[],notes:[{id:'note',texto:'Nota sintética contextualizada'}],onNotesChange:noop});")
async def main():
 batch=int(sys.argv[1]);
 async with async_playwright() as p:
  b=await p.chromium.launch();c=await b.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');page=await c.new_page();page.set_default_timeout(5000);current=None;errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  async def intercept(r):
   if not r.request.url.startswith('http://localhost:8080'):return await r.abort()
   path=r.request.url.split('http://localhost:8080')[-1].split('?')[0]
   if path=='/src/hooks/useAuth.tsx':return await r.fulfill(content_type='application/javascript',body=ns['ns']['AUTH'])
   if path=='/src/integrations/supabase/client.ts':return await r.fulfill(content_type='application/javascript',body=(O/'fixtures.js').read_text())
   if path=='/__specific-read-fixtures.js':return await r.fulfill(content_type='application/javascript',body=(R/'specific/read-fixtures.js').read_text())
   if r.request.resource_type=='document':return await r.fulfill(content_type='text/html',body=ns['ns']['HTML'].replace("import App from '/src/App.tsx';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));",BOOT.replace('DRIVER',json.dumps(current))))
   f=ns['TMP']/'modules'/path.lstrip('/').replace('/','__')
   if f.is_file():return await r.fulfill(content_type='application/javascript',body=f.read_text())
   await r.continue_()
  await c.route('**/*',intercept)
  for ix,d in enumerate(CASES):
   if ix%3!=batch:continue
   current=d;dest=O/f'gap-{d["ids"][0]}.json';records=json.loads(dest.read_text()) if dest.exists() else []
   for role in d['profiles']:
    for w,h in [(390,844),(1440,900)]:
     if any(r['profile']==role and r['viewport']==[w,h] for r in records):continue
     errs.clear();rec={'ids':d['ids'],'profile':role,'viewport':[w,h],'trigger':d['trigger'],'route':d['route'],'mode':'ORIGINAL_COMPONENT_NORMAL_TRIGGER_SYNTHETIC_READS','assertions':[]}
     try:
      await page.set_viewport_size({'width':w,'height':h});await page.goto('http://localhost:8080'+d['route']+'?reviewRole='+role);await page.wait_for_timeout(650)
      if d.get('tab'):await page.get_by_role('tab',name=d['tab'],exact=True).click();await page.wait_for_timeout(700)
      if d.get('open'):await page.get_by_role('button',name=d['open'],exact=False).first.click();await page.wait_for_timeout(350)
      if d['kind']=='partner-picker' and w==390:
       assert await page.get_by_text('Ver como',exact=True).is_hidden();rec['status']='N_A_MOBILE_HIDDEN_BY_CODE';rec['assertions'].append('staff selector hidden below sm')
      else:
       await page.get_by_text(d['expected'],exact=False).first.wait_for()
       for i in d['ids']:
        target=page.locator(f'[data-review-occurrence="{i}"]:visible').first;await target.wait_for();await target.scroll_into_view_if_needed();rec['assertions'].append({'id':i,'box':await target.evaluate(ns['MEASURE'])})
       if d['kind'] in ['history','fiscal-filter','partner-picker']:
        target=page.locator(f'[data-review-occurrence="{d["ids"][0]}"]:visible').first;await target.click();option=page.get_by_role('option').last;await option.scroll_into_view_if_needed();assert await option.is_visible();await page.keyboard.press('Escape');rec['assertions'].append('option-last-accessible')
       if d['kind']=='producer-picker':
        await page.locator('[data-review-occurrence="112"]:visible').click();await page.get_by_role('option').last.scroll_into_view_if_needed();rec['assertions'].append('second linked producer option visible')
       container=page.get_by_role('dialog').last if await page.get_by_role('dialog').count() else page.locator('main').first
       useful=container.locator('input,textarea,button,[role=option]').filter(visible=True).filter(has_not=page.locator('.sr-only'));last=useful.last if await useful.count() else container.get_by_role('button',name='Fechar',exact=True).last
       await last.scroll_into_view_if_needed();box=await last.evaluate(ns['MEASURE']);assert box['within'];rec['assertions'].append({'last_useful':box,'enabled':await last.is_enabled()});assert not errs;rec['status']='PASS_CONTEXTUAL_TRIGGER'
     except Exception as e:rec['status']='GAP';rec['error']=str(e)[:400]
     shot=O/f'gap-{d["ids"][0]}-{role}-{w}.png';await page.screenshot(path=str(shot));rec['evidence']=str(shot.relative_to(R));rec['errors']=errs.copy();rec['reads']=await page.evaluate('window.reviewCalls||[]');records.append(rec);dest.write_text(json.dumps(records,ensure_ascii=False,separators=(',',':')));print(d['ids'],role,w,rec['status'],rec.get('error','')[:65],flush=True)
  await b.close()
asyncio.run(main())

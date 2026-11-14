import asyncio,json,sys,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/dev-server/scripts/responsive-layout-116');OUT=ROOT/'specific';TMP=Path('/tmp/browser/responsive-116');ns={};exec((ROOT/'harness/survey.py').read_text().split('async def run():')[0],ns)
BOOT="""import {QueryClient,QueryClientProvider} from '/node_modules/.vite/deps/@tanstack_react-query.js?v=884d3db8';import {MemoryRouter,Routes,Route} from '/node_modules/.vite/deps/react-router-dom.js?v=39152e0a';import {FormProvider,useForm} from '/node_modules/.vite/deps/react-hook-form.js?v=92547c8d';import {TooltipProvider} from '/src/components/ui/tooltip.tsx';const e=React.createElement,d=DRIVER,id='33333333-3333-4333-8333-333333333333';const m=await import('/'+d.file),C=m[d.export];const noop=()=>{};const row={id,nome:'Produto sintético de leitura completa',tipo:'produto',ativo:true,status:'programada',created_at:'2026-11-14',data_programada:'2026-11-20',numero_os:'QA-116',prioridade:'alta',volume_total_ml:20000,produtos:{nome:'Produto sintético'},fazendas:{nome:'Fazenda sintética'},talhoes:{nome:'Talhão sintético'}};const props={};if(d.kind==='client-form'){props.clienteId=id;props.initialTab=d.tab.toLowerCase()};if(d.kind==='plots')props.fazendaId=id;if(d.kind==='fiscal-combo')Object.assign(props,{catalogType:'CFOP',value:'5101',onChange:noop,multiline:true});if(d.kind==='pdf')props.data={empresa:{nome:'Empresa sintética'},cliente:'Produtor sintético',fazenda:'Fazenda sintética',talhao:'Talhão sintético',dataVisita:'2026-11-14',status:'rascunho',descricaoTecnica:'Descrição técnica contextualizada',fotos:[]};if(d.kind==='plan')Object.assign(props,{readOnly:false,registroId:id,observacoesAtuais:'',clienteId:id,fazendaId:id,talhaoId:id,consultorId:id,onUpdate:noop});if(d.kind==='billing-base')Object.assign(props,{open:true,onOpenChange:noop,osId:id,osTipo:'TRADICIONAL',onSuccess:noop});if(d.kind==='dossier-action')Object.assign(props,{productId:id,name:'Produto sintético',code:'QA-116'});if(d.kind==='org-editor')Object.assign(props,{organizationId:'22222222-2222-4222-8222-222222222222',onVoltar:noop,onAbrirAdministradores:noop,onAbrirAssinaturas:noop,onAbrirHistorico:noop});if(d.kind==='wizard-rec'||d.kind==='wizard-review')Object.assign(props,{localRegistroId:id,remoteRegistroId:id,locked:false,onDone:noop});if(d.kind==='cart'){const v={id,item_tipo:'produto',produto_id:id,microrganismo_id:null,volume_ml:20000,rotulo:'20 L',preco_brl:200,moeda:'BRL',ativo:true,ordem:1};Object.assign(props,{open:true,onOpenChange:noop,row,doseRecomendadaLitroHa:1,volumesCat:{porProdutoId:new Map([[id,[v]]]),porMicrorganismoId:new Map()},volumesStatus:'success',onConfirm:noop,supplierName:'Fornecedor sintético contextualizado'});}if(d.kind==='product-profile'||d.kind==='micro-profile'){Object.assign(props,{open:true,onOpenChange:noop,produto:{...row,codigo:'QA-116'},micro:{...row,nome_cientifico:'Bacillus sintético',tipo:'bacteria',codigo:'QA-116'}});}if(d.kind==='platform')Object.assign(props,{kind:'cultura',scope:'synthetic-platform'});if(d.kind==='os-table')Object.assign(props,{ordens:[row,{...row,id:'44444444-4444-4444-8444-444444444444',status:'entregue',numero_os:'QA-117'}],onOpen:noop});class Boundary extends React.Component{constructor(p){super(p);this.state={err:null}}static getDerivedStateFromError(err){return {err:String(err)}}render(){return this.state.err?e('pre',{'data-error':true},this.state.err):this.props.children}}function Fixture(){const form=useForm({defaultValues:{codigo_cliente:'QA-116',nome:'Produtor contextualizado com nome extenso',tipo_pessoa:'pf',status_cliente:'ativo',condicao_pagamento_unidade:'dias',condicao_pagamento_valor:'30',telefones:[],contatos:[]}});return e(FormProvider,form,e(C,props))}const q=new QueryClient({defaultOptions:{queries:{retry:false}}});ReactDOM.createRoot(document.getElementById('root')).render(e(QueryClientProvider,{client:q},e(MemoryRouter,{initialEntries:[d.route]},e(TooltipProvider,null,e(Boundary,null,e(Routes,null,e(Route,{path:d.route.includes('/portal/')?d.route.replace(id,':id'):'*',element:e('main',{className:'p-4 min-w-0'},e(Fixture))})))))));
"""
MEASURE="""el=>{let r=el.getBoundingClientRect();return {text:el.textContent||el.value||'',rect:r.toJSON(),visible:r.width>0&&r.height>0,within:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,clipped:el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2}}"""
async def main():
 drivers=json.loads((OUT/'drivers.json').read_text());batch=int(sys.argv[1]) if len(sys.argv)>1 else 0
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);ctx=await b.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');page=await ctx.new_page();page.set_default_timeout(3500);current=None;errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def intercept(r):
   if not r.request.url.startswith('http://localhost:8080'):return await r.abort()
   path=r.request.url.split('http://localhost:8080')[-1].split('?')[0]
   if path=='/src/hooks/useAuth.tsx':return await r.fulfill(content_type='application/javascript',body=ns['AUTH'])
   if path=='/src/integrations/supabase/client.ts':return await r.fulfill(content_type='application/javascript',body=(OUT/'read-fixtures.js').read_text())
   if r.request.resource_type=='document':return await r.fulfill(content_type='text/html',body=ns['HTML'].replace("import App from '/src/App.tsx';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));",BOOT.replace('DRIVER',json.dumps(current))))
   f=TMP/'modules'/path.lstrip('/').replace('/','__')
   if f.exists():return await r.fulfill(content_type='application/javascript',body=f.read_text())
   await r.continue_()
  await ctx.route('**/*',intercept)
  for index,d in enumerate(drivers):
   if index%3!=batch:continue
   current=d;dest=OUT/('driver-'+str(d['ids'][0])+'.json');records=json.loads(dest.read_text()) if dest.exists() else []
   for role in d['profiles']:
    for w,h in [(390,844),(1440,900)]:
     if any(x['profile']==role and x['viewport']==[w,h] for x in records):continue
     rec={'ids':d['ids'],'profile':role,'viewport':[w,h],'route':d['route'],'trigger':d['trigger'],'validation':'ISOLATED_ORIGINAL_WITH_CONTEXTUAL_READS','assertions':[],'artifacts':[]};errors.clear()
     try:
      await page.set_viewport_size({'width':w,'height':h});await page.goto('http://localhost:8080'+d['route']+'?reviewRole='+role,wait_until='domcontentloaded');await page.wait_for_timeout(350)
      if d['kind']=='producer-farm':
       title=page.locator('h1').first;g=await title.evaluate(MEASURE);assert not g['clipped'],'farm title clipped';rec['assertions'].append({'farm_title':g})
      if d.get('tab'):await page.get_by_role('tab',name=d['tab'],exact=True).click()
      # Capture a specific page/filter before opening the known dialog.
      if d['kind']=='application':
       await page.get_by_text('Aplicador sintético',exact=True).first.click()
      if d['kind']=='cashflow':
       await page.get_by_role('button',name='Ver títulos de').first.click()
      if False and d['kind']=='stock':
       await page.locator('[data-review-occurrence="78"]').click();await page.get_by_role('option').last.scroll_into_view_if_needed();await page.keyboard.press('Escape')
      if d.get('open'):await page.get_by_role('button',name=d['open'],exact=d['kind'] in ['receipt','platform']).first.click()
      if d['kind']=='fiscal-combo':await page.get_by_test_id('fiscal-catalog-cfop').click();await page.get_by_role('option').last.scroll_into_view_if_needed()
      if d['kind']=='cart':
       await page.locator('input').first.fill('20')
      if d['kind']=='partner-sheets':
       await page.locator('iframe').wait_for(state='visible')
      if d['kind']=='pdf':await page.locator('iframe').wait_for(state='visible');rec['assertions'].append({'pdf_iframe':True})
      await page.get_by_text(d['expected'],exact=False).first.wait_for(state='visible');rec['assertions'].append({'contextual_content':True})
      for id in ([] if d['kind']=='cockpit-na' else [39] if d['kind']=='micro-filter-na' else d['ids']):
       loc=page.locator(f'[data-review-occurrence="{id}"]:visible').first;await loc.wait_for(state='visible');await loc.scroll_into_view_if_needed();g=await loc.evaluate(MEASURE);rec['assertions'].append({'id':id,'target':g});assert g['visible'], 'target invisible'
      if d['kind']=='micro-filter-na':
       assert await page.locator('[data-review-occurrence="40"]:visible').count()==0;assert await page.get_by_role('button',name='Novo Microrganismo').count()==0;rec['assertions'].append({'global_editor_absent':True});rec['classification']='ID40_N_A_GLOBAL_EDITOR_CLOSED'
      if d['kind']=='cockpit-na':
       assert await page.locator('[data-review-occurrence]').count()==0;rec['assertions'].append({'legacy_controls_absent':True});rec['classification']='N_A_RETIRED_WORKSPACE_CURRENT_ROUTE_PROVED'
      tabs=page.get_by_role('tab')
      if await tabs.count() and d['kind'] not in ['client-form']:
       for t in [tabs.first,tabs.last]:await t.click();rec['assertions'].append({'tab':await t.inner_text(),'selected':await t.get_attribute('aria-selected')})
      container=page.locator('[role=dialog],[role=alertdialog]').last if await page.locator('[role=dialog],[role=alertdialog]').count() else page.locator('main').first
      useful=container.locator('input,textarea,button,[role=option]').filter(visible=True).filter(has_not=page.locator('.sr-only'))
      if d['kind']=='cashflow':
       row=container.locator('tbody tr').last;await row.scroll_into_view_if_needed();rg=await row.evaluate(MEASURE);assert rg['visible'];rec['assertions'].append({'last_read_row':rg});last=container.get_by_role('button',name='Fechar',exact=True).last
      else:last=useful.last if await useful.count() else container.get_by_role('button',name='Fechar',exact=True).last
      await last.scroll_into_view_if_needed();g=await last.evaluate(MEASURE);assert g['within'],'last control outside viewport';rec['assertions'].append({'last_control':g})
      labels=await container.locator('label,[role=tab],h2').evaluate_all('(xs)=>xs.filter(x=>x.getBoundingClientRect().height).filter(x=>x.scrollWidth>x.clientWidth+2||x.scrollHeight>x.clientHeight+2).map(x=>x.textContent)');rec['clipped_labels']=labels
      assert not errors,'page errors';assert not labels,'clipped labels: '+str(labels)
      rec['result']='PASS_ASSERTED_CONTEXT_AND_LAST_CONTROL'
     except Exception as e:rec['result']='GAP_OR_DEFECT';rec['error']=str(e)[:450]
     shot=OUT/f"specific-{d['ids'][0]}-{role}-{w}.png";await page.screenshot(path=str(shot),animations='disabled');rec['artifacts'].append(str(shot.relative_to(ROOT)));rec['errors']=list(errors);rec['reads']=await page.evaluate('window.reviewCalls||[]');rec['blocked_writes']=await page.evaluate('window.reviewWrites||[]');records.append(rec);dest.write_text(json.dumps(records,ensure_ascii=False,separators=(',',':')));print(d['ids'],role,w,rec['result'],rec.get('error','')[:80],flush=True)
  await b.close()
asyncio.run(main())

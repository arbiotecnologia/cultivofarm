import asyncio,json,re,sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/dev-server/scripts/responsive-layout-116');BASE=Path('/tmp/browser/responsive-116');OUT=ROOT/'isolated';OUT.mkdir(exist_ok=True)
ns={};exec((BASE/'survey.py').read_text().split('async def run():')[0],ns);AUTH=ns['AUTH'];CLIENT=(BASE/'fixtures.js').read_text();items=json.loads((ROOT/'component-manifest.json').read_text());batch=int(sys.argv[1]);ROLES=['administrador','gestor','consultor_tecnico','aplicador','operador_onfarm','cliente_produtor','administrativo','tecnico_agronomo','producao','financeiro','gestor_comercial','vendedor','parceiro_b2b','parceiro_b2b_tecnico','superadmin']
BOOT='''import {QueryClient,QueryClientProvider} from '/node_modules/.vite/deps/@tanstack_react-query.js?v=884d3db8';import {MemoryRouter} from '/node_modules/.vite/deps/react-router-dom.js?v=39152e0a';import {FormProvider,useForm} from '/node_modules/.vite/deps/react-hook-form.js';import {TooltipProvider} from '/src/components/ui/tooltip.tsx';import {getAccessLevel} from '/src/lib/permissions.ts';const e=React.createElement;const m=MANIFEST;const noop=()=>{};const id='33333333-3333-4333-8333-333333333333',org='22222222-2222-4222-8222-222222222222';const row={id,nome:'Nome de homologação representativo e extenso para verificar o conteúdo completo',codigo:'QA-RESP',codigo_lote:'QA-RESP',tipo:'solo',ativo:true,status:'ativo',organization_id:org,owner_organization_id:org,updated_at:'2026-11-14T00:00:00Z',cliente_id:id,produto_id:id,fazenda_id:id,talhao_id:id,quantidade:10,volume:20,unidade:'L'};const props={tipo:'produto',target:{...row,programacao_id:id,os_id:id,origem:'manual',lote_id:id,produto_id:id,volume_solicitado:20},dados:[row],origem:'visitas',open:true,onOpenChange:noop,onClose:noop,onSaved:noop,kind:'produto',parentId:id,registroId:id,clienteId:id,productId:id,produtoId:id,arquivos:[],notes:[],onNotesChange:noop,entrega:row,product:row,item:row,produto:row,microrganismo:row,lote:row,os:row,form:row,setForm:noop,onChange:noop,errors:{},progress:{total:2,completed:0,failed:1,current:'Arquivo com nome longo.pdf'},items:[{id:'1',status:'error',file:{name:'Documento representativo com nome completo.pdf',size:10000},error:'Falha sintética para conferir ação de retomada'},{id:'2',status:'queued',file:{name:'Arquivo pendente.pdf',size:10000}}],onRetryFailed:noop,onCancelAll:noop,onCancelItem:noop,params:{},pdfData:{},data:[],disabled:false};for(const p of m.props){if(p.name in props)continue;if(p.type.includes('=>'))props[p.name]=noop;else if(p.type==='boolean')props[p.name]=true;else if(p.type==='number')props[p.name]=1;else if(p.type.includes('[]'))props[p.name]=[];else if(p.type==='string')props[p.name]=p.name.toLowerCase().includes('id')?id:'Conteúdo representativo completo';}const mod=await import('/'+m.file);if(m.id===35)m.export='PlatformCatalogStatusDialog';const C=mod[m.export];if(m.file.includes('/plataforma/')){const {platformCatalogAccess}=await import('/src/lib/catalogo/platformCatalogRead.ts');const {useAuth}=await import('/src/hooks/useAuth.tsx');props.scope=platformCatalogAccess(useAuth()).scope;props.convite={...row,nome:row.nome,email:'qa@example.invalid',status:'ativo',cpf_cnpj:null};props.convidar={mutate:noop,isPending:false};props.mudancaPendente=null;props.empresaNome=row.nome;}window.reviewComponent=m.export;window.reviewEligible=m.routes.length?ROLES.filter(r=>m.routes.some(x=>getAccessLevel(r,x.path)!=='none')):[];class Boundary extends React.Component{constructor(p){super(p);this.state={error:null}}static getDerivedStateFromError(e){return {error:String(e)}}render(){return this.state.error?e('pre',{'data-mount-error':true},this.state.error):this.props.children}}function FormFixture(){const f=useForm({defaultValues:row});return e(FormProvider,f,e(C,props))}const q=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});ReactDOM.createRoot(document.getElementById('root')).render(e(QueryClientProvider,{client:q},e(MemoryRouter,{initialEntries:[m.routes[0]?.path||'/configuracoes']},e(TooltipProvider,null,e(Boundary,null,e('main',{className:'p-4 min-w-0'},e(FormFixture))))))); '''
GEOM='''e=>{const r=e.getBoundingClientRect();const nodes=[...e.querySelectorAll('button,label,[role=tab],h2,h3')].filter(n=>n.getBoundingClientRect().height>0);const clipped=nodes.filter(n=>n.scrollWidth>n.clientWidth+2||n.scrollHeight>n.clientHeight+2).map(n=>({t:n.textContent.slice(0,120),w:n.clientWidth,sw:n.scrollWidth,h:n.clientHeight,sh:n.scrollHeight}));const tabs=[...e.querySelectorAll('[role=tab]')].map(n=>({t:n.textContent,r:n.getBoundingClientRect().toJSON()}));return {id:e.dataset.reviewOccurrence,rect:r.toJSON(),clipped,tabs,text:e.textContent.slice(0,1500)}}'''
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);ctx=await b.new_context(viewport={'width':390,'height':844}, reduced_motion='reduce');page=await ctx.new_page();page.set_default_timeout(1000);page.set_default_navigation_timeout(30000);current=None;errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   u=r.request.url
   if not u.startswith('http://localhost:8080'):return await r.abort()
   path=u.split('http://localhost:8080')[-1].split('?')[0]
   if path=='/src/hooks/useAuth.tsx':return await r.fulfill(content_type='application/javascript',body=AUTH)
   if path=='/src/integrations/supabase/client.ts':return await r.fulfill(content_type='application/javascript',body=CLIENT)
   if r.request.resource_type=='document':
    boot=BOOT.replace('MANIFEST',json.dumps(current)).replace('ROLES',json.dumps(ROLES));html=ns['HTML'].replace("import App from '/src/App.tsx';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));",boot);return await r.fulfill(content_type='text/html',body=html)
   f=BASE/'modules'/path.lstrip('/').replace('/','__')
   if f.is_file():return await r.fulfill(content_type='application/javascript',body=f.read_text())
   await r.continue_()
  await ctx.route('**/*',route)
  for m in items:
   if (m['id']-1)%4!=batch:continue
   checkpoint=OUT/f"{m['id']:03}.json"
   if checkpoint.exists():continue
   current=m;partial=checkpoint.with_suffix('.partial.json');records=json.loads(partial.read_text())['scenarios'] if partial.exists() else []
   # One isolated original-component fixture per eligible profile, not authorization proof.
   path=m['routes'][0]['path'] if m['routes'] else ''
   profiles=['superadmin'] if '/plataforma' in path or m['file'].startswith('src/components/plataforma') else ['administrador']
   await page.goto('http://localhost:8080/__isolated?reviewRole=administrador',wait_until='domcontentloaded');await page.wait_for_timeout(400)
   eligible=await page.evaluate('window.reviewEligible||[]');profiles=eligible or profiles
   if m['id'] in [48,52,55,56]:profiles=['administrador','gestor','consultor_tecnico','tecnico_agronomo']
   if m['id'] in [68,69,70,71,72]:profiles=['administrador']
   for role in profiles:
    for w,h in [(390,844),(1440,900)]+([(320,568),(464,522)] if 'Dialog' in m['tag'] or m['tag']=='TabsList' else []):
     if any(r['profile']==role and r['viewport']==[w,h] for r in records):continue
     errors.clear();await page.set_viewport_size({'width':w,'height':h});await page.goto('http://localhost:8080/__isolated?reviewRole='+role,wait_until='domcontentloaded');await page.wait_for_timeout(120)
     rec={'profile':role,'viewport':[w,h],'mode':'ISOLATED_ORIGINAL_COMPONENT','states':[]}
     async def capture(label):
      loc=page.locator(f'[data-review-occurrence="{m["id"]}"]:visible');geom=[]
      for x in await loc.all():
       try:await x.scroll_into_view_if_needed(timeout=400);geom.append(await x.evaluate(GEOM))
       except:pass
      if geom:
       shot=OUT/f'{m["id"]:03}-{role}-{w}-{label}.png';await page.screenshot(path=str(shot),animations='disabled',timeout=5000);rec['states'].append({'step':label,'artifact':str(shot.relative_to(ROOT)),'geometry':geom})
     await capture('entry')
     # Real first/last tabs and ordinary dialog openers; no dispatch buttons.
     for tabs in await page.locator('[role=tablist]:visible').all():
      for index in [0,-1]:
       try:
        t=tabs.get_by_role('tab').first if index==0 else tabs.get_by_role('tab').last;await t.click(timeout=350);await page.wait_for_timeout(80);await capture('tab'+str(index))
       except:pass
     if not rec['states']:
      for button in (await page.get_by_role('button').all())[:12]:
       try:
        text=(await button.inner_text()).strip()
        if await button.is_visible() and await button.is_enabled() and re.match(r'^(Novo|Nova|Adicionar|Cadastrar|Editar|Gerenciar|Detalhes)',text) and not re.search(r'Salvar|Enviar|Aprovar|Publicar',text):await button.click(timeout=350);await page.wait_for_timeout(80);await capture('open')
        if rec['states']:break
       except:pass
     for d in await page.locator('[role=dialog]:visible').all():
      try:
       controls=d.locator('button,input,textarea');await controls.last.scroll_into_view_if_needed(timeout=400);await capture('last-action')
      except:pass
     if rec['states']:rec['status']='MOUNTED_GEOMETRY_RECORDED_NOT_VISUAL_APPROVAL'
     else:
      rec['status']='NOT_MOUNTED_FIXTURE_GAP';rec['body']=(await page.locator('body').inner_text())[:1200];shot=OUT/f'{m["id"]:03}-{role}-{w}-gap.png';await page.screenshot(path=str(shot),animations='disabled',timeout=5000);rec['artifact']=str(shot.relative_to(ROOT))
     rec['errors']=list(errors);rec['writes']=await page.evaluate('window.reviewWrites||[]');records.append(rec);checkpoint.with_suffix('.partial.json').write_text(json.dumps({'id':m['id'],'file':m['file'],'scenarios':records},ensure_ascii=False,separators=(',',':')))
   checkpoint.write_text(json.dumps({'id':m['id'],'file':m['file'],'scenarios':records},ensure_ascii=False,separators=(',',':')));print(m['id'],len(records),sum(bool(r['states']) for r in records),flush=True)
  await b.close()
asyncio.run(main())

import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
R=Path('/dev-server/scripts/responsive-layout-116');O=R/'last16/id3';ns={};exec((R/'harness/survey.py').read_text().split('async def run():')[0],ns)
BOOT="""import {QueryClient,QueryClientProvider} from '/node_modules/.vite/deps/@tanstack_react-query.js?v=884d3db8';import {MemoryRouter,Routes,Route} from '/node_modules/.vite/deps/react-router-dom.js?v=39152e0a';import {TooltipProvider} from '/src/components/ui/tooltip.tsx';import {RoleGuard} from '/__role-guard.js';import Commercial from '/src/pages/comercial/ComercialNovoPedido.tsx';import Seller from '/src/pages/comercial/VendedorNovoPedido.tsx';import Portfolio from '/src/pages/comercial/MinhaCarteiraVendedor.tsx';import Order from '/src/pages/portal-parceiro/NovoPedido.tsx';const e=React.createElement,q=new QueryClient({defaultOptions:{queries:{retry:false}}});const order=e(Route,{index:true,element:e(Order)});const routes=e(Routes,null,e(Route,{path:'/comercial/pedidos-b2b/novo',element:e(RoleGuard,null,e(Commercial))},order),e(Route,{path:'/comercial/minha-carteira/pedido',element:e(RoleGuard,null,e(Seller))},order),e(Route,{path:'/comercial/minha-carteira',element:e(RoleGuard,null,e(Portfolio))}),e(Route,{path:'*',element:e('p',{'data-denied':true},'Guard original negou acesso')}));const tree=e(QueryClientProvider,{client:q},e(MemoryRouter,{initialEntries:[START]},e(TooltipProvider,null,e('main',{className:'p-4 min-w-0'},routes))));ReactDOM.createRoot(document.getElementById('root')).render(tree);"""
BOX="""e=>{let r=e.getBoundingClientRect();return {text:e.textContent||e.value,rect:r.toJSON(),within:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,clipped:e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2}}"""
async def main():
 role=sys.argv[1] if len(sys.argv)>1 else 'administrador';rows=[];current=None;errors=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');page=await c.new_page();page.set_default_timeout(6000);page.on('pageerror',lambda e:errors.append(str(e)))
  async def intercept(r):
   if not r.request.url.startswith('http://localhost:8080'):return await r.abort()
   path=r.request.url.split('http://localhost:8080')[-1].split('?')[0]
   if path=='/src/hooks/useAuth.tsx':return await r.fulfill(content_type='application/javascript',body=ns['AUTH'])
   if path=='/src/integrations/supabase/client.ts':return await r.fulfill(content_type='application/javascript',body=(O/'fixtures.js').read_text())
   if path=='/__base-reads.js':return await r.fulfill(content_type='application/javascript',body=(R/'last16/read-fixtures.js').read_text())
   if path=='/__role-guard.js':
    s=Path('/dev-server/src/App.tsx').read_text();a=s.index('export function RoleGuard(');z=s.index('\n}',a)+2
    imports="import React from '/node_modules/.vite/deps/react.js?v=d55b057d';import {Navigate,useLocation} from '/node_modules/.vite/deps/react-router-dom.js?v=39152e0a';import {useAuth} from '/src/hooks/useAuth.tsx';import {useEntitlements} from '/src/hooks/useEntitlements.ts';import {isPathEntitled} from '/src/lib/saas/featureRouteMap.ts';import ForaDoPlano from '/src/components/guards/ForaDoPlano.tsx';import {readActiveContext,resolveEffectiveRouteRole} from '/src/lib/navigation/portalRoleContext.ts';"
    body=s[a:z].replace('({ children }: { children: React.ReactNode })','({ children })')
    # original guard body has JSX: let Vite transform via dedicated module request below
    import subprocess
    transpiler=Path('/tmp/browser/id3-transform.cjs');transpiler.write_text("const e=require('/dev-server/node_modules/esbuild');let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(e.transformSync(s,{loader:'tsx',format:'esm',jsx:'transform'}).code));")
    result=subprocess.run(['node',str(transpiler)],input=imports+body,text=True,capture_output=True,check=True)
    return await r.fulfill(content_type='application/javascript',body=result.stdout)
   if r.request.resource_type=='document':return await r.fulfill(content_type='text/html',body=ns['HTML'].replace("import App from '/src/App.tsx';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));",BOOT.replace('START',json.dumps(current))))
   if r.request.method not in ['GET','HEAD']:return await r.abort()
   await r.continue_()
  await c.route('**/*',intercept)
  for w,h in [(390,844),(1440,900)]:
   for mode in ['positive','capability-denied','foreign-target','no-volumes','packaging-invalid','whole-packaging']:
    target='99999999-9999-4999-8999-999999999999' if mode=='foreign-target' else '33333333-3333-4333-8333-333333333333'
    route='/comercial/minha-carteira' if role=='vendedor' and mode!='foreign-target' else '/comercial/minha-carteira/pedido' if role=='vendedor' else '/comercial/pedidos-b2b/novo'
    current=route+'?reviewRole='+role+'&fixture='+mode+(('&parceiro='+target) if mode=='foreign-target' else '')
    rec={'id':3,'profile':role,'viewport':[w,h],'mode':mode,'route':route,'type':'ORIGINAL_PARENT_GUARD_CHILD_UI_SYNTHETIC_READS','assertions':[]};errors.clear()
    try:
     await page.set_viewport_size({'width':w,'height':h});await page.goto('http://localhost:8080'+current,wait_until='domcontentloaded')
     if mode=='capability-denied':
      if role=='vendedor':await page.get_by_role('heading',name='Minha carteira',exact=True).wait_for();assert await page.get_by_role('link',name='Lançar pedido').count()==0
      else:await page.get_by_text('Registro de venda indisponível',exact=True).wait_for()
      assert await page.get_by_role('button',name='Adicionar ao pedido',exact=True).count()==0
      rec['result']='PASS_CAPABILITY_DENIED'
     elif mode=='foreign-target':
      await page.get_by_role('alert').filter(has_text='não está na sua carteira' if role=='vendedor' else 'não pertence').wait_for();assert await page.get_by_role('button',name='Adicionar ao pedido',exact=True).count()==0;rec['result']='PASS_UNASSIGNED_TARGET_DENIED'
     else:
      if role=='vendedor':await page.get_by_role('link',name='Lançar pedido',exact=True).click()
      else:
       await page.get_by_role('combobox',name='Parceiro da carteira',exact=True).click();await page.get_by_role('option').filter(has_text='Parceiro sintético da carteira').click()
      await page.get_by_role('button',name='Adicionar ao pedido',exact=True).first.click()
      dialog=page.get_by_role('dialog').last
      if mode=='packaging-invalid':await dialog.get_by_test_id('packaging-state').wait_for();assert await dialog.get_by_role('button',name='Adicionar ao carrinho',exact=True).count()==0;rec['result']='PASS_PACKAGING_INVALID_CLOSED'
      elif mode=='no-volumes':await dialog.get_by_text('Nenhum volume comercial',exact=False).wait_for();assert not await dialog.get_by_role('button',name='Adicionar ao carrinho',exact=True).is_enabled();rec['result']='PASS_MISSING_PRESENTATION_DISABLED'
      elif mode=='whole-packaging':
       await dialog.get_by_role('radio',name='Embalagem 5 L SKU-QA-3',exact=False).click();await dialog.get_by_label('Quantidade de embalagens',exact=True).fill('3');action=dialog.get_by_role('button',name='Adicionar',exact=True);assert await action.is_enabled();await action.scroll_into_view_if_needed();assert (await action.evaluate(BOX))['within'];await page.screenshot(path=str(O/f'{role}-{w}-{mode}-dialog.png'));await action.click();assert await page.get_by_role('dialog').count()==0;assert '150,00' in await page.locator('main').inner_text();rec['result']='PASS_ALTERNATIVE_WHOLE_PACKAGING_UI';rec['assertions'].append({'alternative_original_dialog':True,'quantity':3,'sku':'SKU-QA-3'})
      else:
       await dialog.get_by_placeholder('Ex.: 20',exact=True).fill('40')
       combos=dialog.get_by_role('combobox');await combos.first.click();await page.get_by_role('option').filter(has_text='5 L').first.click()
       quantities=dialog.locator('input[type=number]');await quantities.last.fill('3')
       action=dialog.get_by_role('button',name='Adicionar ao carrinho',exact=True);assert await action.is_enabled();await action.scroll_into_view_if_needed();g=await action.evaluate(BOX);assert g['within'];rec['assertions'].append({'last_action':g})
       title=dialog.locator('[id]').filter(has_text='Bioinsumo sintético').first
       rec['description_box']=await dialog.locator('[id^=radix-]').filter(has_text='Bioinsumo sintético').last.evaluate(BOX) if False else await dialog.locator('p').first.evaluate(BOX);assert not rec['description_box']['clipped'],'product description clipped';rec['dialog_text']=await dialog.inner_text();await page.screenshot(path=str(O/f'{role}-{w}-{mode}-dialog.png'))
       await action.click();await page.wait_for_timeout(200)
       assert await page.get_by_role('dialog').count()==0
       assert 'Bioinsumo sintético' in await page.locator('main').inner_text();assert '150,00' in await page.locator('main').inner_text();rec['result']='PASS_CART_UI_ROUNDTRIP';rec['assertions'].append({'local_cart_readback':True})
     assert not errors,str(errors);assert not await page.evaluate('window.reviewWrites.length'),'write attempted'
    except Exception as e:rec['result']='GAP';rec['error']=str(e)[:650];rec['text']=(await page.locator('body').inner_text())[:1700]
    rec['reads']=await page.evaluate('window.reviewReads||[]');rec['errors']=errors.copy();shot=O/f'{role}-{w}-{mode}.png';await page.screenshot(path=str(shot));rec['evidence']=str(shot.relative_to(R));rows.append(rec);(O/f'{role}.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2));print(role,w,mode,rec['result'],rec.get('error','')[:150],flush=True)
  await b.close()
asyncio.run(main())

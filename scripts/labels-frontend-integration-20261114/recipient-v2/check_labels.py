import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
BASE=Path('/tmp/browser/labels-v2')
HTML='''<html><head><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module">
import "/src/index.css";
import React from '/node_modules/.vite/deps/react.js?v=bd4549eb';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js?v=bd4549eb';
import {MemoryRouter,Routes,Route} from '/node_modules/.vite/deps/react-router-dom.js?v=bd4549eb';
import Page from '/src/pages/etiquetas/EtiquetaProdutoPrintPage.tsx';
import {qaLabel} from '/src/test/etiquetas/layoutV2.fixtures.ts';
import {createLabelsPdf} from '/src/lib/etiquetasPdf.ts';
import {LabelTechnicalDataDialog} from '/src/components/etiquetas/LabelTechnicalDataDialog.tsx';
window.rows=[20000,5000,1000].map((v,i)=>({...qaLabel(v),id:`${i+1}${i+1}${i+1}${i+1}${i+1}${i+1}${i+1}${i+1}-1111-4111-8111-111111111111`,cq_liberado:true,produto_nome:'PRODUTO QA SINTÉTICO',lote_codigo:'LOTE-QA-TESTE',recipiente_seq:1,recipiente_total:3}));
window.makePdf=async()=>{let pdf=await createLabelsPdf(window.rows,document.getElementById('product-label-print'));return pdf.output('datauristring');};
let e=React.createElement;ReactDOM.createRoot(document.getElementById('root')).render(e(React.Fragment,null,e(LabelTechnicalDataDialog,{kind:'validade',targetId:window.rows[0].id,targetName:'LOTE QA'}),e(LabelTechnicalDataDialog,{kind:'toxicidade',targetId:window.rows[0].id,targetName:'PRODUTO QA'}),e(MemoryRouter,{initialEntries:[`/etiquetas/${window.rows[0].id}/imprimir?ids=${window.rows.map(l=>l.id).join(',')}`]},e(Routes,null,e(Route,{path:'/etiquetas/:id/imprimir',element:e(Page)})))));
</script></body></html>'''
AUTH="export const useAuth=()=>({user:{id:'actor'},profile:{user_id:'actor',organization_id:'tenant',ativo:true},roles:['gestor'],loading:false,authzReady:true,checkAuthzAccess:()=>true});"
CLIENT="export const supabase={from:()=>({select:()=>({in:(_,ids)=>Promise.resolve({data:window.rows.filter(r=>ids.includes(r.id)),error:null})})}),rpc:async(name,args)=>{window.calls=(window.calls||[]).concat([{name,args}]);return {data:name==='rpc_cadastrar_toxicidade_etiqueta_produto'?'33333333-3333-4333-8333-333333333333':null,error:null};}};"
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800},accept_downloads=True)
  page=await context.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def handle(route):
   u=route.request.url
   if not u.startswith('http://localhost:8080'):return await route.abort()
   if '/__labels-v2' in u:return await route.fulfill(content_type='text/html',body=HTML)
   if '/src/hooks/useAuth.ts' in u:return await route.fulfill(content_type='application/javascript',body=AUTH)
   if '/src/integrations/supabase/client.ts' in u:return await route.fulfill(content_type='application/javascript',body=CLIENT)
   await route.continue_()
  await context.route('**/*',handle)
  await page.goto('http://localhost:8080/__labels-v2');await page.wait_for_timeout(2000);print('errors',errors);await page.get_by_role('button',name='PDF multipágina').wait_for()
  await page.locator('.product-label-v2').first.wait_for()
  result={'dimensions':await page.locator('.product-label-v2').evaluate_all('(els)=>els.map(el=>({template:el.dataset.template,w:el.getBoundingClientRect().width*25.4/96,h:el.getBoundingClientRect().height*25.4/96}))')}
  for i in range(3):await page.locator('.product-label-v2').nth(i).screenshot(path=str(BASE/f'label-{i+1}.png'))
  await page.screenshot(path=str(BASE/'desktop.png'))
  await page.get_by_role('button',name='Validade do lote',exact=True).click();await page.get_by_label('Validade aprovada',exact=True).fill('2099-12-31');await page.get_by_label('Referência técnica').fill('QA-REFERENCIA');await page.get_by_role('button',name='Aprovar validade',exact=True).click();await page.get_by_role('status').filter(has_text='Validade aprovada').wait_for();await page.screenshot(path=str(BASE/'validade.png'));await page.get_by_role('button',name='Fechar',exact=True).click()
  await page.get_by_role('button',name='Toxicidade do produto',exact=True).click();await page.get_by_label('Toxicidade aprovada',exact=True).fill('Texto técnico sintético.');await page.get_by_label('Referência técnica').fill('QA-REFERENCIA');await page.get_by_role('button',name='Cadastrar toxicidade',exact=True).click();await page.get_by_role('status').filter(has_text='Toxicidade cadastrada').wait_for();await page.screenshot(path=str(BASE/'toxicidade.png'));await page.get_by_role('button',name='Fechar',exact=True).click()
  await page.get_by_label('Motivo da impressão ou reimpressão').fill('PDF sintético de teste')
  async with page.expect_download() as d:await page.get_by_role('button',name='PDF multipágina',exact=True).click()
  await (await d.value).save_as(BASE/'mixed-labels.pdf')
  result['calls']=await page.evaluate('window.calls');result['permit']=await page.locator('#product-label-print').get_attribute('data-print-authorized')
  await page.keyboard.press('Control+p');await page.pdf(path=str(BASE/'ctrl-p-closed.pdf'))
  await page.set_viewport_size({'width':390,'height':844});await page.screenshot(path=str(BASE/'mobile.png'));result['mobileOverflow']=await page.evaluate('document.documentElement.scrollWidth>innerWidth');result['errors']=errors
  (BASE/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));await browser.close()
asyncio.run(main())

import asyncio,json,re
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for w,h in [(1280,1800),(390,844)]:
   c=await b.new_context(viewport={'width':w,'height':h});page=await c.new_page();errors=[]
   page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGEERROR',str(e))));page.on('console',lambda msg: print('console',msg.type,msg.text[:500]));page.on('requestfailed',lambda req:print('failed',req.url))
   auth='export function useAuth(){return {user:{id:"QA-A"},profile:{user_id:"QA-A",organization_id:"00000000-0000-4000-8000-000000000011",ativo:true},roles:["administrador"],role:"administrador",loading:false,authzReady:true,authzEpoch:0};}'
   client="""window.__product={id:'00000000-0000-4000-8000-000000000021',nome:'Fertilizante QA',tipo:'solo',familia_catalogo:'fertilizante_adubo',unidade_conteudo:'kg',codigo:'QA-21',ativo:true,b2b_enabled:false,e_insumo:false,updated_at:'2026-11-18T04:00:00Z',owner_organization_id:'00000000-0000-4000-8000-000000000011',dose_ml_ha:125,valor_litro_brl:300,valor_dose_brl:null,valor_ha_brl:37.5};window.__writes=[];
window.__profile=null;function result(data){const q=Promise.resolve({data,error:null});q.abortSignal=()=>q;return q;}function query(data=[]){const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>result(data).then(resolve);if(key==='maybeSingle')return ()=>query(Array.isArray(data)?data[0]??null:data);return ()=>q;}});return q;}
export const SUPABASE_PUBLISHABLE_KEY='synthetic';export const SUPABASE_URL='https://swzpzcwiasxmjutrmvkm.supabase.co';export const supabase={from(table){return query(table==='product_technical_profiles'?(window.__profile?[window.__profile]:[]):[]);},rpc(fn,args){if(fn==='tenant_product_documentary_read_v1')return result({product_id:window.__product.id,profile_id:window.__profile?.id??null,profile_revision:window.__profile?.updated_at??null,evidence:[]});if(fn==='tenant_product_dossier_management_context')return result({product_id:window.__product.id,dossier_microorganism_id:null});if(fn==='tenant_catalog_root_save'){window.__profile={resumo_curto:null,beneficio_combinado:null,explicacao_tecnica:null,explicacao_produtor:null,explicacao_b2b:null,indicacoes_uso:null,janela_aplicacao:null,cuidados_aplicacao:null,compatibilidade:null,observacoes_regulatorias:null,...window.__profile,...args.p_payload,id:'00000000-0000-4000-8000-000000000031',produto_id:window.__product.id,status_validacao:'rascunho',updated_at:'2026-11-18T05:00:00Z',created_at:'2026-11-18T05:00:00Z',validado_em:null};return result({ok:true,id:window.__profile.id,updated_at:window.__profile.updated_at,replayed:false});}if(fn==='tenant_product_list')return result([window.__product]);if(fn==='tenant_product_unit_capability_v1')return result({contract:'PRODUCT_UNIT_V2',writer:'tenant_product_save',units:['kg','g','ml','l']});if(fn==='solid_pack_offers_admin_v1')return result({contract:'SOLID_PACK_ADMIN_V1',product_id:window.__product.id,config_version:0,unidade_conteudo:window.__product.unidade_conteudo,offers:[]});if(fn==='tenant_product_save'){window.__writes.push(args);Object.assign(window.__product,args.p_payload);return result({product_id:window.__product.id,updated_at:window.__product.updated_at,replayed:false});}return result([]);},auth:{getSession:async()=>({data:{session:null}})}};"""
   async def ar(r):await r.fulfill(body=auth,content_type='application/javascript')
   async def cr(r):await r.fulfill(body=client,content_type='application/javascript')
   await page.route('**/src/hooks/useAuth.tsx*',ar);await page.route('**/src/integrations/supabase/client.ts*',cr)
   async def entry(r):
    original=await r.fetch();text=await original.text();react=re.search(r'from "([^\"]*react-dom_client[^\"]*)"',text).group(1)
    body=f'''import * as React from '/@oj-deps/react__oj_named.mjs?v=1fd8c636';import {{createRoot}} from '{react}';import {{QueryClient,QueryClientProvider}} from '/@oj-deps/tanstack_react-query.mjs?v=1fd8c636';import {{MemoryRouter}} from '/@oj-deps/react-router-dom.mjs?v=1fd8c636';import '/src/index.css';import {{ProdutosTab}} from '/src/components/protocolos/ProdutosTab.tsx';import '/src/integrations/supabase/client.ts';
const qc=new QueryClient();createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{{client:qc}},React.createElement(MemoryRouter,null,React.createElement(ProdutosTab))));'''
    await r.fulfill(body=body,content_type='application/javascript')
   await page.route('**/src/main.tsx*',entry)
   await page.goto('http://localhost:8080',wait_until='domcontentloaded')
   await page.get_by_role('button',name='Editar' if w==1280 else 'Editar produto',exact=True).wait_for()
   await page.get_by_role('button',name='Editar' if w==1280 else 'Editar produto',exact=True).click()
   await page.get_by_label('Unidade do produto *').wait_for()
   await page.get_by_role('tab',name='Aplicação & Custo',exact=True).click()
   await page.get_by_text('Dose numérica e custo por hectare para kg/g não estão disponíveis neste cadastro. Massa não é convertida em mL ou litros.',exact=True).wait_for()
   assert await page.get_by_label('Dose de aplicação (mL/ha)').count()==0
   await page.get_by_text('Valores volumétricos anteriores preservados').click()
   await page.screenshot(path=f'/tmp/browser/fertilizer/mass-{w}.png')
   await page.get_by_role('button',name='Salvar Produto',exact=True).click()
   await page.wait_for_timeout(400)
   assert await page.evaluate("window.__writes.length===1 && !('dose_ml_ha' in window.__writes[0].p_payload) && window.__product.dose_ml_ha===125 && window.__product.valor_litro_brl===300")
   await page.get_by_role('button',name='Editar' if w==1280 else 'Editar produto',exact=True).click()
   await page.get_by_role('tab',name='Ficha técnica / IA / Fontes').click()
   await page.wait_for_timeout(800); await page.screenshot(path=f'/tmp/browser/fertilizer/debug-{w}.png'); print((await page.locator('body').inner_text())[-5000:])
   await page.get_by_role('tab',name='Composição e garantias',exact=True).click()
   notes=page.get_by_label('Notas documentais de composição, garantias e registro')
   await notes.fill('Notas QA documentais, sem teores de produto real.')
   await notes.scroll_into_view_if_needed()
   await notes.screenshot(path=f'/tmp/browser/fertilizer/notes-field-{w}.png')
   await page.screenshot(path=f'/tmp/browser/fertilizer/notes-{w}.png')
   await page.get_by_role('button',name='Salvar conteúdo',exact=True).click()
   await page.wait_for_timeout(400)
   assert await page.evaluate("window.__profile.observacoes_regulatorias==='Notas QA documentais, sem teores de produto real.' && window.__profile.status_validacao==='rascunho'")
   print('AFTER',await page.evaluate('JSON.stringify(window.__profile)'),(await page.locator('body').inner_text())[-2500:])
   await page.get_by_role('tab',name='B2B',exact=True).click()
   await page.get_by_role('tab',name='Composição e garantias',exact=True).click()
   assert await notes.input_value()=='Notas QA documentais, sem teores de produto real.'
   print(json.dumps({'viewport':w,'mass_conversion_blocked':True,'metadata_saved':True,'legacy_retained':True,'errors':errors,'limits':'synthetic intercepted Auth/transport, not hosted'}))
   assert not errors
   await c.close()
  await b.close()
asyncio.run(main())

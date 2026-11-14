import asyncio,json,sys,re
from pathlib import Path
from playwright.async_api import async_playwright
R=Path('/dev-server/scripts/responsive-layout-116');O=R/'final';ns={};exec((R/'harness/repair_components.py').read_text().split('async def main():')[0],ns)
M=json.loads((R/'specific/MATRIX-before-specific.json').read_text());IDS=[84,85];manifest=json.loads((R/'component-manifest.json').read_text())
async def main():
 batch=int(sys.argv[1]);current=None
 async with async_playwright() as p:
  b=await p.chromium.launch();c=await b.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');page=await c.new_page();page.set_default_timeout(2000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def intercept(r):
   if not r.request.url.startswith('http://localhost:8080'):return await r.abort()
   path=r.request.url.split('http://localhost:8080')[-1].split('?')[0]
   if path=='/src/hooks/useAuth.tsx':return await r.fulfill(content_type='application/javascript',body=ns['AUTH'])
   if path=='/src/integrations/supabase/client.ts':return await r.fulfill(content_type='application/javascript',body=ns['CLIENT'])
   if r.request.resource_type=='document':return await r.fulfill(content_type='text/html',body=ns['ns']['HTML'].replace("import App from '/src/App.tsx';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));",ns['BOOT'].replace('MANIFEST',json.dumps(current)).replace('ROLES',json.dumps(ns['ROLES']))))
   f=ns['BASE']/'modules'/path.lstrip('/').replace('/','__')
   if f.is_file():return await r.fulfill(content_type='application/javascript',body=f.read_text())
   await r.continue_()
  await c.route('**/*',intercept)
  for ix,id in enumerate(IDS):
   if ix%3!=batch:continue
   current=next(x for x in manifest if x['id']==id);old=M['items'][id-1];previous=[r for r in old['isolated'] if r['viewport'][0] in [390,1440] and r['status'].startswith('MOUNTED')];dest=O/f'previous-{id}.json';rows=json.loads(dest.read_text()) if dest.exists() else []
   rules=json.loads((R/'closure/profile-rules.json').read_text())[id-1]
   previous=[{'profile':role,'viewport':[w,h]} for role in rules['profiles'] for w,h in [(390,844),(1440,900)]]
   for oldr in previous:
    role=oldr['profile'];w,h=oldr['viewport']
    if any(r['profile']==role and r['viewport']==[w,h] for r in rows):continue
    rec={'id':id,'profile':role,'viewport':[w,h],'type':'REUSED_ORIGINAL_FIXTURE_NEW_ASSERTIONS','profile_basis':rules['basis'],'assertions':[]};errors.clear()
    try:
     await page.set_viewport_size({'width':w,'height':h});await page.goto('http://localhost:8080/__isolated?reviewRole='+role);await page.wait_for_timeout(180)
     target=page.locator(f'[data-review-occurrence="{id}"]:visible').first
     if id in [84,85]:
      await page.get_by_role('tab',name='Entr.',exact=True).click();await target.scroll_into_view_if_needed();await target.fill('Produto' if id==84 else 'Cliente');assert await target.input_value();await target.fill('');assert await target.input_value()=='';rec['assertions'].append('typed and cleared actual reserved-stock filter')
     if id==81:await page.get_by_role('tab',name='OS',exact=False).last.click()
     if id==109:await page.get_by_role('tab',name='Histórico',exact=True).click()
     if not await target.count():
      for bt in (await page.get_by_role('button').all())[:12]:
       t=await bt.inner_text()
       if await bt.is_visible() and await bt.is_enabled() and re.match(r'^(Novo|Nova|Adicionar|Cadastrar|Editar|Gerenciar|Detalhes)',t):await bt.click();await page.wait_for_timeout(100)
       if await target.count():break
     await target.wait_for();await target.scroll_into_view_if_needed();g=await target.evaluate(ns['GEOM']);assert g['rect']['width']>0 and (await target.get_attribute('type')=='text' or g['text'].strip() or await target.get_attribute('aria-label') or await target.get_attribute('title') or await target.get_attribute('placeholder') or await target.locator('svg').count());rec['assertions'].append({'target':g})
     for tablist in await target.locator('[role=tablist]').all():
      for bt in [tablist.get_by_role('tab').first,tablist.get_by_role('tab').last]:
       if not await bt.is_enabled():rec['assertions'].append({'blocked_tab':await bt.inner_text()});continue
       await bt.click();assert await bt.get_attribute('aria-selected')=='true';rec['assertions'].append({'selected_tab':await bt.inner_text()})
     container=page.locator('[role=dialog],[role=alertdialog]').last if await page.locator('[role=dialog],[role=alertdialog]').count() else target
     controls=container.locator('button,input,textarea,[role=combobox]').filter(visible=True).filter(has_not=page.locator('.sr-only'));last=controls.last
     if await target.evaluate('e=>e.matches("button,input,textarea,[role=combobox]")'):last=target;controls=target
     if not await controls.count() and await container.locator('button:visible').count():controls=container.locator('button:visible');last=controls.last
     if await controls.count():
      await last.scroll_into_view_if_needed();box=await last.bounding_box();assert box and box['y']>=-1 and box['y']+box['height']<=h+1;rec['assertions'].append({'last_useful':await last.inner_text() if await last.evaluate('e=>e.tagName==="BUTTON"') else await last.get_attribute('aria-label'),'box':box,'enabled':await last.is_enabled()})
      if await last.is_enabled():await last.focus();assert await last.evaluate('e=>document.activeElement===e');rec['assertions'].append('last control focusable')
     else:
      cells=container.locator('td').filter(visible=True);assert await cells.count();await cells.last.scroll_into_view_if_needed();rec['assertions'].append({'last_read_cell':await cells.last.inner_text()})
     assert not errors;rec['clipping_candidates']=g['clipped'];rec['status']='ASSERTED_GEOMETRY_CONTENT_CONTROL' if not g['clipped'] else 'CLIPPING_REVIEW_REQUIRED'
    except Exception as e:rec['status']='GAP';rec['error']=str(e)[:280]
    shot=O/f'previous-{id}-{role}-{w}.png';await page.screenshot(path=str(shot));rec['evidence']=str(shot.relative_to(R));rec['errors']=errors.copy();rows.append(rec);dest.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')));print(id,role,w,rec['status'],flush=True)
  await b.close()
asyncio.run(main())

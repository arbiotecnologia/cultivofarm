import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
R=Path('/dev-server/scripts/responsive-layout-116');O=R/'closure';ns={};exec((R/'harness/survey.py').read_text().split('async def run():')[0],ns)
BOOT="""import {MemoryRouter} from '/node_modules/.vite/deps/react-router-dom.js?v=39152e0a';import {BIDrillDownModal} from '/src/components/bi/modal/BIDrillDownModal.tsx';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(BIDrillDownModal,{open:true,onClose:()=>window.biClosed=true,tipo:'cliente',id:'synthetic',nome:'Cliente produtor com nome empresarial integral significativamente longo para conferir cada span e o fechamento independente',origem:'visitas',dados:Array.from({length:22},(_,i)=>({cliente_nome:'Cliente representativo '+i,fazenda_nome:'Fazenda sintética',talhao_nome:'Talhão sintético',consultor_nome:'Consultor sintético',status_visita:'finalizado',data_vistoria:'2026-11-14'}))})));"""
async def main():
 phase=sys.argv[1];records=[]
 async with async_playwright() as p:
  b=await p.chromium.launch();page=await b.new_page(viewport={'width':390,'height':844})
  async def intercept(r):
   if not r.request.url.startswith('http://localhost:8080'):return await r.abort()
   if r.request.resource_type=='document':return await r.fulfill(content_type='text/html',body=ns['HTML'].replace("import App from '/src/App.tsx';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));",BOOT))
   await r.continue_()
  await page.route('**/*',intercept)
  for w,h in [(390,844),(1440,900),(320,568),(464,522)]:
   await page.set_viewport_size({'width':w,'height':h});await page.goto('http://localhost:8080/__bi');await page.get_by_role('dialog').wait_for();title=page.get_by_role('heading').first;close=page.get_by_role('button',name='Fechar',exact=True);metrics=await title.evaluate('e=>({title:e.getBoundingClientRect().toJSON(),spans:[...e.querySelectorAll("span")].map(s=>({text:s.textContent,box:s.getBoundingClientRect().toJSON(),clipped:s.scrollWidth>s.clientWidth+1||s.scrollHeight>s.clientHeight+1}))})');cb=await close.bounding_box();metrics['close']=cb;metrics['viewport']=[w,h];metrics['defect']=any(s['clipped'] or s['box']['right']>w for s in metrics['spans']) or metrics['title']['right']>cb['x'];await page.screenshot(path=str(O/f'bi-{phase}-{w}.png'));await close.click();assert await page.evaluate('window.biClosed===true');metrics['close_clicked']=True;records.append(metrics)
  (O/f'bi-{phase}.json').write_text(json.dumps(records,ensure_ascii=False,indent=2));print([(r['viewport'],r['defect']) for r in records]);await b.close()
asyncio.run(main())

// Real AuthProvider/monitor/ProtectedRoutes/AppLayout/cache; cockpit page stub.
// Only transports/session and unrelated shell widgets are fake: not JWT/RLS.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useAuthenticatedAttachmentOpener } from '@/hooks/useAuthenticatedAttachmentOpener';
const U='00000000-0000-4000-8000-000000000001', O='00000000-0000-4000-8000-000000000002';
const s=vi.hoisted(()=>({uid:'00000000-0000-4000-8000-000000000001',authListener:undefined as undefined|((event:string,session:{user:{id:string}})=>void),gate:true,active:true as unknown,password:false as unknown,roleAllowed:true as unknown,roles:['gestor','consultor_tecnico'],org:'00000000-0000-4000-8000-000000000002' as string|null,finalOrg:undefined as string|undefined,h15:0,error:false,fail:'',hold:undefined as undefined|(()=>Promise<unknown>),late:undefined as undefined|(()=>Promise<unknown>),rowUid:undefined as string|undefined, roleCalls:[] as unknown[], deniedRole:'', preferenceHold:undefined as undefined|(()=>Promise<unknown>), rtt:0}));
function chain(result:()=>unknown){const q:Record<string,unknown>={};for(const n of ['select','eq','is','filter','in','not','neq','order','abortSignal','gte','limit'])q[n]=()=>q;q.maybeSingle=async()=>result();q.then=(f:(v:unknown)=>void)=>Promise.resolve(result()).then(f);return q;}
vi.mock('@/lib/authz/authzEpochGate',()=>({AUTHZ_CACHE_FOUNDATION_ENABLED:true,FINANCIAL_CONTEXT_MONITOR_ENABLED: true, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: true, get MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED(){return s.gate;}, AUTHZ_CACHE_ROLLOUT_SCOPE:'b2b-context',PRODUCER_CONTEXT_MONITOR_ENABLED:false,CONSULTANT_CONTEXT_MONITOR_ENABLED: false, OPERATOR_CONTEXT_MONITOR_ENABLED:false}));
vi.mock('@/lib/portalBroadcast',()=>({subscribePortalEvents:()=>()=>{},broadcastPortalEvent:()=>{}}));
vi.mock('@/hooks/useSystemConfig',()=>({useSystemConfig:()=>({defaults:{nome_empresa:'Cultivo Farm'}})}));
vi.mock('@/hooks/useOrgOnboarding',()=>({useOnboardingState:()=>({data:{required:false}})}));
vi.mock('@/components/AppSidebar',()=>({AppSidebar:()=> <nav>Menu desktop</nav>}));
vi.mock('@/components/portal/PortalTopBar',()=>({PortalTopBar:({brandTitle}:{brandTitle:string})=><header>{brandTitle}</header>}));
vi.mock('@/lib/accessAuditLog',()=>({logAccessDeniedOnce:()=>{},routeGroupFromPath:()=> 'technical'}));
vi.mock('@/hooks/useOfflineSync',()=>({useOfflineSync:()=>({isOnline:true,pendingCount:0,syncing:false,syncAll:()=>{}})}));
vi.mock('@/hooks/useEntitlements',()=>({useEntitlements:()=>({status:'ready',features:new Set(['ordens_producao','estoque_embalagens','contas_receber'])})}));
vi.mock('@/components/app/OfflineIndicator',()=>({OfflineIndicator:()=>null}));
vi.mock('@/components/app/PendingMediaRecovery',()=>({PendingMediaRecovery:()=>null}));
vi.mock('@/components/ordens-servico/OSDetalhesDialog',()=>({OSDetalhesDialog:()=>null}));
vi.mock('@/components/faturamento/BaseFaturamentoSection',()=>({BaseFaturamentoSection:()=>null}));
vi.mock('@/components/ui/sidebar',()=>({SidebarProvider:({children}:{children:React.ReactNode})=><>{children}</>,SidebarTrigger:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 auth:{getSession:async()=>({data:{session:{user:{id:s.uid}}}}),onAuthStateChange:(listener:typeof s.authListener)=>{s.authListener=listener;return {data:{subscription:{unsubscribe(){s.authListener=undefined;}}}};},signOut:async()=>{}},
 from:(t:string)=>chain(()=>t==='profiles'?{data:{user_id:s.rowUid??s.uid,organization_id:s.org,ativo:s.active,senha_provisoria:s.password,nome:'Operador'},error:s.fail==='profiles'?{}:null}:t==='user_roles'?{data:s.roles.map(role=>({role})),error:s.fail==='user_roles'?{}:null}:{data:[]}),
 channel:()=>{const c={on:()=>c,subscribe:()=>c};return c;},removeChannel:vi.fn(),
 rpc:(name:string,args:unknown)=>{const request=(async()=>{
  if(name==='get_my_available_portal_contexts')return {data:{available_contexts:['admin','technical'],has_technical_access:true,is_admin:false,must_select_context:true},error:null};
  if(name==='set_my_context_preference')return {data:s.preferenceHold?await s.preferenceHold():{ok:true},error:null};
  if(name==='has_role'){s.roleCalls.push(args);return {data:(args as {_role:string})._role===s.deniedRole?false:s.roleAllowed,error:s.fail==='has_role'?{}:null};}
  if(name==='h15_actor_organization'){s.h15++;if(s.rtt)await new Promise(r=>setTimeout(r,s.rtt));const hold=s.hold;s.hold=undefined;return {data:hold?await hold():(s.h15===2&&s.finalOrg?s.finalOrg:(s.active===true&&s.password===false?s.org:null)),error:s.error||s.fail==='final_h15'?{}:null};}
  if(name==='get_financial_dashboard_summary'){const late=s.late;s.late=undefined;return late?await late():{data:{total_receivable_expected:100},error:null};}
  if(name==='get_top_financial_rankings')return {data:{},error:null};
  throw new Error('unexpected '+name);
 })();return Object.assign(request,{abortSignal:()=>request});}
}}));
import { AuthProvider } from '@/hooks/useAuth';
import OrdensServico from '@/pages/OrdensServico';
import MobileLogin from '@/pages/app/MobileLogin';
import SelecionarPortal from '@/pages/SelecionarPortal';
import AcessoPendente from '@/pages/AcessoPendente';

import MobileLayout from '@/pages/app/MobileLayout';
import { AppPortalGuard } from '@/components/guards/AppPortalGuard';
import { Link } from 'react-router-dom';
import { ProtectedRoutes, RoleGuard } from '@/App';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
// Actual AuthProvider, ProtectedRoutes, RoleGuard and AppLayout; page data is an explicit stub.
function CockpitFixture(){const {user}=useAuth(); const q=useQuery({queryKey:['operator-fixture',user?.id],queryFn:async()=>{const late=s.late;s.late=undefined;return late?await late():{data:{total_receivable_expected:0},error:null};}});const result=q.data as {data:{total_receivable_expected:number}}|undefined;return <><button>Atualizar consulta</button><span>{result ? `${result.data.total_receivable_expected} OS`:''}</span></>;}
import { internalContextProbe, MANAGER_CONSULTANT_ROLES, isManagerConsultantScope } from '@/lib/authz/internalContextProbe';
function Location(){return <output data-testid="url">{useLocation().pathname}</output>;}
const bytes=vi.hoisted(()=>({download:vi.fn()}));
vi.mock('@/lib/authz/authenticatedAttachment',async original=>({...await original<typeof import('@/lib/authz/authenticatedAttachment')>(),downloadAuthenticatedAttachment:(...args:unknown[])=>bytes.download(...args)}));
function Prepared(){const {authzEpoch}=useAuth();const opener=useAuthenticatedAttachmentOpener('environment-receipt','financial-receipts');const path=O+'/2026/REC-2026-000001.pdf';return <><output data-testid="epoch">{authzEpoch}</output><button onClick={()=>void opener.open(path,()=>{})}>Preparar PDF</button>{opener.urls[path]&&<button onClick={()=>opener.download(path,'recibo.pdf')}>Baixar PDF</button>}</>;}
function Draft(){const {setSafeOSDraft,takeSafeOSDraft}=useAuth();const [receipt]=useState(()=>takeSafeOSDraft());const [draft,setDraft]=useState(''); const [modal,setModal]=useState(receipt?.open??false);useEffect(()=>{setSafeOSDraft(modal?{open:true,tipo_item:'produto',modo_aplicacao:'foliar',prioridade:'media'}:null);return ()=>setSafeOSDraft(null);},[modal]);return <><input aria-label="Rascunho operador" value={draft} onChange={e=>setDraft(e.target.value)}/><button onClick={()=>setModal(true)}>Abrir modal</button>{modal&&<div role="dialog">Modal em edição</div>}</>;}
function Switch(){return <><Link to="/selecionar-portal?intent=switch">Trocar portal</Link></>;}
function setup(path='/financeiro/receber'){
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={qc}><AuthProvider><MemoryRouter initialEntries={[path]}><Location/><Routes>
 <Route element={<ProtectedRoutes/>}>{['/financeiro/receber','/dashboard/geral'].map(path=><Route key={path} path={path} element={<RoleGuard><Switch/><Draft/><Prepared/><CockpitFixture/></RoleGuard>}/>)}</Route>
 <Route element={<ProtectedRoutes/>}><Route path="/ordens-servico" element={<RoleGuard><OrdensServico/></RoleGuard>}/></Route>
 <Route element={<AppPortalGuard/>}><Route element={<MobileLayout/>}>{['/app','/app/atendimentos','/app/registrar'].map(path=><Route key={path} path={path} element={<><Switch/><Draft/><Prepared/><CockpitFixture/></>}/>)}</Route></Route>
 <Route path="/selecionar-portal" element={<SelecionarPortal/>}/><Route path="/sem-permissao" element={<div>negado</div>}/>
 </Routes></MemoryRouter></AuthProvider></QueryClientProvider>);return qc;
}
async function tick(ms=0){await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});for(let i=0;i<10;i++)await act(async()=>{await vi.advanceTimersByTimeAsync(1);});}
function paused(qc:QueryClient, path='/financeiro/receber'){
 expect(screen.getByText('Sessão de acesso pausada')).toBeTruthy();
 expect(screen.queryByRole('navigation')).toBeNull();expect(screen.queryByText('Menu desktop')).toBeNull();
 expect(screen.queryByText('Cultivo Farm Campo')).toBeNull();expect(screen.queryByRole('textbox')).toBeNull();
 expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByText('0 OS')).toBeNull();
 expect(screen.queryByRole('group',{name:'Portais disponíveis'})).toBeNull();
 expect(screen.getByTestId('url').textContent).toBe(path);
 expect(qc.getQueryCache().getAll().some(q=>q.state.data!==undefined)).toBe(false);
}
beforeEach(()=>{vi.useFakeTimers();s.uid=U;s.authListener=undefined;s.gate=true;s.active=true;s.password=false;s.roleAllowed=true;s.roles=['gestor','consultor_tecnico'];s.org=O;s.finalOrg=undefined;s.h15=0;s.hold=undefined;s.late=undefined;s.error=false;s.fail='';s.roleCalls=[];s.rowUid=undefined;s.deniedRole='';s.preferenceHold=undefined;s.rtt=0;bytes.download.mockReset();bytes.download.mockResolvedValue(new Blob(['pdf']));Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:prepared')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});localStorage.clear();Object.defineProperty(navigator,'onLine',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
for(const role of ['financeiro','administrador']) describe(role+' exclusive environment, fake transport not hosted',()=>{
 it('TOKEN_REFRESHED same scope reconfirms modal choices only; free text/cache/bytes never return',async()=>{
  s.roles=[role];const qc=setup();await tick();
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'draft before refresh'}});
  fireEvent.click(screen.getByRole('button',{name:'Abrir modal'}));
  fireEvent.click(screen.getByRole('button',{name:'Preparar PDF'}));await tick();
  expect(screen.getByRole('button',{name:'Baixar PDF'})).toBeTruthy();
  const warnings=vi.spyOn(console,'warn').mockImplementation(()=>{});
  act(()=>s.authListener?.('TOKEN_REFRESHED',{user:{id:s.uid}}));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button',{name:'Baixar PDF'})).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prepared');
  expect(qc.getQueryCache().getAll().some(q=>q.state.data!==undefined)).toBe(false);
  await tick();act(()=>s.authListener?.('SIGNED_IN',{user:{id:s.uid}}));await tick();
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Baixar PDF'})).toBeNull();
  expect(warnings.mock.calls.some(call=>call[0]==='cultivo-authz-expire')).toBe(false);
 });
 it('TOKEN_REFRESHED discards late old-scope attachment while same-scope reauthorization awaits3s',async()=>{
  s.roles=[role];setup();await tick();let answer:((value:Blob)=>void)|undefined;
  fireEvent.click(screen.getByRole('button',{name:'Abrir modal'}));
  bytes.download.mockImplementation(()=>new Promise(resolve=>answer=resolve));
  fireEvent.click(screen.getByRole('button',{name:'Preparar PDF'}));s.rtt=1500;
  act(()=>s.authListener?.('TOKEN_REFRESHED',{user:{id:s.uid}}));await tick();
  expect(screen.getByText('Verificando seu acesso')).toBeTruthy();
  answer?.(new Blob(['previous authority']));await tick();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).toBeNull();
  await tick(3100);expect(screen.getByRole('textbox')).toBeTruthy();
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Baixar PDF'})).toBeNull();
 });
 it.each(['role','tenant','revoked'])('TOKEN_REFRESHED %s change never revives previous draft or prepared bytes',async reason=>{
  s.roles=[role];const qc=setup();await tick();
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'old scope'}});
  fireEvent.click(screen.getByRole('button',{name:'Abrir modal'}));
  fireEvent.click(screen.getByRole('button',{name:'Preparar PDF'}));await tick();
  if(reason==='role')s.roles=[];else if(reason==='tenant')s.org=U;else s.roleAllowed=false;
  act(()=>s.authListener?.('TOKEN_REFRESHED',{user:{id:s.uid}}));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(qc.getQueryCache().getAll().some(q=>q.state.data!==undefined)).toBe(false);
  await tick();expect(screen.queryByRole('button',{name:'Baixar PDF'})).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prepared');
  if(reason==='revoked')paused(qc);
  if(reason==='tenant')expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
  if(reason==='role')expect(screen.queryByRole('textbox')).toBeNull();
 });
 it('old in-flight h15 positive cannot restore authority after TOKEN_REFRESHED and current role revocation',async()=>{
  s.roles=[role];const qc=setup();await tick();let answer:((value:unknown)=>void)|undefined;
  s.hold=()=>new Promise(resolve=>answer=resolve);
  act(()=>window.dispatchEvent(new Event('focus')));await tick();
  s.roleAllowed=false;act(()=>s.authListener?.('TOKEN_REFRESHED',{user:{id:s.uid}}));await tick();
  paused(qc);answer?.(O);await tick();paused(qc);
 });
 it('RTT3s >=90s alternating visibility/focus preserves draft/modal/prepared bytes and epoch',async()=>{
  s.roles=[role];s.rtt=1500;setup();await tick(3000);await tick(3000);
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'rascunho preservado'}});fireEvent.click(screen.getByRole('button',{name:'Abrir modal'}));fireEvent.click(screen.getByRole('button',{name:'Preparar PDF'}));await tick();
  const epoch=screen.getByTestId('epoch').textContent;const before=s.h15;
  for(let i=0;i<900;i++){
   if(i%100===0){Object.defineProperty(document,'visibilityState',{value:i%200===0?'hidden':'visible'});act(()=>{document.dispatchEvent(new Event('visibilitychange'));if(i%200!==0)window.dispatchEvent(new Event('focus'));});}
   await act(async()=>{await vi.advanceTimersByTimeAsync(100);});
   expect(screen.queryByText('Sessão de acesso pausada')).toBeNull();expect(screen.queryByText('Verificando seu acesso')).toBeNull();expect(screen.getByTestId('epoch').textContent).toBe(epoch);
  }
  expect(s.h15).toBeGreaterThan(before+16);expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('rascunho preservado');expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByRole('button',{name:'Baixar PDF'})).toBeTruthy();expect(bytes.download).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'Baixar PDF'}));expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
 });
 it('coalesces focus+visibility with in-flight poll, does not erase draft',async()=>{
  s.roles=[role];setup();await tick();fireEvent.change(screen.getByRole('textbox'),{target:{value:'coalesce'}});
  let resolve:((v:unknown)=>void)|undefined;s.hold=()=>new Promise(r=>resolve=r);await tick(10000);const before=s.h15;
  act(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('online'));});await tick();expect(s.h15).toBe(before);
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('coalesce');resolve?.(O);await tick();
 });
 it.each(['inactive','role','denied','error','offline','timeout'])('%s clears draft/cache/bytes, denies retry, restore is clean',async reason=>{
  s.roles=[role];const qc=setup();await tick();fireEvent.change(screen.getByRole('textbox'),{target:{value:'não restaurar'}});fireEvent.click(screen.getByRole('button',{name:'Abrir modal'}));fireEvent.click(screen.getByRole('button',{name:'Preparar PDF'}));await tick();
  let resolve:((v:unknown)=>void)|undefined;
  if(reason==='inactive')s.active=false;if(reason==='role')s.roles=[];if(reason==='denied')s.roleAllowed=false;if(reason==='error')s.error=true;if(reason==='offline')Object.defineProperty(navigator,'onLine',{value:false});if(reason==='timeout')s.hold=()=>new Promise(r=>resolve=r);
  act(()=>{window.dispatchEvent(new Event(reason==='offline'?'offline':'focus'));document.dispatchEvent(new Event('visibilitychange'));});await tick(reason==='timeout'?15001:0);paused(qc);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prepared');
  resolve?.(O);await tick();paused(qc);
  if(reason==='timeout')s.hold=()=>new Promise(()=>{});
  fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick(reason==='timeout'?15001:0);paused(qc);
  s.active=true;s.roles=[role];s.roleAllowed=true;s.error=false;s.hold=undefined;Object.defineProperty(navigator,'onLine',{value:true});fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByRole('button',{name:'Baixar PDF'})).toBeNull();
 });
 it('late prepared PDF after lease expiry cannot create Blob or restore UI',async()=>{
  s.roles=[role];const qc=setup();await tick();let resolve:((v:Blob)=>void)|undefined;bytes.download.mockImplementation(()=>new Promise(r=>resolve=r));fireEvent.click(screen.getByRole('button',{name:'Preparar PDF'}));
  s.hold=()=>new Promise(()=>{});await tick(15001);paused(qc);resolve?.(new Blob(['late']));await tick();expect(URL.createObjectURL).not.toHaveBeenCalled();paused(qc);
 });
});
describe('suspended monotonic clock, exclusive scopes',()=>{
 it.each(['financeiro','administrador'])('%s cannot keep prepared bytes past deadline with suspended timers',async role=>{
  s.roles=[role];const qc=setup();await tick();fireEvent.change(screen.getByRole('textbox'),{target:{value:'suspenso'}});fireEvent.click(screen.getByRole('button',{name:'Preparar PDF'}));await tick();
  const clock=performance.now();const now=vi.spyOn(performance,'now').mockReturnValue(clock+16000);
  // No timer executed: synchronous access guard must deny a new download.
  fireEvent.click(screen.getByRole('button',{name:'Baixar PDF'}));expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  s.hold=()=>new Promise(()=>{});act(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});await act(async()=>{await Promise.resolve();});
  expect(screen.queryByRole('textbox')).toBeNull();expect(screen.queryByRole('button',{name:'Baixar PDF'})).toBeNull();expect(qc.getQueryCache().getAll().some(q=>q.state.data!==undefined)).toBe(false);now.mockRestore();
 });
});
describe('Nova OS real owner with actual AuthProvider, fake transport only',()=>{
 it('RTT3s TOKEN_REFRESHED restores non-sensitive item choice/modal, discards area/date and cannot submit',async()=>{
  s.roles=['administrador'];setup('/ordens-servico');await tick();
  fireEvent.click(screen.getByRole('button',{name:'Nova OS'}));
  fireEvent.click(screen.getByRole('button',{name:'Microrganismo'}));
  fireEvent.change(screen.getByRole('spinbutton',{name:'Área em hectares'}),{target:{value:'100'}});
  s.rtt=1500;act(()=>s.authListener?.('TOKEN_REFRESHED',{user:{id:s.uid}}));await tick();
  expect(screen.queryByRole('dialog')).toBeNull();expect(screen.getByText('Verificando seu acesso')).toBeTruthy();
  await tick(3100);
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByRole('spinbutton',{name:'Área em hectares'})).toHaveValue(null);
  expect(screen.getByText('Microrganismo *')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Criar Ordem de Serviço'})).toBeDisabled();
 });
 it.each(['USER_UPDATED','identity','timeout'])('%s destroys opt-in receipt and never reopens modal',async reason=>{
  s.roles=['administrador'];setup('/ordens-servico');await tick();fireEvent.click(screen.getByRole('button',{name:'Nova OS'}));
  if(reason==='identity'){s.uid='00000000-0000-4000-8000-000000000003';}
  if(reason==='timeout')s.hold=()=>new Promise(()=>{});
  act(()=>s.authListener?.(reason==='USER_UPDATED'?'USER_UPDATED':'TOKEN_REFRESHED',{user:{id:s.uid}}));
  await tick(reason==='timeout'?15001:0);
  expect(screen.queryByRole('dialog')).toBeNull();
 });
});

// Real AuthProvider/monitor/ProtectedRoutes/AppLayout/cache; cockpit page stub.
// Only transports/session and unrelated shell widgets are fake: not JWT/RLS.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
const U='00000000-0000-4000-8000-000000000001', O='00000000-0000-4000-8000-000000000002';
const s=vi.hoisted(()=>({uid:'00000000-0000-4000-8000-000000000001',authListener:undefined as undefined|((event:string,session:{user:{id:string}})=>void),gate:true,active:true as unknown,password:false as unknown,roleAllowed:true as unknown,roles:['gestor','consultor_tecnico'],org:'00000000-0000-4000-8000-000000000002' as string|null,finalOrg:undefined as string|undefined,h15:0,error:false,fail:'',hold:undefined as undefined|(()=>Promise<unknown>),late:undefined as undefined|(()=>Promise<unknown>),rowUid:undefined as string|undefined, roleCalls:[] as unknown[], deniedRole:'', preferenceHold:undefined as undefined|(()=>Promise<unknown>), rtt:0}));
function chain(result:()=>unknown){const q:Record<string,unknown>={};for(const n of ['select','eq','is','filter','in','not','neq','order','abortSignal'])q[n]=()=>q;q.maybeSingle=async()=>result();q.then=(f:(v:unknown)=>void)=>Promise.resolve(result()).then(f);return q;}
vi.mock('@/lib/authz/authzEpochGate',()=>({AUTHZ_CACHE_FOUNDATION_ENABLED:true,FINANCIAL_CONTEXT_MONITOR_ENABLED: false, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: false, get MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED(){return s.gate;}, AUTHZ_CACHE_ROLLOUT_SCOPE:'b2b-context',PRODUCER_CONTEXT_MONITOR_ENABLED:false,CONSULTANT_CONTEXT_MONITOR_ENABLED: false, OPERATOR_CONTEXT_MONITOR_ENABLED:false}));
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
vi.mock('@/components/ui/sidebar',()=>({SidebarProvider:({children}:{children:React.ReactNode})=><>{children}</>,SidebarTrigger:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 auth:{getSession:async()=>({data:{session:{user:{id:s.uid}}}}),onAuthStateChange:(listener:typeof s.authListener)=>{s.authListener=listener;return {data:{subscription:{unsubscribe(){s.authListener=undefined;}}}};},signOut:async()=>{}},
 from:(t:string)=>chain(()=>t==='profiles'?{data:{user_id:s.rowUid??s.uid,organization_id:s.org,ativo:s.active,senha_provisoria:s.password,nome:'Operador'},error:s.fail==='profiles'?{}:null}:t==='user_roles'?{data:s.roles.map(role=>({role})),error:s.fail==='user_roles'?{}:null}:{data:[]}),
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
function Draft(){const [draft,setDraft]=useState(''); const [modal,setModal]=useState(false);return <><input aria-label="Rascunho operador" value={draft} onChange={e=>setDraft(e.target.value)}/><button onClick={()=>setModal(true)}>Abrir modal</button>{modal&&<div role="dialog">Modal em edição</div>}</>;}
function Switch(){return <><Link to="/selecionar-portal?intent=switch">Trocar portal</Link></>;}
function setup(path='/financeiro/receber'){
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={qc}><AuthProvider><MemoryRouter initialEntries={[path]}><Location/><Routes>
 <Route element={<ProtectedRoutes/>}>{['/financeiro/receber','/dashboard/geral'].map(path=><Route key={path} path={path} element={<RoleGuard><Switch/><Draft/><CockpitFixture/></RoleGuard>}/>)}</Route>
 <Route element={<AppPortalGuard/>}><Route element={<MobileLayout/>}>{['/app','/app/atendimentos','/app/registrar'].map(path=><Route key={path} path={path} element={<><Switch/><Draft/><CockpitFixture/></>}/>)}</Route></Route>
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
beforeEach(()=>{vi.useFakeTimers();s.uid=U;s.authListener=undefined;s.gate=true;s.active=true;s.password=false;s.roleAllowed=true;s.roles=['gestor','consultor_tecnico'];s.org=O;s.finalOrg=undefined;s.h15=0;s.hold=undefined;s.late=undefined;s.error=false;s.fail='';s.roleCalls=[];s.rowUid=undefined;s.deniedRole='';s.preferenceHold=undefined;s.rtt=0;localStorage.clear();Object.defineProperty(navigator,'onLine',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('paired probe: real sources with fake transport, not hosted JWT/RLS',()=>{
 it.each([['gestor','consultor_tecnico'],['consultor_tecnico','gestor']])('ordered fingerprint and both canonical has_role: %j',async (...roles)=>{
   s.roles=roles;const result=await internalContextProbe(U,O,MANAGER_CONSULTANT_ROLES);
   expect(result).toEqual({eligible:true,fingerprint:JSON.stringify([U,O,['consultor_tecnico','gestor']])});
   expect(s.roleCalls).toEqual([{_user_id:U,_role:'consultor_tecnico'},{_user_id:U,_role:'gestor'}]);
 });
 it.each([[],['gestor'],['consultor_tecnico'],['gestor','gestor'],['consultor_tecnico','consultor_tecnico'],['gestor','consultor_tecnico','administrador'],['gestor','consultor_tecnico','superadmin'],['gestor','parceiro_b2b'],['gestor','consultor_tecnico','parceiro_b2b']])('reject actual roles %j',async (...roles)=>{
   s.roles=roles;expect((await internalContextProbe(U,O,MANAGER_CONSULTANT_ROLES)).eligible).toBe(false);expect(s.roleCalls).toHaveLength(0);
 });
 it.each(['gestor','consultor_tecnico'])('canonical has_role denial for %s',async role=>{s.deniedRole=role;expect((await internalContextProbe(U,O,MANAGER_CONSULTANT_ROLES)).eligible).toBe(false);});
 it.each(['inactive','provisional','tenant','null','uid','final_h15'])('readiness %s denies',async reason=>{
   if(reason==='inactive')s.active=false;if(reason==='provisional')s.password=true;if(reason==='tenant')s.org=U;if(reason==='null')s.org=null;if(reason==='uid')s.rowUid=O;if(reason==='final_h15')s.finalOrg=U;
   expect((await internalContextProbe(U,O,MANAGER_CONSULTANT_ROLES)).eligible).toBe(false);
 });
 it.each(['profiles','user_roles','has_role','final_h15'])('transport failure %s never grants lease',async fail=>{s.fail=fail;await expect(internalContextProbe(U,O,MANAGER_CONSULTANT_ROLES)).rejects.toThrow('internal_probe_unavailable');});
 it.each([[],['gestor'],['gestor','gestor'],['financeiro','consultor_tecnico'],['gestor','consultor_tecnico','superadmin'],['administrador','consultor_tecnico']])('expected allowlist rejects %j before RPC',async (...roles)=>{
   expect((await internalContextProbe(U,O,roles as unknown as typeof MANAGER_CONSULTANT_ROLES)).eligible).toBe(false);expect(s.h15).toBe(0);
 });
 it('expected roles cannot mutate during await',async()=>{
   const expected=['gestor','consultor_tecnico'];let resolve:((v:unknown)=>void)|undefined;s.hold=()=>new Promise(r=>resolve=r);
   const pending=internalContextProbe(U,O,expected as unknown as typeof MANAGER_CONSULTANT_ROLES);expected[0]='administrador';resolve?.(O);
   expect((await pending).eligible).toBe(true);expect(Object.isFrozen(MANAGER_CONSULTANT_ROLES)).toBe(true);
 });
 it.each([null,'','invalid'])('scope rejects invalid tenant %j',org=>expect(isManagerConsultantScope(['gestor','consultor_tecnico'],org)).toBe(false));
});
describe('paired scope full layouts, actual AuthProvider/guards/layouts/selector, stub page',()=>{
 it.each(['/financeiro/receber','/app','/app/atendimentos'])('%s preserves modal/draft across identical polls; inactive retry denies and restore is clean',async path=>{
   const qc=setup(path);await tick();fireEvent.change(screen.getByRole('textbox'),{target:{value:'draft multipapel'}});fireEvent.click(screen.getByRole('button',{name:'Abrir modal'}));
   const before=s.h15;await tick(10000);s.roles.reverse();await tick(10000);expect(s.h15).toBeGreaterThanOrEqual(before+2);expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('draft multipapel');expect(screen.getByRole('dialog')).toBeTruthy();
   s.active=false;await tick(10000);paused(qc,path);fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();paused(qc,path);
   s.active=true;fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');expect(screen.queryByRole('dialog')).toBeNull();
 });
 it.each(['manager_loss','consultant_loss','duplicate','additional','superadmin','external','tenant','null','provisional','error','manager_denied','consultant_denied'])('%s pauses without silently adopting cached authority',async reason=>{
   const qc=setup();await tick();if(reason==='manager_loss')s.roles=['consultor_tecnico'];if(reason==='consultant_loss')s.roles=['gestor'];if(reason==='duplicate')s.roles=['gestor','gestor'];if(reason==='additional')s.roles.push('administrador');if(reason==='superadmin')s.roles.push('superadmin');if(reason==='external')s.roles.push('parceiro_b2b');if(reason==='tenant')s.org=U;if(reason==='null')s.org=null;if(reason==='provisional')s.password=true;if(reason==='error')s.error=true;if(reason==='manager_denied')s.deniedRole='gestor';if(reason==='consultant_denied')s.deniedRole='consultor_tecnico';
   await tick(10000);paused(qc);fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();
   // Owner 19/10 17:20: pair→single remaining role is re-resolved and monitored (residual scope).
   if(reason==='manager_loss'||reason==='consultant_loss'){expect(screen.queryByText('Sessão de acesso pausada')).toBeNull();return;}
   paused(qc);
   s.roles=['gestor','consultor_tecnico'];s.org=O;s.password=false;s.error=false;s.deniedRole='';fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();expect(screen.getByText('Menu desktop')).toBeTruthy();
 });
 it.each(['/financeiro/receber','/app/registrar','/selecionar-portal'])('%s environmental check keeps confirmed view only until deadline; late response cannot reopen',async path=>{
   const qc=setup(path);await tick();let resolve:((v:unknown)=>void)|undefined;s.hold=()=>new Promise(r=>resolve=r);const before=s.h15;
   act(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});await tick();expect(s.h15).toBe(before+1);expect(screen.queryByText('Verificando seu acesso')).toBeNull();
   if(path==='/selecionar-portal')expect(screen.getByRole('button',{name:'Acessar Gestão'})).toBeTruthy();else expect(screen.getByRole('textbox')).toBeTruthy();
   await tick(15001);paused(qc,path);resolve?.(O);await tick();paused(qc,path);
 });
 it.each(['/financeiro/receber','/app/registrar'])('%s hidden polls and simultaneous focus/visibility preserve drafts and modal on identical fingerprint',async path=>{
   setup(path);await tick();fireEvent.change(screen.getByRole('textbox'),{target:{value:'rascunho entre abas'}});fireEvent.click(screen.getByRole('button',{name:'Abrir modal'}));
   Object.defineProperty(document,'visibilityState',{value:'hidden'});act(()=>document.dispatchEvent(new Event('visibilitychange')));const before=s.h15;
   await tick(10000);await tick(10000);expect(s.h15).toBe(before+4);
   let resolve:((v:unknown)=>void)|undefined;s.hold=()=>new Promise(r=>resolve=r);Object.defineProperty(document,'visibilityState',{value:'visible'});
   act(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});await tick();expect(s.h15).toBe(before+5);
   expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('rascunho entre abas');expect(screen.getByRole('dialog')).toBeTruthy();
   resolve?.(O);await tick();expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('rascunho entre abas');expect(screen.getByRole('dialog')).toBeTruthy();
 });
 it.each(['gestor','consultor_tecnico','error','offline'])('environmental %s denies, clears drafts/cache and restore stays clean',async reason=>{
   const qc=setup();await tick();fireEvent.change(screen.getByRole('textbox'),{target:{value:'não recuperar'}});fireEvent.click(screen.getByRole('button',{name:'Abrir modal'}));
   if(reason==='error')s.error=true;else if(reason==='offline')Object.defineProperty(navigator,'onLine',{value:false});else s.roles=s.roles.filter(r=>r!==reason);
   act(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});await tick();paused(qc);
   fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();
   // Residual remaining role recovers via validated re-resolution; previous draft/modal never revive.
   if(reason==='gestor'||reason==='consultor_tecnico'){expect(screen.queryByText('Sessão de acesso pausada')).toBeNull();expect(screen.queryByRole('dialog')).toBeNull();const box=screen.queryByRole('textbox') as HTMLInputElement|null;if(box)expect(box.value).toBe('');return;}
   paused(qc);
   s.roles=['gestor','consultor_tecnico'];s.error=false;Object.defineProperty(navigator,'onLine',{value:true});fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');expect(screen.queryByRole('dialog')).toBeNull();
 });
 it.each(['/financeiro/receber','/app/registrar'])('%s constant RTT 3s for 60s keeps draft/modal without pause or epoch; later inactivation still pauses',async path=>{
   s.rtt=1500;const qc=setup(path);await tick(3000);await tick(3000);fireEvent.change(screen.getByRole('textbox'),{target:{value:'rascunho rtt3'}});fireEvent.click(screen.getByRole('button',{name:'Abrir modal'}));
   const before=s.h15;
   for(let i=0;i<600;i++){await act(async()=>{await vi.advanceTimersByTimeAsync(100);});expect(screen.queryByText('Sessão de acesso pausada')).toBeNull();expect(screen.queryByText('Verificando seu acesso')).toBeNull();}
   expect(s.h15).toBeGreaterThanOrEqual(before+12);expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('rascunho rtt3');expect(screen.getByRole('dialog')).toBeTruthy();
   s.active=false;await tick(12000);paused(qc,path);
 });
 it('explicit revalidate still retires a draft under a valid lease',async()=>{
   function Explicit(){const {revalidateAuthz}=useAuth();return <button onClick={revalidateAuthz}>Revalidar explicitamente</button>;}
   const qc=new QueryClient();render(<QueryClientProvider client={qc}><AuthProvider><MemoryRouter><Explicit/><AppPortalGuard><Draft/></AppPortalGuard></MemoryRouter></AuthProvider></QueryClientProvider>);await tick();fireEvent.change(screen.getByRole('textbox'),{target:{value:'draft explícito'}});fireEvent.click(screen.getByRole('button',{name:'Revalidar explicitamente'}));await tick();expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
 });
 it('selector offers legitimate choices, both transitions remain authorized, revoke hides selector',async()=>{
   const qc=setup('/selecionar-portal');await tick();expect(screen.getByRole('button',{name:'Acessar Gestão'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Acessar Portal Técnico'}));await tick();expect(screen.getByTestId('url').textContent).toBe('/app');
   fireEvent.click(screen.getByRole('link',{name:'Trocar portal'}));await tick();fireEvent.click(screen.getByRole('button',{name:'Acessar Gestão'}));await tick();expect(screen.getByTestId('url').textContent).toBe('/dashboard/geral');
   fireEvent.click(screen.getByRole('link',{name:'Trocar portal'}));await tick();s.active=false;await tick(10000);paused(qc,'/selecionar-portal');fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();paused(qc,'/selecionar-portal');s.active=true;fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();expect(screen.getByRole('button',{name:'Acessar Gestão'})).toBeTruthy();
 });
 it('late preference completion cannot navigate after revocation',async()=>{
   let resolve:((v:unknown)=>void)|undefined;s.preferenceHold=()=>new Promise(r=>resolve=r);const qc=setup('/selecionar-portal');await tick();fireEvent.click(screen.getByRole('button',{name:'Acessar Gestão'}));await tick();s.active=false;await tick(10000);paused(qc,'/selecionar-portal');resolve?.({ok:true});await tick();paused(qc,'/selecionar-portal');
 });
 it.each(['offline','identity','unmount'])('%s fences delayed page data',async reason=>{
   let resolve:((v:unknown)=>void)|undefined;s.late=()=>new Promise(r=>resolve=r);const qc=setup();await tick();
   if(reason==='unmount')cleanup();if(reason==='offline'){Object.defineProperty(navigator,'onLine',{value:false});act(()=>window.dispatchEvent(new Event('offline')));await tick();paused(qc);}if(reason==='identity'){s.uid='00000000-0000-4000-8000-000000000003';act(()=>s.authListener?.('SIGNED_IN',{user:{id:s.uid}}));await tick();}
   resolve?.({data:{total_receivable_expected:999},error:null});await tick();expect(screen.queryByText('999 OS')).toBeNull();expect(JSON.stringify(qc.getQueryCache().getAll().map(q=>q.state.data))).not.toContain('999');
 });
 it('gate OFF keeps candidate inactive',async()=>{s.gate=false;setup();await tick(30000);expect(s.h15).toBe(0);expect(screen.getByText('Menu desktop')).toBeTruthy();});
});
describe('paired scope initial boundaries fail closed',()=>{
 it.each(['gestor','consultor_tecnico'])('loss %s observed before first confirmation never mounts desktop',async role=>{
   let resolve:((v:unknown)=>void)|undefined;s.hold=()=>new Promise(r=>resolve=r);const qc=setup();await tick();expect(screen.getByText('Verificando seu acesso')).toBeTruthy();s.roles=s.roles.filter(r=>r!==role);resolve?.(O);await tick();paused(qc);
 });
 it.each([['gestor'],['gestor','consultor_tecnico','administrador'],['gestor','consultor_tecnico','superadmin'],['gestor','parceiro_b2b']])('non-allowlisted login %j does not create paired monitor',async (...roles)=>{s.roles=roles;setup();await tick(30000);expect(s.h15).toBe(0);});
 it('duplicate pair at login is denied by raw server roles, despite legacy normalization',async()=>{s.roles=['gestor','consultor_tecnico','gestor'];const qc=setup();await tick();paused(qc);});
});

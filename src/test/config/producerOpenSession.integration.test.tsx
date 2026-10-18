// Real AuthProvider/monitor/Router/layouts/membership/scoped queries; fake RPC
// transport, not login/JWT/RLS proof. Producer production gate remains false.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const U='00000000-0000-4000-8000-000000000001', O='00000000-0000-4000-8000-000000000002', C='00000000-0000-4000-8000-000000000003', D='00000000-0000-4000-8000-000000000004';
const s=vi.hoisted(()=>({gate:true,roles:['cliente_produtor'],org:'00000000-0000-4000-8000-000000000002',ids:['00000000-0000-4000-8000-000000000003'] as unknown, rowOrg:undefined as string|undefined, h15:0,hold:undefined as undefined|(()=>Promise<unknown>),late:undefined as undefined|(()=>Promise<unknown>),error:false}));
function chain(result:()=>unknown){const q:Record<string,unknown>={};for(const n of ['select','eq','is','filter','in','not','neq','order','abortSignal'])q[n]=()=>q;q.maybeSingle=async()=>result();q.then=(f:(v:unknown)=>void)=>Promise.resolve(result()).then(f);return q;}
vi.mock('@/lib/authz/authzEpochGate',()=>({AUTHZ_CACHE_FOUNDATION_ENABLED:true,AUTHZ_CACHE_ROLLOUT_SCOPE:'b2b-context',FINANCIAL_CONTEXT_MONITOR_ENABLED:false,get PRODUCER_CONTEXT_MONITOR_ENABLED(){return s.gate;}}));
vi.mock('@/lib/portalBroadcast',()=>({subscribePortalEvents:()=>()=>{},broadcastPortalEvent:()=>{}}));
vi.mock('@/lib/accessAuditLog',()=>({logAccessDeniedOnce:()=>{},routeGroupFromPath:()=> 'producer'}));
vi.mock('@/hooks/useOfflineSync',()=>({useOfflineSync:()=>({isOnline:true,pendingCount:0,syncing:false,syncAll:()=>{}})}));
vi.mock('@/hooks/useSystemConfig',()=>({useSystemConfig:()=>({defaults:{nome_empresa:'Cultivo Farm'}})}));
vi.mock('@/hooks/useEntitlements',()=>({useEntitlements:()=>({status:'active',features:[]})}));
vi.mock('@/hooks/useBranding',()=>({usePortalBranding:()=>({})}));
vi.mock('@/components/portal/PortalTopBar',()=>({PortalTopBar:()=>null}));
vi.mock('@/components/LogoDisplay',()=>({LogoDisplay:()=>null}));
vi.mock('@/components/app/OfflineIndicator',()=>({OfflineIndicator:()=>null}));
vi.mock('@/components/app/PendingMediaRecovery',()=>({PendingMediaRecovery:()=>null}));
vi.mock('@/components/nav/PortalSidebar',()=>({PortalSidebar:()=>null}));
vi.mock('@/components/ui/sidebar',()=>({SidebarProvider:({children}:{children:React.ReactNode})=><>{children}</>,SidebarTrigger:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 auth:{getSession:async()=>({data:{session:{user:{id:U}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{}},
 from:(t:string)=>chain(()=>{
  if(t==='profiles')return {data:{id:'profile',user_id:U,organization_id:s.org,ativo:true,senha_provisoria:false,nome:'Produtor'}};
  if(t==='user_roles')return {data:s.roles.map(role=>({role}))};
  if(t==='user_clientes')return {data:(Array.isArray(s.ids)?s.ids:[]).map(cliente_id=>({cliente_id,is_active:true,revoked_at:null,principal:cliente_id===C}))};
  if(t==='clientes')return {data:(Array.isArray(s.ids)?s.ids:[]).map(id=>({id,nome:id===C?'Cliente A':'Cliente B',organization_id:s.rowOrg??s.org}))};
  if(s.late && t==='talhoes'){const late=s.late;s.late=undefined;return late();}
  return {data:t==='fazendas'?[{id:C}]:[],count:2,error:null};
 }),
 rpc:(name:string)=>{const request=(async()=>{
  if(name==='h15_actor_organization'){s.h15++; const hold=s.hold;s.hold=undefined;return {data:hold?await hold():s.org,error:s.error?{}:null};}
  if(name==='get_cliente_ids_for_user')return {data:s.ids,error:null};
  if(name==='get_my_available_portal_contexts')return {data:{available_contexts:[],has_technical_access:false,is_admin:false}};
  throw new Error('unexpected '+name);
 })();return Object.assign(request,{abortSignal:()=>request});},
 channel:()=>{const c={on:()=>c,subscribe:()=>c};return c;},removeChannel:()=>{}
}}));
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AppPortalGuard } from '@/components/guards/AppPortalGuard';
import { AuthzEpochBoundary } from '@/components/authz/AuthzEpochBoundary';
import { PortalGuard } from '@/App';
import MobileLayout from '@/pages/app/MobileLayout';
import MobileDashboardProdutor from '@/pages/app/MobileDashboardProdutor';
import PortalLayout from '@/pages/portal/PortalLayout';
import PortalDashboard from '@/pages/portal/PortalDashboard';
import { usePortalCliente } from '@/hooks/usePortalCliente';
import { producerContextProbe } from '@/lib/authz/producerContextProbe';
function Location(){return <output data-testid="url">{useLocation().pathname}</output>;}
function Selection(){const c=usePortalCliente();const a=useAuth();return <><output data-testid="selected">{c.clienteId}</output><output data-testid="clients">{c.clientes.map(c=>c.id).join(',')}</output><button onClick={()=>c.setClienteAtivo(D)}>Selecionar B</button><button onClick={()=>a.revalidateAuthz()}>Revalidar</button></>;}
async function tick(ms=0){await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});for(let i=0;i<10;i++)await act(async()=>{await vi.advanceTimersByTimeAsync(1);});}
function setup(path:string){const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={qc}><AuthProvider><MemoryRouter initialEntries={[path]}><Location/><Routes>
 <Route element={<AppPortalGuard/>}><Route element={<MobileLayout/>}><Route path="/app" element={<><Selection/><MobileDashboardProdutor/></>}/></Route></Route>
 <Route element={<PortalGuard/>}><Route path="/portal" element={<><Selection/><PortalDashboard/></>}/></Route>
 <Route path="/sem-permissao" element={<div>redirect indevido</div>}/>
 </Routes></MemoryRouter></AuthProvider></QueryClientProvider>);return qc;}
function paused(path:string,qc:QueryClient){expect(screen.getByText('Sessão de acesso pausada')).toBeTruthy();expect(screen.queryByTestId('selected')).toBeNull();expect(screen.getByTestId('url').textContent).toBe(path);expect(qc.getQueryCache().getAll().some(q=>q.state.data!==undefined)).toBe(false);}
beforeEach(()=>{vi.useFakeTimers();s.gate=true;s.roles=['cliente_produtor'];s.org=O;s.ids=[C];s.rowOrg=undefined;s.h15=0;s.hold=undefined;s.late=undefined;s.error=false;localStorage.clear();Object.defineProperty(navigator,'onLine',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('produtor sessão aberta candidata',()=>{
 it.each(['/app','/portal'])('%s seleção B sobrevive dois polls idênticos; revogar B escolhe A',async path=>{s.ids=[C,D];setup(path);await tick();fireEvent.click(screen.getByRole('button',{name:'Selecionar B'}));await tick();expect(screen.getByTestId('selected').textContent).toBe(D);const before=s.h15;await tick(10000);expect(screen.getByTestId('selected').textContent).toBe(D);await tick(10000);expect(s.h15).toBeGreaterThanOrEqual(before+4);expect(screen.getByTestId('selected').textContent).toBe(D);s.ids=[C];await tick(10000);expect(screen.getByTestId('selected').textContent).toBe(C);expect(screen.getByTestId('clients').textContent).toBe(C);});
 it.each(['/app','/portal'])('%s pending inicial/valid/revoke/retry/restore mantém URL e remove contagens',async path=>{
  let resolve:((v:unknown)=>void)|undefined;s.hold=()=>new Promise(r=>{resolve=r;});const qc=setup(path);await tick();expect(screen.getByText('Verificando seu acesso')).toBeTruthy();expect(screen.queryByText('Talhões')).toBeNull();expect(screen.queryByText('redirect indevido')).toBeNull();resolve?.(O);await tick();expect(screen.getByTestId('selected').textContent).toBe(C);expect(screen.getByText('Talhões')).toBeTruthy();expect(screen.getByText('Talhões').closest('div')?.textContent).toContain('2');
  s.ids=[];await tick(10000);paused(path,qc);fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();paused(path,qc);
  s.ids=[C];fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();expect(screen.getByTestId('selected').textContent).toBe(C);expect(screen.getByTestId('url').textContent).toBe(path);
 });
 it.each(['/app','/portal'])('%s preserva dois clientes e troca A/B; revogação parcial retira A',async path=>{s.ids=[C,D];setup(path);await tick();expect(screen.getByTestId('clients').textContent).toBe(C+','+D);fireEvent.click(screen.getByRole('button',{name:'Selecionar B'}));await tick();expect(screen.getByTestId('selected').textContent).toBe(D);s.ids=[D];await tick(10000);expect(screen.getByTestId('clients').textContent).toBe(D);expect(screen.getByTestId('selected').textContent).toBe(D);});
 it.each(['/app','/portal'])('%s timeout e resposta antiga nunca reabrem',async path=>{const qc=setup(path);await tick();let resolve:((v:unknown)=>void)|undefined;s.hold=()=>new Promise(r=>{resolve=r;});await tick(10000);await tick(5001);paused(path,qc);resolve?.(O);await tick();paused(path,qc);});
 it.each(['/app','/portal'])('%s rejeita contagem tardia após offline/restore',async path=>{let resolve:((v:unknown)=>void)|undefined;s.late=()=>new Promise(r=>{resolve=r;});const qc=setup(path);await tick();Object.defineProperty(navigator,'onLine',{value:false});act(()=>window.dispatchEvent(new Event('offline')));await tick();paused(path,qc);Object.defineProperty(navigator,'onLine',{value:true});act(()=>window.dispatchEvent(new Event('online')));await tick();resolve?.({data:[],count:999,error:null});await tick();expect(JSON.stringify(qc.getQueryCache().getAll().map(q=>q.state.data))).not.toContain('999');});
 it.each(['/app','/portal'])('%s mudança tenant A/B/A descarta resposta de monitor antiga',async path=>{const qc=setup(path);await tick();let resolve:((v:unknown)=>void)|undefined;s.hold=()=>new Promise(r=>{resolve=r;});await tick(10000);s.org=D;resolve?.(D);await tick();paused(path,qc);s.org=O;fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();expect(screen.getByTestId('selected').textContent).toBe(C);});
 it.each([{roles:['administrador']},{roles:['cliente_produtor','administrador']},{roles:['cliente_produtor','consultor_tecnico']}])('não monitora login interno/multipapel $roles',async ({roles})=>{s.roles=roles;setup('/portal');await tick(30000);expect(s.h15).toBe(0);});
 it('gate produtor fechado preserva baseline sem monitor',async()=>{s.gate=false;setup('/app');await tick(30000);expect(s.h15).toBe(0);expect(screen.getByTestId('selected').textContent).toBe(C);});
});
describe('probe canônico self h15 + RLS',()=>{
 it.each([null,true,'true',{},['invalid']])('rejeita resposta inválida %j',async ids=>{s.ids=ids;await expect(producerContextProbe(U,O)).rejects.toThrow();});
 it('erro h15 falha fechado',async()=>{s.error=true;await expect(producerContextProbe(U,O)).rejects.toThrow();});
 it('tenant incorreto é inelegível sem vínculo genérico como fallback',async()=>{s.org=D;expect((await producerContextProbe(U,O)).eligible).toBe(false);});
 it('RLS response de tenant alheio rejeitada',async()=>{s.rowOrg=D;await expect(producerContextProbe(U,O)).rejects.toThrow();});
 it('multi-cliente normaliza conjunto sem limitar a um',async()=>{s.ids=[D,C,C];const p=await producerContextProbe(U,O);expect(p.eligible).toBe(true);expect(JSON.parse(p.fingerprint??'null')).toEqual([U,O,[C,D]]);});
});

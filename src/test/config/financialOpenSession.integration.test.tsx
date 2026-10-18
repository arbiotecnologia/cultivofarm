// Real AuthProvider/monitor/ProtectedRoutes/AppLayout/financial dashboard/cache.
// Only transports/session and unrelated shell widgets are fake: not JWT/RLS.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const U='00000000-0000-4000-8000-000000000001', O='00000000-0000-4000-8000-000000000002';
const s=vi.hoisted(()=>({gate:true,active:true as unknown,password:false as unknown,roleAllowed:true as unknown,roles:['financeiro'],org:'00000000-0000-4000-8000-000000000002',h15:0,error:false,hold:undefined as undefined|(()=>Promise<unknown>),late:undefined as undefined|(()=>Promise<unknown>),rowUid:undefined as string|undefined}));
function chain(result:()=>unknown){const q:Record<string,unknown>={};for(const n of ['select','eq','is','filter','in','not','neq','order','abortSignal'])q[n]=()=>q;q.maybeSingle=async()=>result();q.then=(f:(v:unknown)=>void)=>Promise.resolve(result()).then(f);return q;}
vi.mock('@/lib/authz/authzEpochGate',()=>({AUTHZ_CACHE_FOUNDATION_ENABLED:true,AUTHZ_CACHE_ROLLOUT_SCOPE:'b2b-context',PRODUCER_CONTEXT_MONITOR_ENABLED:false,get FINANCIAL_CONTEXT_MONITOR_ENABLED(){return s.gate;}}));
vi.mock('@/lib/portalBroadcast',()=>({subscribePortalEvents:()=>()=>{},broadcastPortalEvent:()=>{}}));
vi.mock('@/hooks/useSystemConfig',()=>({useSystemConfig:()=>({defaults:{nome_empresa:'Cultivo Farm'}})}));
vi.mock('@/hooks/useOrgOnboarding',()=>({useOnboardingState:()=>({data:{required:false}})}));
vi.mock('@/components/AppSidebar',()=>({AppSidebar:()=> <nav>Menu financeiro</nav>}));
vi.mock('@/components/portal/PortalTopBar',()=>({PortalTopBar:()=>null}));
vi.mock('@/components/ui/sidebar',()=>({SidebarProvider:({children}:{children:React.ReactNode})=><>{children}</>,SidebarTrigger:()=>null}));
vi.mock('@/components/financeiro/bi/AlertasGestor',()=>({AlertasGestor:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 auth:{getSession:async()=>({data:{session:{user:{id:U}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{}},
 from:(t:string)=>chain(()=>t==='profiles'?{data:{user_id:s.rowUid??U,organization_id:s.org,ativo:s.active,senha_provisoria:s.password,nome:'Financeiro'}}:t==='user_roles'?{data:s.roles.map(role=>({role}))}:{data:[]}),
 rpc:async(name:string)=>{
  if(name==='has_role')return {data:s.roleAllowed,error:null};
  if(name==='h15_actor_organization'){s.h15++;const hold=s.hold;s.hold=undefined;return {data:hold?await hold():(s.active===true&&s.password===false?s.org:null),error:s.error?{}:null};}
  if(name==='get_financial_dashboard_summary'){const late=s.late;s.late=undefined;return late?await late():{data:{total_receivable_expected:100},error:null};}
  if(name==='get_top_financial_rankings')return {data:{},error:null};
  throw new Error('unexpected '+name);
 }
}}));
import { AuthProvider } from '@/hooks/useAuth';
import { ProtectedRoutes } from '@/App';
import FinanceiroDashboard from '@/pages/financeiro/FinanceiroDashboard';
import { internalContextProbe } from '@/lib/authz/internalContextProbe';
function Location(){return <output data-testid="url">{useLocation().pathname}</output>;}
function setup(){const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={qc}><AuthProvider><MemoryRouter initialEntries={['/financeiro']}><Location/><Routes><Route element={<ProtectedRoutes/>}><Route path="/financeiro" element={<FinanceiroDashboard/>}/></Route><Route path="/auth" element={<div>login indevido</div>}/></Routes></MemoryRouter></AuthProvider></QueryClientProvider>);return qc;}
async function tick(ms=0){await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});for(let i=0;i<10;i++)await act(async()=>{await vi.advanceTimersByTimeAsync(1);});}
function paused(qc:QueryClient){expect(screen.getByText('Sessão de acesso pausada')).toBeTruthy();expect(screen.queryByText('Menu financeiro')).toBeNull();expect(screen.queryByText('R$ 100,00')).toBeNull();expect(screen.getByTestId('url').textContent).toBe('/financeiro');expect(qc.getQueryCache().getAll().some(q=>q.state.data!==undefined)).toBe(false);}
beforeEach(()=>{vi.useFakeTimers();s.gate=true;s.active=true;s.password=false;s.roleAllowed=true;s.roles=['financeiro'];s.org=O;s.h15=0;s.hold=undefined;s.late=undefined;s.error=false;s.rowUid=undefined;localStorage.clear();Object.defineProperty(navigator,'onLine',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('financeiro sessão aberta candidata',()=>{
 it('pending/valid/inativação/retry/restore remove valores e navegação na mesma URL',async()=>{
  let resolve:((v:unknown)=>void)|undefined;s.hold=()=>new Promise(r=>{resolve=r;});const qc=setup();await tick();expect(screen.getByText('Verificando seu acesso')).toBeTruthy();expect(screen.queryByText('Menu financeiro')).toBeNull();resolve?.(O);await tick();expect(screen.getByText('R$ 100,00')).toBeTruthy();
  s.active=false;await tick(10000);paused(qc);fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();paused(qc);s.active=true;fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();expect(screen.getByText('R$ 100,00')).toBeTruthy();expect(screen.getByTestId('url').textContent).toBe('/financeiro');
 });
 it.each([[],['administrador'],['financeiro','administrador']])('role atual %j pausa sem adotar RBAC novo',async roles=>{const qc=setup();await tick();s.roles=roles;await tick(10000);paused(qc);s.roles=['financeiro'];fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await tick();expect(screen.getByText('Menu financeiro')).toBeTruthy();});
 it('timeout descarta confirmação tardia',async()=>{const qc=setup();await tick();let resolve:((v:unknown)=>void)|undefined;s.hold=()=>new Promise(r=>{resolve=r;});await tick(15001);paused(qc);resolve?.(O);await tick();paused(qc);});
 it('offline/restore descarta R$999 de consulta antiga',async()=>{let resolve:((v:unknown)=>void)|undefined;s.late=()=>new Promise(r=>{resolve=r;});const qc=setup();await tick();Object.defineProperty(navigator,'onLine',{value:false});act(()=>window.dispatchEvent(new Event('offline')));await tick();paused(qc);Object.defineProperty(navigator,'onLine',{value:true});act(()=>window.dispatchEvent(new Event('online')));await tick();resolve?.({data:{total_receivable_expected:999},error:null});await tick();expect(screen.queryByText('R$ 999,00')).toBeNull();expect(JSON.stringify(qc.getQueryCache().getAll().map(q=>q.state.data))).not.toContain('999');});
 it('gate fechado preserva baseline sem monitor financeiro',async()=>{s.gate=false;setup();await tick(30000);expect(s.h15).toBe(0);expect(screen.getByText('Menu financeiro')).toBeTruthy();});
 it('login administrador não entra no recorte financeiro',async()=>{s.roles=['administrador'];setup();await tick(30000);expect(s.h15).toBe(0);});
});
describe('probe financeiro self/readiness',()=>{
 it.each([false,'true',null])('has_role estritamente true: %j negado',async allowed=>{s.roleAllowed=allowed;expect((await internalContextProbe(U,O)).eligible).toBe(false);});
 it.each([false,'true',null])('ativo estritamente true: %j negado',async active=>{s.active=active;expect((await internalContextProbe(U,O)).eligible).toBe(false);});
 it('senha provisória nega',async()=>{s.password=true;expect((await internalContextProbe(U,O)).eligible).toBe(false);});
 it('h15 erro falha fechado',async()=>{s.error=true;await expect(internalContextProbe(U,O)).rejects.toThrow();});
 it('tenant divergente nega',async()=>{s.org=U;expect((await internalContextProbe(U,O)).eligible).toBe(false);});
 it('perfil de outro UID nega',async()=>{s.rowUid=O;expect((await internalContextProbe(U,O)).eligible).toBe(false);});
 it('h15 final divergente nega',async()=>{let n=0;s.hold=async()=>{s.org=U;n++;return O;};expect((await internalContextProbe(U,O)).eligible).toBe(false);expect(n).toBe(1);});
});
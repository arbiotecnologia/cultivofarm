// Real AuthProvider/monitor/ProtectedRoutes/AppLayout/cache; cockpit page stub.
// Only transports/session and unrelated shell widgets are fake: not JWT/RLS.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useAuthenticatedAttachmentOpener } from '@/hooks/useAuthenticatedAttachmentOpener';
const U='00000000-0000-4000-8000-000000000001', O='00000000-0000-4000-8000-000000000002';
const s=vi.hoisted(()=>({uid:'00000000-0000-4000-8000-000000000001',authListener:undefined as undefined|((event:string,session:{user:{id:string}})=>void),gate:true,active:true as unknown,password:false as unknown,roleAllowed:true as unknown,roles:['gestor','consultor_tecnico'],org:'00000000-0000-4000-8000-000000000002' as string|null,finalOrg:undefined as string|undefined,h15:0,error:false,fail:'',hold:undefined as undefined|(()=>Promise<unknown>),late:undefined as undefined|(()=>Promise<unknown>),rowUid:undefined as string|undefined, roleCalls:[] as unknown[], deniedRole:'', preferenceHold:undefined as undefined|(()=>Promise<unknown>), rtt:0}));
function chain(result:()=>unknown){const q:Record<string,unknown>={};for(const n of ['select','eq','is','filter','in','not','neq','order','abortSignal'])q[n]=()=>q;q.maybeSingle=async()=>result();q.then=(f:(v:unknown)=>void)=>Promise.resolve(result()).then(f);return q;}
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
vi.mock('@/components/ui/sidebar',()=>({SidebarProvider:({children}:{children:React.ReactNode})=><>{children}</>,SidebarTrigger:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 auth:{getSession:async()=>({data:{session:{user:{id:s.uid}}}}),onAuthStateChange:(listener:typeof s.authListener)=>{s.authListener=listener;return {data:{subscription:{unsubscribe(){s.authListener=undefined;}}}};},signOut:async()=>{}},
 from:(t:string)=>chain(()=>t==='profiles'?{data:{user_id:s.rowUid??s.uid,organization_id:s.org,ativo:s.active,senha_provisoria:s.password,nome:'Operador'},error:s.fail==='profiles'?{}:null}:t==='user_roles'?{data:s.roles.map(role=>({role})),error:s.fail==='user_roles'?{}:null}:{data:[]}),
 rpc:(name:string,args:unknown)=>{const request=(async()=>{
  if(name==='get_my_available_portal_contexts')return {data:{available_contexts:['admin','technical'],has_technical_access:true,is_admin:false,must_select_context:true},error:null};
  if(name==='set_my_context_preference')return {data:s.preferenceHold?await s.preferenceHold():{ok:true},error:null};
  if(name==='has_role'){s.roleCalls.push(args);return {data:(args as {_role:string})._role===s.deniedRole?false:s.roleAllowed,error:s.fail==='has_role'?{}:null};}
  if(name==='h15_actor_organization'){s.h15++;if(s.rtt)await new Promise(r=>setTimeout(r,s.rtt));const hold=s.hold;s.hold=undefined;return {data:hold?await hold():(s.h15===2&&s.finalOrg?s.finalOrg:(s.active===true&&s.password===false?s.org:null)),error:s.error||(s.fail==='final_h15'&&s.h15%2===0)?{}:null};}
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
const bytes=vi.hoisted(()=>({download:vi.fn()}));
vi.mock('@/lib/authz/authenticatedAttachment',async original=>({...await original<typeof import('@/lib/authz/authenticatedAttachment')>(),downloadAuthenticatedAttachment:(...args:unknown[])=>bytes.download(...args)}));
function Prepared(){const {authzEpoch}=useAuth();const opener=useAuthenticatedAttachmentOpener('environment-receipt','financial-receipts');const path=O+'/2026/REC-2026-000001.pdf';return <><output data-testid="epoch">{authzEpoch}</output><button onClick={()=>void opener.open(path,()=>{})}>Preparar PDF</button>{opener.urls[path]&&<button onClick={()=>opener.download(path,'recibo.pdf')}>Baixar PDF</button>}</>;}
function Draft(){const [draft,setDraft]=useState(''); const [modal,setModal]=useState(false);return <><input aria-label="Rascunho operador" value={draft} onChange={e=>setDraft(e.target.value)}/><button onClick={()=>setModal(true)}>Abrir modal</button>{modal&&<div role="dialog">Modal em edição</div>}</>;}
function Switch(){return <><Link to="/selecionar-portal?intent=switch">Trocar portal</Link></>;}
function setup(path='/financeiro/receber'){
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={qc}><AuthProvider><MemoryRouter initialEntries={[path]}><Location/><Routes>
 <Route element={<ProtectedRoutes/>}>{['/financeiro/receber','/dashboard/geral'].map(path=><Route key={path} path={path} element={<RoleGuard><Switch/><Draft/><Prepared/><CockpitFixture/></RoleGuard>}/>)}</Route>
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
beforeEach(()=>{vi.useFakeTimers();s.uid=U;s.authListener=undefined;s.gate=true;s.active=true;s.password=false;s.roleAllowed=true;s.roles=['gestor','consultor_tecnico'];s.org=O;s.finalOrg=undefined;s.h15=0;s.hold=undefined;s.late=undefined;s.error=false;s.fail='';s.roleCalls=[];s.rowUid=undefined;s.deniedRole='';s.preferenceHold=undefined;s.rtt=0;bytes.download.mockReset();bytes.download.mockResolvedValue(new Blob(['pdf']));vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:prepared');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});localStorage.clear();Object.defineProperty(navigator,'onLine',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});

import {act,render,screen,waitFor,fireEvent} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {useState} from 'react';
const s=vi.hoisted(()=>({auth:{user:{id:'A'} as {id:string}|null,profile:{user_id:'A',organization_id:'OA',ativo:true,senha_provisoria:false},roles:['cliente_produtor'],role:'cliente_produtor',loading:false,signOut:vi.fn()},client:'C',loading:false,resolve:undefined as undefined|((v:unknown)=>void),signals:[] as AbortSignal[],callback:undefined as undefined|(()=>void),removed:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>s.auth}));
vi.mock('@/hooks/usePortalCliente',()=>({usePortalCliente:()=>({clienteId:s.client,clienteNome:'Cliente',clientes:[{id:s.client,nome:'Cliente'}],loading:s.loading,setClienteAtivo:vi.fn()})}));
vi.mock('@/hooks/useBranding',()=>({usePortalBranding:()=>({})}));
vi.mock('@/hooks/useNavCollapseState',()=>({useSidebarOpenState:()=>({open:true,setOpen:vi.fn()})}));
vi.mock('@/components/nav/PortalSidebar',()=>({PortalSidebar:()=>null}));
vi.mock('@/components/portal/PortalTopBar',()=>({PortalTopBar:()=>null}));
vi.mock('@/components/ui/sidebar',()=>({SidebarProvider:({children}:{children:React.ReactNode})=><>{children}</>,SidebarTrigger:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{const q={select:()=>q,eq:()=>q,abortSignal:(signal:AbortSignal)=>{s.signals.push(signal);return new Promise(r=>{s.resolve=r;});}};return q;},channel:()=>{const c={on:(_e:unknown,_f:unknown,cb:()=>void)=>{s.callback=cb;return c;},subscribe:()=>c};return c;},removeChannel:s.removed}}));
import PortalLayout from '@/pages/portal/PortalLayout';
function Child(){const [value,setValue]=useState('');return <input aria-label="workspace" value={value} onChange={e=>setValue(e.target.value)}/>;}
describe('existing producer workspace context reset',()=>{
 beforeEach(()=>{s.auth.user={id:'A'};s.auth.profile={user_id:'A',organization_id:'OA',ativo:true,senha_provisoria:false};s.auth.roles=['cliente_produtor'];s.auth.loading=false;s.client='C';s.loading=false;s.signals=[];s.removed.mockClear();});
 it.each(['switch','logout','revoke','client'])('%s removes stale children and late badge',async mode=>{
 const qc=new QueryClient();const tree=()=> <QueryClientProvider client={qc}><MemoryRouter><Routes><Route element={<PortalLayout/>}><Route path="*" element={<Child/>}/></Route></Routes></MemoryRouter></QueryClientProvider>;
 const h=render(tree());await waitFor(()=>expect(s.signals).toHaveLength(1));const old=s.callback;const pending=s.resolve;
 fireEvent.change(screen.getByLabelText('workspace'),{target:{value:'previous-private-draft'}});expect(screen.getByLabelText('workspace')).toHaveValue('previous-private-draft');
 if(mode==='switch'){s.auth.user={id:'B'};s.auth.profile={...s.auth.profile,user_id:'B',organization_id:'OB'};}else if(mode==='logout')s.auth.user=null;else if(mode==='revoke')s.auth.profile.ativo=false;else s.client='D';
 h.rerender(tree());await act(async()=>{pending?.({count:99,error:null});old?.();});expect(s.signals[0].aborted).toBe(true);expect(s.removed).toHaveBeenCalled();
 if(mode==='logout'||mode==='revoke')expect(screen.queryByLabelText('workspace')).toBeNull();else expect(screen.getByLabelText('workspace')).toHaveValue('');
 h.unmount();qc.clear();
 });
});

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const t=vi.hoisted(()=>({auth:{} as any,rows:[] as any[],error:null as any,rpc:vi.fn(),filters:[] as any[],toast:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>t.auth}));
vi.mock('sonner',()=>({toast:{error:t.toast,success:vi.fn()}}));
vi.mock('@/components/financeiro/ConfirmarEntregaFinanceiroDialog',()=>({ConfirmarEntregaFinanceiroDialog:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:t.rpc,from:()=>{const c:any={select:()=>c,eq:(...a:any[])=>{t.filters.push(a);return c;},is:()=>c,order:()=>c,then:(yes:any)=>Promise.resolve({data:t.rows,error:t.error}).then(yes)};return c;}}}));
import Page from '@/pages/financeiro/EntregasNaoFaturadas';
function mount(){const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={qc}><Page/></QueryClientProvider>);}
beforeEach(()=>{vi.clearAllMocks();t.rows=[];t.error=null;t.filters=[];t.auth={user:{id:'A'},profile:{user_id:'A',organization_id:'AR',ativo:true},roles:['financeiro'],loading:false,authzReady:true,authzEpoch:0};});afterEach(cleanup);
it('erro de leitura não é ausência nem tudo faturado',async()=>{t.error=new Error('denied');mount();await screen.findByText(/Não foi possível consultar/);expect(screen.queryByText('Nenhuma entrega no filtro atual.')).toBeNull();expect(t.rpc).not.toHaveBeenCalled();});
it('zero autorizado mantém consulta vazia sem assumir carteira global',async()=>{mount();await screen.findByText('Nenhuma entrega no filtro atual.');expect(t.rpc).not.toHaveBeenCalled();});
it('perfil inativo não consulta e não apresenta ausência confirmada',async()=>{t.auth.profile.ativo=false;mount();expect(t.filters).toEqual([]);expect(screen.queryByText('Nenhuma entrega no filtro atual.')).toBeNull();expect(t.rpc).not.toHaveBeenCalled();});
it('consulta positiva mantém filtros e não gera cobrança',async()=>{t.rows=[{id:'E',clientes:{nome:'Cliente AR'},produtos:{nome:'Produto'},status:'entregue'}];mount();await screen.findByText('Cliente AR');expect(t.filters).toContainEqual(['financial_status','PENDING_BILLING']);expect(t.filters).toContainEqual(['status','entregue']);expect(t.rpc).not.toHaveBeenCalled();});
it('troca AR/FSF não conserva linhas do tenant anterior',async()=>{t.rows=[{id:'E',clientes:{nome:'Cliente AR'},produtos:{nome:'Produto'}}];const h=mount();await screen.findByText('Cliente AR');t.auth.profile.organization_id='FSF';t.rows=[];h.rerender(<QueryClientProvider client={new QueryClient()}><Page/></QueryClientProvider>);await screen.findByText('Nenhuma entrega no filtro atual.');expect(screen.queryByText('Cliente AR')).toBeNull();expect(t.rpc).not.toHaveBeenCalled();});

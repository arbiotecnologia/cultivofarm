import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const t=vi.hoisted(()=>({rpc:vi.fn(),auth:{} as any}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:t.rpc}}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>t.auth}));
vi.mock('@/pages/Auth',()=>({default:()=> <div>Login canônico</div>}));
import Trace from '@/pages/public/RastrearProduto';
const token='11111111-1111-4111-8111-111111111111';
const view=()=> <MemoryRouter initialEntries={[`/rastrear-produto/${token}`]}><Routes><Route path='/rastrear-produto/:token' element={<Trace/>}/></Routes></MemoryRouter>;
beforeEach(()=>{vi.clearAllMocks();t.auth={user:null,loading:false};});
describe('rastreio autorizado e legado',()=>{
 it('novo token sem sessão mostra login sem dados privados',async()=>{t.rpc.mockResolvedValue({data:{valido:false},error:null});render(view());await screen.findByText('Login canônico');expect(t.rpc).toHaveBeenCalledWith('rpc_validar_rastreio_produto',{p_trace_token:token});});
 it('preserva validação pública explicitamente autorizada pelo leitor legado',async()=>{t.rpc.mockResolvedValue({data:{valido:true,status:'ativo',produto_nome:'Legado público'},error:null});render(view());await screen.findByText('Legado público');expect(screen.queryByText('Login canônico')).toBeNull();});
 it('sessão usa exclusivamente novo leitor e snapshot autorizado',async()=>{t.auth={user:{id:'a'},profile:{user_id:'a',organization_id:'AR',ativo:true},roles:['gestor'],loading:false};t.rpc.mockResolvedValue({data:{autorizado:true,status:'ativo',etiqueta:{produto_nome:'Privado',lote_codigo:'L1'},snapshot:{composicao:['Bacillus']}},error:null});render(view());await screen.findByText('Privado');expect(screen.getByText('Bacillus')).toBeInTheDocument();expect(t.rpc).toHaveBeenCalledWith('rpc_consultar_etiqueta_qr_v1',{p_trace_token:token});});
 it('nega envelope não autorizado sem renderizar dados devolvidos',async()=>{t.auth={user:{id:'b'},profile:{user_id:'b',organization_id:'FSF',ativo:true},roles:['gestor'],loading:false};t.rpc.mockResolvedValue({data:{autorizado:false,etiqueta:{produto_nome:'Segredo'}},error:null});render(view());await screen.findByRole('alert');expect(screen.queryByText('Segredo')).toBeNull();});
 it('revogação retira detalhes antes de qualquer releitura',async()=>{t.auth={user:{id:'a'},profile:{user_id:'a',organization_id:'AR',ativo:true},roles:['gestor'],loading:false};t.rpc.mockResolvedValue({data:{autorizado:true,etiqueta:{produto_nome:'Privado'}},error:null});const h=render(view());await screen.findByText('Privado');t.auth={...t.auth,profile:{...t.auth.profile,ativo:false}};h.rerender(view());await waitFor(()=>expect(screen.queryByText('Privado')).toBeNull());expect(t.rpc).toHaveBeenCalledTimes(1);});
});

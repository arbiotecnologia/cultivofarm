import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import projection from './fixtures/money-origin-projection.json';
import { readProvenReceivables, requireReceivableOrigin, MONEY_ORIGIN_MESSAGE } from '@/lib/financeiro/receivableOrigin';
import { calcularSaldoRecebivel } from '@/lib/financeiro/baixaRecebimento';
import { saldoParcela } from '@/lib/financeiro/contasReceber';
const state=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'local-actor'},profile:{user_id:'local-actor',organization_id:'local-org',ativo:true},roles:['financeiro'],loading:false})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.rpc,from:()=>{
 const query:any={};for(const k of ['select','eq','order'])query[k]=()=>query;
 query.maybeSingle=async()=>({data:{require_receipt_for_receivables:false},error:null});
 query.then=(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve);return query;
}}}));
import { BaixaDialog } from '@/components/financeiro/BaixaDialog';
afterEach(()=>{cleanup();state.rpc.mockReset();});
it('gerador PG→projeção→leitor→saldo/baixa/KPI usam mesmo valor',async()=>{
 const rpc=vi.fn(async(_name:string,_args:unknown)=>({data:projection.audit_fixture_projection,error:null}));
 const rows=await readProvenReceivables({rpc},projection.audit_fixture_projection[0].receivable_id);
 expect(rpc.mock.calls[0]).toEqual(['rpc_receivable_money_projection_v1',{p_receivable_id:rows[0].receivable_id,p_offset:0,p_limit:1000}]);
 expect(calcularSaldoRecebivel(rows[0])).toBe(10300);expect(saldoParcela(rows[0])).toBe(10300);
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={qc}><BaixaDialog open onClose={()=>{}} kind="receivable" installment={rows[0]}/></QueryClientProvider>);
 expect(await screen.findByText('Saldo a receber:')).toBeInTheDocument();
 expect(screen.queryByText(MONEY_ORIGIN_MESSAGE)).toBeNull();
 expect(screen.queryByText(/10\.600/)).toBeNull();qc.clear();
});
it('origem ausente é visível e bloqueia operação, sem saldo zero/pago',async()=>{
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={qc}><BaixaDialog open onClose={()=>{}} kind="receivable" installment={{id:'unknown',original_amount:10300,interest_amount:300}}/></QueryClientProvider>);
 expect(await screen.findByRole('alert')).toHaveTextContent(MONEY_ORIGIN_MESSAGE);
 expect(screen.getByRole('button',{name:'Confirmar'})).toBeDisabled();
 expect(screen.queryByText('Saldo a receber:')).toBeNull();expect(state.rpc).not.toHaveBeenCalled();qc.clear();
});
it.each(['installment_id','receivable_id','source'])('prova estrangeira/inválida %s bloqueia',field=>{
 const row=projection.audit_fixture_projection[0];expect(()=>requireReceivableOrigin({...row,monetary_origin:{...row.monetary_origin,[field]:'foreign'}})).toThrow();
});
it('marcador sem prova não autoriza baixa',()=>expect(()=>requireReceivableOrigin({id:'a',receivable_id:'b',original_amount:10300,interest_amount:300,monetary_semantics:'financed_total_v1',financed_interest_amount:300})).toThrow());
it('RPC ausente não usa tabela/heurística de fallback',async()=>{
 await expect(readProvenReceivables({rpc:async()=>({data:null,error:{code:'PGRST202'}})},'title')).rejects.toThrow(MONEY_ORIGIN_MESSAGE);
});
it('mora explicitamente legada10300+100 permanece10400',()=>expect(calcularSaldoRecebivel({original_amount:10300,interest_amount:100,monetary_semantics:'legacy_principal_plus_interest'})).toBe(10400));
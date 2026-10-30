import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const t=vi.hoisted(()=>({rpc:vi.fn(),toast:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:t.rpc,from:()=>{const c:any={select:()=>c,eq:()=>c,neq:()=>c,order:()=>c,limit:()=>c,then:(yes:any)=>Promise.resolve({data:[{id:'E',status:'reservado',codigo_embalagem:'EMB-1'}],error:null}).then(yes)};return c;}}}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:t.toast})}));
vi.mock('@/components/estoque/ConferenciaEmbalagemQR',()=>({ConferenciaEmbalagemQR:()=>null}));
import { operarEstoque } from '@/lib/estoque/motorEstoque';
import { EmbalagensEntregaPanel } from '@/components/estoque/EmbalagensEntregaPanel';
import { ReservarEmbalagemEntregaDialog } from '@/components/estoque/ReservarEmbalagemEntregaDialog';
beforeEach(()=>{vi.clearAllMocks();t.rpc.mockResolvedValue({data:{ok:true},error:null});});
afterEach(cleanup);
function wrapper({children}:{children:React.ReactNode}){return <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{children}</QueryClientProvider>;}
it.each(['expedicao','entrega','estorno_expedicao'] as const)('motor %s não envia RPC sem contrato de entrega',async acao=>{await expect(operarEstoque(acao,'item',1,'key')).rejects.toThrow();expect(t.rpc).not.toHaveBeenCalled();});
it('referência entrega não burla contenção com ação ajuste',async()=>{await expect(operarEstoque('ajuste','item',1,'key',{referencia_tipo:'entrega'})).rejects.toThrow();expect(t.rpc).not.toHaveBeenCalled();});
it('ajuste independente continua no mesmo contrato',async()=>{await operarEstoque('ajuste','item',1,'key',{referencia_tipo:'manual'});expect(t.rpc).toHaveBeenCalledExactlyOnceWith('rpc_estoque_operar_v1',expect.objectContaining({p_acao:'ajuste'}));});
it('separar e confirmar embalagens não enviam alterações',async()=>{render(<EmbalagensEntregaPanel entregaId="E"/>,{wrapper});fireEvent.click(await screen.findByRole('button',{name:'Separar'}));await waitFor(()=>expect(t.toast).toHaveBeenCalled());fireEvent.click(screen.getByRole('button',{name:/Confirmar entrega física/}));await waitFor(()=>expect(t.toast).toHaveBeenCalledTimes(2));expect(t.rpc).not.toHaveBeenCalled();});
it('reserva de embalagem não anuncia sucesso ao abrir consulta',async()=>{const done=vi.fn();render(<ReservarEmbalagemEntregaDialog open embalagemId="item" onOpenChange={vi.fn()} onDone={done}/>,{wrapper});await screen.findByRole('button',{name:'Reservar'});expect(t.rpc).not.toHaveBeenCalled();expect(done).not.toHaveBeenCalled();});

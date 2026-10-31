import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const t=vi.hoisted(()=>({auth:{} as any,rpc:vi.fn(),toast:vi.fn(),close:vi.fn(),confirmed:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>t.auth}));vi.mock('@/hooks/use-toast',()=>({toast:t.toast}));vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:t.rpc}}));
import {ConfirmarEntregaDialog} from '@/components/entregas/ConfirmarEntregaDialog';
const id='11111111-1111-4111-8111-111111111111',obs='2026-10-31T12:00:00Z';
const cap=(target=id)=>({capability:'delivery_confirmation_manual_v1',available:true,actor_id:id,organization_id:id,entrega_id:target,updated_at:obs,status:'em_rota'});
const ack=()=>({success:true,action:'confirm',replay:false,actor_id:id,organization_id:id,entrega_id:id,os_id:id,comprovante_id:id,status:'entregue',os_status:'finalizada',finalizada:true,updated_at:obs});
function mount(){const qc=new QueryClient();const element=(target=id,open=true)=><QueryClientProvider client={qc}><ConfirmarEntregaDialog open={open} entrega={{id:target,status:'em_rota'}} onClose={t.close} onConfirmed={t.confirmed}/></QueryClientProvider>;return {...render(element()),element};}
const button=()=>screen.getByRole('button',{name:'Confirmar entrega'});
const fill=()=>fireEvent.change(screen.getByLabelText('Recebido por *'),{target:{value:'LOCAL'}});
beforeEach(()=>{vi.clearAllMocks();t.auth={user:{id},profile:{user_id:id,organization_id:id,ativo:true},roles:['gestor'],loading:false,authzReady:true,authzEpoch:0};t.rpc.mockImplementation((name:string)=>Promise.resolve({data:name==='rpc_entrega_confirmacao_capability_v1'?cap():ack(),error:null}));});
describe('Mounted canonical physical confirmation',()=>{
 it.each(['missing','false','extra','foreign'])('unavailable %s capability never dispatches writer',async kind=>{
 const data=kind==='missing'?null:{...cap(),...(kind==='false'?{available:false}:kind==='extra'?{extra:true}:{organization_id:'foreign'})};t.rpc.mockResolvedValue({data,error:null});mount();fill();await screen.findByRole('alert');fireEvent.submit(button().closest('form') as HTMLFormElement);expect(button()).toBeDisabled();expect(t.rpc.mock.calls.every(([name])=>name==='rpc_entrega_confirmacao_capability_v1')).toBe(true);expect(t.confirmed).not.toHaveBeenCalled();
 });
 it('fresh capability dispatches once, exact ACK succeeds without billing or upload',async()=>{mount();fill();await waitFor(()=>expect(button()).toBeEnabled());const submit=button();fireEvent.click(submit);fireEvent.click(submit);await waitFor(()=>expect(t.confirmed).toHaveBeenCalledWith('physical',id));expect(t.rpc.mock.calls.filter(([name])=>name==='rpc_entrega_confirmar_manual_v1')).toHaveLength(1);expect(t.rpc.mock.calls.at(-1)?.[1]).toMatchObject({p_observed:obs,p_recebedor:{nome:'LOCAL'}});expect(t.close).toHaveBeenCalledTimes(1);});
 it.each(['target','actor','tenant','epoch','close','ABA'])('stale mounted preflight after %s never adopts',async kind=>{
 let resolve:(v:any)=>void=()=>{};t.rpc.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));const h=mount();fill();let target=id;let open=true;
 if(kind==='target'||kind==='ABA')target='22222222-2222-4222-8222-222222222222';if(kind==='actor')t.auth={...t.auth,user:{id:'other'}};if(kind==='tenant')t.auth.profile={...t.auth.profile,organization_id:'other'};if(kind==='epoch')t.auth.authzEpoch=1;if(kind==='close')open=false;
 h.rerender(h.element(target,open));if(kind==='ABA')h.rerender(h.element());await act(async()=>resolve({data:cap(),error:null}));expect(t.rpc.mock.calls.filter(([name])=>name==='rpc_entrega_confirmar_manual_v1')).toHaveLength(0);expect(t.close).not.toHaveBeenCalled();
 });
 it('scope changes during immediate preflight stop first mutation',async()=>{const h=mount();fill();await waitFor(()=>expect(button()).toBeEnabled());let resolve:(v:any)=>void=()=>{};t.rpc.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));fireEvent.click(button());t.auth.authzEpoch=2;h.rerender(h.element());await act(async()=>resolve({data:cap(),error:null}));expect(t.rpc.mock.calls.filter(([n])=>n==='rpc_entrega_confirmar_manual_v1')).toHaveLength(0);expect(t.confirmed).not.toHaveBeenCalled();});
 it('uncertain ACK retains exact key and payload for explicit reconciliation',async()=>{t.rpc.mockImplementation((n:string)=>Promise.resolve({data:n==='rpc_entrega_confirmacao_capability_v1'?cap():{success:true},error:null}));mount();fill();await waitFor(()=>expect(button()).toBeEnabled());fireEvent.click(button());const retry=await screen.findByRole('button',{name:'Reconciliar mesma tentativa'});const first=t.rpc.mock.calls.find(([n])=>n==='rpc_entrega_confirmar_manual_v1')?.[1];t.rpc.mockImplementation((n:string)=>Promise.resolve({data:n==='rpc_entrega_confirmacao_capability_v1'?cap():ack(),error:null}));fireEvent.click(retry);await waitFor(()=>expect(t.confirmed).toHaveBeenCalled());const sent=t.rpc.mock.calls.filter(([n])=>n==='rpc_entrega_confirmar_manual_v1');expect(sent[1][1]).toEqual(first);});
});

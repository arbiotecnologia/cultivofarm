import { describe, expect, it, vi } from 'vitest';
import { dispatchSend, SEND_CAP_RPC } from '@/lib/entregas/deliverySendFlow';
const id='11111111-1111-4111-8111-111111111111', observed='2026-10-31T13:00:00Z';
const attempt={scope:{actor:id,org:id,entrega:id},os:id,observed,key:id};
const cap={capability:'delivery_send_manual_v1',available:true,actor_id:id,organization_id:id,entrega_id:id,os_id:id,status:'separado',updated_at:observed};
const ack={success:true,action:'send',replay:false,actor_id:id,organization_id:id,entrega_id:id,os_id:id,status:'em_rota',updated_at:observed};
describe('Enviar scoped canonical runtime',()=>{
 it('ACK revision before observed is uncertain after dispatch',async()=>{const sent=vi.fn();const rpc=vi.fn(async n=>({data:n===SEND_CAP_RPC?cap:{...ack,updated_at:'2026-10-31T12:59:59Z'},error:null}));await expect(dispatchSend(rpc,attempt,()=>true,sent)).rejects.toThrow('incerto');expect(sent).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledTimes(2);});
 it('valid send one canonical dispatch',async()=>{const rpc=vi.fn(async n=>({data:n===SEND_CAP_RPC?cap:ack,error:null}));await expect(dispatchSend(rpc,attempt,()=>true,vi.fn())).resolves.toEqual(ack);expect(rpc).toHaveBeenCalledTimes(2);});
 it.each([{available:false},{organization_id:'foreign'},{updated_at:''},{os_id:'different'}])('bad capability no mutation %j',async bad=>{const rpc=vi.fn(async()=>({data:{...cap,...bad},error:null}));await expect(dispatchSend(rpc,attempt,()=>true,vi.fn())).rejects.toThrow();expect(rpc).toHaveBeenCalledTimes(1);});
 it('bad ACK uncertain exact key retained on explicit retry',async()=>{const rpc=vi.fn(async n=>({data:n===SEND_CAP_RPC?cap:{...ack,updated_at:''},error:null}));await expect(dispatchSend(rpc,attempt,()=>true,vi.fn())).rejects.toThrow('incerto');await expect(dispatchSend(rpc,attempt,()=>true,vi.fn())).rejects.toThrow();expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[3]);});
});
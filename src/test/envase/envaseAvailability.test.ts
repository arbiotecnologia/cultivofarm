import { describe, expect, it, vi } from 'vitest';
import { envaseCapabilityMatches, probeEnvaseAvailability, ENVASE_CAPABILITY_RPC } from '@/lib/envase/envaseAvailability';
import type { EnvaseAttempt } from '@/lib/envase/envaseFlow';
const a: EnvaseAttempt = { actorId: 'AR', orgId: 'ARBIO', args: { p_lote_id:'lot',p_os_id:'os',p_programacao_id:'pp',p_origem:'manual',p_linhas:[],p_validade:'2027-01-01',p_operador:null,p_idempotency_key:'key-00001',p_permitir_parcial:false,p_motivo_parcial:null } };
const cap = { capability:'envase_isolated_v1', available:true, actor_id:'AR',organization_id:'ARBIO',lote_id:'lot',os_id:'os',programacao_id:'pp' };
describe('isolated envase availability', () => {
  it('requires exact scope and envelope, never delivery capability', () => {
    expect(envaseCapabilityMatches(cap,a)).toBe(true);
    for (const patch of [{available:false},{available:'true'},{organization_id:'FSF'},{actor_id:'FSF'},{lote_id:'foreign'},{os_id:'other'},{programacao_id:'other'},{capability:'delivery_operations_v1'},{extra:true}]) expect(envaseCapabilityMatches({...cap,...patch},a)).toBe(false);
  });
  it('absent capability/errors fail closed', async () => {
    const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'PGRST202'}});
    expect(await probeEnvaseAvailability(rpc,a,()=>{})).toBe(false);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(ENVASE_CAPABILITY_RPC,{p_lote:'lot',p_os:'os',p_prog:'pp',p_origem:'manual'});
  });
  it('scope changes during preflight never adopt availability', async () => {
    let current=true;
    const rpc=vi.fn().mockImplementation(async()=>{current=false;return {data:cap,error:null};});
    expect(await probeEnvaseAvailability(rpc,a,()=>{if(!current)throw new Error('stale');})).toBe(false);
  });
});
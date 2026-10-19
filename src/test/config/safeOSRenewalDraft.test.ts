import { describe, it, expect } from 'vitest';
import { safeOSRenewalDraft, type SafeOSRenewalDraft } from '@/lib/authz/safeOSRenewalDraft';
describe('renewal opt-in, non-sensitive closed choices only', () => {
  it('reconstructs only dialog and fixed choices, strips IDs/PII/bytes/quantity/date', () => {
    const input = { open: true, tipo_item: 'produto', modo_aplicacao: 'solo', prioridade: 'alta', cliente_id: 'private', text: 'private', blob: new Blob(['secret']), area_hectares: '10', data_programada: '2026-10-19' };
    expect(safeOSRenewalDraft(input as SafeOSRenewalDraft)).toEqual({ open: true, tipo_item: 'produto', modo_aplicacao: 'solo', prioridade: 'alta' });
  });
  it.each(['tipo_item','modo_aplicacao','prioridade'])('rejects arbitrary text in %s', field => {
    expect(safeOSRenewalDraft({ open:true,tipo_item:'produto',modo_aplicacao:'solo',prioridade:'alta',[field]:'SECRET' } as SafeOSRenewalDraft)).toBeNull();
  });
  it('closed modal is not a recoverable draft', () => {
    expect(safeOSRenewalDraft({ open:false,tipo_item:'produto',modo_aplicacao:'solo',prioridade:'alta' })).toBeNull();
  });
});
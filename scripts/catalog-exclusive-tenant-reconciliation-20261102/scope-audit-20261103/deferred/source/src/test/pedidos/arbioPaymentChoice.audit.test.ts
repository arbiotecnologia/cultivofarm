import { describe, expect, it } from 'vitest';
import { orderAttemptFingerprint } from '@/lib/authz/pendingOrderAttempt';

// Audit-only: adding fields to a synthetic object does not implement a payment contract.
// RED cases expose the current fingerprint ignoring a changed explicit payment method.
const base = {
  partner_id: 'local-arbio-buyer', payment_plan_id: 'local-published-plan',
  installment_count: 3, first_due_date: '2026-12-01',
  items: [{ item_id: 'local-item', item_tipo: 'produto', quantidade: 1, unidade_pedido: 'litro' }],
};
const methods = ['dinheiro', 'pix', 'promissoria', 'boleto', 'cartao_credito', 'cartao_debito'] as const;

describe('Atualização comercial 22:36 — lacunas atuais, não implementação', () => {
  it.each(methods)('PAY-CHOICE-RED-%s meio explícito alterado deve mudar identidade da tentativa', (method) => {
    const original = { ...base, payment_method: 'nao_escolhido' };
    const selected = { ...base, payment_method: method };
    expect(orderAttemptFingerprint(selected)).not.toBe(orderAttemptFingerprint(original));
  });
  it('PAY-CONTROL-PLAN condição diferente já muda identidade local', () => {
    expect(orderAttemptFingerprint({ ...base, payment_plan_id: 'other-plan' })).not.toBe(orderAttemptFingerprint(base));
  });
  it('PAY-CONTROL-COUNT número diferente de parcelas já muda identidade local', () => {
    expect(orderAttemptFingerprint({ ...base, installment_count: 2 })).not.toBe(orderAttemptFingerprint(base));
  });
  it('PAY-CONTROL-REPLAY payload idêntico mantém identidade local sem provar idempotência fiscal', () => {
    expect(orderAttemptFingerprint({ ...base })).toBe(orderAttemptFingerprint(base));
  });
});
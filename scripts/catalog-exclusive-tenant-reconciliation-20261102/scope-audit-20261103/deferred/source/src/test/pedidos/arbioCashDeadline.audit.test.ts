import { expect, it } from 'vitest';
import { orderAttemptFingerprint } from '@/lib/authz/pendingOrderAttempt';
import { planFinancialErrors } from '@/lib/comercial/validation';
import type { PaymentPlanPayload } from '@/hooks/useCommercialPaymentPlansAdmin';

// Local diagnostic only, not a fiscal schedule engine or proof of settlement.
// D+0/D+7 are synthetic vectors, not chosen commercial defaults.
const order = { partner_id: 'local', payment_plan_id: 'published-cash', installment_count: 1,
  first_due_date: '2026-11-02', items: [{ item_id: 'local', item_tipo: 'produto', quantidade: 1, unidade_pedido: 'litro' }] };
const plan: PaymentPlanPayload = { name: 'LOCAL', code: 'LOCAL', plan_type: 'cash',
  max_days: 0, months_count: 0, installment_count: 1, discount_percent: 0,
  monthly_interest_percent: 0, interest_type: 'none', pricing_mode: 'discount_from_base',
  requires_credit_approval: false, requires_guarantee: false, requires_financial_approval: false };

it.each([0, 7])('CASH-DIAG-D+%s uma parcela com dias configurados não é recusada pela faixa genérica', days => {
  const errors = planFinancialErrors({ ...plan, max_days: days });
  expect(errors.max_days).toBeUndefined();
  expect(errors.installment_count).toBeUndefined();
});
it('CASH-DIAG-DEADLINE vencimento diferente participa da identidade local', () => {
  expect(orderAttemptFingerprint({ ...order, first_due_date: '2026-11-09' })).not.toBe(orderAttemptFingerprint(order));
});
it('CASH-DIAG-DELIVERY data declarada entrega antes/depois não redefine o vencimento no fingerprint', () => {
  const before = { ...order, actual_delivery_date: '2026-11-01' };
  const after = { ...order, actual_delivery_date: '2026-11-10' };
  expect(orderAttemptFingerprint(before)).toBe(orderAttemptFingerprint(after));
});
it('CASH-DIAG-REPLAY payload idêntico preserva identidade; não prova pagamento nem idempotência fiscal', () => {
  expect(orderAttemptFingerprint({ ...order })).toBe(orderAttemptFingerprint(order));
});
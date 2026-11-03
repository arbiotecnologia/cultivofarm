import { expect, it } from 'vitest';
import { planFinancialErrors, assignmentApplies } from '@/lib/comercial/validation';
import { orderAttemptFingerprint } from '@/lib/authz/pendingOrderAttempt';
import type { PaymentPlanPayload } from '@/hooks/useCommercialPaymentPlansAdmin';

// Audit only. The generic validator has no payment-method/configuration authority.
// RED shows missing integration, not a hosted permission bypass or an implemented rule.
const plan: PaymentPlanPayload = {
  name: 'LOCAL AUDIT', code: 'LOCAL', plan_type: 'custom', max_days: 30,
  months_count: 0, installment_count: 2, discount_percent: 0, monthly_interest_percent: 0,
  interest_type: 'none', pricing_mode: 'discount_from_base', requires_credit_approval: false,
  requires_guarantee: false, requires_financial_approval: false,
};

it.each(['pix', 'dinheiro', 'cartao_debito'])('FINAL-CASH-RED-%s duas parcelas devem ser recusadas no contrato integrado', method => {
  const synthetic = { ...plan, payment_method: method };
  expect(planFinancialErrors(synthetic).installment_count).toBeDefined();
});

it.each(['promissoria', 'cartao_credito'])('FINAL-CONFIG-RED-%s sem configuração aprovada não pode ser oferecido', method => {
  // Zero here is test input, never a proposed commercial default/rate.
  const synthetic = { ...plan, payment_method: method, approved_payment_configuration: null };
  expect(Object.keys(planFinancialErrors(synthetic)).length).toBeGreaterThan(0);
});

it('FINAL-ARCHIVED-CONTROL atribuição arquivada não se aplica a novo pedido', () => {
  const assignment = { status: 'archived', valid_from: '2026-01-01', valid_until: null, buyer_scope: 'partner', partner_id: 'local-buyer', customer_id: null } as Parameters<typeof assignmentApplies>[0];
  expect(assignmentApplies(assignment, 'local-buyer', Date.parse('2026-10-31'))).toBe(false);
});

it.each([1, 3])('FINAL-BOLETO-CONTROL quantidade %s permanece na faixa genérica, sem provar Price/calendário', count => {
  expect(planFinancialErrors({ ...plan, installment_count: count }).installment_count).toBeUndefined();
});

it('FINAL-BUYER-CONTROL taxa cliente não participa da identidade canônica local atual; não concede autoridade', () => {
  const order = { partner_id: 'local-buyer', payment_plan_id: 'published-version', installment_count: 1, items: [{ item_id: 'local', item_tipo: 'produto', quantidade: 1, unidade_pedido: 'litro' }] };
  const tampered = { ...order, buyer_monthly_interest_percent: 99 };
  expect(orderAttemptFingerprint(tampered)).toBe(orderAttemptFingerprint(order));
  // Server rejection and immutable published snapshots still require canonical integration proof.
});
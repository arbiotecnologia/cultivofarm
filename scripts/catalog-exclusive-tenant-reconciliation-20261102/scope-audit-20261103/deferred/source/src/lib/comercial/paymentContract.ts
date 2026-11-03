import { planFinancialErrors } from './validation';
import type { PaymentPlanPayload } from '@/hooks/useCommercialPaymentPlansAdmin';

export const PAYMENT_CONTRACT = 'B2B_PAYMENT_CONDITION_V1';
export const PAYMENT_METHODS = {
  dinheiro: 'Dinheiro', pix: 'Pix', promissoria: 'Promissória', boleto: 'Boleto',
  cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;
export interface PaymentChoice {
  payment_method: PaymentMethod;
  payment_condition_version: number;
  payment_deadline_days: number;
}
export interface PaymentCapability {
  contract: typeof PAYMENT_CONTRACT;
  actor_id: string; organization_id: string; partner_id: string;
  simulate: true; create: true;
}

/** Positive capability is scoped and exact; a local flag or old list is not authority. */
export function requirePaymentCapability(value: unknown, actor: string, org: string, partner: string): PaymentCapability {
  const c = value as Partial<PaymentCapability> | null;
  if (c?.contract !== PAYMENT_CONTRACT || c.actor_id !== actor || c.organization_id !== org || c.partner_id !== partner || c.simulate !== true || c.create !== true) throw new Error('payment_contract_unavailable');
  return c as PaymentCapability;
}
export function requirePaymentChoice(value: Partial<PaymentChoice>): PaymentChoice {
  if (!value || typeof value.payment_method !== 'string' || !Object.prototype.hasOwnProperty.call(PAYMENT_METHODS, value.payment_method) || !Number.isSafeInteger(value.payment_condition_version) || Number(value.payment_condition_version) < 1 || !Number.isSafeInteger(value.payment_deadline_days) || Number(value.payment_deadline_days) < 0) throw new Error('payment_choice_required');
  return { payment_method: value.payment_method, payment_condition_version: Number(value.payment_condition_version), payment_deadline_days: Number(value.payment_deadline_days) };
}
/** JSONB object key order is not contractual; types and canonical fields are. */
export function paymentChoicesEqual(actual: unknown, expected: PaymentChoice): boolean {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
  try {
    const normalized = requirePaymentChoice(actual as Partial<PaymentChoice>);
    return normalized.payment_method === expected.payment_method
      && normalized.payment_condition_version === expected.payment_condition_version
      && normalized.payment_deadline_days === expected.payment_deadline_days;
  } catch { return false; }
}
export function paymentPlanAvailable(plan: PaymentPlanPayload & { payment_method?: string; approved_payment_configuration?: { approved: boolean; version: number } | null }) {
  return Object.keys(planFinancialErrors(plan)).length === 0;
}
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { preview } from '@/pages/comercial/CommercialPaymentPlansPage';
import { assignmentApplies } from '@/lib/comercial/validation';
import { activePaymentMethodValid, canConfigurePartnerSettings } from '@/lib/financeiro/partnerSettings';
import type { PaymentPlanPayload } from '@/hooks/useCommercialPaymentPlansAdmin';
import type { PlanAssignment } from '@/hooks/useCommercialConditions';

const draft = JSON.parse(readFileSync('scripts/financial-installments-initial-20261024/arbio-fsf-policy.draft.json', 'utf8'));
const base: PaymentPlanPayload = { name: 'DRAFT LOCAL', code: 'REF', plan_type: 'custom',
  max_days: 0, months_count: 0, installment_count: 1, discount_percent: 0,
  monthly_interest_percent: 0, interest_type: 'compound', pricing_mode: 'discount_from_base',
  requires_credit_approval: true, requires_guarantee: false, requires_financial_approval: true };
describe('AR Bio × FSF Agro — referência não aplicada, consumidores existentes', () => {
  it.each(draft.reference_vectors as { key: string; discount: string; rate: string; months: number; table: string; expected: string }[])(
    '$key confere a centavos com expectativa Decimal independente', vector => {
      const value = preview({ ...base, discount_percent: Number(vector.discount),
        monthly_interest_percent: Number(vector.rate), months_count: vector.months }, Number(vector.table));
      expect(value).not.toBeNull();
      expect(Math.round((value?.final ?? NaN) * 100)).toBe(Math.round(Number(vector.expected) * 100));
    });
  it('DRAFT específico não se torna atribuição aplicável para FSF', () => {
    const a: PlanAssignment = { id: 'LOCAL', plan_id: 'LOCAL', buyer_scope: 'partner', partner_id: 'FSF-LOCAL',
      customer_id: null, status: 'draft', valid_from: '2026-07-01', valid_until: null, motivo: null,
      published_at: null, created_at: '2026-07-01' };
    expect(assignmentApplies(a, 'FSF-LOCAL', Date.parse('2026-10-28T00:00:00Z'))).toBe(false);
  });
  it('atribuição própria publicada não se aplica a outra revenda', () => {
    const a: PlanAssignment = { id: 'LOCAL', plan_id: 'LOCAL', buyer_scope: 'partner', partner_id: 'FSF-LOCAL',
      customer_id: null, status: 'published', valid_from: '2026-07-01', valid_until: null, motivo: null,
      published_at: '2026-07-01', created_at: '2026-07-01' };
    expect(assignmentApplies(a, 'OUTRA-REVENDA', Date.parse('2026-10-28T00:00:00Z'))).toBe(false);
    expect(assignmentApplies(a, 'FSF-LOCAL', Date.parse('2026-10-28T00:00:00Z'))).toBe(true);
  });
  it.each([{ roles: ['parceiro_b2b'] }, { roles: ['parceiro_b2b_tecnico'] }, { roles: ['administrador', 'parceiro_b2b'] }])(
    'perfil externo $roles não configura crédito interno', ({ roles }) => {
      expect(canConfigurePartnerSettings(roles)).toBe(false);
    });
  it('método ausente ou inativo não permite assumir quitação', () => {
    expect(activePaymentMethodValid(null, [])).toBe(false);
    expect(activePaymentMethodValid('LOCAL', [{ name: 'LOCAL', active: false }])).toBe(false);
  });
});
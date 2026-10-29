import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { preview } from '@/pages/comercial/CommercialPaymentPlansPage';
import { assignmentApplies } from '@/lib/comercial/validation';
import { activePaymentMethodValid, canConfigurePartnerSettings } from '@/lib/financeiro/partnerSettings';
import type { PaymentPlanPayload } from '@/hooks/useCommercialPaymentPlansAdmin';
import type { PlanAssignment } from '@/hooks/useCommercialConditions';

const draft = JSON.parse(readFileSync('scripts/financial-installments-initial-20261024/arbio-fsf-policy.full-term-20261028.superseded.json', 'utf8'));
const base: PaymentPlanPayload = { name: 'DRAFT LOCAL', code: 'REF', plan_type: 'custom',
  max_days: 0, months_count: 0, installment_count: 1, discount_percent: 0,
  monthly_interest_percent: 0, interest_type: 'compound', pricing_mode: 'discount_from_base',
  requires_credit_approval: true, requires_guarantee: false, requires_financial_approval: true };
describe('AR Bio × FSF Agro — política superveniente não aplicada, consumidores existentes', () => {
  it.each(draft.policies as { key: string; discount_percent: string }[])('40% fixo em $key', policy => {
    expect(policy.discount_percent).toBe('40');
  });
  it.each([
    ['29d', '0'], ['30d', '0'], ['31d', '1.8'], ['6m_exact', '1.8'],
    ['6m_plus_1d', '2'], ['12m_exact', '2'], ['above_12m', null],
  ])('fronteira normativa %s sem homologar calendário ou valor', (key, rate) => {
    expect(draft.boundary_fixtures.find((f: { key: string }) => f.key === key)?.rate).toBe(rate);
  });
  it.each([
    [30, 0, false, '0'], [31, 0, false, '1.8'],
    [undefined, 6, false, '1.8'], [undefined, 6, true, '2'],
    [undefined, 12, false, '2'], [undefined, 12, true, undefined],
    [-1, 0, false, undefined],
  ])('seleção offline dias%s/meses%s/excede%s — não converte data nem pro-rata', (days, months, exceeds, expectedRate) => {
    // Qualificadores de prazo explícitos, não calendário arbitrado ou runtime paralelo.
    const selected = typeof days === 'number' && days < 0 ? undefined
      : typeof days === 'number' && days <= 30 ? draft.policies[0]
      : months < 6 || (months === 6 && !exceeds) ? draft.policies[1]
      : months < 12 || (months === 12 && !exceeds) ? draft.policies[2] : undefined;
    expect(selected?.monthly_interest_percent).toBe(expectedRate);
  });
  it('usa data inicial e taxa única integral sem carência ou marginalidade', () => {
    expect(draft.interest_decision.interest_start).toBe('operation_initial_date');
    expect(draft.interest_decision.band_incidence).toBe('single_selected_rate_over_entire_term');
    expect(draft.interest_decision.deduct_30_days).toBe(false);
    expect(draft.interest_decision.marginal_rates_allowed).toBe(false);
    expect(draft.runtime_enabled).toBe(false);
    expect(draft.undefined.fractional_months_convention).toBeNull();
    expect(draft.undefined.month_boundary_convention).toBeNull();
    expect(draft.owner_override.exceptional_policy_approved).toBe(false);
    expect(draft.owner_override.beyond_12_months).toBe('DENY_UNLESS_SEPARATE_APPROVED_EXCEPTIONAL_POLICY');
  });
  it.each([3, 6, 8, 12])('%sm não deduz 30 dias ou um mês de juros', months => {
    const rate = months <= 6 ? 1.8 : 2;
    const whole = preview({ ...base, discount_percent: 40, monthly_interest_percent: rate, months_count: months });
    const deducted = preview({ ...base, discount_percent: 40, monthly_interest_percent: rate, months_count: months - 1 });
    expect(Math.round((whole?.final ?? NaN) * 100)).not.toBe(Math.round((deducted?.final ?? NaN) * 100));
  });
  it.each([8, 12])('%sm taxa2 integral não confunde com marginal', months => {
    const whole = preview({ ...base, discount_percent: 40, monthly_interest_percent: 2, months_count: months });
    const marginalRejected = 60000 * (1.018 ** 6) * (1.02 ** (months - 6));
    expect(Math.round((whole?.final ?? NaN) * 100)).not.toBe(Math.round(marginalRejected * 100));
  });
  it.each([-1, 101])('taxa inválida%s recusada pelo preview existente', monthly_interest_percent => {
    expect(preview({ ...base, monthly_interest_percent })).toBeNull();
  });
  it.each(draft.reference_vectors as { key: string; discount: string; rate: string; months: number; table: string; expected: string }[])(
    '$key compara preview Number ao vetor previamente conferido em Decimal no PG local', vector => {
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
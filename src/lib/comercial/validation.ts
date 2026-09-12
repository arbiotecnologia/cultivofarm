import type { PaymentPlanPayload } from '@/hooks/useCommercialPaymentPlansAdmin';
import type { PlanAssignment } from '@/hooks/useCommercialConditions';

export function validatePlan(p: PaymentPlanPayload, mode = 'create', now = Date.now()) {
  const errors: Record<string, string> = {};
  if (!p.name.trim()) errors.name = 'Informe o nome.';
  if (!p.code.trim()) errors.code = 'Informe o código.';
  if (!Number.isSafeInteger(p.sort_order ?? 0)) errors.sort_order = 'Informe uma ordem inteira válida.';
  if (mode === 'metadata') return errors;
  const ranges = { discount_percent: [0, 100], monthly_interest_percent: [0, 100], installment_count: [1, 60], months_count: [0, 60], max_days: [0, 1095] } as const;
  for (const key of Object.keys(ranges) as Array<keyof typeof ranges>) {
    const [min, max] = ranges[key];
    if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max || (['installment_count', 'max_days'].includes(key) && !Number.isInteger(p[key]))) errors[key] = `Informe um valor ${['installment_count', 'max_days'].includes(key) ? 'inteiro ' : ''}entre ${min} e ${max}.`;
  }
  if (!['cash', 'short_term', 'medium_term', 'extended_term', 'harvest', 'custom'].includes(p.plan_type)) errors.plan_type = 'Tipo inválido.';
  if (!['none', 'simple', 'compound'].includes(p.interest_type)) errors.interest_type = 'Tipo de juros inválido.';
  if (!['discount_from_base', 'fixed_item_price', 'quote_only'].includes(p.pricing_mode)) errors.pricing_mode = 'Modo inválido.';
  if (p.minimum_order_amount != null && (!Number.isFinite(p.minimum_order_amount) || p.minimum_order_amount < 0)) errors.minimum_order_amount = 'Informe um mínimo não negativo.';
  const start = p.valid_from ? Date.parse(p.valid_from) : now;
  if (!Number.isFinite(start)) errors.valid_from = 'Data inicial inválida.';
  if (p.valid_until && (!Number.isFinite(Date.parse(p.valid_until)) || Date.parse(p.valid_until) <= start)) errors.valid_until = 'A data final deve ser posterior ao início da vigência.';
  if (mode === 'version' && !p.motivo?.trim()) errors.motivo = 'Informe o motivo da nova versão.';
  return errors;
}

export interface SimulationForm {
  partner: string; plan: string; item: string; unit: 'hectare' | 'litro' | 'dose' | 'unidade'; quantity: string; volume: string; due: string;
}
export function validateSimulation(f: SimulationForm, needsDate = false) {
  const errors: Record<string, string> = {};
  if (!f.partner) errors.partner = 'Selecione um parceiro ativo.';
  if (!f.plan) errors.plan = 'Selecione uma condição disponível para o parceiro.';
  if (!f.item) errors.item = 'Selecione um item com ficha aprovada.';
  if (!['hectare', 'litro', 'dose', 'unidade'].includes(f.unit)) errors.unit = 'Selecione a unidade.';
  if (!f.quantity.trim() || !Number.isFinite(Number(f.quantity)) || Number(f.quantity) <= 0) errors.quantity = 'Informe uma quantidade finita maior que zero.';
  if (f.unit === 'unidade' && (!f.volume.trim() || !Number.isFinite(Number(f.volume)) || Number(f.volume) <= 0)) errors.volume = 'Informe um volume maior que zero.';
  if ((needsDate && !f.due) || (f.due && !Number.isFinite(Date.parse(f.due)))) errors.due = 'Informe o primeiro vencimento válido.';
  return errors;
}
export function assignmentApplies(a: PlanAssignment, partner: string, now = Date.now()) {
  return a.status === 'published' && a.buyer_scope === 'partner' && a.partner_id === partner && Date.parse(a.valid_from) <= now && (!a.valid_until || Date.parse(a.valid_until) > now);
}

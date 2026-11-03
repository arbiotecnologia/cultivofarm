import type { PaymentPlanPayload } from '@/hooks/useCommercialPaymentPlansAdmin';
import type { PlanAssignment } from '@/hooks/useCommercialConditions';
import { isCivilDate, strictInstant } from './civilDate';

/**
 * Erros dos parâmetros financeiros do plano (faixas idênticas às do formulário).
 * Usado tanto pela validação completa quanto pelo preview do cronograma.
 */
export function planFinancialErrors(p: PaymentPlanPayload & { payment_method?: string; approved_payment_configuration?: { approved: boolean; version: number } | null }) {
  const errors: Record<string, string> = {};
  const ranges = { discount_percent: [0, 100], monthly_interest_percent: [0, 100], installment_count: [1, 60], months_count: [0, 60], max_days: [0, 1095] } as const;
  for (const key of Object.keys(ranges) as Array<keyof typeof ranges>) {
    const [min, max] = ranges[key];
    if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max || (['installment_count', 'max_days'].includes(key) && !Number.isInteger(p[key]))) errors[key] = `Informe um valor ${['installment_count', 'max_days'].includes(key) ? 'inteiro ' : ''}entre ${min} e ${max}.`;
  }
  if (p.minimum_order_amount != null && (!Number.isFinite(p.minimum_order_amount) || p.minimum_order_amount < 0)) errors.minimum_order_amount = 'Informe um mínimo não negativo.';
  if (p.payment_method && !['dinheiro', 'pix', 'promissoria', 'boleto', 'cartao_credito', 'cartao_debito'].includes(p.payment_method)) errors.payment_method = 'Meio de pagamento inválido.';
  if (['pix', 'dinheiro', 'cartao_debito'].includes(p.payment_method ?? '') && p.installment_count !== 1) errors.installment_count = 'À vista exige uma parcela com prazo configurado.';
  if (['pix', 'dinheiro', 'cartao_debito'].includes(p.payment_method ?? '') && p.monthly_interest_percent !== 0) errors.monthly_interest_percent = 'Prazo à vista não concede juros tácitos.';
  if (p.payment_method === 'boleto' && p.installment_count > 3) errors.installment_count = 'Boleto permite até três parcelas mensais.';
  if (['promissoria', 'cartao_credito'].includes(p.payment_method ?? '') && (p.approved_payment_configuration?.approved !== true || !Number.isSafeInteger(p.approved_payment_configuration.version) || p.approved_payment_configuration.version < 1)) errors.payment_configuration = 'Configuração aprovada de parcelas e taxas indisponível.';
  return errors;
}

export function validatePlan(p: PaymentPlanPayload, mode = 'create', now = Date.now()) {
  const errors: Record<string, string> = {};
  if (!p.name.trim()) errors.name = 'Informe o nome.';
  if (!p.code.trim()) errors.code = 'Informe o código.';
  if (!Number.isSafeInteger(p.sort_order ?? 0)) errors.sort_order = 'Informe uma ordem inteira válida.';
  if (mode === 'metadata') return errors;
  Object.assign(errors, planFinancialErrors(p));
  if (!['cash', 'short_term', 'medium_term', 'extended_term', 'harvest', 'custom'].includes(p.plan_type)) errors.plan_type = 'Tipo inválido.';
  if (!['none', 'simple', 'compound'].includes(p.interest_type)) errors.interest_type = 'Tipo de juros inválido.';
  if (!['discount_from_base', 'fixed_item_price', 'quote_only'].includes(p.pricing_mode)) errors.pricing_mode = 'Modo inválido.';
  const start = p.valid_from ? strictInstant(p.valid_from) : now;
  if (!Number.isFinite(start)) errors.valid_from = 'Data inicial inválida.';
  if (p.valid_until && (!Number.isFinite(strictInstant(p.valid_until)) || strictInstant(p.valid_until) <= start)) errors.valid_until = 'A data final deve ser posterior ao início da vigência.';
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
  if ((needsDate && !f.due) || (f.due && !isCivilDate(f.due))) errors.due = 'Informe o primeiro vencimento válido.';
  return errors;
}
/** Unidade/volume de uma linha publicada da matriz, elegível para simulação. */
export interface MatrixPresentation {
  key: string;
  unit_type: 'hectare' | 'litro' | 'dose' | 'unidade';
  volume_ml: number | null;
  min_quantity: number;
}

export interface MatrixPresentationRow {
  plan_id: string;
  buyer_scope: string;
  partner_id: string | null;
  customer_id: string | null;
  product_id: string | null;
  microrganismo_id: string | null;
  unit_type: MatrixPresentation['unit_type'];
  volume_ml: number | null;
  min_quantity: number;
  status: string;
  valid_from: string;
  valid_until: string | null;
}

export function presentationKey(unit: string, volume: number | null) {
  return `${unit}|${volume ?? ''}`;
}

/**
 * Apresentações realmente aplicáveis ao item dentro do plano/parceiro/vigência.
 * Nunca assume hectare: só devolve unidades existentes em linhas publicadas.
 */
export function matrixPresentations(
  rows: MatrixPresentationRow[],
  o: { planId: string; partnerId: string; itemId: string; today?: string },
): MatrixPresentation[] {
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  if (!o.planId || !o.itemId) return [];
  const out = new Map<string, MatrixPresentation>();
  for (const r of rows) {
    if (r.plan_id !== o.planId || r.status !== 'published' || r.customer_id != null) continue;
    if (r.product_id !== o.itemId && r.microrganismo_id !== o.itemId) continue;
    if (r.valid_from > today || (r.valid_until != null && r.valid_until < today)) continue;
    const scopeOk = o.partnerId
      ? (r.buyer_scope === 'partner' && r.partner_id === o.partnerId) || (r.buyer_scope === 'default' && r.partner_id == null)
      : r.buyer_scope === 'default' && r.partner_id == null;
    if (!scopeOk) continue;
    const key = presentationKey(r.unit_type, r.volume_ml);
    const prev = out.get(key);
    const min = Number.isFinite(r.min_quantity) ? r.min_quantity : 0;
    if (!prev || min < prev.min_quantity) out.set(key, { key, unit_type: r.unit_type, volume_ml: r.volume_ml, min_quantity: min });
  }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function validateMatrixSimulation(f: { presentation: MatrixPresentation | null; quantity: string }) {
  const errors: Record<string, string> = {};
  if (!f.presentation) errors.presentation = 'Selecione a apresentação (unidade) da regra vigente.';
  const qty = Number(f.quantity);
  if (!f.quantity.trim() || !Number.isFinite(qty) || qty <= 0) errors.quantity = 'Informe uma quantidade finita maior que zero.';
  else if (f.presentation && qty < f.presentation.min_quantity) errors.quantity = `Quantidade mínima da regra: ${f.presentation.min_quantity}.`;
  if (f.presentation && f.presentation.unit_type === 'unidade' && !(Number(f.presentation.volume_ml) > 0)) errors.presentation = 'A apresentação por unidade exige volume definido na regra.';
  return errors;
}

export function assignmentApplies(a: PlanAssignment, partner: string, now = Date.now()) {
  if (!partner || !Number.isFinite(now) || a.status !== 'published') return false;
  // Assignment validity uses SQL DATE, inclusive at both ends (CURRENT_DATE).
  const today = new Date(now).toISOString().slice(0, 10);
  const validDate = (value: string) => isCivilDate(value);
  if (!validDate(a.valid_from) || a.valid_from > today ||
      (a.valid_until != null && (!validDate(a.valid_until) || a.valid_until < today))) return false;
  // Default assignments are publishable; default price-table rows are only templates.
  return (a.buyer_scope === 'partner' && a.partner_id === partner && a.customer_id == null) ||
    (a.buyer_scope === 'default' && a.partner_id == null && a.customer_id == null);
}

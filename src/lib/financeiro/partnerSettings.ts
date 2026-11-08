export interface PartnerSettings {
  id?: string;
  partner_id: string;
  updated_at?: string;
  billing_trigger: string;
  payment_terms_days: number;
  default_payment_method: string | null;
  credit_limit: number | null;
  block_if_overdue: boolean;
  auto_generate_receivable: boolean;
  active: boolean;
  credit_limit_action: string;
  overdue_tolerance_days: number;
  credit_alert_threshold_1: number;
  credit_alert_threshold_2: number;
}

export const settingsFields = [
  "billing_trigger", "payment_terms_days", "default_payment_method", "credit_limit",
  "block_if_overdue", "auto_generate_receivable", "active", "credit_limit_action",
  "overdue_tolerance_days", "credit_alert_threshold_1", "credit_alert_threshold_2",
] as const;

export function emptyPartnerSettings(partner_id: string): PartnerSettings {
  return { partner_id, billing_trigger: "manual", payment_terms_days: 7,
    default_payment_method: null, credit_limit: null, block_if_overdue: false,
    auto_generate_receivable: false, active: true, credit_limit_action: "block",
    overdue_tolerance_days: 0, credit_alert_threshold_1: 80, credit_alert_threshold_2: 90 };
}

export function samePartnerSettings(a: PartnerSettings | null, b: PartnerSettings | null): boolean {
  if (!a || !b) return a === b;
  return a.id === b.id && a.partner_id === b.partner_id && a.updated_at === b.updated_at
    && settingsFields.every(field => a[field] === b[field]);
}

export function canConfigurePartnerSettings(roles: readonly string[]): boolean {
  return !roles.some(role => ["parceiro_b2b", "parceiro_b2b_tecnico", "cliente_produtor"].includes(role))
    && roles.some(role => ["administrador", "financeiro", "gestor", "gestor_comercial"].includes(role));
}

export function activePaymentMethodValid(name: string | null, methods: readonly { name: string; active?: boolean }[]): boolean {
  return !!name?.trim() && methods.filter(method => method.active !== false
    && method.name.trim().toLowerCase() === name.trim().toLowerCase()).length === 1;
}
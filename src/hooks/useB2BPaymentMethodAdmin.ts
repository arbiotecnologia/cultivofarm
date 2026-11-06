import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { METHOD_KINDS, PAYMENT_METHOD_CONTRACT, type MethodKind } from "./useB2BPaymentMethodOptions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_INSTALLMENTS: Record<MethodKind, number> = { dinheiro: 1, pix: 1, debito: 1, boleto: 3, promissoria: 36, credito: 36 };

export interface MethodConfig {
  id: string; payment_plan_id: string; method_kind: MethodKind; payment_method_id: string; status: "active" | "revoked";
  version: number; due_days: number; max_installments: number; price_monthly_rate_percent: number | null;
}
export interface AdminPlan { id: string; name: string; code: string | null; installment_count: number; max_days: number; monthly_interest_percent: number }
export interface Activation { mode: "off" | "pilot" | "enforced"; pilot_partner_ids: string[]; version: number }
export interface MethodAdminData {
  organization_id: string; can_edit: boolean; can_activate: boolean; activation: Activation;
  configs: MethodConfig[]; catalog: Array<{ id: string; name: string }>; plans: AdminPlan[]; partners: string[];
}
export type MethodAdminResult = { status: "ok"; data: MethodAdminData } | { status: "not_installed" };

const fail = (): never => { throw new Error("payment_method_contract_unavailable"); };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : NaN);

/** Parser estrito; qualquer divergência = indisponível (nunca lista vazia silenciosa). */
export function parseMethodAdmin(raw: unknown): MethodAdminData {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || d.contract !== PAYMENT_METHOD_CONTRACT || typeof d.organization_id !== "string" || !UUID.test(d.organization_id) ||
      typeof d.can_edit !== "boolean" || typeof d.can_activate !== "boolean" || !Array.isArray(d.configs) || !Array.isArray(d.catalog) ||
      !Array.isArray(d.plans) || !Array.isArray(d.partners)) fail();
  const a = d!.activation as Record<string, unknown> | null;
  if (!a || !["off", "pilot", "enforced"].includes(a.mode as string) || !Number.isInteger(a.version) || !Array.isArray(a.pilot_partner_ids)) fail();
  const configs = (d!.configs as Record<string, unknown>[]).map((c) => {
    const kind = c?.method_kind as MethodKind;
    const rate = c?.price_monthly_rate_percent == null ? null : num(c.price_monthly_rate_percent);
    if (!c || typeof c.id !== "string" || !UUID.test(c.id) || typeof c.payment_plan_id !== "string" || !METHOD_KINDS.includes(kind) ||
        typeof c.payment_method_id !== "string" || !["active", "revoked"].includes(c.status as string) || !Number.isInteger(c.version) ||
        !Number.isInteger(c.due_days) || !Number.isInteger(c.max_installments) || (rate !== null && Number.isNaN(rate))) fail();
    return { id: c.id as string, payment_plan_id: c.payment_plan_id as string, method_kind: kind, payment_method_id: c.payment_method_id as string,
      status: c.status as "active" | "revoked", version: c.version as number, due_days: c.due_days as number, max_installments: c.max_installments as number,
      price_monthly_rate_percent: rate };
  });
  const plans = (d!.plans as Record<string, unknown>[]).map((p) => {
    if (!p || typeof p.id !== "string" || typeof p.name !== "string") fail();
    return { id: p.id as string, name: p.name as string, code: typeof p.code === "string" ? p.code : null,
      installment_count: Math.max(1, num(p.installment_count) || 1), max_days: num(p.max_days) || 0, monthly_interest_percent: num(p.monthly_interest_percent) || 0 };
  });
  const catalog = (d!.catalog as Record<string, unknown>[]).map((m) => {
    if (!m || typeof m.id !== "string" || typeof m.name !== "string") fail();
    return { id: m.id as string, name: m.name as string };
  });
  return { organization_id: d!.organization_id as string, can_edit: d!.can_edit as boolean, can_activate: d!.can_activate as boolean,
    activation: { mode: a!.mode as Activation["mode"], pilot_partner_ids: (a!.pilot_partner_ids as unknown[]).map(String), version: a!.version as number },
    configs, catalog, plans, partners: (d!.partners as unknown[]).map(String) };
}

const LIST_RE = /\bpublic\.b2b_payment_method_config_list\(\s*\)/;
export function isAdminListAbsent(e: { code?: string; message?: string } | null | undefined) {
  return !!e && e.code === "PGRST202" && typeof e.message === "string" && /^Could not find the function /.test(e.message) && LIST_RE.test(e.message);
}

const KEY = "b2b-payment-method-admin";
export function useB2BPaymentMethodAdmin(enabled = true) {
  return useScopedPortalQuery<MethodAdminResult>({
    queryKey: [KEY, PAYMENT_METHOD_CONTRACT], enabled, retry: false, staleTime: 0,
    queryFn: async (signal) => {
      const { data, error } = await (supabase.rpc as any)("b2b_payment_method_config_list", {}).abortSignal(signal);
      if (error) { if (isAdminListAbsent(error)) return { status: "not_installed" }; throw error; }
      return { status: "ok", data: parseMethodAdmin(data) };
    },
  });
}

export interface SaveConfigInput {
  config_id: string | null; payment_plan_id: string; method_kind: MethodKind; payment_method_id: string;
  due_days: number; max_installments: number; price_monthly_rate_percent: number | null; status: "active" | "revoked"; expected_version: number;
}

/** Validação local espelhando os CHECKs do servidor (o servidor continua sendo a autoridade). Nenhuma taxa é presumida. */
export function validateConfig(i: SaveConfigInput, plan: AdminPlan | undefined): string | null {
  if (!plan) return "Selecione a condição.";
  if (!Number.isInteger(i.due_days) || i.due_days < 0 || i.due_days > 365) return "Prazo deve ser um número inteiro de 0 a 365 dias.";
  if (i.due_days > plan.max_days) return `Prazo excede o limite da condição (${plan.max_days} dias).`;
  const max = MAX_INSTALLMENTS[i.method_kind];
  if (!Number.isInteger(i.max_installments) || i.max_installments < 1 || i.max_installments > max) return `Parcelas permitidas para este meio: 1 a ${max}.`;
  if (i.max_installments > 1 && (i.price_monthly_rate_percent == null || !Number.isFinite(i.price_monthly_rate_percent))) return "Informe a taxa Price mensal explicitamente (pode ser 0).";
  if (i.max_installments === 1 && max === 1 && i.price_monthly_rate_percent != null) return "Pagamento único não tem taxa.";
  if (i.price_monthly_rate_percent != null && (i.price_monthly_rate_percent < 0 || i.price_monthly_rate_percent > 100)) return "Taxa deve estar entre 0 e 100%.";
  return null;
}

/** Erros de negócio do servidor em português; conflitos nunca disparam nova tentativa automática. */
export function methodAdminError(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? "";
  if (/payment_method_config_stale|payment_method_activation_stale/.test(m)) return "Outra pessoa alterou esta configuração. Recarregue e revise antes de salvar.";
  if (/forbidden/.test(m)) return "Você não tem permissão para esta alteração.";
  if (/payment_method_catalog_unavailable/.test(m)) return "Meio de pagamento inativo no cadastro.";
  if (/plan_inactive/.test(m)) return "Condição inativa ou substituída.";
  if (/payment_method_activation_requires_config/.test(m)) return "Ative pelo menos um meio antes de ligar a exigência.";
  if (/payment_method_pilot_partner_invalid/.test(m)) return "Parceiro do piloto inválido para esta empresa.";
  if (/b2b_pmc_|payment_method_config_invalid/.test(m)) return "Configuração recusada pelo servidor (parcelas/taxa incompatíveis com o meio).";
  return "Não foi possível salvar. Nada foi alterado automaticamente.";
}

function useLockedMutation<I>(rpc: string, toArgs: (i: I) => Record<string, unknown>) {
  const qc = useQueryClient();
  const lock = useRef(false);
  return useMutation({
    retry: false,
    mutationFn: async (i: I) => {
      if (lock.current) throw new Error("operation_in_progress");
      lock.current = true;
      try {
        const { data, error } = await (supabase.rpc as any)(rpc, toArgs(i));
        if (error) throw error;
        if ((data as { contract?: unknown } | null)?.contract !== PAYMENT_METHOD_CONTRACT) throw new Error("payment_method_ack_invalid");
        return data;
      } finally { lock.current = false; }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [KEY] }); },
  });
}

export function useSaveB2BPaymentMethodConfig() {
  return useLockedMutation<SaveConfigInput>("b2b_payment_method_config_save", (i) => ({
    p_config_id: i.config_id, p_payment_plan_id: i.payment_plan_id, p_method_kind: i.method_kind, p_payment_method_id: i.payment_method_id,
    p_due_days: i.due_days, p_max_installments: i.max_installments, p_price_monthly_rate_percent: i.price_monthly_rate_percent,
    p_status: i.status, p_expected_version: i.expected_version,
  }));
}

export function useSetB2BPaymentMethodActivation() {
  return useLockedMutation<{ mode: Activation["mode"]; pilot_partner_ids: string[]; expected_version: number }>("b2b_payment_method_activation_set", (i) => ({
    p_mode: i.mode, p_pilot_partner_ids: i.pilot_partner_ids, p_expected_version: i.expected_version,
  }));
}

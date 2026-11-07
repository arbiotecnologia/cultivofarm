import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { MAX_INSTALLMENTS, METHOD_KINDS, PAYMENT_METHOD_CONTRACT, type MethodKind } from "./useB2BPaymentMethodOptions";

export { MAX_INSTALLMENTS };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Versão VIGENTE (a mais recente) de (condição, meio) da empresa vendedora. Versões são imutáveis; editar = publicar nova. */
export interface ConditionVersion {
  plan_id: string; method: MethodKind; version: number; deadline_days: number; installment_count: number; monthly_rate: number;
  payment_method_id: string; category_id: string; retired: boolean; partner_ids: string[];
}
export interface AdminPlan { id: string; name: string; code: string | null; max_days: number; monthly_interest_percent: number }
export interface Activation { mode: "off" | "pilot" | "enforced"; pilot_partner_ids: string[]; version: number }
export interface MethodAdminData {
  organization_id: string; can_edit: boolean; can_activate: boolean; default_deadline_days: number; activation: Activation;
  conditions: ConditionVersion[]; catalog: Array<{ id: string; name: string }>; categories: Array<{ id: string; name: string }>;
  plans: AdminPlan[]; partners: string[];
}
export type MethodAdminResult = { status: "ok"; data: MethodAdminData } | { status: "not_installed" };

const fail = (): never => { throw new Error("payment_method_contract_unavailable"); };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : NaN);
const named = (arr: unknown) => (arr as Record<string, unknown>[]).map((m) => {
  if (!m || typeof m.id !== "string" || typeof m.name !== "string") fail();
  return { id: m.id as string, name: m.name as string };
});

/** Parser estrito; qualquer divergência = indisponível (nunca lista vazia silenciosa). */
export function parseMethodAdmin(raw: unknown): MethodAdminData {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || d.contract !== PAYMENT_METHOD_CONTRACT || typeof d.organization_id !== "string" || !UUID.test(d.organization_id) ||
      typeof d.can_edit !== "boolean" || typeof d.can_activate !== "boolean" || !Number.isInteger(d.default_deadline_days) ||
      !Array.isArray(d.conditions) || !Array.isArray(d.catalog) || !Array.isArray(d.categories) || !Array.isArray(d.plans) || !Array.isArray(d.partners)) fail();
  const a = d!.activation as Record<string, unknown> | null;
  if (!a || !["off", "pilot", "enforced"].includes(a.mode as string) || !Number.isInteger(a.version) || !Array.isArray(a.pilot_partner_ids)) fail();
  const conditions = (d!.conditions as Record<string, unknown>[]).map((c) => {
    const kind = c?.method as MethodKind; const rate = num(c?.monthly_rate);
    if (!c || typeof c.plan_id !== "string" || !METHOD_KINDS.includes(kind) || !Number.isInteger(c.version) || !Number.isInteger(c.deadline_days) ||
        !Number.isInteger(c.installment_count) || Number.isNaN(rate) || typeof c.payment_method_id !== "string" || typeof c.category_id !== "string" ||
        typeof c.retired !== "boolean" || !Array.isArray(c.partner_ids)) fail();
    return { plan_id: c.plan_id as string, method: kind, version: c.version as number, deadline_days: c.deadline_days as number,
      installment_count: c.installment_count as number, monthly_rate: rate, payment_method_id: c.payment_method_id as string,
      category_id: c.category_id as string, retired: c.retired as boolean, partner_ids: (c.partner_ids as unknown[]).map(String) };
  });
  const plans = (d!.plans as Record<string, unknown>[]).map((p) => {
    if (!p || typeof p.id !== "string" || typeof p.name !== "string") fail();
    return { id: p.id as string, name: p.name as string, code: typeof p.code === "string" ? p.code : null,
      max_days: num(p.max_days) || 0, monthly_interest_percent: num(p.monthly_interest_percent) || 0 };
  });
  return { organization_id: d!.organization_id as string, can_edit: d!.can_edit as boolean, can_activate: d!.can_activate as boolean,
    default_deadline_days: d!.default_deadline_days as number,
    activation: { mode: a!.mode as Activation["mode"], pilot_partner_ids: (a!.pilot_partner_ids as unknown[]).map(String), version: a!.version as number },
    conditions, catalog: named(d!.catalog), categories: named(d!.categories), plans, partners: (d!.partners as unknown[]).map(String) };
}

const LIST_RE = /\bpublic\.b2b_payment_condition_config_list\(\s*\)/;
export function isAdminListAbsent(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && e.code === "PGRST202" && typeof e.message === "string" && /^Could not find the function /.test(e.message) && LIST_RE.test(e.message);
}

const KEY = "b2b-payment-condition-admin";
export function useB2BPaymentMethodAdmin(enabled = true) {
  return useScopedPortalQuery<MethodAdminResult>({
    queryKey: [KEY, PAYMENT_METHOD_CONTRACT], enabled, retry: false, staleTime: 0,
    queryFn: async (signal) => {
      const { data, error } = await (supabase.rpc as any)("b2b_payment_condition_config_list", {}).abortSignal(signal);
      if (error) { if (isAdminListAbsent(error)) return { status: "not_installed" }; throw error; }
      return { status: "ok", data: parseMethodAdmin(data) };
    },
  });
}

export interface PublishInput {
  plan_id: string; method: MethodKind; payment_method_id: string; category_id: string;
  deadline_days: number; installment_count: number; monthly_rate: number; expected_version: number;
}

/** Validação local espelhando os CHECKs do servidor (o servidor continua sendo a autoridade). Nenhuma taxa é presumida. */
export function validateConfig(i: PublishInput, plan: AdminPlan | undefined): string | null {
  if (!plan) return "Selecione a condição.";
  if (plan.monthly_interest_percent !== 0) return "A condição já tem juros próprios; configure a taxa só aqui, com condição sem juros.";
  if (!Number.isInteger(i.deadline_days) || i.deadline_days < 0) return "Prazo deve ser um número inteiro de dias (0 ou mais).";
  if (i.deadline_days > plan.max_days) return `Prazo excede o limite da condição (${plan.max_days} dias).`;
  const max = MAX_INSTALLMENTS[i.method];
  if (!Number.isInteger(i.installment_count) || i.installment_count < 1 || i.installment_count > max) return `Parcelas permitidas para este meio: 1 a ${max}.`;
  if (!Number.isFinite(i.monthly_rate) || i.monthly_rate < 0 || i.monthly_rate > 100) return "Informe a taxa Price mensal explicitamente (0 a 100%).";
  if (i.installment_count === 1 && i.monthly_rate !== 0) return "Parcela única não tem juros (taxa 0).";
  if (!i.payment_method_id) return "Selecione o meio no cadastro.";
  if (!i.category_id) return "Selecione a categoria de receita.";
  return null;
}

/** Erros de negócio do servidor em português; conflitos nunca disparam nova tentativa automática. */
export function methodAdminError(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? "";
  if (/payment_condition_config_stale|payment_condition_activation_stale/.test(m)) return "Outra pessoa alterou esta configuração. Recarregue e revise antes de salvar.";
  if (/forbidden/.test(m)) return "Você não tem permissão para esta alteração.";
  if (/payment_method_catalog_unavailable/.test(m)) return "Meio de pagamento inativo no cadastro.";
  if (/revenue_category_unavailable/.test(m)) return "Categoria de receita inativa ou inválida.";
  if (/plan_inactive/.test(m)) return "Condição inativa ou substituída.";
  if (/payment_condition_plan_interest_conflict/.test(m)) return "A condição já tem juros próprios; use uma condição sem juros.";
  if (/payment_condition_deadline_exceeds_plan/.test(m)) return "Prazo excede o limite da condição.";
  if (/payment_condition_activation_requires_config/.test(m)) return "Atribua pelo menos uma condição vigente aos parceiros antes de ligar a exigência.";
  if (/payment_condition_pilot_partner_invalid/.test(m)) return "Parceiro do piloto inválido para esta empresa.";
  if (/payment_condition_reassign_requires_new_version/.test(m)) return "Parceiro revogado nesta versão: publique uma nova versão para liberar de novo.";
  if (/check constraint|payment_condition_config_invalid/.test(m)) return "Configuração recusada pelo servidor (parcelas/taxa incompatíveis com o meio).";
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

export function usePublishB2BPaymentCondition() {
  return useLockedMutation<PublishInput>("b2b_payment_condition_publish", (i) => ({
    p_plan_id: i.plan_id, p_method: i.method, p_payment_method_id: i.payment_method_id, p_category_id: i.category_id,
    p_deadline_days: i.deadline_days, p_installment_count: i.installment_count, p_monthly_rate: i.monthly_rate, p_expected_version: i.expected_version,
  }));
}

export function useRetireB2BPaymentCondition() {
  return useLockedMutation<{ plan_id: string; method: MethodKind; expected_version: number }>("b2b_payment_condition_retire", (i) => ({
    p_plan_id: i.plan_id, p_method: i.method, p_expected_version: i.expected_version,
  }));
}

export function useAssignB2BPaymentCondition() {
  return useLockedMutation<{ partner_id: string; plan_id: string; method: MethodKind; version: number; enabled: boolean }>("b2b_payment_condition_assign", (i) => ({
    p_partner_id: i.partner_id, p_plan_id: i.plan_id, p_method: i.method, p_version: i.version, p_enabled: i.enabled,
  }));
}

export function useSetB2BPaymentMethodActivation() {
  return useLockedMutation<{ mode: Activation["mode"]; pilot_partner_ids: string[]; expected_version: number }>("b2b_payment_condition_activation_set", (i) => ({
    p_mode: i.mode, p_pilot_partner_ids: i.pilot_partner_ids, p_expected_version: i.expected_version,
  }));
}

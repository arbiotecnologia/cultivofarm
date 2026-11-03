import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fase 6 — Administração segura dos planos comerciais B2B.
 *
 * Toda escrita passa por RPCs SECURITY DEFINER (administrador, financeiro,
 * gestor_comercial). A tabela `commercial_payment_plans` não aceita mais
 * INSERT/UPDATE/DELETE direto de `authenticated`.
 */

export interface AdminCommercialPlanRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  plan_type: string;
  version: number;
  root_plan_id: string | null;
  superseded_by_id: string | null;
  valid_from: string;
  valid_until: string | null;
  is_default: boolean;
  active: boolean;
  sort_order: number;
  max_days: number;
  months_count: number;
  installment_count: number;
  discount_percent: number;
  monthly_interest_percent: number;
  interest_type: "none" | "simple" | "compound";
  pricing_mode: "discount_from_base" | "fixed_item_price" | "quote_only";
  minimum_order_amount: number | null;
  requires_credit_approval: boolean;
  requires_guarantee: boolean;
  requires_financial_approval: boolean;
  is_referenced: boolean;
  selectable: boolean;
  total_count: number;
}

export interface PlanListFilters {
  search?: string;
  status?: "all" | "active" | "inactive";
  page?: number;
  pageSize?: number;
}

export interface PaymentPlanPayload {
  amortization_type?: 'price' | 'generic';
  name: string;
  code: string;
  description?: string | null;
  plan_type: string;
  max_days: number;
  months_count: number;
  installment_count: number;
  discount_percent: number;
  monthly_interest_percent: number;
  interest_type: string;
  pricing_mode: string;
  minimum_order_amount?: number | null;
  requires_credit_approval: boolean;
  requires_guarantee: boolean;
  requires_financial_approval: boolean;
  active?: boolean;
  sort_order?: number;
  valid_from?: string | null;
  valid_until?: string | null;
  motivo?: string | null;
}

const KEY = ["commercial-payment-plans"];

export function useAdminCommercialPlans(filters: PlanListFilters = {}) {
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 20;
  return useQuery({
    queryKey: [...KEY, "admin", filters],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("rpc_admin_list_commercial_plans", {
        p_search: filters.search?.trim() || null,
        p_status: filters.status ?? "all",
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;
      const rows = (data ?? []) as AdminCommercialPlanRow[];
      return { rows, total: rows[0]?.total_count ?? 0 };
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateCommercialPlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (payload: PaymentPlanPayload) => {
      const { data, error } = await (supabase as any).rpc("rpc_admin_create_commercial_plan", {
        p_payload: payload,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function useVersionCommercialPlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      planId,
      payload,
      motivo,
    }: {
      planId: string;
      payload: PaymentPlanPayload;
      motivo?: string | null;
    }) => {
      const { data, error } = await (supabase as any).rpc("rpc_admin_version_commercial_plan", {
        p_plan_id: planId,
        p_payload: payload,
        p_motivo: motivo ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function useUpdatePlanMetadata() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      planId: string;
      name?: string | null;
      description?: string | null;
      sortOrder?: number | null;
    }) => {
      const { error } = await (supabase as any).rpc("rpc_admin_update_commercial_plan_metadata", {
        p_plan_id: input.planId,
        p_name: input.name ?? null,
        p_description: input.description ?? null,
        p_sort_order: input.sortOrder ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetPlanActive() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, active, motivo }: { id: string; active: boolean; motivo?: string }) => {
      const { error } = await (supabase as any).rpc("rpc_admin_set_commercial_plan_active", {
        p_plan_id: id,
        p_active: active,
        p_motivo: motivo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetDefaultPlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("rpc_admin_set_default_commercial_plan", {
        p_plan_id: id,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useReorderPlans() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (orders: Array<{ id: string; sort_order: number }>) => {
      const { error } = await (supabase as any).rpc("rpc_admin_reorder_commercial_plans", {
        p_orders: orders,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Mensagens amigáveis para erros de negócio do backend. */
export function planErrorMessage(err: unknown): string {
  const raw = String((err as any)?.message ?? "");
  const map: Record<string, string> = {
    not_authorized: "Você não tem permissão para administrar planos comerciais.",
    plan_not_found: "Plano não encontrado.",
    plan_already_superseded: "Este plano já possui uma versão mais recente.",
    plan_superseded_cannot_activate: "Plano substituído não pode ser reativado.",
    plan_not_selectable: "Plano inativo ou fora da vigência.",
    plan_financial_immutable_create_new_version:
      "Plano já usado em pedidos: crie uma nova versão para alterar condições financeiras.",
    plan_referenced_delete_blocked: "Plano referenciado não pode ser excluído. Desative-o.",
    plan_name_required: "Nome é obrigatório.",
    plan_code_required: "Código é obrigatório.",
    discount_out_of_range: "Desconto deve estar entre 0% e 100%.",
    interest_out_of_range: "Juros mensais devem estar entre 0% e 100%.",
    installment_out_of_range: "Número de parcelas deve estar entre 1 e 60.",
    months_out_of_range: "Número de meses deve estar entre 0 e 60.",
    max_days_out_of_range: "Prazo máximo deve estar entre 0 e 1095 dias.",
    validity_window_invalid: "Fim da vigência deve ser posterior ao início.",
    sort_order_invalid: "Ordem inválida.",
  };
  for (const key of Object.keys(map)) {
    if (raw.includes(key)) return map[key];
  }
  if (raw.includes("duplicate key") && raw.includes("code")) return "Já existe um plano com este código.";
  if (raw.includes("uq_cpp_single_default")) return "Já existe um plano padrão definido.";
  return raw || "Erro inesperado.";
}

/**
 * Compat: lista completa (até 100) para seletores administrativos
 * (ex.: matriz de preços). Usa a mesma RPC segura.
 */
export function useAllCommercialPaymentPlans() {
  const q = useAdminCommercialPlans({ pageSize: 100 });
  return { ...q, data: q.data?.rows ?? [] };
}

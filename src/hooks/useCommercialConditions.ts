/**
 * Fase B — Condições comerciais configuráveis.
 *
 * Todo acesso passa por RPC `SECURITY DEFINER` (`rpc_cc_*`): as tabelas
 * `commercial_payment_plan_assignments` e `commercial_condition_item_prices`
 * não são consultadas diretamente pelo frontend. Preparação: administrador,
 * financeiro e gestor comercial. Publicação: administrador e financeiro.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase as any).rpc(name, args);

export type ConditionStatus = "draft" | "pending_approval" | "published" | "archived";
export type ConditionScope = "partner" | "producer" | "default";
export type ConditionPricingMode = "fixed_item_price" | "discount_from_base" | "quote_only";
export type ConditionUnitType = "hectare" | "dose" | "litro" | "unidade";

export interface PlanAssignment {
  id: string;
  plan_id: string;
  buyer_scope: ConditionScope;
  partner_id: string | null;
  customer_id: string | null;
  status: ConditionStatus;
  valid_from: string;
  valid_until: string | null;
  motivo: string | null;
  published_at: string | null;
  created_at: string;
}

export interface ConditionItemPrice {
  id: string;
  assignment_id: string | null;
  plan_id: string;
  buyer_scope: ConditionScope;
  partner_id: string | null;
  customer_id: string | null;
  product_id: string | null;
  microrganismo_id: string | null;
  unit_type: ConditionUnitType;
  volume_ml: number | null;
  min_quantity: number;
  pricing_mode: ConditionPricingMode;
  condition_price: number | null;
  discount_percent: number | null;
  currency: string;
  valid_from: string;
  valid_until: string | null;
  status: ConditionStatus;
  motivo: string | null;
  is_exception: boolean;
  published_rule_id: string | null;
  published_at: string | null;
  updated_at: string;
}

export interface ConditionAuditEntry {
  id: string;
  entity: string;
  entity_id: string | null;
  action: string;
  actor_id: string | null;
  motivo: string | null;
  created_at: string;
}

export function conditionErrorMessage(message: string | undefined): string {
  const msg = message ?? "";
  if (msg.includes("not_authorized_publish")) return "Somente administrador ou financeiro pode publicar.";
  if (msg.includes("not_authorized")) return "Sem permissão para administrar condições comerciais.";
  if (msg.includes("assignment_not_published")) return "Publique a atribuição do plano antes de publicar os preços.";
  if (msg.includes("assignment_not_editable")) return "Atribuição já submetida ou publicada — crie uma nova versão.";
  if (msg.includes("item_price_not_editable")) return "Preço já publicado — crie um novo rascunho.";
  if (msg.includes("only_draft_can_be_deleted")) return "Apenas rascunhos podem ser excluídos.";
  if (msg.includes("motivo_required_for_exception")) return "Exceções exigem motivo.";
  if (msg.includes("motivo_required")) return "Informe o motivo.";
  if (msg.includes("default_scope_not_publishable")) return "A tabela padrão serve de modelo: publique por parceiro ou produtor.";
  if (msg.includes("invalid_transition")) return "Transição de status inválida.";
  if (msg.includes("invalid_target_scope")) return "Escopo de destino inválido.";
  if (msg.includes("no_items")) return "Selecione ao menos um item.";
  if (msg.includes("duplicate key")) return "Já existe registro publicado para essa combinação e vigência.";
  if (msg.includes("violates check constraint")) return "Dados inválidos: revise modo, preço/desconto, unidade e vigência.";
  return msg || "Não foi possível concluir a operação.";
}

const CC_KEY = ["commercial-conditions"] as const;

export function usePlanAssignments(status?: ConditionStatus) {
  return useQuery({
    queryKey: [...CC_KEY, "assignments", status ?? "all"],
    queryFn: async (): Promise<PlanAssignment[]> => {
      const { data, error } = await rpc("rpc_cc_list_assignments", { p_status: status ?? null });
      if (error) throw new Error(conditionErrorMessage(error.message));
      return (data ?? []) as PlanAssignment[];
    },
  });
}

export function useConditionItemPrices(planId?: string | null, status?: ConditionStatus) {
  return useQuery({
    queryKey: [...CC_KEY, "item-prices", planId ?? "all", status ?? "all"],
    queryFn: async (): Promise<ConditionItemPrice[]> => {
      const { data, error } = await rpc("rpc_cc_list_item_prices", {
        p_plan_id: planId ?? null,
        p_status: status ?? null,
        p_assignment_id: null,
      });
      if (error) throw new Error(conditionErrorMessage(error.message));
      return (data ?? []) as ConditionItemPrice[];
    },
  });
}

export function useConditionHistory(entity?: string, entityId?: string | null) {
  return useQuery({
    queryKey: [...CC_KEY, "history", entity ?? "all", entityId ?? "all"],
    queryFn: async (): Promise<ConditionAuditEntry[]> => {
      const { data, error } = await rpc("rpc_cc_history", {
        p_entity: entity ?? null,
        p_entity_id: entityId ?? null,
        p_limit: 100,
      });
      if (error) throw new Error(conditionErrorMessage(error.message));
      return (data ?? []) as ConditionAuditEntry[];
    },
  });
}

function useCcMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: CC_KEY }),
  });
}

export interface AssignmentInput {
  id?: string | null;
  plan_id: string;
  buyer_scope: ConditionScope;
  partner_id: string | null;
  customer_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
  motivo: string | null;
}

export function useSaveAssignment() {
  return useCcMutation(async (input: AssignmentInput) => {
    const { data, error } = await rpc("rpc_cc_upsert_assignment", {
      p_id: input.id ?? null,
      p_plan_id: input.plan_id,
      p_buyer_scope: input.buyer_scope,
      p_partner_id: input.partner_id,
      p_customer_id: input.customer_id,
      p_valid_from: input.valid_from,
      p_valid_until: input.valid_until,
      p_motivo: input.motivo,
    });
    if (error) throw new Error(conditionErrorMessage(error.message));
    return data as string;
  });
}

export function useSubmitAssignment() {
  return useCcMutation(async ({ id, motivo }: { id: string; motivo?: string | null }) => {
    const { error } = await rpc("rpc_cc_submit_assignment", { p_id: id, p_motivo: motivo ?? null });
    if (error) throw new Error(conditionErrorMessage(error.message));
  });
}

export function usePublishAssignment() {
  return useCcMutation(async ({ id, motivo }: { id: string; motivo?: string | null }) => {
    const { error } = await rpc("rpc_cc_publish_assignment", { p_id: id, p_motivo: motivo ?? null });
    if (error) throw new Error(conditionErrorMessage(error.message));
  });
}

export function useArchiveAssignment() {
  return useCcMutation(async ({ id, motivo }: { id: string; motivo: string }) => {
    const { error } = await rpc("rpc_cc_archive_assignment", { p_id: id, p_motivo: motivo });
    if (error) throw new Error(conditionErrorMessage(error.message));
  });
}

export interface ItemPriceInput {
  id?: string | null;
  assignment_id: string | null;
  plan_id: string;
  buyer_scope: ConditionScope;
  partner_id: string | null;
  customer_id: string | null;
  product_id: string | null;
  microrganismo_id: string | null;
  unit_type: ConditionUnitType;
  volume_ml: number | null;
  min_quantity: number;
  pricing_mode: ConditionPricingMode;
  condition_price: number | null;
  discount_percent: number | null;
  valid_from: string | null;
  valid_until: string | null;
  is_exception: boolean;
  motivo: string | null;
}

export function useSaveItemPrice() {
  return useCcMutation(async (input: ItemPriceInput) => {
    const { data, error } = await rpc("rpc_cc_upsert_item_price", {
      p_id: input.id ?? null,
      p_assignment_id: input.assignment_id,
      p_plan_id: input.plan_id,
      p_buyer_scope: input.buyer_scope,
      p_partner_id: input.partner_id,
      p_customer_id: input.customer_id,
      p_product_id: input.product_id,
      p_microrganismo_id: input.microrganismo_id,
      p_unit_type: input.unit_type,
      p_volume_ml: input.volume_ml,
      p_min_quantity: input.min_quantity,
      p_pricing_mode: input.pricing_mode,
      p_condition_price: input.condition_price,
      p_discount_percent: input.discount_percent,
      p_valid_from: input.valid_from,
      p_valid_until: input.valid_until,
      p_is_exception: input.is_exception,
      p_motivo: input.motivo,
    });
    if (error) throw new Error(conditionErrorMessage(error.message));
    return data as string;
  });
}

export function useDeleteItemPrice() {
  return useCcMutation(async ({ id, motivo }: { id: string; motivo?: string | null }) => {
    const { error } = await rpc("rpc_cc_delete_item_price", { p_id: id, p_motivo: motivo ?? null });
    if (error) throw new Error(conditionErrorMessage(error.message));
  });
}

export interface MatrixValidation {
  ok: boolean;
  missing_items: Array<{ tipo: string; id: string; nome: string }>;
  draft_count: number;
  quote_only_count: number;
}

export function useValidateMatrix() {
  return useMutation({
    mutationFn: async (v: {
      plan_id: string;
      buyer_scope: ConditionScope;
      partner_id: string | null;
      customer_id: string | null;
    }): Promise<MatrixValidation> => {
      const { data, error } = await rpc("rpc_cc_validate_matrix", {
        p_plan_id: v.plan_id,
        p_buyer_scope: v.buyer_scope,
        p_partner_id: v.partner_id,
        p_customer_id: v.customer_id,
      });
      if (error) throw new Error(conditionErrorMessage(error.message));
      return data as MatrixValidation;
    },
  });
}

export function usePublishItemPrices() {
  return useCcMutation(async ({ ids, motivo }: { ids: string[]; motivo?: string | null }) => {
    const { data, error } = await rpc("rpc_cc_publish_item_prices", { p_ids: ids, p_motivo: motivo ?? null });
    if (error) throw new Error(conditionErrorMessage(error.message));
    return data as { published: number };
  });
}

export function useCopyDefaultTable() {
  return useCcMutation(
    async (v: {
      plan_id: string;
      target_scope: "partner" | "producer";
      partner_id: string | null;
      customer_id: string | null;
      motivo?: string | null;
    }) => {
      const { data, error } = await rpc("rpc_cc_copy_default_table", {
        p_plan_id: v.plan_id,
        p_target_scope: v.target_scope,
        p_partner_id: v.partner_id,
        p_customer_id: v.customer_id,
        p_motivo: v.motivo ?? null,
      });
      if (error) throw new Error(conditionErrorMessage(error.message));
      return data as { copied: number };
    },
  );
}

export interface BulkAdjustPreviewRow {
  id: string;
  pricing_mode: ConditionPricingMode;
  current_price: number | null;
  current_discount: number | null;
  new_price: number | null;
  new_discount: number | null;
}

export function useBulkAdjustPreview() {
  return useMutation({
    mutationFn: async ({ ids, percent }: { ids: string[]; percent: number }): Promise<BulkAdjustPreviewRow[]> => {
      const { data, error } = await rpc("rpc_cc_bulk_adjust_preview", { p_ids: ids, p_percent: percent });
      if (error) throw new Error(conditionErrorMessage(error.message));
      return ((data as { preview?: BulkAdjustPreviewRow[] })?.preview ?? []) as BulkAdjustPreviewRow[];
    },
  });
}

export function useBulkAdjustApply() {
  return useCcMutation(async ({ ids, percent, motivo }: { ids: string[]; percent: number; motivo: string }) => {
    const { data, error } = await rpc("rpc_cc_bulk_adjust_apply", {
      p_ids: ids,
      p_percent: percent,
      p_motivo: motivo,
    });
    if (error) throw new Error(conditionErrorMessage(error.message));
    return data as { updated: number };
  });
}

export function useSimulateConditionPrice() {
  return useMutation({
    mutationFn: async (v: {
      buyer_scope: ConditionScope;
      partner_id: string | null;
      customer_id: string | null;
      plan_id: string;
      product_id: string | null;
      microrganismo_id: string | null;
      unit_type: ConditionUnitType;
      volume_ml: number | null;
    }) => {
      const { data, error } = await rpc("rpc_cc_simulate_price", {
        p_buyer_scope: v.buyer_scope,
        p_partner_id: v.partner_id,
        p_customer_id: v.customer_id,
        p_plan_id: v.plan_id,
        p_product_id: v.product_id,
        p_microrganismo_id: v.microrganismo_id,
        p_unit_type: v.unit_type,
        p_volume_ml: v.volume_ml,
        p_ref_date: new Date().toISOString().slice(0, 10),
      });
      if (error) throw new Error(conditionErrorMessage(error.message));
      return data as Record<string, unknown>;
    },
  });
}

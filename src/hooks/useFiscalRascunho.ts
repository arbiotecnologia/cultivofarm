/**
 * Fase Fiscal 3.16 — Hook do wizard de rascunho.
 *
 * Chama RPC transacional `rpc_fiscal_draft_save` (server recalcula totais)
 * e `rpc_fiscal_draft_validate_homologation` (read-only). Concorrência via
 * `draft_version`. Nenhum caminho aceita `AUTHORIZED`/`ISSUED`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RascunhoFormValues } from "@/lib/fiscal/rascunhoWizardValidation";

export interface SaveDraftArgs {
  invoiceId: string | null;
  values: RascunhoFormValues;
  expectedVersion: number;
  companyCnpj: string;
}

export interface DraftSaveResult {
  id: string;
  draft_version: number;
  total_amount: number;
}

export function useSaveFiscalRascunho() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveDraftArgs): Promise<DraftSaveResult> => {
      const invoicePayload = {
        invoice_type: args.values.invoice_type,
        document_model: args.values.document_model,
        document_origin: "MANUAL_RECORD",
        environment: args.values.environment,
        provider: "NONE",
        status: args.values.status,
        normalized_status: "DRAFT",
        series: args.values.series,
        issue_date: args.values.issue_date,
        notes: args.values.notes ?? null,
        company_cnpj: args.companyCnpj,
        customer_id: args.values.customer_id,
        receivable_id: args.values.receivable_id ?? null,
        delivery_id: args.values.delivery_id ?? null,
        customer_snapshot: args.values.customer_snapshot,
      };
      const itemsPayload = args.values.items.map((it) => ({
        item_kind: it.item_kind,
        description: it.description,
        quantity: it.quantity,
        commercial_unit: it.commercial_unit,
        unit_value: it.unit_value,
        gross_value: it.gross_value,
        discount_value: it.discount_value,
        net_value: it.net_value,
        source_item_type: it.source_item_type ?? null,
        source_item_id: it.source_item_id ?? null,
      }));

      const { data, error } = await supabase.rpc("rpc_fiscal_draft_save", {
        p_invoice_id: args.invoiceId,
        p_invoice: invoicePayload,
        p_items: itemsPayload,
        p_expected_version: args.expectedVersion,
      });
      if (error) throw error;
      return data as unknown as DraftSaveResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal", "documents"] });
    },
  });
}

export interface HomologationValidationResult {
  status: "READY" | "INCOMPLETE" | "BLOCKED";
  missing?: string[];
  reason?: string;
  item_count?: number;
  total_amount?: number;
}

export function useValidateHomologation() {
  return useMutation({
    mutationFn: async (invoiceId: string): Promise<HomologationValidationResult> => {
      const { data, error } = await supabase.rpc("rpc_fiscal_draft_validate_homologation", {
        p_invoice_id: invoiceId,
      });
      if (error) throw error;
      return data as unknown as HomologationValidationResult;
    },
  });
}

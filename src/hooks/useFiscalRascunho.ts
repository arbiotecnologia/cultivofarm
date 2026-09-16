/**
 * Fase Fiscal 3.16 / 3.16.2-B / 3.16.2-C — Hook do wizard de rascunho.
 *
 * Chama RPC transacional `rpc_fiscal_draft_save` (server recalcula totais e
 * persiste `fiscal_profile_snapshot`/`tax_snapshot` por item) e
 * `rpc_fiscal_draft_validate_homologation` (read-only, exige perfil fiscal,
 * CFOP/CST/CSOSN para produto e LC116/CNAE/ISS rate para serviço).
 * Concorrência via `draft_version`. Nenhum caminho aceita `AUTHORIZED`/
 * `ISSUED`.
 *
 * 3.16.2-C:
 *   - O payload por item NÃO inclui `gross_value` nem `net_value`: o
 *     servidor recalcula ambos a partir de `quantity * unit_value -
 *     discount_value`. Enviar esses campos permitiria manipular totais.
 *   - Os snapshots são construídos exclusivamente por
 *     `buildItemSnapshots`, que aplica a mesma whitelist da RPC.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RascunhoFormValues } from "@/lib/fiscal/rascunhoWizardValidation";
import { buildItemSnapshots } from "@/lib/fiscal/rascunhoSnapshots";

// RPCs adicionadas na migration da Fase 3.16. Enquanto `types.ts` não é
// regenerado (pós-aplicação da migration), usamos um proxy tipado local.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

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
      const itemsPayload = args.values.items.map((it) => {
        const { profile, tax } = buildItemSnapshots(args.values.invoice_type, it);
        return {
          item_kind: it.item_kind,
          description: it.description,
          quantity: it.quantity,
          commercial_unit: it.commercial_unit,
          unit_value: it.unit_value,
          discount_value: it.discount_value,
          // gross_value e net_value são calculados pelo servidor; NÃO enviar.
          source_item_type: it.source_item_type ?? null,
          source_item_id: it.source_item_id ?? null,
          fiscal_profile_snapshot: profile,
          tax_snapshot: tax,
          // Entradas do operador (redução da base por tributo). O servidor
          // valida as chaves e recalcula tudo pelo motor canônico.
          tax_input_snapshot: it.tax_input_snapshot ?? {},
        };
      });

      const { data, error } = await rpc("rpc_fiscal_draft_save", {
        p_invoice_id: args.invoiceId,
        p_invoice: invoicePayload,
        p_items: itemsPayload,
        p_expected_version: args.expectedVersion,
      });
      if (error) throw new Error(error.message);
      return data as DraftSaveResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal", "documents"] });
    },
  });
}

export interface HomologationValidationResult {
  status: "READY" | "INCOMPLETE" | "BLOCKED";
  missing?: Array<{ field: string; message: string }>;
  reason?: string;
  item_count?: number;
  total_amount?: number;
}

export function useValidateHomologation() {
  return useMutation({
    mutationFn: async (invoiceId: string): Promise<HomologationValidationResult> => {
      const { data, error } = await rpc("rpc_fiscal_draft_validate_homologation", {
        p_invoice_id: invoiceId,
      });
      if (error) throw new Error(error.message);
      return data as HomologationValidationResult;
    },
  });
}

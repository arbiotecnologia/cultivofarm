/**
 * Fase Fiscal 3.6 — Hooks para reconciliação assistida.
 *
 * - Fila server-side a partir de `v_fiscal_document_reconciliation_pending`.
 * - Detalhe carrega `fiscal_invoices` (colunas explícitas).
 * - Vínculo/desvínculo NÃO ALTERAM `accounts_receivable` nem `entregas`:
 *   apenas atualizam `receivable_id`/`delivery_id` em `fiscal_invoices`
 *   MANUAL, com concorrência otimista por `updated_at + locked_at`.
 * - Eventos manuais SÓ pela RPC `rpc_fiscal_event_manual`, gated
 *   pelas flags `fiscalReconciliationWrite` E `fiscalDocumentManualEventRpc`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  assertManualEditable,
  linkSchema,
  unlinkSchema,
  ReconciliationWriteDisabledError,
  OptimisticReconciliationConflictError,
  type FiscalInvoiceRow,
  type LinkValues,
  type ReconciliationPendingRow,
  type UnlinkValues,
} from "@/lib/fiscal/reconciliationValidation";

type FiscalEventRow = Database["public"]["Tables"]["fiscal_events"]["Row"];

export const RECON_KEYS = {
  root: ["fiscal", "reconciliation"] as const,
  queue: (p: QueueParams) => [...RECON_KEYS.root, "queue", p] as const,
  invoice: (id: string) => [...RECON_KEYS.root, "invoice", id] as const,
  events: (id: string) => [...RECON_KEYS.root, "events", id] as const,
  summary: () => [...RECON_KEYS.root, "summary"] as const,
};

export interface QueueParams {
  documentModel: string | null;
  documentOrigin: string | null;
  reconciliationStatus: string | null;
  normalizedStatus: string | null;
  hasReceivable: "any" | "yes" | "no";
  page: number;
  pageSize: number;
}

export interface QueueResult {
  items: ReconciliationPendingRow[];
  total: number;
}

const QUEUE_COLUMNS =
  "fiscal_invoice_id, receivable_id, document_model, document_origin, " +
  "status, normalized_status, reconciliation_status";

export function useReconciliationQueue(params: QueueParams) {
  return useQuery({
    queryKey: RECON_KEYS.queue(params),
    queryFn: async (): Promise<QueueResult> => {
      const from = (params.page - 1) * params.pageSize;
      const to = from + params.pageSize - 1;
      let q = supabase
        .from("v_fiscal_document_reconciliation_pending")
        .select(QUEUE_COLUMNS, { count: "exact" })
        .range(from, to);
      if (params.documentModel) q = q.eq("document_model", params.documentModel);
      if (params.documentOrigin) q = q.eq("document_origin", params.documentOrigin);
      if (params.reconciliationStatus) q = q.eq("reconciliation_status", params.reconciliationStatus);
      if (params.normalizedStatus) q = q.eq("normalized_status", params.normalizedStatus);
      if (params.hasReceivable === "yes") q = q.not("receivable_id", "is", null);
      if (params.hasReceivable === "no") q = q.is("receivable_id", null);
      const { data, count, error } = await q;
      if (error) throw error;
      return {
        items: (data ?? []) as unknown as ReconciliationPendingRow[],
        total: count ?? 0,
      };
    },
    staleTime: 30_000,
  });
}

const INVOICE_COLUMNS =
  "id, invoice_type, document_model, document_origin, environment, provider, " +
  "status, normalized_status, reconciliation_status, invoice_number, series, " +
  "issue_date, total_amount, receivable_id, delivery_id, company_cnpj, notes, " +
  "access_key, locked_at, locked_by, updated_at, created_at";

export function useReconciliationInvoice(id: string | null) {
  return useQuery({
    queryKey: id ? RECON_KEYS.invoice(id) : [...RECON_KEYS.root, "invoice", "none"],
    enabled: !!id,
    queryFn: async (): Promise<FiscalInvoiceRow | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("fiscal_invoices")
        .select(INVOICE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as FiscalInvoiceRow | null) ?? null;
    },
    staleTime: 15_000,
  });
}

export function useReconciliationEvents(id: string | null) {
  return useQuery({
    queryKey: id ? RECON_KEYS.events(id) : [...RECON_KEYS.root, "events", "none"],
    enabled: !!id,
    queryFn: async (): Promise<FiscalEventRow[]> => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("fiscal_events")
        .select(
          "id, fiscal_invoice_id, event_type, event_source, status_before, " +
            "status_after, notes, performed_by, error_code, created_at, " +
            "provider_event_id, request_snapshot, response_snapshot, error_message",
        )
        .eq("fiscal_invoice_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as FiscalEventRow[];
    },
    staleTime: 15_000,
  });
}

export interface LinkArgs {
  values: LinkValues;
  prev: FiscalInvoiceRow;
  writeEnabled: boolean;
}

export function useLinkFiscalInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ values, prev, writeEnabled }: LinkArgs): Promise<string> => {
      if (!writeEnabled) throw new ReconciliationWriteDisabledError();
      const parsed = linkSchema.parse(values);
      assertManualEditable(prev);
      const currentLink = parsed.target === "receivable_id"
        ? prev.receivable_id
        : prev.delivery_id;
      if (currentLink && currentLink !== parsed.targetId && !parsed.confirmOverwrite) {
        throw new Error("Vínculo já existente; confirmação explícita necessária.");
      }
      if (currentLink === parsed.targetId) return prev.id;
      const patch: Database["public"]["Tables"]["fiscal_invoices"]["Update"] =
        parsed.target === "receivable_id"
          ? { receivable_id: parsed.targetId }
          : { delivery_id: parsed.targetId };
      const { data, error } = await supabase
        .from("fiscal_invoices")
        .update(patch)
        .eq("id", prev.id)
        .eq("updated_at", prev.updated_at)
        .is("locked_at", null)
        .select("id, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new OptimisticReconciliationConflictError();
      return data.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: RECON_KEYS.root });
      qc.invalidateQueries({ queryKey: RECON_KEYS.invoice(id) });
    },
  });
}

export interface UnlinkArgs {
  values: UnlinkValues;
  prev: FiscalInvoiceRow;
  writeEnabled: boolean;
  manualEventEnabled: boolean;
}

export function useUnlinkFiscalInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      values, prev, writeEnabled, manualEventEnabled,
    }: UnlinkArgs): Promise<string> => {
      if (!writeEnabled) throw new ReconciliationWriteDisabledError();
      const parsed = unlinkSchema.parse(values);
      assertManualEditable(prev);
      const patch: Record<string, null> = { [parsed.target]: null };
      const { data, error } = await supabase
        .from("fiscal_invoices")
        .update(patch)
        .eq("id", prev.id)
        .eq("updated_at", prev.updated_at)
        .is("locked_at", null)
        .select("id, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new OptimisticReconciliationConflictError();

      // Evento manual só se a RPC estiver liberada. Falha aqui NUNCA
      // reverte o UPDATE — o desvínculo é auditado pelo trigger canônico.
      if (manualEventEnabled) {
        const notes = `unlink_${parsed.target}: ${parsed.reason}`.slice(0, 2000);
        const { error: rpcErr } = await supabase.rpc("rpc_fiscal_event_manual", {
          p_invoice_id: prev.id,
          p_event_type: "MANUAL_UPDATED",
          p_notes: notes,
        });
        if (rpcErr) throw rpcErr;
      }
      return data.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: RECON_KEYS.root });
      qc.invalidateQueries({ queryKey: RECON_KEYS.invoice(id) });
      qc.invalidateQueries({ queryKey: RECON_KEYS.events(id) });
    },
  });
}

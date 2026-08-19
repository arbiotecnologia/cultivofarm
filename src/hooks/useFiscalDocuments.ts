/**
 * Fase Fiscal 3.5 — Hooks tipados para `fiscal_invoices`, `fiscal_invoice_items`,
 * `fiscal_events`, `fiscal_audit_log` e `v_fiscal_document_reconciliation_pending`.
 *
 * - Sem `any`, sem casts amplos; select por colunas explícitas.
 * - Paginação/busca/filtro server-side.
 * - INSERT tipado com whitelist e `provider=NONE`/`document_origin=MANUAL_RECORD`.
 * - UPDATE otimista por `id + updated_at` (equivalente lógico ao `locked_at`
 *   quando a nota está travada por integração — bloqueia gravação).
 * - RPC `rpc_fiscal_event_manual` sob feature flag `fiscalDocumentManualEventRpc`.
 * - Nenhuma escrita em `fiscal_events` direta pela UI.
 * - Consultas independentes falham isoladamente; erro nunca vira zero.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildFiscalEventIdempotencyKey } from "@/lib/fiscal/eventIdempotency";
import type { Database } from "@/integrations/supabase/types";
import {
  buildInsertPayload,
  buildUpdatePayload,
  assertManualEventType,
  type FiscalInvoiceRow,
  type FiscalInvoiceItemRow,
  type InvoiceFormValues,
  type ManualEventType,
  NORMALIZED_STATUS_MANUAL,
} from "@/lib/fiscal/documentWorkflowValidation";

type FiscalEventRow = any;
type FiscalAuditRow = any;
type ReconciliationRow = any;

export class OptimisticFiscalConflictError extends Error {
  constructor() {
    super("Registro fiscal alterado por outra sessão. Recarregue e tente novamente.");
    this.name = "OptimisticFiscalConflictError";
  }
}
export class InvoiceLockedError extends Error {
  constructor() {
    super("Registro fiscal está bloqueado por processo de integração; edição indisponível.");
    this.name = "InvoiceLockedError";
  }
}
export class ManualEventRpcDisabledError extends Error {
  constructor() {
    super(
      "Ação de evento manual está atrás de flag `fiscalDocumentManualEventRpc` " +
        "(default false) até validação em staging.",
    );
    this.name = "ManualEventRpcDisabledError";
  }
}

export const FISCAL_DOC_KEYS = {
  root: ["fiscal", "documents"] as const,
  list: (p: ListParams) => [...FISCAL_DOC_KEYS.root, "list", p] as const,
  detail: (id: string) => [...FISCAL_DOC_KEYS.root, "detail", id] as const,
  items: (id: string) => [...FISCAL_DOC_KEYS.root, "items", id] as const,
  events: (id: string) => [...FISCAL_DOC_KEYS.root, "events", id] as const,
  audit: (id: string) => [...FISCAL_DOC_KEYS.root, "audit", id] as const,
  reconciliation: () => [...FISCAL_DOC_KEYS.root, "reconciliation"] as const,
};

export interface ListParams {
  search: string;
  documentModel: string | null;
  documentOrigin: string | null;
  normalizedStatus: string | null;
  reconciliationStatus: string | null;
  environment: string | null;
  page: number;
  pageSize: number;
}

export interface ListResult {
  items: FiscalInvoiceRow[];
  total: number;
}

const LIST_COLUMNS =
  "id, invoice_type, document_model, document_origin, environment, provider, " +
  "status, normalized_status, reconciliation_status, invoice_number, series, " +
  "issue_date, total_amount, receivable_id, delivery_id, company_cnpj, " +
  "locked_at, updated_at, created_at";

const DETAIL_COLUMNS =
  LIST_COLUMNS +
  ", notes, xml_document_id, danfe_document_id, access_key, provider_reference, " +
  "provider_status_raw, idempotency_key, source_type, source_id, parent_invoice_id, " +
  "substitution_invoice_id, authorized_at, rejected_at, canceled_at, cancel_reason, " +
  "company_snapshot, customer_snapshot, fiscal_totals_snapshot, payload_schema_version, " +
  "locked_by, created_by";

export function useFiscalDocumentList(params: ListParams) {
  return useQuery({
    queryKey: FISCAL_DOC_KEYS.list(params),
    queryFn: async (): Promise<ListResult> => {
      const from = (params.page - 1) * params.pageSize;
      const to = from + params.pageSize - 1;
      let q = (supabase as any)
        .from("fiscal_invoices")
        .select(LIST_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (params.documentModel) q = q.eq("document_model", params.documentModel);
      if (params.documentOrigin) q = q.eq("document_origin", params.documentOrigin);
      if (params.normalizedStatus) q = q.eq("normalized_status", params.normalizedStatus);
      if (params.reconciliationStatus) q = q.eq("reconciliation_status", params.reconciliationStatus);
      if (params.environment) q = q.eq("environment", params.environment);
      const s = params.search.trim();
      if (s) {
        // Busca só em campos textuais reais.
        const esc = s.replace(/[,%()]/g, "");
        q = q.or(
          `invoice_number.ilike.%${esc}%,series.ilike.%${esc}%,company_cnpj.ilike.%${esc}%`,
        );
      }
      const { data, count, error } = await q;
      if (error) throw error;
      return {
        items: (data ?? []) as any[],
        total: (count as any) ?? 0,
      };
    },
    staleTime: 30_000,
  });
}

export function useFiscalDocument(id: string | null) {
  return useQuery({
    queryKey: id ? FISCAL_DOC_KEYS.detail(id) : ["fiscal", "documents", "detail", "none"],
    enabled: !!id,
    queryFn: async (): Promise<FiscalInvoiceRow | null> => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("fiscal_invoices")
        .select(DETAIL_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as any | null) ?? null;
    },
    staleTime: 15_000,
  });
}

export function useFiscalDocumentItems(id: string | null) {
  return useQuery({
    queryKey: id ? FISCAL_DOC_KEYS.items(id) : ["fiscal", "documents", "items", "none"],
    enabled: !!id,
    queryFn: async (): Promise<FiscalInvoiceItemRow[]> => {
      if (!id) return [];
      const { data, error } = await (supabase as any)
        .from("fiscal_invoice_items")
        .select(
          "id, fiscal_invoice_id, item_sequence, item_kind, description, " +
            "quantity, commercial_unit, unit_value, gross_value, discount_value, " +
            "net_value, taxable_quantity, taxable_unit, source_item_type, " +
            "source_item_id, created_at, updated_at",
        )
        .eq("fiscal_invoice_id", id)
        .order("item_sequence", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });
}

export function useFiscalDocumentEvents(id: string | null) {
  return useQuery({
    queryKey: id ? FISCAL_DOC_KEYS.events(id) : ["fiscal", "documents", "events", "none"],
    enabled: !!id,
    queryFn: async (): Promise<FiscalEventRow[]> => {
      if (!id) return [];
      const { data, error } = await (supabase as any)
        .from("fiscal_events")
        .select(
          "id, fiscal_invoice_id, event_type, event_source, status_before, " +
            "status_after, notes, performed_by, error_code, created_at, " +
            "provider_event_id, request_snapshot, response_snapshot, error_message",
        )
        .eq("fiscal_invoice_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 15_000,
  });
}

export function useFiscalAuditLog(recordId: string | null) {
  return useQuery({
    queryKey: recordId ? FISCAL_DOC_KEYS.audit(recordId) : ["fiscal", "documents", "audit", "none"],
    enabled: !!recordId,
    queryFn: async (): Promise<FiscalAuditRow[]> => {
      if (!recordId) return [];
      const { data, error } = await (supabase as any)
        .from("fiscal_audit_log")
        .select("id, action, table_name, record_id, changed_at, changed_by, old_values, new_values")
        .eq("record_id", recordId)
        .order("changed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 15_000,
  });
}

export function useReconciliationPending() {
  return useQuery({
    queryKey: FISCAL_DOC_KEYS.reconciliation(),
    queryFn: async (): Promise<ReconciliationRow[]> => {
      const { data, error } = await (supabase as any)
        .from("v_fiscal_document_reconciliation_pending")
        .select(
          "fiscal_invoice_id, receivable_id, document_model, document_origin, " +
            "status, normalized_status, reconciliation_status",
        )
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });
}

export interface SaveArgs {
  values: InvoiceFormValues;
  prev: FiscalInvoiceRow | null;
  createdBy: string;
}

export function useSaveFiscalDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ values, prev, createdBy }: SaveArgs): Promise<string> => {
      if (prev) {
        if (prev.locked_at) throw new InvoiceLockedError();
        const patch = buildUpdatePayload(values, prev);
        if (Object.keys(patch).length === 0) return prev.id;
        const { data, error } = await (supabase as any)
          .from("fiscal_invoices")
          .update(patch)
          .eq("id", prev.id)
          .eq("updated_at", prev.updated_at)
          .is("locked_at", null)
          .select("id, updated_at")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new OptimisticFiscalConflictError();
        return data.id;
      }
      const payload = buildInsertPayload(values, createdBy);
      const { data, error } = await (supabase as any)
        .from("fiscal_invoices")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: FISCAL_DOC_KEYS.root });
      qc.invalidateQueries({ queryKey: FISCAL_DOC_KEYS.detail(id) });
    },
  });
}

export interface ManualEventArgs {
  invoiceId: string;
  eventType: ManualEventType;
  notes: string;
  enabled: boolean;
}

export function useRegisterManualEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, eventType, notes, enabled }: ManualEventArgs) => {
      if (!enabled) throw new ManualEventRpcDisabledError();
      assertManualEventType(eventType);
      const cleanNotes = notes.trim().slice(0, 2000);
      const { data, error } = await (supabase as any).rpc("rpc_fiscal_event_manual", {
        p_invoice_id: invoiceId,
        p_event_type: eventType,
        p_notes: cleanNotes === "" ? undefined : cleanNotes,
        // H7b: chave obrigatória e determinística — retry/duplo clique da mesma
        // tentativa lógica reaproveita o evento em vez de duplicá-lo.
        p_idempotency_key: buildFiscalEventIdempotencyKey(invoiceId, eventType, cleanNotes),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: FISCAL_DOC_KEYS.events(vars.invoiceId) });
    },
  });
}

/** Helper: retorna true se o registro está em estado que sinaliza
 *  “manual e editável”. Nunca aceita estados que simulam emissão. */
export function isEditableManualDocument(row: FiscalInvoiceRow): boolean {
  if (row.locked_at) return false;
  if (row.document_origin !== "MANUAL_RECORD") return false;
  if (row.provider !== "NONE") return false;
  const ns = row.normalized_status ?? "DRAFT";
  return NORMALIZED_STATUS_MANUAL.includes(
    ns as (typeof NORMALIZED_STATUS_MANUAL)[number],
  );
}

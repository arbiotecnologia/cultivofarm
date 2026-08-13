/**
 * Fase Fiscal 3.6 — Validação pura para reconciliação assistida.
 *
 * Regras invioláveis:
 * - Nunca alterar `accounts_receivable` ou `entregas`.
 * - Só editar `receivable_id`/`delivery_id` em `fiscal_invoices` MANUAL.
 * - `provider=NONE`, `document_origin=MANUAL_RECORD`, `locked_at=null`.
 * - Motivo obrigatório em desvínculo (10..500 chars).
 * - Nenhum `any`, nenhum upsert, nenhum DELETE.
 */
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type ReconciliationPendingRow = any;
export type FiscalInvoiceRow = any;

/** Domínios canônicos do CHECK reconciliation_status. */
export const RECONCILIATION_STATUS_VALUES = [
  "NOT_APPLICABLE",
  "PENDING",
  "RECONCILED",
  "DIVERGENT",
  "REQUIRES_REVIEW",
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUS_VALUES)[number];

export const PENDENCY_KIND_VALUES = [
  "MISSING_RECEIVABLE",
  "MISSING_DELIVERY",
  "STATUS_DIVERGENT",
  "REVIEW_REQUIRED",
] as const;
export type PendencyKind = (typeof PENDENCY_KIND_VALUES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class NonManualInvoiceError extends Error {
  constructor() {
    super("Vínculo/desvínculo permitido apenas em documento MANUAL não travado.");
    this.name = "NonManualInvoiceError";
  }
}
export class MissingUnlinkReasonError extends Error {
  constructor() {
    super("Motivo obrigatório para desvincular (≥ 10 caracteres).");
    this.name = "MissingUnlinkReasonError";
  }
}
export class ReconciliationWriteDisabledError extends Error {
  constructor() {
    super(
      "Ação de reconciliação está atrás de flag `fiscalReconciliationWrite` " +
        "(default false) até certificação de staging.",
    );
    this.name = "ReconciliationWriteDisabledError";
  }
}
export class OptimisticReconciliationConflictError extends Error {
  constructor() {
    super("Documento fiscal alterado por outra sessão. Recarregue e tente novamente.");
    this.name = "OptimisticReconciliationConflictError";
  }
}

/** Classifica a pendência a partir da view canônica, sem inventar dados. */
export function classifyPendency(row: ReconciliationPendingRow): PendencyKind {
  if (!row.receivable_id) return "MISSING_RECEIVABLE";
  if (row.reconciliation_status === "DIVERGENT") return "STATUS_DIVERGENT";
  if (row.reconciliation_status === "REQUIRES_REVIEW") return "REVIEW_REQUIRED";
  return "STATUS_DIVERGENT";
}

/** Idade da pendência em dias, aceita ISO ou null. */
export function ageInDays(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diff = now.getTime() - t;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

/** Guardas: nunca aceitar documento travado / não-manual. */
export function assertManualEditable(row: FiscalInvoiceRow): void {
  if (row.locked_at) throw new NonManualInvoiceError();
  if (row.document_origin !== "MANUAL_RECORD") throw new NonManualInvoiceError();
  if (row.provider !== "NONE") throw new NonManualInvoiceError();
}

// ————————————————————————— Schemas ———————————————————————————
export const linkSchema = z.object({
  invoiceId: z.string().regex(UUID_RE, "UUID de nota inválido"),
  target: z.enum(["receivable_id", "delivery_id"]),
  targetId: z.string().regex(UUID_RE, "UUID de vínculo inválido"),
  confirmOverwrite: z.boolean().optional().default(false),
});
export type LinkValues = z.infer<typeof linkSchema>;

export const unlinkSchema = z.object({
  invoiceId: z.string().regex(UUID_RE, "UUID de nota inválido"),
  target: z.enum(["receivable_id", "delivery_id"]),
  reason: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length >= 10 && v.length <= 500, {
      message: "Motivo deve ter entre 10 e 500 caracteres",
    }),
});
export type UnlinkValues = z.infer<typeof unlinkSchema>;

/** Whitelist EXATA de colunas atualizáveis nesta fase. */
export const LINK_UPDATE_COLUMNS = ["receivable_id", "delivery_id"] as const;

// ————————————————————————— Mascaramento ————————————————————
export function maskDocument(v: string | null | undefined): string {
  if (!v) return "—";
  const s = v.replace(/\D/g, "");
  if (s.length < 4) return "***";
  return `***${s.slice(-4)}`;
}
export function maskAccessKey(v: string | null | undefined): string {
  if (!v) return "—";
  if (v.length <= 4) return "***";
  return `${"*".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}`;
}
export function truncateId(id: string | null | undefined, n = 8): string {
  if (!id) return "—";
  return id.slice(0, n);
}

// ————————————————————————— Resumo interno ——————————————————
export interface ReconciliationSummary {
  total: number;
  byKind: Record<PendencyKind, number>;
  byModel: Record<string, number>;
  byOrigin: Record<string, number>;
  byStatus: Record<string, number>;
  ageBuckets: { fresh: number; week: number; month: number; older: number };
}

/**
 * Agrega os itens já paginados/carregados — nunca faz SELECT amplo.
 * O caller deve limitar o tamanho da amostra usada como resumo.
 */
export function summarize(
  rows: ReconciliationPendingRow[],
  ages: Array<number | null>,
): ReconciliationSummary {
  const empty: ReconciliationSummary = {
    total: rows.length,
    byKind: {
      MISSING_RECEIVABLE: 0, MISSING_DELIVERY: 0,
      STATUS_DIVERGENT: 0, REVIEW_REQUIRED: 0,
    },
    byModel: {},
    byOrigin: {},
    byStatus: {},
    ageBuckets: { fresh: 0, week: 0, month: 0, older: 0 },
  };
  rows.forEach((r, i) => {
    empty.byKind[classifyPendency(r)] += 1;
    const m = r.document_model ?? "—";
    empty.byModel[m] = (empty.byModel[m] ?? 0) + 1;
    const o = r.document_origin ?? "—";
    empty.byOrigin[o] = (empty.byOrigin[o] ?? 0) + 1;
    const s = r.reconciliation_status ?? "—";
    empty.byStatus[s] = (empty.byStatus[s] ?? 0) + 1;
    const age = ages[i];
    if (age === null || age === undefined) empty.ageBuckets.fresh += 1;
    else if (age <= 1) empty.ageBuckets.fresh += 1;
    else if (age <= 7) empty.ageBuckets.week += 1;
    else if (age <= 30) empty.ageBuckets.month += 1;
    else empty.ageBuckets.older += 1;
  });
  return empty;
}

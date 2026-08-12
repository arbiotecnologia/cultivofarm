/**
 * Fase Fiscal 3.5 — Validação pura para `fiscal_invoices` /
 * `fiscal_invoice_items` (workflow documental MANUAL e auditável).
 *
 * Contrato canônico (não inventar):
 *   src/integrations/supabase/types.ts +
 *   supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql +
 *   supabase/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql
 *
 * Regras invioláveis desta fase:
 * - `provider` SEMPRE `NONE`.
 * - `environment` restrito a `NOT_CONFIGURED` ou `HOMOLOGATION` (nunca
 *   `PRODUCTION`).
 * - `document_origin` SEMPRE `MANUAL_RECORD`.
 * - `normalized_status` restrito a estados manuais/legados
 *   (`LEGACY_RECORDED`, `DRAFT`). Estados que simulam emissão
 *   (`AUTHORIZED`, `REJECTED`, `PROCESSING`, `QUEUED`, `VALIDATING`,
 *   `READY`, `CANCELED`, `CANCEL_REQUESTED`, `SUBSTITUTED`, `ERROR`) são
 *   proibidos pela UI.
 * - Colunas de integração/emissão nunca são escritas pela UI:
 *   `access_key`, `authorized_at`, `rejected_at`, `canceled_at`,
 *   `cancel_reason`, `provider_reference`, `provider_status_raw`,
 *   `idempotency_key`, `parent_invoice_id`, `substitution_invoice_id`,
 *   `source_id`, `source_type`, `xml_document_id`, `danfe_document_id`,
 *   `company_snapshot`, `customer_snapshot`, `fiscal_totals_snapshot`,
 *   `payload_schema_version`, `locked_at`, `locked_by`.
 * - `created_by` é definido pelo hook a partir de `auth.user.id`
 *   (server-side); não vem do formulário.
 * - Nenhum `any`, nenhum cast forçado, nenhum upsert.
 */
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

// ————————————————————————— Tipos do contrato —————————————————————————
export type FiscalInvoiceRow = any;
export type FiscalInvoiceInsert = any;
export type FiscalInvoiceUpdate = any;
export type FiscalInvoiceItemRow = any;

// ————————————————————————— Domínios canônicos ————————————————————————
export const DOCUMENT_MODEL_VALUES = ["NFE", "NFSE", "OTHER"] as const;
export const INVOICE_TYPE_VALUES = ["NFE", "NFSE", "OTHER"] as const;

/** Somente ambientes seguros. `PRODUCTION` é proibido nesta fase. */
export const ENVIRONMENT_ALLOWED = ["NOT_CONFIGURED", "HOMOLOGATION"] as const;
export const ENVIRONMENT_FORBIDDEN = ["PRODUCTION"] as const;

/** Único valor aceito para provider quando origem é manual. */
export const PROVIDER_MANUAL = "NONE" as const;

/** Único valor aceito para document_origin nesta fase. */
export const DOCUMENT_ORIGIN_MANUAL = "MANUAL_RECORD" as const;

/** Estados normalizados aceitos pela UI manual. */
export const NORMALIZED_STATUS_MANUAL = ["LEGACY_RECORDED", "DRAFT"] as const;

/** Estados que a UI NUNCA pode gravar — todos simulam emissão real. */
export const NORMALIZED_STATUS_FORBIDDEN_UI = [
  "AUTHORIZED",
  "REJECTED",
  "PROCESSING",
  "QUEUED",
  "VALIDATING",
  "READY",
  "CANCELED",
  "CANCEL_REQUESTED",
  "SUBSTITUTED",
  "ERROR",
] as const;

/** Domínios canônicos do CHECK constraint (referência exaustiva). */
export const NORMALIZED_STATUS_CANONICAL = [
  "LEGACY_RECORDED",
  "DRAFT",
  "VALIDATING",
  "READY",
  "QUEUED",
  "PROCESSING",
  "AUTHORIZED",
  "REJECTED",
  "ERROR",
  "CANCEL_REQUESTED",
  "CANCELED",
  "SUBSTITUTED",
] as const;

/** Status livres aceitos pela UI manual — o schema não força CHECK em
 *  `status`, então restringimos a valores conservadores. */
export const STATUS_ALLOWED = ["DRAFT", "MANUAL", "LEGACY_RECORDED"] as const;

/** Reconciliação — domínios exatos do CHECK. */
export const RECONCILIATION_STATUS_VALUES = [
  "NOT_APPLICABLE",
  "PENDING",
  "RECONCILED",
  "DIVERGENT",
  "REQUIRES_REVIEW",
] as const;

/** event_type permitidos por `rpc_fiscal_event_manual`
 *  (fonte: migration 3.0.1, `v_allowed`). Nunca amplia. */
export const MANUAL_EVENT_TYPES = [
  "MANUAL_UPDATED",
  "RECONCILIATION_REQUIRED",
  "RECONCILIATION_COMPLETED",
] as const;
export type ManualEventType = (typeof MANUAL_EVENT_TYPES)[number];

// ————————————————————————— Erros dedicados —————————————————————————
export class ForbiddenNormalizedStatusError extends Error {
  constructor(status: string) {
    super(`normalized_status "${status}" simula emissão e é bloqueado pela UI.`);
    this.name = "ForbiddenNormalizedStatusError";
  }
}
export class ForbiddenEnvironmentError extends Error {
  constructor(env: string) {
    super(`environment "${env}" não é permitido em fase manual.`);
    this.name = "ForbiddenEnvironmentError";
  }
}
export class ForbiddenProviderError extends Error {
  constructor(provider: string) {
    super(`provider "${provider}" não é permitido — apenas NONE.`);
    this.name = "ForbiddenProviderError";
  }
}
export class InvalidManualEventTypeError extends Error {
  constructor(t: string) {
    super(`event_type "${t}" fora do conjunto manual permitido.`);
    this.name = "InvalidManualEventTypeError";
  }
}

// ————————————————————————— Utilitários ———————————————————————————————
function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Mascara qualquer JSON snapshot: nunca retorna payloads brutos. */
export function maskSnapshot(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" && v.length === 0) return "—";
  return "[snapshot mascarado]";
}

/** Mascara chaves sensíveis textuais (access_key, provider_reference, …). */
export function maskSensitiveText(v: string | null | undefined): string {
  if (!v) return "—";
  if (v.length <= 4) return "***";
  return `${"*".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}`;
}

/** Trunca uma string para exibição segura. */
export function truncate(v: string | null | undefined, max = 80): string {
  if (!v) return "—";
  return v.length <= max ? v : `${v.slice(0, max - 1)}…`;
}

// ————————————————————————— Schema do formulário ——————————————————————
const optionalTrim = z
  .string()
  .max(200)
  .optional()
  .transform((v) => (v ? v.trim() : ""))
  .transform((v) => (v === "" ? "" : v));

const optionalIsoDate = z
  .string()
  .optional()
  .transform((v) => (v ? v.trim() : ""))
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: "Data em formato AAAA-MM-DD",
  });

const optionalMoney = z
  .string()
  .optional()
  .transform((v) => (v ? v.trim() : ""))
  .refine((v) => v === "" || /^-?\d+([.,]\d{1,2})?$/.test(v), {
    message: "Valor monetário inválido",
  });

const uuidOrEmpty = z
  .string()
  .optional()
  .transform((v) => (v ? v.trim() : ""))
  .refine(
    (v) => v === "" || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    { message: "UUID inválido" },
  );

export const invoiceFormSchema = z.object({
  invoice_type: z.enum(INVOICE_TYPE_VALUES),
  document_model: z.enum(DOCUMENT_MODEL_VALUES),
  environment: z.enum(ENVIRONMENT_ALLOWED),
  status: z.enum(STATUS_ALLOWED).default("DRAFT"),
  normalized_status: z.enum(NORMALIZED_STATUS_MANUAL).default("DRAFT"),
  reconciliation_status: z.enum(RECONCILIATION_STATUS_VALUES).default("NOT_APPLICABLE"),
  invoice_number: optionalTrim,
  series: optionalTrim,
  issue_date: optionalIsoDate,
  total_amount: optionalMoney,
  company_cnpj: optionalTrim,
  notes: z.string().max(2000).optional().transform((v) => (v ? v.trim() : "")),
  receivable_id: uuidOrEmpty,
  delivery_id: uuidOrEmpty,
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

// ————————————————————————— Guards de segurança ————————————————————————
export function assertProviderManual(provider: string): void {
  if (provider !== PROVIDER_MANUAL) throw new ForbiddenProviderError(provider);
}
export function assertEnvironmentSafe(env: string): void {
  if (!ENVIRONMENT_ALLOWED.includes(env as (typeof ENVIRONMENT_ALLOWED)[number])) {
    throw new ForbiddenEnvironmentError(env);
  }
}
export function assertNormalizedStatusManual(status: string): void {
  if (
    !NORMALIZED_STATUS_MANUAL.includes(
      status as (typeof NORMALIZED_STATUS_MANUAL)[number],
    )
  ) {
    throw new ForbiddenNormalizedStatusError(status);
  }
}
export function assertManualEventType(t: string): asserts t is ManualEventType {
  if (!MANUAL_EVENT_TYPES.includes(t as ManualEventType)) {
    throw new InvalidManualEventTypeError(t);
  }
}

// ————————————————————————— Payload builders ————————————————————————
type PayloadValue = string | number | null;

function moneyOrNull(v: string): number | null {
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Whitelist EXATA de colunas gravadas pela UI (INSERT). Nenhum campo
 *  fora desta lista é permitido — qualquer regressão quebra os testes. */
export const INSERT_ALLOWED_COLUMNS = [
  "invoice_type",
  "document_model",
  "document_origin",
  "environment",
  "provider",
  "status",
  "normalized_status",
  "reconciliation_status",
  "invoice_number",
  "series",
  "issue_date",
  "total_amount",
  "company_cnpj",
  "notes",
  "receivable_id",
  "delivery_id",
  "created_by",
] as const;

/** Whitelist EXATA de colunas gravadas pela UI (UPDATE). Não inclui
 *  `created_by`, `document_origin`, `provider` (imutáveis pós-INSERT)
 *  nem qualquer campo derivado. */
export const UPDATE_ALLOWED_COLUMNS = [
  "invoice_type",
  "document_model",
  "environment",
  "status",
  "normalized_status",
  "reconciliation_status",
  "invoice_number",
  "series",
  "issue_date",
  "total_amount",
  "company_cnpj",
  "notes",
  "receivable_id",
  "delivery_id",
] as const;

export function buildInsertPayload(
  values: InvoiceFormValues,
  createdBy: string,
): FiscalInvoiceInsert {
  if (!createdBy || !/^[0-9a-f-]{36}$/i.test(createdBy)) {
    throw new Error("created_by inválido");
  }
  assertProviderManual(PROVIDER_MANUAL);
  assertEnvironmentSafe(values.environment);
  assertNormalizedStatusManual(values.normalized_status);

  const payload: Record<string, PayloadValue> = {
    invoice_type: values.invoice_type,
    document_model: values.document_model,
    document_origin: DOCUMENT_ORIGIN_MANUAL,
    environment: values.environment,
    provider: PROVIDER_MANUAL,
    status: values.status,
    normalized_status: values.normalized_status,
    reconciliation_status: values.reconciliation_status,
    created_by: createdBy,
  };
  const optionals: Array<[keyof InvoiceFormValues, string]> = [
    ["invoice_number", "invoice_number"],
    ["series", "series"],
    ["issue_date", "issue_date"],
    ["company_cnpj", "company_cnpj"],
    ["notes", "notes"],
    ["receivable_id", "receivable_id"],
    ["delivery_id", "delivery_id"],
  ];
  for (const [k, col] of optionals) {
    const v = trimOrNull(values[k]);
    if (v !== null) payload[col] = v;
  }
  const amount = moneyOrNull(values.total_amount);
  if (amount !== null) payload.total_amount = amount;
  return payload as unknown as FiscalInvoiceInsert;
}

export function buildUpdatePayload(
  values: InvoiceFormValues,
  prev: FiscalInvoiceRow,
): FiscalInvoiceUpdate {
  assertEnvironmentSafe(values.environment);
  assertNormalizedStatusManual(values.normalized_status);

  const desired: Record<string, PayloadValue> = {
    invoice_type: values.invoice_type,
    document_model: values.document_model,
    environment: values.environment,
    status: values.status,
    normalized_status: values.normalized_status,
    reconciliation_status: values.reconciliation_status,
    invoice_number: trimOrNull(values.invoice_number),
    series: trimOrNull(values.series),
    issue_date: trimOrNull(values.issue_date),
    company_cnpj: trimOrNull(values.company_cnpj),
    notes: trimOrNull(values.notes),
    receivable_id: trimOrNull(values.receivable_id),
    delivery_id: trimOrNull(values.delivery_id),
    total_amount: moneyOrNull(values.total_amount),
  };
  const diff: Record<string, PayloadValue> = {};
  for (const col of UPDATE_ALLOWED_COLUMNS) {
    const next = desired[col];
    const prevRaw = (prev as unknown as Record<string, unknown>)[col];
    const prevVal: PayloadValue =
      prevRaw === null || prevRaw === undefined
        ? null
        : typeof prevRaw === "number"
          ? prevRaw
          : typeof prevRaw === "string"
            ? prevRaw
            : null;
    if (next !== prevVal) diff[col] = next;
  }
  return diff as unknown as FiscalInvoiceUpdate;
}

export function rowToFormValues(row: FiscalInvoiceRow): InvoiceFormValues {
  const normalized = row.normalized_status ?? "DRAFT";
  const safeNormalized: (typeof NORMALIZED_STATUS_MANUAL)[number] =
    NORMALIZED_STATUS_MANUAL.includes(
      normalized as (typeof NORMALIZED_STATUS_MANUAL)[number],
    )
      ? (normalized as (typeof NORMALIZED_STATUS_MANUAL)[number])
      : "DRAFT";
  const env = row.environment ?? "NOT_CONFIGURED";
  const safeEnv: (typeof ENVIRONMENT_ALLOWED)[number] =
    ENVIRONMENT_ALLOWED.includes(env as (typeof ENVIRONMENT_ALLOWED)[number])
      ? (env as (typeof ENVIRONMENT_ALLOWED)[number])
      : "NOT_CONFIGURED";
  const status = row.status ?? "DRAFT";
  const safeStatus: (typeof STATUS_ALLOWED)[number] =
    STATUS_ALLOWED.includes(status as (typeof STATUS_ALLOWED)[number])
      ? (status as (typeof STATUS_ALLOWED)[number])
      : "DRAFT";
  const model = row.document_model ?? "OTHER";
  const safeModel: (typeof DOCUMENT_MODEL_VALUES)[number] =
    DOCUMENT_MODEL_VALUES.includes(model as (typeof DOCUMENT_MODEL_VALUES)[number])
      ? (model as (typeof DOCUMENT_MODEL_VALUES)[number])
      : "OTHER";
  const invType = INVOICE_TYPE_VALUES.includes(
    row.invoice_type as (typeof INVOICE_TYPE_VALUES)[number],
  )
    ? (row.invoice_type as (typeof INVOICE_TYPE_VALUES)[number])
    : "OTHER";
  const recon = row.reconciliation_status ?? "NOT_APPLICABLE";
  const safeRecon: (typeof RECONCILIATION_STATUS_VALUES)[number] =
    RECONCILIATION_STATUS_VALUES.includes(
      recon as (typeof RECONCILIATION_STATUS_VALUES)[number],
    )
      ? (recon as (typeof RECONCILIATION_STATUS_VALUES)[number])
      : "NOT_APPLICABLE";
  return {
    invoice_type: invType,
    document_model: safeModel,
    environment: safeEnv,
    status: safeStatus,
    normalized_status: safeNormalized,
    reconciliation_status: safeRecon,
    invoice_number: row.invoice_number ?? "",
    series: row.series ?? "",
    issue_date: row.issue_date ? row.issue_date.slice(0, 10) : "",
    total_amount: row.total_amount === null || row.total_amount === undefined ? "" : String(row.total_amount),
    company_cnpj: row.company_cnpj ?? "",
    notes: row.notes ?? "",
    receivable_id: row.receivable_id ?? "",
    delivery_id: row.delivery_id ?? "",
  };
}

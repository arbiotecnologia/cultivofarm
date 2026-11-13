/**
 * Fase Fiscal 3.3 — Validação pura para `service_fiscal_profiles`.
 *
 * Contrato: `src/integrations/supabase/cultivofarm.types.ts` +
 * migrations canônicas 20260721000000 / 20260722000000.
 *
 * Regras específicas de serviços:
 * - NÃO existe catálogo canônico de serviços. `service_id` é `uuid | null`
 *   SEM FK; `source_reference` é a referência transitória.
 * - CHECK real: `service_id IS NOT NULL OR NULLIF(btrim(source_reference), '') IS NOT NULL`.
 * - Índices únicos ativos:
 *     · (service_id) WHERE service_id IS NOT NULL AND is_active
 *     · (lower(btrim(source_reference))) WHERE source_reference é não vazio
 *       AND is_active
 * - CNAE: 7 dígitos quando preenchido (regra real do domínio; schema
 *   armazena `text`).
 * - IBGE (incidence_municipality_ibge_code): 7 dígitos quando preenchido.
 * - ISS rate: numeric(6,4), aceitamos 0..100 (percentual real).
 * - profile_status CHECK: DRAFT | PENDING_ACCOUNTING | VALIDATED | BLOCKED
 *   | NOT_FISCALLY_BILLED. Não é editado pela tela nesta fase.
 * - Nenhuma emissão. Nenhum campo fora do contrato.
 */
import { z } from "zod";
import { mergeFederalDefaults } from "./serviceNfseDpsForm";
import type { Database } from "@/integrations/supabase/cultivofarm.types";

export type ServiceFiscalRow = any;
export type ServiceFiscalInsert = any;
export type ServiceFiscalUpdate = any;

// ————————————————————————— Normalizadores —————————————————————————
export function digitsOnly(v: string | null | undefined): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : "";
}

/** Chave canônica de deduplicação de `source_reference` (equivale a
 *  `lower(btrim(source_reference))` do índice único parcial). */
export function normalizeSourceReferenceKey(
  v: string | null | undefined,
): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/** Aplica `btrim` no `source_reference` para persistência. Retorna `null`
 *  quando vazio após o trim — a UI decide se rejeita ou não. */
export function trimmedSourceReference(
  v: string | null | undefined,
): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function digitsField(len: number, label: string) {
  return z
    .string()
    .transform((v) => digitsOnly(v))
    .refine((v) => v === "" || v.length === len, {
      message: `${label} deve conter exatamente ${len} dígitos`,
    });
}

// ————————————————————————— Form schema —————————————————————————
// Campos editáveis pela tela. `service_id` e `source_reference` são
// tratados fora deste schema porque governam identidade/unicidade.
export const serviceFiscalFormSchema = z.object({
  service_name: z.string().trim().max(200).optional().default(""),
  fiscal_description_template: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default(""),
  lc116_item: z.string().trim().max(20).optional().default(""),
  cnae: digitsField(7, "CNAE").optional().default(""),
  national_taxation_code: z.string().trim().max(20).optional().default(""),
  municipal_taxation_code: z.string().trim().max(20).optional().default(""),
  incidence_municipality_ibge_code: digitsField(7, "Município IBGE")
    .optional()
    .default(""),
  requirement_status: z.string().trim().max(60).optional().default(""),
  iss_rate: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine(
      (v) => {
        if (v === "") return true;
        const n = Number(v.replace(",", "."));
        return Number.isFinite(n) && n >= 0 && n <= 100;
      },
      { message: "Alíquota ISS deve estar entre 0 e 100" },
    ),
  iss_withheld_default: z.boolean().optional().default(false),
  accounting_notes: z.string().trim().max(2000).optional().default(""),
});

export type ServiceFiscalFormValues = z.infer<typeof serviceFiscalFormSchema> & {
  /** Complemento DPS NFS-e Nacional; `undefined` = não alterar, `null` = remover. */
  nfse_dps?: import("../../../supabase/functions/_shared/nfse/dpsProfile").NfseDpsProfile | null;
};

// ————————————————————— Row → Form defaults —————————————————————
export function rowToFormValues(
  row: ServiceFiscalRow | null,
): ServiceFiscalFormValues {
  return {
    service_name: row?.service_name ?? "",
    fiscal_description_template: row?.fiscal_description_template ?? "",
    lc116_item: row?.lc116_item ?? "",
    cnae: row?.cnae ?? "",
    national_taxation_code: row?.national_taxation_code ?? "",
    municipal_taxation_code: row?.municipal_taxation_code ?? "",
    incidence_municipality_ibge_code:
      row?.incidence_municipality_ibge_code ?? "",
    requirement_status: row?.requirement_status ?? "",
    iss_rate: row?.iss_rate != null ? String(row.iss_rate) : "",
    iss_withheld_default: row?.iss_withheld_default ?? false,
    accounting_notes: row?.accounting_notes ?? "",
  };
}

// ————————————————————— Payload builders —————————————————————
type StringFieldKey =
  | "service_name"
  | "fiscal_description_template"
  | "lc116_item"
  | "cnae"
  | "national_taxation_code"
  | "municipal_taxation_code"
  | "incidence_municipality_ibge_code"
  | "requirement_status"
  | "accounting_notes";

const STRING_FIELDS: StringFieldKey[] = [
  "service_name",
  "fiscal_description_template",
  "lc116_item",
  "cnae",
  "national_taxation_code",
  "municipal_taxation_code",
  "incidence_municipality_ibge_code",
  "requirement_status",
  "accounting_notes",
];

function stringForPayload(
  key: StringFieldKey,
  value: string,
): string | null {
  if (value === "") return null;
  if (key === "cnae" || key === "incidence_municipality_ibge_code") {
    return digitsOnly(value);
  }
  return value;
}

function parseIssRate(v: string): number | null {
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Identidade do registro: retorna `service_id` (se válido) e/ou
 *  `source_reference` já com `btrim`. Nunca gera UUID fictício. */
export interface ServiceIdentity {
  service_id: string | null;
  source_reference: string | null;
}

export function buildIdentity(input: {
  service_id?: string | null;
  source_reference?: string | null;
}): ServiceIdentity {
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const sid =
    typeof input.service_id === "string" && uuidLike.test(input.service_id)
      ? input.service_id
      : null;
  const ref = trimmedSourceReference(input.source_reference);
  return { service_id: sid, source_reference: ref };
}

/** Erro tipado usado pelos hooks quando identidade obrigatória falha. */
export class MissingServiceIdentifierError extends Error {
  constructor() {
    super("missing_service_identifier");
    this.name = "MissingServiceIdentifierError";
  }
}

export function assertIdentity(identity: ServiceIdentity): void {
  if (!identity.service_id && !identity.source_reference) {
    throw new MissingServiceIdentifierError();
  }
}

/**
 * INSERT payload: exige identidade válida. Envia apenas campos
 * preenchidos e nunca inclui `id`, timestamps ou colunas de sistema.
 */
export function buildInsertPayload(
  identity: ServiceIdentity,
  values: ServiceFiscalFormValues,
): ServiceFiscalInsert {
  assertIdentity(identity);
  const payload: ServiceFiscalInsert = {};
  if (identity.service_id) payload.service_id = identity.service_id;
  if (identity.source_reference) payload.source_reference = identity.source_reference;
  for (const key of STRING_FIELDS) {
    const next = stringForPayload(key, values[key] ?? "");
    if (next !== null) {
      (payload as Record<string, unknown>)[key] = next;
    }
  }
  const iss = parseIssRate(values.iss_rate ?? "");
  if (iss !== null) payload.iss_rate = iss;
  // iss_withheld_default tem default no schema; só enviamos se `true`.
  if (values.iss_withheld_default === true) {
    payload.iss_withheld_default = true;
  }
  if (values.nfse_dps) {
    payload.federal_withholding_defaults = mergeFederalDefaults(null, values.nfse_dps);
  }
  return payload;
}

/**
 * UPDATE payload diff-only. Nunca inclui `id`/timestamps/flags de sistema.
 * `service_id` só é enviado se o usuário informar um valor DIFERENTE do
 * atual e válido; o mesmo vale para `source_reference` (com `btrim`).
 */
export function buildUpdatePayload(
  values: ServiceFiscalFormValues,
  current: ServiceFiscalRow,
  identity?: ServiceIdentity,
): ServiceFiscalUpdate {
  const payload: ServiceFiscalUpdate = {};
  for (const key of STRING_FIELDS) {
    const next = stringForPayload(key, values[key] ?? "");
    const prev = (current[key] ?? null) as string | null;
    if (next !== prev) {
      (payload as Record<string, unknown>)[key] = next;
    }
  }
  const nextIss = parseIssRate(values.iss_rate ?? "");
  const prevIss = current.iss_rate ?? null;
  if (nextIss !== prevIss) payload.iss_rate = nextIss;
  if (values.iss_withheld_default !== current.iss_withheld_default) {
    payload.iss_withheld_default = values.iss_withheld_default;
  }
  if (values.nfse_dps !== undefined) {
    const next = mergeFederalDefaults(current.federal_withholding_defaults, values.nfse_dps);
    if (JSON.stringify(next) !== JSON.stringify(current.federal_withholding_defaults ?? null)) {
      payload.federal_withholding_defaults = next;
    }
  }
  if (identity) {
    if (identity.service_id !== (current.service_id ?? null)) {
      payload.service_id = identity.service_id;
    }
    if (identity.source_reference !== (current.source_reference ?? null)) {
      payload.source_reference = identity.source_reference;
    }
  }
  return payload;
}

/**
 * Fase Fiscal 3.4 — Validação pura para `customer_fiscal_profiles`.
 *
 * Contrato canônico: `src/integrations/supabase/types.ts` +
 * `supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql` +
 * `supabase/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql`.
 *
 * Regras específicas de clientes:
 * - Identidade única = `customer_id` (FK real para `clientes.id`, unique).
 * - Não existe coluna de documento no perfil: o CPF/CNPJ vive somente em
 *   `clientes.cpf_cnpj`. O perfil NÃO duplica documento.
 * - `profile_status` CHECK: INCOMPLETE | PENDING_REVIEW | VALIDATED | BLOCKED.
 *   Não é editado pela tela nesta fase; controlado por fluxos contábeis.
 * - `fiscal_municipality_ibge_code`: 7 dígitos quando preenchido.
 * - `country_code`: default 'BR'; texto livre no schema, limitado a 3 chars
 *   pela UI (ISO alfa-2/alfa-3).
 * - `taxpayer_indicator`: schema sem CHECK; UI oferece domínios canônicos NF-e
 *   ('1'=Contribuinte ICMS, '2'=Contribuinte isento, '9'=Não contribuinte).
 * - Nenhuma emissão. Nenhum campo fora do contrato.
 */
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type CustomerFiscalRow =
  Database["public"]["Tables"]["customer_fiscal_profiles"]["Row"];
export type CustomerFiscalInsert =
  Database["public"]["Tables"]["customer_fiscal_profiles"]["Insert"];
export type CustomerFiscalUpdate =
  Database["public"]["Tables"]["customer_fiscal_profiles"]["Update"];

// ————————————————————————— Normalizadores —————————————————————————
export function digitsOnly(v: string | null | undefined): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : "";
}

/** Máscara de CPF/CNPJ para exibição. Nunca expõe o documento completo.
 *  Aceita:
 *   - CPF numérico de 11 dígitos → `***.***.***-DD`
 *   - CNPJ numérico de 14 dígitos → `**.***.***/****-DD`
 *   - CNPJ alfanumérico (IN RFB 2.229/2024): 12 posições alfanuméricas
 *     (A–Z/0–9 em maiúsculas) + 2 DVs numéricos → `**.***.***/****-DD`
 *  Só os 2 dígitos verificadores finais são revelados.
 *  Documento inválido retorna `***`. Não usa `digitsOnly` antes de
 *  identificar o formato — letras válidas seriam destruídas. */
export function maskDocument(doc: string | null | undefined): string {
  if (typeof doc !== "string" || doc.length === 0) return "***";
  // Normalização mínima: remove separadores usuais e força uppercase,
  // sem descartar letras (necessário para CNPJ alfanumérico).
  const norm = doc.replace(/[\s.\-/]/g, "").toUpperCase();
  // CPF numérico (11).
  if (/^\d{11}$/.test(norm)) {
    return `***.***.***-${norm.slice(-2)}`;
  }
  // CNPJ 14 chars: 12 alfanuméricos + 2 dígitos verificadores.
  if (/^[0-9A-Z]{12}\d{2}$/.test(norm)) {
    return `**.***.***/****-${norm.slice(-2)}`;
  }
  return "***";
}

function digitsField(len: number, label: string) {
  return z
    .string()
    .transform((v) => digitsOnly(v))
    .refine((v) => v === "" || v.length === len, {
      message: `${label} deve conter exatamente ${len} dígitos`,
    });
}

/** Domínios canônicos para `taxpayer_indicator` (NF-e indIEDest). O schema
 *  não força CHECK; a UI restringe. `""` = não informado. */
export const TAXPAYER_INDICATOR_VALUES = ["1", "2", "9"] as const;
export type TaxpayerIndicator = (typeof TAXPAYER_INDICATOR_VALUES)[number];

// ————————————————————————— Form schema —————————————————————————
// Campos editáveis pela tela — subconjunto seguro. `id`, `customer_id`,
// `profile_status`, `validation_notes` e timestamps NÃO estão aqui.
export const customerFiscalFormSchema = z.object({
  taxpayer_indicator: z
    .string()
    .trim()
    .max(1)
    .refine(
      (v) => v === "" || (TAXPAYER_INDICATOR_VALUES as readonly string[]).includes(v),
      { message: "Indicador de contribuinte inválido" },
    )
    .optional()
    .default(""),
  state_registration_status: z.string().trim().max(30).optional().default(""),
  municipal_registration: z.string().trim().max(30).optional().default(""),
  fiscal_email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .default("")
    .refine(
      (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      { message: "E-mail fiscal inválido" },
    ),
  fiscal_phone: z.string().trim().max(30).optional().default(""),
  use_main_address: z.boolean().optional().default(true),
  fiscal_postal_code: z.string().trim().max(15).optional().default(""),
  fiscal_street: z.string().trim().max(200).optional().default(""),
  fiscal_number: z.string().trim().max(20).optional().default(""),
  fiscal_complement: z.string().trim().max(100).optional().default(""),
  fiscal_neighborhood: z.string().trim().max(120).optional().default(""),
  fiscal_city: z.string().trim().max(120).optional().default(""),
  fiscal_municipality_ibge_code: digitsField(7, "Município IBGE")
    .optional()
    .default(""),
  fiscal_state: z.string().trim().max(2).optional().default(""),
  country_code: z.string().trim().max(3).optional().default(""),
  rural_producer_indicator: z.boolean().optional().default(false),
  foreign_customer_indicator: z.boolean().optional().default(false),
});

export type CustomerFiscalFormValues = z.infer<typeof customerFiscalFormSchema>;

// ————————————————————— Row → Form defaults —————————————————————
export function rowToFormValues(
  row: CustomerFiscalRow | null,
): CustomerFiscalFormValues {
  return {
    taxpayer_indicator: row?.taxpayer_indicator ?? "",
    state_registration_status: row?.state_registration_status ?? "",
    municipal_registration: row?.municipal_registration ?? "",
    fiscal_email: row?.fiscal_email ?? "",
    fiscal_phone: row?.fiscal_phone ?? "",
    use_main_address: row?.use_main_address ?? true,
    fiscal_postal_code: row?.fiscal_postal_code ?? "",
    fiscal_street: row?.fiscal_street ?? "",
    fiscal_number: row?.fiscal_number ?? "",
    fiscal_complement: row?.fiscal_complement ?? "",
    fiscal_neighborhood: row?.fiscal_neighborhood ?? "",
    fiscal_city: row?.fiscal_city ?? "",
    fiscal_municipality_ibge_code: row?.fiscal_municipality_ibge_code ?? "",
    fiscal_state: row?.fiscal_state ?? "",
    country_code: row?.country_code ?? "",
    rural_producer_indicator: row?.rural_producer_indicator ?? false,
    foreign_customer_indicator: row?.foreign_customer_indicator ?? false,
  };
}

// ————————————————————— Payload builders —————————————————————
type StringFieldKey =
  | "taxpayer_indicator"
  | "state_registration_status"
  | "municipal_registration"
  | "fiscal_email"
  | "fiscal_phone"
  | "fiscal_postal_code"
  | "fiscal_street"
  | "fiscal_number"
  | "fiscal_complement"
  | "fiscal_neighborhood"
  | "fiscal_city"
  | "fiscal_municipality_ibge_code"
  | "fiscal_state"
  | "country_code";

const STRING_FIELDS: StringFieldKey[] = [
  "taxpayer_indicator",
  "state_registration_status",
  "municipal_registration",
  "fiscal_email",
  "fiscal_phone",
  "fiscal_postal_code",
  "fiscal_street",
  "fiscal_number",
  "fiscal_complement",
  "fiscal_neighborhood",
  "fiscal_city",
  "fiscal_municipality_ibge_code",
  "fiscal_state",
  "country_code",
];

type BooleanFieldKey =
  | "use_main_address"
  | "rural_producer_indicator"
  | "foreign_customer_indicator";

const BOOLEAN_FIELDS: BooleanFieldKey[] = [
  "use_main_address",
  "rural_producer_indicator",
  "foreign_customer_indicator",
];

function stringForPayload(
  key: StringFieldKey,
  value: string,
): string | null {
  if (value === "") return null;
  if (key === "fiscal_municipality_ibge_code") return digitsOnly(value);
  if (key === "fiscal_state") return value.toUpperCase();
  if (key === "country_code") return value.toUpperCase();
  return value;
}

/** Erro tipado usado pelos hooks quando `customer_id` falha. */
export class MissingCustomerIdError extends Error {
  constructor() {
    super("missing_customer_id");
    this.name = "MissingCustomerIdError";
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertCustomerId(customerId: string | null | undefined): asserts customerId is string {
  if (typeof customerId !== "string" || !UUID_RE.test(customerId)) {
    throw new MissingCustomerIdError();
  }
}

/**
 * INSERT payload: exige `customer_id` válido. Envia apenas campos
 * preenchidos e nunca inclui `id`, timestamps ou colunas de sistema.
 * Booleans só são enviados quando diferem dos defaults do schema.
 */
export function buildInsertPayload(
  customerId: string,
  values: CustomerFiscalFormValues,
): CustomerFiscalInsert {
  assertCustomerId(customerId);
  const payload: CustomerFiscalInsert = { customer_id: customerId };
  for (const key of STRING_FIELDS) {
    const next = stringForPayload(key, values[key] ?? "");
    if (next !== null) {
      (payload as Record<string, unknown>)[key] = next;
    }
  }
  // Defaults do schema: use_main_address=true, rural=false, foreign=false.
  if (values.use_main_address === false) payload.use_main_address = false;
  if (values.rural_producer_indicator === true) payload.rural_producer_indicator = true;
  if (values.foreign_customer_indicator === true) payload.foreign_customer_indicator = true;
  return payload;
}

/**
 * UPDATE payload diff-only. Nunca inclui `id`, `customer_id`, timestamps,
 * `profile_status`, `validation_notes` ou `created_by`/`updated_by`.
 */
export function buildUpdatePayload(
  values: CustomerFiscalFormValues,
  current: CustomerFiscalRow,
): CustomerFiscalUpdate {
  const payload: CustomerFiscalUpdate = {};
  for (const key of STRING_FIELDS) {
    const next = stringForPayload(key, values[key] ?? "");
    const prev = (current[key] ?? null) as string | null;
    if (next !== prev) {
      (payload as Record<string, unknown>)[key] = next;
    }
  }
  for (const key of BOOLEAN_FIELDS) {
    const next = values[key];
    const prev = current[key];
    if (typeof next === "boolean" && next !== prev) {
      (payload as Record<string, unknown>)[key] = next;
    }
  }
  return payload;
}

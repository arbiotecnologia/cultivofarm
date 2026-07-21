/**
 * Fase Fiscal 3.1 — Validação pura para `company_fiscal_settings`.
 *
 * Fonte do contrato: `src/integrations/supabase/types.ts` (derivado das
 * migrations canônicas 20260721000000 / 20260721010000 / 20260722000000).
 *
 * REGRAS DE SEGURANÇA aplicadas nesta camada:
 * - `fiscal_provider` SEMPRE `NONE` no payload.
 * - `production_enabled` NUNCA aparece no payload (não editável pela UI).
 * - `fiscal_environment` restrito a `NOT_CONFIGURED` ou `HOMOLOGATION`.
 * - `configuration_status` restrito a `DRAFT` ou `PENDING_ACCOUNTING`
 *   (validação contábil é feita fora da UI).
 * - Nenhum campo de credencial/certificado/token é aceito.
 */
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type Row = Database["public"]["Tables"]["company_fiscal_settings"]["Row"];
type Update = Database["public"]["Tables"]["company_fiscal_settings"]["Update"];

// —————————————————————————————————————————————————————————————
// CNPJ — validação algorítmica (mod-11), sem chamadas externas.
// —————————————————————————————————————————————————————————————
export function normalizeCnpj(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeCnpj(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (base: string, weights: number[]): number => {
    const sum = base
      .split("")
      .reduce((acc, digit, idx) => acc + Number(digit) * weights[idx], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const base = cnpj.slice(0, 12);
  const d1 = calc(base, w1);
  const d2 = calc(base + d1, w2);
  return cnpj.endsWith(`${d1}${d2}`);
}

// —————————————————————————————————————————————————————————————
// Enums permitidos NESTA fase (subconjunto seguro dos CHECKs canônicos).
// —————————————————————————————————————————————————————————————
export const ALLOWED_ENVIRONMENTS = ["NOT_CONFIGURED", "HOMOLOGATION"] as const;
export const ALLOWED_STATUSES = ["DRAFT", "PENDING_ACCOUNTING"] as const;
export const LOCKED_PROVIDER = "NONE" as const;

export type AllowedEnvironment = (typeof ALLOWED_ENVIRONMENTS)[number];
export type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

// —————————————————————————————————————————————————————————————
// Schema do formulário (o que a UI aceita).
// Cada campo é opcional/nullable — a UI não pode apagar dados existentes
// silenciosamente. Ausência = manter valor no banco (`omit` no payload).
// —————————————————————————————————————————————————————————————
const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const optionalCnpj = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .refine((v) => v === null || isValidCnpj(v), { message: "CNPJ inválido." })
  .optional();

export const companyFiscalFormSchema = z.object({
  cnpj: optionalCnpj,
  legal_name: optionalTrimmedString(200),
  trade_name: optionalTrimmedString(200),
  fiscal_email: z
    .string()
    .trim()
    .max(255)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "E-mail inválido.",
    })
    .optional(),
  phone: optionalTrimmedString(40),
  tax_regime: optionalTrimmedString(60),
  crt: optionalTrimmedString(20),
  primary_cnae: optionalTrimmedString(20),
  municipal_registration: optionalTrimmedString(40),
  state_registration: optionalTrimmedString(40),
  municipality_ibge_code: optionalTrimmedString(10),
  postal_code: optionalTrimmedString(20),
  street: optionalTrimmedString(200),
  number: optionalTrimmedString(20),
  complement: optionalTrimmedString(120),
  neighborhood: optionalTrimmedString(120),
  city: optionalTrimmedString(120),
  state: optionalTrimmedString(10),
  country_code: optionalTrimmedString(4),
  fiscal_environment: z.enum(ALLOWED_ENVIRONMENTS).optional(),
  configuration_status: z.enum(ALLOWED_STATUSES).optional(),
  nfe_enabled: z.boolean().optional(),
  nfse_enabled: z.boolean().optional(),
  nfe_series: optionalTrimmedString(20),
  nfse_series: optionalTrimmedString(20),
});

export type CompanyFiscalFormValues = z.infer<typeof companyFiscalFormSchema>;

/**
 * Campos que a UI NUNCA envia — trava explícita contra emissão.
 * Auditar `buildUpdatePayload` para garantir que nenhum destes vaze.
 */
export const FORBIDDEN_PAYLOAD_KEYS = [
  "production_enabled",
  "id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "accounting_validated_at",
  "accounting_validated_by",
  "is_active",
] as const;

/**
 * Constrói o payload de UPDATE idempotente.
 * - Omite chaves ausentes/undefined (preserva valores existentes).
 * - Força `fiscal_provider = 'NONE'`.
 * - Nunca inclui `production_enabled` nem colunas de auditoria/sistema.
 */
export function buildUpdatePayload(values: CompanyFiscalFormValues): Update {
  const parsed = companyFiscalFormSchema.parse(values);
  const payload: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(parsed)) {
    if (val === undefined) continue;
    if ((FORBIDDEN_PAYLOAD_KEYS as readonly string[]).includes(key)) continue;
    if (key === "cnpj" && typeof val === "string") {
      payload.cnpj = normalizeCnpj(val);
      continue;
    }
    payload[key] = val;
  }

  // Trava: provider sempre NONE nesta fase.
  payload.fiscal_provider = LOCKED_PROVIDER;
  return payload as Update;
}

/**
 * Extrai valores iniciais do formulário a partir de uma Row real (ou vazio).
 */
export function rowToFormValues(row: Row | null): CompanyFiscalFormValues {
  if (!row) {
    return {
      fiscal_environment: "NOT_CONFIGURED",
      configuration_status: "DRAFT",
      nfe_enabled: false,
      nfse_enabled: false,
    };
  }
  const env = (ALLOWED_ENVIRONMENTS as readonly string[]).includes(row.fiscal_environment)
    ? (row.fiscal_environment as AllowedEnvironment)
    : "NOT_CONFIGURED";
  const status = (ALLOWED_STATUSES as readonly string[]).includes(row.configuration_status)
    ? (row.configuration_status as AllowedStatus)
    : "DRAFT";

  return {
    cnpj: row.cnpj ?? undefined,
    legal_name: row.legal_name ?? undefined,
    trade_name: row.trade_name ?? undefined,
    fiscal_email: row.fiscal_email ?? undefined,
    phone: row.phone ?? undefined,
    tax_regime: row.tax_regime ?? undefined,
    crt: row.crt ?? undefined,
    primary_cnae: row.primary_cnae ?? undefined,
    municipal_registration: row.municipal_registration ?? undefined,
    state_registration: row.state_registration ?? undefined,
    municipality_ibge_code: row.municipality_ibge_code ?? undefined,
    postal_code: row.postal_code ?? undefined,
    street: row.street ?? undefined,
    number: row.number ?? undefined,
    complement: row.complement ?? undefined,
    neighborhood: row.neighborhood ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    country_code: row.country_code ?? undefined,
    fiscal_environment: env,
    configuration_status: status,
    nfe_enabled: row.nfe_enabled,
    nfse_enabled: row.nfse_enabled,
    nfe_series: row.nfe_series ?? undefined,
    nfse_series: row.nfse_series ?? undefined,
  };
}

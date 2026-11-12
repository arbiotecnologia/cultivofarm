/**
 * Fase Fiscal 3.15 — Validação da Central de Configuração Fiscal.
 *
 * SEGURANÇA:
 * - `production_enabled` NUNCA aparece no payload.
 * - Refs (`nfe_credential_ref`, `nfse_credential_ref`, `certificate_ref`,
 *   `webhook_ref`) aceitam apenas identificadores curtos. Nenhum valor
 *   de credencial, token ou certificado.
 * - `nfe_configuration` / `nfse_configuration` / `last_validation_summary`
 *   são rejeitados recursivamente se contiverem chaves sensíveis.
 * - `fiscal_environment` limitado a NOT_CONFIGURED / HOMOLOGATION.
 * - Estados contábeis refletem o banco; salvar nunca altera sua revisão.
 * - `nfe_provider` / `nfse_provider` são configuráveis mas NÃO autorizam
 *   conexão nem emissão.
 * - `fiscal_provider` legacy permanece `NONE`.
 */
import { z } from "zod";
import { PIS_COFINS_REGIMES } from "./companyAccreditations";
import type { Database, Json } from "@/integrations/supabase/cultivofarm.types";

type CompanyFiscalExtraColumns = {
  fiscal_email?: string | null;
  phone?: string | null;
  tax_regime?: string | null;
  crt?: string | null;
  primary_cnae?: string | null;
  uf_accreditations?: Json;
  pis_cofins_regime?: string | null;
  additional_cnaes?: string[] | null;
  municipal_registration?: string | null;
  state_registration?: string | null;
  municipality_ibge_code?: string | null;
  postal_code?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  country_code?: string | null;
  fiscal_environment?: string | null;
  fiscal_provider?: string | null;
  nfe_enabled?: boolean | null;
  nfse_enabled?: boolean | null;
  production_enabled?: boolean | null;
  accounting_validated_at?: string | null;
  nfe_series?: string | null;
  nfe_series_number?: number | null;
  nfe_environment_code?: string | null;
  nfse_series?: string | null;
  nfe_configuration?: Json | null;
  nfse_configuration?: Json | null;
  nfe_provider?: string | null;
  nfse_provider?: string | null;
  nfe_credential_ref?: string | null;
  nfse_credential_ref?: string | null;
  certificate_ref?: string | null;
  webhook_ref?: string | null;
  configuration_notes?: string | null;
  last_validation_at?: string | null;
  last_validation_status?: string | null;
  last_validation_summary?: Json | null;
};

type Row = Database["public"]["Tables"]["company_fiscal_settings"]["Row"] & CompanyFiscalExtraColumns;
type Update = Database["public"]["Tables"]["company_fiscal_settings"]["Update"] & CompanyFiscalExtraColumns;

import { unmaskCnpjAlpha, validateCnpjAlpha } from "./cnpjAlpha";

// CNPJ — Fase 3.19: aceita numérico E alfanumérico (RFB IN 2.229/2024).
// NÃO remove letras: apenas pontuação/espaços + uppercase.
export function normalizeCnpj(value: string): string {
  return unmaskCnpjAlpha(value);
}
export function isValidCnpj(value: string): boolean {
  return validateCnpjAlpha(value);
}


// Enums ---------------------------------------------------------------
export const ALLOWED_ENVIRONMENTS = ["NOT_CONFIGURED", "HOMOLOGATION"] as const;
export const ALLOWED_STATUSES = ["DRAFT", "PENDING_ACCOUNTING", "VALIDATED", "BLOCKED"] as const;
export const ALLOWED_PROVIDERS = [
  "NONE", "NOT_CONFIGURED", "FOCUS_NFE", "PLUGNOTAS",
  "SEFAZ_DIRETO", "NFSE_NACIONAL", "MUNICIPAL", "OTHER_FUTURE",
] as const;
export const LOCKED_PROVIDER = "NONE" as const;

export type AllowedEnvironment = (typeof ALLOWED_ENVIRONMENTS)[number];
export type AllowedStatus = (typeof ALLOWED_STATUSES)[number];
export type AllowedProvider = (typeof ALLOWED_PROVIDERS)[number];

// Sensitive-key scanner ----------------------------------------------
export const SENSITIVE_JSON_KEYS = [
  "token", "password", "senha", "secret", "api_key", "apikey",
  "private_key", "privatekey", "pfx", "p12",
  "certificate_content", "certificate_pem", "pem",
  "authorization", "bearer",
];

export function hasSensitiveKey(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(hasSensitiveKey);
  if (typeof value === "object") {
    for (const k of Object.keys(value as Record<string, unknown>)) {
      if (SENSITIVE_JSON_KEYS.includes(k.toLowerCase())) return true;
      if (hasSensitiveKey((value as Record<string, unknown>)[k])) return true;
    }
  }
  return false;
}

// Helpers -------------------------------------------------------------
const optionalTrimmedString = (max: number) =>
  z.string().trim().max(max).transform((v) => (v.length === 0 ? null : v)).nullable().optional();

const optionalCnpj = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .refine((v) => v === null || isValidCnpj(v), { message: "CNPJ inválido." })
  .optional();

const REF_REGEX = /^[A-Za-z0-9_.:\-]+$/;
const refField = z
  .string()
  .trim()
  .max(120)
  .refine((v) => v === "" || REF_REGEX.test(v), {
    message: "Use apenas identificadores (sem URLs, sem credenciais).",
  })
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional();

// Sub-schemas ---------------------------------------------------------
export const NFE_FINALIDADES = ["NORMAL", "COMPLEMENTARY", "ADJUSTMENT", "RETURN"] as const;
export const NFE_NUMBERING_MODES = ["MANUAL_REFERENCE", "PROVIDER_MANAGED"] as const;
export const NFE_DANFE_LAYOUTS = ["PORTRAIT", "LANDSCAPE"] as const;
export const NFE_CONTINGENCIA = ["DISABLED", "EPEC", "FUTURE"] as const;
export const NFSE_MODES = ["NFSE_NACIONAL", "MUNICIPAL"] as const;

export const nfeConfigurationSchema = z
  .object({
    enabled_for_preparation: z.boolean().optional(),
    environment: z.enum(ALLOWED_ENVIRONMENTS).optional(),
    series: optionalTrimmedString(20),
    numbering_mode: z.enum(NFE_NUMBERING_MODES).optional(),
    default_nature: optionalTrimmedString(200),
    custom_operation_natures: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
    default_finality: z.enum(NFE_FINALIDADES).optional(),
    presence_indicator: optionalTrimmedString(20),
    default_end_consumer: z.boolean().optional(),
    freight_modality: optionalTrimmedString(20),
    danfe_layout: z.enum(NFE_DANFE_LAYOUTS).optional(),
    send_email_after_authorization: z.boolean().optional(),
    contingency_mode: z.enum(NFE_CONTINGENCIA).optional(),
    suggested_cfop_in_state: optionalTrimmedString(10),
    suggested_cfop_interstate: optionalTrimmedString(10),
    default_additional_info: optionalTrimmedString(2000),
  })
  .passthrough()
  .refine((v) => !hasSensitiveKey(v), { message: "Conteúdo sensível não é permitido." });

export const nfseConfigurationSchema = z
  .object({
    enabled_for_preparation: z.boolean().optional(),
    environment: z.enum(ALLOWED_ENVIRONMENTS).optional(),
    mode: z.enum(NFSE_MODES).optional(),
    municipality_ibge_code: optionalTrimmedString(10),
    municipal_registration: optionalTrimmedString(40),
    series: optionalTrimmedString(20),
    rps_series: optionalTrimmedString(20),
    rps_type: optionalTrimmedString(20),
    national_taxation_code: optionalTrimmedString(20),
    municipal_taxation_code: optionalTrimmedString(20),
    lc116_item: optionalTrimmedString(20),
    cnae: optionalTrimmedString(20),
    iss_rate: z.number().min(0).max(100).optional(),
    iss_withheld_default: z.boolean().optional(),
    special_taxation_regime: optionalTrimmedString(60),
    fiscal_incentive: z.boolean().optional(),
    operation_nature: optionalTrimmedString(200),
    deductions_default: z.number().min(0).optional(),
    default_service_description: optionalTrimmedString(2000),
    send_email_after_authorization: z.boolean().optional(),
  })
  .passthrough()
  .refine((v) => !hasSensitiveKey(v), { message: "Conteúdo sensível não é permitido." });

export const integrationRefsSchema = z
  .object({
    nfe_provider: z.enum(ALLOWED_PROVIDERS).optional(),
    nfse_provider: z.enum(ALLOWED_PROVIDERS).optional(),
    nfe_credential_ref: refField,
    nfse_credential_ref: refField,
    certificate_ref: refField,
    webhook_ref: refField,
    configuration_notes: optionalTrimmedString(4000),
  })
  .strict();

// Form schema --------------------------------------------------------
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
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "E-mail inválido." })
    .optional(),
  phone: optionalTrimmedString(40),
  tax_regime: optionalTrimmedString(60),
  crt: optionalTrimmedString(20),
  pis_cofins_regime: z.enum(PIS_COFINS_REGIMES).nullable().optional(),
  uf_accreditations: z.array(z.custom<Json>()).refine((v) => !hasSensitiveKey(v), { message: "Conteúdo sensível não é permitido." }).optional(),
  primary_cnae: optionalTrimmedString(20),
  additional_cnaes: z
    .array(z.string().trim().min(1).max(20))
    .max(50)
    .transform((list) => Array.from(new Set(list)))
    .optional(),
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
  nfe_series_number: z.number().int().min(1).max(999).nullable().optional(),
  nfe_environment_code: z.literal("2").optional(),
  nfse_series: optionalTrimmedString(20),
  nfe_configuration: nfeConfigurationSchema.optional(),
  nfse_configuration: nfseConfigurationSchema.optional(),
  nfe_provider: z.enum(ALLOWED_PROVIDERS).optional(),
  nfse_provider: z.enum(ALLOWED_PROVIDERS).optional(),
  nfe_credential_ref: refField,
  nfse_credential_ref: refField,
  certificate_ref: refField,
  webhook_ref: refField,
  configuration_notes: optionalTrimmedString(4000),
  configuration_version: z.number().int().positive().optional(),
});

export type CompanyFiscalFormValues = z.infer<typeof companyFiscalFormSchema>;

export const FORBIDDEN_PAYLOAD_KEYS = [
  "production_enabled",
  "id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "accounting_validated_at",
  "accounting_validated_by",
  "configuration_status",
  "is_active",
  "last_validation_at",
] as const;

/**
 * Constrói payload de UPDATE tipado. Mapeamento explícito para as
 * colunas reais de company_fiscal_settings — sem casts estruturais
 * (nenhum any). Chaves proibidas nunca são incluídas.
 */
export function buildUpdatePayload(values: CompanyFiscalFormValues): Update {
  const parsed = companyFiscalFormSchema.parse(values);
  const payload: Update = {
    // Trava: provider legacy sempre NONE.
    fiscal_provider: LOCKED_PROVIDER,
  };

  const assignText = (key: string, val: string | null | undefined) => {
    if (val === undefined) return;
    (payload as Record<string, string | null>)[key] = val;
  };

  if (parsed.cnpj !== undefined) payload.cnpj = parsed.cnpj === null ? null : normalizeCnpj(parsed.cnpj);
  assignText("legal_name", parsed.legal_name);
  assignText("trade_name", parsed.trade_name);
  assignText("fiscal_email", parsed.fiscal_email);
  assignText("phone", parsed.phone);
  assignText("tax_regime", parsed.tax_regime);
  assignText("crt", parsed.crt);
  assignText("pis_cofins_regime", parsed.pis_cofins_regime);
  if (parsed.uf_accreditations !== undefined) payload.uf_accreditations = parsed.uf_accreditations;
  assignText("primary_cnae", parsed.primary_cnae);
  if (parsed.additional_cnaes !== undefined) {
    (payload as Record<string, string[] | null>).additional_cnaes =
      parsed.additional_cnaes.filter((code) => code !== parsed.primary_cnae);
  }
  assignText("municipal_registration", parsed.municipal_registration);
  assignText("state_registration", parsed.state_registration);
  assignText("municipality_ibge_code", parsed.municipality_ibge_code);
  assignText("postal_code", parsed.postal_code);
  assignText("street", parsed.street);
  assignText("number", parsed.number);
  assignText("complement", parsed.complement);
  assignText("neighborhood", parsed.neighborhood);
  assignText("city", parsed.city);
  assignText("state", parsed.state);
  assignText("country_code", parsed.country_code);
  assignText("nfe_series", parsed.nfe_series);
  assignText("nfse_series", parsed.nfse_series);
  assignText("nfe_credential_ref", parsed.nfe_credential_ref);
  assignText("nfse_credential_ref", parsed.nfse_credential_ref);
  // certificate_ref is exclusively managed by the certificate vault.
  assignText("webhook_ref", parsed.webhook_ref);
  assignText("configuration_notes", parsed.configuration_notes);

  if (parsed.fiscal_environment !== undefined) payload.fiscal_environment = parsed.fiscal_environment;
  payload.nfe_enabled = false;
  payload.nfe_environment_code = "2";
  if (parsed.nfe_series_number !== undefined) {
    payload.nfe_series_number = parsed.nfe_series_number;
    payload.nfe_series = parsed.nfe_series_number === null ? null : String(parsed.nfe_series_number);
  }
  payload.nfse_enabled = false;
  if (parsed.nfe_provider !== undefined) payload.nfe_provider = parsed.nfe_provider;
  if (parsed.nfse_provider !== undefined) payload.nfse_provider = parsed.nfse_provider;
  if (parsed.nfe_configuration !== undefined) {
    payload.nfe_configuration = parsed.nfe_configuration as Json;
  }
  if (parsed.nfse_configuration !== undefined) {
    payload.nfse_configuration = parsed.nfse_configuration as Json;
  }
  // configuration_version é definido pelo hook (expectedVersion + 1),
  // não pelo formulário — nunca copiar do parsed aqui.

  return payload;
}

function coerceProvider(v: string | null | undefined): AllowedProvider {
  if (v && (ALLOWED_PROVIDERS as readonly string[]).includes(v)) return v as AllowedProvider;
  return "NONE";
}

function jsonObjectRecord(v: Json | null | undefined): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

export function rowToFormValues(row: Row | null): CompanyFiscalFormValues {
  if (!row) {
    return {
      fiscal_environment: "NOT_CONFIGURED",
      configuration_status: "DRAFT",
      nfe_enabled: false,
      nfse_enabled: false,
      nfe_provider: "NONE",
      nfse_provider: "NONE",
      nfe_configuration: {},
      nfse_configuration: {},
      configuration_version: 1,
    };
  }
  const env: AllowedEnvironment = (ALLOWED_ENVIRONMENTS as readonly string[]).includes(row.fiscal_environment)
    ? (row.fiscal_environment as AllowedEnvironment)
    : "NOT_CONFIGURED";
  const status: AllowedStatus = (ALLOWED_STATUSES as readonly string[]).includes(row.configuration_status)
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
    pis_cofins_regime: row.pis_cofins_regime as CompanyFiscalFormValues["pis_cofins_regime"] ?? null,
    uf_accreditations: Array.isArray(row.uf_accreditations) ? row.uf_accreditations : undefined,
    primary_cnae: row.primary_cnae ?? undefined,
    additional_cnaes: Array.isArray(row.additional_cnaes)
      ? row.additional_cnaes.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      : undefined,
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
    nfe_enabled: row.nfe_enabled ?? false,
    nfse_enabled: row.nfse_enabled ?? false,
    nfe_series: row.nfe_series ?? undefined,
    nfe_series_number: row.nfe_series_number ?? undefined,
    nfe_environment_code: "2",
    nfse_series: row.nfse_series ?? undefined,
    nfe_configuration: jsonObjectRecord(row.nfe_configuration),
    nfse_configuration: jsonObjectRecord(row.nfse_configuration),
    nfe_provider: coerceProvider(row.nfe_provider),
    nfse_provider: coerceProvider(row.nfse_provider),
    nfe_credential_ref: row.nfe_credential_ref ?? undefined,
    nfse_credential_ref: row.nfse_credential_ref ?? undefined,
    certificate_ref: row.certificate_ref ?? undefined,
    webhook_ref: row.webhook_ref ?? undefined,
    configuration_notes: row.configuration_notes ?? undefined,
    configuration_version: row.configuration_version ?? 1,
  };
}

// Checklist local ----------------------------------------------------
export interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
}
export function nfeChecklist(v: CompanyFiscalFormValues): ChecklistItem[] {
  const c = (v.nfe_configuration ?? {}) as Record<string, unknown>;
  return [
    { key: "cnpj", label: "CNPJ da empresa", ok: !!v.cnpj },
    { key: "legal_name", label: "Razão social", ok: !!v.legal_name },
    { key: "state_registration", label: "Inscrição estadual", ok: !!v.state_registration },
    { key: "series", label: "Série NF-e", ok: typeof v.nfe_series_number === "number" && Number.isInteger(v.nfe_series_number) && v.nfe_series_number >= 1 && v.nfe_series_number <= 999 },
    { key: "cfop_in_state", label: "CFOP interno sugerido", ok: !!c.suggested_cfop_in_state },
    { key: "cfop_interstate", label: "CFOP interestadual", ok: !!c.suggested_cfop_interstate },
    { key: "environment", label: "Ambiente de homologação", ok: v.fiscal_environment === "HOMOLOGATION" },
  ];
}
export function nfseChecklist(v: CompanyFiscalFormValues): ChecklistItem[] {
  const c = (v.nfse_configuration ?? {}) as Record<string, unknown>;
  return [
    { key: "cnpj", label: "CNPJ da empresa", ok: !!v.cnpj },
    { key: "municipal_registration", label: "Inscrição municipal", ok: !!v.municipal_registration },
    { key: "municipality_ibge_code", label: "Código IBGE do município", ok: !!v.municipality_ibge_code },
    { key: "mode", label: "Modo (nacional/municipal)", ok: !!c.mode },
    { key: "lc116_item", label: "Item LC 116", ok: !!c.lc116_item },
    { key: "iss_rate", label: "Alíquota ISS", ok: typeof c.iss_rate === "number" },
    { key: "environment", label: "Ambiente de homologação", ok: v.fiscal_environment === "HOMOLOGATION" },
  ];
}

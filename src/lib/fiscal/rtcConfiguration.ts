/**
 * Fase Fiscal 3.19 (+3.19.4) — Contrato JSONB de configuração RTC 2026 (IBS/CBS).
 *
 * FONTES NORMATIVAS (referenciais; UI/backend NÃO devem tratar como
 * catálogo oficial completo sem a versão explícita indicada por
 * `source_document` + `source_version`):
 *   - LC 214/2025, LC 227/2026 (transição RTC).
 *   - NF-e/NFC-e NT 2025.002 v1.60 e NT 2026.004 v1.01.
 *   - NFS-e Nacional NT 007/2026, NT 009/2026, Anexos VI v4 / VII v2.
 *
 * REGRAS DE SEGURANÇA:
 * - `additional_fields` permite passthrough para campos ainda não
 *   estabilizados, MAS o scanner recursivo rejeita chaves sensíveis.
 * - Nenhum campo aceita credenciais, tokens, certificados ou segredos.
 * - Percentuais NÃO são arredondados: 0 ≤ x ≤ 100.
 * - Códigos são strings (preserva zeros à esquerda).
 * - Tributos legados (ICMS, IPI, PIS, Cofins, ISS) permanecem em seus
 *   próprios schemas — este arquivo apenas complementa com IBS/CBS.
 * - NUNCA persistir alíquotas default (0,9% / 0,1%) como valor efetivo:
 *   somente como referência informativa em `aliquota_*_reference`.
 * - NFS-e Nacional: campos `finNFSe`, `tpNFSeDebito`, `tpNFSeCredito`,
 *   `gIBSCBSAjuste` (bool) e `vAjusteBC` (>= 0) vivem em
 *   `additional_fields` com validação forte (sem `as any`).
 */
import { z } from "zod";

// ————————— Chaves proibidas (scanner recursivo) —————————
export const RTC_SENSITIVE_KEYS = [
  "token", "password", "senha", "secret", "api_key", "apikey",
  "private_key", "privatekey", "pfx", "p12",
  "certificate", "certificate_content", "certificate_pem", "pem",
  "authorization", "bearer", "access_token", "refresh_token",
  "client_secret",
];

export function rtcHasSensitiveKey(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(rtcHasSensitiveKey);
  if (typeof value === "object") {
    for (const k of Object.keys(value as Record<string, unknown>)) {
      if (RTC_SENSITIVE_KEYS.includes(k.toLowerCase())) return true;
      if (rtcHasSensitiveKey((value as Record<string, unknown>)[k])) return true;
    }
  }
  return false;
}

// ————————————— Helpers —————————————
const codeString = (max: number) =>
  z.string().trim().min(1).max(max).regex(/^[A-Z0-9._-]+$/i, {
    message: "Código inválido (use A-Z, 0-9, . _ -).",
  });

const percent = z.number().min(0).max(100);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, { message: "Data ISO inválida." });

const reductionSchema = z
  .object({
    applies: z.boolean().optional(),
    percent_reduction_base: percent.optional(),
    reason: z.string().trim().max(500).optional(),
    legal_basis: z.string().trim().max(500).optional(),
  })
  .strict();

const deferralSchema = z
  .object({
    applies: z.boolean().optional(),
    kind: z.enum(["DIFERIMENTO", "SUSPENSAO"]).optional(),
    legal_basis: z.string().trim().max(500).optional(),
  })
  .strict();

const monofasiaSchema = z
  .object({
    applies: z.boolean().optional(),
    stage: z.enum(["FABRICANTE", "IMPORTADOR", "REVENDA"]).optional(),
    legal_basis: z.string().trim().max(500).optional(),
  })
  .strict();

// ————————— NFS-e Nacional (dentro de additional_fields) —————————
/** Chaves NFS-e conhecidas — tipadas para eliminar `as any` na UI. */
export const NFSE_KEYS = ["finNFSe", "tpNFSeDebito", "tpNFSeCredito", "gIBSCBSAjuste", "vAjusteBC"] as const;
export type NfseKey = (typeof NFSE_KEYS)[number];

const nfseCodeMax30 = z.string().trim().min(1).max(30);

/** Refinamento aplicado a `additional_fields` para as chaves NFS-e.
 *  - `finNFSe`, `tpNFSeDebito`, `tpNFSeCredito`: string curta.
 *  - `gIBSCBSAjuste`: boolean condicional.
 *  - `vAjusteBC`: número >= 0; só permitido quando `gIBSCBSAjuste === true`.
 *  Chaves NFS-e desconhecidas passam livremente; as conhecidas exigem tipos.
 *  Retorna `null` quando OK e `{ code, field }` na primeira falha. */
export type NfseFailure = { code: string; field: NfseKey };

export function validateNfseInAdditionalFields(
  af: Record<string, unknown> | undefined,
): NfseFailure | null {
  if (!af) return null;
  for (const k of ["finNFSe", "tpNFSeDebito", "tpNFSeCredito"] as const) {
    if (k in af) {
      const parsed = nfseCodeMax30.safeParse(af[k]);
      if (!parsed.success) return { code: "FISCAL_RTC_NFSE_INVALID_CODE", field: k };
    }
  }
  const hasAjuste = "gIBSCBSAjuste" in af;
  if (hasAjuste && typeof af.gIBSCBSAjuste !== "boolean") {
    return { code: "FISCAL_RTC_NFSE_INVALID_TOGGLE", field: "gIBSCBSAjuste" };
  }
  if ("vAjusteBC" in af) {
    const v = af.vAjusteBC;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      return { code: "FISCAL_RTC_NFSE_INVALID_VALUE", field: "vAjusteBC" };
    }
    if (af.gIBSCBSAjuste !== true) {
      return { code: "FISCAL_RTC_NFSE_VALUE_WITHOUT_TOGGLE", field: "vAjusteBC" };
    }
  }
  return null;
}

/** Zod refinement adapter. */
const additionalFieldsSchema = z
  .record(z.string(), z.unknown())
  .superRefine((af, ctx) => {
    const r = validateNfseInAdditionalFields(af);
    if (r === null) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${r.code}:${r.field}`,
      path: [r.field],
    });
  });



// ————————————— Empresa (company_fiscal_settings.rtc_configuration) —————————————
export const rtcCompanySchema = z
  .object({
    schema_version: z.literal(1),
    source_document: z.string().trim().min(1).max(120).optional(),
    source_version: z.string().trim().min(1).max(60).optional(),
    effective_from: isoDate.optional(),
    last_reviewed_at: isoDate.optional(),
    rtc_environment: z.enum(["NOT_CONFIGURED", "HOMOLOGATION"]).default("NOT_CONFIGURED"),
    transition_year: z.number().int().min(2026).max(2033).optional(),
    accounting_review_notes: z.string().trim().max(4000).optional(),
    accounting_review_status: z.enum(["PENDING", "REVIEWED"]).optional(),
    additional_fields: additionalFieldsSchema.optional(),
  })
  .strict()
  .refine((v) => !rtcHasSensitiveKey(v), {
    message: "Conteúdo sensível não é permitido em rtc_configuration.",
  });

export type RtcCompanyConfiguration = z.infer<typeof rtcCompanySchema>;

// ————————————— Produto/Serviço (*_fiscal_profiles.ibs_cbs_configuration) —————————————
export const ibsCbsItemSchema = z
  .object({
    schema_version: z.literal(1),
    source_document: z.string().trim().min(1).max(120).optional(),
    source_version: z.string().trim().min(1).max(60).optional(),
    effective_from: isoDate.optional(),
    last_reviewed_at: isoDate.optional(),

    cst_ibs_cbs: codeString(6).optional(),
    c_class_trib: codeString(10).optional(),
    c_credito_presumido: codeString(10).optional(),
    c_ind_op: codeString(6).optional(),

    aliquota_cbs: percent.optional(),
    aliquota_ibs_uf: percent.optional(),
    aliquota_ibs_municipio: percent.optional(),

    // Referência informativa (NÃO substitui a alíquota efetiva calculada).
    aliquota_cbs_reference: percent.optional(),
    aliquota_ibs_reference: percent.optional(),

    reducao: reductionSchema.optional(),
    diferimento: deferralSchema.optional(),
    monofasia: monofasiaSchema.optional(),

    accounting_notes: z.string().trim().max(2000).optional(),
    accounting_review_status: z.enum(["PENDING", "REVIEWED"]).optional(),
    additional_fields: additionalFieldsSchema.optional(),
  })
  .strict()
  .refine((v) => !rtcHasSensitiveKey(v), {
    message: "Conteúdo sensível não é permitido em ibs_cbs_configuration.",
  });

export type IbsCbsItemConfiguration = z.infer<typeof ibsCbsItemSchema>;

/** Valida payload JSONB genérico (objeto raiz, nunca array/primitivo). */
export function assertJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ————————————— Getters/setters tipados para additional_fields.NFS-e —————————————
export type NfseFieldMap = {
  finNFSe: string;
  tpNFSeDebito: string;
  tpNFSeCredito: string;
  gIBSCBSAjuste: boolean;
  vAjusteBC: number;
};

export function getNfseField<K extends NfseKey>(
  cfg: IbsCbsItemConfiguration,
  key: K,
): NfseFieldMap[K] | undefined {
  const af = cfg.additional_fields;
  if (!af || typeof af !== "object") return undefined;
  const v = (af as Record<string, unknown>)[key];
  if (v === undefined || v === null) return undefined;
  if (key === "gIBSCBSAjuste") return (typeof v === "boolean" ? v : undefined) as NfseFieldMap[K] | undefined;
  if (key === "vAjusteBC") return (typeof v === "number" && Number.isFinite(v) ? v : undefined) as NfseFieldMap[K] | undefined;
  return (typeof v === "string" ? v : undefined) as NfseFieldMap[K] | undefined;
}

export function setNfseField<K extends NfseKey>(
  cfg: IbsCbsItemConfiguration,
  key: K,
  value: NfseFieldMap[K] | undefined,
): IbsCbsItemConfiguration {
  const prev: Record<string, unknown> =
    cfg.additional_fields && typeof cfg.additional_fields === "object"
      ? { ...(cfg.additional_fields as Record<string, unknown>) }
      : {};
  if (value === undefined || value === "" || (typeof value === "number" && Number.isNaN(value))) {
    delete prev[key];
  } else {
    prev[key] = value;
  }
  // Regra condicional: desligar gIBSCBSAjuste limpa vAjusteBC.
  if (key === "gIBSCBSAjuste" && value !== true) {
    delete prev.vAjusteBC;
  }
  return {
    ...cfg,
    additional_fields: Object.keys(prev).length > 0 ? prev : undefined,
  };
}

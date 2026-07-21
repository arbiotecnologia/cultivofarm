/**
 * Fase Fiscal 3.2 — Validação pura para `product_fiscal_profiles`.
 *
 * Fonte do contrato: `src/integrations/supabase/types.ts`
 * (relação `product_fiscal_profiles.product_id → produtos.id`).
 *
 * REGRAS:
 * - NCM/CEST/CFOP normalizados para dígitos e validados por tamanho quando
 *   preenchidos. Ausência = manter valor do banco (não enviar null).
 * - Nenhum campo fora do contrato real da tabela é aceito.
 * - Nenhum campo do produto mestre é tocado nesta camada.
 * - `is_active` e `profile_status` opcionais (não mexemos aqui).
 */
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type ProductFiscalRow =
  Database["public"]["Tables"]["product_fiscal_profiles"]["Row"];
export type ProductFiscalInsert =
  Database["public"]["Tables"]["product_fiscal_profiles"]["Insert"];
export type ProductFiscalUpdate =
  Database["public"]["Tables"]["product_fiscal_profiles"]["Update"];

// ————————————————————————— Normalizadores —————————————————————————
export function digitsOnly(v: string | null | undefined): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : "";
}

function digitsField(len: number, label: string) {
  return z
    .string()
    .transform((v) => digitsOnly(v))
    .refine((v) => v === "" || v.length === len, {
      message: `${label} deve conter exatamente ${len} dígitos`,
    });
}

// —————————————————————— Enums leves (livres) ——————————————————————
// `profile_status` é `string` no contrato — não inventamos enum aqui.
// A UI apenas oferece filtros por valores REAIS observados no dataset.

// ————————————————————————— Form schema —————————————————————————
export const productFiscalFormSchema = z.object({
  ncm: digitsField(8, "NCM").optional().default(""),
  cest: digitsField(7, "CEST").optional().default(""),
  cfop_in_state: digitsField(4, "CFOP interno").optional().default(""),
  cfop_interstate: digitsField(4, "CFOP interestadual").optional().default(""),
  origin_code: z
    .string()
    .trim()
    .max(4, "Origem inválida")
    .optional()
    .default(""),
  icms_cst: z.string().trim().max(4).optional().default(""),
  icms_csosn: z.string().trim().max(4).optional().default(""),
  ipi_cst: z.string().trim().max(4).optional().default(""),
  pis_cst: z.string().trim().max(4).optional().default(""),
  cofins_cst: z.string().trim().max(4).optional().default(""),
  commercial_unit: z.string().trim().max(6).optional().default(""),
  taxable_unit: z.string().trim().max(6).optional().default(""),
  taxable_gtin: z.string().trim().max(14).optional().default(""),
  gtin: z.string().trim().max(14).optional().default(""),
  fiscal_description: z.string().trim().max(500).optional().default(""),
  tax_benefit_code: z.string().trim().max(20).optional().default(""),
  accounting_notes: z.string().trim().max(2000).optional().default(""),
});

export type ProductFiscalFormValues = z.infer<typeof productFiscalFormSchema>;

// ————————————————————— Row → Form defaults —————————————————————
export function rowToFormValues(
  row: ProductFiscalRow | null,
): ProductFiscalFormValues {
  return {
    ncm: row?.ncm ?? "",
    cest: row?.cest ?? "",
    cfop_in_state: row?.cfop_in_state ?? "",
    cfop_interstate: row?.cfop_interstate ?? "",
    origin_code: row?.origin_code ?? "",
    icms_cst: row?.icms_cst ?? "",
    icms_csosn: row?.icms_csosn ?? "",
    ipi_cst: row?.ipi_cst ?? "",
    pis_cst: row?.pis_cst ?? "",
    cofins_cst: row?.cofins_cst ?? "",
    commercial_unit: row?.commercial_unit ?? "",
    taxable_unit: row?.taxable_unit ?? "",
    taxable_gtin: row?.taxable_gtin ?? "",
    gtin: row?.gtin ?? "",
    fiscal_description: row?.fiscal_description ?? "",
    tax_benefit_code: row?.tax_benefit_code ?? "",
    accounting_notes: row?.accounting_notes ?? "",
  };
}

// ————————————————————— Payload builders —————————————————————
// Preserva a semântica: string vazia = "não enviar" (mantém valor no banco).
// Nunca envia campos fora do contrato. Nunca envia `product_id` no UPDATE.
const NULLABLE_STRING_FIELDS: Array<keyof ProductFiscalFormValues> = [
  "ncm",
  "cest",
  "cfop_in_state",
  "cfop_interstate",
  "origin_code",
  "icms_cst",
  "icms_csosn",
  "ipi_cst",
  "pis_cst",
  "cofins_cst",
  "commercial_unit",
  "taxable_unit",
  "taxable_gtin",
  "gtin",
  "fiscal_description",
  "tax_benefit_code",
  "accounting_notes",
];

function normalizeForPayload(
  key: keyof ProductFiscalFormValues,
  value: string,
): string | null {
  if (value === "") return null;
  if (
    key === "ncm" ||
    key === "cest" ||
    key === "cfop_in_state" ||
    key === "cfop_interstate"
  ) {
    return digitsOnly(value);
  }
  return value;
}

/**
 * UPDATE payload: envia SOMENTE campos que mudaram em relação ao row atual.
 * String vazia vira `null` (limpar campo é opt-in explícito do usuário).
 * `product_id`, timestamps e flags de sistema nunca são enviados.
 */
export function buildUpdatePayload(
  values: ProductFiscalFormValues,
  current: ProductFiscalRow,
): ProductFiscalUpdate {
  const payload: ProductFiscalUpdate = {};
  for (const key of NULLABLE_STRING_FIELDS) {
    const next = normalizeForPayload(key, values[key] ?? "");
    const prev = (current[key] ?? null) as string | null;
    if (next !== prev) {
      (payload as Record<string, unknown>)[key] = next;
    }
  }
  return payload;
}

/**
 * INSERT payload: exige `product_id` externo. Envia apenas campos preenchidos.
 */
export function buildInsertPayload(
  productId: string,
  values: ProductFiscalFormValues,
): ProductFiscalInsert {
  const payload: ProductFiscalInsert = { product_id: productId };
  for (const key of NULLABLE_STRING_FIELDS) {
    const next = normalizeForPayload(key, values[key] ?? "");
    if (next !== null) {
      (payload as Record<string, unknown>)[key] = next;
    }
  }
  return payload;
}

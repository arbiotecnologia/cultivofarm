/**
 * Fase Fiscal 3.21 — Validação e payload de `microorganism_fiscal_profiles`.
 *
 * Estratégia:
 *   Os campos fiscais são equivalentes aos de `product_fiscal_profiles`.
 *   Reutilizamos o schema/normalizadores existentes e apenas trocamos a
 *   chave externa (`microorganism_id`) no INSERT.
 *
 * Boundary de tipos:
 *   A tabela `microorganism_fiscal_profiles` ainda NÃO está no arquivo
 *   canônico `src/integrations/supabase/cultivofarm.types.ts` (aguarda regen oficial
 *   após aplicação da migration). Este módulo define interfaces narrow
 *   que refletem exatamente as colunas da migration canônica
 *   `supabase/migrations/20260806000000_fiscal_microorganism_profiles.sql`.
 *   REMOVER as interfaces narrow assim que `types.ts` for regenerado.
 */
import {
  productFiscalFormSchema,
  rowToFormValues as productRowToFormValues,
  buildUpdatePayload as productBuildUpdatePayload,
  digitsOnly,
  type ProductFiscalFormValues,
} from "./productFiscalValidation";

export const microorganismFiscalFormSchema = productFiscalFormSchema;
export type MicroorganismFiscalFormValues = ProductFiscalFormValues;
export { digitsOnly };

/** Reflete a tabela criada pela migration 20260806. Boundary local. */
export interface MicroorganismFiscalRow {
  id: string;
  microorganism_id: string;
  is_active: boolean;
  fiscal_description: string | null;
  commercial_unit: string | null;
  taxable_unit: string | null;
  ncm: string | null;
  cest: string | null;
  origin_code: string | null;
  cfop_in_state: string | null;
  cfop_interstate: string | null;
  icms_cst: string | null;
  icms_csosn: string | null;
  pis_cst: string | null;
  cofins_cst: string | null;
  ipi_cst: string | null;
  gtin: string | null;
  taxable_gtin: string | null;
  tax_benefit_code: string | null;
  profile_status: string;
  accounting_notes: string | null;
  accounting_validated_at: string | null;
  accounting_validated_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type MicroorganismFiscalInsert = Partial<MicroorganismFiscalRow> & {
  microorganism_id: string;
};
export type MicroorganismFiscalUpdate = Partial<MicroorganismFiscalRow>;

/**
 * Row → Form: os campos fiscais têm o mesmo formato do produto; podemos
 * reutilizar diretamente o mapeamento existente com um shim de tipo.
 */
export function rowToFormValues(
  row: MicroorganismFiscalRow | null,
): MicroorganismFiscalFormValues {
  // Aproveitamos o mesmo mapeamento string-vazio-como-default; a assinatura
  // do row de produto exige campos que não existem no micro, então usamos
  // um proxy narrow: só as chaves consumidas pelo mapeamento importam.
  return productRowToFormValues(
    (row as unknown) as Parameters<typeof productRowToFormValues>[0],
  );
}

/**
 * Update: aproveita a implementação existente — o algoritmo é agnóstico à
 * FK; ele só percorre os campos fiscais compartilhados.
 */
export function buildUpdatePayload(
  values: MicroorganismFiscalFormValues,
  current: MicroorganismFiscalRow,
): MicroorganismFiscalUpdate {
  return productBuildUpdatePayload(
    values,
    (current as unknown) as Parameters<typeof productBuildUpdatePayload>[1],
  ) as MicroorganismFiscalUpdate;
}

/** Insert: assinatura específica exigindo `microorganism_id`. */
const NULLABLE_STRING_FIELDS: Array<keyof MicroorganismFiscalFormValues> = [
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
  key: keyof MicroorganismFiscalFormValues,
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

export function buildInsertPayload(
  microorganismId: string,
  values: MicroorganismFiscalFormValues,
): MicroorganismFiscalInsert {
  const payload: MicroorganismFiscalInsert = {
    microorganism_id: microorganismId,
  };
  for (const key of NULLABLE_STRING_FIELDS) {
    const next = normalizeForPayload(key, values[key] ?? "");
    if (next !== null) {
      (payload as Record<string, unknown>)[key] = next;
    }
  }
  return payload;
}

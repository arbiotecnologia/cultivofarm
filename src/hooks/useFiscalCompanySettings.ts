/**
 * Fase Fiscal 3.1 — Hook tipado para leitura/mutação do singleton
 * `company_fiscal_settings`.
 *
 * - Sem `any`, sem casts de conveniência.
 * - `.select("*")` no singleton (uma única linha por design) — não é
 *   "SELECT amplo" no sentido perigoso porque não há JOINs implícitos.
 * - Mutação idempotente: UPDATE por `id` do singleton ativo.
 * - NÃO cria linha nova nesta fase.
 * - Falha de permissão (RLS/403/42501) → estado `permission_denied`,
 *   nunca "sucesso silencioso".
 * - Nota: a view `v_fiscal_company_readiness` existe no schema, mas
 *   `types.ts` (última regeneração pendente) não expõe as views fiscais
 *   como fontes de `.from()`; portanto o "resumo de prontidão" é
 *   derivado no cliente a partir do próprio singleton. Ver
 *   `docs/fiscal-types-provenance.md`.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  buildUpdatePayload,
  type CompanyFiscalFormValues,
} from "@/lib/fiscal/companyFiscalValidation";

export type CompanyFiscalRow = Database["public"]["Tables"]["company_fiscal_settings"]["Row"];

export const FISCAL_COMPANY_KEYS = {
  settings: ["fiscal", "company", "settings"] as const,
};

function isPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; status?: number; message?: string };
  if (e.code === "42501" || e.code === "PGRST301") return true;
  if (e.status === 401 || e.status === 403) return true;
  if (typeof e.message === "string" && /permission|denied|rls/i.test(e.message)) return true;
  return false;
}

export function useFiscalCompanySettings(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;

  return useQuery<CompanyFiscalRow | null, Error>({
    queryKey: FISCAL_COMPANY_KEYS.settings,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_fiscal_settings")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }
      return data ?? null;
    },
  });
}

export function useUpdateFiscalCompanySettings() {
  const qc = useQueryClient();
  return useMutation<CompanyFiscalRow, Error, { id: string; values: CompanyFiscalFormValues }>({
    mutationFn: async ({ id, values }) => {
      const payload = buildUpdatePayload(values);
      const { data, error } = await supabase
        .from("company_fiscal_settings")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FISCAL_COMPANY_KEYS.settings });
    },
  });
}

/**
 * Resumo de prontidão derivado do singleton (equivalente ao que a view
 * `v_fiscal_company_readiness` exporia). Puro — sem I/O.
 */
export interface CompanyFiscalReadiness {
  fiscal_environment: string;
  fiscal_provider: string;
  configuration_status: string;
  nfe_enabled: boolean;
  nfse_enabled: boolean;
  production_enabled: boolean;
  accounting_validated: boolean;
  filled_score: number;
  max_score: number;
}

const READINESS_FIELDS: Array<keyof CompanyFiscalRow> = [
  "cnpj",
  "legal_name",
  "trade_name",
  "fiscal_email",
  "tax_regime",
  "crt",
  "primary_cnae",
  "municipal_registration",
  "state_registration",
  "municipality_ibge_code",
  "postal_code",
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
  "country_code",
];

export function computeReadiness(row: CompanyFiscalRow): CompanyFiscalReadiness {
  const filled = READINESS_FIELDS.filter((f) => {
    const v = row[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  return {
    fiscal_environment: row.fiscal_environment,
    fiscal_provider: row.fiscal_provider,
    configuration_status: row.configuration_status,
    nfe_enabled: row.nfe_enabled,
    nfse_enabled: row.nfse_enabled,
    production_enabled: row.production_enabled,
    accounting_validated: row.accounting_validated_at !== null,
    filled_score: filled,
    max_score: READINESS_FIELDS.length,
  };
}

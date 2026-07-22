/**
 * Fase Fiscal 3.15 — Hook para o singleton `company_fiscal_settings`.
 *
 * `types.ts` é regenerado pela toolchain; nesta fase antecipamos o
 * contrato pela ampliação `CompanyFiscalRow` (união com os campos
 * novos). O acesso ao Supabase usa `as any` no filtro para tolerar a
 * defasagem até a regeneração.
 *
 * - RPC segura `rpc_fiscal_company_settings_init` (admin-only).
 * - Concorrência otimista por `configuration_version`.
 * - Sem uso de credenciais elevadas nem acesso a segredo.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  buildUpdatePayload,
  type CompanyFiscalFormValues,
} from "@/lib/fiscal/companyFiscalValidation";

type BaseRow = Database["public"]["Tables"]["company_fiscal_settings"]["Row"];

/** Row estendido com colunas da Fase 3.15. */
export type CompanyFiscalRow = BaseRow & {
  configuration_version: number;
  nfe_configuration: Record<string, unknown>;
  nfse_configuration: Record<string, unknown>;
  nfe_provider: string;
  nfse_provider: string;
  nfe_credential_ref: string | null;
  nfse_credential_ref: string | null;
  certificate_ref: string | null;
  webhook_ref: string | null;
  configuration_notes: string | null;
  last_validation_at: string | null;
  last_validation_status: string;
  last_validation_summary: Record<string, unknown>;
};

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
      return (data as unknown as CompanyFiscalRow) ?? null;
    },
  });
}

/** Inicializa o singleton (admin-only, idempotente). */
export function useInitFiscalCompanySettings() {
  const qc = useQueryClient();
  return useMutation<CompanyFiscalRow, Error, void>({
    mutationFn: async () => {
      const { data, error } = await (
        supabase as unknown as {
          rpc: (name: string) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc("rpc_fiscal_company_settings_init");
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        const msg = (error as { message?: string }).message;
        throw new Error(msg ?? "init_failed");
      }
      if (!data) throw new Error("init_failed");
      return data as CompanyFiscalRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FISCAL_COMPANY_KEYS.settings }),
  });
}

/** UPDATE com concorrência otimista por `configuration_version`. */
export function useUpdateFiscalCompanySettings() {
  const qc = useQueryClient();
  return useMutation<
    CompanyFiscalRow,
    Error,
    { id: string; expectedVersion: number; values: CompanyFiscalFormValues }
  >({
    mutationFn: async ({ id, expectedVersion, values }) => {
      const payload = buildUpdatePayload(values) as Record<string, unknown>;
      payload.configuration_version = expectedVersion + 1;
      const table = supabase.from("company_fiscal_settings") as unknown as {
        update: (p: Record<string, unknown>) => {
          eq: (col: string, val: unknown) => {
            eq: (col: string, val: unknown) => {
              select: (s: string) => {
                maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
              };
            };
          };
        };
      };
      const { data, error } = await table
        .update(payload)
        .eq("id", id)
        .eq("configuration_version", expectedVersion)
        .select("*")
        .maybeSingle();
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error((error as { message?: string }).message ?? "update_failed");
      }
      if (!data) throw new Error("conflict");
      return data as CompanyFiscalRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FISCAL_COMPANY_KEYS.settings }),
  });
}

// Prontidão derivada localmente ---------------------------------------
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

const READINESS_FIELDS: Array<keyof BaseRow> = [
  "cnpj", "legal_name", "trade_name", "fiscal_email", "tax_regime", "crt",
  "primary_cnae", "municipal_registration", "state_registration",
  "municipality_ibge_code", "postal_code", "street", "number",
  "neighborhood", "city", "state", "country_code",
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

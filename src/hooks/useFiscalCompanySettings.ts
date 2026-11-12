/**
 * Fase Fiscal 3.15 — Hook para o singleton `company_fiscal_settings`.
 *
 * Contrato:
 *   - O schema fiscal de staging possui colunas aditivas que podem chegar
 *     antes da regeneração do cliente. Este hook mantém um complemento local
 *     estreito para preservar o typecheck sem editar arquivos auto-gerados.
 *   - RPC segura `rpc_fiscal_company_settings_init` (admin-only, com
 *     advisory lock transacional no banco).
 *   - Concorrência otimista por `configuration_version`.
 *   - Sem uso de credenciais elevadas nem acesso a segredo.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/cultivofarm.types";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import {
  buildUpdatePayload,
  type CompanyFiscalFormValues,
} from "@/lib/fiscal/companyFiscalValidation";

type CompanyFiscalBaseRow =
  Database["public"]["Tables"]["company_fiscal_settings"]["Row"];

export type CompanyFiscalRow = CompanyFiscalBaseRow & {
  organization_id?: string | null;
  fiscal_email?: string | null;
  phone?: string | null;
  tax_regime?: string | null;
  crt?: string | null;
  uf_accreditations?: Json;
  pis_cofins_regime?: string | null;
  pis_cofins_regime_effective_from?: string | null;
  primary_cnae?: string | null;
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
  nfse_series?: string | null;
  nfe_configuration?: Database["public"]["Tables"]["company_fiscal_settings"]["Row"] extends { nfe_configuration: infer T } ? T : unknown;
  nfse_configuration?: Database["public"]["Tables"]["company_fiscal_settings"]["Row"] extends { nfse_configuration: infer T } ? T : unknown;
  nfe_provider?: string | null;
  nfse_provider?: string | null;
  nfe_credential_ref?: string | null;
  nfse_credential_ref?: string | null;
  certificate_ref?: string | null;
  webhook_ref?: string | null;
  configuration_notes?: string | null;
  last_validation_at?: string | null;
  last_validation_status?: string | null;
  last_validation_summary?: unknown;
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

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

export function useFiscalCompanySettings(options: { enabled?: boolean } = {}) {
  const scope = useStorageAccessScope("fiscal-company-settings");
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;
  const enabled = (options.enabled ?? true) && scope.ready;
  return useQuery<CompanyFiscalRow | null, Error>({
    queryKey: [...FISCAL_COMPANY_KEYS.settings, scope.scope],
    enabled,
    queryFn: async () => {
      const valid = scope.capture();
      if (!valid() || !organizationId) throw new Error("permission_denied");
      const { data, error } = await supabase
        .from("company_fiscal_settings")
        .select("*")
        .eq("is_active", true)
        .filter("organization_id", "eq", organizationId)
        .maybeSingle();
      if (!valid()) throw new Error("permission_denied");
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }
      return data ? data as CompanyFiscalRow : null;
    },
  });
}

/** Inicializa o singleton (admin-only, idempotente, anti-corrida no DB). */
export function useInitFiscalCompanySettings() {
  const qc = useQueryClient();
  const scope = useStorageAccessScope("fiscal-company-settings");
  return useMutation<CompanyFiscalRow, Error, void>({
    retry: false,
    mutationFn: async () => {
      const valid = scope.capture();
      if (!valid()) throw new Error("permission_denied");
      const { data, error } = await supabase.rpc("rpc_fiscal_company_settings_init");
      if (!valid()) throw new Error("permission_denied");
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(errorMessage(error, "init_failed"));
      }
      if (!data) throw new Error("init_failed");
      return data as CompanyFiscalRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...FISCAL_COMPANY_KEYS.settings, scope.scope] }),
  });
}

/** UPDATE com concorrência otimista por `configuration_version`. */
export function useUpdateFiscalCompanySettings() {
  const qc = useQueryClient();
  const scope = useStorageAccessScope("fiscal-company-settings");
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;
  return useMutation<
    CompanyFiscalRow,
    Error,
    { id: string; expectedVersion: number; values: CompanyFiscalFormValues; baseline?: CompanyFiscalFormValues }
  >({
    retry: false,
    mutationFn: async ({ id, expectedVersion, values, baseline }) => {
      const valid = scope.capture();
      if (!valid() || !organizationId) throw new Error("permission_denied");
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion <= 0) throw new Error("conflict");
      const payload = buildUpdatePayload(values, baseline);
      payload.configuration_version = expectedVersion + 1;
      const { data, error } = await supabase
        .from("company_fiscal_settings")
        // Canonical database has these additive columns; generated baseline predates them.
        // Structural annotation retains the complete runtime payload without a parallel client.
        .update(payload as Database["public"]["Tables"]["company_fiscal_settings"]["Update"])
        .eq("id", id)
        .filter("organization_id", "eq", organizationId)
        .eq("configuration_version", expectedVersion)
        .select("*")
        .maybeSingle();
      if (!valid()) throw new Error("permission_denied");
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(errorMessage(error, "update_failed"));
      }
      if (!data) throw new Error("conflict");
      const saved = data as CompanyFiscalRow;
      if (saved.id !== id || saved.organization_id !== organizationId || saved.configuration_version !== expectedVersion + 1) throw new Error("update_failed");
      return saved;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...FISCAL_COMPANY_KEYS.settings, scope.scope] }),
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

const READINESS_FIELDS: Array<string> = [
  "cnpj", "legal_name", "trade_name", "fiscal_email", "tax_regime", "crt",
  "primary_cnae", "municipal_registration", "state_registration",
  "municipality_ibge_code", "postal_code", "street", "number",
  "neighborhood", "city", "state", "country_code",
];

export function computeReadiness(row: CompanyFiscalRow): CompanyFiscalReadiness {
  const filled = READINESS_FIELDS.filter((f) => {
    const v = (row as Record<string, unknown>)[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  return {
    fiscal_environment: row.fiscal_environment ?? "NOT_CONFIGURED",
    fiscal_provider: row.fiscal_provider ?? "NONE",
    configuration_status: row.configuration_status ?? "DRAFT",
    nfe_enabled: row.nfe_enabled ?? false,
    nfse_enabled: row.nfse_enabled ?? false,
    production_enabled: row.production_enabled ?? false,
    accounting_validated: row.accounting_validated_at !== null,
    filled_score: filled,
    max_score: READINESS_FIELDS.length,
  };
}

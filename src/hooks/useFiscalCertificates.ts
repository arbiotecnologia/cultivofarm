/**
 * Fase Fiscal 3.16.1 — Hook de listagem/revogação de certificados fiscais.
 *
 * Lê apenas metadados sanitizados via `v_fiscal_certificate_readiness`.
 * A revogação é delegada à Edge Function `fiscal-certificate-revoke`
 * (admin-only, remove ciphertext + logical delete).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { certificateErrorMessage } from "@/lib/fiscal/certificateErrors";
import { supabase } from "@/integrations/supabase/client";

// Types.ts ainda não regenerado após a Fase 3.16.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = supabase.from.bind(supabase) as unknown as (t: string) => any;

export interface FiscalCertificateReadinessRow {
  certificate_id: string;
  company_settings_id: string;
  source_type: "SYSTEM_STORE" | "A1_UPLOAD";
  environment: "HOMOLOGATION" | "PRODUCTION";
  status: "NOT_CONFIGURED" | "AVAILABLE" | "EXPIRED" | "REVOKED" | "ERROR";
  display_name: string;
  subject_name: string | null;
  issuer_name: string | null;
  valid_from: string | null;
  valid_until: string | null;
  fingerprint_sha256: string | null;
  is_active: boolean;
  revoked_at: string | null;
  days_until_expiration: number | null;
}

export function useFiscalCertificates(companySettingsId: string | null) {
  return useQuery({
    queryKey: ["fiscal", "certificates", companySettingsId ?? "none"],
    enabled: !!companySettingsId,
    queryFn: async (): Promise<FiscalCertificateReadinessRow[]> => {
      const { data, error } = await anyFrom("v_fiscal_certificate_readiness")
        .select("*")
        .eq("company_settings_id", companySettingsId)
        .order("valid_until", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as FiscalCertificateReadinessRow[];
    },
  });
}

export function useRevokeFiscalCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { certificateId: string; reason?: string }) => {
      const { data, error } = await supabase.functions.invoke("fiscal-certificate-revoke", {
        body: { certificate_id: args.certificateId, reason: args.reason ?? "" },
      });
      if (error || data?.revoked !== true || data?.cleanup_incomplete) throw new Error(await certificateErrorMessage(error, data));
      return data as { revoked: boolean };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["fiscal"] });
    },
  });
}

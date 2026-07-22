/**
 * Fase Fiscal 3.16.2-B — Mutation para registrar certificado do sistema
 * operacional (bridge nativo) no cofre lógico. Envia APENAS metadados
 * sanitizados pelo `certificateOsAdapter`. RPC valida whitelist, formato
 * do fingerprint, validade e bloqueia PRODUCTION.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FiscalOsCertificateMetadata } from "@/types/fiscalCertificateBridge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export interface RegisterOsCertificateArgs {
  companySettingsId: string;
  displayName: string;
  metadata: FiscalOsCertificateMetadata;
}

export function useRegisterOsCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: RegisterOsCertificateArgs): Promise<string> => {
      const payload: Record<string, unknown> = {
        display_name: args.displayName,
        native_alias: args.metadata.alias,
        subject_name: args.metadata.subject_name,
        issuer_name: args.metadata.issuer_name,
        serial_number: args.metadata.serial_number,
        valid_from: args.metadata.valid_from,
        valid_until: args.metadata.valid_until,
        fingerprint_sha256: args.metadata.fingerprint_sha256,
      };
      if (args.metadata.key_usage) {
        payload.key_usage = args.metadata.key_usage;
      }
      const { data, error } = await rpc("rpc_fiscal_certificate_register_os", {
        p_company_settings_id: args.companySettingsId,
        p_metadata: payload,
      });
      if (error) throw new Error(error.message);
      return String(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal", "certificates"] });
    },
  });
}

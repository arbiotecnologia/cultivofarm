/**
 * FASE H7f — Leitura sanitizada das transmissões SEFAZ (homologação MG).
 *
 * Somente leitura: a autorização real vive em `rpc_fiscal_sefaz_transmission_status_v1`
 * (SECURITY DEFINER, perfil fiscal interno). O frontend nunca é a autorização
 * final e não expõe payload SOAP, certificado ou chave.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SefazTransmissionState = "PENDING" | "SENT" | "SUCCEEDED" | "FAILED" | "BLOCKED";

export interface SefazTransmission {
  transmissionId: string;
  service: string;
  state: SefazTransmissionState;
  environmentCode: string;
  endpointHost: string;
  cStat: string | null;
  xMotivo: string | null;
  chNFe: string | null;
  nProt: string | null;
  nRec: string | null;
  dhRecbto: string | null;
  errorCode: string | null;
  attempt: number;
  correlationId: string;
  createdAt: string;
  completedAt: string | null;
}

export interface SefazTransmissionStatus {
  ceiling: "HOMOLOGATION";
  environmentCode: string;
  items: SefazTransmission[];
}

// RPC da Fase H7f; `types.ts` regenerado apenas após a promoção do schema.
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function useFiscalSefazTransmissions(invoiceId?: string | null) {
  return useQuery({
    queryKey: ["fiscal", "sefaz", "transmissions", invoiceId ?? "all"],
    queryFn: async (): Promise<SefazTransmissionStatus> => {
      const { data, error } = await rpc("rpc_fiscal_sefaz_transmission_status_v1", {
        _invoice_id: invoiceId ?? null,
      });
      if (error) throw new Error(error.message);
      return data as SefazTransmissionStatus;
    },
  });
}

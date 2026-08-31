/**
 * FASE H7k — Preflight fiscal por campo (somente leitura).
 *
 * Consome `rpc_fiscal_preflight_v1` (SECURITY DEFINER, perfil fiscal interno).
 * O frontend NUNCA é a autorização final: `canTransmit` é apenas espelho do
 * veredito server-side, usado para bloquear a UI de forma preventiva.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PreflightStatus = "READY" | "READY_WITH_PREREQUISITES" | "BLOCKED";

export type PreflightSection =
  | "AMBIENTE"
  | "EMITENTE"
  | "DESTINATARIO"
  | "DOCUMENTO"
  | "ITENS"
  | "TOTAIS"
  | "ORIGEM"
  | "CERTIFICADO";

export interface PreflightFinding {
  code: string;
  section: PreflightSection | string;
  field: string | null;
  itemSequence?: number | null;
  message: string;
  action?: string | null;
}

export interface FiscalPreflightResult {
  invoiceId: string;
  preflightVersion: string;
  environment: string;
  status: PreflightStatus;
  canTransmit: boolean;
  blockers: PreflightFinding[];
  warnings: PreflightFinding[];
  fields: Record<string, string[]>;
  itemsTotal: number | null;
  documentTotal: number | null;
  toleranceBRL: number;
  evaluatedAt: string;
}

export const FISCAL_PREFLIGHT_KEYS = {
  byInvoice: (id: string | null) => ["fiscal", "preflight", id ?? "none"] as const,
};

// RPC da Fase H7k; `types.ts` só é regenerado após a promoção do schema.
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export const SECTION_LABEL: Record<string, string> = {
  AMBIENTE: "Ambiente",
  EMITENTE: "Emitente",
  DESTINATARIO: "Destinatário",
  DOCUMENTO: "Documento",
  ITENS: "Itens",
  TOTAIS: "Totais",
  ORIGEM: "Origem",
  CERTIFICADO: "Certificado",
};

export function useFiscalPreflight(invoiceId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: FISCAL_PREFLIGHT_KEYS.byInvoice(invoiceId),
    enabled: (options.enabled ?? true) && !!invoiceId,
    staleTime: 15_000,
    queryFn: async (): Promise<FiscalPreflightResult> => {
      const { data, error } = await rpc("rpc_fiscal_preflight_v1", { p_invoice_id: invoiceId });
      if (error) throw new Error(error.message);
      return data as FiscalPreflightResult;
    },
  });
}

const SECTION_ORDER: string[] = [
  "AMBIENTE",
  "EMITENTE",
  "DESTINATARIO",
  "DOCUMENTO",
  "ITENS",
  "TOTAIS",
  "ORIGEM",
  "CERTIFICADO",
];

/** Agrupa achados por seção preservando a ordem canônica de exibição. */
export function groupBySection(findings: PreflightFinding[]): Array<[string, PreflightFinding[]]> {
  const map = new Map<string, PreflightFinding[]>();
  for (const f of findings) {
    const key = f.section ?? "DOCUMENTO";
    const list = map.get(key) ?? [];
    list.push(f);
    map.set(key, list);
  }
  const rank = (s: string) => {
    const i = SECTION_ORDER.indexOf(s);
    return i === -1 ? SECTION_ORDER.length : i;
  };
  return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}

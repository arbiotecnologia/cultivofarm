/**
 * Fase F3 — Prontidão NF-e modelo 55 (emitente, destinatários, operações,
 * tributos e numeração). Leitura via RPC `rpc_fiscal_nfe_readiness_v1`.
 * Nenhuma emissão/transmissão é feita aqui.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NfeReadinessSection =
  | "EMITENTE"
  | "DESTINATARIOS"
  | "OPERACOES"
  | "TRIBUTOS"
  | "CERTIFICADO"
  | "HOMOLOGACAO";

export interface NfeReadinessPendency {
  section?: NfeReadinessSection | string;
  code: string;
  field?: string;
  severity: "BLOCK" | "WARN";
  message: string;
}

/** Códigos de lacuna de cobertura, distinguidos pelo motor (F3.1). */
export type CoverageGapCode =
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "INCOMPLETE"
  | "ENGINE_UNAVAILABLE";

export interface CoverageGap {
  scope: "OPERACAO" | "TRIBUTO" | "EMITENTE" | string;
  code: CoverageGapCode | string;
  taxKind?: string;
  destUf?: string;
  channel?: string;
  ncm?: string;
  finalConsumer?: boolean;
  indIEDest?: string;
}

export interface NfeCoverage {
  total: number;
  covered: number;
  dimensions?: {
    readyRecipients: number;
    activeChannels: number;
    officialNcms: number;
  };
  gapCodes?: CoverageGapCode[];
  gaps: CoverageGap[];
}

/** Inventário segregado: inativos nunca bloqueiam a prontidão. */
export interface MicroorganismReadinessCounts {
  active: number;
  ready: number;
  draft: number;
  blocked: number;
  inactive: number;
  total: number;
}

export interface NfeReadiness {
  generatedAt: string;
  documentModel: string;
  /** Teto da fase F3: nunca READY_PRODUCTION. */
  maxAllowedStatus: "READY_HOMOLOGATION";
  emitter: {
    configured: boolean;
    status: string;
    crt: string | null;
    uf: string | null;
    series: number | null;
    environment: string | null;
    certificateLinked: boolean;
    accountingValidated: boolean;
    sefazHomologationRecorded?: boolean;
    productionBlocked?: boolean;
  };
  recipients: { total: number; ready: number };
  operations: { publishedPolicies: number };
  taxes: { publishedRules: number; missingMandatoryKinds: string[] };
  coverage?: NfeCoverage;
  microorganisms?: MicroorganismReadinessCounts;
  numbering: { activeSeries: number };
  pendencies: NfeReadinessPendency[];
  overallStatus: "READY_HOMOLOGATION" | "PARTIAL" | "NOT_READY";
}


export const NFE_READINESS_QUERY_KEY = ["fiscal", "nfe-readiness-v1"] as const;

/** Mapeia erros do servidor para mensagens acionáveis, sem vazar detalhes internos. */
export function mapNfeReadinessError(message: string | null | undefined): string {
  const raw = String(message ?? "");
  if (raw.includes("FISCAL_FORBIDDEN")) {
    return "Seu perfil não possui competência fiscal para consultar a prontidão NF-e.";
  }
  if (raw.includes("FISCAL_EMITTER_NOT_CONFIGURED")) {
    return "Emitente ainda não cadastrado. Complete os dados da empresa.";
  }
  return "Não foi possível carregar a prontidão NF-e. Tente novamente.";
}

export function useFiscalNfeReadiness(enabled = true) {
  return useQuery({
    queryKey: NFE_READINESS_QUERY_KEY,
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<NfeReadiness> => {
      const { data, error } = await (supabase as any).rpc("rpc_fiscal_nfe_readiness_v1");
      if (error) throw new Error(mapNfeReadinessError(error.message));
      return data as unknown as NfeReadiness;
    },
  });
}

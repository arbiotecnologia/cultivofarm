/**
 * Fase F4 — Motor de XML da NF-e 55 (geração, validação XSD e assinatura).
 *
 * Leitura sanitizada via `rpc_fiscal_xml_status_v1`; execução via Edge
 * Function `fiscal-xml-engine`. Teto absoluto: SIGNED — nenhuma ação aqui
 * transmite documento à SEFAZ.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FiscalXmlState =
  | "PREPARED"
  | "GENERATED"
  | "XSD_VALIDATED"
  | "SIGNED"
  | "FAILED";

export interface FiscalXmlValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface FiscalXmlRun {
  runId: string;
  runVersion: number;
  state: FiscalXmlState;
  engineVersion: string;
  schemaVersion: string;
  accessKey: string;
  environmentCode: string;
  payloadSha256: string;
  unsignedSha256: string | null;
  unsignedBytes: number | null;
  signedSha256: string | null;
  signedBytes: number | null;
  hasUnsigned: boolean;
  hasSigned: boolean;
  validation: { valid?: boolean; elementCount?: number; issues?: FiscalXmlValidationIssue[] };
  signature: Record<string, string>;
  errorCode: string | null;
  preparedAt: string;
  generatedAt: string | null;
  validatedAt: string | null;
  signedAt: string | null;
  failedAt: string | null;
}

export interface FiscalXmlStatus {
  invoiceId: string;
  ceiling: "SIGNED";
  runs: FiscalXmlRun[];
}

// RPCs da Fase F4; `types.ts` ainda não regenerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function useFiscalXmlStatus(invoiceId: string | null) {
  return useQuery({
    queryKey: ["fiscal", "xml", "status", invoiceId ?? "none"],
    enabled: !!invoiceId,
    queryFn: async (): Promise<FiscalXmlStatus> => {
      const { data, error } = await rpc("rpc_fiscal_xml_status_v1", { p_invoice_id: invoiceId });
      if (error) throw new Error(error.message);
      return data as FiscalXmlStatus;
    },
  });
}

export interface GenerateXmlResult {
  runId: string;
  state: FiscalXmlState;
  code?: string;
  issues?: FiscalXmlValidationIssue[];
  unsignedSha256?: string;
  signedSha256?: string;
}

export function useGenerateFiscalXml() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { invoiceId: string; idempotencyKey: string }): Promise<GenerateXmlResult> => {
      const { data, error } = await supabase.functions.invoke("fiscal-xml-engine", {
        body: {
          action: "generate",
          invoice_id: args.invoiceId,
          idempotency_key: args.idempotencyKey,
        },
      });
      if (error) throw new Error(error.message);
      return data as GenerateXmlResult;
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["fiscal", "xml", "status", vars.invoiceId] });
    },
  });
}

export const FISCAL_XML_MAX_BYTES = 10 * 1024 * 1024;
export const FISCAL_XML_TIMEOUT_MS = 15_000;

/** Chave estável do artefato para o abridor autenticado (não é path de Storage). */
export const fiscalXmlKey = (runId: string, artifact: "signed" | "unsigned") => `${runId}:${artifact}`;

/**
 * Baixa os bytes do artefato pela Edge canônica (sessão do ator). Nunca aceita
 * nem abre URL: resposta JSON (contrato antigo `{ url }`) é tratada como
 * indisponível — fail-closed durante o rollout.
 */
export async function loadFiscalXmlArtifact(key: string, signal: AbortSignal): Promise<Blob> {
  const unavailable = () => new Error("Arquivo indisponível");
  const [runId, artifact] = key.split(":");
  if (!runId || (artifact !== "signed" && artifact !== "unsigned")) throw unavailable();
  if (signal.aborted) throw unavailable();
  const { data, error } = await supabase.functions.invoke("fiscal-xml-engine", {
    body: { action: "download", run_id: runId, artifact },
    signal,
    timeout: FISCAL_XML_TIMEOUT_MS,
  });
  if (signal.aborted || error || !(data instanceof Blob)) throw unavailable();
  if (data.size === 0 || data.size > FISCAL_XML_MAX_BYTES) throw unavailable();
  return new Blob([await data.arrayBuffer()], { type: "application/xml" });
}

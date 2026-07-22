/**
 * Fase Fiscal 3.17 — Hook read-only para `rpc_fiscal_homologation_readiness`.
 *
 * Sem escrita. Sem cast global. Trata ausência da RPC (schema ainda não
 * regenerado / migration pendente) como `Indisponível`, jamais como erro
 * bruto na tela.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  parseReadinessResult,
  type HomologationReadinessResult,
} from "@/lib/fiscal/homologationReadiness";

const RPC_NAME = "rpc_fiscal_homologation_readiness";

export const FISCAL_HOMOLOGATION_KEYS = {
  readiness: ["fiscal", "homologation", "readiness"] as const,
};

export type ReadinessLoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "ready"; data: HomologationReadinessResult };

interface RpcClientLike {
  rpc: (name: string) => Promise<{ data: unknown; error: unknown }>;
}

async function invokeReadiness(): Promise<HomologationReadinessResult | { unavailable: string }> {
  // Cast local mínimo: contornamos o `types.ts` até a regeneração oficial
  // desta fase. Nenhum `any` é introduzido.
  const client = supabase as unknown as RpcClientLike;
  const { data, error } = await client.rpc(RPC_NAME);
  if (error) {
    const e = error as { code?: string; message?: string };
    // RPC ausente no schema: contrato ainda não aplicado.
    if (
      e?.code === "PGRST202" ||
      (typeof e?.message === "string" && /function .* does not exist|not found/i.test(e.message))
    ) {
      return { unavailable: "Verificação de homologação ainda não disponível neste ambiente." };
    }
    if (e?.code === "42501" || (typeof e?.message === "string" && /FISCAL_FORBIDDEN|permission/i.test(e.message))) {
      throw new Error("permission_denied");
    }
    throw new Error("readiness_error");
  }
  return parseReadinessResult(data);
}

export function useFiscalHomologationReadiness(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: FISCAL_HOMOLOGATION_KEYS.readiness,
    enabled,
    staleTime: 30_000,
    queryFn: invokeReadiness,
  });
}

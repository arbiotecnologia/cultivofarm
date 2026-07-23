/**
 * Fase Fiscal 3.17 + 3.19.4 — Hook read-only para a Central de Homologação.
 *
 * Consome a RPC v2 (`rpc_fiscal_homologation_readiness_v2`) que embute
 * o item `rtc_configured` aditivo. Faz fallback para a canônica quando
 * o schema ainda não regenerou a v2 (evita quebra em ambientes onde a
 * migration 3.19 ainda não foi aplicada).
 *
 * Sem escrita. Sem cast global. Trata ausência da RPC como `Indisponível`,
 * jamais como erro bruto na tela.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  parseReadinessResult,
  type HomologationReadinessResult,
} from "@/lib/fiscal/homologationReadiness";

export const READINESS_RPC_PRIMARY = "rpc_fiscal_homologation_readiness_v2";
export const READINESS_RPC_FALLBACK = "rpc_fiscal_homologation_readiness";

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

function isMissingRpc(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST202" || e.code === "42883") return true;
  return typeof e.message === "string" &&
    /function .* does not exist|not found|could not find/i.test(e.message);
}

function isForbidden(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "42501" ||
    (typeof e.message === "string" && /FISCAL_FORBIDDEN|permission/i.test(e.message));
}

async function invokeReadiness(): Promise<HomologationReadinessResult | { unavailable: string }> {
  // Cast local mínimo: contornamos o `types.ts` até a regeneração oficial
  // desta fase. Nenhum `any` é introduzido.
  const client = supabase as unknown as RpcClientLike;

  const primary = await client.rpc(READINESS_RPC_PRIMARY);
  if (!primary.error) return parseReadinessResult(primary.data);

  if (isMissingRpc(primary.error)) {
    // v2 ainda não aplicada: caímos para a canônica preservando contrato.
    const legacy = await client.rpc(READINESS_RPC_FALLBACK);
    if (!legacy.error) return parseReadinessResult(legacy.data);
    if (isMissingRpc(legacy.error)) {
      return { unavailable: "Verificação de homologação ainda não disponível neste ambiente." };
    }
    if (isForbidden(legacy.error)) throw new Error("permission_denied");
    throw new Error("readiness_error");
  }

  if (isForbidden(primary.error)) throw new Error("permission_denied");
  throw new Error("readiness_error");
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

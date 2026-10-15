import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useTechnicalQuerySession } from "@/hooks/useVisitaWorkspace";

// Containment is intentional. Cache isolation never authorizes a reader or writer.
export const COCKPIT_READ_AVAILABLE = false;
export const COCKPIT_LIST_QUERY_AVAILABLE = true;
export const COCKPIT_LIST_RPC = "rpc_cockpit_listar_esteira_v1";
export const COCKPIT_QUERY_PREFIXES = [
  "cockpit-laboratorio", "profiles-esteira", "cockpit-alertas-reconhecidos",
  "esteira-history", "pendencias-esteira", "cockpit-producao-resumo",
  "estoque-disponivel-lote", "metricas-laboratorio", "cockpit-is-hml",
] as const;

export function useCockpitScope(prefix: string, enabled = COCKPIT_READ_AVAILABLE) {
  const session = useTechnicalQuerySession(prefix);
  const client = useQueryClient();
  const ready = session.ready && enabled;
  const scope = JSON.stringify([session.scope, ready]);
  const current = useRef({ scope, epoch: 0, mounted: true });
  if (current.current.scope !== scope) {
    current.current = { scope, epoch: current.current.epoch + 1, mounted: true };
  }
  useEffect(() => {
    current.current.mounted = true;
    if (!ready) {
      const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === prefix;
      void client.cancelQueries({ predicate });
      client.removeQueries({ predicate });
    }
    return () => { current.current.mounted = false; };
  }, [client, prefix, ready, scope]);
  const fence = () => {
    const epoch = current.current.epoch;
    const assertSession = session.fence();
    return (signal: AbortSignal) => {
      assertSession(signal);
      if (!ready || !current.current.mounted || current.current.scope !== scope || current.current.epoch !== epoch) {
        throw new Error("cockpit_query_context_changed");
      }
    };
  };
  return { ready, scope, cacheScope: session.scope, fence };
}

/** Reuses the technical session contract, cancellation and old-scope eviction. */
export function useCockpitQuery<T>(
  options: Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryFn"> & {
    queryFn: (context: { signal: AbortSignal }) => Promise<T>;
    reader?: "listRPC";
  },
) {
  const prefix = String(options.queryKey?.[0]);
  const listOnly = COCKPIT_LIST_QUERY_AVAILABLE && prefix === "cockpit-laboratorio" &&
    options.reader === "listRPC" && options.queryKey?.[1] === COCKPIT_LIST_RPC;
  const session = useCockpitScope(prefix, (listOnly || COCKPIT_READ_AVAILABLE) && options.enabled !== false);
  const result = useQuery<T, Error, T, readonly unknown[]>({
    ...options,
    queryKey: [...(options.queryKey ?? []), session.cacheScope],
    enabled: session.ready,
    retry: false,
    queryFn: async ({ signal }) => {
      const assertCurrent = session.fence();
      assertCurrent(signal);
      const data = await options.queryFn({ signal });
      assertCurrent(signal);
      return data;
    },
  });
  // refetch() ignores enabled in TanStack Query; fence also guards manual retries.
  return { ...result, data: session.ready ? result.data : undefined, available: session.ready };
}
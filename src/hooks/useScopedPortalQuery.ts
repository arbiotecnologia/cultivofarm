import { useEffect } from "react";
import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useStorageAccessScope } from "./useStorageAccessScope";

/** Cache isolation only; each existing RPC/RLS must independently authorize. */
export function useScopedPortalQuery<T>(options: Omit<UseQueryOptions<T, Error>, "queryFn"> & { queryFn: (signal: AbortSignal) => Promise<T> }) {
  const fence = useStorageAccessScope(`portal:${JSON.stringify(options.queryKey)}:${options.enabled !== false}`);
  const actor = useStorageAccessScope("portal-query-actor");
  const client = useQueryClient();
  const prefix = options.queryKey[0];
  useEffect(() => {
    const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === prefix && query.queryKey.at(-2) !== actor.scope;
    void client.cancelQueries({ predicate }); client.removeQueries({ predicate });
    const queryKey = [...options.queryKey, actor.scope, fence.scope];
    return () => {
      const query = client.getQueryCache().find({ queryKey, exact: true });
      // Another mounted consumer of this exact request must not lose its cache.
      if (query && query.getObserversCount() > 1) return;
      void client.cancelQueries({ queryKey, exact: true }); client.removeQueries({ queryKey, exact: true });
    };
  }, [client, prefix, fence.scope, actor.scope]);
  const result = useQuery<T, Error>({
    ...options, queryKey: [...options.queryKey, actor.scope, fence.scope], enabled: fence.ready && options.enabled !== false, retry: false,
    queryFn: async ({ signal }) => {
      const current = fence.capture();
      if (!current() || signal.aborted) throw new Error("portal_context_unavailable");
      const data = await options.queryFn(signal);
      if (!current() || signal.aborted) throw new Error("portal_context_changed");
      return data;
    },
  });
  return { ...result, data: fence.ready ? result.data : undefined, ready: fence.ready, scope: fence.scope };
}
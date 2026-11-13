import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useStorageAccessScope } from "./useStorageAccessScope";

const PORTAL_META = "scopedPortalQuery";

/** Cache isolation only; each existing RPC/RLS must independently authorize. */
export function useScopedPortalQuery<T>(options: Omit<UseQueryOptions<T, Error>, "queryFn"> & { queryFn: (signal: AbortSignal) => Promise<T> }, access?: { request: ReturnType<typeof useStorageAccessScope>; actor: ReturnType<typeof useStorageAccessScope> }) {
  const serializedKey = JSON.stringify(options.queryKey);
  const stableKey = useMemo(() => JSON.parse(serializedKey) as readonly unknown[], [serializedKey]);
  const defaultFence = useStorageAccessScope(`portal:${serializedKey}:${options.enabled !== false}`);
  const defaultActor = useStorageAccessScope("portal-query-actor");
  const fence = access?.request ?? defaultFence;
  const actor = access?.actor ?? defaultActor;
  const client = useQueryClient();
  const prefix = options.queryKey[0];
  // Eviction identity is ALWAYS the canonical storage actor (ready/user/tenant/roles/epoch),
  // never parsed from resource-specific scopes (fiscal/platform scopes have other shapes).
  // Resource-specific actor/request scopes still key and fence each query.
  const identity = defaultActor.scope;
  useEffect(() => {
    // Evict only wrapper-owned caches of another identity/tenant/roles/epoch.
    // Different actor resources (same identity) and unrelated unscoped queries
    // sharing the prefix must not evict each other (caused mount/refetch loops).
    const predicate = (query: { queryKey: readonly unknown[]; meta?: Record<string, unknown> }) =>
      query.queryKey[0] === prefix && query.meta?.[PORTAL_META] === true && query.meta?.portalIdentity !== identity;
    void client.cancelQueries({ predicate }); client.removeQueries({ predicate });
    const queryKey = [...stableKey, actor.scope, fence.scope];
    return () => {
      const query = client.getQueryCache().find({ queryKey, exact: true });
      // Another mounted consumer of this exact request must not lose its cache.
      if (query && query.getObserversCount() > 1) return;
      void client.cancelQueries({ queryKey, exact: true }); client.removeQueries({ queryKey, exact: true });
    };
  }, [client, prefix, fence.scope, actor.scope, identity, stableKey]);
  const result = useQuery<T, Error>({
    ...options, meta: { ...options.meta, [PORTAL_META]: true, portalIdentity: identity }, queryKey: [...options.queryKey, actor.scope, fence.scope], enabled: fence.ready && options.enabled !== false, retry: false,
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
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useStorageAccessScope } from "./useStorageAccessScope";

const PORTAL_META = "scopedPortalQuery";
/** Identity part of a storage scope: everything except the resource name. */
export function actorIdentity(scope: string): string {
  try { const v = JSON.parse(scope) as unknown[]; return JSON.stringify([v[0], v[1], v[2], v[3], v[5]]); } catch { return scope; }
}

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
  const identity = actorIdentity(actor.scope);
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
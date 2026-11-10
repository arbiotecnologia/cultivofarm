import { useEffect } from "react";
import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

const financialKeys = new Set([
  "b2b-receivables", "b2b-financial-kpis", "pfs", "pfs-partners", "pfs-methods", "portal-partner-financial",
  "partner-credit", "portal-partner-credit", "b2b-gov-kpis", "b2b-aging",
  "b2b-aging-det", "b2b-forecast", "b2b-order-forecast", "b2b-profit", "b2b-exec-alerts",
  "b2b-carteira-kpis", "b2b-exec-dashboard", "partner-risk-score", "fgr",
]);

/** Cache/request isolation only; the server must prove A/P and creditor ownership. */
export function useScopedB2BFinancialQuery<T>(
  options: Omit<UseQueryOptions<T, Error>, "queryFn"> & { queryFn: () => Promise<T> },
) {
  const fence = useStorageAccessScope("b2b-financial");
  const client = useQueryClient();
  useEffect(() => {
    const predicate = (query: { queryKey: readonly unknown[] }) =>
      financialKeys.has(String(query.queryKey[0])) && query.queryKey.at(-1) !== fence.scope;
    void client.cancelQueries({ predicate });
    client.removeQueries({ predicate });
  }, [client, fence.scope]);
  const result = useQuery<T, Error>({
    ...options,
    queryKey: [...options.queryKey, fence.scope],
    enabled: fence.ready && options.enabled !== false,
    retry: false,
    queryFn: async ({ signal }) => {
      const current = fence.capture();
      if (!current() || signal.aborted) throw new Error("financial_context_unavailable");
      const data = await options.queryFn();
      if (!current() || signal.aborted) throw new Error("financial_context_changed");
      return data;
    },
  });
  return { ...result, data: fence.ready && !result.isError ? result.data : undefined, ready: fence.ready,
    scope: fence.scope };
}
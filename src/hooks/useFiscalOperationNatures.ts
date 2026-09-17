import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type PolicyNatureRow = { nature_operation: string | null };
type PolicyClient = {
  from: (table: "fiscal_operation_policies") => {
    select: (columns: "nature_operation") => {
      eq: (column: "policy_status", value: "PUBLISHED") => Promise<{
        data: PolicyNatureRow[] | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

export function normalizeNatureOperation(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 200);
}

export function uniqueNatureOperations(values: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const raw of values) {
    const value = normalizeNatureOperation(raw);
    if (!value) continue;
    const key = value.toLocaleLowerCase("pt-BR");
    if (!unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()];
}

export function usePublishedFiscalOperationNatures(enabled = true) {
  return useQuery({
    queryKey: ["fiscal", "operation-natures", "published"],
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const client = supabase as unknown as PolicyClient;
      const { data, error } = await client
        .from("fiscal_operation_policies")
        .select("nature_operation")
        .eq("policy_status", "PUBLISHED");
      if (error) throw new Error("Não foi possível consultar as naturezas das políticas fiscais.");
      if (!Array.isArray(data)) throw new Error("Resposta inválida das políticas fiscais.");
      return uniqueNatureOperations(data.map((row) => row.nature_operation ?? ""));
    },
  });
}
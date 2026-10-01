/**
 * Fase S3 — o que a empresa do usuário pode usar (RPC `get_my_entitlements`).
 * Carregado uma vez por sessão; superadmin não consulta (não tem empresa).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { EntitlementState } from "@/lib/saas/featureRouteMap";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useEntitlements(): EntitlementState {
  const { user, roles } = useAuth();
  const isSuper = (roles ?? []).includes("superadmin" as never);
  const q = useQuery<string[]>({
    queryKey: ["saas", "entitlements", user?.id ?? null],
    enabled: !!user && !isSuper,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_my_entitlements");
      if (error) throw new Error("entitlements_indisponivel");
      return ((data ?? []) as { feature_key: string }[]).map((r) => r.feature_key);
    },
  });
  if (!q.isSuccess) return { status: "unknown" };
  return { status: "ready", features: new Set(q.data) };
}

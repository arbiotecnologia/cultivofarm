/**
 * Fase S3 — o que a empresa do usuário pode usar (RPC `get_my_entitlements`).
 * O contexto é sempre decidido no servidor; nenhum papel local concede bypass.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { EntitlementState } from "@/lib/saas/featureRouteMap";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useEntitlements(): EntitlementState {
  const { user } = useAuth();
  const context = useQuery<string>({
    queryKey: ["saas", "entitlement-context", user?.id ?? null],
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_my_entitlement_context");
      if (error) throw new Error("entitlement_context_indisponivel");
      return String(data ?? "no_context");
    },
  });

  const eligible = context.data === "active" || context.data === "trial_active";
  const entitlements = useQuery<string[]>({
    queryKey: ["saas", "entitlements", user?.id ?? null],
    enabled: !!user && context.isSuccess && eligible,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_my_entitlements");
      if (error) throw new Error("entitlements_indisponivel");
      return ((data ?? []) as { feature_key: string }[]).map((r) => r.feature_key);
    },
  });

  if (context.isLoading) return { status: "loading" };
  if (!context.isSuccess) return { status: "error" };
  if (context.data === "platform_superadmin") return { status: "platform_superadmin" };
  if (context.data === "legacy_unversioned") return { status: "legacy_unversioned" };
  if (context.data === "no_subscription" || context.data === "no_context") return { status: "no_subscription" };
  if (context.data === "blocked_status" || context.data === "trial_expired") return { status: "blocked" };
  if (!eligible) return { status: "error" };
  if (entitlements.isLoading) return { status: "loading" };
  if (!entitlements.isSuccess) return { status: "error" };
  return { status: "ready", features: new Set(entitlements.data) };
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { NEUTRAL_RESPONSIBLE, responsibleLabel } from "@/lib/comercial/supplierName";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ActiveTenantName {
  /** Nome do tenant ativo, ou null enquanto não comprovado para o escopo atual. */
  name: string | null;
  /** Nome pronto para exibição; rótulo neutro quando ausente/carregando. */
  label: string;
}

/**
 * Nome da empresa (tenant) operadora em uso nas telas internas e no portal do cliente.
 * Reutiliza o RPC existente `org_onboarding_state` (organização derivada no servidor
 * de auth.uid()). Cache com chave por identidade/tenant/época; a resposta só é adotada
 * se o organization_id devolvido coincide com o tenant do perfil atual — sem nome antigo
 * durante carregamento, troca de tenant ou logout. Nunca usar no portal B2B como vendedor.
 */
export function useActiveTenantName(): ActiveTenantName {
  const { user, profile, loading, authzEpoch, authzSigningOut } = useAuth();
  const userId = user?.id ?? null;
  const orgId = typeof profile?.organization_id === "string" && UUID.test(profile.organization_id) ? profile.organization_id : null;
  const enabled = !loading && !authzSigningOut && !!userId && !!orgId;

  const query = useQuery({
    queryKey: ["active-tenant-name", userId, orgId, authzEpoch],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("org_onboarding_state");
      if (error) throw new Error(error.message);
      const d = (data ?? {}) as Record<string, unknown>;
      if (d.organization_id !== orgId) return null;
      const pick = [d.nome_fantasia, d.nome, d.razao_social].find((v) => typeof v === "string" && v.trim());
      return (pick as string | undefined)?.trim() ?? null;
    },
  });

  const name = enabled && query.isSuccess ? query.data ?? null : null;
  return { name, label: name ? responsibleLabel(name) : NEUTRAL_RESPONSIBLE };
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { NEUTRAL_RESPONSIBLE, responsibleLabel } from "@/lib/comercial/supplierName";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TENANT_DISPLAY_CONTRACT = "TENANT_DISPLAY_NAME_V1";

export interface ActiveTenantName {
  /** Nome do tenant ativo, ou null enquanto não comprovado para o escopo atual. */
  name: string | null;
  /** Nome pronto para exibição; rótulo neutro quando ausente/carregando/indisponível. */
  label: string;
}

/** Parser estrito: contrato exato, tenant = perfil atual, somente {contract, organization_id, name}. */
export function parseTenantDisplayName(raw: unknown, orgId: string): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("tenant_display_unavailable");
  const d = raw as Record<string, unknown>;
  const keys = Object.keys(d).sort().join(",");
  if (keys !== "contract,name,organization_id" || d.contract !== TENANT_DISPLAY_CONTRACT || d.organization_id !== orgId ||
      (d.name !== null && typeof d.name !== "string"))
    throw new Error("tenant_display_unavailable");
  const n = typeof d.name === "string" ? d.name.trim() : "";
  return n || null;
}

/**
 * Nome da empresa (tenant) operadora nas telas internas e no portal do cliente.
 * Fonte: RPC mínima `tenant_display_name_v1` (guard canônico h15_actor_organization: perfil ativo,
 * acesso pronto, organização ativa), que devolve SOMENTE o nome de exibição. Não usa org_onboarding_state
 * (que só traz nome ao administrador). Consulta apenas com sessão pronta (loading resolvido, authzReady,
 * sem logout em andamento/latch); cache por identidade/tenant/época; resposta adotada só se o
 * organization_id coincide com o perfil atual. Antes da instalação (ou qualquer erro) → rótulo neutro.
 */
export function useActiveTenantName(): ActiveTenantName {
  const { user, profile, loading, authzReady, authzEpoch, authzSigningOut, authzLatchBlocked } = useAuth();
  const userId = user?.id ?? null;
  const orgId = typeof profile?.organization_id === "string" && UUID.test(profile.organization_id) ? profile.organization_id : null;
  const enabled = !loading && authzReady === true && !authzSigningOut && !authzLatchBlocked && !!userId && !!orgId;

  const query = useQuery({
    queryKey: ["active-tenant-name", TENANT_DISPLAY_CONTRACT, userId, orgId, authzEpoch],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc("tenant_display_name_v1" as never)
        .abortSignal(signal);
      if (error) throw new Error("tenant_display_unavailable");
      return parseTenantDisplayName(data, orgId as string);
    },
  });

  const name = enabled && query.isSuccess ? query.data ?? null : null;
  return { name, label: name ? responsibleLabel(name) : NEUTRAL_RESPONSIBLE };
}

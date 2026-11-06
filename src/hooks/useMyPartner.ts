import { readOwnFinanceCapability } from "@/lib/comercial/financeAccess";
import { readOwnerOrderCapability } from "@/lib/comercial/ownerOrderAccess";
import { decodeC2Partner, isC2ExternalScope } from "@/lib/authz/multiProfileContract";
import { readCatalogCapabilities } from "@/lib/catalogo/catalogAccess";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

export type PartnerUserPapel = "gestor" | "tecnico";

/** Nome do vendedor na projeção B2B autorizada (campo aditivo 'seller'). */
export function readSellerName(partner: Record<string, unknown>, tenantId: string): string | null {
  if (!("seller" in partner) || partner.seller === null) return null;
  const s = partner.seller;
  if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error("partner_context_unavailable");
  const seller = s as Record<string, unknown>;
  if (seller.organization_id !== tenantId || (seller.name !== null && typeof seller.name !== "string"))
    throw new Error("partner_context_unavailable");
  const n = typeof seller.name === "string" ? seller.name.trim() : "";
  return n || null;
}

export function useMyPartner() {
  const { user, roles, profile } = useAuth();
  const fence = useStorageAccessScope("my-commercial-partner");
  const client = useQueryClient();
  const role = isC2ExternalScope(roles) ? roles.includes("parceiro_b2b") ? "parceiro_b2b" : roles.includes("parceiro_b2b_tecnico") ? "parceiro_b2b_tecnico" : null : null;
  const ready = fence.ready && profile?.senha_provisoria === false &&
    (role === "parceiro_b2b" || role === "parceiro_b2b_tecnico");
  useEffect(() => {
    const predicate = (q: { queryKey: readonly unknown[] }) =>
      q.queryKey[0] === "my-partner" && q.queryKey[1] !== fence.scope;
    void client.cancelQueries({ predicate });
    client.removeQueries({ predicate });
  }, [client, fence.scope]);
  const result = useQuery({
    queryKey: ["my-partner", fence.scope], enabled: ready, retry: false,
    queryFn: async ({ signal }) => {
      const current = fence.capture();
      const check = () => {
        if (!current() || signal.aborted) throw new Error("partner_context_changed");
      };
      check();
      // Canonical client only. Generated RPC names lag this additive migration;
      // keep response unknown and validate it rather than modifying generated types.
      const contextRpc = supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: unknown }>;
      const { data: rawContext, error } = await contextRpc.call(supabase, "get_my_commercial_partner_context");
      check();
      if (error) throw new Error("partner_context_unavailable");
      if (!rawContext) return null;
      if (typeof rawContext !== "object" || Array.isArray(rawContext))
        throw new Error("partner_context_unavailable");
      const context = decodeC2Partner(rawContext,user?.id ?? "",profile?.organization_id ?? "",roles);
      if (typeof context.partner_id !== "string" || context.organization_id !== profile?.organization_id ||
        context.role !== role || (context.papel !== "gestor" && context.papel !== "tecnico") ||
        !["commercial_owner", "legacy_partner_tenant"].includes(String(context.mode)))
        throw new Error("partner_context_unavailable");
      const { data: rawPartner, error: e2 } = await contextRpc.call(supabase, "get_my_commercial_partner_projection");
      check();
      if (e2) throw new Error("partner_context_unavailable");
      if (!rawPartner) return null;
      if (typeof rawPartner !== "object" || Array.isArray(rawPartner)) throw new Error("partner_context_unavailable");
      const partner = rawPartner as Record<string, unknown>;
      if (partner.contract !== "C2_MULTIPROFILE_V1" || partner.actor_id !== user?.id || partner.tenant_id !== profile?.organization_id || JSON.stringify(partner.external_roles) !== JSON.stringify(context.external_roles)) throw new Error("partner_context_unavailable");
      if (partner.id !== context.partner_id || partner.papel !== context.papel || partner.mode !== context.mode || partner.ativo !== true)
        throw new Error("partner_context_unavailable");
      if (typeof partner.razao_social !== "string" || typeof partner.codigo !== "string") throw new Error("partner_context_unavailable");
      // TENANT_DISPLAY_NAME_V1: 'seller' só existe após a instalação; ausente → null (neutro). Presente, deve ser o
      // vendedor (commercial owner = tenant do contexto), nunca o parceiro comprador; divergência falha fechado.
      const sellerName = readSellerName(partner, profile?.organization_id ?? "");
      return { id: context.partner_id, codigo: partner.codigo, razao_social: partner.razao_social,
        nome_fantasia: typeof partner.nome_fantasia === "string" ? partner.nome_fantasia : null,
        ativo: true, financeRead: readOwnFinanceCapability(partner.finance_capabilities), capabilities: readCatalogCapabilities(partner.capabilities),
        orderCreate: context.role === "parceiro_b2b" && readOwnerOrderCapability(partner.order_capabilities), papel: context.papel as PartnerUserPapel,
        mode: context.mode as "commercial_owner" | "legacy_partner_tenant", sellerName };
    },
  });
  return { ...result, data: ready && !result.isError ? result.data : undefined, ready, scope: fence.scope };
}

/** Papel efetivo do usuário parceiro logado — considera role + vínculo. */
export function usePartnerPapel(): { papel: PartnerUserPapel | null; isTecnico: boolean; isGestor: boolean } {
  const { data } = useMyPartner();
  const papel = data?.papel ?? null;
  return { papel, isTecnico: papel === "tecnico", isGestor: papel === "gestor" };
}

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

export type PartnerUserPapel = "gestor" | "tecnico";

export function useMyPartner() {
  const { roles, profile } = useAuth();
  const fence = useStorageAccessScope("my-commercial-partner");
  const client = useQueryClient();
  const role = roles.length === 1 ? roles[0] : null;
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
      const { data: context, error } = await supabase.rpc("get_my_commercial_partner_context");
      check();
      if (error) throw new Error("partner_context_unavailable");
      if (!context) return null;
      if (typeof context !== "object" || Array.isArray(context) ||
        typeof context.partner_id !== "string" || context.organization_id !== profile?.organization_id ||
        context.role !== role || (context.papel !== "gestor" && context.papel !== "tecnico") ||
        !["commercial_owner", "legacy_partner_tenant"].includes(String(context.mode)))
        throw new Error("partner_context_unavailable");
      const { data: partner, error: e2 } = await supabase
        .from("partner_accounts")
        .select("id, codigo, razao_social, nome_fantasia, desconto_padrao, ativo")
        .eq("id", context.partner_id)
        .abortSignal(signal)
        .maybeSingle();
      check();
      if (e2) throw new Error("partner_context_unavailable");
      if (!partner || partner.ativo !== true) return null;
      return { ...partner, papel: context.papel as PartnerUserPapel };
    },
  });
  return { ...result, data: ready ? result.data : undefined, ready, scope: fence.scope };
}

/** Papel efetivo do usuário parceiro logado — considera role + vínculo. */
export function usePartnerPapel(): { papel: PartnerUserPapel | null; isTecnico: boolean; isGestor: boolean } {
  const { data } = useMyPartner();
  const papel = data?.papel ?? null;
  return { papel, isTecnico: papel === "tecnico", isGestor: papel === "gestor" };
}

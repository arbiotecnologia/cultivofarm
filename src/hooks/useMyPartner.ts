import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PartnerUserPapel = "gestor" | "tecnico";

export function useMyPartner() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-partner", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: pu, error: e1 } = await (supabase as any)
        .from("partner_users")
        .select("partner_id, papel")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (e1) throw e1;
      if (!pu) return null;
      const { data: partner, error: e2 } = await (supabase as any)
        .from("partner_accounts")
        .select("id, codigo, razao_social, nome_fantasia, desconto_padrao, ativo")
        .eq("id", (pu as any).partner_id)
        .maybeSingle();
      if (e2) throw e2;
      if (!partner) return null;
      return { ...partner, papel: ((pu as any).papel ?? "gestor") as PartnerUserPapel };
    },
  });
}

/** Papel efetivo do usuário parceiro logado — considera role + vínculo. */
export function usePartnerPapel(): { papel: PartnerUserPapel; isTecnico: boolean; isGestor: boolean } {
  const { data } = useMyPartner();
  const papel = ((data as any)?.papel ?? "gestor") as PartnerUserPapel;
  return { papel, isTecnico: papel === "tecnico", isGestor: papel === "gestor" };
}

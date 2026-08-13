import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PartnerUserPapel = "gestor" | "tecnico";

export interface PartnerUserRow {
  id: string;
  user_id: string;
  partner_id: string;
  papel: PartnerUserPapel;
  created_at: string;
  email?: string | null;
  nome?: string | null;
}

export function usePartnerUsers(partnerId: string | null | undefined) {
  return useQuery({
    queryKey: ["partner-users", partnerId],
    enabled: !!partnerId,
    queryFn: async (): Promise<PartnerUserRow[]> => {
      const { data: links, error } = await (supabase as any)
        .from("partner_users")
        .select("*")
        .eq("partner_id", partnerId!);
      if (error) throw error;
      const ids = (links ?? []).map((l: any) => l.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("user_id, nome, email")
        .in("user_id", ids as any);
      const pmap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      return (links ?? []).map((l: any) => ({
        ...l,
        papel: (l.papel ?? "gestor") as PartnerUserPapel,
        email: pmap.get(l.user_id)?.email ?? null,
        nome: pmap.get(l.user_id)?.nome ?? null,
      }));
    },
  });
}

export function useAvailablePartnerUsers() {
  return useQuery({
    queryKey: ["available-partner-users"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: linked }, { data: roles }] = await Promise.all([
        (supabase as any).from("profiles").select("user_id, nome, email").order("nome"),
        (supabase as any).from("partner_users").select("user_id"),
        (supabase as any).from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      const linkedSet = new Set((linked ?? []).map((l: any) => l.user_id));
      const rolesMap = new Map<string, string[]>();
      (roles ?? []).forEach((r: any) => {
        const arr = rolesMap.get(r.user_id) ?? [];
        arr.push(r.role);
        rolesMap.set(r.user_id, arr);
      });
      return (profiles ?? [])
        .filter((p: any) => !linkedSet.has(p.user_id))
        .filter((p: any) => {
          const rs = rolesMap.get(p.user_id) ?? [];
          return rs.includes("parceiro_b2b") || rs.includes("parceiro_b2b_tecnico");
        })
        .map((p: any) => ({
          user_id: p.user_id,
          nome: p.nome,
          email: p.email,
          roles: rolesMap.get(p.user_id) ?? [],
        }));
    },
  });
}

export function useLinkPartnerUser(partnerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, papel }: { user_id: string; papel: PartnerUserPapel }) => {
      const { error } = await supabase.rpc("link_partner_user" as any, {
        p_partner_id: partnerId,
        p_user_id: user_id,
        p_papel: papel,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["partner-users", partnerId] });
      qc.invalidateQueries({ queryKey: ["available-partner-users"] });
      toast.success(
        vars.papel === "tecnico"
          ? "Usuário vinculado como Técnico B2B"
          : "Usuário vinculado como Gestor B2B",
      );
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "");
      if (msg.includes("partner_users_user_id_key")) {
        toast.error("Este usuário já está vinculado a outro parceiro");
      } else if (msg.includes("Parceiro B2B ou Técnico B2B")) {
        toast.error("Usuário sem perfil válido", {
          description:
            "Só é possível vincular usuários com perfil Parceiro B2B ou Técnico B2B. Ajuste o perfil em Configurações → Usuários antes de vincular.",
        });
      } else toast.error(msg || "Erro ao vincular usuário");
    },
  });
}

export function useUpdatePartnerUserPapel(partnerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ linkId, papel }: { linkId: string; papel: PartnerUserPapel }) => {
      const { error } = await supabase.rpc("set_partner_user_papel" as any, {
        p_link_id: linkId,
        p_papel: papel,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-users", partnerId] });
      toast.success("Papel atualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar papel"),
  });
}

export function useUnlinkPartnerUser(partnerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await (supabase as any).from("partner_users").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-users", partnerId] });
      qc.invalidateQueries({ queryKey: ["available-partner-users"] });
      toast.success("Vínculo removido");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover vínculo"),
  });
}

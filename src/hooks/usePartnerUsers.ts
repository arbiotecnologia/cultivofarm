import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
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

// This read fence supplements RLS; it never grants partner ownership.
function usePartnerReadScope(partnerId?: string | null) {
  const { user, profile, roles, loading } = useAuth();
  const client = useQueryClient();
  const ready = !loading && !!user?.id && profile?.user_id === user.id &&
    profile.ativo === true && profile.senha_provisoria === false &&
    !!profile.organization_id && roles.some(r => r === "administrador" || r === "gestor_comercial");
  const scope = JSON.stringify([ready, user?.id, profile?.user_id, profile?.organization_id, [...roles].sort(), partnerId]);
  const current = useRef({ scope, epoch: 0, mounted: true });
  if (current.current.scope !== scope) { current.current.scope = scope; current.current.epoch += 1; }
  useEffect(() => {
    const state = current.current;
    state.mounted = true;
    return () => { state.mounted = false; state.epoch += 1; };
  }, []);
  useEffect(() => {
    const predicate = (q: { queryKey: readonly unknown[] }) =>
      ["partner-users", "available-partner-users"].includes(String(q.queryKey[0])) && q.queryKey[1] !== scope;
    void client.cancelQueries({ predicate });
    client.removeQueries({ predicate });
  }, [scope, client]);
  const authorize = async (signal: AbortSignal) => {
    const epoch = current.current.epoch;
    const check = () => {
      if (signal.aborted || !current.current.mounted || current.current.scope !== scope || current.current.epoch !== epoch)
        throw new Error("partner_context_changed");
    };
    if (!ready || !partnerId) throw new Error("partner_context_not_ready");
    const { data: partner, error } = await supabase.from("partner_accounts")
      .select("commercial_owner_organization_id").eq("id", partnerId).abortSignal(signal).maybeSingle();
    check();
    if (error || !partner?.commercial_owner_organization_id ||
      partner.commercial_owner_organization_id !== profile?.organization_id)
      throw new Error("partner_ownership_unavailable");
    return check;
  };
  return { ready: ready && !!partnerId, scope, authorize, organizationId: profile?.organization_id, loading };
}

export function usePartnerUsers(partnerId: string | null | undefined) {
  const context = usePartnerReadScope(partnerId);
  const result = useQuery({
    queryKey: ["partner-users", context.scope], enabled: context.ready, retry: false,
    queryFn: async ({ signal }): Promise<PartnerUserRow[]> => {
      const check = await context.authorize(signal);
      const { data: links, error } = await supabase.from("partner_users")
        .select("*").eq("partner_id", partnerId ?? "").abortSignal(signal);
      check(); if (error) throw new Error("partner_users_unavailable");
      const ids = (links ?? []).map(l => l.user_id);
      if (!ids.length) return [];
      const { data: profiles, error: profileError } = await supabase.from("profiles")
        .select("user_id, nome, email").eq("organization_id", context.organizationId ?? "")
        .eq("ativo", true).in("user_id", ids).abortSignal(signal);
      check(); if (profileError) throw new Error("partner_users_unavailable");
      const pmap = new Map((profiles ?? []).map(p => [p.user_id, p]));
      return (links ?? []).filter(l => pmap.has(l.user_id)).map(l => ({
        ...l, papel: l.papel === "tecnico" ? "tecnico" : "gestor",
        email: pmap.get(l.user_id)?.email, nome: pmap.get(l.user_id)?.nome,
      }));
    },
  });
  return { ...result, data: context.ready ? result.data : undefined, ready: context.ready,
    scope: context.scope, isLoading: context.loading || (context.ready && result.isLoading) };
}

export function useAvailablePartnerUsers(partnerId?: string | null) {
  const context = usePartnerReadScope(partnerId);
  const result = useQuery({
    queryKey: ["available-partner-users", context.scope], enabled: context.ready, retry: false,
    queryFn: async ({ signal }) => {
      const check = await context.authorize(signal);
      const [profiles, linked, roles] = await Promise.all([
        supabase.from("profiles").select("user_id, nome, email").eq("organization_id", context.organizationId ?? "").eq("ativo", true).order("nome").abortSignal(signal),
        supabase.from("partner_users").select("user_id").abortSignal(signal),
        supabase.from("user_roles").select("user_id, role").abortSignal(signal),
      ]);
      check();
      if (profiles.error || linked.error || roles.error) throw new Error("partner_users_unavailable");
      const linkedSet = new Set((linked.data ?? []).map(l => l.user_id));
      return (profiles.data ?? []).filter(p => !linkedSet.has(p.user_id)).map(p => ({
        ...p, roles: (roles.data ?? []).filter(r => r.user_id === p.user_id).map(r => r.role),
      })).filter(p => p.roles.length === 1 && (p.roles[0] === "parceiro_b2b" || p.roles[0] === "parceiro_b2b_tecnico"));
    },
  });
  return { ...result, data: context.ready ? result.data : undefined, ready: context.ready, scope: context.scope };
}

export const PARTNER_REGISTRATION_UNAVAILABLE = "Cadastro e alteração de acessos Parceiro B2B indisponíveis: falta um contrato integrado que comprove a empresa do parceiro e do usuário. Nenhum vínculo ou perfil será atribuído automaticamente.";

export function useLinkPartnerUser(partnerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, papel }: { user_id: string; papel: PartnerUserPapel }) => {
      void user_id; void papel; void partnerId;
      throw new Error(PARTNER_REGISTRATION_UNAVAILABLE);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["partner-users"] });
      qc.invalidateQueries({ queryKey: ["available-partner-users"] });
      toast.success(
        vars.papel === "tecnico"
          ? "Usuário vinculado como Técnico B2B"
          : "Usuário vinculado como Gestor B2B",
      );
    },
    onError: (e: Error) => {
      const msg = String(e?.message ?? "");
      if (msg.includes("partner_users_user_id_key")) {
        toast.error("Este usuário já está vinculado a outro parceiro");
      } else if (msg.includes("Parceiro B2B ou Técnico B2B")) {
        toast.error("Usuário sem perfil válido", {
          description:
            PARTNER_REGISTRATION_UNAVAILABLE,
        });
      } else toast.error(msg || "Erro ao vincular usuário");
    },
  });
}

export function useUpdatePartnerUserPapel(partnerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ linkId, papel }: { linkId: string; papel: PartnerUserPapel }) => {
      void linkId; void papel; void partnerId;
      throw new Error(PARTNER_REGISTRATION_UNAVAILABLE);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-users"] });
      toast.success("Papel atualizado");
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao atualizar papel"),
  });
}

export function useUnlinkPartnerUser(partnerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) => {
      void linkId; void partnerId;
      throw new Error(PARTNER_REGISTRATION_UNAVAILABLE);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-users"] });
      qc.invalidateQueries({ queryKey: ["available-partner-users"] });
      toast.success("Vínculo removido");
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao remover vínculo"),
  });
}

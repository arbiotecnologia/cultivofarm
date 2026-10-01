/**
 * Home provisória do Superadmin de Plataforma — leitura somente.
 *
 * Consultas diretas às tabelas do núcleo SaaS (Fase S1). A autorização real é
 * do servidor: policy `saas_platform_read` (SELECT) via
 * `public.is_platform_superadmin(auth.uid())`. Nenhuma escrita existe aqui —
 * não há policy de INSERT/UPDATE/DELETE nessas tabelas.
 *
 * Os tipos gerados ainda não incluem as tabelas `saas_*`; por isso o cliente
 * canônico é usado com cast local. NÃO criar cliente Supabase paralelo.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Limite defensivo de leitura — evita truncagem silenciosa em 1000 linhas. */
const LIMITE = 200;

export interface PlanoSaaS {
  id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  is_default: boolean;
  created_at: string;
}

export interface AssinaturaSaaS {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  billing_cycle: string | null;
  started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  suspended_at: string | null;
  created_at: string;
}

export interface HistoricoSaaS {
  id: string;
  subscription_id: string;
  organization_id: string;
  source: string;
  reason: string | null;
  created_at: string;
}

export interface ModuloSaaS {
  id: string;
  key: string;
  name: string;
  active: boolean;
}

export interface FeatureSaaS {
  id: string;
  module_id: string;
  key: string;
  name: string;
  active: boolean;
}

const opcoes = { retry: false, staleTime: 30_000 } as const;

export function usePlanosSaaS() {
  return useQuery<PlanoSaaS[]>({
    queryKey: ["plataforma", "saas_plans"],
    queryFn: async () => {
      const { data, error } = await db
        .from("saas_plans")
        .select("id,key,name,description,active,is_default,created_at")
        .order("is_default", { ascending: false })
        .order("key", { ascending: true })
        .limit(LIMITE);
      if (error) throw new Error(error.message);
      return (data ?? []) as PlanoSaaS[];
    },
    ...opcoes,
  });
}

export function useModulosFeaturesSaaS() {
  return useQuery<{ modulos: ModuloSaaS[]; features: FeatureSaaS[] }>({
    queryKey: ["plataforma", "saas_modules_features"],
    queryFn: async () => {
      const [mod, feat] = await Promise.all([
        db.from("saas_modules").select("id,key,name,active").order("key").limit(LIMITE),
        db
          .from("saas_features")
          .select("id,module_id,key,name,active")
          .order("key")
          .limit(LIMITE),
      ]);
      if (mod.error) throw new Error(mod.error.message);
      if (feat.error) throw new Error(feat.error.message);
      return {
        modulos: (mod.data ?? []) as ModuloSaaS[],
        features: (feat.data ?? []) as FeatureSaaS[],
      };
    },
    ...opcoes,
  });
}

export function useAssinaturasSaaS() {
  return useQuery<AssinaturaSaaS[]>({
    queryKey: ["plataforma", "organization_subscriptions"],
    queryFn: async () => {
      const { data, error } = await db
        .from("organization_subscriptions")
        .select(
          "id,organization_id,plan_id,status,billing_cycle,started_at,trial_ends_at," +
            "current_period_start,current_period_end,cancelled_at,suspended_at,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(LIMITE);
      if (error) throw new Error(error.message);
      return (data ?? []) as AssinaturaSaaS[];
    },
    ...opcoes,
  });
}

export function useHistoricoAssinaturasSaaS() {
  return useQuery<HistoricoSaaS[]>({
    queryKey: ["plataforma", "organization_subscription_history"],
    queryFn: async () => {
      const { data, error } = await db
        .from("organization_subscription_history")
        .select("id,subscription_id,organization_id,source,reason,created_at")
        .order("created_at", { ascending: false })
        .limit(LIMITE);
      if (error) throw new Error(error.message);
      return (data ?? []) as HistoricoSaaS[];
    },
    ...opcoes,
  });
}

export function useOrganizacoesSaaS() {
  return useQuery<{ id: string; nome: string }[]>({
    queryKey: ["plataforma", "organizations"],
    queryFn: async () => {
      const { data, error } = await db
        .from("organizations")
        .select("id,nome")
        .order("nome")
        .limit(LIMITE);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string; nome: string | null }[]).map((o) => ({
        id: o.id,
        nome: o.nome ?? "—",
      }));
    },
    ...opcoes,
  });
}

// ===== Fase S3 — exceções por empresa e gestão de assinatura =====

export interface ExcecaoSaaS {
  id: string;
  organization_id: string;
  feature_id: string;
  mode: "GRANT" | "REVOKE";
  limit_value: number | null;
  starts_at: string;
  ends_at: string | null;
  reason: string;
  ended_at: string | null;
  end_reason: string | null;
  created_at: string;
}

export function useExcecoesSaaS() {
  return useQuery<ExcecaoSaaS[]>({
    queryKey: ["plataforma", "organization_feature_overrides"],
    queryFn: async () => {
      const { data, error } = await db
        .from("organization_feature_overrides")
        .select(
          "id,organization_id,feature_id,mode,limit_value,starts_at,ends_at,reason,ended_at,end_reason,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(LIMITE);
      if (error) throw new Error(error.message);
      return (data ?? []) as ExcecaoSaaS[];
    },
    ...opcoes,
  });
}

/** Converte erros `platform_*` do servidor em mensagem segura em PT-BR. */
export function mensagemErroPlataforma(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  const m = msg.match(/platform_(?:invalid|conflict|forbidden):\s*(.+)/);
  if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1) + ".";
  return "Não foi possível concluir a operação. Recarregue e confira antes de tentar de novo.";
}

function useInvalidarPlataforma() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["plataforma"] });
}

export function useCriarExcecao() {
  const invalidar = useInvalidarPlataforma();
  return useMutation({
    retry: false,
    mutationFn: async (v: {
      organizationId: string;
      featureKey: string;
      mode: "GRANT" | "REVOKE";
      reason: string;
      endsAt: string | null;
    }) => {
      const { data, error } = await db.rpc("platform_set_feature_override", {
        _organization_id: v.organizationId,
        _feature_key: v.featureKey,
        _mode: v.mode,
        _reason: v.reason,
        _ends_at: v.endsAt,
        _limit_value: null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSettled: invalidar,
  });
}

export function useEncerrarExcecao() {
  const invalidar = useInvalidarPlataforma();
  return useMutation({
    retry: false,
    mutationFn: async (v: { id: string; reason: string }) => {
      const { error } = await db.rpc("platform_end_feature_override", {
        _override_id: v.id,
        _reason: v.reason,
      });
      if (error) throw new Error(error.message);
    },
    onSettled: invalidar,
  });
}

export function useAlterarAssinatura() {
  const invalidar = useInvalidarPlataforma();
  return useMutation({
    retry: false,
    mutationFn: async (v: {
      organizationId: string;
      planKey: string;
      status: string;
      reason: string;
    }) => {
      const { error } = await db.rpc("platform_change_subscription", {
        _organization_id: v.organizationId,
        _plan_key: v.planKey,
        _status: v.status,
        _reason: v.reason,
      });
      if (error) throw new Error(error.message);
    },
    onSettled: invalidar,
  });
}

// ===== Convite de administrador de empresa (provisionamento) =====

export interface ConviteAdminEmpresa {
  id: string;
  organization_id: string;
  user_id: string;
  email: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  modo_acesso: "link" | "senha_temporaria";
  responsavel_principal: boolean;
  created_at: string;
}

export function useConvitesAdminEmpresa() {
  return useQuery<ConviteAdminEmpresa[]>({
    queryKey: ["plataforma", "platform_org_admin_invites"],
    queryFn: async () => {
      const { data, error } = await db
        .from("platform_org_admin_invites")
        .select(
          "id,organization_id,user_id,email,nome,cpf_cnpj,telefone,modo_acesso,responsavel_principal,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(LIMITE);
      if (error) throw new Error(error.message);
      return (data ?? []) as ConviteAdminEmpresa[];
    },
    ...opcoes,
  });
}

export interface ResultadoConvite {
  user_id: string;
  action_link: string | null;
  senha_temporaria: string | null;
}

export function useConvidarAdminEmpresa() {
  const invalidar = useInvalidarPlataforma();
  return useMutation<
    ResultadoConvite,
    Error,
    {
      organizationId: string;
      nome: string;
      email: string;
      cpf: string;
      telefone: string;
      modo: "link" | "senha_temporaria";
      responsavelPrincipal: boolean;
    }
  >({
    retry: false,
    mutationFn: async (v) => {
      const { data, error } = await supabase.functions.invoke("platform-invite-org-admin", {
        body: {
          organization_id: v.organizationId,
          nome: v.nome,
          email: v.email,
          cpf: v.cpf || null,
          telefone: v.telefone || null,
          modo_acesso: v.modo,
          responsavel_principal: v.responsavelPrincipal,
        },
      });
      const payload = (data ?? {}) as Record<string, unknown>;
      if (error || payload.error) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Não foi possível criar o acesso do administrador.",
        );
      }
      return {
        user_id: String(payload.user_id ?? ""),
        action_link: (payload.action_link as string | null) ?? null,
        senha_temporaria: (payload.senha_temporaria as string | null) ?? null,
      };
    },
    onSettled: invalidar,
  });
}

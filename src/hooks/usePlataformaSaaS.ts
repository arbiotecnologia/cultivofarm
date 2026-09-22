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
import { useQuery } from "@tanstack/react-query";
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

/**
 * Gestão SaaS do Superadmin de Plataforma.
 *
 * Consultas e comandos do núcleo SaaS. A autorização real é
 * do servidor: policy `saas_platform_read` (SELECT) via
 * `public.is_platform_superadmin(auth.uid())`; escritas usam exclusivamente RPCs auditadas.
 *
 * Os tipos gerados ainda não incluem as tabelas `saas_*`; por isso o cliente
 * canônico é usado com cast local. NÃO criar cliente Supabase paralelo.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { createSubscriptionTransition, SubscriptionResultUnknown, type SubscriptionAction } from "@/lib/saas/subscriptionTransition";

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
  plan_version_id: string | null;
  status: string;
  billing_cycle: string | null;
  billing_cycle_snapshot: string | null;
  price_snapshot: number | null;
  currency_snapshot: string | null;
  limits_snapshot: Record<string, unknown> | null;
  features_snapshot: unknown[] | null;
  started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  cancel_at: string | null;
  suspended_at: string | null;
  created_at: string;
}

export interface HistoricoSaaS {
  id: string;
  subscription_id: string;
  organization_id: string;
  source: string;
  action: string | null;
  reason: string | null;
  correlation_id: string | null;
  previous_status: string | null;
  new_status: string | null;
  previous_plan_version_id: string | null;
  new_plan_version_id: string | null;
  created_at: string;
}

export interface VersaoPlanoSaaS {
  id: string;
  plan_id: string;
  version_number: number;
  name_snapshot: string;
  description_snapshot: string | null;
  price_amount: number | null;
  currency: string | null;
  billing_cycle: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  trial_days: number | null;
  revision: number;
  limits_snapshot: Record<string, unknown>;
  features_snapshot: Array<{ feature_id: string; enabled?: boolean; limit_value?: number | null; config?: unknown }>;
  effective_from: string | null;
  effective_to: string | null;
  publication_reason: string | null;
  correlation_id: string | null;
  created_at: string;
}

export interface ModuloSaaS {
  id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface FeatureSaaS {
  id: string;
  module_id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  commercializable: boolean;
  created_at: string;
}

export interface LimiteSaaS {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  value_type: "integer" | "decimal";
  application: string;
  active: boolean;
}

export interface FeatureLimiteSaaS {
  feature_id: string;
  limit_definition_id: string;
  required: boolean;
}

export interface FeatureDependenciaSaaS {
  feature_id: string;
  depends_on_feature_id: string;
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

export function useVersoesPlanosSaaS() {
  return useQuery<VersaoPlanoSaaS[]>({
    queryKey: ["plataforma", "saas_plan_versions"],
    queryFn: async () => {
      const { data, error } = await db
        .from("saas_plan_versions")
        .select(
          "id,plan_id,version_number,name_snapshot,description_snapshot,price_amount,currency,billing_cycle,status,trial_days,revision," +
            "limits_snapshot,features_snapshot,effective_from,effective_to,publication_reason,correlation_id,created_at",
        )
        .order("effective_from", { ascending: false })
        .limit(LIMITE);
      if (error) throw new Error(error.message);
      return (data ?? []) as VersaoPlanoSaaS[];
    },
    ...opcoes,
  });
}

export function useModulosFeaturesSaaS() {
  return useQuery<{ modulos: ModuloSaaS[]; features: FeatureSaaS[] }>({
    queryKey: ["plataforma", "saas_modules_features"],
    queryFn: async () => {
      const [mod, feat] = await Promise.all([
        db.from("saas_modules").select("id,key,name,description,active").order("key").limit(LIMITE),
        db
          .from("saas_features")
          .select("id,module_id,key,name,description,active,commercializable,created_at")
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

export function useCatalogoPlanosSaaS() {
  return useQuery<{
    modules: ModuloSaaS[]; features: FeatureSaaS[];
    limits: LimiteSaaS[]; featureLimits: FeatureLimiteSaaS[]; dependencies: FeatureDependenciaSaaS[];
  }>({
    queryKey: ["plataforma", "saas_plan_feature_catalog"],
    queryFn: async () => {
      const [modules, features, limits, featureLimits, dependencies] = await Promise.all([
        db.from("saas_modules").select("id,key,name,description,active").order("name").limit(LIMITE),
        db.from("saas_features").select("id,module_id,key,name,description,active,commercializable,created_at").order("name").limit(LIMITE),
        db.from("saas_limit_definitions").select("id,key,name,description,category,unit,value_type,application,active").order("category").order("name").limit(LIMITE),
        db.from("saas_feature_limit_definitions").select("feature_id,limit_definition_id,required").limit(LIMITE),
        db.from("saas_feature_dependencies").select("feature_id,depends_on_feature_id").limit(LIMITE),
      ]);
      if (modules.error) throw new Error(modules.error.message);
      if (features.error) throw new Error(features.error.message);
      if (limits.error) throw new Error(limits.error.message);
      if (featureLimits.error) throw new Error(featureLimits.error.message);
      if (dependencies.error) throw new Error(dependencies.error.message);
      return {
        modules: (modules.data ?? []) as ModuloSaaS[], features: (features.data ?? []) as FeatureSaaS[],
        limits: (limits.data ?? []) as LimiteSaaS[], featureLimits: (featureLimits.data ?? []) as FeatureLimiteSaaS[],
        dependencies: (dependencies.data ?? []) as FeatureDependenciaSaaS[],
      };
    },
    ...opcoes,
  });
}

export function useAssinaturasSaaS(organizationId?: string) {
  return useQuery<AssinaturaSaaS[]>({
    queryKey: organizationId ? ["plataforma", "organization_subscriptions", organizationId] : ["plataforma", "organization_subscriptions"],
    queryFn: async () => {
      let query = db
        .from("organization_subscriptions")
        .select(
          "id,organization_id,plan_id,plan_version_id,status,billing_cycle,billing_cycle_snapshot," +
            "price_snapshot,currency_snapshot,limits_snapshot,features_snapshot,started_at,trial_ends_at," +
            "current_period_start,current_period_end,cancelled_at,cancel_at,suspended_at,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(LIMITE);
      if (organizationId) query = query.eq("organization_id", organizationId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as AssinaturaSaaS[];
    },
    ...opcoes,
  });
}

export function useHistoricoAssinaturasSaaS(organizationId?: string) {
  return useQuery<HistoricoSaaS[]>({
    queryKey: organizationId ? ["plataforma", "organization_subscription_history", organizationId] : ["plataforma", "organization_subscription_history"],
    queryFn: async () => {
      let query = db
        .from("organization_subscription_history")
        .select(
          "id,subscription_id,organization_id,source,action,reason,correlation_id,previous_status,new_status," +
            "previous_plan_version_id,new_plan_version_id,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(LIMITE);
      if (organizationId) query = query.eq("organization_id", organizationId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as HistoricoSaaS[];
    },
    ...opcoes,
  });
}

export interface OrganizacaoSaaS {
  id: string;
  nome: string;
  status: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  email_corporativo: string | null;
  created_at: string;
  updated_at: string | null;
  responsavel_user_id?: string | null;
}

export function useOrganizacoesSaaS() {
  return useQuery<OrganizacaoSaaS[]>({
    queryKey: ["plataforma", "organizations"],
    queryFn: async () => {
      const { data, error } = await db
        .from("organizations")
        .select("id,nome,status,nome_fantasia,cnpj,email_corporativo,created_at,updated_at,responsavel_user_id")
        .order("nome")
        .limit(LIMITE);
      if (error) throw new Error(error.message);
      return ((data ?? []) as (Omit<OrganizacaoSaaS, "nome"> & { nome: string | null })[]).map((o) => ({
        ...o,
        nome: o.nome ?? "—",
      }));
    },
    ...opcoes,
  });
}

export function useCriarEmpresa() {
  const invalidar = useInvalidarPlataforma();
  return useMutation({
    retry: false,
    mutationFn: async (v: {
      nome: string;
      nomeFantasia: string;
      cnpj: string;
      email: string;
      planKey: string;
      rascunho: boolean;
      dados?: Record<string, string>;
    }) => {
      const { data, error } = await db.rpc("platform_create_organization", {
        _nome: v.nome,
        _nome_fantasia: v.nomeFantasia,
        _cnpj: v.cnpj,
        _email: v.email,
        _plan_key: v.planKey,
        _rascunho: v.rascunho,
        _dados: v.dados ?? {},
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: invalidar,
  });
}

export function useAlterarStatusEmpresa() {
  const invalidar = useInvalidarPlataforma();
  return useMutation({
    retry: false,
    mutationFn: async (v: { org: string; status: string; motivo: string }) => {
      const { error } = await db.rpc("platform_set_organization_status", {
        _org: v.org,
        _status: v.status,
        _motivo: v.motivo,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
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

/** Mensagens seguras para erros conhecidos de `platform_transition_subscription`. */
export function mensagemErroAssinatura(e: unknown): string {
  if (e instanceof SubscriptionResultUnknown) return `Não foi possível confirmar o resultado. Confira o histórico e a sessão antes de tentar novamente com os mesmos dados. Nenhuma repetição automática foi feita. Código: ${e.correlationId}`;
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("platform_forbidden")) return "Seu acesso não permite concluir esta operação.";
  if (msg.includes("assinatura legada")) return "Esta assinatura é antiga e só pode ser regularizada com “Alterar plano” para uma versão publicada e vigente.";
  if (msg.includes("versão inexistente ou fora de vigência") || msg.includes("versão inexistente, não publicada ou fora de vigência")) return "A versão escolhida não está publicada ou não está em vigência. Escolha outra versão.";
  if (msg.includes("versão obrigatória")) return "Escolha a versão do plano.";
  if (msg.includes("motivo e correlação")) return "Informe um motivo com pelo menos 5 caracteres.";
  if (msg.includes("trial já utilizado")) return "Esta empresa já usou o período de teste.";
  if (msg.includes("trial exige")) return "O teste só pode começar em empresa sem assinatura em andamento.";
  if (msg.includes("assinatura corrente inexistente")) return "Esta empresa não tem assinatura em andamento.";
  if (msg.includes("transição inválida")) return "Esta ação não é permitida na situação atual da assinatura.";
  if (msg.includes("sem versão comercial")) return "Esta assinatura não tem versão comercial. Regularize a versão com “Alterar plano” antes de ativar.";
  if (msg.includes("correlação já utilizada")) return "Esta tentativa já foi usada em outra operação. Recarregue e confira o histórico antes de tentar de novo.";
  if (msg.includes("empresa inexistente")) return "Empresa não encontrada. Recarregue a página.";
  return "Não foi possível concluir a operação. Recarregue e confira antes de tentar de novo.";
}

/** Converte erros `platform_*` do servidor em mensagem segura em PT-BR. */
export function mensagemErroPlataforma(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("motivo deve ter pelo menos 2 caracteres")) return "Informe um motivo com pelo menos 2 caracteres.";
  if (e instanceof ErroRpcPlataforma) {
    if (e.code === "42501") return "Seu acesso não permite concluir esta operação.";
    if (e.code === "40001" || e.code === "23505") return "O rascunho foi alterado em outra tentativa. Recarregue antes de continuar.";
    if (e.code === "22023") return "Revise os dados comerciais e as funcionalidades selecionadas.";
  }
  if (msg.includes("platform_forbidden")) return "Seu acesso não permite concluir esta operação.";
  if (msg.includes("platform_conflict") || msg.includes("platform_duplicate")) {
    return "O rascunho foi alterado em outra tentativa. Recarregue antes de continuar.";
  }
  if (msg.includes("platform_invalid")) return "Revise os dados comerciais e as funcionalidades selecionadas.";
  return "Não foi possível concluir a operação. Recarregue e confira antes de tentar de novo.";
}

interface PostgrestErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

export class ErroRpcPlataforma extends Error {
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;
  readonly correlationId: string;

  constructor(error: PostgrestErrorLike) {
    super(error.message ?? "platform_rpc_error");
    this.name = "ErroRpcPlataforma";
    this.code = error.code ?? null;
    this.details = error.details ?? null;
    this.hint = error.hint ?? null;
    this.correlationId = crypto.randomUUID().slice(0, 8).toUpperCase();
  }
}

export function diagnosticoSeguro(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[identificador]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[token]")
    .slice(0, 300);
}

/** Mensagem amigável + código de correlação (também registrado no console). */
export function mensagemErroComCorrelacao(e: unknown): string {
  const base = mensagemErroPlataforma(e);
  return e instanceof ErroRpcPlataforma ? `${base} (código: ${e.correlationId})` : base;
}

function erroRpc(error: PostgrestErrorLike): ErroRpcPlataforma {
  const diagnostic = new ErroRpcPlataforma(error);
  console.error("Falha segura na operação de Plataforma", {
    correlationId: diagnostic.correlationId,
    code: diagnostic.code,
    details: diagnosticoSeguro(diagnostic.details),
    hint: diagnosticoSeguro(diagnostic.hint),
  });
  return diagnostic;
}

function useInvalidarPlataforma() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["plataforma"] });
}

export function useCriarExcecao() {
  const invalidar = useInvalidarPlataforma();
  const retryRef = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({
    retry: false,
    mutationFn: async (v: {
      organizationId: string;
      featureKey: string;
      mode: "GRANT" | "REVOKE";
      reason: string;
      endsAt: string | null;
    }) => {
      const signature = JSON.stringify(v);
      if (retryRef.current?.signature !== signature) {
        retryRef.current = { signature, key: crypto.randomUUID() };
      }
      const { data, error } = await db.rpc("platform_set_feature_override", {
        _organization_id: v.organizationId,
        _feature_key: v.featureKey,
        _mode: v.mode,
        _reason: v.reason,
        _ends_at: v.endsAt,
        _limit_value: null,
        _idempotency_key: retryRef.current.key,
      });
      if (error) throw new Error(error.message);
      retryRef.current = null;
      return data as string;
    },
    onSettled: invalidar,
  });
}

export function useEncerrarExcecao() {
  const invalidar = useInvalidarPlataforma();
  const retryRef = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({
    retry: false,
    mutationFn: async (v: { id: string; reason: string }) => {
      const signature = JSON.stringify(v);
      if (retryRef.current?.signature !== signature) {
        retryRef.current = { signature, key: crypto.randomUUID() };
      }
      const { error } = await db.rpc("platform_end_feature_override", {
        _override_id: v.id,
        _reason: v.reason,
        _idempotency_key: retryRef.current.key,
      });
      if (error) throw new Error(error.message);
      retryRef.current = null;
    },
    onSettled: invalidar,
  });
}

// Document-lifetime coordinator preserves in-flight and ambiguous keys across remounts.
const transitionSubscription = createSubscriptionTransition({
  write: (v, key, signal) => db.rpc("platform_transition_subscription", {
    _organization_id: v.organizationId, _action: v.action, _reason: v.reason,
    _correlation_id: key, _plan_version_id: v.planVersionId,
  }).abortSignal(signal),
  committed: async (org, key, signal) => {
    const history = await db.from("organization_subscription_history").select("subscription_id")
      .eq("organization_id", org).eq("correlation_id", key).limit(1).abortSignal(signal);
    if (history.error) throw new Error("subscription_history_unavailable");
    if (Array.isArray(history.data) && history.data.some((r: { subscription_id?: unknown }) => typeof r.subscription_id === "string")) return true;
    const subscription = await db.from("organization_subscriptions").select("id")
      .eq("organization_id", org).eq("last_correlation_id", key).limit(1).abortSignal(signal);
    if (subscription.error) throw new Error("subscription_state_unavailable");
    return Array.isArray(subscription.data) && subscription.data.some((r: { id?: unknown }) => typeof r.id === "string");
  },
});

export function useAlterarAssinatura() {
  const qc = useQueryClient();
  const [verifying, setVerifying] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const mutation = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: async (v: SubscriptionAction) => {
      try {
        return await transitionSubscription(v, () => { if (mounted.current) setVerifying(true); });
      } finally {
        if (mounted.current) setVerifying(false);
      }
    },
    onSuccess: () => {
      // Never await refetch: an unresponsive read must not keep the button pending.
      for (const queryKey of [
        ["plataforma", "organization_subscriptions"], ["plataforma", "organization_subscription_history"],
        ["saas", "entitlements"], ["saas", "entitlement-context"],
      ]) void qc.invalidateQueries({ queryKey }).catch(() => undefined);
    },
  });
  return { ...mutation, verifying };
}

export function usePublicarVersaoPlano() {
  const invalidar = useInvalidarPlataforma();
  return useMutation({
    retry: false,
    mutationFn: async (v: {
      planKey: string;
      priceAmount: number;
      currency: string;
      billingCycle: "monthly" | "quarterly" | "semiannual" | "annual" | "custom";
      limits: Record<string, unknown>;
      effectiveFrom: string;
      reason: string;
    }) => {
      const { data, error } = await db.rpc("platform_publish_plan_version", {
        _plan_key: v.planKey,
        _price_amount: v.priceAmount,
        _currency: v.currency,
        _billing_cycle: v.billingCycle,
        _limits: v.limits,
        _effective_from: v.effectiveFrom,
        _reason: v.reason,
        _correlation_id: crypto.randomUUID(),
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSettled: invalidar,
  });
}

export function useSalvarRascunhoPlano() {
  const invalidar = useInvalidarPlataforma();
  return useMutation({
    retry: false,
    mutationFn: async (v: {
      draftId: string | null; planKey: string; priceAmount: string | null; currency: string | null;
      billingCycle: string | null; trialDays: number | null; limits: Record<string, unknown>;
      effectiveFrom: string | null; features: Array<{ feature_key: string; enabled: boolean }>; reason: string; idempotencyKey: string;
    }) => {
      const { data, error } = await db.rpc("platform_save_plan_version_draft", {
        _draft_id: v.draftId, _plan_key: v.planKey, _price_amount: v.priceAmount, _currency: v.currency,
        _billing_cycle: v.billingCycle, _trial_days: v.trialDays, _limits: v.limits,
        _effective_from: v.effectiveFrom, _features: v.features, _reason: v.reason,
        _idempotency_key: v.idempotencyKey,
      });
      if (error) throw erroRpc(error);
      return data as string;
    },
    onSettled: invalidar,
  });
}

export interface ValidacaoRascunhoPlano {
  complete: boolean;
  valid: boolean;
  missing: string[];
  feature_count: number;
  revision: number;
}

export function useValidarRascunhoPlano() {
  return useMutation({
    retry: false,
    mutationFn: async (draftId: string) => {
      const { data, error } = await db.rpc("platform_validate_plan_version_draft", { _draft_id: draftId });
      if (error) throw erroRpc(error);
      return data as ValidacaoRascunhoPlano;
    },
  });
}

export function usePublicarRascunhoPlano() {
  const invalidar = useInvalidarPlataforma();
  return useMutation({
    retry: false,
    mutationFn: async (v: { draftId: string; reason: string; confirmation: string; idempotencyKey: string }) => {
      const { data, error } = await db.rpc("platform_publish_plan_version_draft", {
        _draft_id: v.draftId, _reason: v.reason, _idempotency_key: v.idempotencyKey, _confirmation: v.confirmation,
      });
      if (error) throw erroRpc(error);
      return data as string;
    },
    onSettled: invalidar,
  });
}

// ===== Convite de administrador de empresa (provisionamento) =====

export interface ConviteAdminEmpresa {
  id: string;
  organization_id: string;
  user_id: string | null;
  email: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  modo_acesso: "link" | "senha_temporaria";
  responsavel_principal: boolean;
  status: "processando" | "falhou" | "pendente" | "ativo";
  attempt_count: number;
  last_error_code: string | null;
  email_delivery_status: string;
  email_last_error_code: string | null;
  updated_at: string;
  created_at: string;
}

export function useConvitesAdminEmpresa() {
  return useQuery<ConviteAdminEmpresa[]>({
    queryKey: ["plataforma", "platform_org_admin_invites"],
    queryFn: async () => {
      const { data, error } = await db
        .from("platform_org_admin_invites")
        .select(
          "id,organization_id,user_id,email,nome,cpf_cnpj,telefone,modo_acesso,responsavel_principal,status,attempt_count,last_error_code,email_delivery_status,email_last_error_code,updated_at,created_at",
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
  senha_temporaria: string | null;
  email_status: "accepted" | "not_required";
  manual_link?: string | null;
}

export class ErroConvitePlataforma extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ErroConvitePlataforma";
  }
}

async function lerErroFuncao(error: unknown): Promise<{ code: string; message: string }> {
  const fallback = { code: "invite_failed", message: "Não foi possível criar o acesso do administrador." };
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return fallback;
  try {
    const payload = await context.clone().json() as Record<string, unknown>;
    return {
      code: typeof payload.code === "string" ? payload.code : fallback.code,
      message: typeof payload.error === "string" ? payload.error : fallback.message,
    };
  } catch {
    return fallback;
  }
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
      confirmAmbiguousEmailRetry?: boolean;
      deliveryMode?: "email" | "manual_link";
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
          confirm_ambiguous_email_retry: v.confirmAmbiguousEmailRetry === true,
          delivery_mode: v.deliveryMode ?? "email",
        },
      });
      const payload = (data ?? {}) as Record<string, unknown>;
      if (error || payload.error) {
        const parsed = typeof payload.error === "string"
          ? { code: typeof payload.code === "string" ? payload.code : "invite_failed", message: payload.error }
          : await lerErroFuncao(error);
        throw new ErroConvitePlataforma(parsed.code, parsed.message);
      }
      return {
        user_id: String(payload.user_id ?? ""),
        senha_temporaria: (payload.senha_temporaria as string | null) ?? null,
        email_status: payload.email_status === "accepted" ? "accepted" : "not_required",
        manual_link: typeof payload.manual_link === "string" ? payload.manual_link : null,
      };
    },
    onSettled: invalidar,
  });
}

// ===== Empresa: detalhe, auditoria e edição cadastral segura =====

export interface EmpresaDetalheSaaS {
  id: string;
  nome: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  email_corporativo: string | null;
  status: string;
  fuso_horario: string | null;
  responsavel_user_id: string | null;
  responsavel_definido_em: string | null;
  onboarding_concluido_em: string | null;
  ativada_em: string | null;
  created_at: string;
  updated_at: string | null;
  onboarding_dados?: Record<string, unknown> | null;
}

export function useEmpresaDetalhe(organizationId: string | null) {
  return useQuery<EmpresaDetalheSaaS | null>({
    queryKey: ["plataforma", "organization-detail", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await db
        .from("organizations")
        .select("id,nome,razao_social,nome_fantasia,cnpj,email_corporativo,status,fuso_horario,responsavel_user_id,responsavel_definido_em,onboarding_concluido_em,ativada_em,created_at,updated_at,onboarding_dados")
        .eq("id", organizationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as EmpresaDetalheSaaS | null;
    },
    ...opcoes,
  });
}

export interface EventoAuditoriaEmpresa {
  id: string;
  tipo: "situacao" | "cadastro";
  created_at: string;
  motivo: string | null;
  resumo: string;
}

const CAMPO_CADASTRAL_LABEL: Record<string, string> = {
  razao_social: "Razão social",
  nome_fantasia: "Nome fantasia",
  email_corporativo: "E-mail",
  fuso_horario: "Fuso horário",
};
const CAMPO_DADOS_LABEL: Record<string, string> = {
  telefone: "Telefone", email_contato: "E-mail de contato", responsavel_nome: "Contato responsável",
  responsavel_cargo: "Cargo", cep: "CEP", logradouro: "Logradouro", numero: "Número", complemento: "Complemento",
  bairro: "Bairro", cidade: "Cidade", uf: "UF", inscricao_estadual: "Inscrição estadual", fuso_horario: "Fuso horário",
};

export function resumoAlteracaoCadastral(oldValues: Record<string, unknown>, newValues: Record<string, unknown>): string {
  const campos = Object.keys(CAMPO_CADASTRAL_LABEL).filter((k) => (oldValues?.[k] ?? null) !== (newValues?.[k] ?? null)).map((k) => CAMPO_CADASTRAL_LABEL[k]);
  const dados = (newValues?.dados ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(dados)) {
    const label = CAMPO_DADOS_LABEL[k];
    if (label && !campos.includes(label)) campos.push(label);
  }
  return campos.length ? `Cadastro alterado: ${campos.join(", ")}` : "Cadastro revisado";
}

export function useAuditoriaEmpresa(organizationId: string | null) {
  return useQuery<EventoAuditoriaEmpresa[]>({
    queryKey: ["plataforma", "organization-audit", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const [status, perfil] = await Promise.all([
        db.from("organization_status_audit").select("id,status_anterior,status_novo,motivo,created_at")
          .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(50),
        db.from("organization_profile_audit").select("id,reason,old_values,new_values,created_at")
          .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(50),
      ]);
      if (status.error) throw new Error(status.error.message);
      if (perfil.error) throw new Error(perfil.error.message);
      const eventos: EventoAuditoriaEmpresa[] = [
        ...((status.data ?? []) as Array<{ id: string; status_anterior: string | null; status_novo: string; motivo: string | null; created_at: string }>).map((e) => ({
          id: e.id, tipo: "situacao" as const, created_at: e.created_at, motivo: e.motivo,
          resumo: `Situação: ${e.status_anterior ?? "—"} → ${e.status_novo}`,
        })),
        ...((perfil.data ?? []) as Array<{ id: string; reason: string; old_values: Record<string, unknown>; new_values: Record<string, unknown>; created_at: string }>).map((e) => ({
          id: e.id, tipo: "cadastro" as const, created_at: e.created_at, motivo: e.reason,
          resumo: resumoAlteracaoCadastral(e.old_values, e.new_values),
        })),
      ];
      return eventos.sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    ...opcoes,
  });
}

export interface EdicaoEmpresaInput {
  organizationId: string;
  razaoSocial: string;
  nomeFantasia: string;
  email: string;
  motivo: string;
  expectedUpdatedAt: string;
  /** Apenas chaves alteradas do subconjunto permitido; string vazia limpa o campo. */
  dados?: Record<string, string>;
}

/** Chave idempotente estável por conteúdo: retry/duplo clique reutiliza a mesma chave. */
export function useEditarEmpresa() {
  const invalidar = useInvalidarPlataforma();
  const chaveRef = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({
    retry: false,
    mutationFn: async (v: EdicaoEmpresaInput) => {
      const signature = JSON.stringify([v.organizationId, v.razaoSocial.trim(), v.nomeFantasia.trim(), v.email.trim().toLowerCase(), v.motivo.trim(), v.expectedUpdatedAt, v.dados ?? {}]);
      if (chaveRef.current?.signature !== signature) chaveRef.current = { signature, key: crypto.randomUUID() };
      const { data, error } = await db.rpc("platform_update_organization_profile", {
        _org: v.organizationId,
        _razao_social: v.razaoSocial,
        _nome_fantasia: v.nomeFantasia,
        _email: v.email,
        _motivo: v.motivo,
        _expected_updated_at: v.expectedUpdatedAt,
        _idempotency_key: chaveRef.current.key,
        _dados: v.dados ?? {},
      });
      if (error) throw new ErroRpcPlataforma(error);
      chaveRef.current = null;
      return data as { organization_id: string; updated_at: string; idempotent: boolean };
    },
    onSuccess: invalidar,
  });
}

/** Resumo fiscal mínimo (somente leitura, Superadmin). Sem certificados, credenciais ou séries. */
export function useResumoFiscalEmpresa(organizationId: string | null, enabled = true) {
  return useQuery<import("@/components/plataforma/empresaEdicao").ResumoFiscalEmpresa>({
    queryKey: ["plataforma", "organization-fiscal-summary", organizationId],
    enabled: Boolean(organizationId) && enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("platform_get_organization_fiscal_summary", { _org: organizationId });
      if (error) throw new ErroRpcPlataforma(error);
      return (data ?? { configurado: false }) as import("@/components/plataforma/empresaEdicao").ResumoFiscalEmpresa;
    },
    ...opcoes,
  });
}

// ===== Gestão de administradores provisionados =====

export interface MudancaEmailAdmin {
  id: string;
  invite_id: string;
  status: "requested" | "auth_updated" | "failed";
  new_email: string;
  last_error_code: string | null;
  idempotency_key: string;
  reason: string;
  confirmation_sent_at?: string | null;
  confirmation_next_attempt_at?: string | null;
  confirmation_delivery_status?: string | null;
}

/** Mudanças de e-mail abertas (pendentes/reconciliáveis). */
export function useMudancasEmailAdmin() {
  return useQuery<MudancaEmailAdmin[]>({
    queryKey: ["plataforma", "platform_org_admin_email_changes"],
    queryFn: async () => {
      const { data, error } = await db
        .from("platform_org_admin_email_changes")
        .select("id,invite_id,status,new_email,last_error_code,idempotency_key,reason,confirmation_sent_at,confirmation_next_attempt_at,confirmation_delivery_status")
        .in("status", ["requested", "auth_updated", "failed"])
        .limit(LIMITE);
      if (error) throw new Error(error.message);
      return (data ?? []) as MudancaEmailAdmin[];
    },
    ...opcoes,
  });
}

/** Chave idempotente estável enquanto o conteúdo não muda (retry/duplo clique). */
function useChaveEstavel() {
  const ref = useRef<{ signature: string; key: string } | null>(null);
  return {
    obter: (signature: string) => {
      if (ref.current?.signature !== signature) ref.current = { signature, key: crypto.randomUUID() };
      return ref.current.key;
    },
    limpar: () => { ref.current = null; },
  };
}

export function useDefinirResponsavelPrincipal() {
  const invalidar = useInvalidarPlataforma();
  const chave = useChaveEstavel();
  return useMutation({
    retry: false,
    mutationFn: async (v: { organizationId: string; userId: string; motivo: string; expectedResponsavel: string | null }) => {
      const key = chave.obter(JSON.stringify([v.organizationId, v.userId, v.motivo.trim(), v.expectedResponsavel]));
      const { data, error } = await db.rpc("platform_set_org_principal_admin", {
        _org: v.organizationId, _user_id: v.userId, _motivo: v.motivo,
        _expected_responsavel: v.expectedResponsavel, _idempotency_key: key,
      });
      if (error) throw new ErroRpcPlataforma(error);
      chave.limpar();
      return data as { organization_id: string; responsavel_user_id: string; idempotent: boolean };
    },
    onSuccess: invalidar,
  });
}

export interface EdicaoAdminInput {
  inviteId: string; nome: string; telefone: string; cpf: string; motivo?: string | null; expectedUpdatedAt: string;
}

const motivoEdicaoAdminSchema = z.string().trim().nullish().transform((v) => v ?? "")
  .refine((v) => v.length !== 1, "Se informar o motivo, use ao menos 2 caracteres.");

export function useEditarAdminEmpresa() {
  const invalidar = useInvalidarPlataforma();
  const chave = useChaveEstavel();
  return useMutation({
    retry: false,
    mutationFn: async (v: EdicaoAdminInput) => {
      const motivo = motivoEdicaoAdminSchema.parse(v.motivo);
      const key = chave.obter(JSON.stringify([v.inviteId, v.nome.trim(), v.telefone, v.cpf, motivo, v.expectedUpdatedAt]));
      const { data, error } = await db.rpc("platform_update_org_admin", {
        _invite_id: v.inviteId, _nome: v.nome, _telefone: v.telefone || null, _cpf: v.cpf || null,
        _motivo: motivo, _expected_updated_at: v.expectedUpdatedAt, _idempotency_key: key,
      });
      if (error) throw new ErroRpcPlataforma(error);
      chave.limpar();
      return data as { invite_id: string; updated_at: string; idempotent: boolean };
    },
    onSuccess: invalidar,
  });
}

export interface ResultadoTrocaEmail {
  status: "completed" | "pending";
  reinvite_required: boolean;
  sessions_revoked?: number;
  old_address_notice?: "sent" | "skipped" | "failed";
}

/**
 * Troca de e-mail pela Edge Function. Para retomar uma operação falha,
 * passe `idempotencyKey` da mudança pendente (mesmo e-mail e motivo).
 */
export function useAlterarEmailAdmin() {
  const invalidar = useInvalidarPlataforma();
  const chave = useChaveEstavel();
  return useMutation<ResultadoTrocaEmail, Error, { inviteId: string; newEmail: string; reason: string; idempotencyKey?: string; action?: "request" | "resend" | "reconcile" | "cancel"; confirmAmbiguousRetry?: boolean }>({
    retry: false,
    mutationFn: async (v) => {
      const key = v.idempotencyKey ?? chave.obter(JSON.stringify([v.inviteId, v.newEmail.trim().toLowerCase(), v.reason.trim()]));
      const { data, error } = await supabase.functions.invoke("platform-org-admin-email-change", {
        body: { invite_id: v.inviteId, new_email: v.newEmail.trim().toLowerCase(), reason: v.reason.trim(), idempotency_key: key, confirm: true, action: v.action ?? "request", confirm_ambiguous_email_retry: v.confirmAmbiguousRetry === true },
      });
      const payload = (data ?? {}) as Record<string, unknown>;
      if (error || payload.error) {
        const parsed = typeof payload.error === "string"
          ? { code: typeof payload.code === "string" ? payload.code : "email_change_failed", message: payload.error }
          : await lerErroFuncao(error);
        throw new ErroConvitePlataforma(parsed.code, parsed.message);
      }
      chave.limpar();
      return payload as unknown as ResultadoTrocaEmail;
    },
    onSettled: invalidar,
  });
}

/** Mascara e-mail para visualização geral: "jo***@empresa.com.br". */
export function mascararEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!d) return "***";
  return `${u.slice(0, 2)}***@${d}`;
}

// ===== Revisão de cadastro (onboarding) — fila, aprovação e remessa auditadas no servidor =====

export interface RevisaoCadastro {
  review_id: string;
  organization_id: string;
  nome: string;
  razao_social: string | null;
  cnpj: string | null;
  status: string;
  origem: "onboarding" | "remessa_plataforma";
  motivo_codigo: string;
  observacao: string | null;
  submetido_em: string;
  dados: { razao_social?: string | null; cidade?: string | null; uf?: string | null; responsavel_nome?: string | null };
  evidencia: { razao_social: string | null; situacao_cadastral: string | null; consultado_em: string; vigente: boolean; fonte: string } | null;
}

export function useRevisoesCadastro(organizationId?: string | null, enabled = true) {
  return useQuery<RevisaoCadastro[]>({
    queryKey: ["plataforma", "revisoes-cadastro", organizationId ?? "todas"],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("platform_list_onboarding_reviews", { _org: organizationId ?? null });
      if (error) throw new Error(error.message);
      return (data ?? []) as RevisaoCadastro[];
    },
  });
}

export function useAprovarRevisaoCadastro() {
  const invalidar = useInvalidarPlataforma();
  return useMutation({
    retry: false,
    mutationFn: async (v: { org: string; motivo: string }) => {
      const { data, error } = await db.rpc("platform_approve_onboarding_review", { _org: v.org, _motivo: v.motivo });
      if (error) throw new Error(error.message);
      return data as { status: string; idempotent: boolean };
    },
    onSuccess: invalidar,
  });
}

export function useRemeterEmpresaRevisao() {
  const invalidar = useInvalidarPlataforma();
  return useMutation({
    retry: false,
    mutationFn: async (v: { org: string; motivo: string }) => {
      const { data, error } = await db.rpc("platform_return_organization_to_review", { _org: v.org, _motivo: v.motivo });
      if (error) throw new Error(error.message);
      return data as { status: string; idempotent: boolean };
    },
    onSuccess: invalidar,
  });
}

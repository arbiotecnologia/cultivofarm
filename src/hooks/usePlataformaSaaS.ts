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

export interface PlanoFeatureSaaS {
  plan_id: string;
  feature_id: string;
  enabled: boolean;
}

export function useCatalogoPlanosSaaS() {
  return useQuery<{
    modules: ModuloSaaS[]; features: FeatureSaaS[]; links: PlanoFeatureSaaS[];
    limits: LimiteSaaS[]; featureLimits: FeatureLimiteSaaS[]; dependencies: FeatureDependenciaSaaS[];
  }>({
    queryKey: ["plataforma", "saas_plan_feature_catalog"],
    queryFn: async () => {
      const [modules, features, links, limits, featureLimits, dependencies] = await Promise.all([
        db.from("saas_modules").select("id,key,name,description,active").order("name").limit(LIMITE),
        db.from("saas_features").select("id,module_id,key,name,description,active,commercializable,created_at").order("name").limit(LIMITE),
        db.from("saas_plan_features").select("plan_id,feature_id,enabled").limit(LIMITE),
        db.from("saas_limit_definitions").select("id,key,name,description,category,unit,value_type,application,active").order("category").order("name").limit(LIMITE),
        db.from("saas_feature_limit_definitions").select("feature_id,limit_definition_id,required").limit(LIMITE),
        db.from("saas_feature_dependencies").select("feature_id,depends_on_feature_id").limit(LIMITE),
      ]);
      if (modules.error) throw new Error(modules.error.message);
      if (features.error) throw new Error(features.error.message);
      if (links.error) throw new Error(links.error.message);
      if (limits.error) throw new Error(limits.error.message);
      if (featureLimits.error) throw new Error(featureLimits.error.message);
      if (dependencies.error) throw new Error(dependencies.error.message);
      return {
        modules: (modules.data ?? []) as ModuloSaaS[], features: (features.data ?? []) as FeatureSaaS[], links: (links.data ?? []) as PlanoFeatureSaaS[],
        limits: (limits.data ?? []) as LimiteSaaS[], featureLimits: (featureLimits.data ?? []) as FeatureLimiteSaaS[],
        dependencies: (dependencies.data ?? []) as FeatureDependenciaSaaS[],
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
          "id,organization_id,plan_id,plan_version_id,status,billing_cycle,billing_cycle_snapshot," +
            "price_snapshot,currency_snapshot,limits_snapshot,features_snapshot,started_at,trial_ends_at," +
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
        .select(
          "id,subscription_id,organization_id,source,action,reason,correlation_id,previous_status,new_status," +
            "previous_plan_version_id,new_plan_version_id,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(LIMITE);
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
}

export function useOrganizacoesSaaS() {
  return useQuery<OrganizacaoSaaS[]>({
    queryKey: ["plataforma", "organizations"],
    queryFn: async () => {
      const { data, error } = await db
        .from("organizations")
        .select("id,nome,status,nome_fantasia,cnpj,email_corporativo,created_at")
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
    }) => {
      const { data, error } = await db.rpc("platform_create_organization", {
        _nome: v.nome,
        _nome_fantasia: v.nomeFantasia,
        _cnpj: v.cnpj,
        _email: v.email,
        _plan_key: v.planKey,
        _rascunho: v.rascunho,
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

  constructor(error: PostgrestErrorLike) {
    super(error.message ?? "platform_rpc_error");
    this.name = "ErroRpcPlataforma";
    this.code = error.code ?? null;
    this.details = error.details ?? null;
    this.hint = error.hint ?? null;
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

function erroRpc(error: PostgrestErrorLike): ErroRpcPlataforma {
  const diagnostic = new ErroRpcPlataforma(error);
  console.error("Falha segura na operação de Plataforma", {
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
      action: "start_trial" | "change_plan" | "mark_past_due" | "suspend" | "reactivate_manual" | "cancel" | "expire_trial";
      planVersionId: string | null;
      reason: string;
    }) => {
      const { error } = await db.rpc("platform_transition_subscription", {
        _organization_id: v.organizationId,
        _action: v.action,
        _reason: v.reason,
        _correlation_id: crypto.randomUUID(),
        _plan_version_id: v.planVersionId,
      });
      if (error) throw new Error(error.message);
    },
    onSettled: invalidar,
  });
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

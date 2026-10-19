import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/permissions";
import { normalizeRoles, pickPrimaryRole } from "@/lib/portalContext";
import { useQueryClient } from "@tanstack/react-query";
import { subscribePortalEvents } from "@/lib/portalBroadcast";
import { clearActivePortalContext } from "@/lib/activePortalContext";
import { AUTHZ_CACHE_FOUNDATION_ENABLED, AUTHZ_CACHE_ROLLOUT_SCOPE, PRODUCER_CONTEXT_MONITOR_ENABLED, FINANCIAL_CONTEXT_MONITOR_ENABLED, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED, CONSULTANT_CONTEXT_MONITOR_ENABLED, OPERATOR_CONTEXT_MONITOR_ENABLED, MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED } from "@/lib/authz/authzEpochGate";
import { b2bContextProbe } from "@/lib/authz/b2bContextProbe";
import { producerContextProbe } from "@/lib/authz/producerContextProbe";
import { recordAuthzDiagnostic, clearAuthzDiagnostics } from "@/lib/authz/localDiagnostics";
import { safeOSRenewalDraft, type SafeOSRenewalDraft } from "@/lib/authz/safeOSRenewalDraft";
import { internalContextProbe, isManagerConsultantScope, MANAGER_CONSULTANT_ROLES } from "@/lib/authz/internalContextProbe";
import {
  createAuthzEpochMonitor,
  type AuthzEpochMonitor,
  type AuthzMonitorState,
} from "@/lib/authz/authzEpochMonitor";

/** Papéis EXTERNOS monitorados pela foundation de cache (mesma identidade). */
const EXTERNAL_AUTHZ_ROLES: ReadonlyArray<AppRole> = [
  "cliente_produtor",
  "parceiro_b2b",
  "parceiro_b2b_tecnico",
];

interface Profile {
  id: string;
  user_id: string;
  nome: string;
  email: string | null;
  ativo?: boolean;
  cliente_id?: string | null;
  /** Acesso criado pela plataforma com senha/convite provisório — exige troca no 1º acesso. */
  senha_provisoria?: boolean;
  organization_id?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /**
   * Papel prioritário — compat com fluxos legados. Alias de `primaryRole`.
   * Tipado como `string | null` para compatibilidade com telas antigas.
   * NUNCA usar para autorização multiportal.
   */
  role: string | null;
  /** Papel prioritário determinístico (compat legada). */
  primaryRole: AppRole | null;
  /** Todos os papéis atribuídos ao usuário. Use isto para decisões multipapel. */
  roles: AppRole[];
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /**
   * Foundation de cache de autorização (mesma identidade), atrás de
   * AUTHZ_CACHE_FOUNDATION_ENABLED. Com o gate fechado ou para perfis
   * internos, `authzReady` é sempre true e `authzEpoch` permanece 0.
   * Para perfis externos: `authzReady` é true SOMENTE com monitor "valid";
   * `authzEpoch` incrementa a cada mudança de fingerprint (revogação, troca
   * de vínculo, A→B→A) — consumidores sensíveis incluem a época no fence e
   * remontam conteúdo ao mudar.
   */
  authzReady: boolean;
  authzEpoch: number;
  authzState: AuthzMonitorState;
  /** Rechecagem de lease no acesso (relógio monotônico). */
  checkAuthzAccess: () => boolean;
  /** Revalidação manual (botão "Tentar novamente"). */
  revalidateAuthz: () => void;
  /** Monitored session re-resolved into an unmonitored scope: stays paused until fresh login. */
  authzLatchBlocked: boolean;
  setSafeOSDraft: (draft: SafeOSRenewalDraft | null) => void;
  takeSafeOSDraft: () => SafeOSRenewalDraft | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  role: null,
  primaryRole: null,
  roles: [],
  loading: true,
  error: null,
  signOut: async () => {},
  refresh: async () => {},
  authzReady: true,
  authzEpoch: 0,
  authzState: "idle",
  checkAuthzAccess: () => true,
  revalidateAuthz: () => {},
  authzLatchBlocked: false,
  setSafeOSDraft: () => {},
  takeSafeOSDraft: () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [primaryRole, setPrimaryRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // AuthProvider é sempre montado dentro do QueryClientProvider (App.tsx e
  // renderWithProviders). Chamar o hook incondicionalmente respeita as Rules
  // of Hooks — o try/catch anterior violava a regra e podia render-por-render.
  const queryClient = useQueryClient();


  // Controle de corrida: cada carregamento recebe uma geração. Resultado de
  // geração antiga (usuário A) nunca aplica estado após B/logout/unmount.
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Último usuário cujo carregamento já foi iniciado com sucesso — evita
  // tempestade de cargas em SIGNED_IN/INITIAL_SESSION repetidos.
  const loadedUserIdRef = useRef<string | null>(null);
  const safeDraftRef = useRef<SafeOSRenewalDraft | null>(null);
  const renewalRef = useRef<{ draft: SafeOSRenewalDraft; scope: string; fingerprint: string; confirmed: boolean } | null>(null);
  const resolvedScopeRef = useRef("");
  // Monitored-session latch: once this session observed a monitored scope,
  // a later re-resolution into an unmonitored/unknown/empty scope stays
  // paused until a fresh login (no bypass via gestor-only).
  const monitoredLatchRef = useRef<{ userId: string } | null>(null);
  const retryInFlightRef = useRef<Promise<void> | null>(null);
  const setSafeOSDraft = (draft: SafeOSRenewalDraft | null) => { safeDraftRef.current = draft ? safeOSRenewalDraft(draft) : null; };
  const takeSafeOSDraft = () => {
    const receipt = renewalRef.current;
    renewalRef.current = null;
    return receipt?.confirmed && receipt.scope === resolvedScopeRef.current && authzMonitorRef.current?.checkAccess()
      ? { ...receipt.draft } : null;
  };

  const clearIdentityState = () => {
    setProfile(null);
    setRoles([]);
    setPrimaryRole(null);
  };

  const fetchProfileAndRole = async (userId: string, generation?: number) => {
    const gen = generation ?? generationRef.current;
    const isCurrent = () => mountedRef.current && gen === generationRef.current;
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!isCurrent()) return;

      const profile = profileData as Profile | null;
      
      if (!profile) {
        renewalRef.current = null;
        loadedUserIdRef.current = null;
        clearIdentityState();
        setError("Seu perfil não foi encontrado. Por favor, entre em contato com o suporte.");
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

      if (profile.ativo === false) {
        renewalRef.current = null;
        loadedUserIdRef.current = null;
        setError("Sua conta está inativa.");
        clearIdentityState();
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

      setProfile(profile);

      // Fase Corretiva 1 — multipapel: NUNCA usar `.maybeSingle()` em user_roles.
      const { data: rolesData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (roleError) {
        console.error("Error fetching roles:", roleError);
        throw roleError;
      }

      if (!isCurrent()) return;

      const userRoles = normalizeRoles((rolesData ?? []) as Array<{ role: string | null }>);
      const primary = pickPrimaryRole(userRoles);

      if (userRoles.length === 0) {
        renewalRef.current = null;
        console.warn("No role found for user:", userId);
        setError("Seu usuário ainda não possui uma função atribuída no sistema.");
      } else if (
        userRoles.includes("cliente_produtor") &&
        userRoles.length === 1 &&
        !(AUTHZ_CACHE_FOUNDATION_ENABLED && AUTHZ_CACHE_ROLLOUT_SCOPE === "b2b-context" && PRODUCER_CONTEXT_MONITOR_ENABLED) &&
        !profile.cliente_id
      ) {
        setError(
          "Sua conta de produtor não está vinculada a nenhum cliente. Contate o administrador para concluir a configuração do acesso."
        );
      } else {
        setError(null);
      }

      setRoles(userRoles);
      setPrimaryRole(primary);
      setLoading(false);
    } catch (err: unknown) {
      console.error("Erro ao carregar perfil/função:", err);
      if (!isCurrent()) return;
      // Falha de autorização/carregamento limpa papéis antigos e libera nova
      // tentativa (não marca o usuário como já carregado).
      loadedUserIdRef.current = null;
      renewalRef.current = null;
      clearIdentityState();
      setError("Falha ao carregar dados do usuário. Verifique sua conexão.");
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (user) {
      renewalRef.current = null;
      safeDraftRef.current = null;
      setLoading(true);
      const gen = ++generationRef.current;
      loadedUserIdRef.current = user.id;
      await fetchProfileAndRole(user.id, gen);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    // StrictMode/remontagem: o efeito anterior pode ter deixado um usuário
    // marcado como carregado sem que o fetch tenha aplicado estado. Zerar aqui
    // garante que o novo setup agende o carregamento do mesmo usuário.
    loadedUserIdRef.current = null;
    // H9-G Bloco 2E — contexto de portal nunca pode ser herdado por outro
    // usuário: qualquer troca de identidade limpa a escolha persistida.
    let lastUserId: string | null = null;
    let handledAuthEvent = false;
    let effectCancelled = false;


    // O carregamento NUNCA parte da pilha do callback de onAuthStateChange
    // (chamadas Supabase dentro dele podem travar as próximas). Sempre agendado
    // como macrotask separada.
    const scheduleLoad = (userId: string) => {
      const gen = ++generationRef.current;
      loadedUserIdRef.current = userId;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (effectCancelled || !mountedRef.current || gen !== generationRef.current) return;
        void fetchProfileAndRole(userId, gen);
      }, 0);
    };

    // Escuta mudanças na autenticação — callback estritamente síncrono.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Efeito descartado (StrictMode/unmount) nunca aplica estado.
        if (effectCancelled) return;
        handledAuthEvent = true;
        setSession(session);
        setUser(session?.user ?? null);

        const nextUserId = session?.user?.id ?? null;
        const identityChanged = !!(lastUserId && lastUserId !== nextUserId);
        const authorizationChanged = event === "TOKEN_REFRESHED" || event === "USER_UPDATED";
        if (identityChanged || authorizationChanged || !nextUserId) {
          const monitor = authzMonitorRef.current;
          const fingerprint = monitor?.currentFingerprint();
          renewalRef.current = event === "TOKEN_REFRESHED" && !identityChanged && nextUserId &&
            safeDraftRef.current && monitor?.checkAccess() && fingerprint
            ? { draft: { ...safeDraftRef.current }, scope: resolvedScopeRef.current, fingerprint, confirmed: false } : null;
          safeDraftRef.current = null;
          // Synchronous fence before React/unmount or asynchronous SDK work.
          monitor?.stop();
          setAuthzEpoch(e => e + 1);
          void queryClient.cancelQueries();
          recordAuthzDiagnostic({ event: "auth_refresh", state: "pending", reason: null,
            visible: document.visibilityState === "visible", online: navigator.onLine,
            rttMs: null, leaseRemainingMs: null, requestRemainingMs: null });
        }
        if (identityChanged || !nextUserId) monitoredLatchRef.current = null;
        if (identityChanged || authorizationChanged || !nextUserId) {
          clearActivePortalContext();
          queryClient.clear();
        }
        lastUserId = nextUserId;

        if (nextUserId) {
          // Troca/renovação descarta papéis antes da revalidação agendada.
          if (identityChanged || authorizationChanged) clearIdentityState();
          // SIGNED_IN/INITIAL_SESSION repetidos deduplicam; renovação não.
          if (loadedUserIdRef.current === nextUserId && !authorizationChanged) return;
          setLoading(true);
          setError(null);
          scheduleLoad(nextUserId);

        } else {
          generationRef.current += 1;
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          loadedUserIdRef.current = null;
          clearIdentityState();
          setError(null);
          setLoading(false);
        }
      }
    );

    // Verifica sessão inicial apenas se o INITIAL_SESSION ainda não chegou —
    // evita disputa duplicada entre getSession e o evento.
    const checkInitialSession = async () => {
      if (handledAuthEvent) return;
      try {
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        // Resultado de efeito descartado (StrictMode/remontagem) não pode
        // ressuscitar sessão antiga nem encerrar o loading do efeito ativo.
        if (effectCancelled || !mountedRef.current || handledAuthEvent) return;

        if (initialSession?.user) {
          setSession(initialSession);
          setUser(initialSession.user);
          lastUserId = initialSession.user.id;
          if (loadedUserIdRef.current !== initialSession.user.id) {
            scheduleLoad(initialSession.user.id);
          }
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Erro ao verificar sessão inicial:", err);
        // getSession obsoleto (efeito já descartado ou evento de auth já
        // assumiu o controle) não pode desligar o loading do usuário atual.
        if (mountedRef.current && !effectCancelled && !handledAuthEvent) {
          setLoading(false);
        }
      }
    };

    void checkInitialSession();

    return () => {
      mountedRef.current = false;
      renewalRef.current = null;
      safeDraftRef.current = null;
      effectCancelled = true;
      generationRef.current += 1;
      loadedUserIdRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      subscription.unsubscribe();
    };

  }, []);


  // Cross-tab: reage a eventos de troca/limpeza/logout emitidos em outras abas.
  useEffect(() => {
    const unsub = subscribePortalEvents((event) => {
      if (event.type === "signed_out") {
        clearActivePortalContext();
        queryClient.clear();
        return;
      }
      if (event.type === "roles_updated") {
        // Só recarrega se o usuário afetado é o atualmente logado.
        if (user?.id && event.userId === user.id) {
          queryClient.invalidateQueries({ queryKey: ["available-portal-contexts"] });
          queryClient.invalidateQueries({ queryKey: ["profile"] });
          void refresh();
        }
        return;
      }
      // portal_switched | portal_cleared
      queryClient.invalidateQueries({ queryKey: ["available-portal-contexts"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      clearActivePortalContext();
    });
    return unsub;
  }, [queryClient, user?.id]);


  // Foundation de cache de autorização (mesma identidade). Um único monitor
  // por AuthProvider, atrás de gate próprio FECHADO até revisão; sem provider
  // paralelo e sem BroadcastChannel entre sessões. Callback de auth permanece
  // síncrono; recortes adicionais produtor/financeiro têm gates próprios.
  // Sem revisão v6/global nem monitor de entidades/entitlements.
  const [authzEpoch, setAuthzEpoch] = useState(0);
  const [authzState, setAuthzState] = useState<AuthzMonitorState>("idle");
  const authzMonitorRef = useRef<AuthzEpochMonitor | null>(null);
  const b2bContextOnly = AUTHZ_CACHE_ROLLOUT_SCOPE === "b2b-context";
  const producerContextOnly = b2bContextOnly && PRODUCER_CONTEXT_MONITOR_ENABLED &&
    roles.length === 1 && roles[0] === "cliente_produtor";
  const financialContextOnly = b2bContextOnly && FINANCIAL_CONTEXT_MONITOR_ENABLED &&
    roles.length === 1 && roles[0] === "financeiro";
  const companyAdminContextOnly = b2bContextOnly && COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED &&
    roles.length === 1 && roles[0] === "administrador" &&
    typeof profile?.organization_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.organization_id);
  const consultantContextOnly = b2bContextOnly && CONSULTANT_CONTEXT_MONITOR_ENABLED &&
    roles.length === 1 && roles[0] === "consultor_tecnico" &&
    typeof profile?.organization_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.organization_id);
  const operatorContextOnly = b2bContextOnly && OPERATOR_CONTEXT_MONITOR_ENABLED &&
    roles.length === 1 && roles[0] === "operador_onfarm" &&
    typeof profile?.organization_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.organization_id);
  const managerConsultantContextOnly = b2bContextOnly && MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED &&
    isManagerConsultantScope(roles, profile?.organization_id);
  // Reuse the reviewed environmental policy only for these monitored scopes.
  // This selects scheduling, never grants authority or changes probe contracts.
  const environmentalContextOnly = managerConsultantContextOnly || financialContextOnly || companyAdminContextOnly;
  const isExternalUser = b2bContextOnly
    ? managerConsultantContextOnly || operatorContextOnly || consultantContextOnly || companyAdminContextOnly || financialContextOnly || producerContextOnly || (roles.length === 1 && (roles[0] === "parceiro_b2b" || roles[0] === "parceiro_b2b_tecnico"))
    : roles.some((r) => EXTERNAL_AUTHZ_ROLES.includes(r));
  const principalReady = !!user?.id && profile?.user_id === user.id && profile.ativo === true &&
    profile.senha_provisoria === false && !!profile.organization_id;
  // Gate de criação via ref: o refresh() disparado pela mudança de época
  // alterna `loading` e NÃO pode derrubar/recriar o monitor (isso consumiria
  // respostas fora de ordem e duplicaria polls). O efeito roda quando a
  // identidade externa é resolvida (roles carregam junto do perfil).
  const authzMonitorGateRef = useRef(false);
  authzMonitorGateRef.current =
    AUTHZ_CACHE_FOUNDATION_ENABLED && !loading && principalReady && isExternalUser;
  const principalScope = JSON.stringify([user?.id, profile?.organization_id, principalReady, [...roles].sort(), isExternalUser]);
  resolvedScopeRef.current = principalScope;
  const [initializedPrincipal, setInitializedPrincipal] = useState("");
  useEffect(() => {
    // Initial profile and roles can arrive in different renders. Latch only
    // ready principals; loading during refresh does not recreate the monitor.
    if (authzMonitorGateRef.current) setInitializedPrincipal(principalScope);
  }, [loading, principalScope]);

  useEffect(() => {
    if (!authzMonitorGateRef.current || initializedPrincipal !== principalScope) {
      setAuthzState("idle");
      return;
    }
    const monitor = createAuthzEpochMonitor({
      fetcher: async () => {
        if (managerConsultantContextOnly || financialContextOnly || companyAdminContextOnly || consultantContextOnly || operatorContextOnly) {
          return internalContextProbe(user?.id ?? "", profile?.organization_id ?? "", managerConsultantContextOnly ? MANAGER_CONSULTANT_ROLES : operatorContextOnly ? "operador_onfarm" : consultantContextOnly ? "consultor_tecnico" : companyAdminContextOnly ? "administrador" : "financeiro");
        }
        if (producerContextOnly) {
          return producerContextProbe(user?.id ?? "", profile?.organization_id ?? "");
        }
        if (b2bContextOnly) {
          // Generated RPC names lag the already-installed resolver; canonical
          // client only, unknown response validated below (same as useMyPartner).
          const rpc = supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: unknown }>;
          const { data, error } = await rpc.call(supabase, "get_my_commercial_partner_context");
          if (error) throw new Error("b2b_probe_unavailable");
          return b2bContextProbe(data, profile?.organization_id ?? "", roles[0] ?? "");
        }
        const { data, error } = (await supabase.rpc("get_my_authz_fingerprint" as never)) as { data: unknown; error: Error | null };
        if (error) throw error;
        const row = (Array.isArray(data) ? data[0] : data) as
          | { eligible?: boolean; fingerprint?: string | null; server_remaining_ms?: number | null }
          | null;
        // Orçamento do servidor (boundary temporal do vetor); o monitor
        // desconta o RTT monotônico antes de conceder a lease.
        // Contrato v6: ausente/null => lease local. Valor PRESENTE porém não
        // numérico finito/nonnegative NÃO pode ser rebaixado para null aqui
        // (isso concederia lease local indevida): repassa o valor bruto e o
        // monitor falha fechado.
        const rawBudget = row?.server_remaining_ms;
        return {
          eligible: row?.eligible === true,
          fingerprint: row?.fingerprint ?? null,
          server_remaining_ms: rawBudget === undefined || rawBudget === null
            ? null
            : (rawBudget as number),
        };
      },
      // Relógio MONOTÔNICO: mudanças de relógio do sistema não estendem lease.
      now: () => performance.now(),
      setTimeoutFn: (cb, ms) => window.setTimeout(cb, ms),
      clearTimeoutFn: (h) => window.clearTimeout(h as number),
      isVisible: () => document.visibilityState === "visible",
      isOnline: () => navigator.onLine,
      // Limited reviewed scopes: hidden polling is best effort; suspension still
      // expires the monotonic lease. Other scopes retain published behavior.
      pollWhenHidden: environmentalContextOnly,
      // Reviewed scopes only: renew before the confirmed deadline using observed
      // RTT (no lease extension; late answers still fail closed).
      renewBeforeDeadline: environmentalContextOnly,
      // Company-admin only, local numeric/boolean allowlist; no identity or transport data.
      onDiagnostic: companyAdminContextOnly ? recordAuthzDiagnostic : undefined,
      // Preserve published B2B confirmation refresh. Producer/financial renew
      // the lease without remount on identical observed context; real changes,
      // explicit revalidation, expiry and identity still retire the view.
      // No claim of detecting an unobserved transient ABA between polls.
      refreshOnConfirmation: b2bContextOnly && !producerContextOnly && !financialContextOnly && !companyAdminContextOnly && !consultantContextOnly && !operatorContextOnly && !managerConsultantContextOnly,
      onStateChange: (next) => {
        if (next === "valid" && renewalRef.current) {
          const receipt = renewalRef.current;
          if (receipt.scope === principalScope && receipt.fingerprint === monitor.currentFingerprint() && monitor.checkAccess()) {
            receipt.confirmed = true;
          } else renewalRef.current = null;
          recordAuthzDiagnostic({ event: "auth_reconfirmed", state: next, reason: null,
            visible: document.visibilityState === "visible", online: navigator.onLine,
            rttMs: null, leaseRemainingMs: null, requestRemainingMs: null });
        }
        if (next === "expired") renewalRef.current = null;
        if (next === "pending" || next === "expired") {
          void queryClient.cancelQueries();
          queryClient.clear();
          setAuthzEpoch((e) => e + 1);
        }
        setAuthzState(next);
      },
      onEpochChange: () => {
        renewalRef.current = null;
        // Nova época (fingerprint mudou): geração++, cancela/limpa consultas,
        // limpa seleção de portal e preferências compartilhadas, incrementa a
        // época reativa (consumidores remontam conteúdo sensível e descartam
        // rascunhos/objectURLs no unmount) e recarrega identidade para que
        // perfil/roles voltem coerentes antes de exibir dados novamente.
        generationRef.current += 1;
        void queryClient.cancelQueries();
        queryClient.clear();
        // Only an untrusted client preference survives producer context changes.
        // Membership/cache authorization still expires with every epoch.
        clearActivePortalContext({ preserveClientPreference: producerContextOnly });
        if (!producerContextOnly) window.dispatchEvent(new Event("portal-client-preferences-cleared"));
        setAuthzEpoch((e) => e + 1);
        void refresh();
      },
      onExpire: () => {
        renewalRef.current = null;
        // Erro/offline/timeout/ineligible: geração++ (respostas em voo não
        // reabrem), cancela consultas e limpa seleção. O ESTADO reativo
        // (authzState="expired" via onStateChange) é o que ESCONDE os dados —
        // boundary e scopes derivam readiness dele.
        generationRef.current += 1;
        void queryClient.cancelQueries();
        clearActivePortalContext();
        window.dispatchEvent(new Event("portal-client-preferences-cleared"));
      },
    });
    authzMonitorRef.current = monitor;
    if (!monitoredLatchRef.current && user?.id) {
      monitoredLatchRef.current = { userId: user.id };
    }
    const onEnvironment = () => environmentalContextOnly ? monitor.revalidateEnvironment() : monitor.revalidate();
    const onFocus = onEnvironment;
    const onVisibility = () => { if (document.visibilityState === "visible") onEnvironment(); };
    const onOnline = onEnvironment;
    // Offline expira IMEDIATAMENTE — resultado em voo de geração antiga não
    // reabre dados (o monitor invalida a geração no expire).
    const onOffline = () => monitor.expireNow("offline");
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    monitor.start();
    return () => {
      authzMonitorRef.current = null;
      monitor.stop();
      if (companyAdminContextOnly && !renewalRef.current) clearAuthzDiagnostics();
      setAuthzState("idle");
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // roles entram via isExternalUser (booleano estável); loading/profile
    // entram via authzMonitorGateRef — refresh() não recria o monitor.
  }, [initializedPrincipal, principalScope, queryClient]);

  // Readiness derivada: gate fechado → sempre pronto. Com gate aberto e
  // usuário autenticado: enquanto perfil/roles carregam (loading) NÃO há
  // readiness — evita flash de conteúdo sensível antes de saber se o perfil é
  // externo. Perfil interno → pronto sem monitor; externo → pronto SOMENTE
  // com monitor "valid" (lease rechecada no acesso via checkAuthzAccess).
  const latch = monitoredLatchRef.current;
  // Tenant changes are re-proven by the new scope's own probe (h15); only an
  // unmonitored/empty/unknown re-resolution is held.
  const latchBlocked = AUTHZ_CACHE_FOUNDATION_ENABLED && !!latch && latch.userId === user?.id && !isExternalUser;
  const authzReady =
    !AUTHZ_CACHE_FOUNDATION_ENABLED ||
    (!!user && !loading && !latchBlocked && (!isExternalUser ||
      (principalReady && initializedPrincipal === principalScope && authzState === "valid" &&
        (authzMonitorRef.current?.checkAccess() ?? false))));
  const checkAuthzAccess = () =>
    !AUTHZ_CACHE_FOUNDATION_ENABLED ||
    (!latchBlocked && !isExternalUser) ||
    (!loading && !latchBlocked && principalReady && initializedPrincipal === principalScope && (authzMonitorRef.current?.checkAccess() ?? false));
  // Retry re-resolves profile/roles through the existing loader (fresh reads,
  // not cached roles), single-flight and generation-fenced. Same scope then
  // re-polls the same monitor; a different scope recreates or stays paused.
  const revalidateAuthz = () => {
    const uid = user?.id;
    const current = monitoredLatchRef.current;
    if (!AUTHZ_CACHE_FOUNDATION_ENABLED || !uid || !current || current.userId !== uid) {
      authzMonitorRef.current?.revalidate();
      return;
    }
    if (retryInFlightRef.current) return;
    // Synchronous fence before any await: drafts, caches, portal selection
    // and epoch-keyed content (Blobs revoked on unmount) are retired.
    renewalRef.current = null;
    safeDraftRef.current = null;
    const gen = ++generationRef.current;
    void queryClient.cancelQueries();
    queryClient.clear();
    clearActivePortalContext();
    window.dispatchEvent(new Event("portal-client-preferences-cleared"));
    setAuthzEpoch((e) => e + 1);
    const cachedRoles = [...roles].sort();
    const cachedOrg = profile?.organization_id ?? null;
    const isCurrent = () => mountedRef.current && gen === generationRef.current;
    const run = (async () => {
      try {
        // Fresh observation only decides whether re-resolution is needed; it
        // never grants authority. Errors/inactive keep the published path
        // (probe denies, view stays paused, no sign-out on retry).
        let fresh: string[] | null = null;
        let freshOrg: unknown = null;
        let active = false;
        try {
          const { data: p, error: pe } = await supabase.from("profiles")
            .select("user_id, organization_id, ativo").eq("user_id", uid).maybeSingle();
          const { data: r, error: re } = await supabase.from("user_roles").select("role").eq("user_id", uid);
          if (!pe && !re && p && (p as { user_id?: unknown }).user_id === uid && Array.isArray(r)) {
            active = (p as { ativo?: unknown }).ativo === true;
            freshOrg = (p as { organization_id?: unknown }).organization_id;
            fresh = r.map((row) => String((row as { role?: unknown })?.role)).sort();
          }
        } catch { fresh = null; }
        if (!isCurrent()) return;
        const same = fresh !== null && freshOrg === cachedOrg &&
          fresh.length === cachedRoles.length && fresh.every((role, i) => role === cachedRoles[i]);
        // Empty set stays on the paused probe path (no error-screen detour).
        // Tenant changes are never adopted by Retry (fresh login or the
        // TOKEN_REFRESHED path re-resolves them with their own probe).
        if (fresh === null || fresh.length === 0 || !active || same || freshOrg !== cachedOrg) {
          authzMonitorRef.current?.revalidate();
          return;
        }
        // Divergent active set/tenant: re-resolve via the existing loader.
        loadedUserIdRef.current = uid;
        setLoading(true);
        await fetchProfileAndRole(uid, gen);
        if (!isCurrent()) return;
        authzMonitorRef.current?.revalidate();
      } finally {
        retryInFlightRef.current = null;
      }
    })();
    retryInFlightRef.current = run;
  };

  const signOut = async () => {
    renewalRef.current = null;
    safeDraftRef.current = null;
    monitoredLatchRef.current = null;
    // Gate-off remains a no-op. Fence requests before asynchronous logout.
    authzMonitorRef.current?.stop();
    try {
      clearActivePortalContext();
      const { broadcastPortalEvent } = await import("@/lib/portalBroadcast");
      broadcastPortalEvent({ type: "signed_out", at: Date.now() });
    } catch {
      /* noop */
    }
    try {
      queryClient.clear();
    } catch {
      /* noop */
    }
    await supabase.auth.signOut();
  };


  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role: primaryRole,
        primaryRole,
        roles,
        loading,
        error,
        signOut,
        refresh,
        authzReady,
        authzEpoch,
        authzState: latchBlocked && !loading ? "expired" : authzState,
        authzLatchBlocked: latchBlocked && !loading,
        checkAuthzAccess,
        revalidateAuthz,
        setSafeOSDraft,
        takeSafeOSDraft,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

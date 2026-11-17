import { armResumeOnRenewal, armResumeOnTimeout, clearResume, observeResumeLatch, observeResumePrincipal, resumePrincipalKey } from "@/lib/navigation/protectedResumeContext";
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/permissions";
import { normalizeRoles, pickPrimaryRole } from "@/lib/portalContext";
import { useQueryClient } from "@tanstack/react-query";
import { subscribePortalEvents } from "@/lib/portalBroadcast";
import { clearActivePortalContext } from "@/lib/activePortalContext";
import { B2B_FINANCE_ROLE_INSTALLED, isExclusiveFinanceRoles } from "@/lib/comercial/b2bFinanceRole";
import { b2bFinanceContextProbe } from "@/lib/authz/b2bFinanceContextProbe";
import { AUTHZ_CACHE_FOUNDATION_ENABLED, AUTHZ_CACHE_ROLLOUT_SCOPE, PRODUCER_CONTEXT_MONITOR_ENABLED, FINANCIAL_CONTEXT_MONITOR_ENABLED, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED, CONSULTANT_CONTEXT_MONITOR_ENABLED, OPERATOR_CONTEXT_MONITOR_ENABLED, MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED } from "@/lib/authz/authzEpochGate";
import { c2ContextProbe, isC2ExternalScope } from "@/lib/authz/multiProfileContract";
import { b2bContextProbe } from "@/lib/authz/b2bContextProbe";
import { producerContextProbe } from "@/lib/authz/producerContextProbe";
import { recordAuthzDiagnostic, clearAuthzDiagnostics } from "@/lib/authz/localDiagnostics";
import { safeOSRenewalDraft, type SafeOSRenewalDraft } from "@/lib/authz/safeOSRenewalDraft";
import { internalContextProbe, isManagerConsultantScope, MANAGER_CONSULTANT_ROLES } from "@/lib/authz/internalContextProbe";
import { initialAutoRecovery, onExpire as autoRecoveryOnExpire, onValid as autoRecoveryOnValid, type AutoRecoveryState } from "@/lib/authz/transientTimeoutRecovery";
import { initialRoleChangeReresolve, onExpire as roleChangeOnExpire, onValid as roleChangeOnValid, type RoleChangeReresolveState } from "@/lib/authz/roleChangeReresolve";
import { clearAllPauseStates } from "@/lib/authz/pauseRetainedState";
import { safePartnerOrderDraft, type SafePartnerOrderDraft } from "@/lib/authz/safePartnerOrderDraft";
import { clearAllPartnerOrderDrafts } from "@/lib/authz/partnerOrderDraftStore";
import {
  createAuthzEpochMonitor,
  type AuthzEpochMonitor,
  type AuthzMonitorState,
} from "@/lib/authz/authzEpochMonitor";

/** Profile/roles loader bound: unrelated to the 15 s authorization lease. */
const AUTH_LOAD_TIMEOUT_MS = 20_000;
/** Fresh re-reads after a non-loader fence before an explicit error. */
const AUTH_LOAD_MAX_RESTARTS = 3;
/** One fresh attempt only after a transient post-renewal loader failure. */
const AUTH_LOAD_RECOVERY_DELAY_MS = 1_000;

/** Papéis EXTERNOS monitorados pela foundation de cache (mesma identidade). */
const EXTERNAL_AUTHZ_ROLES: ReadonlyArray<AppRole> = [
  "cliente_produtor",
  "parceiro_b2b",
  "parceiro_b2b_tecnico",
  "parceiro_b2b_financeiro",
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
  /** Logout voluntário em andamento para a identidade atual (nunca autoriza). */
  authzSigningOut: boolean;
  /** Gestor or consultor left from a monitored pair in this session: monitored by the same probe. */
  authzResidualScope: boolean;
  setSafeOSDraft: (draft: SafeOSRenewalDraft | null) => void;
  takeSafeOSDraft: () => SafeOSRenewalDraft | null;
  setSafePartnerOrderDraft: (draft: SafePartnerOrderDraft | null) => void;
  takeSafePartnerOrderDraft: () => SafePartnerOrderDraft | null;
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
  authzSigningOut: false,
  authzResidualScope: false,
  setSafeOSDraft: () => {},
  takeSafeOSDraft: () => null,
  setSafePartnerOrderDraft: () => {},
  takeSafePartnerOrderDraft: () => null,
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
  const partnerDraftRef = useRef<SafePartnerOrderDraft | null>(null);
  const partnerRenewalRef = useRef<{ draft: SafePartnerOrderDraft; scope: string; fingerprint: string; confirmed: boolean } | null>(null);
  const resolvedScopeRef = useRef("");
  // Monitored-session latch: once this session observed a monitored scope,
  // a later re-resolution into an unmonitored/unknown/empty scope stays
  // paused until a fresh login (no bypass via gestor-only).
  const monitoredLatchRef = useRef<{ userId: string; paired: boolean } | null>(null);
  // Retry closes readiness synchronously, before any await.
  const [retryPending, setRetryPending] = useState(false);
  const retryInFlightRef = useRef<Promise<void> | null>(null);
  // Loader ownership is separate from the result fence (generationRef): an
  // expiry/epoch/Retry fence discards in-flight answers, but the latest loader
  // still has to end loading (fresh re-read, bounded, or explicit error).
  const loaderSeqRef = useRef(0);
  // Transport of the latest loader / Retry read (aborted on deadline or fence)
  // and the single post-renewal recovery timer.
  const loaderAbortRef = useRef<AbortController | null>(null);
  const retryReadAbortRef = useRef<AbortController | null>(null);
  const loaderRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLoader = () => {
    if (loaderRecoveryTimerRef.current !== null) clearTimeout(loaderRecoveryTimerRef.current);
    loaderRecoveryTimerRef.current = null;
    loaderAbortRef.current?.abort();
    loaderAbortRef.current = null;
    retryReadAbortRef.current?.abort();
    retryReadAbortRef.current = null;
  };
  const activeUserIdRef = useRef<string | null>(null);
  const retryRevalidateRef = useRef(false);
  const revalidateAuthzRef = useRef<(opts?: { transient?: boolean }) => void>(() => {});
  const autoRecoveryRef = useRef<{ userId: string | null; s: AutoRecoveryState }>({ userId: null, s: initialAutoRecovery() });
  const roleChangeRef = useRef<{ userId: string | null; s: RoleChangeReresolveState }>({ userId: null, s: initialRoleChangeReresolve() });
  const autoRecoveryTimerRef = useRef<number | null>(null);
  const cancelAutoRecovery = () => {
    if (autoRecoveryTimerRef.current !== null) window.clearTimeout(autoRecoveryTimerRef.current);
    autoRecoveryTimerRef.current = null;
  };
  const setSafeOSDraft = (draft: SafeOSRenewalDraft | null) => { safeDraftRef.current = draft ? safeOSRenewalDraft(draft) : null; };
  const takeSafeOSDraft = () => {
    const receipt = renewalRef.current;
    renewalRef.current = null;
    return receipt?.confirmed && receipt.scope === resolvedScopeRef.current && authzMonitorRef.current?.checkAccess()
      ? { ...receipt.draft } : null;
  };
  const setSafePartnerOrderDraft = (draft: SafePartnerOrderDraft | null) => {
    partnerDraftRef.current = draft ? safePartnerOrderDraft(draft) : null;
  };
  const takeSafePartnerOrderDraft = () => {
    const receipt = partnerRenewalRef.current;
    partnerRenewalRef.current = null;
    return receipt?.confirmed && receipt.scope === resolvedScopeRef.current && authzMonitorRef.current?.checkAccess()
      ? safePartnerOrderDraft(receipt.draft) : null;
  };

  const clearIdentityState = () => {
    setProfile(null);
    setRoles([]);
    setPrimaryRole(null);
  };

  const loadDiagnostic = (event: "load_restart" | "load_timeout", startedAt: number) =>
    recordAuthzDiagnostic({ event, state: "pending", reason: event === "load_timeout" ? "timeout" : null,
      visible: document.visibilityState === "visible", online: navigator.onLine,
      rttMs: performance.now() - startedAt, leaseRemainingMs: null, requestRemainingMs: null });
  const failLoad = () => {
    partnerRenewalRef.current = null;
    loadedUserIdRef.current = null;
    renewalRef.current = null;
    clearIdentityState();
    setError("Falha ao carregar dados do usuário. Verifique sua conexão.");
    setLoading(false);
  };

  const fetchProfileAndRole = async (userId: string, generation?: number, restarts = 0, renewal = false, recoveryUsed = false): Promise<void> => {
    // A new loader supersedes the previous transport and any pending recovery.
    if (loaderRecoveryTimerRef.current !== null) clearTimeout(loaderRecoveryTimerRef.current);
    loaderRecoveryTimerRef.current = null;
    loaderAbortRef.current?.abort();
    const controller = new AbortController();
    loaderAbortRef.current = controller;
    const gen = generation ?? generationRef.current;
    const seq = ++loaderSeqRef.current;
    const startedAt = performance.now();
    let timedOut = false;
    // Watchdog: a hung transport ends in an explicit, recoverable error. The
    // loader is retired first, so a late answer is never adopted.
    // The returned promise ALWAYS settles by the deadline (owned-loader
    // contract): awaiting callers such as Retry release their single-flight
    // even when the transport never answers.
    let settle!: () => void;
    const settled = new Promise<void>(resolve => { settle = resolve; });
    // Post-renewal transient failure (network/5xx answer, not a hung read) of the SAME identity:
    // identity stays hidden (cleared, loading) and exactly one fresh canonical
    // loader runs. Never reuses answers/credentials, never signs out; explicit
    // denial/inactivity/missing roles never reach here. Caller has retired seq.
    const recoverTransient = () => {
      if (!renewal || recoveryUsed || !navigator.onLine || !mountedRef.current ||
        activeUserIdRef.current !== userId || gen !== generationRef.current) return false;
      renewalRef.current = null;
      partnerRenewalRef.current = null;
      safeDraftRef.current = null;
      clearIdentityState();
      setError(null);
      setLoading(true);
      const seqAtSchedule = loaderSeqRef.current;
      loaderRecoveryTimerRef.current = setTimeout(() => {
        loaderRecoveryTimerRef.current = null;
        if (!mountedRef.current || activeUserIdRef.current !== userId) return;
        // Another loader (Retry/refresh/new event) owns loading now.
        if (loaderSeqRef.current !== seqAtSchedule || timerRef.current !== null) return;
        if (!navigator.onLine) { failLoad(); return; }
        loadDiagnostic("load_restart", startedAt);
        void fetchProfileAndRole(userId, generationRef.current, restarts, true, true);
      }, AUTH_LOAD_RECOVERY_DELAY_MS);
      return true;
    };
    const watchdog = setTimeout(() => {
      settle();
      if (!mountedRef.current || seq !== loaderSeqRef.current) return;
      timedOut = true;
      loaderSeqRef.current++;
      loadDiagnostic("load_timeout", startedAt);
      controller.abort();
      // A hung read is never auto-retried: it ends in the explicit, operable
      // error (Retry). Only fast transient failures below get one recovery.
      failLoad();
    }, AUTH_LOAD_TIMEOUT_MS);
    const isCurrent = () => mountedRef.current && !timedOut && seq === loaderSeqRef.current && gen === generationRef.current;
    // Fenced by a non-loader event (expiry/epoch/Retry) with no successor
    // loader scheduled: discard this answer, re-read freshly (bounded).
    const yieldStale = () => {
      if (!mountedRef.current || timedOut || seq !== loaderSeqRef.current || timerRef.current !== null ||
        activeUserIdRef.current !== userId) return;
      if (restarts >= AUTH_LOAD_MAX_RESTARTS) { loaderSeqRef.current++; failLoad(); return; }
      loadDiagnostic("load_restart", startedAt);
      void fetchProfileAndRole(userId, generationRef.current, restarts + 1, renewal, recoveryUsed);
    };
    const body = (async () => { try {
      // Independent reads in parallel; nothing is adopted until both answered
      // and the loader is still current (no partial profile/roles adoption).
      // Fase Corretiva 1 — multipapel: NUNCA usar `.maybeSingle()` em user_roles.
      const [profileResult, rolesResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).abortSignal(controller.signal).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).abortSignal(controller.signal),
      ]);
      const { data: profileData, error: profileError } = profileResult;
      const { data: rolesData, error: roleError } = rolesResult;

      if (!isCurrent()) return yieldStale();
      if (profileError) throw Object.assign(new Error("profile_read_failed"), { status: profileResult.status ?? (profileError as { status?: unknown }).status, cause: profileError });

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
        clearAllPartnerOrderDrafts();
        partnerRenewalRef.current = null;
        renewalRef.current = null;
        loadedUserIdRef.current = null;
        setError("Sua conta está inativa.");
        clearIdentityState();
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

      if (roleError) {
        console.error("Error fetching roles:", roleError);
        throw Object.assign(new Error("roles_read_failed"), { status: rolesResult.status ?? (roleError as { status?: unknown }).status, cause: roleError });
      }

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

      setProfile(profile);
      setRoles(userRoles);
      setPrimaryRole(primary);
      setLoading(false);
    } catch (err: unknown) {
      console.error("Erro ao carregar perfil/função:", err);
      if (!isCurrent()) return yieldStale();
      const failure = err as { status?: unknown; message?: unknown } | null;
      const transient = err instanceof TypeError || failure?.status === 0 ||
        (typeof failure?.status === "number" && failure.status >= 500) ||
        (typeof failure?.message === "string" && /failed to fetch|networkerror|network request failed/i.test(failure.message));
      if (transient) {
        loaderSeqRef.current++;
        controller.abort();
        if (recoverTransient()) return;
      }
      // Falha de autorização/carregamento limpa papéis antigos e libera nova
      // tentativa (não marca o usuário como já carregado).
      failLoad();
    } finally {
      clearTimeout(watchdog);
      if (loaderAbortRef.current === controller) loaderAbortRef.current = null;
      settle();
    } })();
    // Late body completions after the deadline stay fenced by isCurrent().
    return Promise.race([body, settled]);
  };

  const refresh = async () => {
    if (user) {
      partnerRenewalRef.current = null;
      renewalRef.current = null;
      safeDraftRef.current = null;
      setLoading(true);
      const gen = ++generationRef.current;
      cancelLoader();
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
    const scheduleLoad = (userId: string, renewal = false) => {
      ++generationRef.current;
      loadedUserIdRef.current = userId;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // A newer schedule clears this timer; sign-out clears it too. Other
        // fences (expiry/Retry/epoch) are not loaders: still load, under the
        // CURRENT generation, so loading always ends.
        if (effectCancelled || !mountedRef.current || activeUserIdRef.current !== userId) return;
        void fetchProfileAndRole(userId, generationRef.current, 0, renewal);
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
        activeUserIdRef.current = nextUserId;
        const identityChanged = !!(lastUserId && lastUserId !== nextUserId);
        const authorizationChanged = event === "TOKEN_REFRESHED" || event === "USER_UPDATED";
        // Escolhas retidas após reload: renovação natural preserva; saída/troca de identidade apaga.
        if (identityChanged || !nextUserId) clearAllPartnerOrderDrafts();
        if (identityChanged || authorizationChanged || !nextUserId) {
          const monitor = authzMonitorRef.current;
          const fingerprint = monitor?.currentFingerprint();
          // Only healthy same-identity natural renewal carries user choices.
          // Stop/cancel/clear below still fences every old query and mounted UI.
          partnerRenewalRef.current = event === "TOKEN_REFRESHED" && !identityChanged && nextUserId &&
            partnerDraftRef.current && monitor?.checkAccess() && fingerprint
            ? { draft: safePartnerOrderDraft(partnerDraftRef.current) ?? partnerDraftRef.current,
                scope: resolvedScopeRef.current, fingerprint, confirmed: false } : null;
          partnerDraftRef.current = null;
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
        // Troca de identidade/saída descarta TODA retenção volátil de pausa.
        if (identityChanged || !nextUserId) clearAllPauseStates();
        // Retomada de navegação: renovação natural do MESMO usuário arma; troca/saída descarta.
        if (identityChanged || !nextUserId) clearResume();
        else if (event === "TOKEN_REFRESHED") armResumeOnRenewal(Date.now());
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
          scheduleLoad(nextUserId, event === "TOKEN_REFRESHED" && !identityChanged);

        } else {
          generationRef.current += 1;
          cancelLoader();
          retryRevalidateRef.current = false;
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
          activeUserIdRef.current = initialSession.user.id;
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
      cancelLoader();
      loadedUserIdRef.current = null;
      activeUserIdRef.current = null;
      retryRevalidateRef.current = false;
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
  const cumulativeExternal = b2bContextOnly && isC2ExternalScope(roles);
  const producerContextOnly = b2bContextOnly && PRODUCER_CONTEXT_MONITOR_ENABLED &&
    roles.length === 1 && roles[0] === "cliente_produtor";
  const financialContextOnly = b2bContextOnly && FINANCIAL_CONTEXT_MONITOR_ENABLED &&
    roles.length === 1 && roles[0] === "financeiro";
  // Financeiro B2B externo exclusivo: monitorado pela capacidade canônica do servidor (gate do perfil).
  const b2bFinanceContextOnly = b2bContextOnly && B2B_FINANCE_ROLE_INSTALLED && isExclusiveFinanceRoles(roles) &&
    typeof profile?.organization_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.organization_id);
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
  // Residual scope: same session/identity that was monitored as the gestor+
  // consultor pair, now freshly resolved to exactly ONE of the pair's roles.
  // Same provider/probe and guards; fresh logins keep the published behavior.
  const residualLatch = monitoredLatchRef.current;
  const residualRole: "gestor" | "consultor_tecnico" | null =
    b2bContextOnly && MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED && !!residualLatch?.paired &&
    residualLatch.userId === user?.id && roles.length === 1 &&
    (roles[0] === "gestor" || roles[0] === "consultor_tecnico") &&
    typeof profile?.organization_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.organization_id)
      ? roles[0] as "gestor" | "consultor_tecnico" : null;
  const residualContextOnly = residualRole !== null;
  // Reuse the reviewed environmental policy only for these monitored scopes.
  // This selects scheduling, never grants authority or changes probe contracts.
  const environmentalContextOnly = managerConsultantContextOnly || residualContextOnly || financialContextOnly || companyAdminContextOnly;
  // Auto-recovery limited to the scopes already homologated (pair/residual/admin/finance).
  const autoRecoveryScope = environmentalContextOnly;
  const isExternalUser = b2bContextOnly
    ? managerConsultantContextOnly || residualContextOnly || b2bFinanceContextOnly || operatorContextOnly || consultantContextOnly || companyAdminContextOnly || financialContextOnly || producerContextOnly || cumulativeExternal
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
        if (residualRole) return internalContextProbe(user?.id ?? "", profile?.organization_id ?? "", residualRole);
        if (managerConsultantContextOnly || financialContextOnly || companyAdminContextOnly || consultantContextOnly || operatorContextOnly) {
          return internalContextProbe(user?.id ?? "", profile?.organization_id ?? "", managerConsultantContextOnly ? MANAGER_CONSULTANT_ROLES : operatorContextOnly ? "operador_onfarm" : consultantContextOnly ? "consultor_tecnico" : companyAdminContextOnly ? "administrador" : "financeiro");
        }
        if (b2bFinanceContextOnly) {
          const financeRpc = supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: unknown }>;
          const { data, error } = await financeRpc.call(supabase, "b2b_finance_capability_v1");
          if (error) throw new Error("b2b_finance_probe_unavailable");
          return b2bFinanceContextProbe(data);
        }
        if (cumulativeExternal) {
          const { data,error } = await supabase.rpc("get_my_available_portal_contexts");
          if (error) throw new Error("c2_probe_unavailable");
          return c2ContextProbe(data,user?.id ?? "",profile?.organization_id ?? "",roles);
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
      // Reviewed environmental scopes, local numeric/boolean allowlist; no identity or transport data.
      onDiagnostic: environmentalContextOnly ? recordAuthzDiagnostic : undefined,
      // Healthy identical probes renew only the existing lease, not the view.
      // Changed vectors, expiry and explicit Retry retain their existing fences.
      // No claim of detecting an unobserved transient ABA between polls.
      refreshOnConfirmation: false,
      onStateChange: (next) => {
        if (next === "valid") {
          if (autoRecoveryRef.current.userId !== (user?.id ?? null)) autoRecoveryRef.current = { userId: user?.id ?? null, s: initialAutoRecovery() };
          autoRecoveryRef.current.s = autoRecoveryOnValid(autoRecoveryRef.current.s, performance.now());
          roleChangeRef.current = { userId: user?.id ?? null, s: roleChangeOnValid(roleChangeRef.current.s) };
        }
        if (next === "valid" && renewalRef.current) {
          const receipt = renewalRef.current;
          if (receipt.scope === principalScope && receipt.fingerprint === monitor.currentFingerprint() && monitor.checkAccess()) {
            receipt.confirmed = true;
          } else renewalRef.current = null;
          recordAuthzDiagnostic({ event: "auth_reconfirmed", state: next, reason: null,
            visible: document.visibilityState === "visible", online: navigator.onLine,
            rttMs: null, leaseRemainingMs: null, requestRemainingMs: null });
        }
        if (next === "valid" && partnerRenewalRef.current) {
          const receipt = partnerRenewalRef.current;
          if (receipt.scope === principalScope && receipt.fingerprint === monitor.currentFingerprint() && monitor.checkAccess()) {
            receipt.confirmed = true;
          } else partnerRenewalRef.current = null;
        }
        if (next === "expired") partnerRenewalRef.current = null;
        if (next === "expired") renewalRef.current = null;
        if (next === "pending" || next === "expired") {
          // Pausa transitória: cancela/limpa consultas (nada obsoleto é servido)
          // mas NÃO incrementa a época. A época só muda com mudança real de
          // fingerprint (onEpochChange), identidade ou Retry explícito — assim
          // uma recuperação com o MESMO fingerprint não remonta consumidores
          // nem invalida fences/escopos (regressão real pós-C2: timeout de
          // RTT ~10s resetava a aba/rascunho de /configuracoes).
          void queryClient.cancelQueries();
          queryClient.clear();
        }
        setAuthzState(next);
      },
      onEpochChange: () => {
        clearAllPartnerOrderDrafts();
        partnerRenewalRef.current = null;
        partnerDraftRef.current = null;
        renewalRef.current = null;
        clearResume(); // nova época nunca retoma navegação anterior
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
      onExpire: (reason) => {
        // Revogação (inelegível) apaga as escolhas retidas; offline/timeout/erro são transitórios e só bloqueiam a tela.
        if (reason === "ineligible") clearAllPartnerOrderDrafts();
        partnerRenewalRef.current = null;
        partnerDraftRef.current = null;
        renewalRef.current = null;
        // Retomada de navegação: SOMENTE timeout confirmado; demais motivos descartam.
        if (reason === "timeout") armResumeOnTimeout(resumePrincipalKey(user?.id, profile?.organization_id, roles), Date.now());
        else clearResume();
        // Erro/offline/timeout/ineligible: geração++ (respostas em voo não
        // reabrem), cancela consultas e limpa seleção. O ESTADO reativo
        // (authzState="expired" via onStateChange) é o que ESCONDE os dados —
        // boundary e scopes derivam readiness dele.
        generationRef.current += 1;
        void queryClient.cancelQueries();
        clearActivePortalContext();
        window.dispatchEvent(new Event("portal-client-preferences-cleared"));
        // Bounded auto-recovery of a transient timeout only (reviewed scopes).
        // It schedules the SAME canonical Retry; the view stays hidden meanwhile.
        cancelAutoRecovery();
        const uid = user?.id ?? null;
        if (autoRecoveryRef.current.userId !== uid) autoRecoveryRef.current = { userId: uid, s: initialAutoRecovery() };
        const decision = autoRecoveryOnExpire(autoRecoveryRef.current.s, reason, autoRecoveryScope, performance.now());
        autoRecoveryRef.current.s = decision.next;
        if (decision.delayMs !== null && uid) {
          const scopeAtExpire = principalScope;
          autoRecoveryTimerRef.current = window.setTimeout(() => {
            autoRecoveryTimerRef.current = null;
            if (!mountedRef.current || activeUserIdRef.current !== uid || resolvedScopeRef.current !== scopeAtExpire ||
              authzMonitorRef.current !== monitor || monitor.state() !== "expired" || retryInFlightRef.current) return;
            recordAuthzDiagnostic({ event: "auto_retry", state: "expired", reason: "timeout",
              visible: document.visibilityState === "visible", online: navigator.onLine,
              rttMs: null, leaseRemainingMs: null, requestRemainingMs: null });
            revalidateAuthzRef.current({ transient: true });
          }, decision.delayMs);
        } else if (uid) {
          // Role-change candidate: an "ineligible" pair/residual probe may run the
          // SAME canonical Retry once (fresh profile+roles, fenced loader, new
          // monitor confirmation). View stays hidden; budget re-arms only on valid.
          if (roleChangeRef.current.userId !== uid) roleChangeRef.current = { userId: uid, s: initialRoleChangeReresolve() };
          const rc = roleChangeOnExpire(roleChangeRef.current.s, reason, managerConsultantContextOnly || residualContextOnly, navigator.onLine);
          roleChangeRef.current.s = rc.next;
          if (rc.run) {
            const scopeAtExpire = principalScope;
            autoRecoveryTimerRef.current = window.setTimeout(() => {
              autoRecoveryTimerRef.current = null;
              if (!mountedRef.current || activeUserIdRef.current !== uid || resolvedScopeRef.current !== scopeAtExpire ||
                authzMonitorRef.current !== monitor || monitor.state() !== "expired" || retryInFlightRef.current || !navigator.onLine) return;
              recordAuthzDiagnostic({ event: "auto_retry", state: "expired", reason: "ineligible",
                visible: document.visibilityState === "visible", online: navigator.onLine,
                rttMs: null, leaseRemainingMs: null, requestRemainingMs: null });
              revalidateAuthzRef.current();
            }, 0);
          }
        }
      },
    });
    authzMonitorRef.current = monitor;
    if (user?.id && (!monitoredLatchRef.current || monitoredLatchRef.current.userId !== user.id)) {
      monitoredLatchRef.current = { userId: user.id, paired: managerConsultantContextOnly };
    } else if (monitoredLatchRef.current && managerConsultantContextOnly) monitoredLatchRef.current.paired = true;
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
      cancelAutoRecovery();
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

  // Retry re-resolution settled: an unchanged scope re-polls its existing
  // expired monitor; a changed scope already started its own monitor above.
  useEffect(() => {
    if (loading || !retryRevalidateRef.current) return;
    retryRevalidateRef.current = false;
    const monitor = authzMonitorRef.current;
    if (monitor && monitor.state() === "expired") monitor.revalidate();
  }, [loading, principalScope, initializedPrincipal]);

  // Readiness derivada: gate fechado → sempre pronto. Com gate aberto e
  // usuário autenticado: enquanto perfil/roles carregam (loading) NÃO há
  // readiness — evita flash de conteúdo sensível antes de saber se o perfil é
  // externo. Perfil interno → pronto sem monitor; externo → pronto SOMENTE
  // com monitor "valid" (lease rechecada no acesso via checkAuthzAccess).
  const latch = monitoredLatchRef.current;
  // Tenant changes are re-proven by the new scope's own probe (h15); only an
  // unmonitored/empty/unknown re-resolution is held.
  const latchBlocked = AUTHZ_CACHE_FOUNDATION_ENABLED && !!latch && latch.userId === user?.id && !isExternalUser;
  const resumePrincipal = resumePrincipalKey(user?.id, profile?.organization_id, roles);
  useEffect(() => { observeResumePrincipal(resumePrincipal, loading); }, [resumePrincipal, loading]);
  useEffect(() => { observeResumeLatch(latchBlocked, loading); }, [latchBlocked, loading]);
  // Logout voluntário: válido apenas enquanto a MESMA identidade ainda está
  // presente. SIGNED_OUT (user=null) ou troca de usuário encerram a marca.
  const [signingOutUserId, setSigningOutUserId] = useState<string | null>(null);
  const signOutAttemptRef = useRef(0);
  const signOutFlightRef = useRef<{ userId: string | null; attempt: number; promise: Promise<void> } | null>(null);
  useEffect(() => {
    if (signingOutUserId && signingOutUserId !== user?.id) setSigningOutUserId(null);
  }, [user?.id, signingOutUserId]);
  const authzSigningOut = !!signingOutUserId && signingOutUserId === user?.id;
  const authzReady =
    !AUTHZ_CACHE_FOUNDATION_ENABLED ||
    (!!user && !loading && !latchBlocked && !retryPending && (!isExternalUser ||
      (principalReady && initializedPrincipal === principalScope && authzState === "valid" &&
        (authzMonitorRef.current?.checkAccess() ?? false))));
  const checkAuthzAccess = () =>
    !AUTHZ_CACHE_FOUNDATION_ENABLED ||
    (!latchBlocked && !isExternalUser) ||
    (!loading && !latchBlocked && !retryPending && principalReady && initializedPrincipal === principalScope && (authzMonitorRef.current?.checkAccess() ?? false));
  // Retry re-resolves profile/roles through the existing loader (fresh reads,
  // not cached roles), single-flight and generation-fenced. Same scope then
  // re-polls the same monitor; a different scope recreates or stays paused.
  const revalidateAuthz = (opts?: { transient?: boolean }) => {
    partnerRenewalRef.current = null;
    partnerDraftRef.current = null;
    cancelAutoRecovery();
    const uid = user?.id;
    const current = monitoredLatchRef.current;
    if (!AUTHZ_CACHE_FOUNDATION_ENABLED || !uid || !current || current.userId !== uid) {
      authzMonitorRef.current?.revalidate();
      return;
    }
    if (retryInFlightRef.current) return;
    setRetryPending(true);
    // Synchronous fence before any await: drafts, caches and portal selection
    // are retired; the boundary already hides content while retryPending.
    renewalRef.current = null;
    safeDraftRef.current = null;
    // Fences in-flight loader answers (the latest loader re-reads freshly).
    ++generationRef.current;
    void queryClient.cancelQueries();
    queryClient.clear();
    clearActivePortalContext();
    window.dispatchEvent(new Event("portal-client-preferences-cleared"));
    // Época: o Retry MANUAL (gesto explícito no boundary) mantém o bump
    // revisado — consumidores época-keyed remontam e fences de época capturados
    // antes da pausa deixam de valer. Somente a recuperação AUTOMÁTICA de
    // timeout transitório (orçamento limitado, mesmo escopo) não incrementa:
    // o boundary já ocultou/desmontou o conteúdo, queries foram limpas e a
    // geração foi incrementada acima; mudança real de fingerprint ainda
    // dispara onEpochChange e escopo divergente incrementa abaixo.
    if (!opts?.transient) setAuthzEpoch((e) => e + 1);
    const cachedRoles = [...roles].sort();
    const cachedOrg = profile?.organization_id ?? null;
    // Retry yields only to identity change/sign-out/unmount or a newer loader
    // (TOKEN_REFRESHED/refresh). Monitor expiry is NOT a reason to abandon it:
    // an expired old-scope poll must not cancel the re-resolution.
    const seqAtStart = loaderSeqRef.current;
    const isCurrent = () => mountedRef.current && activeUserIdRef.current === uid &&
      loaderSeqRef.current === seqAtStart && timerRef.current === null;
    const run = (async () => {
      try {
        // Fresh observation only decides whether re-resolution is needed; it
        // never grants authority. Errors/inactive keep the published path
        // (probe denies, view stays paused, no sign-out on retry).
        let fresh: string[] | null = null;
        let freshOrg: unknown = null;
        let active = false;
        let deadline: ReturnType<typeof setTimeout> | undefined;
        let retrySignal: AbortController | null = null;
        try {
          // Bounded: a hung read ends as "unavailable" (probe path), never an endless Retry.
          const readController = new AbortController();
          retryReadAbortRef.current?.abort();
          retryReadAbortRef.current = readController;
          retrySignal = readController;
          const timeout = new Promise<never>((_, reject) => { deadline = setTimeout(() => { readController.abort(); reject(new Error("retry_read_timeout")); }, AUTH_LOAD_TIMEOUT_MS); });
          const [{ data: p, error: pe }, { data: r, error: re }] = await Promise.race([Promise.all([
            supabase.from("profiles").select("user_id, organization_id, ativo").eq("user_id", uid).abortSignal(readController.signal).maybeSingle(),
            supabase.from("user_roles").select("role").eq("user_id", uid).abortSignal(readController.signal),
          ]), timeout]);
          if (!pe && !re && p && (p as { user_id?: unknown }).user_id === uid && Array.isArray(r)) {
            active = (p as { ativo?: unknown }).ativo === true;
            freshOrg = (p as { organization_id?: unknown }).organization_id;
            fresh = r.map((row) => String((row as { role?: unknown })?.role)).sort();
          }
        } catch { fresh = null; } finally {
          clearTimeout(deadline);
          if (retrySignal && retryReadAbortRef.current === retrySignal) retryReadAbortRef.current = null;
        }
        if (!isCurrent()) return;
        const same = fresh !== null && freshOrg === cachedOrg &&
          fresh.length === cachedRoles.length && fresh.every((role, i) => role === cachedRoles[i]);
        // Empty set stays on the paused probe path (no error-screen detour).
        // Tenant changes are never adopted by Retry (fresh login or the
        // TOKEN_REFRESHED path re-resolves them with their own probe). With no
        // cached tenant (earlier load failure) this is a first resolution and
        // the new scope's probe re-proves the tenant.
        if (fresh === null || fresh.length === 0 || !active || same || (cachedOrg !== null && freshOrg !== cachedOrg)) {
          authzMonitorRef.current?.revalidate();
          return;
        }
        // Divergent active set: re-resolve via the existing loader. The
        // monitor for the resulting scope is (re)started after commit, never
        // the old-scope monitor from this closure. Epoch bump aqui: o escopo
        // mudou de fato, então conteúdo época-keyed do escopo antigo é
        // retirado antes da nova confirmação.
        setAuthzEpoch((e) => e + 1);
        loadedUserIdRef.current = uid;
        retryRevalidateRef.current = true;
        setLoading(true);
        // Awaited: the owned loader always settles by its deadline, so the
        // single-flight is released in finally even if the transport hangs.
        await fetchProfileAndRole(uid, generationRef.current);
      } finally {
        retryInFlightRef.current = null;
        if (mountedRef.current) setRetryPending(false);
      }
    })();
    retryInFlightRef.current = run;
  };

  revalidateAuthzRef.current = revalidateAuthz;

  const signOutOnce = () => {
    const leavingUserId = user?.id ?? null;
    // Single-flight: clique duplicado da MESMA identidade reutiliza a tentativa.
    const inflight = signOutFlightRef.current;
    if (inflight && inflight.userId === leavingUserId) return inflight.promise;
    const attempt = ++signOutAttemptRef.current;
    const promise = signOut().finally(() => {
      if (signOutFlightRef.current?.attempt === attempt) signOutFlightRef.current = null;
    });
    signOutFlightRef.current = { userId: leavingUserId, attempt, promise };
    return promise;
  };

  const signOut = async () => {
    const leavingUserId = user?.id ?? null;
    const attempt = signOutAttemptRef.current; // fixado pelo single-flight antes da chamada
    // Marca logout VOLUNTÁRIO só para a identidade atual. Não altera readiness
    // (conteúdo continua oculto); apenas troca a mensagem de pausa por "Saindo".
    // Limpeza cercada por tentativa+identidade: promise antiga não apaga marca nova.
    const clearMine = () => {
      if (!mountedRef.current || signOutAttemptRef.current !== attempt) return;
      setSigningOutUserId(prev => (prev === leavingUserId ? null : prev));
    };
    if (leavingUserId) setSigningOutUserId(leavingUserId);
    clearAllPartnerOrderDrafts();
    partnerRenewalRef.current = null;
    partnerDraftRef.current = null;
    clearResume();
    cancelLoader();
    cancelAutoRecovery();
    autoRecoveryRef.current = { userId: null, s: initialAutoRecovery() };
    roleChangeRef.current = { userId: null, s: initialRoleChangeReresolve() };
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
    let failed = false;
    try {
      const { error: signOutError } = (await supabase.auth.signOut()) ?? { error: null };
      failed = !!signOutError;
    } catch (err) {
      failed = true;
      clearMine();
      throw err;
    }
    // Rejeição: sessão pode continuar; volta ao estado honesto (pausa/retry).
    if (failed) clearMine();
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
        signOut: signOutOnce,
        refresh,
        authzReady,
        authzEpoch,
        authzState: latchBlocked && !loading ? "expired" : authzState,
        authzLatchBlocked: latchBlocked && !loading,
        authzSigningOut,
        authzResidualScope: residualContextOnly,
        checkAuthzAccess,
        // Consumidores (botão Tentar novamente) só disparam o Retry MANUAL.
        revalidateAuthz: () => revalidateAuthz(),
        setSafeOSDraft,
        takeSafeOSDraft,
        setSafePartnerOrderDraft,
        takeSafePartnerOrderDraft,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/permissions";
import { normalizeRoles, pickPrimaryRole } from "@/lib/portalContext";
import { useQueryClient } from "@tanstack/react-query";
import { subscribePortalEvents } from "@/lib/portalBroadcast";
import { clearActivePortalContext } from "@/lib/activePortalContext";
import { AUTHZ_CACHE_FOUNDATION_ENABLED } from "@/lib/authz/authzEpochGate";
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
  "consultor_tecnico",
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
        loadedUserIdRef.current = null;
        clearIdentityState();
        setError("Seu perfil não foi encontrado. Por favor, entre em contato com o suporte.");
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

      if (profile.ativo === false) {
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
        console.warn("No role found for user:", userId);
        setError("Seu usuário ainda não possui uma função atribuída no sistema.");
      } else if (
        userRoles.includes("cliente_produtor") &&
        userRoles.length === 1 &&
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
      clearIdentityState();
      setError("Falha ao carregar dados do usuário. Verifique sua conexão.");
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (user) {
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
        console.log("Auth event:", event, session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);

        const nextUserId = session?.user?.id ?? null;
        const identityChanged = !!(lastUserId && lastUserId !== nextUserId);
        const authorizationChanged = event === "TOKEN_REFRESHED" || event === "USER_UPDATED";
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
  // síncrono; o monitor roda fora dele e SOMENTE para perfis EXTERNOS após o
  // Auth estar pronto (perfil+roles carregados) — usuários internos nunca
  // criam monitor.
  const [authzEpoch, setAuthzEpoch] = useState(0);
  const [authzState, setAuthzState] = useState<AuthzMonitorState>("idle");
  const authzMonitorRef = useRef<AuthzEpochMonitor | null>(null);
  const isExternalUser = roles.some((r) => EXTERNAL_AUTHZ_ROLES.includes(r));
  // Gate de criação via ref: o refresh() disparado pela mudança de época
  // alterna `loading` e NÃO pode derrubar/recriar o monitor (isso consumiria
  // respostas fora de ordem e duplicaria polls). O efeito roda quando a
  // identidade externa é resolvida (roles carregam junto do perfil).
  const authzMonitorGateRef = useRef(false);
  authzMonitorGateRef.current =
    AUTHZ_CACHE_FOUNDATION_ENABLED && !loading && !!user?.id && !!profile && isExternalUser;

  useEffect(() => {
    if (!authzMonitorGateRef.current) {
      setAuthzState("idle");
      return;
    }
    const monitor = createAuthzEpochMonitor({
      fetcher: async () => {
        const { data, error } = await supabase.rpc("get_my_authz_fingerprint");
        if (error) throw error;
        const row = (Array.isArray(data) ? data[0] : data) as
          | { eligible?: boolean; fingerprint?: string | null }
          | null;
        return { eligible: row?.eligible === true, fingerprint: row?.fingerprint ?? null };
      },
      // Relógio MONOTÔNICO: mudanças de relógio do sistema não estendem lease.
      now: () => performance.now(),
      setTimeoutFn: (cb, ms) => window.setTimeout(cb, ms),
      clearTimeoutFn: (h) => window.clearTimeout(h as number),
      isVisible: () => document.visibilityState === "visible",
      isOnline: () => navigator.onLine,
      onStateChange: (next) => setAuthzState(next),
      onEpochChange: () => {
        // Nova época (fingerprint mudou): geração++, cancela/limpa consultas,
        // limpa seleção de portal e preferências compartilhadas, incrementa a
        // época reativa (consumidores remontam conteúdo sensível e descartam
        // rascunhos/objectURLs no unmount) e recarrega identidade para que
        // perfil/roles voltem coerentes antes de exibir dados novamente.
        generationRef.current += 1;
        void queryClient.cancelQueries();
        queryClient.clear();
        clearActivePortalContext();
        window.dispatchEvent(new Event("portal-client-preferences-cleared"));
        setAuthzEpoch((e) => e + 1);
        void refresh();
      },
      onExpire: () => {
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
    const onFocus = () => monitor.revalidate();
    const onVisibility = () => { if (document.visibilityState === "visible") monitor.revalidate(); };
    const onOnline = () => monitor.revalidate();
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
      setAuthzState("idle");
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // roles entram via isExternalUser (booleano estável); profile/user gates.
  }, [user?.id, loading, isExternalUser, queryClient]);

  // Readiness derivada: gate fechado ou perfil interno → sempre pronto;
  // perfil externo → pronto SOMENTE com monitor "valid" (lease rechecada no
  // acesso via checkAuthzAccess). "pending"/"expired" ESCONDEM dados.
  const authzReady =
    !AUTHZ_CACHE_FOUNDATION_ENABLED || !isExternalUser || authzState === "valid";
  const checkAuthzAccess = () =>
    !AUTHZ_CACHE_FOUNDATION_ENABLED ||
    !isExternalUser ||
    (authzMonitorRef.current?.checkAccess() ?? false);
  const revalidateAuthz = () => authzMonitorRef.current?.revalidate();

  const signOut = async () => {
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
        authzState,
        checkAuthzAccess,
        revalidateAuthz,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/permissions";
import { normalizeRoles, pickPrimaryRole } from "@/lib/portalContext";
import { useQueryClient } from "@tanstack/react-query";
import { subscribePortalEvents } from "@/lib/portalBroadcast";
import { clearActivePortalContext } from "@/lib/activePortalContext";

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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

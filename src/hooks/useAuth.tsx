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


  const fetchProfileAndRole = async (userId: string) => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (profileError) throw profileError;

      const profile = profileData as Profile | null;
      
      if (!profile) {
        console.error("Profile not found for user:", userId);
        setError("Seu perfil não foi encontrado. Por favor, entre em contato com o suporte.");
        setLoading(false);
        return;
      }

      if (profile.ativo === false) {
        setError("Sua conta está inativa.");
        await supabase.auth.signOut();
        setProfile(null);
        setRoles([]);
        setPrimaryRole(null);
        setLoading(false);
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
    } catch (err: any) {
      console.error("Erro ao carregar perfil/função:", err);
      setError("Falha ao carregar dados do usuário. Verifique sua conexão.");
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (user) {
      setLoading(true);
      await fetchProfileAndRole(user.id);
    }
  };

  useEffect(() => {
    // H9-G Bloco 2E — contexto de portal nunca pode ser herdado por outro
    // usuário: qualquer troca de identidade limpa a escolha persistida.
    let lastUserId: string | null = null;
    // Escuta mudanças na autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("Auth event:", event, session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);

        const nextUserId = session?.user?.id ?? null;
        if (lastUserId && nextUserId && lastUserId !== nextUserId) {
          clearActivePortalContext();
        }
        lastUserId = nextUserId;

        if (session?.user) {
          setLoading(true);
          setError(null);
          fetchProfileAndRole(session.user.id);
        } else {

          setProfile(null);
          setRoles([]);
          setPrimaryRole(null);
          setError(null);
          setLoading(false);
        }
      }
    );

    // Verifica sessão inicial
    const checkInitialSession = async () => {
      try {
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (initialSession?.user) {
          setSession(initialSession);
          setUser(initialSession.user);
          await fetchProfileAndRole(initialSession.user.id);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Erro ao verificar sessão inicial:", err);
        setLoading(false);
      }
    };

    checkInitialSession();

    return () => subscription.unsubscribe();
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

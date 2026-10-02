import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";


// ---------- mock do cliente canônico ----------
type Handler = (event: string, session: any) => unknown;

const h = vi.hoisted(() => ({
  listeners: [] as any[],
  unsubscribe: (() => {}) as any,
  signOut: (() => {}) as any,
  from: (() => {}) as any,
  getSession: (() => {}) as any,
}));

const listeners = h.listeners as Handler[];
const unsubscribe = vi.fn();
const signOutSpy = vi.fn(async () => ({ error: null }));
h.unsubscribe = unsubscribe;
h.signOut = signOutSpy;

let profileRow: any = { id: "p1", user_id: "user-a", nome: "A", email: "a@x.com", ativo: true };
let profileError: any = null;
let rolesRows: Array<{ role: string }> = [{ role: "administrador" }];
let profileDelay = 0;
let callsInsideCallback = 0;
let insideCallback = false;
let profileCalls = 0;

function tableBuilder(table: string) {
  if (insideCallback) callsInsideCallback += 1;
  const result =
    table === "profiles"
      ? () => {
          profileCalls += 1;
          return { data: profileRow, error: profileError };
        }
      : () => ({ data: rolesRows, error: null });

  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => {
      if (profileDelay) await new Promise((r) => setTimeout(r, profileDelay));
      return result();
    },
    then: (res: any, rej: any) =>
      Promise.resolve()
        .then(async () => {
          if (profileDelay) await new Promise((r) => setTimeout(r, profileDelay));
          return result();
        })
        .then(res, rej),
  };
  return builder;
}

let initialSession: any = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => h.from(table),
    auth: {
      onAuthStateChange: (handler: any) => {
        h.listeners.push(handler);
        return {
          data: {
            subscription: {
              unsubscribe: (...args: any[]) => {
                const i = h.listeners.indexOf(handler);
                if (i >= 0) h.listeners.splice(i, 1);
                return h.unsubscribe(...args);
              },
            },
          },
        };
      },

      getSession: async () => h.getSession(),
      signOut: (...args: any[]) => h.signOut(...args),
    },
  },
}));

h.from = (table: string) => tableBuilder(table);
h.getSession = async () => {
  if (insideCallback) callsInsideCallback += 1;
  return { data: { session: initialSession }, error: null };
};

import { AuthProvider, useAuth } from "@/hooks/useAuth";

function emit(event: string, session: any) {
  insideCallback = true;
  const results = listeners.map((h) => h(event, session));
  insideCallback = false;
  return results;
}

function Probe() {
  const { loading, error, role, user } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="role">{role ?? "-"}</span>
      <span data-testid="error">{error ?? "-"}</span>
      <span data-testid="user">{user?.id ?? "-"}</span>
    </div>
  );
}

function renderProvider(strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}


const sessionA = { user: { id: "user-a" } };
const sessionB = { user: { id: "user-b" } };

beforeEach(() => {
  listeners.length = 0;
  callsInsideCallback = 0;
  profileCalls = 0;
  profileDelay = 0;
  profileError = null;
  profileRow = { id: "p1", user_id: "user-a", nome: "A", email: "a@x.com", ativo: true };
  rolesRows = [{ role: "administrador" }];
  initialSession = null;
  h.getSession = async () => {
    if (insideCallback) callsInsideCallback += 1;
    return { data: { session: initialSession }, error: null };
  };

  signOutSpy.mockClear();
  unsubscribe.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthProvider — callback de autenticação", () => {
  it("o código-fonte não usa callback assíncrono em onAuthStateChange", () => {
    const src = readFileSync(resolve("src/hooks/useAuth.tsx"), "utf8");
    expect(src).not.toMatch(/onAuthStateChange\(\s*async/);
    expect(src).toMatch(/onAuthStateChange\(\s*\n?\s*\(event, session\) =>/);
  });

  it("o callback retorna void e não dispara chamadas Supabase na própria pilha", async () => {
    renderProvider();
    const results = emit("SIGNED_IN", sessionA);
    expect(results.every((r) => r === undefined)).toBe(true);
    expect(callsInsideCallback).toBe(0);
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("administrador"));
  });

  it("eventos repetidos do mesmo usuário não causam tempestade de cargas", async () => {
    renderProvider();
    emit("SIGNED_IN", sessionA);
    emit("INITIAL_SESSION", sessionA);
    emit("SIGNED_IN", sessionA);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    emit("TOKEN_REFRESHED", sessionA);
    await new Promise((r) => setTimeout(r, 10));
    expect(profileCalls).toBe(1);
  });

  it("resultado lento de A não aplica estado depois de B", async () => {
    renderProvider();
    profileDelay = 40;
    emit("SIGNED_IN", sessionA);
    await new Promise((r) => setTimeout(r, 5));
    profileDelay = 0;
    profileRow = { id: "p2", user_id: "user-b", nome: "B", email: "b@x.com", ativo: true };
    rolesRows = [{ role: "consultor_tecnico" }];
    emit("SIGNED_IN", sessionB);
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("user-b"));
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.getByTestId("role").textContent).toBe("consultor_tecnico");
  });

  it("logout durante o carregamento limpa papéis e não é sobrescrito", async () => {
    renderProvider();
    profileDelay = 40;
    emit("SIGNED_IN", sessionA);
    await new Promise((r) => setTimeout(r, 5));
    emit("SIGNED_OUT", null);
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.getByTestId("role").textContent).toBe("-");
    expect(screen.getByTestId("user").textContent).toBe("-");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("usuário inativo é bloqueado, sem papéis e com signOut", async () => {
    profileRow = { ...profileRow, ativo: false };
    renderProvider();
    emit("SIGNED_IN", sessionA);
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("Sua conta está inativa."));
    expect(screen.getByTestId("role").textContent).toBe("-");
    await waitFor(() => expect(signOutSpy).toHaveBeenCalled());
  });

  it("sessão Auth órfã sem perfil é encerrada", async () => {
    profileRow = null;
    renderProvider();
    emit("SIGNED_IN", sessionA);
    await waitFor(() => expect(screen.getByTestId("error").textContent).toContain("perfil não foi encontrado"));
    await waitFor(() => expect(signOutSpy).toHaveBeenCalled());
  });

  it("falha de carregamento limpa papéis antigos e encerra o loading", async () => {
    profileError = { message: "boom" };
    renderProvider();
    emit("SIGNED_IN", sessionA);
    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toBe(
        "Falha ao carregar dados do usuário. Verifique sua conexão.",
      ),
    );
    expect(screen.getByTestId("role").textContent).toBe("-");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("não há disputa duplicada entre getSession e INITIAL_SESSION", async () => {
    initialSession = sessionA;
    renderProvider();
    emit("INITIAL_SESSION", sessionA);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    await new Promise((r) => setTimeout(r, 20));
    expect(profileCalls).toBe(1);
  });

  it("unmount cancela timers e cancela a inscrição", async () => {
    const view = renderProvider();
    profileDelay = 40;
    emit("SIGNED_IN", sessionA);
    await act(async () => {
      view.unmount();
    });
    expect(unsubscribe).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 80));
  });

  it("StrictMode (setup→cleanup→setup) ainda carrega o mesmo usuário", async () => {
    initialSession = sessionA;
    renderProvider(true);
    // apenas o listener do segundo setup permanece ativo
    expect(listeners.length).toBe(1);
    emit("SIGNED_IN", sessionA);
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("administrador"));
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("troca A→B limpa perfil e papéis imediatamente", async () => {
    renderProvider();
    emit("SIGNED_IN", sessionA);
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("administrador"));
    profileDelay = 40;
    profileRow = { id: "p2", user_id: "user-b", nome: "B", email: "b@x.com", ativo: true };
    rolesRows = [{ role: "consultor_tecnico" }];
    await act(async () => {
      emit("SIGNED_IN", sessionB);
    });
    expect(screen.getByTestId("role").textContent).toBe("-");
    expect(screen.getByTestId("loading").textContent).toBe("true");
    await waitFor(
      () => expect(screen.getByTestId("role").textContent).toBe("consultor_tecnico"),
      { timeout: 500 },
    );
  });

  it("getSession antigo que rejeita depois do evento não desliga o loading", async () => {
    h.getSession = async () => {
      await new Promise((r) => setTimeout(r, 20));
      throw new Error("sessão obsoleta");
    };
    renderProvider();
    profileDelay = 80;
    emit("SIGNED_IN", sessionB);
    await new Promise((r) => setTimeout(r, 40));
    expect(screen.getByTestId("loading").textContent).toBe("true");
    h.getSession = async () => ({ data: { session: initialSession }, error: null });
  });

  describe("getSession de efeito descartado (StrictMode)", () => {
    function slowGetSession(session: any, delay = 40) {
      h.getSession = async () => {
        await new Promise((r) => setTimeout(r, delay));
        return { data: { session }, error: null };
      };
    }

    it("getSession antigo com A não troca a identidade depois do evento B", async () => {
      slowGetSession(sessionA);
      renderProvider(true);
      profileRow = { id: "p2", user_id: "user-b", nome: "B", email: "b@x.com", ativo: true };
      rolesRows = [{ role: "consultor_tecnico" }];
      emit("SIGNED_IN", sessionB);
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("consultor_tecnico"));
      await new Promise((r) => setTimeout(r, 80));
      expect(screen.getByTestId("user").textContent).toBe("user-b");
      expect(screen.getByTestId("role").textContent).toBe("consultor_tecnico");
    });

    it("getSession antigo com A não ressuscita a sessão depois do logout", async () => {
      slowGetSession(sessionA);
      renderProvider(true);
      emit("SIGNED_OUT", null);
      await new Promise((r) => setTimeout(r, 80));
      expect(screen.getByTestId("user").textContent).toBe("-");
      expect(screen.getByTestId("role").textContent).toBe("-");
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    it("getSession antigo sem sessão não encerra o loading do efeito ativo", async () => {
      slowGetSession(null);
      renderProvider(true);
      profileDelay = 120;
      emit("SIGNED_IN", sessionB);
      await new Promise((r) => setTimeout(r, 70));
      expect(screen.getByTestId("loading").textContent).toBe("true");
      profileDelay = 0;
    });

    it("sessão inicial válida continua carregando perfil e papéis", async () => {
      initialSession = sessionA;
      renderProvider();
      await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("user-a"));
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("administrador"));
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
  });
});


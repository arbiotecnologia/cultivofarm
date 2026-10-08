/**
 * Fase Corretiva 7–8 — Testes de guards multiportal e do fluxo pós-login.
 *
 * Objetivos:
 * - garantir a ordem estável dos hooks nos guards (nenhum "Rendered more hooks"
 *   ou "change in the order of Hooks" no console);
 * - garantir que `primaryRole` (e nunca `roles[0]`) dita o destino legado;
 * - garantir que produtor/administrador NÃO caem em `/sem-permissao`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type AuthState = {
  user: { id: string } | null;
  roles: string[];
  primaryRole: string | null;
  loading: boolean;
};

const authState: AuthState = {
  user: { id: "u1" },
  roles: [],
  primaryRole: null,
  loading: false,
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    ...authState,
    role: authState.primaryRole,
    session: null,
    profile: null,
    error: null,
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
}));

type ContextsState = {
  ready: boolean;
  data: {
    has_b2b_access: boolean;
    has_technical_access: boolean;
    available_contexts: string[];
    default_context: string | null;
    must_select_context: boolean;
  } | undefined;
  isLoading: boolean;
  isError: boolean;
};

const contextsState: ContextsState = {
  ready: true,
  data: undefined,
  isLoading: false,
  isError: false,
};

vi.mock("@/hooks/useAvailableContexts", () => ({
  useAvailableContexts: () => contextsState,
}));
const ownState = { ready: true, data: { id: "own" } as { id: string } | undefined, isLoading: false, isError: false };
vi.mock("@/hooks/useMyPartner", () => ({ useMyPartner: () => ownState }));

vi.mock("@/lib/accessAuditLog", () => ({
  logAccessDeniedOnce: vi.fn(),
  routeGroupFromPath: (p: string) => p.split("/").filter(Boolean).slice(0, 2).join("/"),
}));

// Importa DEPOIS dos mocks.
import { AppPortalGuard } from "@/components/guards/AppPortalGuard";
import { B2BRouteGuard } from "@/components/guards/B2BRouteGuard";
import { pickPrimaryRole, normalizeRoles } from "@/lib/portalContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAppGuard(initialPath = "/app") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/app/*"
          element={
            <AppPortalGuard>
              <div>APP_OK</div>
            </AppPortalGuard>
          }
        />
        <Route path="/sem-permissao" element={<div>SEM_PERMISSAO</div>} />
        <Route path="/app/login" element={<div>APP_LOGIN</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderB2BGuard(initialPath = "/portal-parceiro") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/portal-parceiro/*"
          element={
            <B2BRouteGuard>
              <div>B2B_OK</div>
            </B2BRouteGuard>
          }
        />
        <Route path="/sem-permissao" element={<div>SEM_PERMISSAO</div>} />
        <Route path="/auth" element={<div>AUTH</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function resetState() {
  Object.assign(ownState, { ready: true, data: { id: "own" }, isLoading: false, isError: false });
  authState.user = { id: "u1" };
  authState.roles = [];
  authState.primaryRole = null;
  authState.loading = false;
  contextsState.data = {
    has_b2b_access: false,
    has_technical_access: false,
    available_contexts: [],
    default_context: null,
    must_select_context: false,
  };
  contextsState.isLoading = false;
  contextsState.isError = false;
  contextsState.ready = true;
}

// Captura console.error → falha o teste se houver aviso de ordem de hooks.
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetState();
  errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const msg = args.map(String).join(" ");
    if (
      msg.includes("Rendered more hooks") ||
      msg.includes("change in the order of Hooks") ||
      msg.includes("Rendered fewer hooks")
    ) {
      throw new Error("Rules of Hooks violation: " + msg);
    }
  });
});

afterEach(() => {
  errorSpy.mockRestore();
  cleanup();
});

// ---------------------------------------------------------------------------
// AppPortalGuard
// ---------------------------------------------------------------------------

describe("AppPortalGuard", () => {
  it("libera administrador mesmo sem acesso técnico na RPC", () => {
    authState.roles = ["administrador"];
    authState.primaryRole = "administrador";
    contextsState.data!.has_technical_access = false;
    renderAppGuard();
    expect(screen.getByText("APP_OK")).toBeInTheDocument();
  });

  it("libera cliente_produtor mesmo sem acesso técnico", () => {
    authState.roles = ["cliente_produtor"];
    authState.primaryRole = "cliente_produtor";
    contextsState.data!.has_technical_access = false;
    renderAppGuard();
    expect(screen.getByText("APP_OK")).toBeInTheDocument();
  });

  it("libera técnico com acesso concedido pela RPC", () => {
    authState.roles = ["consultor_tecnico"];
    authState.primaryRole = "consultor_tecnico";
    contextsState.data!.has_technical_access = true;
    renderAppGuard();
    expect(screen.getByText("APP_OK")).toBeInTheDocument();
  });

  it("bloqueia B2B puro que não tem técnico", () => {
    authState.roles = ["parceiro_b2b"];
    authState.primaryRole = "parceiro_b2b";
    contextsState.data!.has_b2b_access = true;
    contextsState.data!.has_technical_access = false;
    renderAppGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("redireciona sem usuário", () => {
    authState.user = null;
    renderAppGuard();
    expect(screen.getByText("APP_LOGIN")).toBeInTheDocument();
  });

  it("mantém ordem de hooks entre loading e liberado", () => {
    contextsState.isLoading = true;
    const { rerender } = renderAppGuard();
    contextsState.isLoading = false;
    authState.roles = ["cliente_produtor"];
    rerender(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route
            path="/app/*"
            element={
              <AppPortalGuard>
                <div>APP_OK</div>
              </AppPortalGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("APP_OK")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// B2BRouteGuard
// ---------------------------------------------------------------------------

describe("B2BRouteGuard", () => {
  it("nega administrador sem vínculo B2B resolvido no servidor", () => {
    authState.roles = ["administrador"];
    authState.primaryRole = "administrador";
    if (contextsState.data) contextsState.data.has_b2b_access = false;
    renderB2BGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("nega gestor_comercial sem vínculo B2B resolvido no servidor", () => {
    authState.roles = ["gestor_comercial"];
    authState.primaryRole = "gestor_comercial";
    if (contextsState.data) contextsState.data.has_b2b_access = false;
    renderB2BGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("libera parceiro_b2b com has_b2b_access=true", () => {
    authState.roles = ["parceiro_b2b"];
    authState.primaryRole = "parceiro_b2b";
    if (contextsState.data) {
      contextsState.data.has_b2b_access = true;
      contextsState.data.available_contexts = ["b2b"];
    }
    renderB2BGuard();
    expect(screen.getByText("B2B_OK")).toBeInTheDocument();
  });

  it("bloqueia técnico puro sem acesso B2B", () => {
    authState.roles = ["consultor_tecnico"];
    authState.primaryRole = "consultor_tecnico";
    contextsState.data!.has_b2b_access = false;
    contextsState.data!.has_technical_access = true;
    renderB2BGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("redireciona para /auth sem usuário", () => {
    authState.user = null;
    renderB2BGuard();
    expect(screen.getByText("AUTH")).toBeInTheDocument();
  });

  it("bloqueia quando a RPC retorna erro", () => {
    authState.roles = ["parceiro_b2b"];
    contextsState.isError = true;
    contextsState.data = undefined;
    renderB2BGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("nega contexto de gestão mesmo com a flag legada has_b2b_access", () => {
    authState.roles = ["administrador"];
    if (contextsState.data) {
      contextsState.data.has_b2b_access = true;
      contextsState.data.available_contexts = ["admin"];
    }
    renderB2BGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("nega readiness perdida mesmo com resultado B2B em cache", () => {
    contextsState.ready = false;
    if (contextsState.data) {
      contextsState.data.has_b2b_access = true;
      contextsState.data.available_contexts = ["b2b"];
    }
    renderB2BGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("nega papéis cumulativos mesmo com contexto B2B explícito", () => {
    authState.roles = ["administrador", "parceiro_b2b"];
    if (contextsState.data) {
      contextsState.data.has_b2b_access = true;
      contextsState.data.available_contexts = ["admin", "b2b"];
    }
    renderB2BGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });
  it("nega parceiro sem projeção própria mesmo com contexto em cache", () => {
    authState.roles = ["parceiro_b2b"];
    ownState.data = undefined;
    if (contextsState.data) { contextsState.data.has_b2b_access = true; contextsState.data.available_contexts = ["b2b"]; }
    renderB2BGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Fluxo pós-login: primaryRole determinístico (Fase 8)
// ---------------------------------------------------------------------------

describe("pickPrimaryRole (fluxo login)", () => {
  it("administrador vence qualquer combinação — independente da ordem", () => {
    const a = pickPrimaryRole(normalizeRoles([{ role: "parceiro_b2b" }, { role: "administrador" }]));
    const b = pickPrimaryRole(normalizeRoles([{ role: "administrador" }, { role: "parceiro_b2b" }]));
    expect(a).toBe("administrador");
    expect(b).toBe("administrador");
  });

  it("gestor_comercial + parceiro_b2b → gestor_comercial (legado admin comercial)", () => {
    const r = pickPrimaryRole(normalizeRoles([{ role: "parceiro_b2b" }, { role: "gestor_comercial" }]));
    expect(r).toBe("gestor_comercial");
  });

  it("consultor_tecnico + parceiro_b2b_tecnico → parceiro_b2b_tecnico tem maior prioridade legada", () => {
    const r = pickPrimaryRole(
      normalizeRoles([{ role: "consultor_tecnico" }, { role: "parceiro_b2b_tecnico" }])
    );
    expect(r).toBe("parceiro_b2b_tecnico");
  });

  it("cliente_produtor sozinho vira primaryRole", () => {
    expect(pickPrimaryRole(normalizeRoles([{ role: "cliente_produtor" }]))).toBe("cliente_produtor");
  });

  it("nenhum papel → null (sem primaryRole)", () => {
    expect(pickPrimaryRole(normalizeRoles([]))).toBeNull();
  });

  it("papel inválido é descartado", () => {
    const r = pickPrimaryRole(normalizeRoles([{ role: "invalido_x" } as never]));
    expect(r).toBeNull();
  });
});

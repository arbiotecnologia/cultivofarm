/**
 * Regressão — PortalGuard (`/portal/*`) exige contexto de Produtor.
 *
 * Antes desta correção, PortalGuard verificava apenas autenticação e liberava
 * qualquer usuário logado ao PortalLayout. Cobrimos aqui:
 * - cliente_produtor liberado
 * - administrador liberado (suporte)
 * - multipapel contendo cliente_produtor liberado
 * - financeiro, consultor_tecnico e parceiro_b2b bloqueados → /sem-permissao
 * - anônimo redirecionado para /auth
 * - estados loading e error preservam UI original (não redirecionam)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";

type AuthState = {
  user: { id: string } | null;
  roles: string[];
  role: string | null;
  loading: boolean;
  error: string | null;
};

const authState: AuthState = {
  user: { id: "u1" },
  roles: [],
  role: null,
  loading: false,
  error: null,
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    ...authState,
    authzReady: true,
    authzEpoch: 0,
    authzState: "valid",
    session: null,
    profile: null,
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/pages/portal/PortalLayout", () => ({
  default: () => <div>PORTAL_LAYOUT</div>,
}));

vi.mock("@/components/ErrorRecovery", () => ({
  ErrorRecovery: ({ message }: { message: string }) => <div>ERR:{message}</div>,
}));

// Evita puxar todo o grafo do App.tsx só para expor PortalGuard.
// Reimportamos direto após configurar mocks.
import { PortalGuard } from "@/App";

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/portal"]}>
      <Routes>
        <Route path="/portal/*" element={<PortalGuard />} />
        <Route path="/auth" element={<div>AUTH</div>} />
        <Route path="/sem-permissao" element={<div>SEM_PERMISSAO</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function reset() {
  authState.user = { id: "u1" };
  authState.roles = [];
  authState.role = null;
  authState.loading = false;
  authState.error = null;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  reset();
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

describe("PortalGuard (/portal/*)", () => {
  it("libera cliente_produtor", () => {
    authState.roles = ["cliente_produtor"];
    authState.role = "cliente_produtor";
    renderGuard();
    expect(screen.getByText("PORTAL_LAYOUT")).toBeInTheDocument();
  });

  it("libera administrador (suporte)", () => {
    authState.roles = ["administrador"];
    authState.role = "administrador";
    renderGuard();
    expect(screen.getByText("PORTAL_LAYOUT")).toBeInTheDocument();
  });

  it("libera multipapel que contém cliente_produtor", () => {
    authState.roles = ["parceiro_b2b", "cliente_produtor"];
    authState.role = "parceiro_b2b";
    renderGuard();
    expect(screen.getByText("PORTAL_LAYOUT")).toBeInTheDocument();
  });

  it("bloqueia financeiro → /sem-permissao", () => {
    authState.roles = ["financeiro"];
    authState.role = "financeiro";
    renderGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("bloqueia consultor_tecnico → /sem-permissao", () => {
    authState.roles = ["consultor_tecnico"];
    authState.role = "consultor_tecnico";
    renderGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("bloqueia parceiro_b2b puro → /sem-permissao", () => {
    authState.roles = ["parceiro_b2b"];
    authState.role = "parceiro_b2b";
    renderGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("anônimo → /auth", () => {
    authState.user = null;
    renderGuard();
    expect(screen.getByText("AUTH")).toBeInTheDocument();
  });

  it("mantém ErrorRecovery quando há erro (não redireciona)", () => {
    authState.error = "boom";
    renderGuard();
    expect(screen.getByText("ERR:boom")).toBeInTheDocument();
  });

  it("mantém loading (não redireciona)", () => {
    authState.loading = true;
    renderGuard();
    expect(screen.queryByText("PORTAL_LAYOUT")).toBeNull();
    expect(screen.queryByText("SEM_PERMISSAO")).toBeNull();
  });
});

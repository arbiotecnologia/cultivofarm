/**
 * H9-G Bloco 2C — regressão de UI do guard das rotas internas de visita.
 *
 * Cobre: produtor (desktop e mobile), financeiro, anônimo, admin autorizado,
 * erro de rede, prazo esgotado, ausência de flash de conteúdo e resposta
 * indistinguível entre UUID existente e inexistente.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
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
  useAuth: () => ({ ...authState, refresh: vi.fn(), signOut: vi.fn() }),
}));

import { VisitaRouteGuard } from "@/components/guards/VisitaRouteGuard";
import { VISITA_GUARD_TIMEOUT_MS } from "@/lib/visita/visitaRouteAccess";

const UUID_EXISTENTE = "2572bce1-203c-4237-a61a-e3eb308cc023";
const UUID_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

function renderGuard(id = UUID_EXISTENTE) {
  return render(
    <MemoryRouter initialEntries={[`/visita-tecnica/${id}`]}>
      <Routes>
        <Route
          path="/visita-tecnica/:id"
          element={
            <VisitaRouteGuard>
              <div>VISITA_CONTEUDO</div>
            </VisitaRouteGuard>
          }
        />
        <Route path="/auth" element={<div>AUTH</div>} />
        <Route path="/sem-permissao" element={<div>SEM_PERMISSAO</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.user = { id: "u1" };
  authState.roles = [];
  authState.role = null;
  authState.loading = false;
  authState.error = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("VisitaRouteGuard", () => {
  it("produtor autenticado (desktop) → tela neutra, sem conteúdo", () => {
    authState.roles = ["cliente_produtor"];
    authState.role = "cliente_produtor";
    renderGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
    expect(screen.queryByText("VISITA_CONTEUDO")).toBeNull();
  });

  it("produtor em viewport mobile → mesmo resultado", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 390 });
    authState.roles = ["cliente_produtor"];
    authState.role = "cliente_produtor";
    renderGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("financeiro → negado", () => {
    authState.roles = ["financeiro"];
    authState.role = "financeiro";
    renderGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("anônimo → /auth", () => {
    authState.user = null;
    renderGuard();
    expect(screen.getByText("AUTH")).toBeInTheDocument();
    expect(screen.queryByText("VISITA_CONTEUDO")).toBeNull();
  });

  it("UUID existente e inexistente são indistinguíveis para produtor", () => {
    authState.roles = ["cliente_produtor"];
    authState.role = "cliente_produtor";
    const { container: a } = renderGuard(UUID_EXISTENTE);
    const htmlA = a.innerHTML;
    cleanup();
    const { container: b } = renderGuard(UUID_INEXISTENTE);
    expect(b.innerHTML).toBe(htmlA);
  });

  it("erro de rede → tela neutra com ação, sem conteúdo", () => {
    authState.error = "Falha ao carregar dados do usuário. Verifique sua conexão.";
    renderGuard();
    expect(screen.getByText("Não foi possível verificar seu acesso")).toBeInTheDocument();
    expect(screen.queryByText("VISITA_CONTEUDO")).toBeNull();
  });

  it("carregando não vaza conteúdo e não fica infinito", () => {
    vi.useFakeTimers();
    authState.loading = true;
    authState.roles = ["administrador"];
    authState.role = "administrador";
    renderGuard();
    expect(screen.queryByText("VISITA_CONTEUDO")).toBeNull();
    expect(screen.getByText("Verificando acesso…")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(VISITA_GUARD_TIMEOUT_MS + 100);
    });
    expect(screen.getByText("Não foi possível verificar seu acesso")).toBeInTheDocument();
  });

  it("admin autorizado → conteúdo preservado", () => {
    authState.roles = ["administrador"];
    authState.role = "administrador";
    renderGuard();
    expect(screen.getByText("VISITA_CONTEUDO")).toBeInTheDocument();
  });

  it("consultor técnico autorizado → conteúdo preservado", () => {
    authState.roles = ["consultor_tecnico"];
    authState.role = "consultor_tecnico";
    renderGuard();
    expect(screen.getByText("VISITA_CONTEUDO")).toBeInTheDocument();
  });
});

/**
 * H9-G Bloco 2E — guard da visita respeita o contexto de portal escolhido,
 * sobrevive a refresh (sessionStorage) e não vaza conteúdo (sem flash).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";

const authState = {
  user: { id: "fagner" } as { id: string } | null,
  roles: ["consultor_tecnico", "parceiro_b2b"] as string[],
  role: "parceiro_b2b" as string | null,
  primaryRole: "parceiro_b2b" as string | null,
  loading: false,
  error: null as string | null,
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ ...authState, refresh: vi.fn(), signOut: vi.fn() }),
}));

import { VisitaRouteGuard } from "@/components/guards/VisitaRouteGuard";
import {
  setActivePortalContext,
  clearActivePortalContext,
} from "@/lib/activePortalContext";

const UUID = "2572bce1-203c-4237-a61a-e3eb308cc023";

function renderGuard(id = UUID) {
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
  clearActivePortalContext();
  authState.user = { id: "fagner" };
  authState.roles = ["consultor_tecnico", "parceiro_b2b"];
  authState.role = "parceiro_b2b";
  authState.primaryRole = "parceiro_b2b";
  authState.loading = false;
  authState.error = null;
});

afterEach(() => {
  cleanup();
  clearActivePortalContext();
});

describe("VisitaRouteGuard × contexto ativo", () => {
  it("Portal Técnico escolhido → acessa a visita (deep link)", () => {
    setActivePortalContext("technical");
    renderGuard();
    expect(screen.getByText("VISITA_CONTEUDO")).toBeInTheDocument();
  });

  it("Portal B2B escolhido → negado sem vazar conteúdo", () => {
    setActivePortalContext("b2b");
    renderGuard();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
    expect(screen.queryByText("VISITA_CONTEUDO")).toBeNull();
  });

  it("refresh mantém o contexto técnico persistido em sessão", () => {
    setActivePortalContext("technical");
    renderGuard();
    cleanup();
    // simula recarga: sessionStorage preservado
    renderGuard();
    expect(screen.getByText("VISITA_CONTEUDO")).toBeInTheDocument();
  });

  it("contexto limpo (logout/troca de usuário) não é herdado", () => {
    setActivePortalContext("technical");
    clearActivePortalContext();
    authState.user = null;
    renderGuard();
    expect(screen.getByText("AUTH")).toBeInTheDocument();
  });

  it("UUID inexistente com B2B ativo é indistinguível do existente", () => {
    setActivePortalContext("b2b");
    const { container: a } = renderGuard(UUID);
    const htmlA = a.innerHTML;
    cleanup();
    const { container: b } = renderGuard("00000000-0000-4000-8000-000000000000");
    expect(b.innerHTML).toBe(htmlA);
  });
});

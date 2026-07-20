import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders, makeQueryClient } from "./helpers/renderWithProviders";
import {
  setActivePortalContext,
  clearActivePortalContext,
  getActivePortalContext,
} from "@/lib/activePortalContext";

const signOutSpy = vi.fn(async () => {});
const switchSpy = vi.fn(async () => true);

// hoisted mutable auth state para variar primaryRole entre testes.
const authState = vi.hoisted(() => ({
  primaryRole: "consultor_tecnico" as string,
  roles: ["consultor_tecnico", "parceiro_b2b"] as string[],
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    session: null,
    profile: { id: "p1", user_id: "u1", nome: "Duplo Teste", email: "duplo@arbio.com" },
    role: authState.primaryRole,
    primaryRole: authState.primaryRole,
    roles: authState.roles,
    loading: false,
    error: null,
    signOut: signOutSpy,
    refresh: async () => {},
  }),
}));

vi.mock("@/hooks/useAvailableContexts", () => ({
  useAvailableContexts: () => ({
    data: {
      available_contexts: ["technical", "b2b"],
      default_context: null,
      must_select_context: true,
      has_b2b_access: true,
      has_technical_access: true,
    },
  }),
}));

vi.mock("@/hooks/usePushSubscription", () => ({
  usePushSubscription: () => ({
    isSupported: false,
    subscription: null,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useSwitchPortal", () => ({
  useSwitchPortal: () => switchSpy,
}));

import MobilePerfil from "@/pages/app/MobilePerfil";

describe("MobilePerfil — usuário duplo em contexto technical", () => {
  beforeEach(() => {
    clearActivePortalContext();
    signOutSpy.mockClear();
    switchSpy.mockClear();
    authState.primaryRole = "consultor_tecnico";
    authState.roles = ["consultor_tecnico", "parceiro_b2b"];
  });

  it("exibe 'Consultor Técnico' quando contexto ativo é technical", () => {
    setActivePortalContext("technical");
    renderWithProviders(<MobilePerfil />);
    expect(screen.getAllByText("Consultor Técnico").length).toBeGreaterThan(0);
  });

  it("lista 'Portal Parceiro B2B' em Outros acessos, sem substituir contexto ativo", () => {
    setActivePortalContext("technical");
    renderWithProviders(<MobilePerfil />);
    expect(screen.getByText("Outros acessos disponíveis")).toBeInTheDocument();
    expect(screen.getByText(/Portal Parceiro B2B/)).toBeInTheDocument();
    expect(screen.getAllByText("Consultor Técnico").length).toBeGreaterThan(0);
  });

  it("botão 'Trocar de portal' presente quando b2b + technical disponíveis", () => {
    setActivePortalContext("technical");
    renderWithProviders(<MobilePerfil />);
    expect(screen.getByRole("button", { name: /Trocar de portal/i })).toBeInTheDocument();
  });

  it("fallback deriva do papel primário quando não há contexto ativo", () => {
    renderWithProviders(<MobilePerfil />);
    expect(screen.getAllByText("Consultor Técnico").length).toBeGreaterThan(0);
  });
});

describe("MobilePerfil — contexto technical não pode mostrar 'Parceiro B2B (Gestor)' como cargo principal", () => {
  beforeEach(() => {
    clearActivePortalContext();
    // Usuário duplo cujo papel primário é B2B, mas operando como técnico.
    authState.primaryRole = "parceiro_b2b";
    authState.roles = ["parceiro_b2b", "consultor_tecnico"];
  });

  it("cabeçalho e campo de perfil exibem 'Consultor Técnico', nunca 'Parceiro B2B (Gestor)'", () => {
    setActivePortalContext("technical");
    renderWithProviders(<MobilePerfil />);
    // Rótulo do contexto e do cargo alinhados.
    expect(screen.getAllByText("Consultor Técnico").length).toBeGreaterThanOrEqual(2);
    // Nenhuma ocorrência do rótulo B2B no cartão principal.
    expect(screen.queryByText(/Parceiro B2B \(Gestor\)/)).toBeNull();
    expect(screen.queryByText(/Parceiro B2B \(Técnico\)/)).toBeNull();
    // 'Portal Parceiro B2B' permanece disponível somente em Outros acessos.
    expect(screen.getByText("Outros acessos disponíveis")).toBeInTheDocument();
    expect(screen.getByText(/Portal Parceiro B2B/)).toBeInTheDocument();
  });

  it("no contexto b2b, mostra o rótulo B2B do papel primário no cabeçalho", () => {
    setActivePortalContext("b2b");
    renderWithProviders(<MobilePerfil />);
    expect(screen.getAllByText("Parceiro B2B (Gestor)").length).toBeGreaterThan(0);
    expect(screen.queryByText("Consultor Técnico")).toBeNull();
  });
});

describe("MobilePerfil — papel efetivo aplicador", () => {
  beforeEach(() => {
    clearActivePortalContext();
    authState.primaryRole = "aplicador";
    authState.roles = ["aplicador"];
  });

  it("mostra 'Aplicador' no cabeçalho e no campo de perfil, nunca 'Consultor Técnico'", () => {
    renderWithProviders(<MobilePerfil />);
    expect(screen.getAllByText("Aplicador").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Consultor Técnico")).toBeNull();
  });
});

describe("MobilePerfil — logout limpa contexto e cache", () => {
  it("clearActivePortalContext + queryClient.clear zeram estado", () => {
    setActivePortalContext("technical");
    const client: QueryClient = makeQueryClient();
    client.setQueryData(["available-portal-contexts", "u1"], { has_technical_access: true });
    expect(client.getQueryData(["available-portal-contexts", "u1"])).toBeTruthy();

    clearActivePortalContext();
    client.clear();

    expect(getActivePortalContext()).toBeNull();
    expect(client.getQueryData(["available-portal-contexts", "u1"])).toBeUndefined();
  });
});

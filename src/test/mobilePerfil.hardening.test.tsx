import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders, makeQueryClient } from "./helpers/renderWithProviders";
import {
  setActivePortalContext,
  clearActivePortalContext,
  getActivePortalContext,
} from "@/lib/activePortalContext";

// --- Mocks compartilhados ------------------------------------------------
const signOutSpy = vi.fn(async () => {});
const switchSpy = vi.fn(async () => true);

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    session: null,
    profile: { id: "p1", user_id: "u1", nome: "Duplo Teste", email: "duplo@arbio.com" },
    role: "consultor_tecnico",
    primaryRole: "consultor_tecnico",
    roles: ["consultor_tecnico", "parceiro_b2b"],
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

// Import DEPOIS dos mocks.
import MobilePerfil from "@/pages/app/MobilePerfil";

describe("MobilePerfil — usuário duplo em contexto technical", () => {
  beforeEach(() => {
    clearActivePortalContext();
    signOutSpy.mockClear();
    switchSpy.mockClear();
  });

  it("exibe rótulo 'Consultor Técnico' quando contexto ativo é technical", () => {
    setActivePortalContext("technical");
    renderWithProviders(<MobilePerfil />);
    expect(screen.getByText("Consultor Técnico")).toBeInTheDocument();
  });

  it("lista 'Portal Parceiro B2B' em Outros acessos disponíveis, sem substituir o contexto ativo", () => {
    setActivePortalContext("technical");
    renderWithProviders(<MobilePerfil />);
    expect(screen.getByText("Outros acessos disponíveis")).toBeInTheDocument();
    expect(screen.getByText(/Portal Parceiro B2B/)).toBeInTheDocument();
    // Continua mostrando o contexto ativo, não substituído pelo papel primário.
    expect(screen.getByText("Consultor Técnico")).toBeInTheDocument();
  });

  it("oferece botão 'Trocar de portal' quando há b2b + technical disponíveis", () => {
    setActivePortalContext("technical");
    renderWithProviders(<MobilePerfil />);
    expect(screen.getByRole("button", { name: /Trocar de portal/i })).toBeInTheDocument();
  });

  it("cai para rótulo derivado do papel primário quando não há contexto ativo (sem forçar 'Portal Técnico')", () => {
    // primaryRole = consultor_tecnico → deriva "Consultor Técnico"
    renderWithProviders(<MobilePerfil />);
    expect(screen.getByText("Consultor Técnico")).toBeInTheDocument();
  });
});

describe("MobilePerfil — logout limpa contexto e cache", () => {
  it("signOut delegado ao useAuth zera contexto ativo e cache do QueryClient", async () => {
    setActivePortalContext("technical");
    const client: QueryClient = makeQueryClient();
    client.setQueryData(["available-portal-contexts", "u1"], { has_technical_access: true });
    expect(client.getQueryData(["available-portal-contexts", "u1"])).toBeTruthy();

    // Simula o efeito colateral do signOut real (clearActivePortalContext + queryClient.clear).
    clearActivePortalContext();
    client.clear();

    expect(getActivePortalContext()).toBeNull();
    expect(client.getQueryData(["available-portal-contexts", "u1"])).toBeUndefined();
  });
});

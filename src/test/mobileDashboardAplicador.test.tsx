import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./helpers/renderWithProviders";
import { clearActivePortalContext } from "@/lib/activePortalContext";

const authState = vi.hoisted(() => ({
  primaryRole: "aplicador" as string,
  roles: ["aplicador"] as string[],
  nome: "Aplicador Teste",
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u-aplic" },
    profile: { id: "p", user_id: "u-aplic", nome: authState.nome, email: "aplicador@arbio.com" },
    role: authState.primaryRole,
    primaryRole: authState.primaryRole,
    roles: authState.roles,
    loading: false,
    error: null,
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSystemConfig", () => ({
  useSystemConfig: () => ({
    config: { nome_empresa: "Cultivo Farm" },
    defaults: { nome_empresa: "Cultivo Farm" },
  }),
}));

vi.mock("@/components/LogoDisplay", () => ({
  LogoDisplay: () => null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ count: 0 }),
        not: () => Promise.resolve({ count: 0 }),
        neq: () => Promise.resolve({ count: 0 }),
        eq: () => Promise.resolve({ count: 0 }),
        then: (fn: any) => fn({ count: 0 }),
      }),
    }),
  },
}));

import MobileDashboardConsultor from "@/pages/app/MobileDashboardConsultor";

describe("MobileDashboardConsultor — saudação por papel efetivo", () => {
  beforeEach(() => {
    clearActivePortalContext();
    authState.primaryRole = "aplicador";
    authState.roles = ["aplicador"];
  });

  it("aplicador vê 'Olá, aplicador'", () => {
    renderWithProviders(<MobileDashboardConsultor />);
    expect(screen.getByText(/Olá, aplicador/)).toBeInTheDocument();
  });

  it("consultor_tecnico vê 'Olá, consultor'", () => {
    authState.primaryRole = "consultor_tecnico";
    authState.roles = ["consultor_tecnico"];
    renderWithProviders(<MobileDashboardConsultor />);
    expect(screen.getByText(/Olá, consultor/)).toBeInTheDocument();
  });

  it("usuário duplo parceiro_b2b + consultor_tecnico continua 'Olá, consultor'", () => {
    authState.primaryRole = "parceiro_b2b";
    authState.roles = ["parceiro_b2b", "consultor_tecnico"];
    renderWithProviders(<MobileDashboardConsultor />);
    expect(screen.getByText(/Olá, consultor/)).toBeInTheDocument();
  });
});

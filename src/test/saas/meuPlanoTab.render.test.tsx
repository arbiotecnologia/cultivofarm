import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  assinatura: {
    data: { id: "subscription-test", plan_id: "plan-test", plan_version_id: "version-test", status: "TRIAL", started_at: null, trial_ends_at: null, current_period_end: null } as object | null,
    isLoading: false,
    isError: false,
  },
  refetch: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const base = { isLoading: false, isError: false, refetch: state.refetch };
    switch (queryKey[1]) {
      case "minha-organizacao": return { ...base, data: "organization-test" };
      case "minha-assinatura": return { ...base, ...state.assinatura };
      case "meu-plano": return { ...base, data: { name: "Gestão" } };
      case "catalogo-meu-plano": return { ...base, data: { modulos: [], features: [] } };
      default: return { ...base, data: [] };
    }
  },
}));

import { MeuPlanoTab } from "@/pages/configuracoes/MeuPlanoTab";

const ausente = "Nenhuma assinatura encontrada para a sua empresa no momento.";

describe("MeuPlanoTab — estado de consulta", () => {
  beforeEach(() => {
    state.assinatura.data = { id: "subscription-test", plan_id: "plan-test", plan_version_id: "version-test", status: "TRIAL", started_at: null, trial_ends_at: null, current_period_end: null };
    state.assinatura.isLoading = false;
    state.assinatura.isError = false;
    state.refetch.mockClear();
  });

  it("mostra assinatura válida sem mensagem falsa de ausência", () => {
    render(<MeuPlanoTab />);
    expect(screen.getByText("Gestão")).toBeInTheDocument();
    expect(screen.getByText("Período de teste")).toBeInTheDocument();
    expect(screen.getByText("Vinculada")).toBeInTheDocument();
    expect(screen.queryByText(ausente)).not.toBeInTheDocument();
  });

  it("preserva mensagem de ausência real", () => {
    state.assinatura.data = null;
    render(<MeuPlanoTab />);
    expect(screen.getByText(ausente)).toBeInTheDocument();
    expect(screen.queryByText("Vinculada")).not.toBeInTheDocument();
  });

  it("preserva skeleton durante carregamento sem anunciar ausência", () => {
    state.assinatura.data = null;
    state.assinatura.isLoading = true;
    const { container } = render(<MeuPlanoTab />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(screen.queryByText(ausente)).not.toBeInTheDocument();
  });

  it.each([true, false])("preserva erro e retry com dados existentes=%s", (comDados) => {
    if (!comDados) state.assinatura.data = null;
    state.assinatura.isError = true;
    render(<MeuPlanoTab />);
    expect(screen.getByText("Não foi possível carregar as informações do plano agora.")).toBeInTheDocument();
    expect(screen.queryByText(ausente)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(state.refetch).toHaveBeenCalledTimes(3);
    if (comDados) expect(screen.getByText("Vinculada")).toBeInTheDocument();
  });
});
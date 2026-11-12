import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { acaoStatusGenericaPermitida, onboardingBloqueia } from "@/lib/saas/orgOnboarding";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import { OnboardingEmpresa } from "@/components/onboarding/OnboardingEmpresa";
import type { OnboardingState } from "@/hooks/useOrgOnboarding";

const base: OnboardingState = {
  required: true, is_admin: true, organization_id: "o1", status: "onboarding", razao_social: "Emitente Fictício Ltda",
  cnpj: "11222333000181",
  dados: { razao_social: "Emitente Fictício Ltda", cnpj: "11222333000181", cep: "38600-000", logradouro: "Rua A",
    cidade: "Paracatu", uf: "MG", telefone: "38999990000" },
};
const voltarAteEtapa2 = () => {
  // Retomada abre na primeira pendência (Responsável); volta até "Dados da empresa".
  fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
  fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
};
const renderiza = (state: OnboardingState) => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter><OnboardingEmpresa state={state} /></MemoryRouter></QueryClientProvider>,
);

describe("onboarding com revisão obrigatória", () => {
  it("empresa em revisão bloqueia módulos e ações genéricas não a ativam", () => {
    expect(onboardingBloqueia("aguardando_revisao")).toBe(true);
    expect(acaoStatusGenericaPermitida("aguardando_revisao", "ativa")).toBe(false);
    expect(acaoStatusGenericaPermitida("ativa", "aguardando_revisao")).toBe(false);
    expect(acaoStatusGenericaPermitida("aguardando_revisao", "cancelada")).toBe(true);
    expect(acaoStatusGenericaPermitida("onboarding", "ativa")).toBe(false);
  });

  it("mostra a tela de revisão pendente sem formulário nem reenvio", () => {
    renderiza({ ...base, status: "aguardando_revisao", review_pending: true,
      review: { origem: "onboarding", motivo_codigo: "sem_evidencia_servidor", submetido_em: "2026-11-12T15:00:00Z" } });
    expect(screen.getByText("Cadastro em revisão")).toBeInTheDocument();
    expect(screen.getByText(/Cadastro manual ou sem consulta oficial/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Concluir cadastro/ })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("usuário comum da empresa em revisão também vê a tela pendente, sem motivo", () => {
    renderiza({ required: true, is_admin: false, status: "aguardando_revisao", review_pending: true });
    expect(screen.getByText("Cadastro em revisão")).toBeInTheDocument();
    expect(screen.queryByText(/Motivo da revisão/)).toBeNull();
  });

  it("retomada sem evidência do servidor não exibe a empresa como verificada", () => {
    renderiza({ ...base, evidencia: null });
    voltarAteEtapa2();
    expect(screen.queryByText(/Fonte: Receita Federal/)).toBeNull();
    expect(screen.getByText(/Cadastro não verificado/)).toBeInTheDocument();
  });

  it("retomada com evidência vigente do servidor mostra a situação oficial registrada", () => {
    renderiza({ ...base, evidencia: { id: "e1", cnpj: "11222333000181", razao_social: "Emitente Fictício Ltda",
      situacao_cadastral: "BAIXADA", fonte: "Receita Federal via BrasilAPI", consultado_em: "2026-11-12T15:00:00Z", vigente: true } });
    voltarAteEtapa2();
    expect(screen.getByText(/Situação cadastral: BAIXADA/)).toBeInTheDocument();
  });
});

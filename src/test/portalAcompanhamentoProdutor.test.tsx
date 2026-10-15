/**
 * FASE 10.1 — Testes do Portal do Produtor / Acompanhamento.
 *
 * Estes testes protegem a unificação de OS + Produção + Entregas + Histórico
 * em `/portal/acompanhamento`, os redirects das rotas legadas e a ausência
 * de qualquer consulta B2B nesse fluxo.
 *
 * Estratégia: asserções estáticas sobre o código-fonte (rápido e determinístico)
 * + smoke render da tela unificada com Supabase e usePortalCliente mockados.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "actor" }, profile: { user_id: "actor", organization_id: "tenant", ativo: true, senha_provisoria: false }, roles: ["cliente_produtor"], loading: false }) }));

// ---------------------------------------------------------------------------
// Mocks — Supabase, usePortalCliente, react-router navigate
// ---------------------------------------------------------------------------

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => fromMock(...args),
  },
}));

vi.mock("@/hooks/usePortalCliente", () => ({
  usePortalCliente: () => ({
    clienteId: "cliente-1",
    clienteNome: "Fazenda Teste",
    clientes: [{ id: "cliente-1", nome: "Fazenda Teste", principal: true }],
    setClienteAtivo: vi.fn(),
    loading: false,
  }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => true,
}));

function makeBuilder(rows: any[] = []) {
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    in: vi.fn(() => b),
    or: vi.fn(() => b),
    order: vi.fn(() => b),
    abortSignal: vi.fn(() => b),
    then: (resolveFn: any) => Promise.resolve({ data: rows, error: null }).then(resolveFn),
  };
  return b;
}

beforeEach(() => {
  fromMock.mockReset();
  fromMock.mockImplementation(() => makeBuilder([]));
});

// ---------------------------------------------------------------------------
// Helpers de leitura de código-fonte
// ---------------------------------------------------------------------------

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

// ---------------------------------------------------------------------------

describe("Fase 10.1 — /portal/acompanhamento", () => {
  it("(1-5) renderiza a tela com as 4 abas", async () => {
    const { default: PortalAcompanhamento } = await import(
      "@/pages/portal/PortalAcompanhamento"
    );
    render(
      <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/portal/acompanhamento"]}>
        <PortalAcompanhamento />
      </MemoryRouter></QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: /Acompanhamento/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Ordens de Serviço/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Produção/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Entregas/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Histórico/i })).toBeInTheDocument();
  }, 20000);
});

describe("Fase 10.1 — Redirects legados", () => {
  const app = read("src/App.tsx");

  it("(6) /portal/ordens-servico redireciona para /portal/acompanhamento?tab=ordens-servico", () => {
    expect(app).toMatch(
      /path="\/portal\/ordens-servico"[\s\S]*?to="\/portal\/acompanhamento\?tab=ordens-servico"/,
    );
  });

  it("(7) /portal/producao redireciona para /portal/acompanhamento?tab=producao", () => {
    expect(app).toMatch(
      /path="\/portal\/producao"[\s\S]*?to="\/portal\/acompanhamento\?tab=producao"/,
    );
  });

  it("(8) /portal/entregas redireciona para /portal/acompanhamento?tab=entregas", () => {
    expect(app).toMatch(
      /path="\/portal\/entregas"[\s\S]*?to="\/portal\/acompanhamento\?tab=entregas"/,
    );
  });
});

describe("Fase 10.1 — Sem B2B no Acompanhamento", () => {
  const files = [
    "src/pages/portal/PortalAcompanhamento.tsx",
    "src/pages/portal/PortalOrdensServico.tsx",
    "src/pages/portal/PortalProducao.tsx",
    "src/pages/portal/PortalEntregas.tsx",
  ];

  it("(9) nenhum arquivo do Acompanhamento consulta partner_orders", () => {
    for (const f of files) {
      expect(read(f)).not.toMatch(/partner_orders/);
    }
  });

  it("(10) nenhum arquivo do Acompanhamento consulta partner_simulations", () => {
    for (const f of files) {
      expect(read(f)).not.toMatch(/partner_simulations/);
    }
  });
});

describe("Fase 10.1 — Correções e ações", () => {
  const producao = read("src/pages/portal/PortalProducao.tsx");
  const ordens = read("src/pages/portal/PortalOrdensServico.tsx");
  const entregas = read("src/pages/portal/PortalEntregas.tsx");

  it("(11) PortalProducao busca ordens_servico_onfarm separadamente", () => {
    expect(producao).toMatch(/from\(["']ordens_servico["']\)/);
    expect(producao).toMatch(/from\(["']ordens_servico_onfarm["']\)/);
    // Duas listas independentes: manualIds e onfarmIds usados em cláusulas distintas.
    expect(producao).toMatch(/manualIds/);
    expect(producao).toMatch(/onfarmIds/);
  });

  it("(12) PortalEntregas possui renderização mobile em cards", () => {
    expect(entregas).toMatch(/useIsMobile/);
    expect(entregas).toMatch(/data-testid="entrega-card"/);
  });

  it("(13) PortalOrdensServico expõe ação Ver produção", () => {
    expect(ordens).toMatch(/Ver produção/);
    expect(ordens).toMatch(/tab=producao/);
  });

  it("(14) PortalProducao expõe ação Ver ordem de serviço", () => {
    expect(producao).toMatch(/Ver ordem de serviço/);
    expect(producao).toMatch(/tab=ordens-servico/);
  });
});

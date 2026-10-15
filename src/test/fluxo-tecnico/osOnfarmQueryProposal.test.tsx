import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const seenSelects: string[] = [];
let failOnfarm = false;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const builder: any = {
        select: (columns: string) => {
          seenSelects.push(`${table}:${columns}`);
          return builder;
        },
        eq: () => builder,
        order: async () => table === "ordens_servico_onfarm" && failOnfarm
          ? { data: null, error: { message: "column origem does not exist" } }
          : { data: [], error: null },
      };
      return builder;
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "administrador", roles: ["administrador"] }) }));
vi.mock("@/components/visita/OSFlowTimeline", () => ({ OSFlowTimeline: () => null }));
vi.mock("@/components/visita/VisitaStatusBanner", () => ({ TechnicalDecisionActions: () => null }));
vi.mock("@/components/shared/RecomendacaoChat", () => ({ RecomendacaoChat: () => null }));

import FluxoTecnico from "@/pages/FluxoTecnico";

afterEach(() => {
  cleanup();
  seenSelects.length = 0;
  failOnfarm = false;
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><FluxoTecnico /></QueryClientProvider>);
  return client;
}

it("consulta OS on-farm sem coluna origem e mantém o vínculo explícito da visita", async () => {
  mount();
  await waitFor(() => expect(seenSelects.some(value => value.startsWith("ordens_servico_onfarm:"))).toBe(true));
  const select = seenSelects.find(value => value.startsWith("ordens_servico_onfarm:")) ?? "";
  expect(select).toContain("registro_consultor_id");
  expect(select).not.toMatch(/(^|[,:\s])origem([,\s]|$)/);
});

it("falha da consulta não vira KPI zero nem estado vazio", async () => {
  failOnfarm = true;
  mount();
  await waitFor(() => expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3));
  const tab = screen.getByRole("tab", { name: "OS de Produção" });
  await userEvent.click(tab);
  expect(await screen.findByText("Não foi possível carregar as ordens de serviço.")).toBeInTheDocument();
  expect(screen.queryByText("Nenhuma OS encontrada.")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeEnabled();
});
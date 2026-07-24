/**
 * Fase SINIEF 3.1 — Testes de renderização do painel.
 *
 * Cobrem:
 * - Visibilidade por papel (administrador/financeiro vê; gestor/técnico não).
 * - Rótulo pt-BR da vigência (03/08/2026).
 * - Ausência de exposição de sourceId cru na UI.
 * - Seleção de produto real via ProdutoPicker (nome, sem UUID).
 * - Seleção de microrganismo real via MicrorganismoPicker (nome, sem UUID).
 * - Prévia bloqueada quando o perfil próprio do item selecionado está ausente.
 * - canTransmit permanece false após seleção.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AppRole } from "@/lib/permissions";
type UserRole = AppRole;

// ── Mocks de hooks externos ───────────────────────────────────────────────
let currentRole: UserRole | null = "administrador";
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ role: currentRole }),
}));

const produtoLite = { id: "p-uuid-1", nome: "Produto Alpha", codigo: "PA-001" };
const microLite = {
  id: "m-uuid-1",
  nome: "Bacillus subtilis Lote X",
  codigo: "MX-1",
  nome_cientifico: "Bacillus subtilis",
};

vi.mock("@/hooks/useFiscalProdutosLite", () => ({
  useFiscalProdutosLite: (term: string) => ({
    data: term.length >= 2 ? [produtoLite] : [],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useFiscalMicrorganismosLite", () => ({
  useFiscalMicrorganismosLite: (term: string) => ({
    data: term.length >= 2 ? [microLite] : [],
    isLoading: false,
    isError: false,
  }),
}));

// Nenhum perfil próprio configurado → deve bloquear prévia.
vi.mock("@/hooks/useProductFiscalProfiles", () => ({
  useProductFiscalListByIds: (ids: string[]) => ({
    data: ids.map((id) => ({ product_id: id, profile_id: null, profile_status: null })),
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useMicroorganismFiscalProfiles", () => ({
  useMicroorganismFiscalProfileList: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: <T,>(v: T) => v,
}));

import SinefOperationsPanel from "@/components/fiscal/documentos/sinief49/SinefOperationsPanel";
import { buildAdvancePaymentDraft } from "@/lib/fiscal/sinief49/builders";

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SinefOperationsPanel issuerCnpj="12345678000199" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentRole = "administrador";
});

describe("SinefOperationsPanel · visibilidade por papel", () => {
  it("administrador vê o painel", () => {
    currentRole = "administrador";
    renderPanel();
    expect(
      screen.getByText(/Operações especiais — Ajuste SINIEF 49\/2025/i),
    ).toBeInTheDocument();
  });

  it("financeiro vê o painel", () => {
    currentRole = "financeiro";
    renderPanel();
    expect(
      screen.getByText(/Operações especiais — Ajuste SINIEF 49\/2025/i),
    ).toBeInTheDocument();
  });

  it.each(["gestor", "tecnico_agronomo", "consultor"] as UserRole[])(
    "papel %s não vê o painel",
    (role) => {
      currentRole = role;
      const { container } = renderPanel();
      expect(container.textContent ?? "").not.toMatch(/Operações especiais/i);
    },
  );
});

describe("SinefOperationsPanel · pt-BR e ausência de sourceId cru", () => {
  it("exibe vigência em 03/08/2026", () => {
    renderPanel();
    expect(screen.getAllByText(/03\/08\/2026/).length).toBeGreaterThan(0);
  });

  it("não exibe o rótulo cru de UUID/sourceId do técnico", () => {
    renderPanel();
    expect(screen.queryByText(/^Id do produto$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Id do microrganismo$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sourceId/i)).not.toBeInTheDocument();
  });
});

describe("SinefOperationsPanel · pickers com catálogo real", () => {
  it("seleção de produto exibe o nome, nunca o UUID", async () => {
    renderPanel();
    const input = screen.getByPlaceholderText(/Buscar produto/i);
    fireEvent.change(input, { target: { value: "Alp" } });
    const opt = await screen.findByText("Produto Alpha");
    fireEvent.click(opt);
    const selected = screen.getByTestId("sinief49-produto-selecionado");
    expect(selected).toHaveTextContent("Produto Alpha");
    // UUID nunca deve aparecer visível
    expect(selected.textContent ?? "").not.toContain(produtoLite.id);
  });

  it("microrganismo faturável direto: seleção por nome, sem product_id", async () => {
    renderPanel();
    // Alterna a origem do item para MICROORGANISM
    const kindSelect = screen.getAllByRole("combobox").find((el) =>
      /Produto|Microrganismo/i.test(el.textContent ?? ""),
    );
    expect(kindSelect).toBeTruthy();
    // Muda para microrganismo via clique no combobox nativo do shadcn:
    fireEvent.click(kindSelect!);
    const microOption = await screen.findByRole("option", { name: /Microrganismo/i });
    fireEvent.click(microOption);

    const input = await screen.findByPlaceholderText(/Buscar microrganismo/i);
    fireEvent.change(input, { target: { value: "Bac" } });
    const opt = await screen.findByText(/Bacillus subtilis Lote X/i);
    fireEvent.click(opt);
    const selected = screen.getByTestId("sinief49-microrganismo-selecionado");
    expect(selected).toHaveTextContent(/Bacillus subtilis Lote X/i);
    expect(selected.textContent ?? "").not.toContain(microLite.id);
  });
});

describe("SinefOperationsPanel · perfil próprio bloqueia prévia", () => {
  it("prévia bloqueada quando produto selecionado não tem perfil fiscal próprio", async () => {
    renderPanel();
    const input = screen.getByPlaceholderText(/Buscar produto/i);
    fireEvent.change(input, { target: { value: "Alp" } });
    const opt = await screen.findByText("Produto Alpha");
    fireEvent.click(opt);
    // Status por item deve marcar ausência
    await waitFor(() =>
      expect(screen.getAllByTestId("sinief49-perfil-status-missing").length).toBeGreaterThan(0),
    );
  });
});

describe("SinefOperationsPanel · segurança de transmissão", () => {
  it("qualquer rascunho canônico tem canTransmit=false", () => {
    const r = buildAdvancePaymentDraft({
      operationType: "ADVANCE_PAYMENT",
      issuerCnpj: "12345678000199",
      taxSetupApproval: { approved: true },
      recipient: { kind: "EXTERNAL", cnpj: "98765432000188" },
      orderId: "PED-1",
      expectedDeliveryDate: "2026-09-01",
      items: [
        {
          sequence: 1,
          sourceKind: "PRODUCT",
          sourceId: "p1",
          description: "Semente",
          quantity: 1,
          unitValue: 10,
          cfop: "5922",
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.draft?.canTransmit).toBe(false);
  });
});

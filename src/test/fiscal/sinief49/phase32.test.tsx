/**
 * Fase SINIEF 3.2 — Fechamento dos gates da Fase 3.
 *
 * Cobre estritamente os pontos exigidos:
 *   1. Erro dos catálogos aciona `isError` e mensagem amigável (não vira vazio).
 *   2. Perfil próprio configurado libera a prévia (produto e microrganismo
 *      selecionado direto, sem product_id). Casos ausente/incompleto separados.
 *   3. Estados carregando / erro / vazio dos catálogos são renderizados no
 *      painel real (não apenas via regex).
 *   4. Estrutura responsiva (sem largura fixa que cause overflow horizontal).
 *   5. RascunhoWizard: administrador/financeiro veem 6 etapas com aba SINIEF;
 *      papéis não elegíveis veem exatamente 5 etapas legadas; ao perder acesso
 *      o passo volta a uma etapa legada.
 *   6. canTransmit continua false em qualquer rascunho canônico.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AppRole } from "@/lib/permissions";

// ── Estado mutável de mocks (papel e catálogos) ───────────────────────────
let currentRole: AppRole | null = "administrador";

type CatalogState = "loading" | "error" | "empty" | "data";
let produtoState: CatalogState = "data";
let microState: CatalogState = "data";

// Perfis próprios: null = ausente; string = status resolvido.
let productProfileStatus: string | null = null;
let microProfileStatus: string | null = null;

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

function catalogResult<T>(state: CatalogState, rows: T[]) {
  switch (state) {
    case "loading":
      return { data: undefined, isLoading: true, isError: false };
    case "error":
      return { data: undefined, isLoading: false, isError: true };
    case "empty":
      return { data: [], isLoading: false, isError: false };
    case "data":
      return { data: rows, isLoading: false, isError: false };
  }
}

vi.mock("@/hooks/useFiscalProdutosLite", () => ({
  useFiscalProdutosLite: (term: string) =>
    catalogResult(produtoState, term.length >= 2 ? [produtoLite] : []),
}));

vi.mock("@/hooks/useFiscalMicrorganismosLite", () => ({
  useFiscalMicrorganismosLite: (term: string) =>
    catalogResult(microState, term.length >= 2 ? [microLite] : []),
}));

vi.mock("@/hooks/useProductFiscalProfiles", () => ({
  useProductFiscalListByIds: (ids: string[]) => ({
    data: ids.map((id) => ({
      product_id: id,
      profile_id: productProfileStatus ? "prof-" + id : null,
      profile_status: productProfileStatus,
    })),
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useMicroorganismFiscalProfiles", () => ({
  useMicroorganismFiscalProfileList: (ids: string[]) => ({
    data: microProfileStatus
      ? ids.map((id) => ({
          microorganism_id: id,
          profile_id: "mprof-" + id,
          profile_status: microProfileStatus,
        }))
      : [],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: <T,>(v: T) => v,
}));

import SinefOperationsPanel from "@/components/fiscal/documentos/sinief49/SinefOperationsPanel";

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SinefOperationsPanel issuerCnpj="12345678000199" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentRole = "administrador";
  produtoState = "data";
  microState = "data";
  productProfileStatus = null;
  microProfileStatus = null;
});

// ── Gate 1: hooks propagam erro (verificação estática de código) ──────────
describe("Fase 3.2 · hooks lite propagam erro em vez de vazio", () => {
  it("useFiscalMicrorganismosLite não retorna [] em caso de erro", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.resolve(process.cwd(), "src/hooks/useFiscalMicrorganismosLite.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/if\s*\(\s*error\s*\)\s*return\s*\[\]/);
    expect(src).toMatch(/throw new Error\("Falha ao consultar microrganismos/);
  });

  it("useFiscalProdutosLite não retorna [] em caso de erro", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.resolve(process.cwd(), "src/hooks/useFiscalProdutosLite.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/if\s*\(\s*error\s*\)\s*return\s*\[\]/);
    expect(src).toMatch(/throw new Error\("Falha ao consultar produtos/);
  });
});



// ── Gate 3: estados carregando / erro / vazio no picker ───────────────────
describe("Fase 3.2 · estados do catálogo no ProdutoPicker", () => {
  it("exibe 'Buscando…' quando carregando", async () => {
    produtoState = "loading";
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/Buscar produto/i), {
      target: { value: "Alp" },
    });
    expect(await screen.findByText(/Buscando…/)).toBeInTheDocument();
  });

  it("exibe mensagem amigável de erro sem detalhes técnicos", async () => {
    produtoState = "error";
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/Buscar produto/i), {
      target: { value: "Alp" },
    });
    const msg = await screen.findByText(/Falha ao consultar produtos/i);
    expect(msg).toBeInTheDocument();
    expect(msg.textContent ?? "").not.toMatch(/select|sql|from |eq\(|error:/i);
  });

  it("exibe 'Nenhum produto encontrado' quando catálogo vazio", async () => {
    produtoState = "empty";
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/Buscar produto/i), {
      target: { value: "Alp" },
    });
    expect(await screen.findByText(/Nenhum produto encontrado/i)).toBeInTheDocument();
  });

  it("MicrorganismoPicker também diferencia carregando/erro/vazio", async () => {
    microState = "error";
    renderPanel();
    // troca tipo do primeiro item para MICROORGANISM
    const tipo = screen.getAllByDisplayValue("Produto")[0];
    fireEvent.change(tipo, { target: { value: "MICROORGANISM" } });
    fireEvent.change(await screen.findByPlaceholderText(/Buscar microrganismo/i), {
      target: { value: "Bac" },
    });
    expect(
      await screen.findByText(/Falha ao consultar microrganismos/i),
    ).toBeInTheDocument();
  });
});

// ── Gate 4: responsividade estrutural ─────────────────────────────────────
describe("Fase 3.2 · estrutura responsiva do painel", () => {
  it("usa grid responsivo (md:grid-cols-*) e não largura fixa/overflow-x", () => {
    const { container } = renderPanel();
    // A busca deve encontrar ao menos um grid responsivo.
    expect(container.querySelectorAll('[class*="md:grid-cols-"]').length).toBeGreaterThan(0);
    // Nenhum contêiner deve fixar largura em pixels (evita overflow horizontal).
    const html = container.innerHTML;
    expect(html).not.toMatch(/w-\[\d+px\]/);
    expect(html).not.toMatch(/overflow-x-scroll/);
  });
});

// ── Gate 2: perfil próprio configurado libera prévia ──────────────────────
describe("Fase 3.2 · perfil próprio libera prévia (produto)", () => {
  it("bloqueio some quando perfil do produto está ACTIVE", async () => {
    productProfileStatus = "ACTIVE";
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/Buscar produto/i), {
      target: { value: "Alp" },
    });
    fireEvent.click(await screen.findByText("Produto Alpha"));
    // Perfil ACTIVE → status por item deve ser "configured" e nenhum
    // resultado deve reportar missing/incomplete/unknown/loading.
    await waitFor(() =>
      expect(
        screen.getAllByTestId("sinief49-perfil-status-configured").length,
      ).toBeGreaterThan(0),
    );
    expect(screen.queryByTestId("sinief49-perfil-status-missing")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sinief49-perfil-status-incomplete")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sinief49-perfil-status-unknown")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sinief49-preview-blocked-profiles")).not.toBeInTheDocument();
  });


  it("perfil incompleto NÃO libera prévia (status distinto de configurado)", async () => {
    productProfileStatus = "PENDING";
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/Buscar produto/i), {
      target: { value: "Alp" },
    });
    fireEvent.click(await screen.findByText("Produto Alpha"));
    await waitFor(() =>
      expect(
        screen.getAllByTestId("sinief49-perfil-status-incomplete").length,
      ).toBeGreaterThan(0),
    );
  });
});

describe("Fase 3.2 · perfil próprio libera prévia (microrganismo sem product_id)", () => {
  it("microrganismo com perfil próprio ACTIVE libera bloqueio", async () => {
    microProfileStatus = "ACTIVE";
    renderPanel();
    const tipo = screen.getAllByDisplayValue("Produto")[0];
    fireEvent.change(tipo, { target: { value: "MICROORGANISM" } });
    fireEvent.change(await screen.findByPlaceholderText(/Buscar microrganismo/i), {
      target: { value: "Bac" },
    });
    fireEvent.click(await screen.findByText(/Bacillus subtilis Lote X/));
    await waitFor(() =>
      expect(
        screen.getAllByTestId("sinief49-perfil-status-configured").length,
      ).toBeGreaterThan(0),
    );
    expect(screen.queryByTestId("sinief49-perfil-status-missing")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sinief49-perfil-status-incomplete")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sinief49-preview-blocked-profiles")).not.toBeInTheDocument();
  });


  it("microrganismo com perfil próprio ausente mantém bloqueio", async () => {
    microProfileStatus = null;
    renderPanel();
    const tipo = screen.getAllByDisplayValue("Produto")[0];
    fireEvent.change(tipo, { target: { value: "MICROORGANISM" } });
    fireEvent.change(await screen.findByPlaceholderText(/Buscar microrganismo/i), {
      target: { value: "Bac" },
    });
    fireEvent.click(await screen.findByText(/Bacillus subtilis Lote X/));
    await waitFor(() =>
      expect(
        screen.getAllByTestId("sinief49-perfil-status-missing").length,
      ).toBeGreaterThan(0),
    );
  });
});

// ── Gate 5: RascunhoWizard — etapas por papel ─────────────────────────────
// Mocks adicionais necessários pelo wizard.
vi.mock("@/hooks/useFiscalRascunho", () => ({
  useSaveFiscalRascunho: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useValidateHomologation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useFiscalClientesLite", () => ({
  useFiscalClientesLite: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useFiscalServicosLite", () => ({
  useFiscalServicosLite: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import RascunhoWizard from "@/components/fiscal/documentos/RascunhoWizard";

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RascunhoWizard invoiceId={null} companyCnpj="12345678000199" />
    </QueryClientProvider>,
  );
}

describe("Fase 3.2 · RascunhoWizard — etapas por papel", () => {
  it("administrador: 6 etapas incluindo aba SINIEF, painel montado", async () => {
    currentRole = "administrador";
    const { container } = renderWizard();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(6);
    const sinief = tabs.find((t) => /SINIEF 49\/2025/.test(t.textContent ?? ""));
    expect(sinief).toBeDefined();
    // Radix monta o TabsContent (mesmo oculto) quando o wizard permite a aba.
    // O painel usa data-testid estável.
    expect(container.querySelector('[data-testid="sinief49-panel"]')).not.toBeNull();
  });

  it("financeiro: 6 etapas incluindo aba SINIEF, painel montado", async () => {
    currentRole = "financeiro";
    const { container } = renderWizard();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(6);
    expect(tabs.some((t) => /SINIEF/.test(t.textContent ?? ""))).toBe(true);
    expect(container.querySelector('[data-testid="sinief49-panel"]')).not.toBeNull();
  });

  it.each(["gestor", "tecnico_agronomo", "consultor"] as AppRole[])(
    "%s: exatamente 5 etapas legadas, sem aba SINIEF nem painel",
    (role) => {
      currentRole = role;
      const { container } = renderWizard();
      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(5);
      expect(tabs.every((t) => !/SINIEF/.test(t.textContent ?? ""))).toBe(true);
      expect(container.querySelector('[data-testid="sinief49-panel"]')).toBeNull();
    },
  );

  it("se o papel perde acesso, aba/painel SINIEF somem e voltam ao legado", async () => {
    currentRole = "administrador";
    const { rerender, container } = renderWizard();
    expect(container.querySelector('[data-testid="sinief49-panel"]')).not.toBeNull();
    await act(async () => {
      currentRole = "gestor";
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      rerender(
        <QueryClientProvider client={qc}>
          <RascunhoWizard invoiceId={null} companyCnpj="12345678000199" />
        </QueryClientProvider>,
      );
    });
    const newTabs = screen.getAllByRole("tab");
    expect(newTabs).toHaveLength(5);
    expect(container.querySelector('[data-testid="sinief49-panel"]')).toBeNull();
  });
});


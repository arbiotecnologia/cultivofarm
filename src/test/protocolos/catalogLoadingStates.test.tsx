import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";

const q: any = { current: {} };
vi.mock("@/hooks/useCatalogSources", () => ({
  useCatalogSources: () => q.current,
  useDeleteCatalogSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
  CONFIDENCE_LABEL: {}, SOURCE_TYPE_LABEL: {},
}));
vi.mock("@/components/protocolos/catalog/SourceFormDialog", () => ({ SourceFormDialog: () => null }));

import { SourcesManager } from "@/components/protocolos/catalog/SourcesManager";
import { TechnicalProfileStatusBadge } from "@/components/protocolos/TechnicalProfileStatusBadge";

const base = { data: undefined, isError: false, isFetching: false, refetch: vi.fn() };
describe("SourcesManager estados", () => {
  beforeEach(() => { q.current = { ...base, refetch: vi.fn() }; });
  it("carregando não mostra 0 fontes", () => {
    q.current.isFetching = true;
    render(<SourcesManager entidadeTipo="produto" entidadeId="p1" />);
    expect(screen.getAllByText("Carregando fontes…").length).toBeGreaterThan(0);
    expect(screen.queryByText(/0 fontes/)).toBeNull();
  });
  it("erro não vira vazio e permite tentar novamente", () => {
    q.current.isError = true;
    render(<SourcesManager entidadeTipo="produto" entidadeId="p1" />);
    expect(screen.getByRole("alert").textContent).toMatch(/não significa ausência/);
    expect(screen.queryByText(/Nenhuma fonte/)).toBeNull();
    expect(screen.queryByText(/0 fontes/)).toBeNull();
    fireEvent.click(screen.getByText("Tentar novamente"));
    expect(q.current.refetch).toHaveBeenCalled();
  });
  it("vazio só após leitura válida", () => {
    q.current.data = [];
    render(<SourcesManager entidadeTipo="produto" entidadeId="p1" />);
    expect(screen.getByText(/0 fontes cadastradas/)).toBeTruthy();
    expect(screen.getByText(/Nenhuma fonte/)).toBeTruthy();
  });
  it("erro de revalidação preserva fontes em cache", () => {
    q.current.data = [{ id: "s1", fonte_titulo: "Bula oficial", tipo_fonte: "bula", confiabilidade: "alta" }];
    q.current.isError = true;
    render(<SourcesManager entidadeTipo="produto" entidadeId="p1" />);
    expect(screen.getByText(/1 fonte cadastrada/)).toBeTruthy();
    expect(screen.getByText("Bula oficial")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("Badge de status real na revisão", () => {
  it("rascunho vs em_revisao", () => {
    const { rerender } = render(<TechnicalProfileStatusBadge status="rascunho" />);
    expect(screen.getByText("Rascunho")).toBeTruthy();
    rerender(<TechnicalProfileStatusBadge status="em_revisao" />);
    expect(screen.getByText("Em revisão")).toBeTruthy();
  });
  it("painel usa status real e diálogos não mostram Sem ficha ao carregar", () => {
    const panel = readFileSync("src/components/protocolos/RevisaoTecnicaPanel.tsx", "utf8");
    expect(panel).toContain("<TechnicalProfileStatusBadge status={i.status} />");
    expect(panel).not.toMatch(/>em revisão<\/Badge>/);
    for (const f of ["MicroorganismTechnicalProfileDialog", "ProductTechnicalProfileDialog"]) {
      const src = readFileSync(`src/components/protocolos/${f}.tsx`, "utf8");
      expect(src).toContain("Carregando ficha…");
      expect(src).toContain("Falha ao carregar");
    }
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useCatalogSources", () => ({
  SOURCE_TYPE_LABEL: { embrapa: "Embrapa", outro: "Outro" },
  CONFIDENCE_LABEL: { alto: "Alto", medio: "Médio", baixo: "Baixo" },
}));
vi.mock("@/hooks/useScopedPortalQuery", () => ({
  useScopedPortalQuery: ({ queryKey }: any) => ({
    data:
      queryKey[0] === "micro-ficha-options"
        ? [{ id: "culture-id", nome: "Soja" }]
        : [],
    isSuccess: true,
  }),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => (
    <option value={value}>{children}</option>
  ),
}));
import { MicroFichaRelations } from "@/components/protocolos/MicroFichaRelations";
it("seleção cultura preserva nome canônico e pending até Aplicar", () => {
  const onStage = vi.fn(),
    onPending = vi.fn();
  render(
    <MicroFichaRelations
      id="micro"
      kind="crop"
      editable
      busy={false}
      staged={[]}
      onStage={onStage}
      onPending={onPending}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Adicionar cultura" }));
  expect(onPending).toHaveBeenLastCalledWith("crop", true);
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "culture-id" },
  });
  expect(onStage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Aplicar ao rascunho" }));
  expect(onStage).toHaveBeenCalledWith(
    expect.objectContaining({
      fields: expect.objectContaining({
        cultura_id: "culture-id",
        cultura_nome: "Soja",
      }),
    }),
  );
  expect(onPending).toHaveBeenLastCalledWith("crop", false);
});
it("cancelar pending não grava relação", () => {
  const onStage = vi.fn(),
    onPending = vi.fn();
  render(
    <MicroFichaRelations
      id="micro"
      kind="source"
      editable
      busy={false}
      staged={[]}
      onStage={onStage}
      onPending={onPending}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Adicionar fonte documental" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancelar alteração" }));
  expect(onStage).not.toHaveBeenCalled();
  expect(onPending).toHaveBeenLastCalledWith("source", false);
});

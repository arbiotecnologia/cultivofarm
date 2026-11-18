import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useScopedPortalQuery", () => ({
  useScopedPortalQuery: ({ queryKey }: any) => ({
    data:
      queryKey[0] === "product-ficha-options"
        ? [{ id: "c1", nome: "Soja" }]
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
import { ProductFichaRelations } from "@/components/protocolos/ProductFichaRelations";
import {
  parseProductRelationRow,
  stageProductRelation,
} from "@/lib/catalogo/productRelations";
it("cultura preserva ID/nome canônico e exige aplicar ou cancelar", () => {
  const onStage = vi.fn(),
    onPending = vi.fn();
  render(
    <ProductFichaRelations
      id="p1"
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
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "c1" } });
  expect(onStage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Aplicar ao rascunho" }));
  expect(onStage).toHaveBeenCalledWith(
    expect.objectContaining({
      fields: expect.objectContaining({
        cultura_id: "c1",
        cultura_nome: "Soja",
      }),
    }),
  );
  expect(onPending).toHaveBeenLastCalledWith("crop", false);
});
it("cancelar fonte pendente não grava nem aplica", () => {
  const onStage = vi.fn(),
    onPending = vi.fn();
  render(
    <ProductFichaRelations
      id="p1"
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
  fireEvent.change(screen.getByLabelText("Título"), {
    target: { value: "Fonte manual" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar alteração" }));
  expect(onStage).not.toHaveBeenCalled();
  expect(onPending).toHaveBeenLastCalledWith("source", false);
});
it("não inventa updated_at para recomendação e recusa schema incompleto", () => {
  const row = {
    id: "t1",
    produto_id: "p1",
    created_at: "2026-11-18T04:00:00Z",
    catalogo_alvo_id: null,
    alvo_nome: "Alvo",
    alvo_tipo: "praga",
    descricao: null,
    prioridade: 1,
    ativo: true,
  };
  expect(parseProductRelationRow(row, "target", "p1")).not.toHaveProperty(
    "updated_at",
  );
  expect(() =>
    parseProductRelationRow({ ...row, prioridade: 11 }, "target", "p1"),
  ).toThrow();
  expect(() => parseProductRelationRow(row, "target", "p2")).toThrow();
});
it("reedição aplicada substitui só o mesmo vínculo, conserva expectativa CAS", () => {
  const row = { id: "s1", fonte_titulo: "Antes" };
  const initial = {
    kind: "source" as const,
    id: "s1",
    expected: row,
    fields: {
      fonte_titulo: "Fonte",
      fonte_tipo: "embrapa",
      nivel_confianca: "alto",
      fonte_url: "https://example.org",
    },
  };
  const next = stageProductRelation([initial], {
    ...initial,
    fields: { ...initial.fields, fonte_titulo: "Revista" },
  });
  expect(next).toHaveLength(1);
  expect(next[0].expected).toEqual(row);
  expect(next[0].fields.fonte_titulo).toBe("Revista");
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useFormContext } from "react-hook-form";
import { beforeEach, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ scope: "A", reads: 0, resolve: undefined as undefined | ((value: unknown) => void), writes: [] as unknown[], success: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "administrador" }) }));
vi.mock("@/hooks/useCommercialRegistrationScope", () => ({ useCommercialRegistrationScope: () => {
  const scope = s.scope;
  return { ready: true, scope, organizationId: scope, capture: () => () => s.scope === scope };
} }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("sonner", () => ({ toast: { success: s.success, error: s.error } }));
vi.mock("@/components/clientes/ClienteHistoricoDialog", () => ({ ClienteHistoricoDialog: () => null }));
vi.mock("@/components/clientes/ClienteFormTabs", () => ({ ClienteFormTabs: () => {
  const { register } = useFormContext();
  return <input aria-label="Nome fantasia" {...register("nome_fantasia")} />;
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  let writing = false;
  const q: Record<string, unknown> = {};
  for (const name of ["select", "filter", "order", "eq", "not", "in", "single"]) q[name] = () => q;
  q.insert = (value: unknown) => { writing = true; s.writes.push(value); return q; };
  q.then = (resolve: (value: unknown) => void) => {
    if (writing) s.resolve = resolve;
    else { s.reads += 1; resolve({ data: [], error: null }); }
  };
  return q;
} } }));
import ProdutoresTab from "@/pages/clientes/ProdutoresTab";

beforeEach(() => { s.scope = "A"; s.reads = 0; s.resolve = undefined; s.writes = []; s.success.mockClear(); s.error.mockClear(); });
async function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Novo Produtor" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nome fantasia" }), { target: { value: "TEMPORARY_AUDIT" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produtor" }));
  await waitFor(() => expect(s.writes).toHaveLength(1));
}
it("produtor próprio cria com UUID, sem atribuir empresa pelo formulário", async () => {
  render(<MemoryRouter><ProdutoresTab /></MemoryRouter>);
  await submit();
  expect(s.writes[0]).toEqual([expect.objectContaining({ id: expect.any(String), nome: "TEMPORARY_AUDIT", cpf_cnpj: null })]);
  expect(s.writes[0]).toEqual([expect.not.objectContaining({ organization_id: expect.anything() })]);
  expect(s.writes[0]).toEqual([expect.objectContaining({ limite_credito: null, endereco_latitude: null, endereco_longitude: null })]);
  await act(async () => { s.resolve?.({ data: { id: "OWN" }, error: null }); });
  await waitFor(() => expect(s.success).toHaveBeenCalledWith("Cliente cadastrado!"));
});
it("render da mesma sessão mantém rascunho e não repete consultas", async () => {
  const { rerender } = render(<MemoryRouter><ProdutoresTab /></MemoryRouter>);
  await waitFor(() => expect(s.reads).toBe(2));
  fireEvent.click(screen.getByRole("button", { name: "Novo Produtor" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nome fantasia" }), { target: { value: "TEMPORARY_AUDIT" } });
  const reads = s.reads;
  rerender(<MemoryRouter><ProdutoresTab /></MemoryRouter>);
  expect(screen.getByRole("textbox", { name: "Nome fantasia" })).toHaveValue("TEMPORARY_AUDIT");
  expect(s.reads).toBe(reads);
});
for (const error of [null, { code: "23505", message: "PRIVATE_SQL" }]) it(`produtor não mostra resultado antigo após troca: ${error ? "erro" : "sucesso"}`, async () => {
  const { rerender } = render(<MemoryRouter><ProdutoresTab /></MemoryRouter>);
  await submit();
  s.scope = "B";
  rerender(<MemoryRouter><ProdutoresTab /></MemoryRouter>);
  await act(async () => { s.resolve?.({ data: { id: "OLD" }, error }); });
  expect(s.success).not.toHaveBeenCalled();
  expect(s.error).not.toHaveBeenCalled();
});
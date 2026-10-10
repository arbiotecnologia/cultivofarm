import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PlatformCatalogReadTab } from "@/components/plataforma/PlatformCatalogReadTab";
import { PlataformaGuard } from "@/components/guards/PlataformaGuard";
import { platformCatalogAccess, type PlatformCatalogActor } from "@/lib/catalogo/platformCatalogRead";

const mocks = vi.hoisted(() => ({ actor: {} as PlatformCatalogActor,
  request: vi.fn(), rpc: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.actor }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

const product = { id: "00000000-0000-4000-8000-000000000001", codigo: "EXISTENTE",
  nome: "Produto consultado", tipo: "solo", ativo: true, b2b_enabled: false, updated_at: null };
const page = (items = [product], has_more = false) => ({ data: { items, has_more }, error: null });
function actor(id = "actor-a"): PlatformCatalogActor {
  return { user: { id }, session: { user: { id }, expires_at: 9999999999 },
    profile: { id: `profile-${id}`, user_id: id, ativo: true, senha_provisoria: false },
    roles: ["superadmin"], loading: false, error: null };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><PlatformCatalogReadTab /></QueryClientProvider>;
  const view = render(tree());
  return { client, rerender: () => view.rerender(tree()) };
}
beforeEach(() => {
  mocks.actor = actor();
  mocks.request.mockReset().mockResolvedValue(page());
  mocks.rpc.mockReset().mockImplementation((name, args) => ({ abortSignal: (signal: AbortSignal) => mocks.request(name, args, signal) }));
});
afterEach(cleanup);

describe("consulta global da plataforma", () => {
  it("consulta apenas a RPC mínima com limite concreto 50 e offset zero", async () => {
    setup();
    await screen.findByText(product.nome);
    expect(mocks.rpc).toHaveBeenCalledWith("platform_read_global_product_catalog", { p_search: "", p_limit: 50, p_offset: 0 });
  });
  it("preserva tipo antigo e descarta campos extras sem preço no resultado exibido", async () => {
    mocks.request.mockResolvedValue(page([{ ...product, nome: "Produto sem preço" }]));
    setup(); await screen.findByText("Produto sem preço");
    expect(screen.getByText("solo")).toBeTruthy();
  });
  it("distingue vazio de erro", async () => {
    mocks.request.mockResolvedValue(page([])); setup();
    await screen.findByText("Nenhum produto encontrado.");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("erro servidor fica seguro e pode repetir somente a leitura", async () => {
    mocks.request.mockResolvedValueOnce({ data: null, error: { message: "SEGREDO_SERVIDOR" } });
    setup(); await screen.findByRole("alert");
    expect(screen.queryByText("SEGREDO_SERVIDOR")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByText(product.nome);
  });
  it("rejeição e payload inválido não viram vazio", async () => {
    mocks.request.mockRejectedValueOnce(new Error("falha"));
    setup(); await screen.findByRole("alert");
    mocks.request.mockResolvedValue({ data: { items: [{}], has_more: false }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Nenhum produto encontrado.")).toBeNull();
  });
  it("pagina no servidor e busca retorna à primeira página sem filtrar localmente", async () => {
    mocks.request.mockResolvedValue(page([product], true)); setup(); await screen.findByText(product.nome);
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenLastCalledWith("platform_read_global_product_catalog", { p_search: "", p_limit: 50, p_offset: 50 }));
    await screen.findByText(product.nome);
    fireEvent.change(screen.getByLabelText("Buscar por nome ou código"), { target: { value: " %_x " } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenLastCalledWith("platform_read_global_product_catalog", { p_search: "%_x", p_limit: 50, p_offset: 0 }));
  });
  it("mantém loading sem mostrar resultado anterior durante busca", async () => {
    const { rerender } = setup(); await screen.findByText(product.nome);
    mocks.request.mockImplementation(() => new Promise(() => {}));
    fireEvent.change(screen.getByLabelText("Buscar por nome ou código"), { target: { value: "nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await screen.findByText("Carregando…");
    expect(screen.queryByText(product.nome)).toBeNull(); rerender();
  });
  it("troca de identidade oculta dados/cache anteriores e reseta busca/página", async () => {
    const view = setup(); await screen.findByText(product.nome);
    mocks.request.mockImplementation(() => new Promise(() => {}));
    mocks.actor = actor("actor-b"); view.rerender();
    expect(screen.queryByText(product.nome)).toBeNull();
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(view.client.getQueryCache().getAll().some((q) => String(q.queryKey[1]).includes("actor-a"))).toBe(false);
  });
  it("resposta tardia de ator anterior é abortada e não exibida", async () => {
    let resolveOld: ((value: ReturnType<typeof page>) => void) | undefined;
    mocks.request.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const view = setup(); await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    const signal = mocks.request.mock.calls[0][2] as AbortSignal;
    mocks.request.mockResolvedValue(page([{ ...product, nome: "Atual" }]));
    mocks.actor = actor("actor-b"); view.rerender(); await screen.findByText("Atual");
    await act(async () => { resolveOld?.(page()); });
    expect(signal.aborted).toBe(true); expect(screen.queryByText(product.nome)).toBeNull();
  });
  it("perda de perfil/readiness apaga dados e não consulta", async () => {
    const view = setup(); await screen.findByText(product.nome);
    mocks.actor = { ...mocks.actor, profile: { ...actor().profile, id: "inactive", user_id: "actor-a", ativo: false } };
    view.rerender(); expect(screen.queryByText(product.nome)).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy(); expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it.each([
    { user: null }, { session: null }, { roles: ["administrador"] },
    { profile: null }, { error: "erro" }, { loading: true },
    { profile: { id: "p", user_id: "outro", ativo: true, senha_provisoria: false } },
    { profile: { id: "p", user_id: "actor-a", ativo: true, senha_provisoria: true } },
  ])("nega ator incompleto/operacional %j sem RPC", (delta) => {
    mocks.actor = { ...actor(), ...delta };
    expect(platformCatalogAccess(mocks.actor).ready).toBe(false);
    setup(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("guard nega Superadmin inativo mesmo com papel persistente", async () => {
    mocks.actor.profile = { id: "p", user_id: "actor-a", ativo: false, senha_provisoria: false };
    render(<MemoryRouter initialEntries={["/plataforma"]}><Routes>
      <Route element={<PlataformaGuard />}><Route path="/plataforma" element={<p>Área restrita</p>} /></Route>
      <Route path="/sem-permissao" element={<p>Acesso negado</p>} />
    </Routes></MemoryRouter>);
    await screen.findByText("Acesso negado"); expect(screen.queryByText("Área restrita")).toBeNull();
  });
});
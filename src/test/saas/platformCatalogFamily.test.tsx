import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PlatformCatalogReadTab } from "@/components/plataforma/PlatformCatalogReadTab";
import { platformCatalogPageSchema, type PlatformCatalogActor } from "@/lib/catalogo/platformCatalogRead";
import { CATALOG_TABS, FAMILY_CLASSES, isClassAllowed, parseCatalogView, parseReview, setProductFamily } from "@/lib/catalogo/platformCatalogFamily";

const mocks = vi.hoisted(() => ({ actor: {} as PlatformCatalogActor, request: vi.fn(), rpc: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.actor }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: vi.fn() } }));

const ID = "00000000-0000-4000-8000-000000000001";
const V1 = "2026-10-14T21:00:00.000000+00:00";
const legacy = { id: ID, codigo: "P1", nome: "Bombarbio", tipo: "fungicida", ativo: true, b2b_enabled: true, updated_at: V1,
  familia_catalogo: null, classe_catalogo: null };
const page = (items: unknown[] = [legacy]) => ({ data: { items, has_more: false }, error: null });
const actor = (id = "sa-a"): PlatformCatalogActor => ({ user: { id }, session: { user: { id }, expires_at: 9999999999 },
  profile: { id: `p-${id}`, user_id: id, ativo: true, senha_provisoria: false }, roles: ["superadmin"], loading: false, error: null });
let lastSearch = "";
function Loc() { lastSearch = useLocation().search; return null; }
function setup(entry = "/plataforma") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <MemoryRouter initialEntries={[entry]}><QueryClientProvider client={client}><PlatformCatalogReadTab /><Loc /></QueryClientProvider></MemoryRouter>;
  const view = render(tree());
  return { rerender: () => view.rerender(tree()) };
}
const readCalls = () => mocks.rpc.mock.calls.filter(([n]) => n === "platform_read_global_product_catalog_by_family").map(([, a]) => a);
beforeEach(() => {
  mocks.actor = actor();
  mocks.request.mockReset().mockImplementation((name: string) => name === "platform_read_global_product_catalog_by_family" ? Promise.resolve(page()) : new Promise(() => {}));
  mocks.rpc.mockReset().mockImplementation((name, args) => ({ abortSignal: (s: AbortSignal) => mocks.request(name, args, s) }));
});
afterEach(cleanup);

describe("abas globais por família", () => {
  it("quatro abas na ordem exata e Culturas fora delas", async () => {
    setup(); await screen.findByText("Bombarbio");
    const tabs = within(screen.getByRole("tablist", { name: "Catálogo global" })).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Produtos Químicos", "Produtos Biológicos", "Microrganismos", "Fertilizantes/Adubos"]);
    expect(within(screen.getByRole("navigation", { name: "Cadastros de apoio" })).getByRole("button", { name: "Culturas" })).toBeTruthy();
    expect(CATALOG_TABS.map((t) => t.value)).toEqual(["quimicos", "biologicos", "microrganismos", "fertilizantes"]);
  });
  it("query param seleciona aba e filtro de revisão; servidor recebe família/revisão", async () => {
    setup("/plataforma?aba=x&catalogo=biologicos&revisao=pendentes"); await screen.findByText("Bombarbio");
    expect(readCalls().at(-1)).toEqual({ p_familia: "biologico", p_revisao: "pendentes", p_search: "", p_limit: 50, p_offset: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Todos (família + pendentes)" }));
    await waitFor(() => expect(readCalls().at(-1)).toMatchObject({ p_familia: "biologico", p_revisao: "todos" }));
    expect(lastSearch).toContain("aba=x"); expect(lastSearch).not.toContain("revisao");
  });
  it("legado sem família aparece como Pendente (não inferido de tipo/nome)", async () => {
    setup("/plataforma?catalogo=fertilizantes"); await screen.findByText("Bombarbio");
    expect(screen.getByText("Pendente")).toBeTruthy();
    expect(screen.queryByText("Produtos Biológicos · Biofungicida")).toBeNull();
    expect(readCalls().at(-1)).toMatchObject({ p_familia: "fertilizante_adubo", p_revisao: "todos" });
    expect(screen.getByRole("note").textContent).toMatch(/ainda não está disponível/);
    expect(screen.queryByRole("button", { name: "Novo produto global" })).toBeNull();
  });
  it("criação legada continua disponível em químicos/biológicos", async () => {
    setup(); await screen.findByText("Bombarbio");
    expect(screen.getByRole("button", { name: "Novo produto global" })).toBeTruthy();
  });
  it("valores inválidos do query param caem no padrão seguro", () => {
    expect(parseCatalogView("sementes")).toBe("quimicos"); expect(parseCatalogView("culturas")).toBe("culturas");
    expect(parseReview("x")).toBe("todos");
  });
  it("troca de identidade descarta lista e relê no novo escopo", async () => {
    const view = setup(); await screen.findByText("Bombarbio");
    mocks.request.mockImplementation(() => new Promise(() => {}));
    mocks.actor = actor("sa-b"); view.rerender();
    expect(screen.queryByText("Bombarbio")).toBeNull();
    await waitFor(() => expect(readCalls().length).toBe(2));
  });
});

describe("contrato de família", () => {
  it("biológico e químico nunca se misturam", () => {
    expect(FAMILY_CLASSES.biologico).toEqual(["biofungicida", "bioinseticida", "inoculante", "solubilizador"]);
    expect(FAMILY_CLASSES.quimico).toEqual(["fungicida", "inseticida", "herbicida"]);
    expect(isClassAllowed("quimico", "biofungicida")).toBe(false);
    expect(isClassAllowed("biologico", "herbicida")).toBe(false);
    expect(isClassAllowed("fertilizante_adubo", "fungicida")).toBe(false);
    expect(isClassAllowed("biologico", "biofungicida")).toBe(true);
    expect(platformCatalogPageSchema.safeParse({ items: [{ ...legacy, familia_catalogo: "quimico", classe_catalogo: "biofungicida" }], has_more: false }).success).toBe(false);
    expect(platformCatalogPageSchema.safeParse({ items: [{ ...legacy, familia_catalogo: "semente" }], has_more: false }).success).toBe(false);
  });
  it("classe incoerente e motivo curto não chegam ao servidor", async () => {
    const s = new AbortController().signal; const t = { id: ID, updated_at: V1, familia_catalogo: null, classe_catalogo: null };
    await expect(setProductFamily(t, "quimico", "biofungicida", "Motivo suficiente", ID, s)).rejects.toThrow();
    await expect(setProductFamily(t, "biologico", "biofungicida", "curto", ID, s)).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("envia CAS/motivo/chave e rejeita recibo divergente", async () => {
    const s = new AbortController().signal; const t = { id: ID, updated_at: V1, familia_catalogo: null, classe_catalogo: null };
    const KEY = "00000000-0000-4000-8000-0000000000aa";
    const ok = { id: ID, familia_catalogo: "biologico", classe_catalogo: "biofungicida", updated_at: "2026-10-14T21:40:00.000000+00:00",
      idempotency_key: KEY, audit_id: KEY, idempotent: false };
    mocks.request.mockResolvedValueOnce({ data: ok, error: null });
    await expect(setProductFamily(t, "biologico", "biofungicida", "Confirmado pelo usuário", KEY, s)).resolves.toMatchObject({ familia_catalogo: "biologico" });
    expect(mocks.rpc).toHaveBeenCalledWith("platform_set_global_product_family", { p_id: ID, p_expected_updated_at: V1,
      p_familia: "biologico", p_classe: "biofungicida", p_reason: "Confirmado pelo usuário", p_idempotency_key: KEY });
    for (const bad of [{ ...ok, familia_catalogo: "quimico" }, { ...ok, updated_at: V1 }, { ...ok, classe_catalogo: null }, { ...ok, idempotency_key: ID }]) {
      mocks.request.mockResolvedValueOnce({ data: bad, error: null });
      await expect(setProductFamily(t, "biologico", "biofungicida", "Confirmado pelo usuário", KEY, s)).rejects.toThrow(/Não foi possível confirmar/);
    }
    mocks.request.mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    await expect(setProductFamily(t, "biologico", "biofungicida", "Confirmado pelo usuário", KEY, s)).rejects.toThrow(/mudou/);
  });
  it("diálogo exige família, motivo e confirmação; salva e relê lista", async () => {
    setup(); await screen.findByText("Bombarbio");
    fireEvent.click(screen.getByRole("button", { name: "Classificar família de Bombarbio" }));
    const save = await screen.findByRole("button", { name: "Salvar classificação" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Família"), { target: { value: "biologico" } });
    fireEvent.change(screen.getByLabelText("Rótulo (opcional)"), { target: { value: "biofungicida" } });
    fireEvent.change(screen.getByLabelText("Motivo (10 a 500 caracteres)"), { target: { value: "Confirmado pelo usuário" } });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    mocks.request.mockImplementation((name: string, args: { p_idempotency_key?: string }) => name === "platform_set_global_product_family"
      ? Promise.resolve({ data: { id: ID, familia_catalogo: "biologico", classe_catalogo: "biofungicida", updated_at: "2026-10-14T21:40:00.000000+00:00",
          idempotency_key: args.p_idempotency_key, audit_id: ID, idempotent: false }, error: null })
      : Promise.resolve(page()));
    const before = readCalls().length;
    fireEvent.click(save);
    await screen.findByText("Alteração confirmada.");
    expect(screen.queryByRole("button", { name: "Salvar classificação" })).toBeNull();
    await waitFor(() => expect(readCalls().length).toBeGreaterThan(before));
  });
});

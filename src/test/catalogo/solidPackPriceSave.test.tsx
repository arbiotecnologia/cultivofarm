import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const { rpcMock, toastMock, auth } = vi.hoisted(() => ({ rpcMock: vi.fn(), toastMock: { error: vi.fn(), success: vi.fn() }, auth: { value: null as any } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock } }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth.value }));
import { SolidPresentations } from "@/components/protocolos/SolidPresentations";

const U = "11111111-1111-4111-8111-111111111111", ORG = "007bb519-cba0-4704-be2c-cb93ad010048";
const PROD = "22222222-2222-4222-8222-222222222222", PK = "366e6f04-0000-4000-8000-000000000002";
const state = { product_id: PROD, unidade_conteudo: "kg" as const, offers: [{ packaging_id: PK, codigo: "SC25", descricao: "Saco 25 kg", peso_liquido_kg: 25, version: 1, ativo: true, prices: [] }] };
const mk = () => render(<QueryClientProvider client={new QueryClient()}><SolidPresentations state={state} /></QueryClientProvider>);
const fill = (price: string, date: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Preço" }));
  fireEvent.change(screen.getByLabelText("Preço por embalagem (R$)"), { target: { value: price } });
  fireEvent.change(screen.getByLabelText("Vigência"), { target: { value: date } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar preço" }));
};
beforeEach(() => {
  rpcMock.mockReset(); toastMock.error.mockReset(); toastMock.success.mockReset();
  auth.value = { user: { id: U }, profile: { user_id: U, ativo: true, senha_provisoria: false, organization_id: ORG }, roles: ["administrador"], loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: () => true };
});

describe("Salvar preço da embalagem (fixture TESTE R$ 10,00)", () => {
  it("despacha solid_pack_price_set_v1 com 1000 centavos", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "x" } });
    mk(); fill("10,00", "2026-11-06");
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(rpcMock.mock.calls[0][0]).toBe("solid_pack_price_set_v1");
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_packaging_id: PK, p_preco_centavos: 1000, p_valid_from: "2026-11-06", p_expected_price_id: null });
  });
});
describe("caminhos sem envio", () => {
  it("lease pausada no clique", async () => {
    let ok = true; auth.value.checkAuthzAccess = () => ok;
    mk(); ok = false; fill("10,00", "2026-11-06");
    await new Promise(r => setTimeout(r, 50));
    console.log("LEASE", rpcMock.mock.calls.length, JSON.stringify(toastMock.error.mock.calls));
  });
  it("papéis sem edição", async () => {
    auth.value.roles = ["administrador", "parceiro_b2b"];
    mk(); fill("10,00", "2026-11-06");
    await new Promise(r => setTimeout(r, 50));
    console.log("ROLES", rpcMock.mock.calls.length, JSON.stringify(toastMock.error.mock.calls));
  });
  it("authz not ready", async () => {
    auth.value.authzReady = false;
    mk(); fill("10,00", "2026-11-06");
    await new Promise(r => setTimeout(r, 50));
    console.log("READY", rpcMock.mock.calls.length, JSON.stringify(toastMock.error.mock.calls));
  });
});
import { CatalogoVolumesDialog } from "@/components/protocolos/CatalogoVolumesDialog";
describe("diálogo real", () => {
  it("abre, preenche e salva", async () => {
    const admin = { product_id: PROD, unidade_conteudo: "kg", offers: [{ packaging_id: PK, codigo: "SC25", descricao: "Saco 25 kg", peso_liquido_kg: 25, version: 1, ativo: true, prices: [] }] };
    rpcMock.mockImplementation((name: string) => {
      const v = name === "solid_pack_offers_admin_v1" ? { data: admin, error: null } : { data: null, error: { code: "42501", message: "negado " + name } };
      const p = Promise.resolve(v); return Object.assign(p, { abortSignal: () => p });
    });
    render(<QueryClientProvider client={new QueryClient()}><CatalogoVolumesDialog open onOpenChange={() => {}} itemId={PROD} itemTipo="produto" itemNome="SOLO-5" owned /></QueryClientProvider>);
    await screen.findByRole("button", { name: "Preço" });
    console.log("PRICEBTN disabled", (screen.getByRole("button", { name: "Preço" }) as HTMLButtonElement).disabled);
    fill("10,00", "2026-11-06");
    await new Promise(r => setTimeout(r, 100));
    console.log("SAVEBTN disabled", (screen.getByRole("button", { name: "Salvar preço" }) as HTMLButtonElement).disabled);
    console.log("DLG", JSON.stringify(rpcMock.mock.calls.map(c => c[0])), JSON.stringify(toastMock.error.mock.calls));
  });
});

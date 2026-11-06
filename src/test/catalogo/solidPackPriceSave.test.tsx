import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const { rpcMock, toastMock, auth } = vi.hoisted(() => ({ rpcMock: vi.fn(), toastMock: { error: vi.fn(), success: vi.fn() }, auth: { value: null as any } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock } }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth.value }));
import { SolidPresentations } from "@/components/protocolos/SolidPresentations";
import { CatalogoVolumesDialog } from "@/components/protocolos/CatalogoVolumesDialog";
import { cents, civilDate } from "@/lib/catalogo/packagingAdminContract";

// Valor R$ 10,00 é apenas da fixture TESTE do auditor, não padrão comercial.
const U = "11111111-1111-4111-8111-111111111111", ORG = "007bb519-cba0-4704-be2c-cb93ad010048";
const PROD = "22222222-2222-4222-8222-222222222222", PK = "366e6f04-0000-4000-8000-000000000002";
const offer = { packaging_id: PK, codigo: "SC25", descricao: "Saco 25 kg", peso_liquido_kg: 25, version: 1, ativo: true, prices: [] };
const state = { product_id: PROD, unidade_conteudo: "kg" as const, offers: [offer] };
const admin = { contract: "SOLID_PACK_ADMIN_V1", config_version: 1, ...state };
const resp = (v: unknown) => { const p = Promise.resolve(v); return Object.assign(p, { abortSignal: () => p }); };
const routes = () => rpcMock.mockImplementation((name: string) => resp(name === "solid_pack_offers_admin_v1"
  ? { data: admin, error: null } : { data: null, error: { code: "42501", message: "negado pelo servidor" } }));
const fill = (price: string, date: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Preço" }));
  fireEvent.change(screen.getByLabelText("Preço por embalagem (R$)"), { target: { value: price } });
  fireEvent.change(screen.getByLabelText("Vigência"), { target: { value: date } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar preço" }));
};
const priceCalls = () => rpcMock.mock.calls.filter(c => c[0] === "solid_pack_price_set_v1");
const mk = () => render(<QueryClientProvider client={new QueryClient()}><SolidPresentations state={state} /></QueryClientProvider>);
beforeEach(() => {
  rpcMock.mockReset(); toastMock.error.mockReset(); toastMock.success.mockReset(); routes();
  auth.value = { user: { id: U }, profile: { user_id: U, ativo: true, senha_provisoria: false, organization_id: ORG },
    roles: ["administrador"], loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: () => true };
});

describe("parse de preço e vigência", () => {
  it.each([["10", 1000], ["10,00", 1000], ["10.00", 1000], ["R$ 10,00", 1000], ["1.234,56", 123456], ["0,5", 50]])("%s => %i", (t, v) => expect(cents(t)).toBe(v));
  it.each(["", "abc", "10,001", "1,234.56", "-10", "0", "0,00", "10 00"])("recusa %s com motivo", t => expect(() => cents(t)).toThrow(/Preço/));
  it("vigência civil", () => {
    expect(civilDate("2026-11-06")).toBe("2026-11-06");
    for (const t of ["06/11/2026", "2026-02-30", "2026-13-01", ""]) expect(() => civilDate(t)).toThrow(/Vigência inválida/);
  });
});

describe("Salvar preço da embalagem", () => {
  it("despacha solid_pack_price_set_v1 com 1000 centavos e sem preço anterior", async () => {
    mk(); fill("10,00", "2026-11-06");
    await waitFor(() => expect(priceCalls()).toHaveLength(1));
    expect(priceCalls()[0][1]).toMatchObject({ p_packaging_id: PK, p_preco_centavos: 1000, p_valid_from: "2026-11-06", p_expected_price_id: null });
    expect(typeof priceCalls()[0][1].p_idempotency_key).toBe("string");
  });
  it("recusa do servidor aparece na tela", async () => {
    mk(); fill("10,00", "2026-11-06");
    expect(await screen.findByRole("alert")).toHaveTextContent("negado pelo servidor");
  });
  it("preço inválido: motivo visível e nenhum envio", async () => {
    mk(); fill("10,001", "2026-11-06");
    expect(await screen.findByRole("alert")).toHaveTextContent("Preço inválido");
    expect(priceCalls()).toHaveLength(0);
  });
  it("sessão em revalidação no clique: motivo visível, nenhum envio, autorização não relaxada", async () => {
    let ok = true; auth.value.checkAuthzAccess = () => ok;
    mk(); ok = false; fill("10,00", "2026-11-06");
    expect(await screen.findByRole("alert")).toHaveTextContent("Sessão em revalidação");
    expect(priceCalls()).toHaveLength(0);
  });
  it.each([[["administrador", "parceiro_b2b"]], [["financeiro"]]])("papéis sem edição %j: nenhum envio, motivo visível", async roles => {
    auth.value.roles = roles; mk(); fill("10,00", "2026-11-06");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(priceCalls()).toHaveLength(0);
  });
});

describe("diálogo real de apresentações", () => {
  const dialog = (qc: QueryClient) => <QueryClientProvider client={qc}><CatalogoVolumesDialog open onOpenChange={() => {}} itemId={PROD} itemTipo="produto" itemNome="SOLO-5" owned /></QueryClientProvider>;
  it("primeira abertura salva", async () => {
    render(dialog(new QueryClient()));
    await screen.findByRole("button", { name: "Preço" });
    fill("10,00", "2026-11-06");
    await waitFor(() => expect(priceCalls()).toHaveLength(1));
  });
  it("reabertura com leitura em cache não fica inativa sem aviso", async () => {
    const qc = new QueryClient();
    const first = render(dialog(qc));
    await screen.findByRole("button", { name: "Preço" });
    first.unmount();
    render(dialog(qc));
    await waitFor(() => expect(screen.getByRole("button", { name: "Preço" })).not.toBeDisabled());
    fill("10,00", "2026-11-06");
    await waitFor(() => expect(priceCalls()).toHaveLength(1));
  });
});

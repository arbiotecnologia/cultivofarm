import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Componente real + hook real de escopo/Blob; Auth e Edge simulados. Não é homologação real.
const T = "33333333-3333-4333-8333-333333333333";
const auth = vi.hoisted(() => ({
  user: { id: "A" } as { id: string } | null,
  profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false },
  roles: ["administrador"], role: "administrador", loading: false, authzReady: true, authzEpoch: 0,
  checkAuthzAccess: (): boolean => m.lease,
}));
const m = vi.hoisted(() => ({ lease: true, invoke: vi.fn(), sign: vi.fn(), toast: vi.fn(), termo: {} as Record<string, unknown> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-toast", () => ({ toast: m.toast, useToast: () => ({ toast: m.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (t: string) => {
    const r = t === "entrega_termos" ? { data: m.termo, error: null } : { data: [], error: null };
    const q: Record<string, unknown> = {};
    for (const n of ["select", "eq", "order", "limit"]) q[n] = () => q;
    q.maybeSingle = async () => r;
    q.then = (a: (v: unknown) => unknown, b: (v: unknown) => unknown) => Promise.resolve(r).then(a, b);
    return q;
  },
  rpc: vi.fn(),
  functions: { invoke: m.invoke },
  storage: { from: () => ({ createSignedUrl: m.sign, createSignedUrls: m.sign, download: m.sign }) },
} }));
import { TermoEntregaPanel } from "@/components/entregas/TermoEntregaPanel";

const pdf = () => new Blob(["%PDF-1.7 ok"], { type: "application/pdf" });
const termo = (o: Record<string, unknown> = {}) => ({ id: T, versao: 2, status: "assinado", cobertura: "total", snapshot_hash: "s",
  assinado_em: "2026-10-19T00:00:00Z", recebedor_nome: "R", pdf_path: "E/T/v2/x.pdf", pdf_hash: "h", ...o });
let n = 0;
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result as ArrayBuffer); r.readAsArrayBuffer(this); });
  };
}
let qc: QueryClient;
beforeEach(() => {
  Object.assign(auth, { user: { id: "A" }, roles: ["administrador"], loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: () => m.lease }); m.lease = true;
  auth.profile = { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false };
  m.invoke.mockReset().mockResolvedValue({ data: pdf(), error: null }); m.sign.mockReset(); m.toast.mockReset();
  m.termo = termo(); n = 0;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:${++n}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(window, "open").mockImplementation(() => null);
});
function mount() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = () => <QueryClientProvider client={qc}><TermoEntregaPanel entregaId="E" /></QueryClientProvider>;
  const r = render(ui());
  return { rerender: () => r.rerender(ui()) };
}
const preparar = async () => fireEvent.click(await screen.findByRole("button", { name: /Preparar termo assinado/ }));
const noBearer = () => {
  expect(m.sign).not.toHaveBeenCalled(); expect(window.open).not.toHaveBeenCalled();
  for (const c of m.invoke.mock.calls) expect(c[1].body.action).not.toBe("signed_url");
};

describe("TermoEntregaPanel: PDF binário autenticado em duas etapas", () => {
  it("happy path: prepara pela Edge download e só baixa após novo clique", async () => {
    mount(); const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await preparar();
    const baixar = await screen.findByRole("button", { name: /Baixar termo assinado/ });
    expect(m.invoke).toHaveBeenCalledWith("entrega-termo-pdf", expect.objectContaining({ body: { termo_id: T, action: "download" }, signal: expect.any(AbortSignal) }));
    expect(click).not.toHaveBeenCalled();
    fireEvent.click(baixar); expect(click).toHaveBeenCalledTimes(1);
    noBearer(); click.mockRestore();
  });
  it("erro da Edge (cancelado/negado): toast neutro, sem URL e relê o termo", async () => {
    m.invoke.mockResolvedValue({ data: null, error: new Error("termo_cancelado secreto") });
    mount(); await preparar();
    await waitFor(() => expect(m.toast).toHaveBeenCalled());
    expect(JSON.stringify(m.toast.mock.calls)).not.toMatch(/secreto|termo_cancelado/);
    expect(screen.queryByRole("button", { name: /Baixar termo/ })).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled(); noBearer();
  });
  it("resposta que não é PDF é rejeitada", async () => {
    m.invoke.mockResolvedValue({ data: new Blob(['{"signed_url":"https://x"}']), error: null });
    mount(); await preparar();
    await waitFor(() => expect(m.toast).toHaveBeenCalled());
    expect(URL.createObjectURL).not.toHaveBeenCalled(); noBearer();
  });
  it.each([
    ["tenant", () => { auth.profile = { ...auth.profile, organization_id: "OB" }; }],
    ["papéis", () => { auth.roles = ["gestor"]; }],
    ["época", () => { auth.authzEpoch = 1; }],
  ])("mudança de %s durante o preparo descarta a resposta tardia", async (_n, mudar) => {
    let resolve!: (v: unknown) => void;
    m.invoke.mockImplementation((_f: string, o: { signal: AbortSignal }) => new Promise((r) => { resolve = r; void o; }));
    const h = mount(); await preparar();
    await waitFor(() => expect(m.invoke).toHaveBeenCalled());
    const signal = m.invoke.mock.calls[0][1].signal as AbortSignal;
    act(() => { mudar(); h.rerender(); });
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve({ data: pdf(), error: null }); });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Baixar termo/ })).toBeNull(); expect(m.toast).not.toHaveBeenCalled();
  });
  it("lease vencida após preparo: clique antigo não baixa", async () => {
    const h = mount(); const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await preparar(); const baixar = await screen.findByRole("button", { name: /Baixar termo assinado/ });
    m.lease = false;
    fireEvent.click(baixar); expect(click).not.toHaveBeenCalled();
    h.rerender(); expect(screen.queryByRole("button", { name: /Baixar termo/ })).toBeNull();
    click.mockRestore();
  });
  it("lease vencida antes do clique de preparo: nenhuma requisição", async () => {
    mount(); await screen.findByRole("button", { name: /Preparar termo assinado/ });
    m.lease = false; await preparar();
    expect(m.invoke).not.toHaveBeenCalled();
  });
  it("papel retirado após preparo revoga o Blob", async () => {
    const h = mount(); await preparar(); await screen.findByRole("button", { name: /Baixar termo assinado/ });
    act(() => { auth.roles = ["gestor"]; h.rerender(); });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
    expect(screen.queryByRole("button", { name: /Baixar termo/ })).toBeNull();
  });
  it("termo cancelado/substituído após preparo revoga o Blob e oculta o download", async () => {
    mount(); await preparar(); await screen.findByRole("button", { name: /Baixar termo assinado/ });
    m.termo = termo({ status: "cancelado", motivo_cancelamento: "erro" });
    await act(async () => { await qc.invalidateQueries(); });
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1"));
    expect(screen.queryByRole("button", { name: /Baixar termo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Preparar termo/ })).toBeNull();
  });
  it("logout após preparo revoga o Blob", async () => {
    const h = mount(); await preparar(); await screen.findByRole("button", { name: /Baixar termo assinado/ });
    act(() => { auth.user = null; h.rerender(); });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });
  it("gerar PDF continua idempotente pela mesma Edge (generate)", async () => {
    m.termo = termo({ pdf_path: null, pdf_hash: null });
    m.invoke.mockResolvedValue({ data: { replay: true }, error: null });
    mount(); fireEvent.click(await screen.findByRole("button", { name: /Gerar PDF do termo/ }));
    await waitFor(() => expect(m.invoke).toHaveBeenCalledWith("entrega-termo-pdf", { body: { termo_id: T, action: "generate" } }));
    noBearer();
  });
});

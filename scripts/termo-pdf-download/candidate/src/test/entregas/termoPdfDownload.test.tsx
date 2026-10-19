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
const m = vi.hoisted(() => ({ lease: true, invoke: vi.fn(), fetch: vi.fn(), sign: vi.fn(), toast: vi.fn(), termo: {} as Record<string, unknown> }));
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
  auth: { getSession: async () => ({ data: { session: { access_token: "tok" } }, error: null }) },
  storage: { from: () => ({ createSignedUrl: m.sign, createSignedUrls: m.sign, download: m.sign }) },
} }));
import { TermoEntregaPanel } from "@/components/entregas/TermoEntregaPanel";

const pdf = () => new Blob(["%PDF-1.7 ok"], { type: "application/pdf" });
const pdfRes = (body: BodyInit | null = "%PDF-1.7 ok", headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "application/pdf", ...headers } });
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
  m.invoke.mockReset(); m.sign.mockReset(); m.toast.mockReset();
  vi.useRealTimers();
  m.fetch.mockReset().mockImplementation(async () => pdfRes()); vi.stubGlobal("fetch", m.fetch);
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
  for (const c of m.fetch.mock.calls) { expect(String(c[0])).not.toMatch(/\/sign\//); expect(String(c[1]?.body)).not.toMatch(/signed_url/); }
};

describe("TermoEntregaPanel: PDF binário autenticado em duas etapas", () => {
  it("happy path: prepara pela Edge download e só baixa após novo clique", async () => {
    mount(); const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await preparar();
    const baixar = await screen.findByRole("button", { name: /Baixar termo assinado/ });
    const [url, init] = m.fetch.mock.calls[0];
    expect(String(url)).toMatch(/\/functions\/v1\/entrega-termo-pdf$/);
    expect(JSON.parse(init.body)).toEqual({ termo_id: T, action: "download" });
    expect(init.signal).toBeInstanceOf(AbortSignal); expect(m.invoke).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    fireEvent.click(baixar); expect(click).toHaveBeenCalledTimes(1);
    noBearer(); click.mockRestore();
  });
  it("erro da Edge (cancelado/negado): toast neutro, sem URL e relê o termo", async () => {
    m.fetch.mockImplementation(async () => new Response('{"error":"termo_cancelado secreto"}', { status: 409, headers: { "content-type": "application/json" } }));
    mount(); await preparar();
    await waitFor(() => expect(m.toast).toHaveBeenCalled());
    expect(JSON.stringify(m.toast.mock.calls)).not.toMatch(/secreto|termo_cancelado/);
    expect(screen.queryByRole("button", { name: /Baixar termo/ })).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled(); noBearer();
  });
  it("resposta que não é PDF é rejeitada", async () => {
    m.fetch.mockImplementation(async () => pdfRes('{"signed_url":"https://x"}'));
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
    m.fetch.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const h = mount(); await preparar();
    await waitFor(() => expect(m.fetch).toHaveBeenCalled());
    const signal = m.fetch.mock.calls[0][1].signal as AbortSignal;
    act(() => { mudar(); h.rerender(); });
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(pdfRes()); });
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
    expect(m.fetch).not.toHaveBeenCalled();
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

import { downloadTermoPdf, TERMO_PDF_MAX_BYTES } from "@/lib/entregas/termoPdfDownload";
describe("downloadTermoPdf: prazo real e limite no stream", () => {
  it("Edge que NUNCA responde e ignora o abort: rejeita em 15 s e aborta o transporte", async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    m.fetch.mockImplementation((_u: string, i: RequestInit) => { seen = i.signal ?? undefined; return new Promise(() => {}); });
    const p = downloadTermoPdf(T, new AbortController().signal); const done = p.catch((e) => e);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await done).toBeInstanceOf(Error); expect(seen?.aborted).toBe(true);
  });
  it("corpo que para no meio: rejeita no prazo e cancela o leitor", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    m.fetch.mockImplementation(async () => pdfRes(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("%PDF-")); }, cancel() { cancelled = true; } })));
    const done = downloadTermoPdf(T, new AbortController().signal).catch((e) => e);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await done).toBeInstanceOf(Error); expect(cancelled).toBe(true);
  });
  it("Content-Length acima do limite: rejeita sem ler o corpo", async () => {
    let pulled = false;
    m.fetch.mockImplementation(async () => pdfRes(new ReadableStream({ pull(c) { pulled = true; c.enqueue(new Uint8Array(1)); } }, { highWaterMark: 0 }),
      { "content-length": String(TERMO_PDF_MAX_BYTES + 1) }));
    await expect(downloadTermoPdf(T, new AbortController().signal)).rejects.toThrow("Documento indisponível");
    expect(pulled).toBe(false);
  });
  it("stream sem tamanho que excede o limite: cancela antes de acumular tudo", async () => {
    let sent = 0, cancelled = false; const chunk = new Uint8Array(1024 * 1024);
    m.fetch.mockImplementation(async () => pdfRes(new ReadableStream({ pull(c) { sent += chunk.byteLength; c.enqueue(chunk); }, cancel() { cancelled = true; } }, { highWaterMark: 0 })));
    await expect(downloadTermoPdf(T, new AbortController().signal)).rejects.toThrow("Documento indisponível");
    expect(cancelled).toBe(true); expect(sent).toBeLessThanOrEqual(TERMO_PDF_MAX_BYTES + chunk.byteLength);
  });
  it("abort externo (escopo mudou) interrompe imediatamente", async () => {
    m.fetch.mockImplementation(() => new Promise(() => {}));
    const outer = new AbortController(); const done = downloadTermoPdf(T, outer.signal).catch((e) => e);
    await Promise.resolve(); outer.abort();
    expect(await done).toBeInstanceOf(Error);
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadableStream } from "node:stream/web";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({ stream: vi.fn(), sign: vi.fn(), fetch: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["consultor_tecnico", "gestor"], loading: false, authzReady: true, authzEpoch: 0 }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ download: (...args: unknown[]) => ({ asStream: () => mocks.stream(...args) }), createSignedUrls: mocks.sign, createSignedUrl: mocks.sign }) } } }));
import { useAuthenticatedBlobUrls } from "@/hooks/useAuthenticatedBlobUrls";
import { ATTACHMENT_LIMITS } from "@/lib/authz/authenticatedAttachment";
const body = (size = 3) => ({ data: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(size)); c.close(); } }), error: null });
const paths = (n: number) => Array.from({ length: n }, (_, i) => `h/${i + 1}.jpg`);
const requested = () => mocks.stream.mock.calls.map(c => c[0]);
beforeEach(() => {
  mocks.stream.mockReset().mockImplementation(async () => body()); mocks.sign.mockReset(); mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
  auth.user = { id: "A" }; auth.profile = { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false };
  auth.roles = ["consultor_tecnico", "gestor"]; auth.authzReady = true; auth.authzEpoch = 0;
  let n = 0;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:p-${++n}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

describe("histórico >24: janela autenticada", () => {
  it("25º item acessível ao trocar de página; janela anterior revogada; sem assinatura/fetch", async () => {
    const h = renderHook(() => useAuthenticatedBlobUrls(paths(30)));
    await waitFor(() => expect(Object.keys(h.result.current.urls)).toHaveLength(24));
    expect(h.result.current.urls["h/25.jpg"]).toBeUndefined();
    act(() => h.result.current.pagination.setPage(1));
    await waitFor(() => expect(h.result.current.urls["h/25.jpg"]).toMatch(/^blob:/));
    expect(Object.keys(h.result.current.urls)).toHaveLength(6);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(24);
    expect(mocks.stream).toHaveBeenCalledTimes(30);
    expect(mocks.sign).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
    h.unmount();
  });
  it("showPath leva à página do item e página é limitada quando a lista encolhe", async () => {
    const h = renderHook(({ p }) => useAuthenticatedBlobUrls(p), { initialProps: { p: paths(50) } });
    act(() => h.result.current.pagination.showPath("h/49.jpg"));
    expect(h.result.current.pagination.page).toBe(2);
    await waitFor(() => expect(h.result.current.urls["h/49.jpg"]).toBeTruthy());
    h.rerender({ p: paths(10) });
    expect(h.result.current.pagination.page).toBe(0);
    await waitFor(() => expect(h.result.current.urls["h/10.jpg"]).toBeTruthy()); h.unmount();
  });
  it("resposta tardia da página anterior não publica nem retém Blob", async () => {
    const late: Array<(v: ReturnType<typeof body>) => void> = [];
    mocks.stream.mockImplementation((p: string) => p === "h/1.jpg" ? new Promise(r => late.push(r)) : Promise.resolve(body()));
    const h = renderHook(() => useAuthenticatedBlobUrls(paths(26)));
    await waitFor(() => expect(late).toHaveLength(1));
    act(() => h.result.current.pagination.setPage(1));
    await waitFor(() => expect(h.result.current.urls["h/26.jpg"]).toBeTruthy());
    const created = (URL.createObjectURL as any).mock.calls.length;
    await act(async () => late[0](body()));
    expect((URL.createObjectURL as any).mock.calls.length).toBe(created);
    expect(h.result.current.urls["h/1.jpg"]).toBeUndefined(); h.unmount();
  });
  it("revogação parcial (papel retirado) na página 2 oculta e revoga; papel restante recarrega", async () => {
    const h = renderHook(() => useAuthenticatedBlobUrls(paths(25)));
    act(() => h.result.current.pagination.setPage(1));
    await waitFor(() => expect(h.result.current.urls["h/25.jpg"]).toBeTruthy());
    const owned = h.result.current.urls["h/25.jpg"];
    auth.roles = ["gestor"]; h.rerender();
    expect(h.result.current.urls["h/25.jpg"]).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(owned);
    await waitFor(() => expect(h.result.current.urls["h/25.jpg"]).toBeTruthy());
    expect(h.result.current.urls["h/25.jpg"]).not.toBe(owned);
    expect(h.result.current.pagination.page).toBe(1); h.unmount();
  });
  it("troca de tenant na página 2 falha fechado e não mostra bytes antigos", async () => {
    const h = renderHook(() => useAuthenticatedBlobUrls(paths(25)));
    act(() => h.result.current.pagination.setPage(1));
    await waitFor(() => expect(h.result.current.urls["h/25.jpg"]).toBeTruthy());
    auth.authzReady = false; auth.profile.organization_id = "OB"; h.rerender();
    expect(h.result.current.urls).toEqual({}); h.unmount();
  });
  it("erro na página 2 é individual e Retry manual recupera", async () => {
    let fail = true;
    mocks.stream.mockImplementation(async (p: string) => p === "h/25.jpg" && fail ? { data: null, error: { status: 403 } } : body());
    const h = renderHook(() => useAuthenticatedBlobUrls(paths(26)));
    act(() => h.result.current.pagination.setPage(1));
    await waitFor(() => expect(h.result.current.failed).toEqual(["h/25.jpg"]));
    expect(h.result.current.urls["h/26.jpg"]).toBeTruthy();
    expect(h.result.current.error?.message).toBe("Anexo indisponível");
    fail = false; act(() => h.result.current.refresh());
    await waitFor(() => expect(h.result.current.urls["h/25.jpg"]).toBeTruthy());
    expect(h.result.current.failed).toEqual([]); expect(mocks.sign).not.toHaveBeenCalled(); h.unmount();
  });
  it("lazy: cache LRU limita 24 Blobs residentes e revoga o mais antigo", async () => {
    const h = renderHook(() => useAuthenticatedBlobUrls(paths(30), "private", { lazy: true }));
    for (const p of paths(25)) { act(() => h.result.current.request(p)); await waitFor(() => expect(h.result.current.urls[p]).toBeTruthy()); }
    expect(Object.keys(h.result.current.urls)).toHaveLength(ATTACHMENT_LIMITS.files);
    expect(h.result.current.urls["h/1.jpg"]).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:p-1");
    act(() => h.result.current.request("h/1.jpg"));
    await waitFor(() => expect(h.result.current.urls["h/1.jpg"]).toBeTruthy()); h.unmount();
  });
  it("lazy: limite de bytes evita reter acima de 60 MiB, evictando antigos", async () => {
    mocks.stream.mockImplementation(async () => body(ATTACHMENT_LIMITS.fileBytes));
    const h = renderHook(() => useAuthenticatedBlobUrls(paths(5), "private", { lazy: true }));
    for (const p of paths(4)) { act(() => h.result.current.request(p)); await waitFor(() => expect(h.result.current.urls[p]).toBeTruthy()); }
    expect(Object.keys(h.result.current.urls)).toHaveLength(3); h.unmount();
  });
  it("caminho fora da lista (URL legada) é ignorado", async () => {
    const h = renderHook(() => useAuthenticatedBlobUrls(paths(2), "private", { lazy: true }));
    act(() => h.result.current.request("https://x.supabase.co/storage/v1/object/sign/a?token=t"));
    expect(mocks.stream).not.toHaveBeenCalled(); h.unmount();
  });
});

describe("consumidores não leem URL gravada", () => {
  it("Solicitacoes.tsx não seleciona nem consome arquivo_url/foto_url", () => {
    const src = readFileSync("src/pages/Solicitacoes.tsx", "utf8");
    expect(src).not.toMatch(/arquivo_url/);
    expect(src).not.toMatch(/c\.foto_url/);
    expect(src).toMatch(/fotoPath: a\.arquivo_path/);
  });
  it("exportação PDF da visita não lê arquivo_url nem usa fetch de URL", () => {
    const page = readFileSync("src/pages/VisitaTecnica.tsx", "utf8");
    const pdf = readFileSync("src/lib/pdfVisita.ts", "utf8");
    const build = page.slice(page.indexOf("const buildPdfData"), page.indexOf("const handleExportPdf"));
    expect(build).not.toMatch(/arquivo_url/);
    expect(pdf).not.toMatch(/\bfetch\(/);
    expect(pdf).toMatch(/downloadAuthenticatedAttachment/);
  });
  it("histórico eager usa pager em todos os consumidores", () => {
    for (const f of ["src/components/talhoes/HistoricoTalhao.tsx", "src/components/solicitacoes/TimelineAtendimento.tsx", "src/pages/app/MobileTalhaoHistorico.tsx", "src/components/visita/roteiro/RoteiroVisita.tsx", "src/components/visita/EvidenciasTabs.tsx", "src/pages/ConsultorTecnico.tsx", "src/pages/app/wizard/WizardAnexosStep.tsx", "src/components/solicitacoes/SolicitacaoDetalheTabs.tsx"])
      expect(readFileSync(f, "utf8")).toMatch(/<AttachmentPager pagination=\{attachmentPage\}/);
  });
});

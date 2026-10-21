import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadableStream } from "node:stream/web";
const mocks = vi.hoisted(() => ({ stream: vi.fn(), sign: vi.fn(), fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: (b: string) => ({ download: (...a: unknown[]) => ({ asStream: () => mocks.stream(b, ...a) }), createSignedUrl: mocks.sign, createSignedUrls: mocks.sign }) } } }));
import { generateVisitaPdf } from "@/lib/pdfVisita";
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
const ok = () => ({ data: new ReadableStream({ start(c) { c.enqueue(png); c.close(); } }), error: null });
const base = { empresa: { nome: "T" }, dataVisita: "01/01/2026" };
beforeEach(() => { mocks.stream.mockReset(); mocks.sign.mockReset(); mocks.fetch.mockReset(); vi.stubGlobal("fetch", mocks.fetch); });
describe("PDF da visita — anexos autenticados", () => {
  it("baixa fotos pelo caminho no bucket canônico, sem assinatura nem fetch", async () => {
    mocks.stream.mockImplementation(async () => ok());
    const doc = await generateVisitaPdf({ ...base, fotos: [{ path: "r/1.png", legenda: "a" }], audios: [{ duracao: 3 }], evidenciasExtras: [{ categoria: "laudo" }] } as any);
    expect(mocks.stream.mock.calls[0][0]).toBe("consultor-arquivos");
    expect(mocks.stream.mock.calls[0][1]).toBe("r/1.png");
    expect(mocks.sign).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
    expect(doc.output()).not.toMatch(/https?:\/\/|token=/);
  });
  it("negação 403 gera PDF com aviso seguro e sem fallback", async () => {
    mocks.stream.mockResolvedValue({ data: null, error: { status: 403 } });
    const doc = await generateVisitaPdf({ ...base, fotos: [{ path: "r/1.png" }, { path: null }] } as any);
    expect(doc.output()).toMatch(/indispon/);
    expect(mocks.sign).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });
  it("abort cancela downloads pendentes", async () => {
    mocks.stream.mockImplementation((_b: string, _p: string, _o: unknown, prm: { signal: AbortSignal }) => new Promise((_, rej) => prm.signal.addEventListener("abort", () => rej(new Error("abort")))));
    const c = new AbortController();
    const p = generateVisitaPdf({ ...base, fotos: [{ path: "r/1.png" }] } as any, { signal: c.signal });
    await new Promise(r => setTimeout(r, 0)); c.abort();
    await expect(p).resolves.toBeTruthy();
  });
});

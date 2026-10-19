import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { applicationAttempt, salvarAplicacao } from "@/lib/aplicacoes/salvar";
import type { PendingEvidencia } from "@/components/aplicacao/EvidenciasUploader";
const fake = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: fake.rpc, storage: { from: () => ({ upload: fake.upload, remove: fake.remove }) } } }));
const client = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pending = (): PendingEvidencia[] => [{ id: "image", file: new File(["abc"], "../../evil.png", { type: "image/png" }), tipo: "foto", legenda: "", previewUrl: "blob:local" }];
const deferred = <T,>() => { let resolve: (x: T) => void = () => {}; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
describe("preparação e finalização canônicas", () => {
  beforeEach(() => {
    vi.clearAllMocks(); fake.upload.mockResolvedValue({ error: null });
    fake.rpc.mockImplementation((_name, args) => ({ abortSignal: () => Promise.resolve({ data: { success: true, id: args.p_aplicacao_id, phase: args.p_payload._phase === "prepare" ? "prepared" : "finalized" }, error: null }) }));
  });
  afterEach(() => vi.useRealTimers());
  it("prepara, sobe e finaliza nessa ordem sem remover objetos", async () => {
    const items = pending(); const a = applicationAttempt({}, null, items, [], client);
    await salvarAplicacao(a, a.payload, null, items, [], () => true);
    expect(fake.rpc.mock.calls.map(c => c[1].p_payload._phase)).toEqual(["prepare", "finalize"]);
    expect(fake.rpc.mock.invocationCallOrder[0]).toBeLessThan(fake.upload.mock.invocationCallOrder[0]);
    expect(fake.upload.mock.invocationCallOrder[0]).toBeLessThan(fake.rpc.mock.invocationCallOrder[1]);
    expect(a.evidence[0].storage_path).toMatch(new RegExp(`^${client}/${a.id}/[a-f0-9-]+\\.png$`));
    expect(fake.remove).not.toHaveBeenCalled();
  });
  it("retry idêntico preserva UUID; mudança não herda recibo", () => {
    const items = pending(); const p = { dose: 2 }; const a = applicationAttempt(p, null, items, [], client);
    expect(applicationAttempt(p, null, items, [], client, a)).toBe(a);
    expect(applicationAttempt({ dose: 3 }, null, items, [], client, a).id).not.toBe(a.id);
  });
  it("nega antes de request quando expirou", async () => {
    const a = applicationAttempt({}, null, [], [], client);
    await expect(salvarAplicacao(a, {}, null, [], [], () => false)).rejects.toThrow();
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("prepare tardio não inicia upload", async () => {
    const wait = deferred<{ data: unknown; error: null }>(); let current = true;
    fake.rpc.mockReturnValue({ abortSignal: () => wait.promise });
    const items = pending(); const a = applicationAttempt({}, null, items, [], client);
    const task = salvarAplicacao(a, {}, null, items, [], () => current);
    current = false; wait.resolve({ data: { success: true, id: a.id, phase: "prepared" }, error: null });
    await expect(task).rejects.toThrow(); expect(fake.upload).not.toHaveBeenCalled();
  });
  it("revogação durante upload não grava metadado nem limpa bytes", async () => {
    const wait = deferred<{ error: null }>(); let current = true; fake.upload.mockReturnValue(wait.promise);
    const items = pending(); const a = applicationAttempt({}, null, items, [], client);
    const task = salvarAplicacao(a, {}, null, items, [], () => current);
    await vi.waitFor(() => expect(fake.upload).toHaveBeenCalled());
    current = false; wait.resolve({ error: null });
    await expect(task).rejects.toThrow(); expect(fake.rpc).toHaveBeenCalledTimes(1); expect(fake.remove).not.toHaveBeenCalled();
  });
  it("timeout de upload tardio não finaliza", async () => {
    vi.useFakeTimers(); const wait = deferred<{ error: null }>(); fake.upload.mockReturnValue(wait.promise);
    const items = pending(); const a = applicationAttempt({}, null, items, [], client);
    const task = salvarAplicacao(a, {}, null, items, [], () => true, 20);
    const rejected = expect(task).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(21); wait.resolve({ error: null }); await rejected;
    expect(fake.rpc).toHaveBeenCalledTimes(1); expect(fake.remove).not.toHaveBeenCalled();
  });
  it("finalize perdido reusa UUID/upload sem cleanup", async () => {
    const items = pending(); const a = applicationAttempt({}, null, items, [], client);
    fake.rpc.mockImplementation((_name, args) => ({ abortSignal: () => Promise.resolve(args.p_payload._phase === "prepare"
      ? { data: { success: true, id: a.id, phase: "prepared" }, error: null } : { data: null, error: new Error("offline") }) }));
    await expect(salvarAplicacao(a, {}, null, items, [], () => true)).rejects.toThrow("offline");
    fake.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: { success: true, id: a.id, phase: "finalized" }, error: null }) });
    await salvarAplicacao(a, {}, null, items, [], () => true);
    expect(fake.upload).toHaveBeenCalledTimes(1); expect(fake.remove).not.toHaveBeenCalled();
  });
  it.each(["tenant", "epoch", "unmount", "roles"])("finalize tardio %s não retorna sucesso", async () => {
    const a = applicationAttempt({}, null, [], [], client); let current = true;
    fake.rpc.mockImplementation((_name, args) => ({ abortSignal: () => {
      if (args.p_payload._phase === "finalize") current = false;
      return Promise.resolve({ data: { success: true, id: a.id, phase: args.p_payload._phase === "prepare" ? "prepared" : "finalized" }, error: null });
    } }));
    await expect(salvarAplicacao(a, {}, null, [], [], () => current)).rejects.toThrow();
  });
  it("nega recibo com UUID errado", async () => {
    fake.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: { success: true, id: "foreign", phase: "prepared" }, error: null }) });
    const a = applicationAttempt({}, null, [], [], client);
    await expect(salvarAplicacao(a, {}, null, [], [], () => true)).rejects.toThrow("inválida");
  });
  it("limite20 e MIME inválido falham antes de requests", () => {
    expect(() => applicationAttempt({}, null, Array.from({ length: 21 }, () => pending()[0]), [], client)).toThrow("20");
    expect(() => applicationAttempt({}, null, [{ ...pending()[0], file: new File(["x"], "x.html", { type: "text/html" }) }], [], client)).toThrow();
  });
});
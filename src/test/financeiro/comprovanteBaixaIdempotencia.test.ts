import { afterEach, describe, it, expect, vi } from "vitest";
import { anexarComprovanteBaixa, comprovanteStoragePath, sanitizeFileName } from "@/lib/financial/anexarComprovanteBaixa";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PID = "00000000-0000-4000-8000-000000000001";
const base = { ownerType: "PAYMENT_RECEIVABLE" as const, paymentId: PID, idempotencyKey: "idem-abc", file: { name: "Comprovante Pix 18-08.pdf", type: "application/pdf", size: 1234 }, uploadedBy: A, organizationId: A, isCurrent: () => true };
type Doc = Record<string, any>;
/** Fake transport models the installed owner/org/path/author contract, not JWT/RLS certification. */
function makeClient() {
  const docs: Doc[] = []; const objects = new Set<string>(); const uploads: string[] = [];
  const opts = { insertError: null as any, authId: A, parentOrg: A, afterUpload: () => {}, afterLookup: () => {}, afterInsert: () => {}, insertWait: null as Promise<void> | null, uploadWait: null as Promise<void> | null, race: false };
  const upload = vi.fn(async (path: string, _file: unknown, options: any) => {
    if (opts.uploadWait) await opts.uploadWait;
    uploads.push(path); objects.add(path); expect(options.upsert).toBe(true); opts.afterUpload(); return { error: null };
  });
  const auth = { getUser: vi.fn(async () => ({ data: { user: { id: opts.authId } }, error: null })) };
  const insert = vi.fn(async (row: Doc) => {
    if (opts.insertWait) await opts.insertWait;
    if (opts.insertError) return { error: opts.insertError };
    if (opts.parentOrg !== A || row.uploaded_by !== opts.authId || row.storage_path !== comprovanteStoragePath({ ...base, ownerType: row.owner_type, paymentId: row.owner_id, fileName: base.file.name })) return { error: { code: "42501" } };
    if (opts.race) { docs.push({ ...row, id: "race", organization_id: A, deleted_at: null }); return { error: { code: "23505" } }; }
    docs.push({ ...row, id: `doc-${docs.length}`, organization_id: A, deleted_at: null }); opts.afterInsert(); return { error: null };
  });
  return { docs, objects, uploads, opts, auth, insert, storage: { from: () => ({ upload }) }, from: () => {
    const filters: Doc = {}; const api: any = { select: () => api, eq: (k: string, v: unknown) => { filters[k] = v; return api; }, is: (k: string, v: unknown) => { filters[k] = v; return api; }, maybeSingle: async () => { const found = docs.find(d => Object.entries(filters).every(([k,v]) => d[k] === v)); opts.afterLookup(); return { data: found ?? null, error: null }; }, insert };
    return api;
  } };
}
afterEach(() => vi.useRealTimers());
describe("comprovante no fluxo existente / contrato owner-first", () => {
  it.each(["PAYMENT_RECEIVABLE", "PAYMENT_PAYABLE"] as const)("%s determinístico sem prefixo org", ownerType => {
    const input = { ...base, ownerType, fileName: base.file.name };
    expect(comprovanteStoragePath(input)).toBe(`${ownerType}/${PID}/idem-abc-Comprovante-Pix-18-08.pdf`);
    expect(comprovanteStoragePath(input)).toBe(comprovanteStoragePath({ ...input, organizationId: B }));
    expect(sanitizeFileName("nota fiscal ção.pdf")).toBe("nota-fiscal-cao.pdf");
  });
  it.each([{ paymentId: "pay-1" }, { ownerType: "DELIVERY" }, { idempotencyKey: "../key" }, { fileName: "../foo" }, { fileName: "a/b" }, { fileName: "a%2fb" }, { fileName: "a\\b" }, { fileName: "" }])("nega path inválido %j", bad => {
    expect(() => comprovanteStoragePath({ ...base, fileName: base.file.name, ...bad } as any)).toThrow();
  });
  it("cria e retry não reenvia nem duplica", async () => {
    const c = makeClient(); expect(await anexarComprovanteBaixa(c, base)).toBe("created"); expect(await anexarComprovanteBaixa(c, base)).toBe("reused");
    expect(c.docs).toHaveLength(1); expect(c.uploads).toHaveLength(1); expect(c.insert.mock.calls[0][0]).not.toHaveProperty("organization_id");
  });
  it("upload aceito/metadata negada deixa órfão; retry mesma chave usa mesmo objeto", async () => {
    const c = makeClient(); c.opts.insertError = { code: "42501" }; await expect(anexarComprovanteBaixa(c, base)).rejects.toMatchObject({ code: "42501" });
    expect(c.objects.size).toBe(1); expect(c.docs).toHaveLength(0); c.opts.insertError = null;
    await expect(anexarComprovanteBaixa(c, base)).resolves.toBe("created"); expect(c.objects.size).toBe(1); expect(c.docs).toHaveLength(1);
  });
  it("23505 não é sucesso genérico; só reusa row exata reconsultada", async () => {
    const c = makeClient(); c.opts.insertError = { code: "23505" }; await expect(anexarComprovanteBaixa(c, base)).rejects.toMatchObject({ code: "23505" });
    c.opts.insertError = null; c.opts.race = true; await expect(anexarComprovanteBaixa(c, base)).resolves.toBe("reused");
  });
  it("SDK auth de outro UID nega antes de storage", async () => {
    const c = makeClient(); c.opts.authId = B; await expect(anexarComprovanteBaixa(c, base)).rejects.toThrow("Sessão"); expect(c.uploads).toHaveLength(0);
  });
  it("owner estrangeiro negado pelo contrato metadata não mostra sucesso", async () => {
    const c = makeClient(); c.opts.parentOrg = B; await expect(anexarComprovanteBaixa(c, base)).rejects.toMatchObject({ code: "42501" }); expect(c.docs).toHaveLength(0);
  });
  it.each(["start", "lookup", "upload", "insert"])("revogação %s impede sucesso/tardio", async stage => {
    const c = makeClient(); let active = stage !== "start";
    if (stage === "lookup") c.opts.afterLookup = () => { active = false; };
    if (stage === "upload") c.opts.afterUpload = () => { active = false; };
    if (stage === "insert") c.opts.afterInsert = () => { active = false; };
    await expect(anexarComprovanteBaixa(c, { ...base, isCurrent: () => active })).rejects.toThrow("expirado");
    expect(c.docs).toHaveLength(stage === "insert" ? 1 : 0); expect(c.uploads).toHaveLength(["upload", "insert"].includes(stage) ? 1 : 0);
  });
  it("auth muda após upload: sem metadata e objeto preservado", async () => {
    const c = makeClient(); c.opts.afterUpload = () => { c.opts.authId = B; }; await expect(anexarComprovanteBaixa(c, base)).rejects.toThrow("Sessão"); expect(c.objects.size).toBe(1); expect(c.docs).toHaveLength(0);
  });
  it.each(["upload", "insert"])("timeout %s: efeito parcial possível, sem conclusão tardia", async stage => {
    vi.useFakeTimers(); const c = makeClient(); let release: (() => void) | undefined;
    const wait = new Promise<void>(resolve => { release = resolve; }); if (stage === "upload") c.opts.uploadWait = wait; else c.opts.insertWait = wait;
    const result = anexarComprovanteBaixa(c, base); const failure = expect(result).rejects.toThrow("Prazo");
    await vi.advanceTimersByTimeAsync(15_000); await failure; release?.(); await vi.advanceTimersByTimeAsync(1);
    expect(c.docs).toHaveLength(stage === "insert" ? 1 : 0); expect(c.objects.size).toBe(1);
    c.opts.uploadWait = null; c.opts.insertWait = null; await expect(anexarComprovanteBaixa(c, base)).resolves.toBe(stage === "insert" ? "reused" : "created"); expect(c.docs).toHaveLength(1);
  });
});

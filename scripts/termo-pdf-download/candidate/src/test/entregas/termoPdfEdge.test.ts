import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";

// Edge candidata real (transpilada), com SDK/Storage falsos. Não é homologação JWT/RLS.
const SRC = "supabase/functions/entrega-termo-pdf/index.ts";
const TERMO = "33333333-3333-4333-8333-333333333333";
const ENT = "11111111-1111-4111-8111-111111111111";
const PATH = `${ENT}/${TERMO}/v2/termo-44444444-4444-4444-8444-444444444444.pdf`;
const BYTES = new TextEncoder().encode("%PDF-1.7 termo assinado");
const HASH = createHash("sha256").update(BYTES).digest("hex");
type Row = Record<string, unknown> | null;
type Handler = (req: Request) => Promise<Response>;

let st: {
  user: string | null; perfil: Row[]; visivel: Row[]; termo: Row[]; sucessor: Row[];
  actorOrg: (string | null)[]; entrega: Row[]; cliente: Row[];
  bytes: Uint8Array; onDownload?: () => void;
  authPending?: boolean;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
};
const calls = { download: vi.fn(), legacyDownload: vi.fn(), sign: vi.fn(), rpc: vi.fn(), upload: vi.fn() };
// Transporte de bytes real da candidata: fetch abortável do Storage autenticado.
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  calls.download(url, init);
  if (st.fetchImpl) return st.fetchImpl(url, init);
  st.onDownload?.();
  return new Response(st.bytes.slice(), { status: 200 });
});
vi.stubGlobal("fetch", fetchMock);
const next = <V,>(q: V[]): V => (q.length > 1 ? q.shift()! : q[0]);

function client(kind: "user" | "admin") {
  return {
    auth: { getUser: async () => st.authPending ? new Promise(() => {}) : (st.user ? { data: { user: { id: st.user } }, error: null } : { data: { user: null }, error: new Error("x") }) },
    from: (table: string) => {
      const f: Record<string, unknown> = {};
      const q: Record<string, unknown> = {};
      for (const m of ["select", "limit", "order"]) q[m] = () => q;
      q.eq = (c: string, v: unknown) => { f[c] = v; return q; };
      q.maybeSingle = async () => {
        if (table === "profiles") return { data: next(st.perfil), error: null };
        if (table === "entregas") return { data: next(st.entrega), error: null };
        if (table === "clientes") return { data: next(st.cliente), error: null };
        if (kind === "user") return { data: next(st.visivel), error: null };
        if ("substitui_termo_id" in f) return { data: next(st.sucessor), error: null };
        return { data: next(st.termo), error: null };
      };
      return q;
    },
    rpc: async (...a: unknown[]) => {
      if (kind === "user" && a[0] === "h15_actor_organization") { const v = next(st.actorOrg); return v === "PENDING" ? new Promise(() => {}) : { data: v, error: null }; }
      calls.rpc(...a); return { data: null, error: null };
    },
    storage: { from: () => ({
      download: async (p: string) => { calls.legacyDownload(p); const b = st.bytes; return { data: { size: b.byteLength, arrayBuffer: async () => b.slice().buffer }, error: null }; },
      createSignedUrl: calls.sign, upload: calls.upload, remove: vi.fn(),
    }) },
  };
}

function load(): Handler {
  const code = ts.transpileModule(readFileSync(SRC, "utf8").replace(/^import[\s\S]*?;\s*/gm, ""),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  let h: Handler | undefined;
  const Deno = { env: { get: () => "isolated" }, serve: (fn: Handler) => { h = fn; } };
  const createClient = (_u: string, key: string, o?: unknown) => client(o ? "user" : key === "isolated" && !o ? "admin" : "admin");
  new Function("Deno", "createClient", "PDFDocument", "StandardFonts", "rgb", code)(Deno, createClient, {}, {}, () => 0);
  return h!;
}
const call = (body: unknown, auth = "Bearer t") => load()(new Request("https://edge.invalid", {
  method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body),
}));
const termoOk = () => ({ id: TERMO, entrega_id: ENT, versao: 2, status: "assinado", cancelado_em: null, assinado_em: "2026-10-19", pdf_path: PATH, pdf_hash: HASH });

beforeEach(() => {
  vi.useRealTimers();
  Object.values(calls).forEach((c) => c.mockReset());
  st = { user: "U", perfil: [{ user_id: "U", ativo: true, senha_provisoria: false, organization_id: "OA" }],
    visivel: [{ id: TERMO }], termo: [termoOk()], sucessor: [null], bytes: BYTES,
    actorOrg: ["OA"], entrega: [{ id: ENT, organization_id: "OA", cliente_id: "C" }], cliente: [{ id: "C", organization_id: "OA" }] };
});

describe("entrega-termo-pdf candidata: download binário autenticado", () => {
  it("serve os bytes verificados por hash, sem assinar URL nem publicar evento", async () => {
    const r = await call({ termo_id: TERMO, action: "download" });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe("%PDF-1.7 termo assinado");
    expect(calls.sign).not.toHaveBeenCalled(); expect(calls.rpc).not.toHaveBeenCalled();
  });
  it("cliente antigo signed_url recebe 410 sem tocar Storage", async () => {
    expect((await call({ termo_id: TERMO, action: "signed_url" })).status).toBe(410);
    expect(calls.download).not.toHaveBeenCalled(); expect(calls.sign).not.toHaveBeenCalled();
  });
  it("ação desconhecida não cai em generate", async () => {
    expect((await call({ termo_id: TERMO, action: "outra" })).status).toBe(400);
    expect(calls.upload).not.toHaveBeenCalled(); expect(calls.rpc).not.toHaveBeenCalled();
  });
  it("sem bearer ou usuário inválido no Auth: 401", async () => {
    expect((await call({ termo_id: TERMO, action: "download" }, "")).status).toBe(401);
    st.user = null;
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(401);
    expect(calls.download).not.toHaveBeenCalled();
  });
  it("outro tenant (RLS não enxerga o termo): 403 antes do Storage", async () => {
    st.visivel = [null];
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(403);
    expect(calls.download).not.toHaveBeenCalled();
  });
  it.each([["inativo", { ativo: false }], ["senha provisória", { senha_provisoria: true }], ["sem tenant", { organization_id: null }]])(
    "perfil %s: 403", async (_n, patch) => {
      st.perfil = [{ ...st.perfil[0], ...patch }];
      expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(403);
      expect(calls.download).not.toHaveBeenCalled();
    });
  it("termo cancelado ou substituído: 409 sem bytes", async () => {
    st.termo = [{ ...termoOk(), status: "cancelado", cancelado_em: "x" }];
    const a = await call({ termo_id: TERMO, action: "download" });
    expect(a.status).toBe(409); expect((await a.json()).error).toBe("termo_cancelado");
    st.termo = [termoOk()]; st.sucessor = [{ id: "S" }];
    const b = await call({ termo_id: TERMO, action: "download" });
    expect(b.status).toBe(409); expect((await b.json()).error).toBe("termo_substituido");
    expect(calls.download).not.toHaveBeenCalled();
  });
  it("hash divergente: 409 e nenhum byte", async () => {
    st.bytes = new TextEncoder().encode("%PDF-adulterado");
    const r = await call({ termo_id: TERMO, action: "download" });
    expect(r.status).toBe(409); expect((await r.json()).error).toBe("pdf_hash_divergente");
  });
  it("PDF sem hash registrado falha fechado", async () => {
    st.termo = [{ ...termoOk(), pdf_hash: null }];
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(409);
    expect(calls.download).not.toHaveBeenCalled();
  });
  it("revogação de acesso durante o download: re-prova nega a resposta", async () => {
    st.visivel = [{ id: TERMO }, null];
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(403);
  });
  it("perfil desativado durante o download: 403", async () => {
    st.perfil = [st.perfil[0], { ...st.perfil[0], ativo: false }];
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(403);
  });
  it("termo cancelado/substituído durante o download: 409", async () => {
    st.termo = [termoOk(), { ...termoOk(), status: "cancelado", cancelado_em: "x" }];
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(409);
    st.termo = [termoOk()]; st.sucessor = [null, { id: "S" }];
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(409);
  });
  it("PDF trocado durante o download: 409 termo_alterado", async () => {
    st.termo = [termoOk(), { ...termoOk(), pdf_path: `${ENT}/${TERMO}/v2/termo-55555555-5555-4555-8555-555555555555.pdf` }];
    const r = await call({ termo_id: TERMO, action: "download" });
    expect(r.status).toBe(409); expect((await r.json()).error).toBe("termo_alterado");
  });
  it.each([
    ["entrega de B", () => { st.entrega = [{ id: ENT, organization_id: "OB", cliente_id: "C" }]; }],
    ["cliente de B", () => { st.cliente = [{ id: "C", organization_id: "OB" }]; }],
    ["entrega sem cliente", () => { st.entrega = [{ id: ENT, organization_id: "OA", cliente_id: null }]; }],
    ["entrega inexistente", () => { st.entrega = [null]; }],
    ["tenant canônico ≠ perfil", () => { st.actorOrg = ["OB"]; }],
    ["tenant canônico ausente", () => { st.actorOrg = [null]; }],
  ])("staff A visível sob RLS contra termo de B (%s): 403 antes do Storage", async (_n, set) => {
    set();
    const r = await call({ termo_id: TERMO, action: "download" });
    expect(r.status).toBe(403); expect((await r.json()).error).toBe("acesso_negado");
    expect(calls.download).not.toHaveBeenCalled(); expect(calls.sign).not.toHaveBeenCalled();
  });
  it("termo cancelado de B responde 403, sem revelar status", async () => {
    st.entrega = [{ id: ENT, organization_id: "OB", cliente_id: "C" }];
    st.termo = [{ ...termoOk(), status: "cancelado", cancelado_em: "x" }];
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(403);
  });
  it("tenant muda durante o download: re-prova nega os bytes", async () => {
    st.actorOrg = ["OA", "OB"];
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(403);
    st.actorOrg = ["OA"]; st.entrega = [{ id: ENT, organization_id: "OA", cliente_id: "C" }, { id: ENT, organization_id: "OB", cliente_id: "C" }];
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(403);
  });
  it("generate de termo de B: 403 sem upload, registro ou evento", async () => {
    st.termo = [{ ...termoOk(), pdf_path: null, snapshot: {} }];
    st.entrega = [{ id: ENT, organization_id: "OB", cliente_id: "C" }];
    expect((await call({ termo_id: TERMO, action: "generate" })).status).toBe(403);
    expect(calls.upload).not.toHaveBeenCalled(); expect(calls.rpc).not.toHaveBeenCalled(); expect(calls.download).not.toHaveBeenCalled();
  });
  it("generate replay idempotente preservado, sem evento", async () => {
    st.termo = [{ ...termoOk(), snapshot: {} }];
    const r = await call({ termo_id: TERMO, action: "generate" });
    expect(await r.json()).toMatchObject({ replay: true, pdf_hash: HASH });
    expect(calls.upload).not.toHaveBeenCalled(); expect(calls.rpc).not.toHaveBeenCalled();
  });
  it("bytes vêm de transporte abortável do Storage autenticado, nunca de /sign", async () => {
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(200);
    const [url, init] = calls.download.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/storage/v1/object/authenticated/entrega-termos/");
    expect(url).not.toContain("/sign/");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(calls.legacyDownload).not.toHaveBeenCalled();
  });
  it("pdf_path fora do formato do termo (outra entrega/termo): 409 sem Storage", async () => {
    st.termo = [{ ...termoOk(), pdf_path: `22222222-2222-4222-8222-222222222222/${TERMO}/v2/termo-44444444-4444-4444-8444-444444444444.pdf` }];
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(409);
    st.termo = [{ ...termoOk(), pdf_path: "../x.pdf" }];
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(409);
    expect(calls.download).not.toHaveBeenCalled();
  });
  it("Storage que NUNCA responde e ignora o abort: 504 no prazo, sinal abortado", async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    st.fetchImpl = (_u, init) => { seen = init.signal ?? undefined; return new Promise<Response>(() => {}); };
    const p = call({ termo_id: TERMO, action: "download" });
    await vi.advanceTimersByTimeAsync(15_001);
    const r = await p;
    expect(r.status).toBe(504); expect(seen?.aborted).toBe(true);
    expect(r.headers.get("Content-Type")).not.toBe("application/pdf");
  });
  it("consulta pendurada (tenant canônico nunca resolve): 504, sem Storage", async () => {
    vi.useFakeTimers();
    st.actorOrg = ["PENDING"];
    const p = call({ termo_id: TERMO, action: "download" });
    await vi.advanceTimersByTimeAsync(15_001);
    expect((await p).status).toBe(504);
    expect(calls.download).not.toHaveBeenCalled();
  });
  it("Auth pendurado: 504 sem consultar termo nem Storage", async () => {
    vi.useFakeTimers();
    st.authPending = true;
    const p = call({ termo_id: TERMO, action: "download" });
    await vi.advanceTimersByTimeAsync(15_001);
    expect((await p).status).toBe(504);
    expect(calls.download).not.toHaveBeenCalled();
  });
  it("stream que para no meio sem terminar: 504, bytes descartados", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    st.fetchImpl = async () => new Response(new ReadableStream({
      start(c) { c.enqueue(BYTES.slice(0, 4)); }, cancel() { cancelled = true; },
    }), { status: 200 });
    const p = call({ termo_id: TERMO, action: "download" });
    await vi.advanceTimersByTimeAsync(15_001);
    expect((await p).status).toBe(504); expect(cancelled).toBe(true);
  });
  it("Content-Length acima do limite: 413 sem ler o corpo", async () => {
    let pulled = false;
    st.fetchImpl = async () => new Response(new ReadableStream({ pull(c) { pulled = true; c.enqueue(new Uint8Array(1)); } }, { highWaterMark: 0 }),
      { status: 200, headers: { "content-length": String(16 * 1024 * 1024) } });
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(413);
    expect(pulled).toBe(false);
  });
  it("stream sem Content-Length que excede o limite: 413 e cancelamento antes de acumular tudo", async () => {
    let sent = 0, cancelled = false;
    const chunk = new Uint8Array(1024 * 1024);
    st.fetchImpl = async () => new Response(new ReadableStream({
      pull(c) { sent += chunk.byteLength; c.enqueue(chunk); }, cancel() { cancelled = true; },
    }), { status: 200 });
    expect((await call({ termo_id: TERMO, action: "download" })).status).toBe(413);
    expect(cancelled).toBe(true); expect(sent).toBeLessThanOrEqual(18 * 1024 * 1024);
  });
});

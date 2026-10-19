import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";

// Edge candidata real (transpilada), com SDK/Storage falsos. Não é homologação JWT/RLS.
const SRC = "supabase/functions/entrega-termo-pdf/index.ts";
const TERMO = "33333333-3333-4333-8333-333333333333";
const BYTES = new TextEncoder().encode("%PDF-1.7 termo assinado");
const HASH = createHash("sha256").update(BYTES).digest("hex");
type Row = Record<string, unknown> | null;
type Handler = (req: Request) => Promise<Response>;

let st: {
  user: string | null; perfil: Row[]; visivel: Row[]; termo: Row[]; sucessor: Row[];
  bytes: Uint8Array; onDownload?: () => void;
};
const calls = { download: vi.fn(), sign: vi.fn(), rpc: vi.fn(), upload: vi.fn() };
const next = (q: Row[]) => (q.length > 1 ? q.shift()! : q[0]);

function client(kind: "user" | "admin") {
  return {
    auth: { getUser: async () => (st.user ? { data: { user: { id: st.user } }, error: null } : { data: { user: null }, error: new Error("x") }) },
    from: (table: string) => {
      const f: Record<string, unknown> = {};
      const q: Record<string, unknown> = {};
      for (const m of ["select", "limit", "order"]) q[m] = () => q;
      q.eq = (c: string, v: unknown) => { f[c] = v; return q; };
      q.maybeSingle = async () => {
        if (table === "profiles") return { data: next(st.perfil), error: null };
        if (kind === "user") return { data: next(st.visivel), error: null };
        if ("substitui_termo_id" in f) return { data: next(st.sucessor), error: null };
        return { data: next(st.termo), error: null };
      };
      return q;
    },
    rpc: async (...a: unknown[]) => { calls.rpc(...a); return { data: null, error: null }; },
    storage: { from: () => ({
      download: async (p: string) => { calls.download(p); st.onDownload?.(); return { data: new Blob([st.bytes]), error: null }; },
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
const termoOk = () => ({ id: TERMO, entrega_id: "E", versao: 2, status: "assinado", cancelado_em: null, assinado_em: "2026-10-19", pdf_path: "E/T/v2/termo-x.pdf", pdf_hash: HASH });

beforeEach(() => {
  Object.values(calls).forEach((c) => c.mockReset());
  st = { user: "U", perfil: [{ user_id: "U", ativo: true, senha_provisoria: false, organization_id: "OA" }],
    visivel: [{ id: TERMO }], termo: [termoOk()], sucessor: [null], bytes: BYTES };
});

describe("entrega-termo-pdf candidata: download binário autenticado", () => {
  it("serve os bytes verificados por hash, sem assinar URL nem publicar evento", async () => {
    const r = await call({ termo_id: TERMO, action: "download" });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(BYTES);
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
    st.termo = [termoOk(), { ...termoOk(), pdf_path: "E/T/v2/outro.pdf" }];
    const r = await call({ termo_id: TERMO, action: "download" });
    expect(r.status).toBe(409); expect((await r.json()).error).toBe("termo_alterado");
  });
  it("generate replay idempotente preservado, sem evento", async () => {
    st.termo = [{ ...termoOk(), snapshot: {} }];
    const r = await call({ termo_id: TERMO, action: "generate" });
    expect(await r.json()).toMatchObject({ replay: true, pdf_hash: HASH });
    expect(calls.upload).not.toHaveBeenCalled(); expect(calls.rpc).not.toHaveBeenCalled();
  });
});

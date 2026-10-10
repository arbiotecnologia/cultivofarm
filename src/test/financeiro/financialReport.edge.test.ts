import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { execFileSync } from "node:child_process";
import * as XLSX from "xlsx";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../../../supabase/functions/_shared/comunicacao/cors";

// Real entrypoint; SDK/env/PDF mocked, XLSX serializes and reads real local bytes. No network.
const source = readFileSync("supabase/functions/generate-financial-report/index.ts", "utf8")
  .replace(/^import .*;\s*/gm, "").replace(/^export /gm, "");
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const sentinel = "private-error-path-sentinel";
const org = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const auditId = "33333333-3333-4333-8333-333333333333";
type Failure = "auth" | "noUser" | "org" | "noOrg" | "rpc" | "upload" | "noUploadData" | "noUploadPath" | "wrongUploadPath" | "sign" | "noUrl" | "audit" | "noId";
type Result = { data?: unknown; error: unknown };
function deferred() {
  let resolve: (value: Result) => void = () => {};
  const promise = new Promise<Result>((done) => { resolve = done; });
  return { promise, resolve };
}
function setup(failure?: Failure, auditPending?: ReturnType<typeof deferred>, throws?: string, options: { rows?: unknown[]; fontFailure?: boolean; pdfBytes?: Uint8Array; xlsxBytes?: Uint8Array } = {}) {
  const effects: string[] = [];
  const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) => {
    effects.push(name); if (throws === name) throw new Error(sentinel);
    if (name === "h15_actor_organization") return { data: failure === "noOrg" ? null : org, error: failure === "org" ? sentinel : null };
    if (name === "register_financial_report_export") return auditPending?.promise ?? { data: failure === "noId" ? null : auditId, error: failure === "audit" ? sentinel : null };
    return { data: options.rows ?? [{ amount: 40 }], error: failure === "rpc" ? sentinel : null };
  });
  const upload = vi.fn(async (path: string, _bytes: Uint8Array) => {
    effects.push("upload"); if (throws === "upload") throw new Error(sentinel);
    return {
      data: failure === "noUploadData" ? null : failure === "noUploadPath" ? {} : { path: failure === "wrongUploadPath" ? "different-private-path" : path },
      error: failure === "upload" ? sentinel : null,
    };
  });
  const createSignedUrl = vi.fn(async () => {
    effects.push("sign"); if (throws === "sign") throw new Error(sentinel);
    return { data: failure === "noUrl" ? {} : { signedUrl: "signed-file-fixture" }, error: failure === "sign" ? sentinel : null };
  });
  const remove = vi.fn();
  const getUser = vi.fn(async () => {
    effects.push("auth"); if (throws === "auth") throw new Error(sentinel);
    return { data: { user: failure === "noUser" ? null : { id: actor } }, error: failure === "auth" ? sentinel : null };
  });
  const createClient = vi.fn(() => ({ auth: { getUser }, rpc, storage: { from: vi.fn(() => ({ upload, createSignedUrl, remove })) } }));
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const env = vi.fn((name: string): string | undefined => name === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : name === "SUPABASE_ANON_KEY" ? "mock-public-key" : undefined);
  const deno = { env: { get: env }, serve: (fn: typeof handler) => { handler = fn; } };
  const log = vi.fn();
  const pages: Array<{ drawText: ReturnType<typeof vi.fn> }> = [];
  const widthOfTextAtSize = vi.fn((text: string, size: number) => {
    if (options.fontFailure || text.includes("🧪")) throw new Error(sentinel);
    return [...text].reduce((width, char) => width + (char === "W" ? size : size / 2), 0);
  });
  const PDFDocument = { create: async () => ({
    embedFont: async () => ({ widthOfTextAtSize }),
    addPage: () => { const page = { drawText: vi.fn() }; pages.push(page); return page; },
    save: async () => options.pdfBytes ?? new Uint8Array([1]),
  }) };
  const spreadsheet = options.xlsxBytes ? { ...XLSX, write: () => options.xlsxBytes } : XLSX;
  new Function("Deno", "createClient", "PDFDocument", "StandardFonts", "rgb", "XLSX", "corsHeadersFor", "handlePreflight", "isTrustedOrigin", "console", javascript)(
    deno, createClient, PDFDocument, { Helvetica: "font", HelveticaBold: "bold" }, () => ({}), spreadsheet, corsHeadersFor, handlePreflight, isTrustedOrigin, { error: log, log, warn: log },
  );
  if (!handler) throw new Error("handler_not_registered");
  const invoke = (body: unknown = {}, method = "POST", origin = "https://app.cultivofarm.com.br", raw?: string) => handler(new Request("https://isolated.invalid", {
    method, headers: { Origin: origin, Authorization: "Bearer mock-caller", "Content-Type": "application/json" },
    ...(method === "GET" || method === "OPTIONS" ? {} : { body: raw ?? JSON.stringify(body) }),
  }));
  return { invoke, rpc, upload, createSignedUrl, remove, effects, createClient, env, log, pages, widthOfTextAtSize };
}
const valid = { report_type: "monthly", filters: { _from: "2026-10-01", _to: "2026-10-09" }, format: "CSV", title: "Mensal" };
async function failureResponse(response: Response, status: number) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(body).not.toHaveProperty("url"); expect(body).not.toHaveProperty("path");
  expect(JSON.stringify(body)).not.toContain(sentinel);
  expect(JSON.stringify(body)).not.toContain(org);
  expect(JSON.stringify(body)).not.toContain("signed-file-fixture");
}
describe("generate-financial-report — handler real isolado", () => {
  for (const failure of ["auth", "noUser", "org", "noOrg", "rpc", "upload", "noUploadData", "noUploadPath", "wrongUploadPath", "sign", "noUrl", "audit", "noId"] as const) {
    it(`nega sucesso em ${failure} e interrompe efeitos`, async () => {
      const s = setup(failure); await failureResponse(await s.invoke(valid), ["auth", "noUser"].includes(failure) ? 401 : ["org", "noOrg"].includes(failure) ? 403 : 500);
      expect(s.remove).not.toHaveBeenCalled();
      if (["auth", "noUser", "org", "noOrg", "rpc"].includes(failure)) expect(s.upload).not.toHaveBeenCalled();
      if (["upload", "noUploadData", "noUploadPath", "wrongUploadPath"].includes(failure)) {
        expect(s.createSignedUrl).not.toHaveBeenCalled();
        expect(s.rpc.mock.calls.some(([name]) => name === "register_financial_report_export")).toBe(false);
      }
      if (["sign", "noUrl"].includes(failure)) expect(s.rpc.mock.calls.some(([name]) => name === "register_financial_report_export")).toBe(false);
      expect(s.log).not.toHaveBeenCalled();
    });
  }
  for (const stage of ["auth", "h15_actor_organization", "get_report_monthly_financial", "upload", "sign", "register_financial_report_export"]) {
    it(`sanitiza exceção em ${stage}`, async () => {
      const s = setup(undefined, undefined, stage); await failureResponse(await s.invoke(valid), 500); expect(s.remove).not.toHaveBeenCalled();
    });
  }
  it.each(["GET", "PUT", "DELETE"])("rejeita método %s antes de efeitos", async (method) => {
    const s = setup(); await failureResponse(await s.invoke(valid, method), 405); expect(s.createClient).not.toHaveBeenCalled();
  });
  const invalid: unknown[] = [null, [], "text", 42, {}, { ...valid, filters: [] }, { ...valid, filters: null },
    { ...valid, filters: "text" }, { ...valid, title: 42 }, { ...valid, title: "x".repeat(256) },
    ...["pdf", "csv", "TXT", "", null, 42].map((format) => ({ ...valid, format })),
    ...["constructor", "toString", "__proto__", "unknown", null, 42].map((report_type) => ({ ...valid, report_type })),
    ...["organization_id", "tenant_id"].flatMap((key) => [{ ...valid, [key]: org }, { ...valid, filters: { ...valid.filters, [key]: org } }]),
  ];
  it.each(invalid.map((body, index) => ({ body, index })))("rejeita payload $index antes RPC/Storage", async ({ body }) => {
    const s = setup(); await failureResponse(await s.invoke(body), 400); expect(s.rpc).not.toHaveBeenCalled(); expect(s.upload).not.toHaveBeenCalled();
  });
  it("JSON malformado retorna400 sem efeitos", async () => {
    const s = setup(); await failureResponse(await s.invoke(valid, "POST", undefined, "{"), 400); expect(s.rpc).not.toHaveBeenCalled();
  });
  for (const key of ["organization_id", "tenant_id"]) {
    for (const container of ["_filters", "_scope"]) {
      for (const inArray of [false, true]) {
        it(`rejeita ${key} aninhado em ${container}, array=${inArray}`, async () => {
          const nested = { branch: { [key]: org } };
          const s = setup();
          await failureResponse(await s.invoke({ ...valid, filters: { [container]: inArray ? [{ safe: 1 }, nested] : nested } }), 400);
          expect(s.rpc).not.toHaveBeenCalled(); expect(s.upload).not.toHaveBeenCalled();
        });
      }
    }
    it(`rejeita ${key} profundamente aninhado entre objetos/arrays`, async () => {
      let nested: unknown = { [key]: org };
      for (let i = 0; i < 50; i++) nested = i % 2 ? { branch: nested } : [nested];
      const s = setup();
      await failureResponse(await s.invoke({ ...valid, filters: { _filters: nested } }), 400);
      expect(s.rpc).not.toHaveBeenCalled(); expect(s.upload).not.toHaveBeenCalled();
    });
  }
  it("limita profundidade excessiva sem recursão ou efeitos", async () => {
    let nested: unknown = { safe: true };
    for (let i = 0; i < 1000; i++) nested = [nested];
    const s = setup();
    await failureResponse(await s.invoke({ ...valid, filters: { _scope: nested } }), 400);
    expect(s.rpc).not.toHaveBeenCalled(); expect(s.upload).not.toHaveBeenCalled();
  });
  it("limita orçamento de travessia ampla antes de efeitos", async () => {
    const s = setup();
    await failureResponse(await s.invoke({ ...valid, filters: { _filters: Array.from({ length: 10001 }, () => null) } }), 400);
    expect(s.rpc).not.toHaveBeenCalled(); expect(s.upload).not.toHaveBeenCalled();
  });
  it.each(["_filters", "_scope"])("preserva contrato válido %s no RPC e histórico", async (container) => {
    const filters = { ...valid.filters, [container]: { branches: [{ active: true, ids: ["fixture-1", "fixture-2"] }, null], label: "tenant_id não é chave" } };
    const s = setup(); const response = await s.invoke({ ...valid, filters });
    expect(response.status).toBe(200);
    expect(s.rpc).toHaveBeenNthCalledWith(2, "get_report_monthly_financial", filters);
    expect(s.rpc.mock.calls[2][1]).toMatchObject({ p_filters: filters });
  });
  it("preserva filtro válido com objetos/arrays dentro do limite de profundidade", async () => {
    let nested: unknown = { safe: true };
    for (let i = 0; i < 60; i++) nested = i % 2 ? { branch: nested } : [nested];
    const filters = { _scope: nested }, s = setup();
    expect((await s.invoke({ ...valid, filters })).status).toBe(200);
    expect(s.rpc).toHaveBeenNthCalledWith(2, "get_report_monthly_financial", filters);
    expect(s.rpc.mock.calls[2][1]).toMatchObject({ p_filters: filters });
  });
  it.each([undefined, "https://wrong-project.invalid"])("fail-closed se ref canônico ausente/divergente %s", async (url) => {
    const s = setup(); s.env.mockImplementation((name: string) => name === "SUPABASE_URL" ? url : "mock-public-key");
    await failureResponse(await s.invoke(valid), 500); expect(s.createClient).not.toHaveBeenCalled(); expect(s.rpc).not.toHaveBeenCalled();
  });
  it("sem chave anon não cria cliente ou efeitos", async () => {
    const s = setup(); s.env.mockImplementation((name: string) => name === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : undefined);
    await failureResponse(await s.invoke(valid), 500); expect(s.createClient).not.toHaveBeenCalled();
  });
  it("preserva CORS confiável e bloqueia origem estranha/preflight", async () => {
    const s = setup(); const preflight = await s.invoke({}, "OPTIONS"); expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("https://app.cultivofarm.com.br");
    await preflight.text();
    const denied = await s.invoke(valid, "POST", "https://foreign.invalid"); await failureResponse(denied, 403);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull(); expect(s.createClient).not.toHaveBeenCalled();
  });
  it.each(["PDF", "XLSX", "CSV"])("sucesso %s somente após upload/assinatura/audit e usa caller", async (format) => {
    const s = setup(); const response = await s.invoke({ ...valid, format }); expect(response.status).toBe(200);
    expect((await response.json()).url).toBe("signed-file-fixture");
    expect(s.effects).toEqual(["auth", "h15_actor_organization", "get_report_monthly_financial", "upload", "sign", "register_financial_report_export"]);
    expect(s.createClient).toHaveBeenCalledWith("https://swzpzcwiasxmjutrmvkm.supabase.co", "mock-public-key", { global: { headers: { Authorization: "Bearer mock-caller" } } });
    expect(s.rpc).toHaveBeenNthCalledWith(2, "get_report_monthly_financial", valid.filters);
    expect(s.rpc.mock.calls[2][1]).toMatchObject({ p_status: "SUCCESS", p_filters: valid.filters });
    expect(s.env).not.toHaveBeenCalledWith("SUPABASE_SERVICE_ROLE_KEY"); expect(s.remove).not.toHaveBeenCalled();
  });
  it("não devolve URL enquanto auditoria está pendente", async () => {
    const pending = deferred(), s = setup(undefined, pending); let returned = false;
    const response = s.invoke(valid).then((r) => { returned = true; return r; });
    await vi.waitFor(() => expect(s.effects).toContain("register_financial_report_export"));
    expect(returned).toBe(false); expect(s.effects.indexOf("sign")).toBeLessThan(s.effects.indexOf("register_financial_report_export"));
    pending.resolve({ data: auditId, error: null }); expect((await (await response).json()).url).toBe("signed-file-fixture");
  });
  const parseCSV = (s: ReturnType<typeof setup>): string[][] => JSON.parse(execFileSync(process.env.PYTHON ?? "python3", ["-c", "import csv,io,json,sys; print(json.dumps(list(csv.reader(io.StringIO(sys.stdin.read(),newline='')))))"], { input: s.upload.mock.calls[0][1], encoding: "utf8" }));
  it("CSV roundtrip preserva aspas, vírgulas, quebras reais, objetos/arrays e união de colunas", async () => {
    const s = setup(undefined, undefined, undefined, { rows: [{ 'a,"b': 'texto,"aspas"\nlinha\r\nfinal', nested: { x: [1, "dois"] } }, { later: [false, null, 3], 'a,"b': "" }] });
    expect((await s.invoke(valid)).status).toBe(200);
    expect(parseCSV(s)).toEqual([['a,"b', "nested", "later"], ['texto,"aspas"\nlinha\r\nfinal', '{"x":[1,"dois"]}', ""], ["", "", '[false,null,3]']]);
  });
  it.each(["=1+1", "+SUM(1)", "-1+2", "@cmd", "\ttext", "\rtext", "\ntext", "  =1+1", "  \ttext", " \n=1"])("CSV neutraliza string e cabeçalho %j", async (value) => {
    const s = setup(undefined, undefined, undefined, { rows: [{ [value]: value, numeric: -42.5 }] });
    expect((await s.invoke(valid)).status).toBe(200);
    expect(parseCSV(s)).toEqual([["'" + value, "numeric"], ["'" + value, "-42.5"]]);
  });
  it("PDF100 registros inclui último e todos os campos em páginas numeradas", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ item: `ITEM-${i + 1}`, ...(i === 99 ? { extra: { last: "ULTIMO" } } : {}) }));
    const s = setup(undefined, undefined, undefined, { rows });
    expect((await s.invoke({ ...valid, format: "PDF" })).status).toBe(200);
    const texts = s.pages.flatMap((p) => p.drawText.mock.calls.map(([text]) => String(text)));
    expect(texts).toContain("item: ITEM-100"); expect(texts).toContain('extra: {"last":"ULTIMO"}');
    expect(texts.filter((t) => /^Registro \d+ de 100$/.test(t))).toHaveLength(100);
    expect(s.pages.length).toBeGreaterThan(1);
    s.pages.forEach((p, i) => expect(p.drawText.mock.calls.some(([text]) => text === `AR Bio • 100 registro(s) • Página ${i + 1} de ${s.pages.length}`)).toBe(true));
  });
  it("PDF quebra texto pela largura da fonte sem perder caracteres ou quebras", async () => {
    const value = "W".repeat(400) + "\nsegunda linha", s = setup(undefined, undefined, undefined, { rows: [{ field: value }] });
    expect((await s.invoke({ ...valid, format: "PDF" })).status).toBe(200);
    const calls = s.pages.flatMap((p) => p.drawText.mock.calls);
    const start = calls.findIndex(([text]) => String(text).startsWith("field: "));
    const content = calls.slice(start).filter(([text]) => !String(text).startsWith("AR Bio"));
    expect(content.map(([text]) => text).join("")).toBe("field: " + value.replace("\n", ""));
    for (const [text, style] of calls) expect(s.widthOfTextAtSize(String(text), style.size)).toBeLessThanOrEqual(515);
  });
  it.each(["CSV", "PDF"])("%s vazio tem contagem verdadeira", async (format) => {
    const s = setup(undefined, undefined, undefined, { rows: [] });
    const response = await s.invoke({ ...valid, format }); expect(response.status).toBe(200); expect((await response.json()).row_count).toBe(0);
    if (format === "CSV") expect(parseCSV(s)).toEqual([]);
    else expect(s.pages[0].drawText.mock.calls.some(([text]) => text === "Nenhum dado encontrado.")).toBe(true);
  });
  it.each([true, false])("PDF fonte falha/char incompatível bloqueia upload %s", async (fontFailure) => {
    const s = setup(undefined, undefined, undefined, { fontFailure, rows: [{ text: "🧪" }] });
    await failureResponse(await s.invoke({ ...valid, format: "PDF" }), 500); expect(s.upload).not.toHaveBeenCalled();
  });
  it.each(["CSV", "PDF"])("%s limita1000 registros sem truncar/upload", async (format) => {
    const s = setup(undefined, undefined, undefined, { rows: Array.from({ length: 1001 }, () => ({ amount: 1 })) });
    await failureResponse(await s.invoke({ ...valid, format }), 500); expect(s.upload).not.toHaveBeenCalled();
  });
  it("PDF limita100 páginas sem upload", async () => {
    const s = setup(undefined, undefined, undefined, { rows: [{ text: "line\n".repeat(6000) }] });
    await failureResponse(await s.invoke({ ...valid, format: "PDF" }), 500); expect(s.upload).not.toHaveBeenCalled();
  });
  it("PDF limita5MiB de bytes finais antes upload", async () => {
    const s = setup(undefined, undefined, undefined, { pdfBytes: new Uint8Array(5 * 1024 * 1024 + 1) });
    await failureResponse(await s.invoke({ ...valid, format: "PDF" }), 500); expect(s.upload).not.toHaveBeenCalled();
  });
  it.each(["CSV", "PDF"])("%s aceita exatamente1000 registros sem omitir último", async (format) => {
    const s = setup(undefined, undefined, undefined, { rows: Array.from({ length: 1000 }, (_, i) => ({ item: `ID-${i + 1}` })) });
    const response = await s.invoke({ ...valid, format }); expect(response.status).toBe(200);
    expect((await response.json()).row_count).toBe(1000);
    if (format === "CSV") expect(parseCSV(s).at(-1)).toEqual(["ID-1000"]);
    else expect(s.pages.flatMap((p) => p.drawText.mock.calls.map(([text]) => text))).toContain("item: ID-1000");
  });
  it.each(["title", "header", "nested"])("PDF caractere incompatível em %s impede upload", async (where) => {
    const rows = where === "header" ? [{ "🧪": 1 }] : where === "nested" ? [{ nested: { text: "🧪" } }] : [{ item: 1 }];
    const s = setup(undefined, undefined, undefined, { rows });
    await failureResponse(await s.invoke({ ...valid, format: "PDF", ...(where === "title" ? { title: "🧪" } : {}) }), 500);
    expect(s.upload).not.toHaveBeenCalled(); expect(s.createSignedUrl).not.toHaveBeenCalled();
  });
  it("CSV limita conteúdo UTF8 antes upload", async () => {
    const s = setup(undefined, undefined, undefined, { rows: [{ text: "x".repeat(1024 * 1024 + 1) }] });
    await failureResponse(await s.invoke(valid), 500); expect(s.upload).not.toHaveBeenCalled();
  });
  const readXLSX = (s: ReturnType<typeof setup>) => XLSX.read(s.upload.mock.calls[0][1], { type: "array" });
  it("XLSX real serialize/read preserva primitivos/JSON, união e cabeçalhos adversos sem fórmulas", async () => {
    const rows = [JSON.parse('{"__proto__":"=1+1","constructor":"+cmd","=header":"@cmd","valor":{"f":"1+1","t":"n"},"periodo":{"from":"2026-10-01","to":"2026-10-09"},"number":-42.5,"boolean":true,"empty":null,"array":[1,{"f":"2+2"}]}'), { last: "ULTIMO" }];
    const s = setup(undefined, undefined, undefined, { rows });
    expect((await s.invoke({ ...valid, format: "XLSX" })).status).toBe(200);
    const wb = readXLSX(s), ws = wb.Sheets[wb.SheetNames[0]];
    expect(XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })).toEqual([
      ["__proto__", "constructor", "=header", "valor", "periodo", "number", "boolean", "empty", "array", "last"],
      ["=1+1", "+cmd", "@cmd", '{"f":"1+1","t":"n"}', '{"from":"2026-10-01","to":"2026-10-09"}', -42.5, true, null, '[1,{"f":"2+2"}]', null],
      [null, null, null, null, null, null, null, null, null, "ULTIMO"],
    ]);
    expect(ws.F2).toMatchObject({ t: "n", v: -42.5 }); expect(ws.G2).toMatchObject({ t: "b", v: true });
    for (const [address, cell] of Object.entries(ws)) if (!address.startsWith("!")) expect(cell).not.toHaveProperty("f");
    for (const address of ["A1", "B1", "C1", "A2", "B2", "C2", "D2", "E2", "I2"]) expect(ws[address].t).toBe("s");
    expect(Object.prototype).not.toHaveProperty("f");
  });
  it.each(["=1+1", "+SUM(1)", "-1+2", "@cmd", "  =1+1", "\ttext", "\rtext", "\ntext"])("XLSX real mantém string literal %j", async (text) => {
    const s = setup(undefined, undefined, undefined, { rows: [{ [text]: text }] });
    expect((await s.invoke({ ...valid, format: "XLSX" })).status).toBe(200);
    const wb = readXLSX(s), ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws.A1).toMatchObject({ t: "s", v: text }); expect(ws.A2).toMatchObject({ t: "s", v: text });
    expect(ws.A1).not.toHaveProperty("f"); expect(ws.A2).not.toHaveProperty("f");
  });
  it.each(["[]:*?/\\", "", "'", "'Mensal'", "x".repeat(255), "Mensal válido"])("XLSX real usa nome de aba seguro %j", async (title) => {
    const s = setup(); expect((await s.invoke({ ...valid, format: "XLSX", title })).status).toBe(200);
    const name = readXLSX(s).SheetNames[0];
    expect(name.length).toBeGreaterThan(0); expect(name.length).toBeLessThanOrEqual(31);
    expect([...name].some((char) => char.charCodeAt(0) < 32 || "[]:*?/\\".includes(char))).toBe(false); expect(name).not.toMatch(/^'|'$/);
    if (["[]:*?/\\", "", "'"].includes(title)) expect(name).toBe("Relatorio");
  });
  it.each([null, 42, "text", []])("XLSX rejeita linha inválida %j antes da união de colunas", async (row) => {
    const s = setup(undefined, undefined, undefined, { rows: [row] });
    await failureResponse(await s.invoke({ ...valid, format: "XLSX" }), 500); expect(s.upload).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -Infinity])("XLSX rejeita número não finito %s", async (number) => {
    const s = setup(undefined, undefined, undefined, { rows: [{ number }] });
    await failureResponse(await s.invoke({ ...valid, format: "XLSX" }), 500); expect(s.upload).not.toHaveBeenCalled();
  });
  it("XLSX real aceita1000 registros e última coluna/registro", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => i === 999 ? { item: i, last: "ULTIMO" } : { item: i });
    const s = setup(undefined, undefined, undefined, { rows }); expect((await s.invoke({ ...valid, format: "XLSX" })).status).toBe(200);
    const wb = readXLSX(s), ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws["!ref"]).toBe("A1:B1001"); expect(ws.B1001).toMatchObject({ t: "s", v: "ULTIMO" });
  });
  it("XLSX real vazio sem registro fictício", async () => {
    const s = setup(undefined, undefined, undefined, { rows: [] }); const response = await s.invoke({ ...valid, format: "XLSX" });
    expect(response.status).toBe(200); expect((await response.json()).row_count).toBe(0);
    const wb = readXLSX(s); expect(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])).toEqual([]);
  });
  it.each(["rows", "content", "bytes"])("XLSX limite %s impede upload/assinatura/histórico", async (limit) => {
    const s = setup(undefined, undefined, undefined, {
      rows: limit === "rows" ? Array.from({ length: 1001 }, () => ({ item: 1 })) : [{ text: limit === "content" ? "x".repeat(1024 * 1024 + 1) : "ok" }],
      ...(limit === "bytes" ? { xlsxBytes: new Uint8Array(5 * 1024 * 1024 + 1) } : {}),
    });
    await failureResponse(await s.invoke({ ...valid, format: "XLSX" }), 500);
    expect(s.upload).not.toHaveBeenCalled(); expect(s.createSignedUrl).not.toHaveBeenCalled();
    expect(s.effects).not.toContain("register_financial_report_export");
  });

});
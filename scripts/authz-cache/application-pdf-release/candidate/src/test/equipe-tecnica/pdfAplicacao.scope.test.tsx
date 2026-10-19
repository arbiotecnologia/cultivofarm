import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";

const fake = vi.hoisted(() => ({ uid: "actor", tenant: "007bb519-cba0-4704-be2c-cb93ad010048", epoch: 0, roles: ["administrador"], ready: true,
  check: (): boolean => true, query: vi.fn(), download: vi.fn(), edge: vi.fn(), success: vi.fn(), error: vi.fn(), saves: vi.fn(), signals: [] as AbortSignal[] }));
vi.mock("jspdf", async original => {
  const actual = await original<typeof import("jspdf")>();
  return { ...actual, default: function (...args: ConstructorParameters<typeof actual.default>) {
    const doc = new actual.default(...args); doc.save = fake.saves; return doc;
  } };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "admin", user: { id: fake.uid }, profile: { user_id: fake.uid, organization_id: fake.tenant, ativo: true }, roles: fake.roles,
  loading: false, authzReady: fake.ready, authzEpoch: fake.epoch, checkAuthzAccess: () => fake.check() }) }));
vi.mock("@/integrations/supabase/client", () => ({ SUPABASE_URL: "https://swzpzcwiasxmjutrmvkm.supabase.co", supabase: {
  from: (table: string) => { const q: any = { then: (resolve: any, reject: any) => fake.query(table).then(resolve, reject) };
    for (const m of ["select", "eq", "filter", "order", "limit"]) q[m] = () => q;
    q.abortSignal = (signal: AbortSignal) => { fake.signals.push(signal); return q; };
    q.maybeSingle = () => fake.query(table); return q; },
  functions: { invoke: (...args: any[]) => fake.edge(...args) },
} }));
vi.mock("@/lib/authz/authenticatedAttachment", async original => ({ ...await original<typeof import("@/lib/authz/authenticatedAttachment")>(), downloadAuthenticatedAttachment: (...args: any[]) => fake.download(...args) }));
vi.mock("sonner", () => ({ toast: { success: fake.success, error: fake.error } }));
vi.mock("@/components/aplicacao/AplicacaoFormDialog", () => ({ AplicacaoFormDialog: () => null }));
vi.mock("@/components/aplicacao/EvidenciasGallery", () => ({ EvidenciasGallery: () => null }));

import { AplicacaoCard } from "@/components/aplicacao/AplicacaoCard";
import { aplicacaoEvidencePath, aplicacaoLogoPath, generateAplicacaoPdf, saveAplicacaoPdf, awaitAplicacaoPdf, type AplicacaoPdfAccess } from "@/lib/pdfAplicacao";
const APP = "00000000-0000-4000-8000-000000000001";
const ORIGIN = "00000000-0000-4000-8000-000000000002";
const CLIENT = "00000000-0000-4000-8000-000000000003";
const app = { id: APP, data_aplicacao: "2026-10-19", is_latest: true, os: { fazendas: { nome: "Fazenda teste" }, talhoes: { nome: "Talhão teste" } } };
const evidence = { tipo: "foto", storage_path: `${CLIENT}/${ORIGIN}/foto.png`, aplicacao_id: ORIGIN, versao_origem_id: ORIGIN, legenda: "Evidência herdada" };
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALUlEQVR4nGM0avJmoCVgoqnpoxaMWjBqwagFoxaMWjBqwagFoxaMWjBqARUBAKKsAT8I4F0iAAAAAElFTkSuQmCC"), c => c.charCodeAt(0));
function deferred() { let resolve: (v: any) => void = () => {}; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; }
function fence(): AplicacaoPdfAccess { return { current: () => fake.check(), signal: new AbortController().signal, applicationId: APP, tenantId: fake.tenant }; }
beforeEach(() => {
  Object.assign(fake, { uid: "actor", tenant: "007bb519-cba0-4704-be2c-cb93ad010048", epoch: 0, roles: ["administrador"], ready: true, check: () => true, signals: [] });
  for (const m of [fake.query, fake.download, fake.edge, fake.success, fake.error, fake.saves]) m.mockReset();
  fake.query.mockImplementation(async table => table === "aplicacoes" ? { data: { id: APP, organization_id: fake.tenant }, error: null } : table === "configuracoes_sistema" ? { data: { nome_empresa: "Cultivo Farm" }, error: null } : { data: [], error: null });
  fake.download.mockResolvedValue(new Blob([png], { type: "image/png" })); fake.edge.mockResolvedValue({ data: { emailSent: false }, error: null });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:application-pdf") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(fake.saves);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe("application PDF authenticated assets", () => {
  it("preserves origin paths of inherited evidence, not the current revision", () => {
    expect(aplicacaoEvidencePath(evidence.storage_path, ORIGIN)).toBe(evidence.storage_path);
    expect(() => aplicacaoEvidencePath(evidence.storage_path, APP)).toThrow();
  });
  it.each(["https://evil.invalid/a.png", `${CLIENT}/${ORIGIN}/../x`, `${CLIENT}/${ORIGIN}/%2e.png`, `${CLIENT}/${ORIGIN}/a\\x.png`, `${CLIENT}/${ORIGIN}/a?x.png`, `${CLIENT}/${ORIGIN}//a.png`])("rejects malformed path %s", path => {
    expect(() => aplicacaoEvidencePath(path, ORIGIN)).toThrow();
  });
  it("extracts only platform logo locator", () => {
    expect(aplicacaoLogoPath("https://swzpzcwiasxmjutrmvkm.supabase.co/storage/v1/object/public/logos/platform/logo-123.png")).toBe("platform/logo-123.png");
    for (const url of ["https://evil.invalid/logo.png", "data:image/png;base64,x", "https://swzpzcwiasxmjutrmvkm.supabase.co/storage/v1/object/sign/logos/platform/a.png", "https://swzpzcwiasxmjutrmvkm.supabase.co/storage/v1/object/public/logos/platform/a.png?x=1"]) expect(() => aplicacaoLogoPath(url)).toThrow();
  });
  it("generates the existing report with authenticated inherited photo and logo", async () => {
    fake.query.mockImplementation(async table => table === "aplicacoes" ? { data: { id: APP, organization_id: fake.tenant } } : { data: [{ evidencia: evidence }] });
    const doc = await generateAplicacaoPdf({ aplicacao: app, empresa: { nome: "Cultivo Farm", logoUrl: "https://swzpzcwiasxmjutrmvkm.supabase.co/storage/v1/object/public/logos/platform/logo-123.png" } }, fence());
    expect(fake.download.mock.calls.map(c => c.slice(0, 2))).toEqual([["logos", "platform/logo-123.png"], ["aplicacao-evidencias", evidence.storage_path]]);
    expect(doc.getNumberOfPages()).toBe(2);
    if (process.env.APPLICATION_PDF_QA === "1") writeFileSync("/tmp/pdf-aplicacao/report.pdf", Buffer.from(doc.output("arraybuffer")));
  });
  it.each(["denied", "foreign", "wrong-id"])("requires current server application read: %s", async kind => {
    fake.query.mockResolvedValue(kind === "denied" ? { error: { message: "denied" } } : { data: { id: kind === "wrong-id" ? ORIGIN : APP, organization_id: kind === "foreign" ? "other" : fake.tenant } });
    await expect(generateAplicacaoPdf({ aplicacao: app, empresa: { nome: "Farm" } }, fence())).rejects.toThrow(); expect(fake.download).not.toHaveBeenCalled();
  });
  it("does not swallow evidence denial and return a partial report", async () => {
    fake.query.mockImplementation(async table => table === "aplicacoes" ? { data: { id: APP, organization_id: fake.tenant } } : { error: { message: "denied" }, data: null });
    await expect(generateAplicacaoPdf({ aplicacao: app, empresa: { nome: "Farm" } }, fence())).rejects.toThrow();
  });
  it("bounds evidence count", async () => {
    fake.query.mockImplementation(async table => table === "aplicacoes" ? { data: { id: APP, organization_id: fake.tenant } } : { data: Array.from({ length: 25 }, () => ({ evidencia: evidence })) });
    await expect(generateAplicacaoPdf({ aplicacao: app, empresa: { nome: "Farm" } }, fence())).rejects.toThrow(); expect(fake.download).not.toHaveBeenCalled();
  });
  it.each(["offline", "oversized"])("rejects authenticated image failure: %s", async reason => {
    fake.query.mockImplementation(async table => table === "aplicacoes" ? { data: { id: APP, organization_id: fake.tenant } } : { data: [{ evidencia: evidence }] });
    if (reason === "offline") fake.download.mockRejectedValue(new Error("offline"));
    else fake.download.mockResolvedValue(new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]));
    await expect(generateAplicacaoPdf({ aplicacao: app, empresa: { nome: "Farm" } }, fence())).rejects.toThrow(); expect(fake.saves).not.toHaveBeenCalled();
  });
  it("blocks a new application query at expired lease", async () => {
    fake.check = () => false;
    await expect(generateAplicacaoPdf({ aplicacao: app, empresa: { nome: "Farm" } }, fence())).rejects.toThrow(); expect(fake.query).not.toHaveBeenCalled();
  });
  it.each(["aplicacoes", "aplicacao_evidencias_vinculos"])("discards late server read on expired lease: %s", async table => {
    const late = deferred(); fake.query.mockImplementation(async name => name === table ? late.promise : { data: { id: APP, organization_id: fake.tenant } });
    const result = generateAplicacaoPdf({ aplicacao: app, empresa: { nome: "Farm" } }, fence()); const rejected = expect(result).rejects.toThrow();
    await waitFor(() => expect(fake.query).toHaveBeenCalledWith(table)); fake.check = () => false;
    late.resolve(table === "aplicacoes" ? { data: { id: APP, organization_id: fake.tenant } } : { data: [{ evidencia: evidence }] }); await rejected;
    expect(fake.download).not.toHaveBeenCalled();
  });
  it("fences downloaded bytes after lease expiration", async () => {
    fake.query.mockImplementation(async table => table === "aplicacoes" ? { data: { id: APP, organization_id: fake.tenant } } : { data: [{ evidencia: evidence }] });
    const late = deferred(); fake.download.mockReturnValue(late.promise);
    const result = generateAplicacaoPdf({ aplicacao: app, empresa: { nome: "Farm" } }, fence());
    const rejected = expect(result).rejects.toThrow();
    await waitFor(() => expect(fake.download).toHaveBeenCalled()); fake.check = () => false; late.resolve(new Blob([png])); await rejected;
  });
  it("aborts even a transport that ignores cancellation", async () => {
    const late = deferred(); const controller = new AbortController();
    const result = awaitAplicacaoPdf({ ...fence(), signal: controller.signal }, () => late.promise);
    const rejected = expect(result).rejects.toThrow(); controller.abort(); await rejected; late.resolve("late");
  });
  it("rechecks immediately before synchronous download and revokes its local URL", async () => {
    const doc = await generateAplicacaoPdf({ aplicacao: app, empresa: { nome: "Farm" } }, fence());
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => { fake.check = () => false; return "blob:stale"; });
    expect(() => saveAplicacaoPdf(doc, "application.pdf", fence())).toThrow();
    expect(fake.saves).not.toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:stale");
  });
});
describe("both existing application PDF callers use real scope", () => {
  const setup = () => { let resource = app; const tree = () => <AplicacaoCard aplicacao={resource} />; const ui = render(tree()); return { ...ui, change: (other?: any) => { if (other) resource = other; ui.rerender(tree()); } }; };
  const start = async (ui: ReturnType<typeof setup>, email: boolean) => {
    if (email) { fireEvent.click(ui.getByTitle("Enviar por E-mail")); fireEvent.change(ui.getByLabelText("E-mail"), { target: { value: "fixture@example.invalid" } }); fireEvent.click(ui.getByText("Enviar Agora")); }
    else fireEvent.click(ui.getByTitle("Baixar PDF"));
  };
  it.each([false, true])("positive completion, email=%s", async email => {
    const ui = setup(); await start(ui, email); await waitFor(() => expect(fake.success).toHaveBeenCalled());
    expect(email ? fake.edge : fake.saves).toHaveBeenCalledTimes(1);
  });
  for (const email of [false, true]) {
    it.each(["uid", "tenant", "roles", "epoch", "resource", "snapshot", "lease", "unmount"])(`rejects late config in ${email ? "email" : "download"} on %s`, async change => {
      const late = deferred(); fake.query.mockReturnValueOnce(late.promise); const ui = setup(); await start(ui, email);
      if (change === "uid") fake.uid = "B";
      if (change === "tenant") fake.tenant = "other";
      if (change === "roles") fake.roles = ["financeiro"];
      if (change === "epoch") fake.epoch++;
      if (change === "lease") fake.check = () => false;
      if (change === "unmount") ui.unmount(); else ui.change(change === "resource" ? { ...app, id: ORIGIN } : change === "snapshot" ? { ...app, observacoes: "Nova versão" } : undefined);
      await act(async () => { late.resolve({ data: { nome_empresa: "Farm" } }); });
      expect(fake.saves).not.toHaveBeenCalled(); expect(fake.edge).not.toHaveBeenCalled(); expect(fake.success).not.toHaveBeenCalled();
      if (change !== "lease") expect(fake.signals[0].aborted).toBe(true);
    });
  }
  it("blocks duplicate local operations", async () => {
    const late = deferred(); fake.query.mockReturnValue(late.promise); const ui = setup(); fireEvent.click(ui.getByTitle("Baixar PDF")); fireEvent.click(ui.getByTitle("Baixar PDF"));
    await waitFor(() => expect(fake.query).toHaveBeenCalledTimes(1)); ui.unmount();
  });
  it("does not reopen UI after late email response under another epoch", async () => {
    const late = deferred(); fake.edge.mockReturnValue(late.promise); const ui = setup(); await start(ui, true);
    await waitFor(() => expect(fake.edge).toHaveBeenCalled()); fake.epoch++; ui.change();
    await act(async () => { late.resolve({ data: { emailSent: true } }); }); expect(fake.success).not.toHaveBeenCalled(); expect(fake.saves).not.toHaveBeenCalled();
  });
  it("suppresses a returned document immediately before save if access expired", async () => {
    fake.query.mockImplementation(async table => {
      if (table === "aplicacoes") return { data: { id: APP, organization_id: fake.tenant } };
      if (table === "configuracoes_sistema") return { data: { nome_empresa: "Farm" } };
      fake.check = () => false; return { data: [] };
    });
    const ui = setup(); await start(ui, false);
    await act(async () => { await Promise.resolve(); }); expect(fake.saves).not.toHaveBeenCalled(); expect(fake.success).not.toHaveBeenCalled();
  });
  it("timeout aborts the operation and discards late result", async () => {
    vi.useFakeTimers(); const late = deferred(); fake.query.mockReturnValue(late.promise); const ui = setup(); await start(ui, false);
    await act(async () => { vi.advanceTimersByTime(15000); }); expect(fake.signals[0].aborted).toBe(true);
    await act(async () => { late.resolve({ data: { nome_empresa: "Farm" } }); }); expect(fake.saves).not.toHaveBeenCalled(); expect(fake.success).not.toHaveBeenCalled();
  });
});
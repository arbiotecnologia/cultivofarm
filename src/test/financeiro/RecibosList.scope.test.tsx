import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthzEpochMonitor } from "@/lib/authz/authzEpochMonitor";

const fake = vi.hoisted(() => ({ uid: "actor", tenant: "007bb519-cba0-4704-be2c-cb93ad010048", roles: ["financeiro"], epoch: 0,
  ready: true, check: (): boolean => true, list: vi.fn(), rpc: vi.fn(), edge: vi.fn(), download: vi.fn(), success: vi.fn(), error: vi.fn(), queries: [] as any[] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: fake.uid },
  profile: { user_id: fake.uid, organization_id: fake.tenant, ativo: true, senha_provisoria: false }, roles: fake.roles,
  loading: false, authzReady: fake.ready, authzEpoch: fake.epoch, checkAuthzAccess: () => fake.check() }) }));
vi.mock("sonner", () => ({ toast: { success: fake.success, error: fake.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => { const q: any = { filters: [] };
    for (const method of ["select", "eq", "order", "limit", "gte", "lte", "ilike"]) q[method] = (...args: any[]) => { q.filters.push([method, ...args]); return q; };
    q.abortSignal = (signal: AbortSignal) => { q.signal = signal; fake.queries.push(q); return fake.list(q); }; return q; },
  rpc: (...args: any[]) => ({ abortSignal: (signal: AbortSignal) => fake.rpc(...args, signal) }),
  functions: { invoke: (...args: any[]) => fake.edge(...args) },
} }));
vi.mock("@/lib/authz/authenticatedAttachment", async original => ({
  ...await original<typeof import("@/lib/authz/authenticatedAttachment")>(), downloadAuthenticatedAttachment: (...args: any[]) => fake.download(...args),
}));
import RecibosList from "@/pages/financeiro/RecibosList";
import { financialReceiptLocator } from "@/lib/financeiro/receiptStorageLocator";
const TENANT = "007bb519-cba0-4704-be2c-cb93ad010048";
const receipt = (changes = {}) => ({ id: "00000000-0000-4000-8000-000000000001", organization_id: TENANT,
  receipt_year: 2026, receipt_number: "REC-2026-000001", storage_bucket: "financial-receipts",
  storage_path: `${TENANT}/2026/REC-2026-000001.pdf`, payment_date: "2026-10-19", amount: 10, status: "ISSUED",
  authenticity_code: "CODE", ...changes });
const response = (changes = {}) => ({ data: [receipt(changes)], error: null });
function deferred() { let resolve: (value: any) => void = () => {}; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; }
function setup() { const tree = () => <MemoryRouter><RecibosList /></MemoryRouter>; const ui = render(tree()); return { ...ui, context: () => ui.rerender(tree()) }; }
async function settle(late: ReturnType<typeof deferred>, value: any) { await act(async () => { late.resolve(value); await Promise.resolve(); }); }
async function submit(ui: ReturnType<typeof setup>) {
  fireEvent.click(await ui.findByRole("button", { name: "Cancelar", exact: true }));
  fireEvent.change(ui.getByRole("textbox", { name: "" }).closest("[role=dialog]")?.querySelector("textarea") ?? ui.getByPlaceholderText("Informe o motivo (mín. 5 caracteres)"), { target: { value: "Motivo seguro" } });
  fireEvent.click(ui.getByRole("button", { name: "Confirmar cancelamento" }));
}
beforeEach(() => {
  Object.assign(fake, { uid: "actor", tenant: TENANT, roles: ["financeiro"], epoch: 0, ready: true, check: () => true, queries: [] });
  for (const mock of [fake.list, fake.rpc, fake.edge, fake.download, fake.success, fake.error]) mock.mockReset();
  fake.list.mockResolvedValue(response()); fake.rpc.mockResolvedValue({ error: null }); fake.download.mockResolvedValue(new Blob(["pdf"]));
  fake.edge.mockResolvedValue({ data: { path: receipt().storage_path, receipt_number: receipt().receipt_number, url: "https://evil.invalid" }, error: null });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:receipt"), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("receipt canonical locator", () => {
  it("accepts the existing and ungenerated Edge path contract", () => {
    expect(financialReceiptLocator(receipt(), TENANT)).toBe(receipt().storage_path);
    expect(financialReceiptLocator(receipt({ storage_path: null }), TENANT)).toBe(receipt().storage_path);
  });
  it.each([{ organization_id: "other" }, { storage_path: "../a.pdf" }, { storage_path: "https://evil.invalid" },
    { storage_bucket: "financial-docs" }, { receipt_number: "../../a" }, { receipt_year: 2025 }, { storage_path: `${TENANT}/2026/other.pdf` }])("rejects inconsistent locator %j", change => {
    expect(() => financialReceiptLocator(receipt(change), TENANT)).toThrow();
  });
});
describe("existing receipt list and cancellation with real scope", () => {
  it("reads only current tenant and preserves canonical RPC and reload after success", async () => {
    const ui = setup(); await submit(ui);
    await waitFor(() => expect(fake.success).toHaveBeenCalledWith("Recibo cancelado"));
    expect(fake.queries[0].filters).toContainEqual(["eq", "organization_id", TENANT]);
    expect(fake.rpc.mock.calls[0].slice(0, 2)).toEqual(["cancel_financial_receipt", { _receipt_id: receipt().id, _reason: "Motivo seguro" }]);
    expect(fake.list).toHaveBeenCalledTimes(2);
  });
  it("rejects a server-denied list without leaking the raw error", async () => {
    fake.list.mockResolvedValue({ error: { message: "secret" }, data: null }); const ui = setup();
    await waitFor(() => expect(fake.error).toHaveBeenCalledWith("Recibos indisponíveis")); expect(ui.queryByText(receipt().receipt_number)).toBeNull();
  });
  it("rejects a foreign-tenant response", async () => {
    fake.list.mockResolvedValue(response({ organization_id: "other" })); const ui = setup();
    await waitFor(() => expect(fake.error).toHaveBeenCalled()); expect(ui.queryByText(receipt().receipt_number)).toBeNull();
  });
  it("fences out-of-order filters and aborts the first request", async () => {
    const late = deferred(); fake.list.mockReturnValueOnce(late.promise).mockResolvedValue(response({ receipt_number: "REC-2026-000002" })); const ui = setup();
    fireEvent.change(ui.getByPlaceholderText("REC-2026-…"), { target: { value: "002" } });
    await ui.findByText("REC-2026-000002"); expect(fake.queries[0].signal.aborted).toBe(true);
    await settle(late, response()); expect(ui.queryByText("REC-2026-000001")).toBeNull();
  });
  it("blocks local duplicate cancel and rejects denied cancellation", async () => {
    const late = deferred(); fake.rpc.mockReturnValue(late.promise); const ui = setup(); await submit(ui);
    fireEvent.click(ui.getByRole("button", { name: "Confirmar cancelamento" })); expect(fake.rpc).toHaveBeenCalledTimes(1);
    await settle(late, { error: { message: "denied" } }); expect(fake.success).not.toHaveBeenCalled(); expect(fake.list).toHaveBeenCalledTimes(1);
  });
  for (const phase of ["list", "cancel", "existing", "generated"] as const) {
    it.each(["uid", "tenant", "roles", "epoch", "filters", "unmount", "lease"])(`${phase} suppresses stale completion on %s`, async change => {
      const late = deferred();
      if (phase === "list") fake.list.mockReturnValueOnce(late.promise);
      if (phase === "cancel") fake.rpc.mockReturnValueOnce(late.promise);
      if (phase === "existing") fake.download.mockReturnValueOnce(late.promise);
      if (phase === "generated") { fake.list.mockResolvedValue(response({ storage_path: null })); fake.edge.mockReturnValueOnce(late.promise); }
      const ui = setup();
      if (phase === "cancel") await submit(ui);
      if (phase === "existing" || phase === "generated") fireEvent.click(await ui.findByRole("button", { name: "Preparar PDF" }));
      if (change === "uid") fake.uid = "B";
      if (change === "tenant") fake.tenant = "8f57c7dd-0557-4041-b401-7a00f7244626";
      if (change === "roles") fake.roles = ["consultor_tecnico"];
      if (change === "epoch") fake.epoch++;
      if (change === "lease") fake.check = () => false;
      if (change === "unmount") ui.unmount();
      else if (change === "filters") fireEvent.change(ui.getByPlaceholderText("REC-2026-…"), { target: { value: "NEW" } });
      else if (change !== "lease") ui.context();
      await settle(late, phase === "existing" ? new Blob(["late"]) : phase === "generated" ? { data: { path: receipt().storage_path, receipt_number: receipt().receipt_number }, error: null } : phase === "list" ? response() : { error: null });
      expect(fake.success).not.toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(window.open).not.toHaveBeenCalled();
      if (phase === "generated") expect(fake.download).not.toHaveBeenCalled();
      if (phase === "cancel") expect(fake.list).toHaveBeenCalledTimes(change === "filters" || ["uid", "tenant", "roles", "epoch"].includes(change) ? 2 : 1);
    });
  }
  it("blocks new cancellation and downloads exactly at monotonic deadline without rerender", async () => {
    let clock = 0; const monitor = createAuthzEpochMonitor({ fetcher: async () => ({ eligible: true, fingerprint: "same" }),
      now: () => clock, setTimeoutFn: () => 1, clearTimeoutFn: () => {}, onEpochChange: () => {}, onExpire: () => {} });
    monitor.start(); await act(async () => { await Promise.resolve(); }); fake.check = monitor.checkAccess;
    const ui = setup(); await ui.findByRole("button", { name: "Preparar PDF" }); clock = 15_000;
    fireEvent.click(ui.getByRole("button", { name: "Preparar PDF" })); fireEvent.click(ui.getByRole("button", { name: "Cancelar", exact: true }));
    expect(fake.download).not.toHaveBeenCalled(); expect(fake.rpc).not.toHaveBeenCalled(); monitor.stop();
  });
});
describe("receipt PDFs use real authenticated opener, never remote URL", () => {
  it.each([false, true])("prepares %s generated PDF, explicit second click downloads and unmount revokes Blob", async generated => {
    if (generated) fake.list.mockResolvedValue(response({ storage_path: null })); const ui = setup();
    fireEvent.click(await ui.findByRole("button", { name: "Preparar PDF" }));
    fireEvent.click(ui.getByRole("button", { name: "Preparar PDF" }));
    await ui.findByRole("button", { name: "Baixar PDF" }); expect(fake.download).toHaveBeenCalledTimes(1);
    expect(fake.download.mock.calls[0].slice(0, 2)).toEqual(["financial-receipts", receipt().storage_path]);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    fireEvent.click(ui.getByRole("button", { name: "Baixar PDF" })); expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(window.open).not.toHaveBeenCalled(); expect(fake.edge).toHaveBeenCalledTimes(generated ? 1 : 0);
    ui.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:receipt");
  });
  it.each([{ url: "https://evil.invalid" }, { path: "https://evil.invalid", receipt_number: receipt().receipt_number },
    { path: receipt().storage_path, receipt_number: "wrong" }])("rejects generated malformed locator %j", data => {
    fake.list.mockResolvedValue(response({ storage_path: null })); fake.edge.mockResolvedValue({ data, error: null });
    const ui = setup(); return ui.findByRole("button", { name: "Preparar PDF" }).then(async button => {
      fireEvent.click(button); await waitFor(() => expect(fake.error).toHaveBeenCalled()); expect(fake.download).not.toHaveBeenCalled();
    });
  });
  it("server download denial creates no Blob", async () => {
    fake.download.mockRejectedValue(new Error("denied")); const ui = setup(); fireEvent.click(await ui.findByRole("button", { name: "Preparar PDF" }));
    await waitFor(() => expect(fake.error).toHaveBeenCalled()); expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("timeout aborts Edge and ignores its late locator", async () => {
    const late = deferred(); fake.list.mockResolvedValue(response({ storage_path: null })); fake.edge.mockReturnValue(late.promise);
    const ui = setup(); const button = await ui.findByRole("button", { name: "Preparar PDF" }); vi.useFakeTimers(); fireEvent.click(button);
    await act(async () => vi.advanceTimersByTime(15_000)); expect(fake.edge.mock.calls[0][1].signal.aborted).toBe(true);
    await settle(late, { data: { path: receipt().storage_path, receipt_number: receipt().receipt_number }, error: null });
    expect(fake.download).not.toHaveBeenCalled(); expect(window.open).not.toHaveBeenCalled();
  });
});
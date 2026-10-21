import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ uid: "A", tenant: "007bb519-cba0-4704-be2c-cb93ad010048", roles: ["financeiro"], epoch: 0,
  ready: true, check: true, rpc: vi.fn(), read: vi.fn(), edge: vi.fn(), download: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn(), queries: [] as any[] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: fake.uid }, profile: { user_id: fake.uid, organization_id: fake.tenant, ativo: true, senha_provisoria: false },
  roles: fake.roles, loading: false, authzReady: fake.ready, authzEpoch: fake.epoch, checkAuthzAccess: () => fake.check }) }));
vi.mock("sonner", () => ({ toast: { error: fake.error, success: fake.success, info: fake.info } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...args: any[]) => { const promise = fake.rpc(...args); return Object.assign(promise, { abortSignal: (signal: AbortSignal) => { (promise as any).signal = signal; return promise; } }); },
  from: (table: string) => { const q: any = { table, filters: [] }; q.select = () => q; q.eq = (...args: any[]) => { q.filters.push(args); return q; };
    q.abortSignal = (signal: AbortSignal) => { q.signal = signal; return q; }; q.maybeSingle = () => { fake.queries.push(q); return fake.read(q); }; return q; },
  functions: { invoke: (...args: any[]) => fake.edge(...args) },
} }));
vi.mock("@/lib/authz/authenticatedAttachment", async original => ({ ...await original<typeof import("@/lib/authz/authenticatedAttachment")>(), downloadAuthenticatedAttachment: (...args: any[]) => fake.download(...args) }));
import { EmitirReciboButton } from "@/components/financeiro/EmitirReciboButton";
const TENANT = "007bb519-cba0-4704-be2c-cb93ad010048";
const PAYMENT = "00000000-0000-4000-8000-000000000001";
const ID = "00000000-0000-4000-8000-000000000002";
const NUMBER = "REC-2026-000001";
const PATH = `${TENANT}/2026/${NUMBER}.pdf`;
const receipt = (change = {}) => ({ id: ID, payment_id: PAYMENT, organization_id: TENANT, receipt_year: 2026, receipt_number: NUMBER, storage_bucket: "financial-receipts", storage_path: PATH, ...change });
const pdf = { data: { path: PATH, receipt_number: NUMBER, url: "https://bearer.invalid/private" }, error: null };
function deferred() { let resolve: (value: any) => void = () => {}; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; }
function setup() { const ui = render(<EmitirReciboButton paymentId={PAYMENT} />); return { ...ui, context: (id = PAYMENT) => ui.rerender(<EmitirReciboButton paymentId={id} />) }; }
async function settle(late: ReturnType<typeof deferred>, value: any) { await act(async () => late.resolve(value)); }
beforeEach(() => {
  Object.assign(fake, { uid: "A", tenant: TENANT, roles: ["financeiro"], epoch: 0, ready: true, check: true, queries: [] });
  for (const m of [fake.rpc, fake.read, fake.edge, fake.download, fake.error, fake.success, fake.info]) m.mockReset();
  fake.rpc.mockResolvedValue({ data: { receipt_id: ID, receipt_number: NUMBER, duplicate: false }, error: null });
  fake.read.mockResolvedValue({ data: receipt(), error: null }); fake.edge.mockResolvedValue(pdf); fake.download.mockResolvedValue(new Blob(["pdf"]));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:owned-receipt") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(window, "open").mockImplementation(() => null); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
it.each([false, true])("issuance duplicate=%s prepares actor-authenticated bytes; only second click downloads", async duplicate => {
  fake.rpc.mockResolvedValue({ data: { receipt_id: ID, receipt_number: NUMBER, duplicate }, error: null });
  const ui = setup(); const button = ui.getByRole("button"); fireEvent.click(button); fireEvent.click(button);
  await ui.findByRole("button", { name: "Baixar PDF" });
  expect(fake.rpc).toHaveBeenCalledTimes(1); expect(fake.rpc).toHaveBeenCalledWith("issue_financial_receipt", { _payment_id: PAYMENT });
  expect(fake.queries[0].filters).toEqual([["id", ID], ["payment_id", PAYMENT], ["organization_id", TENANT]]);
  expect(fake.download.mock.calls[0].slice(0, 2)).toEqual(["financial-receipts", PATH]);
  expect(window.open).not.toHaveBeenCalled(); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  fireEvent.click(ui.getByRole("button", { name: "Baixar PDF" })); expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  expect(fake.rpc).toHaveBeenCalledTimes(1); ui.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:owned-receipt");
});
it.each([{ organization_id: "foreign" }, { payment_id: ID }, { id: PAYMENT }, { storage_path: "../secret.pdf" }, { storage_bucket: "other" }])("rejects receipt ownership/locator %j before Edge", async change => {
  fake.read.mockResolvedValue({ data: receipt(change), error: null }); const ui = setup(); fireEvent.click(ui.getByRole("button"));
  await waitFor(() => expect(fake.error).toHaveBeenCalledWith("Recibo indisponível")); expect(fake.edge).not.toHaveBeenCalled(); expect(fake.download).not.toHaveBeenCalled(); expect(window.open).not.toHaveBeenCalled();
});
it.each([{ url: "https://bearer.invalid" }, { path: "../secret.pdf", receipt_number: NUMBER }, { path: PATH, receipt_number: "wrong" }])("rejects malformed Edge response %j", async data => {
  fake.edge.mockResolvedValue({ data, error: null }); const ui = setup(); fireEvent.click(ui.getByRole("button"));
  await waitFor(() => expect(fake.error).toHaveBeenCalledWith("Recibo indisponível")); expect(fake.download).not.toHaveBeenCalled(); expect(window.open).not.toHaveBeenCalled();
});
for (const phase of ["rpc", "read", "edge", "bytes"] as const) {
  it.each(["tenant", "role", "epoch", "pending", "uid", "resource", "unmount", "deadline"])(`${phase} fences stale success on %s`, async change => {
    const late = deferred(); const mock = phase === "bytes" ? fake.download : fake[phase]; mock.mockReturnValueOnce(late.promise);
    const ui = setup(); fireEvent.click(ui.getByRole("button")); await waitFor(() => expect(mock).toHaveBeenCalled());
    if (change === "tenant") fake.tenant = "8f57c7dd-0557-4041-b401-7a00f7244626";
    if (change === "role") fake.roles = ["consultor_tecnico"];
    if (change === "epoch") fake.epoch++;
    if (change === "pending") fake.ready = false;
    if (change === "uid") fake.uid = "B";
    if (change === "deadline") fake.check = false;
    if (change === "unmount") ui.unmount(); else if (change !== "deadline") ui.context(change === "resource" ? ID : PAYMENT);
    if (phase === "bytes" && change !== "deadline") expect(fake.download.mock.calls[0][2].aborted).toBe(true);
    if (phase === "read" && change !== "deadline") expect(fake.queries[0].signal.aborted).toBe(true);
    if (phase === "edge" && change !== "deadline") expect(fake.edge.mock.calls[0][1].signal.aborted).toBe(true);
    await settle(late, phase === "bytes" ? new Blob(["late"]) : phase === "rpc" ? { data: { receipt_id: ID, receipt_number: NUMBER }, error: null } : phase === "read" ? { data: receipt(), error: null } : pdf);
    expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(window.open).not.toHaveBeenCalled(); expect(fake.error).not.toHaveBeenCalled(); expect(fake.success).not.toHaveBeenCalled();
    if (phase === "rpc") expect(fake.edge).not.toHaveBeenCalled();
    if (phase === "read") expect(fake.edge).not.toHaveBeenCalled();
    if (phase === "edge") expect(fake.download).not.toHaveBeenCalled();
  });
  it(`${phase} denies errors without raw transport disclosure`, async () => {
    if (phase === "bytes") fake.download.mockRejectedValue(new Error("secret token"));
    else fake[phase].mockResolvedValue({ data: null, error: { message: "secret token" } });
    const ui = setup(); fireEvent.click(ui.getByRole("button")); await waitFor(() => expect(fake.error).toHaveBeenCalledWith("Recibo indisponível"));
    expect(window.open).not.toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
}
it("lease deadline blocks prepared click without rerender; pending revokes bytes", async () => {
  const ui = setup(); fireEvent.click(ui.getByRole("button")); const button = await ui.findByRole("button", { name: "Baixar PDF" });
  fake.check = false; fireEvent.click(button); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  fake.ready = false; ui.context(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:owned-receipt");
});
it("hung generation aborts at 15s; old completion cannot unlock a new request", async () => {
  vi.useFakeTimers();
  const late = deferred(); fake.edge.mockReturnValueOnce(late.promise); const ui = setup(); fireEvent.click(ui.getByRole("button"));
  await act(async () => { await Promise.resolve(); }); expect(fake.edge).toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(15_000));
  expect(fake.edge.mock.calls[0][1].signal.aborted).toBe(true); expect(fake.error).toHaveBeenCalledWith("Recibo indisponível");
  const newer = deferred(); fake.edge.mockReturnValueOnce(newer.promise); fireEvent.click(ui.getByRole("button")); await act(async () => { await Promise.resolve(); });
  await settle(late, pdf); expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(ui.getByRole("button")).toBeDisabled();
  await settle(newer, pdf); expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});
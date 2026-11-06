// ReportShell export: private locator + canonical authenticated opener.
// Fake Auth/Edge/transport — not a hosted JWT/RLS or browser homologation proof.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthzEpochMonitor } from "@/lib/authz/authzEpochMonitor";
import { parseFinancialReportLocator } from "@/lib/financeiro/reportExportLocator";

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const PATH = `${ORG}/${ACTOR}/monthly_2026-10-19T16-30-00-000Z.pdf`;
const s = vi.hoisted(() => ({
  auth: { user: { id: "" }, profile: { user_id: "", organization_id: "", ativo: true, senha_provisoria: false }, roles: ["financeiro"], loading: false,
    error: null as string | null, authzEpoch: 0, checkAuthzAccess: (): boolean => true },
  invoke: vi.fn(), download: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn(), sign: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => s.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), functions: { invoke: s.invoke },
  storage: { from: () => ({ createSignedUrl: s.sign, getPublicUrl: s.sign }) } } }));
vi.mock("sonner", () => ({ toast: { error: s.error, success: s.success, warning: s.warning } }));
vi.mock("@/lib/authz/authenticatedAttachment", async (orig) => ({
  ...await orig<typeof import("@/lib/authz/authenticatedAttachment")>(),
  downloadAuthenticatedAttachment: (...a: unknown[]) => s.download(...a),
}));
import { ReportShell } from "@/components/financeiro/relatorios/ReportShell";

const live = { url: "https://swzpzcwiasxmjutrmvkm.supabase.co/storage/v1/object/sign/financial-reports/x?token=SIGNED", path: PATH, row_count: 1 };
const reviewed = { bucket: "financial-reports", path: PATH, export_id: "33333333-3333-4333-8333-333333333333", row_count: 1 };
const ui = () => <ReportShell title="Mensal" reportType="monthly" defaultFilters={{ from: "2026-10-01", to: "2026-10-09" }}
  renderFilters={(f, set) => <input aria-label="Cliente filtro" value={String(f.customer_id ?? "")} onChange={(e) => set({ ...f, customer_id: e.target.value })} />} />;
function deferred<T>() { let resolve: (v: T) => void = () => {}; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
let create: ReturnType<typeof vi.fn>, revoke: ReturnType<typeof vi.fn>, click: ReturnType<typeof vi.spyOn>, open: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  s.auth.user = { id: ACTOR }; s.auth.profile = { user_id: ACTOR, organization_id: ORG, ativo: true, senha_provisoria: false };
  Object.assign(s.auth, { roles: ["financeiro"], loading: false, error: null, authzEpoch: 0, checkAuthzAccess: () => true });
  for (const f of [s.invoke, s.download, s.error, s.success, s.sign]) f.mockReset();
  s.invoke.mockResolvedValue({ data: live, error: null }); s.download.mockResolvedValue(new Blob(["bytes"]));
  create = vi.fn(() => "blob:local/1"); revoke = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  open = vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => { cleanup(); click.mockRestore(); open.mockRestore(); vi.useRealTimers(); });
const prepare = async (name = "Preparar PDF") => { await act(async () => { fireEvent.click(screen.getByRole("button", { name })); }); };
const noRemote = () => { expect(open).not.toHaveBeenCalled(); expect(s.sign).not.toHaveBeenCalled(); };

describe("locator validation (pure)", () => {
  const ctx = { organizationId: ORG, actorId: ACTOR, reportType: "monthly", format: "PDF" };
  it.each([["live v89 shape", live], ["reviewed shape", reviewed]])("accepts %s and ignores url", (_n, r) => expect(parseFinancialReportLocator(r, ctx)).toBe(PATH));
  it.each([
    ["url only", { url: live.url }],
    ["other tenant", { path: PATH.replace(ORG, "44444444-4444-4444-8444-444444444444") }],
    ["other actor", { path: PATH.replace(ACTOR, "44444444-4444-4444-8444-444444444444") }],
    ["other bucket", { ...reviewed, bucket: "financial-docs" }],
    ["other report", { path: `${ORG}/${ACTOR}/payables_2026-10-19T16-30-00-000Z.pdf` }],
    ["other format", { path: PATH.replace(".pdf", ".csv") }],
    ["traversal", { path: `${ORG}/${ACTOR}/../x.pdf` }],
    ["nested", { path: `${ORG}/${ACTOR}/a/monthly_2026-10-19T16-30-00-000Z.pdf` }],
    ["absolute url as path", { path: "https://evil.invalid/x.pdf" }],
    ["bad export_id", { ...reviewed, export_id: "x" }],
    ["array", [PATH]], ["null", null],
  ])("rejects %s", (_n, r) => expect(parseFinancialReportLocator(r, ctx)).toBeNull());
});

describe.each([["live v89", live], ["reviewed Edge", reviewed]])("ReportShell export with %s response", (_n, response) => {
  it("prepares via authenticated download, never opens the URL, downloads only on a second explicit click", async () => {
    s.invoke.mockResolvedValue({ data: response, error: null });
    render(ui()); await prepare();
    const get = await screen.findByRole("button", { name: "Baixar PDF" });
    expect(s.download).toHaveBeenCalledWith("financial-reports", PATH, expect.any(AbortSignal));
    expect(click).not.toHaveBeenCalled();
    fireEvent.click(get); expect(click).toHaveBeenCalledTimes(1);
    expect(s.download).toHaveBeenCalledTimes(1); noRemote();
  });
});

describe("ReportShell export fail-closed", () => {
  it("Edge denial: neutral message, no download, no Baixar", async () => {
    s.invoke.mockResolvedValue({ data: null, error: { message: "financial_report_unavailable 403 secret" } });
    render(ui()); await prepare();
    expect(s.error).toHaveBeenCalledWith("Exportação indisponível. Verifique seu acesso e tente novamente.");
    expect(JSON.stringify(s.error.mock.calls)).not.toContain("secret");
    expect(s.download).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "Baixar PDF" })).toBeNull(); noRemote();
  });
  it("locator of another tenant is never fetched", async () => {
    s.invoke.mockResolvedValue({ data: { ...live, path: PATH.replace(ORG, "44444444-4444-4444-8444-444444444444") }, error: null });
    render(ui()); await prepare();
    expect(s.download).not.toHaveBeenCalled(); expect(s.error).toHaveBeenCalled(); noRemote();
  });
  it("Storage denial of bytes: neutral message, no Blob", async () => {
    s.download.mockRejectedValue(new Error("Anexo indisponível"));
    render(ui()); await prepare();
    await waitFor(() => expect(s.error).toHaveBeenCalledWith("Exportação indisponível. Verifique seu acesso e tente novamente."));
    expect(create).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "Baixar PDF" })).toBeNull();
  });
  it("late Edge response after lease expiry (no rerender) does not fetch bytes", async () => {
    let clock = 0;
    const monitor = createAuthzEpochMonitor({ fetcher: async () => ({ eligible: true, fingerprint: "same" }), now: () => clock,
      setTimeoutFn: () => 1, clearTimeoutFn: () => {}, isVisible: () => true, isOnline: () => true, onEpochChange: () => {}, onExpire: () => {} });
    monitor.start(); await act(async () => { await Promise.resolve(); }); s.auth.checkAuthzAccess = monitor.checkAccess;
    const late = deferred<unknown>(); s.invoke.mockReturnValue(late.promise);
    render(ui()); await prepare(); clock = 15_000;
    await act(async () => { late.resolve({ data: live, error: null }); await new Promise(r => setTimeout(r, 5)); });
    expect(s.download).not.toHaveBeenCalled(); expect(s.success).not.toHaveBeenCalled(); expect(s.error).not.toHaveBeenCalled(); noRemote();
    monitor.stop();
  });
  it("late bytes after lease expiry (no rerender) never become a Blob URL", async () => {
    let valid = true; s.auth.checkAuthzAccess = () => valid;
    const late = deferred<Blob>(); s.download.mockReturnValue(late.promise);
    render(ui()); await prepare(); await waitFor(() => expect(s.download).toHaveBeenCalled());
    valid = false;
    await act(async () => { late.resolve(new Blob(["late"])); await new Promise(r => setTimeout(r, 5)); });
    expect(create).not.toHaveBeenCalled(); expect(s.success).not.toHaveBeenCalled(); noRemote();
  });
  it.each(["tenant", "roles", "epoch", "unmount"])("in-flight bytes aborted and discarded on %s", async (change) => {
    const late = deferred<Blob>(); s.download.mockReturnValue(late.promise);
    const view = render(ui()); await prepare(); await waitFor(() => expect(s.download).toHaveBeenCalled());
    const signal = s.download.mock.calls[0][2] as AbortSignal;
    if (change === "tenant") s.auth.profile = { ...s.auth.profile, organization_id: "44444444-4444-4444-8444-444444444444" };
    if (change === "roles") s.auth.roles = ["gestor"];
    if (change === "epoch") s.auth.authzEpoch++;
    if (change === "unmount") view.unmount(); else view.rerender(ui());
    expect(signal.aborted).toBe(true);
    await act(async () => { late.resolve(new Blob(["late"])); await new Promise(r => setTimeout(r, 5)); });
    expect(create).not.toHaveBeenCalled(); expect(s.success).not.toHaveBeenCalled(); noRemote();
  });
  it("prepared Blob revoked on tenant change and Baixar disappears", async () => {
    const view = render(ui()); await prepare(); await screen.findByRole("button", { name: "Baixar PDF" });
    s.auth.profile = { ...s.auth.profile, organization_id: "44444444-4444-4444-8444-444444444444" }; view.rerender(ui());
    expect(revoke).toHaveBeenCalledWith("blob:local/1"); expect(screen.queryByRole("button", { name: "Baixar PDF" })).toBeNull();
  });
  it("editing filters after preparation hides Baixar (generation/filters snapshot)", async () => {
    render(ui()); await prepare(); await screen.findByRole("button", { name: "Baixar PDF" });
    fireEvent.change(screen.getByLabelText("Cliente filtro"), { target: { value: "OUTRO" } });
    expect(screen.queryByRole("button", { name: "Baixar PDF" })).toBeNull(); expect(click).not.toHaveBeenCalled();
  });
  it("prepared Blob is not handed over after lease expiry without rerender", async () => {
    let valid = true; s.auth.checkAuthzAccess = () => valid;
    render(ui()); await prepare(); const get = await screen.findByRole("button", { name: "Baixar PDF" });
    valid = false; fireEvent.click(get); expect(click).not.toHaveBeenCalled();
  });
  it("Edge timeout aborts with neutral message and ignores a later answer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const late = deferred<unknown>(); s.invoke.mockReturnValue(late.promise);
    render(ui()); await prepare();
    const signal = s.invoke.mock.calls[0][1].signal as AbortSignal;
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(signal.aborted).toBe(true);
    expect(s.error).toHaveBeenCalledWith("Exportação indisponível. Verifique seu acesso e tente novamente.");
    await act(async () => { late.resolve({ data: live, error: null }); await Promise.resolve(); });
    expect(s.download).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Preparar PDF" })).toBeEnabled();
  });
});

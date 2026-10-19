// DocumentosPanel / HistoricoExportacoes: canonical authenticated opener only.
// Fake Auth/transport; not a hosted JWT/RLS or browser homologation proof.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthzEpochMonitor } from "@/lib/authz/authzEpochMonitor";

const OWNER = "00000000-0000-4000-8000-000000000001";
const DOC_PATH = `RECEIVABLE/${OWNER}/11111111-1111-4111-8111-111111111111-nota.pdf`;
const REPORT_PATH = "OA/exports/monthly.pdf";
const auth = vi.hoisted(() => ({
  user: { id: "A" } as { id: string } | null, role: "financeiro", roles: ["financeiro"], loading: false, authzReady: true, authzEpoch: 0,
  profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, checkAuthzAccess: (): boolean => true,
}));
const m = vi.hoisted(() => ({ rows: [] as unknown[], sign: vi.fn(), download: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("sonner", () => ({ toast: { success: m.success, error: m.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const q: Record<string, unknown> = {};
    for (const name of ["select", "eq", "is", "order", "limit", "gte", "lte"]) q[name] = () => q;
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: m.rows, error: null }).then(resolve);
    return q;
  },
  storage: { from: () => ({ createSignedUrl: m.sign, createSignedUrls: m.sign, getPublicUrl: m.sign }) },
  rpc: vi.fn(),
} }));
vi.mock("@/lib/authz/authenticatedAttachment", async (orig) => ({
  ...await orig<typeof import("@/lib/authz/authenticatedAttachment")>(),
  downloadAuthenticatedAttachment: (...a: unknown[]) => m.download(...a),
}));
import { DocumentosPanel } from "@/components/financeiro/DocumentosPanel";
import { HistoricoExportacoes } from "@/components/financeiro/relatorios/HistoricoExportacoes";

const docRow = (over: Record<string, unknown> = {}) => ({ id: "D1", file_name: "nota.pdf", document_type: "INVOICE", storage_path: DOC_PATH, deleted_at: null, ...over });
const reportRow = (over: Record<string, unknown> = {}) => ({ id: "X1", report_type: "monthly", report_title: "Mensal", file_format: "PDF", format: "PDF",
  status: "SUCCESS", storage_bucket: "financial-reports", storage_path: REPORT_PATH, generated_by: "A", generated_at: "2026-10-19", row_count: 1, ...over });

type Kind = "docs" | "reports";
const cfg = {
  docs: { bucket: "financial-docs", path: DOC_PATH, prepare: "Preparar documento", get: "Baixar documento", row: docRow, deny: "Documento indisponível",
    ui: () => <DocumentosPanel ownerType="RECEIVABLE" ownerId={OWNER} /> },
  reports: { bucket: "financial-reports", path: REPORT_PATH, prepare: "Preparar exportação", get: "Baixar exportação", row: reportRow, deny: "Arquivo indisponível",
    ui: () => <HistoricoExportacoes /> },
} as const;

let create: ReturnType<typeof vi.fn>, revoke: ReturnType<typeof vi.fn>, anchorClick: ReturnType<typeof vi.spyOn>, winOpen: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  Object.assign(auth, { user: { id: "A" }, role: "financeiro", roles: ["financeiro"], loading: false, authzReady: true, authzEpoch: 0,
    checkAuthzAccess: () => true });
  auth.profile = { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false };
  for (const f of [m.sign, m.download, m.error, m.success]) f.mockReset();
  let n = 0;
  create = vi.fn(() => `blob:local/${++n}`); revoke = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  winOpen = vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => { cleanup(); anchorClick.mockRestore(); winOpen.mockRestore(); });

function mount(kind: Kind, rows: unknown[] = [cfg[kind].row()]) {
  m.rows = rows;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <QueryClientProvider client={qc}>{cfg[kind].ui()}</QueryClientProvider>;
  const ui = render(tree());
  return { ...ui, rerenderTree: () => ui.rerender(tree()) };
}
function deferredBlob() {
  let resolve: (b: Blob) => void = () => {}; let reject: (e: unknown) => void = () => {};
  const promise = new Promise<Blob>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
const noRemoteUrl = () => { expect(m.sign).not.toHaveBeenCalled(); expect(winOpen).not.toHaveBeenCalled(); };

describe.each(["docs", "reports"] as const)("%s: authenticated two-step download", (kind) => {
  const c = cfg[kind];
  it("prepare fetches bytes via actor session; download happens only on a second explicit click; never signed/public URLs", async () => {
    m.download.mockResolvedValue(new Blob(["bytes"]));
    mount(kind);
    fireEvent.click(await screen.findByRole("button", { name: c.prepare }));
    await screen.findByRole("button", { name: c.get });
    expect(m.download).toHaveBeenCalledTimes(1);
    expect(m.download.mock.calls[0][0]).toBe(c.bucket);
    expect(m.download.mock.calls[0][1]).toBe(c.path);
    expect(m.download.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
    expect(anchorClick).not.toHaveBeenCalled(); // no automatic download after preparation
    fireEvent.click(screen.getByRole("button", { name: c.get }));
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(m.download).toHaveBeenCalledTimes(1);
    noRemoteUrl();
  });

  it("late bytes after the 15s lease deadline (no Auth rerender) never become a Blob URL", async () => {
    let clock = 0;
    const monitor = createAuthzEpochMonitor({ fetcher: async () => ({ eligible: true, fingerprint: "same" }), now: () => clock,
      setTimeoutFn: () => 1, clearTimeoutFn: () => {}, isVisible: () => true, isOnline: () => true, onEpochChange: () => {}, onExpire: () => {} });
    monitor.start(); await act(async () => { await Promise.resolve(); });
    auth.checkAuthzAccess = monitor.checkAccess;
    const late = deferredBlob(); m.download.mockReturnValue(late.promise);
    mount(kind);
    fireEvent.click(await screen.findByRole("button", { name: c.prepare }));
    await waitFor(() => expect(m.download).toHaveBeenCalledTimes(1));
    clock = 15_000;
    await act(async () => { late.resolve(new Blob(["late"])); await new Promise(r => setTimeout(r, 5)); });
    expect(create).not.toHaveBeenCalled(); expect(anchorClick).not.toHaveBeenCalled(); expect(m.error).not.toHaveBeenCalled();
    noRemoteUrl(); monitor.stop();
  });

  it("prepared Blob is not handed over after lease expiry without rerender", async () => {
    let valid = true; auth.checkAuthzAccess = () => valid;
    m.download.mockResolvedValue(new Blob(["bytes"]));
    mount(kind);
    fireEvent.click(await screen.findByRole("button", { name: c.prepare }));
    const get = await screen.findByRole("button", { name: c.get });
    valid = false;
    fireEvent.click(get);
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it.each(["tenant", "roles", "epoch", "logout", "unmount"])("in-flight request aborts and late bytes are discarded on %s", async (change) => {
    const late = deferredBlob(); m.download.mockReturnValue(late.promise);
    const ui = mount(kind);
    fireEvent.click(await screen.findByRole("button", { name: c.prepare }));
    await waitFor(() => expect(m.download).toHaveBeenCalledTimes(1));
    const signal = m.download.mock.calls[0][2] as AbortSignal;
    if (change === "tenant") auth.profile = { ...auth.profile, organization_id: "OB" };
    if (change === "roles") auth.roles = ["gestor"];
    if (change === "epoch") auth.authzEpoch++;
    if (change === "logout") auth.user = null;
    if (change === "unmount") ui.unmount(); else ui.rerenderTree();
    expect(signal.aborted).toBe(true);
    await act(async () => { late.resolve(new Blob(["late"])); await new Promise(r => setTimeout(r, 5)); });
    expect(create).not.toHaveBeenCalled(); expect(anchorClick).not.toHaveBeenCalled(); expect(m.error).not.toHaveBeenCalled();
    noRemoteUrl();
  });

  it.each(["tenant", "epoch", "unmount"])("prepared Blob URL is revoked on %s", async (change) => {
    m.download.mockResolvedValue(new Blob(["bytes"]));
    const ui = mount(kind);
    fireEvent.click(await screen.findByRole("button", { name: c.prepare }));
    await screen.findByRole("button", { name: c.get });
    expect(revoke).not.toHaveBeenCalled();
    if (change === "tenant") auth.profile = { ...auth.profile, organization_id: "OB" };
    if (change === "epoch") auth.authzEpoch++;
    if (change === "unmount") ui.unmount(); else ui.rerenderTree();
    expect(revoke).toHaveBeenCalledWith("blob:local/1");
    expect(screen.queryByRole("button", { name: c.get })).toBeNull();
  });

  it("server denial reports neutral unavailability, keeps prepare state and creates nothing", async () => {
    m.download.mockRejectedValue(new Error("Anexo indisponível"));
    mount(kind);
    fireEvent.click(await screen.findByRole("button", { name: c.prepare }));
    await waitFor(() => expect(m.error).toHaveBeenCalledWith(c.deny));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: c.prepare })).toBeEnabled();
    noRemoteUrl();
  });

  it("does not start a request when the lease expired before click (no rerender)", async () => {
    let valid = true; auth.checkAuthzAccess = () => valid;
    mount(kind);
    const prepare = await screen.findByRole("button", { name: c.prepare });
    valid = false; fireEvent.click(prepare);
    expect(m.download).not.toHaveBeenCalled(); noRemoteUrl();
  });
});

describe("resource snapshot and fail-closed eligibility", () => {
  it("docs: snapshot change (same id, new storage_path) revokes prepared bytes", async () => {
    m.download.mockResolvedValue(new Blob(["bytes"]));
    const ui = mount("docs");
    fireEvent.click(await screen.findByRole("button", { name: "Preparar documento" }));
    await screen.findByRole("button", { name: "Baixar documento" });
    m.rows = [docRow({ storage_path: `RECEIVABLE/${OWNER}/22222222-2222-4222-8222-222222222222-nova.pdf` })];
    ui.unmount(); // new list snapshot rendered by a fresh mount mirrors refetch
    expect(revoke).toHaveBeenCalledWith("blob:local/1");
  });
  it.each([
    ["deleted", docRow({ deleted_at: "2026-10-19T00:00:00Z" })],
    ["foreign owner path", docRow({ storage_path: `RECEIVABLE/00000000-0000-4000-8000-000000000009/x.pdf` })],
    ["missing path", docRow({ storage_path: null })],
    ["nested path", docRow({ storage_path: `RECEIVABLE/${OWNER}/a/b.pdf` })],
  ])("docs: %s stays disabled and never fetches", async (_n, row) => {
    mount("docs", [row]);
    const b = await screen.findByRole("button", { name: "Preparar documento" });
    expect(b).toBeDisabled(); fireEvent.click(b); expect(m.download).not.toHaveBeenCalled(); noRemoteUrl();
  });
  it("docs: DELIVERY owner (denied by Storage RLS) stays disabled", async () => {
    m.rows = [docRow({ storage_path: `DELIVERY/${OWNER}/x.pdf` })];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><DocumentosPanel ownerType="DELIVERY" ownerId={OWNER} /></QueryClientProvider>);
    expect(await screen.findByRole("button", { name: "Preparar documento" })).toBeDisabled();
  });
  it.each([["other bucket", reportRow({ storage_bucket: "financial-docs" })], ["missing path", reportRow({ storage_path: null })]])(
    "reports: %s stays disabled and never fetches", async (_n, row) => {
      mount("reports", [row]);
      const b = await screen.findByRole("button", { name: "Preparar exportação" });
      expect(b).toBeDisabled(); fireEvent.click(b); expect(m.download).not.toHaveBeenCalled(); noRemoteUrl();
    });
  it("reports: null bucket defaults to financial-reports", async () => {
    m.download.mockResolvedValue(new Blob(["bytes"]));
    mount("reports", [reportRow({ storage_bucket: null })]);
    fireEvent.click(await screen.findByRole("button", { name: "Preparar exportação" }));
    await waitFor(() => expect(m.download).toHaveBeenCalledWith("financial-reports", REPORT_PATH, expect.any(AbortSignal)));
  });
});

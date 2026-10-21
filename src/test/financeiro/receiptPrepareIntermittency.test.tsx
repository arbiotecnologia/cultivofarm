import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ tenant: "007bb519-cba0-4704-be2c-cb93ad010048", epoch: 0, reads: 0, download: vi.fn(), edge: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "actor" },
  profile: { user_id: "actor", organization_id: fake.tenant, ativo: true, senha_provisoria: false }, roles: ["financeiro"],
  loading: false, authzReady: true, authzEpoch: fake.epoch, checkAuthzAccess: () => true }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: fake.error, info: fake.info } }));
const RID = "00000000-0000-4000-8000-000000000001";
const PID = "00000000-0000-4000-8000-000000000009";
const row = () => ({ id: RID, payment_id: PID, organization_id: fake.tenant, receipt_year: 2026, receipt_number: "REC-2026-000001",
  storage_bucket: "financial-receipts", storage_path: `${fake.tenant}/2026/REC-2026-000001.pdf`, payment_date: "2026-10-21", amount: 1,
  status: "ISSUED", authenticity_code: "C", issued_at: "2026-10-21" });
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => { const q: any = { single: false };
    for (const m of ["select", "eq", "order", "gte", "lte", "ilike"]) q[m] = () => q;
    q.limit = (n: number) => { q.single = n === 2; return q; };
    q.maybeSingle = () => ({ abortSignal: undefined, then: (r: any) => r({ data: row(), error: null }) });
    q.abortSignal = (_s: AbortSignal) => { const p: any = (async () => { if (q.single) fake.reads++; return { data: [row()], error: null }; })();
      p.maybeSingle = async () => ({ data: row(), error: null }); return p; };
    return q; },
  rpc: () => ({ abortSignal: async () => ({ data: { receipt_id: RID, receipt_number: "REC-2026-000001" }, error: null }) }),
  functions: { invoke: (...a: any[]) => fake.edge(...a) },
} }));
vi.mock("@/lib/authz/authenticatedAttachment", async o => ({ ...await o<typeof import("@/lib/authz/authenticatedAttachment")>(),
  downloadAuthenticatedAttachment: (...a: any[]) => fake.download(...a) }));
import RecibosList from "@/pages/financeiro/RecibosList";
import BaselineList from "../../../scripts/receipt-prepare-intermittency-20261021/baseline/RecibosList";
import { EmitirReciboButton } from "@/components/financeiro/EmitirReciboButton";
import { clearReceiptPrepareDiagnostics, readReceiptPrepareDiagnostics } from "@/lib/financeiro/receiptPrepareDiagnostics";

const PATH = `${fake.tenant}/2026/REC-2026-000001.pdf`;
/** Storage transport that only ends when its own signal aborts or the test releases it. */
const hanging = () => { const pending: Array<{ resolve: () => void; signal: AbortSignal }> = [];
  fake.download.mockImplementation((_b: string, p: string, signal: AbortSignal) => new Promise<Blob>((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    pending.push({ resolve: () => resolve(new Blob([p])), signal });
  }));
  return pending; };
const flush = async () => { await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); }); };
beforeEach(() => {
  fake.epoch = 0; fake.reads = 0; fake.download.mockReset(); fake.edge.mockReset(); fake.error.mockReset(); fake.info.mockReset(); clearReceiptPrepareDiagnostics();
  fake.download.mockImplementation(async (_b: string, p: string) => new Blob([p]));
  fake.edge.mockResolvedValue({ data: { path: PATH, receipt_number: "REC-2026-000001", status: "ISSUED" }, error: null });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:r"), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
const mount = (C: any) => render(<MemoryRouter><C /></MemoryRouter>);

describe("RecibosList preparation intermittency", () => {
  it("Storage failure: baseline still runs post-read as if prepared; candidate stops at bytes with error telemetry", async () => {
    fake.download.mockRejectedValue(new Error("x"));
    const base = mount(BaselineList); fireEvent.click(await base.findByRole("button", { name: "Preparar PDF" }));
    await waitFor(() => expect(fake.reads).toBe(2)); cleanup(); fake.reads = 0; fake.error.mockReset();
    const ui = mount(RecibosList); fireEvent.click(await ui.findByRole("button", { name: "Preparar PDF" }));
    await waitFor(() => expect(fake.error).toHaveBeenCalledWith("Recibo indisponível"));
    expect(fake.reads).toBe(1); expect(ui.queryByRole("button", { name: "Baixar PDF" })).toBeNull();
    expect(readReceiptPrepareDiagnostics().at(-1)).toMatchObject({ source: "list", stage: "bytes", outcome: "error" });
  });

  it("parent timeout during bytes: baseline leaves Storage I/O alive and retry disabled; candidate aborts it and retries", async () => {
    let pending = hanging();
    const base = mount(BaselineList); const b = await base.findByRole("button", { name: "Preparar PDF" });
    vi.useFakeTimers(); fireEvent.click(b); await flush();
    await act(async () => { vi.advanceTimersByTime(15_000); }); await flush();
    expect(pending[0].signal.aborted).toBe(false); expect(b).toBeDisabled();
    vi.useRealTimers(); cleanup(); pending = hanging();
    const ui = mount(RecibosList); const c = await ui.findByRole("button", { name: "Preparar PDF" });
    vi.useFakeTimers(); fireEvent.click(c); await flush();
    await act(async () => { vi.advanceTimersByTime(15_000); }); await flush();
    expect(pending[0].signal.aborted).toBe(true); expect(c).not.toBeDisabled();
    expect(readReceiptPrepareDiagnostics().at(-1)).toMatchObject({ stage: "bytes", outcome: "timeout" });
    vi.useRealTimers();
    fake.download.mockImplementation(async (_b: string, p: string) => new Blob([p]));
    fireEvent.click(c); await ui.findByRole("button", { name: "Baixar PDF" });
  });

  it("retry before the late reply: aborted first transport cannot store bytes or mark prepared", async () => {
    const pending = hanging();
    const ui = mount(RecibosList); const c = await ui.findByRole("button", { name: "Preparar PDF" });
    vi.useFakeTimers(); fireEvent.click(c); await flush();
    await act(async () => { vi.advanceTimersByTime(15_000); }); await flush(); vi.useRealTimers();
    fireEvent.click(c); await flush();
    expect(pending).toHaveLength(2);
    pending[0].resolve(); await flush();
    expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(ui.queryByRole("button", { name: "Baixar PDF" })).toBeNull();
    pending[1].resolve(); await ui.findByRole("button", { name: "Baixar PDF" });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("session renewal during preparation aborts I/O, shows neutral notice and requires a new click", async () => {
    const pending = hanging();
    const ui = mount(RecibosList); fireEvent.click(await ui.findByRole("button", { name: "Preparar PDF" })); await flush();
    fake.epoch = 1; ui.rerender(<MemoryRouter><RecibosList /></MemoryRouter>); await flush();
    expect(pending[0].signal.aborted).toBe(true);
    expect(fake.info).toHaveBeenCalledWith("Sessão atualizada durante o preparo. Prepare o PDF novamente.");
    expect(ui.queryByRole("button", { name: "Baixar PDF" })).toBeNull(); expect(fake.download).toHaveBeenCalledTimes(1);
    expect(readReceiptPrepareDiagnostics().some(d => d.outcome === "fence")).toBe(true);
  });
});

describe("EmitirReciboButton preparation intermittency", () => {
  it("Storage failure never yields Baixar PDF and skips post-read", async () => {
    fake.download.mockRejectedValue(new Error("x"));
    const ui = render(<EmitirReciboButton paymentId={PID} />);
    fireEvent.click(ui.getByRole("button", { name: /Emitir recibo/ }));
    await waitFor(() => expect(fake.error).toHaveBeenCalledWith("Recibo indisponível"));
    expect(fake.reads).toBe(0); expect(ui.queryByRole("button", { name: /Baixar PDF/ })).toBeNull();
    expect(readReceiptPrepareDiagnostics().at(-1)).toMatchObject({ source: "button", stage: "bytes", outcome: "error" });
  });
  it("parent timeout during bytes aborts Storage I/O and the retry is not blocked", async () => {
    const pending = hanging();
    const ui = render(<EmitirReciboButton paymentId={PID} />); const c = ui.getByRole("button", { name: /Emitir recibo/ });
    vi.useFakeTimers(); fireEvent.click(c); await flush();
    await act(async () => { vi.advanceTimersByTime(15_000); }); await flush(); vi.useRealTimers();
    expect(pending[0].signal.aborted).toBe(true); expect(c).not.toBeDisabled();
    fake.download.mockImplementation(async (_b: string, p: string) => new Blob([p]));
    fireEvent.click(c); await ui.findByRole("button", { name: /Baixar PDF/ });
  });
});

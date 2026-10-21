import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ tenant: "007bb519-cba0-4704-be2c-cb93ad010048", status: [] as string[], edge: vi.fn(), download: vi.fn(), error: vi.fn(), lateDownload: null as null | Promise<Blob> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "actor" },
  profile: { user_id: "actor", organization_id: fake.tenant, ativo: true, senha_provisoria: false }, roles: ["financeiro"],
  loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: () => true }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: fake.error, info: vi.fn() } }));
const row = (status: string) => ({ id: "00000000-0000-4000-8000-000000000001", organization_id: fake.tenant, receipt_year: 2026,
  receipt_number: "REC-2026-000001", storage_bucket: "financial-receipts", storage_path: `${fake.tenant}/2026/REC-2026-000001.pdf`,
  payment_date: "2026-10-21", amount: 1, status, authenticity_code: "C", issued_at: "2026-10-21" });
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => { const q: any = { single: false };
    for (const m of ["select", "eq", "order", "gte", "lte", "ilike"]) q[m] = () => q;
    q.limit = (n: number) => { q.single = n === 2; return q; };
    // List read uses the initial status; each fresh status read consumes the next scripted server state.
    q.abortSignal = async () => ({ data: [row(q.single ? (fake.status.length > 1 ? fake.status.shift()! : fake.status[0]) : fake.status[0])], error: null });
    return q; },
  rpc: () => ({ abortSignal: async () => ({ error: null }) }),
  functions: { invoke: (...a: any[]) => fake.edge(...a) },
} }));
vi.mock("@/lib/authz/authenticatedAttachment", async o => ({ ...await o<typeof import("@/lib/authz/authenticatedAttachment")>(),
  downloadAuthenticatedAttachment: (...a: any[]) => fake.download(...a) }));
import RecibosList from "@/pages/financeiro/RecibosList";
import BaselineList from "../../../scripts/receipt-cancel-currency-20261021/baseline/RecibosList";
const ISSUED = `${fake.tenant}/2026/REC-2026-000001.pdf`;
const CANCELED = ISSUED.replace(".pdf", ".canceled.pdf");
beforeEach(() => {
  fake.status = ["ISSUED"]; fake.edge.mockReset(); fake.download.mockReset(); fake.error.mockReset();
  fake.download.mockImplementation(async (_b: string, p: string) => new Blob([p]));
  fake.edge.mockResolvedValue({ data: { path: CANCELED, receipt_number: "REC-2026-000001", status: "CANCELED" }, error: null });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:r"), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const mount = (C: any) => render(<MemoryRouter><C /></MemoryRouter>);

describe("canceled receipt never served as the earlier ISSUED PDF", () => {
  it("baseline reproduces the real failure: CANCELED with storage_path opens ISSUED bytes without Edge", async () => {
    fake.status = ["CANCELED"]; const ui = mount(BaselineList);
    fireEvent.click(await ui.findByRole("button", { name: "Preparar PDF" }));
    await ui.findByRole("button", { name: "Baixar PDF" });
    expect(fake.edge).not.toHaveBeenCalled(); expect(fake.download.mock.calls[0][1]).toBe(ISSUED);
  });
  it("runtime renders CANCELED via Edge and opens only the status-bound CANCELED object", async () => {
    fake.status = ["CANCELED"]; const ui = mount(RecibosList);
    fireEvent.click(await ui.findByRole("button", { name: "Preparar PDF" }));
    fireEvent.click(await ui.findByRole("button", { name: "Baixar PDF" }));
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1));
    expect(fake.edge).toHaveBeenCalledTimes(1); expect(fake.download.mock.calls.map(c => c[1])).toEqual([CANCELED]);
  });
  it("Edge v91 response (ISSUED path, no status) for a CANCELED receipt fails closed", async () => {
    fake.status = ["CANCELED"]; fake.edge.mockResolvedValue({ data: { path: ISSUED, receipt_number: "REC-2026-000001" }, error: null });
    const ui = mount(RecibosList); fireEvent.click(await ui.findByRole("button", { name: "Preparar PDF" }));
    await waitFor(() => expect(fake.error).toHaveBeenCalledWith("Recibo indisponível")); expect(fake.download).not.toHaveBeenCalled();
  });
  it("cancel in another session after preparation: download click re-checks and revokes prepared ISSUED bytes", async () => {
    fake.status = ["ISSUED", "ISSUED", "CANCELED"]; const ui = mount(RecibosList);
    fireEvent.click(await ui.findByRole("button", { name: "Preparar PDF" }));
    fireEvent.click(await ui.findByRole("button", { name: "Baixar PDF" }));
    await waitFor(() => expect(fake.error).toHaveBeenCalledWith("Recibo atualizado. Prepare o PDF novamente."));
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:r");
    expect(await ui.findByRole("button", { name: "Preparar PDF" })).toBeTruthy();
  });
  it("cancel concurrent with preparation (late bytes) discards them instead of offering download", async () => {
    fake.status = ["ISSUED", "CANCELED"]; const ui = mount(RecibosList);
    fireEvent.click(await ui.findByRole("button", { name: "Preparar PDF" }));
    await waitFor(() => expect(fake.error).toHaveBeenCalledWith("Recibo atualizado. Prepare o PDF novamente."));
    await act(async () => {}); expect(ui.queryByRole("button", { name: "Baixar PDF" })).toBeNull();
    expect(fake.download.mock.calls.map(c => c[1])).toEqual([ISSUED]);
  });
  it("ISSUED with generated path keeps existing behavior without Edge", async () => {
    const ui = mount(RecibosList); fireEvent.click(await ui.findByRole("button", { name: "Preparar PDF" }));
    await ui.findByRole("button", { name: "Baixar PDF" }); expect(fake.edge).not.toHaveBeenCalled();
  });
});

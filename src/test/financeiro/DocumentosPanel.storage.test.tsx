import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthzEpochMonitor } from "@/lib/authz/authzEpochMonitor";

const fake = vi.hoisted(() => ({
  ready: true, tenant: "007bb519-cba0-4704-be2c-cb93ad010048", uid: "actor", epoch: 0, role: "administrador",
  check: () => true as boolean, upload: vi.fn(), insert: vi.fn(), rpc: vi.fn(), success: vi.fn(), error: vi.fn(), remove: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: fake.uid }, role: fake.role, roles: [fake.role], loading: false, authzReady: fake.ready, authzEpoch: fake.epoch,
  profile: { user_id: fake.uid, organization_id: fake.tenant, ativo: true, senha_provisoria: false }, checkAuthzAccess: () => fake.check(),
}) }));
vi.mock("sonner", () => ({ toast: { success: fake.success, error: fake.error } }));
const OWNER = "00000000-0000-4000-8000-000000000001";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ upload: fake.upload, remove: fake.remove }) }, rpc: fake.rpc,
  from: () => ({ insert: fake.insert, select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ order: async () => ({
    data: [{ id: "doc", file_name: "test.txt", document_type: "OTHER", storage_path: "RECEIVABLE/owner/test.txt" }], error: null,
  }) }) }) }) }) }),
} }));
import { DocumentosPanel } from "@/components/financeiro/DocumentosPanel";
import { financialDocumentStoragePath } from "@/lib/financeiro/documentStoragePath";

beforeEach(() => {
  Object.assign(fake, { ready: true, tenant: "007bb519-cba0-4704-be2c-cb93ad010048", uid: "actor", epoch: 0, role: "administrador", check: () => true });
  for (const mock of [fake.upload, fake.insert, fake.rpc, fake.success, fake.error, fake.remove]) mock.mockReset();
  fake.upload.mockResolvedValue({ error: null }); fake.insert.mockResolvedValue({ error: null }); fake.rpc.mockResolvedValue({ data: "doc", error: null });
});
afterEach(cleanup);
function setup(ownerType: "RECEIVABLE" | "DELIVERY" = "RECEIVABLE") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const changed = vi.fn(); const invalidate = vi.spyOn(qc, "invalidateQueries");
  const tree = () => <QueryClientProvider client={qc}><DocumentosPanel ownerType={ownerType} ownerId={OWNER} defaultType="OTHER" canDelete onChanged={changed} /></QueryClientProvider>;
  const ui = render(tree());
  return { ...ui, changed, invalidate, rerenderContext: () => ui.rerender(tree()) };
}
function send(ui: ReturnType<typeof setup>, name = "auditoria.txt") {
  const input = ui.container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input absent");
  fireEvent.change(input, { target: { files: [new File(["ficticio"], name, { type: "text/plain" })] } });
}
function deferred() {
  let resolve: (v: { error: { message: string } | null }) => void = () => {};
  const promise = new Promise<{ error: { message: string } | null }>(r => { resolve = r; });
  return { promise, resolve };
}
function noPublication(ui: ReturnType<typeof setup>) {
  expect(fake.success).not.toHaveBeenCalled(); expect(ui.changed).not.toHaveBeenCalled(); expect(ui.invalidate).not.toHaveBeenCalled();
  expect(fake.remove).not.toHaveBeenCalled();
}

describe("financial-docs owner path contract (real path builder)", () => {
  it.each(["RECEIVABLE", "PAYABLE", "PAYMENT_RECEIVABLE", "PAYMENT_PAYABLE", "FISCAL_INVOICE"])("generates strict three-segment %s paths without tenant prefix", owner => {
    const path = financialDocumentStoragePath(owner, OWNER, "ação teste.txt");
    expect(path.split("/")).toHaveLength(3); expect(path.split("/").slice(0, 2)).toEqual([owner, OWNER]);
    expect(path).toMatch(/\/[0-9a-f-]{36}-acao_teste\.txt$/); expect(path).not.toMatch(/(^\/|\/$|\/\/|\\|%|[\x00-\x1f])/);
    expect(financialDocumentStoragePath(owner, OWNER, "ação teste.txt")).not.toBe(path);
  });
  it.each(["../a.txt", "a/b.txt", "a\\b.txt", "%2e%2e.txt", "a\u0000.txt", "..", "", " ", "😀", "a".repeat(181)])("rejects malformed basename %j", name => {
    expect(() => financialDocumentStoragePath("RECEIVABLE", OWNER, name)).toThrow();
  });
  it.each(["DELIVERY", "FINANCIAL_RECEIPT", "REPORT_EXPORT", "receivable"])("rejects unsupported owner %s", owner => {
    expect(() => financialDocumentStoragePath(owner, OWNER, "a.txt")).toThrow();
  });
  it.each(["owner", OWNER + "/..", "", "../" + OWNER])("rejects malformed owner UUID %s", id => {
    expect(() => financialDocumentStoragePath("RECEIVABLE", id, "a.txt")).toThrow();
  });
});

describe("DocumentosPanel existing upload/metadata/soft-delete flow with real scope fence", () => {
  it("uploads canonical path then metadata without invented organization; succeeds only afterward", async () => {
    fake.role = "financeiro"; const ui = setup(); send(ui);
    await waitFor(() => expect(ui.changed).toHaveBeenCalledTimes(1));
    const path = fake.upload.mock.calls[0][0]; expect(path.split("/").slice(0, 2)).toEqual(["RECEIVABLE", OWNER]);
    expect(fake.upload.mock.calls[0][2]).toEqual({ upsert: false });
    expect(fake.insert.mock.calls[0][0]).toMatchObject({ owner_type: "RECEIVABLE", owner_id: OWNER, storage_path: path, uploaded_by: "actor", document_type: "OTHER" });
    expect(fake.insert.mock.calls[0][0]).not.toHaveProperty("organization_id");
    expect(fake.upload.mock.invocationCallOrder[0]).toBeLessThan(fake.insert.mock.invocationCallOrder[0]);
    expect(fake.insert.mock.invocationCallOrder[0]).toBeLessThan(fake.success.mock.invocationCallOrder[0]);
  });
  it("does not allow DELIVERY upload or remove", async () => {
    const ui = setup("DELIVERY"); send(ui); await ui.findByRole("button", { name: "Remover documento" });
    fireEvent.click(ui.getByRole("button", { name: "Remover documento" }));
    expect(fake.upload).not.toHaveBeenCalled(); expect(fake.rpc).not.toHaveBeenCalled(); noPublication(ui);
  });
  it("does not mint upload/remove after lease expiry even without a rerender", async () => {
    let clock = 0;
    const monitor = createAuthzEpochMonitor({ fetcher: async () => ({ eligible: true, fingerprint: "same" }), now: () => clock,
      setTimeoutFn: () => 1, clearTimeoutFn: () => {}, onEpochChange: () => {}, onExpire: () => {}, isVisible: () => true, isOnline: () => true });
    monitor.start(); await act(async () => { await Promise.resolve(); }); fake.check = monitor.checkAccess;
    const ui = setup(); await ui.findByRole("button", { name: "Remover documento" }); clock = 15_000;
    send(ui); fireEvent.click(ui.getByRole("button", { name: "Remover documento" }));
    expect(fake.upload).not.toHaveBeenCalled(); expect(fake.rpc).not.toHaveBeenCalled(); noPublication(ui); ui.unmount(); monitor.stop();
  });
  it("disables actions while context is invalid", () => {
    fake.ready = false; const ui = setup(); expect(ui.getByRole("button", { name: "Anexar" })).toBeDisabled(); send(ui);
    expect(fake.upload).not.toHaveBeenCalled(); noPublication(ui);
  });
  for (const phase of ["upload", "metadata", "remove"] as const) {
    it.each(["revoke", "tenant", "uid", "unmount", "epoch"])(`fences ${phase} completion on %s`, async change => {
      const late = deferred(); const ui = setup();
      if (phase === "upload") fake.upload.mockReturnValue(late.promise);
      if (phase === "metadata") fake.insert.mockReturnValue(late.promise);
      if (phase === "remove") {
        fake.rpc.mockReturnValue(late.promise);
        fireEvent.click(await ui.findByRole("button", { name: "Remover documento" }));
        await waitFor(() => expect(fake.rpc).toHaveBeenCalledTimes(1));
      } else {
        send(ui); await waitFor(() => expect(phase === "upload" ? fake.upload : fake.insert).toHaveBeenCalledTimes(1));
      }
      if (change === "revoke") fake.check = () => false;
      if (change === "tenant") { fake.tenant = "tenant-B"; ui.rerenderContext(); }
      if (change === "uid") { fake.uid = "other"; ui.rerenderContext(); }
      if (change === "epoch") { fake.epoch++; ui.rerenderContext(); }
      if (change === "unmount") ui.unmount();
      await act(async () => { late.resolve({ error: null }); await new Promise(r => setTimeout(r, 10)); });
      if (phase === "upload") expect(fake.insert).not.toHaveBeenCalled();
      noPublication(ui); expect(fake.error).not.toHaveBeenCalled();
    });
  }
  it.each(["upload", "metadata", "remove"])("reports %s failure without success or destructive cleanup", async phase => {
    const ui = setup();
    (phase === "upload" ? fake.upload : phase === "metadata" ? fake.insert : fake.rpc).mockResolvedValue({ error: { message: "RLS denied" } });
    if (phase === "remove") fireEvent.click(await ui.findByRole("button", { name: "Remover documento" })); else send(ui);
    await waitFor(() => expect(fake.error).toHaveBeenCalledWith("RLS denied")); noPublication(ui);
    if (phase === "upload") expect(fake.insert).not.toHaveBeenCalled();
  });
  it("preserves canonical soft-delete RPC and only publishes its current completion", async () => {
    const ui = setup(); fireEvent.click(await ui.findByRole("button", { name: "Remover documento" }));
    await waitFor(() => expect(ui.changed).toHaveBeenCalledTimes(1));
    expect(fake.rpc).toHaveBeenCalledWith("rpc_financial_document_soft_delete", { p_document_id: "doc", p_reason: "Removido pelo usuário" });
    expect(fake.remove).not.toHaveBeenCalled();
  });
  it("malformed upload fails before any server mutation", async () => {
    const ui = setup(); send(ui, "../bad.txt"); await waitFor(() => expect(fake.error).toHaveBeenCalled());
    expect(fake.upload).not.toHaveBeenCalled(); expect(fake.insert).not.toHaveBeenCalled(); noPublication(ui);
  });
});
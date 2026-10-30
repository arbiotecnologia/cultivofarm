import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const t = vi.hoisted(() => ({ auth: {} as any, reads: [] as any[], writer: vi.fn(), toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => t.auth }));
vi.mock("@/hooks/useEsteiraLaboratorio", () => ({ useEsteiraLaboratorio: () => ({ registrarEnvaseTransacional: t.writer }) }));
vi.mock("sonner", () => ({ toast: t.toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (_name: string, a: any) => Promise.resolve({ error: null, data: { capability: "envase_isolated_v1", available: true, actor_id: t.auth.user.id, organization_id: t.auth.profile.organization_id, lote_id: a.p_lote, os_id: a.p_os, programacao_id: a.p_prog } }),
  from: (table: string) => {
    let resolve: (value: any) => void = () => {};
    const promise = new Promise(r => { resolve = r; });
    t.reads.push({ table, resolve });
    const query: any = { select: () => query, eq: () => query, maybeSingle: () => promise, then: promise.then.bind(promise) };
    return query;
  },
} }));
import { RegistrarEnvaseDialog } from "@/components/cockpit/RegistrarEnvaseDialog";
const target = { lote_id: "lot-A", os_id: "os-A", programacao_id: "pp-A", origem: "manual", codigo_lote: "A" };
const auth = (org = "A", epoch = 0) => ({ user: { id: "actor" }, profile: { user_id: "actor", organization_id: org, ativo: true, senha_provisoria: false }, roles: ["producao"], authzReady: true, authzEpoch: epoch, loading: false });
beforeEach(() => { vi.clearAllMocks(); t.reads = []; t.auth = auth(); });
async function complete(start = 0, volume = 9000, errorTable?: string) {
  await act(async () => {
    for (const r of t.reads.slice(start, start + 4)) r.resolve({ error: r.table === errorTable ? { message: "failed" } : null, data: r.table === "lotes" ? { volume_produzido: volume } : r.table === "programacao_producao" ? { volume_necessario: 12000 } : [] });
  });
}
const submit = () => screen.getByRole("button", { name: "Registrar envase e avançar esteira" });
describe("RegistrarEnvaseDialog current reads and ACK", () => {
  it.each(["target", "actor", "tenant", "epoch", "close", "ABA"])("discards old four responses after %s change", async kind => {
    const closed = vi.fn();
    const view = render(<RegistrarEnvaseDialog open target={target} onOpenChange={closed} />);
    expect(submit()).toBeDisabled();
    let next = target;
    if (kind === "target" || kind === "ABA") next = { ...target, lote_id: "lot-B", os_id: "os-B", programacao_id: "pp-B" };
    if (kind === "tenant") t.auth = auth("B");
    if (kind === "actor") t.auth = { ...auth(), user: { id: "other" }, profile: { ...auth().profile, user_id: "other" } };
    if (kind === "epoch") t.auth = auth("A", 1);
    view.rerender(<RegistrarEnvaseDialog open={kind !== "close"} target={next} onOpenChange={closed} />);
    if (kind === "ABA") view.rerender(<RegistrarEnvaseDialog open target={target} onOpenChange={closed} />);
    await complete(0, 99000);
    expect(screen.queryByText("99 L")).not.toBeInTheDocument();
    if (kind !== "close") expect(submit()).toBeDisabled();
    expect(t.writer).not.toHaveBeenCalled();
  });
  it.each(["lotes", "envase", "programacao_producao", "estoque_produto"])("failed %s read blocks even programmatic submit", async table => {
    render(<RegistrarEnvaseDialog open target={target} onOpenChange={vi.fn()} />);
    await complete(0, 9000, table);
    expect(screen.getByRole("alert")).toBeInTheDocument(); expect(submit()).toBeDisabled();
    fireEvent.submit(submit().closest("form") as HTMLFormElement);
    expect(t.writer).not.toHaveBeenCalled();
  });
  it("invalidates ready data immediately and waits for all four new reads", async () => {
    const view = render(<RegistrarEnvaseDialog open target={target} onOpenChange={vi.fn()} />);
    await complete(); await waitFor(() => expect(submit()).toBeEnabled());
    expect(screen.getAllByText("9 L").length).toBeGreaterThan(0);
    view.rerender(<RegistrarEnvaseDialog open target={{ ...target, os_id: "new-os" }} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("9 L")).not.toBeInTheDocument(); expect(submit()).toBeDisabled();
    await act(async () => { t.reads[4].resolve({ data: { volume_produzido: 5000 }, error: null }); });
    expect(submit()).toBeDisabled(); expect(t.writer).not.toHaveBeenCalled();
  });
  it.each([
    ["partial", 0, { success: false, motivo: "COCKPIT_ENVASE_PARCIAL_NAO_AVANCA" }],
    ["completed", 6000, { success: true, status: "pronto_entrega" }],
  ])("uses %s ACK rather than remaining lot balance", async (estado, saldo_restante_ml, avanco) => {
    t.writer.mockResolvedValueOnce({ estado, saldo_restante_ml, avanco });
    const close = vi.fn(); render(<RegistrarEnvaseDialog open target={target} onOpenChange={close} />);
    await complete(); await waitFor(() => expect(submit()).toBeEnabled());
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.click(submit()); await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    if (estado === "partial") { expect(t.toast.warning).toHaveBeenCalled(); expect(t.toast.success).not.toHaveBeenCalled(); }
    else { expect(t.toast.success).toHaveBeenCalledWith("Envase registrado. OS pronta para entrega."); }
    expect(JSON.stringify(t.toast.success.mock.calls)).not.toMatch(/complementar|página Envase/);
  });
  it("late ACK after closing does not announce or close another opening", async () => {
    let resolve: (v: any) => void = () => {}; t.writer.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const close = vi.fn(); const view = render(<RegistrarEnvaseDialog open target={target} onOpenChange={close} />);
    await complete(); await waitFor(() => expect(submit()).toBeEnabled()); fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } }); fireEvent.click(submit());
    view.rerender(<RegistrarEnvaseDialog open={false} target={target} onOpenChange={close} />);
    await act(async () => { resolve({ estado: "completed", avanco: { success: true, status: "pronto_entrega" } }); });
    expect(close).not.toHaveBeenCalled(); expect(t.toast.success).not.toHaveBeenCalled();
  });
});
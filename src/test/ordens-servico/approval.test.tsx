import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OSDetalhesDialog } from "@/components/ordens-servico/OSDetalhesDialog";
const f = vi.hoisted(() => ({ roles: ["administrador"], current: true, rpc: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ roles: f.roles }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ ready: f.current, scope: String(f.current), capture: () => () => f.current }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => ({ abortSignal: () => f.rpc(...args) }) } }));
vi.mock("sonner", () => ({ toast: { success: f.success, error: f.error } }));
vi.mock("@/components/ordens-servico/RastreabilidadeProducaoTab", () => ({ RastreabilidadeProducaoTab: () => null }));
const os = { id: "00000000-0000-4000-8000-000000000001", origem: "manual", status: "aberta" };
beforeEach(() => { vi.clearAllMocks(); f.roles = ["administrador"]; f.current = true; f.rpc.mockResolvedValue({ data: { success: true, status: "aprovada", replay: false }, error: null }); });
describe("aprovação existente — transporte fake, não homologação", () => {
  it("usa assinatura existente e bloqueia duplo clique sem iniciar programação", async () => {
    let finish: (value: unknown) => void = () => {};
    f.rpc.mockImplementation(() => new Promise((r) => { finish = r; }));
    render(<OSDetalhesDialog os={os} open onOpenChange={() => {}} />);
    const button = screen.getByRole("button", { name: "Aprovar OS" });
    fireEvent.click(button); fireEvent.click(button);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith("rpc_aprovar_os_v1", { p_os_id: os.id, p_origem: "manual" });
    await act(async () => finish({ data: { success: true, status: "aprovada" }, error: null }));
    expect(f.success).toHaveBeenCalledTimes(1);
  });
  it.each(["financeiro", "producao", "consultor_tecnico", "operador_onfarm"])("não monta aprovação para %s", (role) => {
    f.roles = [role]; render(<OSDetalhesDialog os={os} open onOpenChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Aprovar OS" })).toBeNull();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("não abre B2B por alias", () => {
    render(<OSDetalhesDialog os={{ ...os, origem: "b2b" }} open onOpenChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Aprovar OS" })).toBeNull();
  });
  it.each([{ data: { success: false }, error: null }, { data: null, error: { code: "42501" } }, { data: { success: true, status: "programada" }, error: null }])("não confirma resposta inválida/negada", async (response) => {
    f.rpc.mockResolvedValue(response); render(<OSDetalhesDialog os={os} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar OS" }));
    await waitFor(() => expect(f.error).toHaveBeenCalledTimes(1)); expect(f.success).not.toHaveBeenCalled();
  });
  it("descarta resposta tardia após revogação", async () => {
    let finish: (value: unknown) => void = () => {};
    f.rpc.mockImplementation(() => new Promise((r) => { finish = r; }));
    const view = render(<OSDetalhesDialog os={os} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar OS" }));
    f.current = false; view.rerender(<OSDetalhesDialog os={os} open onOpenChange={() => {}} />);
    await act(async () => finish({ data: { success: true, status: "aprovada" }, error: null }));
    expect(f.success).not.toHaveBeenCalled(); expect(f.error).not.toHaveBeenCalled();
  });
});

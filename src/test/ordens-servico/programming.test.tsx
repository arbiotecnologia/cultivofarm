import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OSDetalhesDialog } from "@/components/ordens-servico/OSDetalhesDialog";
const f = vi.hoisted(() => ({ roles: ["administrador"], current: true, epoch: 0, rpc: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ roles: f.roles }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ ready: f.current, scope: String(f.epoch), capture: () => { const epoch = f.epoch; return () => f.current && epoch === f.epoch; } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => ({ abortSignal: () => f.rpc(...args) }) } }));
vi.mock("sonner", () => ({ toast: { success: f.success, error: f.error } }));
vi.mock("@/components/ordens-servico/RastreabilidadeProducaoTab", () => ({ RastreabilidadeProducaoTab: () => null }));
const os = { id: "00000000-0000-4000-8000-000000000001", origem: "manual", status: "aprovada" };
const props = { os, open: true, onOpenChange: () => {} };
beforeEach(() => { vi.clearAllMocks(); f.roles = ["administrador"]; f.current = true; f.epoch = 0; f.rpc.mockResolvedValue({ data: { success: true, status: "programada" }, error: null }); });
describe("programação inicial existente — transporte fake, não homologação", () => {
  it.each(["onfarm", "on_farm", "ordem_servico_onfarm"])("%s mantém origem onfarm", async (origem) => {
    render(<OSDetalhesDialog {...props} os={{ ...os, origem }} />);
    fireEvent.change(screen.getByLabelText("Data programada"), { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Programar OS" }));
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith("rpc_programar_os_v1", { p_os_id: os.id, p_origem: "onfarm", p_data_programada: "2026-10-20" }));
  });
  it("nega origem desconhecida sem inferir tabela", () => {
    render(<OSDetalhesDialog {...props} os={{ ...os, origem: "unknown" }} />);
    expect(screen.queryByRole("button", { name: "Programar OS" })).toBeNull();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each(["administrador", "gestor", "producao"])("%s envia data explícita uma vez, sem aprovação/fabricação", async (role) => {
    f.roles = [role];
    let finish: (value: unknown) => void = () => {};
    f.rpc.mockImplementation(() => new Promise((r) => { finish = r; }));
    render(<OSDetalhesDialog {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Programar OS" }));
    expect(f.rpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Data programada"), { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Programar OS" }));
    fireEvent.click(screen.getByRole("button", { name: "Programar OS" }));
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith("rpc_programar_os_v1", { p_os_id: os.id, p_origem: "manual", p_data_programada: "2026-10-20" });
    await act(async () => finish({ data: { success: true, status: "programada" }, error: null }));
    expect(f.success).toHaveBeenCalledTimes(1);
  });
  it.each(["administrativo", "financeiro", "consultor_tecnico", "operador_onfarm", "parceiro_b2b"])("nega %s", (role) => {
    f.roles = [role]; render(<OSDetalhesDialog {...props} />);
    expect(screen.queryByRole("button", { name: "Programar OS" })).toBeNull();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each(["aberta", "programada", "em_producao", "finalizada"])("não programa estado %s", (status) => {
    render(<OSDetalhesDialog {...props} os={{ ...os, status }} />);
    expect(screen.queryByRole("button", { name: "Programar OS" })).toBeNull();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each([{ origem: "b2b" }, { partner_order_id: "linked" }, { partner_order_item_id: "linked" }])("nega vínculos B2B", (linked) => {
    render(<OSDetalhesDialog {...props} os={{ ...os, ...linked }} />);
    expect(screen.queryByRole("button", { name: "Programar OS" })).toBeNull();
  });
  it.each([{ data: null, error: { code: "42501" } }, { data: { success: false }, error: null }, { data: { success: true, status: "em_producao" }, error: null }])("não confirma negativa/resposta incompatível", async (result) => {
    f.rpc.mockResolvedValue(result); render(<OSDetalhesDialog {...props} />);
    fireEvent.change(screen.getByLabelText("Data programada"), { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Programar OS" }));
    await waitFor(() => expect(f.error).toHaveBeenCalledTimes(1)); expect(f.success).not.toHaveBeenCalled();
  });
  it("descarta resposta e data após troca/revogação de escopo", async () => {
    let finish: (value: unknown) => void = () => {};
    f.rpc.mockImplementation(() => new Promise((r) => { finish = r; }));
    const view = render(<OSDetalhesDialog {...props} />);
    fireEvent.change(screen.getByLabelText("Data programada"), { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Programar OS" }));
    f.current = false; f.epoch++; view.rerender(<OSDetalhesDialog {...props} />);
    await act(async () => finish({ data: { success: true, status: "programada" }, error: null }));
    f.current = true; view.rerender(<OSDetalhesDialog {...props} />);
    expect(screen.getByLabelText("Data programada")).toHaveValue("");
    expect(f.success).not.toHaveBeenCalled(); expect(f.error).not.toHaveBeenCalled();
  });
});
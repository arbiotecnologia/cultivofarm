import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GerarLoteDialog, litrosParaMl } from "@/components/cockpit/GerarLoteDialog";
import { OSDetalhesDialog } from "@/components/ordens-servico/OSDetalhesDialog";

// Transporte e sessão FAKE: prova comportamento do cliente, não homologação JWT/RLS real.
const f = vi.hoisted(() => ({ roles: ["administrador"], current: true, epoch: 0, rpc: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn(), invalidate: vi.fn(), trace: null as any }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ roles: f.roles, user: { id: "u" } }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ get ready() { return f.current; }, scope: String(f.epoch), capture: () => { const epoch = f.epoch; return () => f.current && epoch === f.epoch; } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => { const p = f.rpc(...args); return Object.assign(Promise.resolve(p), { abortSignal: () => p }); } } }));
vi.mock("sonner", () => ({ toast: { success: f.success, error: f.error, info: f.info } }));
vi.mock("@/hooks/useCockpitQuery", () => ({ useCockpitQuery: () => ({ data: [] }), COCKPIT_LIST_RPC: "rpc_cockpit_listar_esteira_v1" }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: f.invalidate }) }));
vi.mock("@/components/ordens-servico/RastreabilidadeProducaoTab", async () => {
  const { useEffect } = await import("react");
  return { RastreabilidadeProducaoTab: ({ onItem }: { onItem?: (i: unknown) => void }) => { useEffect(() => { onItem?.(f.trace); }, [onItem]); return null; } };
});

const PP = "00000000-0000-4000-8000-0000000000aa";
const OS = "00000000-0000-4000-8000-000000000001";
const target = { programacao_id: PP, os_id: OS, origem: "manual", numero_os: "OS-1", volume_solicitado: 0.1 };
const ok = { data: { success: true, replay: false, lote_id: "00000000-0000-4000-8000-0000000000bb", codigo_lote: "LT-2026-0001" }, error: null };
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Registrar Lote" }));
beforeEach(() => {
  vi.clearAllMocks(); f.roles = ["administrador"]; f.current = true; f.epoch = 0; f.rpc.mockResolvedValue(ok);
  f.trace = { os_id: OS, origem_os: "manual", status_os: "programada", codigo_lote: null, programacao_id: PP, volume_solicitado_l: 0.1, numero_os: "OS-1" };
});

describe("conversão L -> mL", () => {
  it.each([["0,1", 100], ["0.1", 100], ["1", 1000], ["2.5", 2500], ["0.0005", 0.5]])("%s L = %s mL", (l, ml) => expect(litrosParaMl(l as string)).toBe(ml));
  it.each(["", "0", "-1", "abc", "1e3", "1,2,3", "Infinity"])("rejeita %s", (v) => expect(litrosParaMl(v)).toBeNull());
});

describe("GerarLoteDialog — cercas de sessão e resposta", () => {
  it("envia mL e somente campos permitidos; confirma uma vez", async () => {
    const onCreated = vi.fn(); const onOpenChange = vi.fn();
    render(<GerarLoteDialog open target={target} onOpenChange={onOpenChange} onCreated={onCreated} />);
    expect(screen.getByLabelText("Volume Produzido (L)")).toHaveValue("0.1");
    fireEvent.change(screen.getByLabelText("Tanque"), { target: { value: " TQ-01 " } });
    submit();
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(f.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = f.rpc.mock.calls[0];
    expect(name).toBe("rpc_cockpit_gerar_lote_v1");
    expect(args).toEqual({ p_programacao_id: PP, p_os_id: OS, p_origem: "manual", p_lote: { volume_produzido: 100, responsavel_producao: null, tanque: "TQ-01", observacoes_tecnicas: null } });
    expect(Object.keys(args.p_lote)).not.toEqual(expect.arrayContaining(["codigo_lote", "produto_id", "microrganismo_id", "data_producao", "custo_producao_estimado", "organization_id"]));
    expect(f.success).toHaveBeenCalledTimes(1); expect(f.invalidate).toHaveBeenCalled(); expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("volume inválido não chama o servidor", () => {
    render(<GerarLoteDialog open target={target} onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("Volume Produzido (L)"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Registrar Lote" })).toBeDisabled();
    submit(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("sem sessão pronta não chama o servidor", () => {
    f.current = false; render(<GerarLoteDialog open target={target} onOpenChange={() => {}} />);
    submit(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("clique duplo gera uma única chamada", async () => {
    let finish: (v: unknown) => void = () => {};
    f.rpc.mockImplementation(() => new Promise((r) => { finish = r; }));
    render(<GerarLoteDialog open target={target} onOpenChange={() => {}} />);
    submit(); submit();
    expect(f.rpc).toHaveBeenCalledTimes(1);
    await act(async () => finish(ok));
  });
  it.each(["revogação", "troca de tenant/época"])("%s durante o await: sem sucesso, cache ou onCreated", async () => {
    let finish: (v: unknown) => void = () => {};
    f.rpc.mockImplementation(() => new Promise((r) => { finish = r; }));
    const onCreated = vi.fn();
    const view = render(<GerarLoteDialog open target={target} onOpenChange={() => {}} onCreated={onCreated} />);
    submit();
    f.current = false; f.epoch++; view.rerender(<GerarLoteDialog open target={target} onOpenChange={() => {}} onCreated={onCreated} />);
    await act(async () => finish(ok));
    expect(onCreated).not.toHaveBeenCalled(); expect(f.success).not.toHaveBeenCalled(); expect(f.error).not.toHaveBeenCalled(); expect(f.info).not.toHaveBeenCalled(); expect(f.invalidate).not.toHaveBeenCalled();
  });
  it("erro tardio após revogação também é silenciado", async () => {
    let fail: (e: unknown) => void = () => {};
    f.rpc.mockImplementation(() => new Promise((_, r) => { fail = r; }));
    const view = render(<GerarLoteDialog open target={target} onOpenChange={() => {}} />);
    submit(); f.current = false; f.epoch++; view.rerender(<GerarLoteDialog open target={target} onOpenChange={() => {}} />);
    await act(async () => fail(new Error("network")));
    expect(f.error).not.toHaveBeenCalled();
  });
  it.each([
    { data: { success: false, message: "Já existe lote com dados diferentes para esta programação; nada foi alterado." }, error: null },
    { data: null, error: { message: "COCKPIT_LOTE_SCOPE_DENIED" } },
    { data: { success: true, replay: false, lote_id: "x", codigo_lote: "LOTE-1" }, error: null },
    { data: { success: true, lote_id: "x", codigo_lote: "LT-2026-0001" }, error: null },
    { data: [ok.data], error: null },
  ])("negativa ou resposta incompatível não confirma", async (result) => {
    f.rpc.mockResolvedValue(result); const onCreated = vi.fn();
    render(<GerarLoteDialog open target={target} onOpenChange={() => {}} onCreated={onCreated} />);
    submit();
    await waitFor(() => expect(f.error).toHaveBeenCalledTimes(1));
    expect(onCreated).not.toHaveBeenCalled(); expect(f.success).not.toHaveBeenCalled(); expect(f.invalidate).not.toHaveBeenCalled();
  });
  it("replay idêntico informa o lote existente", async () => {
    f.rpc.mockResolvedValue({ data: { ...ok.data, replay: true }, error: null }); const onCreated = vi.fn();
    render(<GerarLoteDialog open target={target} onOpenChange={() => {}} onCreated={onCreated} />);
    submit();
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(f.info).toHaveBeenCalledTimes(1); expect(f.success).not.toHaveBeenCalled();
  });
});

describe("OSDetalhesDialog — botão Gerar lote (somente exibição; servidor decide)", () => {
  const os = { id: OS, origem: "manual", status: "programada", numero_os: "OS-1" };
  const view = (extra: object = {}) => render(<OSDetalhesDialog os={{ ...os, ...extra }} open onOpenChange={() => {}} />);
  it.each(["administrador", "gestor", "producao"])("%s vê o botão para OS manual programada sem lote", async (role) => {
    f.roles = [role]; view();
    expect(await screen.findByRole("button", { name: "Gerar lote" })).toBeInTheDocument();
  });
  it.each(["financeiro", "operador_onfarm", "consultor_tecnico", "parceiro_b2b"])("%s não vê", (role) => {
    f.roles = [role]; view(); expect(screen.queryByRole("button", { name: "Gerar lote" })).toBeNull();
  });
  it.each([
    ["lote já existe", { codigo_lote: "LT-2026-0001" }],
    ["OS aprovada (não programada)", { status_os: "aprovada" }],
    ["leitura de outra OS", { os_id: "00000000-0000-4000-8000-000000000999" }],
    ["sem programação", { programacao_id: null }],
    ["onfarm", { origem_os: "onfarm" }],
  ])("oculto quando %s", (_, change) => {
    f.trace = { ...f.trace, ...change }; view(); expect(screen.queryByRole("button", { name: "Gerar lote" })).toBeNull();
  });
  it("oculto sem leitura disponível", () => { f.trace = null; view(); expect(screen.queryByRole("button", { name: "Gerar lote" })).toBeNull(); });
  it.each([{ origem: "b2b" }, { partner_order_id: "p" }, { origem: "onfarm" }])("oculto para vínculos fechados", (extra) => {
    view(extra); expect(screen.queryByRole("button", { name: "Gerar lote" })).toBeNull();
  });
  it("sessão revogada oculta o botão", () => { f.current = false; view(); expect(screen.queryByRole("button", { name: "Gerar lote" })).toBeNull(); });
});

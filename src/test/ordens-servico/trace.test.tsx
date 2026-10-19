import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ available: true, rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: f.from, rpc: (...a: unknown[]) => ({ abortSignal: () => f.rpc(...a) }) } }));
vi.mock("@/hooks/useCockpitQuery", async () => {
  const rq = await import("@tanstack/react-query");
  return { COCKPIT_LIST_RPC: "rpc_cockpit_listar_esteira_v1", useCockpitQuery: (o: any) => {
    const r = rq.useQuery({ ...o, enabled: f.available && o.enabled !== false, retry: false, queryFn: ({ signal }: any) => o.queryFn({ signal }) });
    return { ...r, available: f.available };
  } };
});
import { RastreabilidadeProducaoTab } from "@/components/ordens-servico/RastreabilidadeProducaoTab";
const id = "00000000-0000-4000-8000-000000000001";
const renderTab = (props: any = {}) => render(<QueryClientProvider client={new QueryClient()}><RastreabilidadeProducaoTab osId={id} osTipo="manual" numeroOS="OS-2026-000001" {...props} /></QueryClientProvider>);
beforeEach(() => { vi.clearAllMocks(); f.available = true; });
describe("rastreabilidade pelo leitor canônico — transporte fake, não homologação", () => {
  it("exibe status real e informa detalhes indisponíveis sem ler tabelas", async () => {
    f.rpc.mockResolvedValue({ data: { items: [{ os_id: id, origem_os: "manual", status_os: "programada", status_esteira_oficial: "aguardando" }, { os_id: "outra", origem_os: "manual" }], total_count: 2 }, error: null });
    renderTab();
    expect(await screen.findByText("programada")).toBeInTheDocument();
    expect(screen.getByText(/não estão disponíveis nesta consulta/)).toBeInTheDocument();
    expect(f.from).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenCalledWith("rpc_cockpit_listar_esteira_v1", expect.objectContaining({ p_busca: "OS-2026-000001", p_origens: ["manual"] }));
  });
  it("OS ausente não vira erro de multiplicidade", async () => {
    f.rpc.mockResolvedValue({ data: { items: [], total_count: 0 }, error: null });
    renderTab();
    expect(await screen.findByText("OS não localizada na consulta autorizada.")).toBeInTheDocument();
  });
  it("negativa do servidor mostra erro neutro", async () => {
    f.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    renderTab();
    expect(await screen.findByText("Não foi possível consultar o estado desta OS agora.")).toBeInTheDocument();
  });
  it("contexto indisponível não consulta", () => {
    f.available = false; renderTab();
    expect(screen.getByText(/indisponível para o contexto atual/)).toBeInTheDocument();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("origem desconhecida ou sem número não consulta", () => {
    renderTab({ osTipo: "unknown" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("duplicidade do mesmo id falha fechada", async () => {
    const row = { os_id: id, origem_os: "manual", status_os: "programada" };
    f.rpc.mockResolvedValue({ data: { items: [row, row], total_count: 2 }, error: null });
    renderTab();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});

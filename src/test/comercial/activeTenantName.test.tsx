import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
let auth: Record<string, unknown>;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

import { useActiveTenantName } from "@/hooks/useActiveTenantName";
import { PaymentSimulationSummary } from "@/components/comercial/PaymentSimulationSummary";
import { supplierLabel, responsibleLabel } from "@/lib/comercial/supplierName";
import { APP_NAME } from "@/config/brand";

function Probe() {
  const { label } = useActiveTenantName();
  return <p data-testid="nome">{label}</p>;
}
function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const setAuth = (over: Record<string, unknown> = {}) => {
  auth = { user: { id: "u1" }, profile: { organization_id: ORG_A }, loading: false, authzEpoch: 0, authzSigningOut: false, ...over };
};
const deferred = () => { let r!: (v: unknown) => void; const p = new Promise((res) => (r = res)); return { p, r }; };

describe("nome do tenant ativo em mensagens operacionais", () => {
  beforeEach(() => { rpc.mockReset(); setAuth(); });

  it("tenants distintos exibem o próprio nome (AR Bio vs FSF)", async () => {
    rpc.mockResolvedValueOnce({ data: { organization_id: ORG_A, nome_fantasia: "AR Bio" }, error: null });
    const qc = new QueryClient();
    const { rerender } = render(<Probe />, { wrapper: wrap(qc) });
    expect(await screen.findByText("AR Bio")).toBeInTheDocument();

    setAuth({ user: { id: "u2" }, profile: { organization_id: ORG_B } });
    rpc.mockResolvedValueOnce({ data: { organization_id: ORG_B, nome: "FSF Agro" }, error: null });
    rerender(<Probe />);
    expect(await screen.findByText("FSF Agro")).toBeInTheDocument();
    expect(screen.queryByText("AR Bio")).toBeNull();
  });

  it("durante carregamento e troca de tenant mostra rótulo neutro, nunca o nome anterior", async () => {
    rpc.mockResolvedValueOnce({ data: { organization_id: ORG_A, nome_fantasia: "AR Bio" }, error: null });
    const qc = new QueryClient();
    const { rerender } = render(<Probe />, { wrapper: wrap(qc) });
    await screen.findByText("AR Bio");
    const d = deferred();
    rpc.mockReturnValueOnce(d.p);
    setAuth({ profile: { organization_id: ORG_B } });
    rerender(<Probe />);
    expect(screen.getByTestId("nome").textContent).toBe("empresa responsável");
    d.r({ data: { organization_id: ORG_B, nome: "FSF Agro" }, error: null });
    expect(await screen.findByText("FSF Agro")).toBeInTheDocument();
  });

  it("resposta de outro tenant (atrasada/divergente) não é adotada", async () => {
    setAuth({ profile: { organization_id: ORG_B } });
    rpc.mockResolvedValueOnce({ data: { organization_id: ORG_A, nome_fantasia: "AR Bio" }, error: null });
    render(<Probe />, { wrapper: wrap(new QueryClient()) });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId("nome").textContent).toBe("empresa responsável");
  });

  it("erro, nome vazio, logout e sessão carregando usam fallback neutro sem consultar indevidamente", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "org_forbidden" } });
    const qc = new QueryClient();
    const { rerender } = render(<Probe />, { wrapper: wrap(qc) });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("nome").textContent).toBe("empresa responsável");

    rpc.mockClear();
    setAuth({ authzSigningOut: true });
    rerender(<Probe />);
    setAuth({ user: null, profile: null });
    rerender(<Probe />);
    setAuth({ loading: true });
    rerender(<Probe />);
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByTestId("nome").textContent).toBe("empresa responsável");
    expect(screen.getByTestId("nome").textContent).not.toMatch(/cultivo ?farm/i);
  });

  it("rótulos neutros e marca do sistema preservada", () => {
    expect(supplierLabel("  ")).toBe("empresa fornecedora");
    expect(responsibleLabel(null)).toBe("empresa responsável");
    expect(responsibleLabel(" AR Bio ")).toBe("AR Bio");
    expect(APP_NAME).toBe("Cultivo Farm");
  });

  it("aviso de cotação usa o nome recebido (vendedor ou tenant) e fallback neutro", () => {
    const sim = { quote_required: true, amounts: {}, schedule: [], warnings: [] } as never;
    const { rerender } = render(<PaymentSimulationSummary simulation={sim} responsavelNome="AR Bio" />);
    expect(screen.getByText(/equipe comercial da AR Bio/)).toBeInTheDocument();
    rerender(<PaymentSimulationSummary simulation={sim} responsavelNome={null} />);
    expect(screen.getByText(/equipe comercial da empresa fornecedora/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/cultivo ?farm/i);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const rpc = vi.fn();
const chain = (v: unknown) => { const p = (v instanceof Promise ? v : Promise.resolve(v)); return Object.assign(p, { abortSignal: () => p }); };
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => chain(rpc(...a)) } }));

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
let auth: Record<string, unknown>;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

import { useActiveTenantName, parseTenantDisplayName } from "@/hooks/useActiveTenantName";
import { readSellerName } from "@/hooks/useMyPartner";
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
  auth = { user: { id: "u1" }, profile: { organization_id: ORG_A }, loading: false, authzReady: true, authzEpoch: 0, authzSigningOut: false, authzLatchBlocked: false, ...over };
};
const ack = (org: string, name: string | null) => ({ contract: "TENANT_DISPLAY_NAME_V1", organization_id: org, name });
const deferred = () => { let r!: (v: unknown) => void; const p = new Promise((res) => (r = res)); return { p, r }; };

describe("nome do tenant ativo em mensagens operacionais", () => {
  beforeEach(() => { rpc.mockReset(); setAuth(); });

  it("tenants distintos exibem o próprio nome (AR Bio vs FSF)", async () => {
    rpc.mockResolvedValueOnce({ data: ack(ORG_A, "AR Bio"), error: null });
    const qc = new QueryClient();
    const { rerender } = render(<Probe />, { wrapper: wrap(qc) });
    expect(await screen.findByText("AR Bio")).toBeInTheDocument();

    setAuth({ user: { id: "u2" }, profile: { organization_id: ORG_B } });
    rpc.mockResolvedValueOnce({ data: ack(ORG_B, "FSF Agro"), error: null });
    rerender(<Probe />);
    expect(await screen.findByText("FSF Agro")).toBeInTheDocument();
    expect(screen.queryByText("AR Bio")).toBeNull();
  });

  it("durante carregamento e troca de tenant mostra rótulo neutro, nunca o nome anterior", async () => {
    rpc.mockResolvedValueOnce({ data: ack(ORG_A, "AR Bio"), error: null });
    const qc = new QueryClient();
    const { rerender } = render(<Probe />, { wrapper: wrap(qc) });
    await screen.findByText("AR Bio");
    const d = deferred();
    rpc.mockReturnValueOnce(d.p);
    setAuth({ profile: { organization_id: ORG_B } });
    rerender(<Probe />);
    expect(screen.getByTestId("nome").textContent).toBe("empresa responsável");
    d.r({ data: ack(ORG_B, "FSF Agro"), error: null });
    expect(await screen.findByText("FSF Agro")).toBeInTheDocument();
  });

  it("resposta de outro tenant (atrasada/divergente) não é adotada", async () => {
    setAuth({ profile: { organization_id: ORG_B } });
    rpc.mockResolvedValueOnce({ data: ack(ORG_A, "AR Bio"), error: null });
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

  it("usa somente tenant_display_name_v1 (nunca org_onboarding_state) e serve perfis não administradores", async () => {
    setAuth({ roles: ["consultor_tecnico"] });
    rpc.mockResolvedValueOnce({ data: ack(ORG_A, "AR Bio"), error: null });
    render(<Probe />, { wrapper: wrap(new QueryClient()) });
    expect(await screen.findByText("AR Bio")).toBeInTheDocument();
    expect(rpc.mock.calls.map(([n]) => n)).toEqual(["tenant_display_name_v1"]);
  });

  it("não consulta sem sessão pronta: authzReady falso, latch, logout em andamento", async () => {
    for (const over of [{ authzReady: false }, { authzLatchBlocked: true }, { authzSigningOut: true }]) {
      setAuth(over);
      const { unmount } = render(<Probe />, { wrapper: wrap(new QueryClient()) });
      expect(screen.getByTestId("nome").textContent).toBe("empresa responsável");
      unmount();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("época de autorização nova não reaproveita o nome da época anterior", async () => {
    rpc.mockResolvedValueOnce({ data: ack(ORG_A, "AR Bio"), error: null });
    const qc = new QueryClient();
    const { rerender } = render(<Probe />, { wrapper: wrap(qc) });
    await screen.findByText("AR Bio");
    const d = deferred(); rpc.mockReturnValueOnce(d.p);
    setAuth({ authzEpoch: 1 });
    rerender(<Probe />);
    expect(screen.getByTestId("nome").textContent).toBe("empresa responsável");
    d.r({ data: ack(ORG_A, "AR Bio Renovada"), error: null });
    expect(await screen.findByText("AR Bio Renovada")).toBeInTheDocument();
  });

  it("instalação ausente (PGRST202) e qualquer erro ficam neutros", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function public.tenant_display_name_v1 without parameters in the schema cache" } });
    render(<Probe />, { wrapper: wrap(new QueryClient()) });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId("nome").textContent).toBe("empresa responsável");
  });

  it("parser estrito: contrato, tenant e somente nome (sem campos sensíveis)", () => {
    expect(parseTenantDisplayName(ack(ORG_A, " AR Bio "), ORG_A)).toBe("AR Bio");
    expect(parseTenantDisplayName(ack(ORG_A, null), ORG_A)).toBeNull();
    for (const raw of [null, [], "x", ack(ORG_B, "FSF"), { ...ack(ORG_A, "AR Bio"), cnpj: "1" }, { ...ack(ORG_A, "AR"), contract: "OUTRO" },
      { contract: "TENANT_DISPLAY_NAME_V1", organization_id: ORG_A }, ack(ORG_A, 7 as never)])
      expect(() => parseTenantDisplayName(raw, ORG_A)).toThrow("tenant_display_unavailable");
  });

  it("vendedor na projeção B2B: ausente → null; presente só se for o tenant do contexto", () => {
    expect(readSellerName({}, ORG_A)).toBeNull();
    expect(readSellerName({ seller: null }, ORG_A)).toBeNull();
    expect(readSellerName({ seller: { organization_id: ORG_A, name: " AR Bio " } }, ORG_A)).toBe("AR Bio");
    expect(readSellerName({ seller: { organization_id: ORG_A, name: null } }, ORG_A)).toBeNull();
    for (const seller of [{ organization_id: ORG_B, name: "FSF" }, { organization_id: ORG_A, name: 3 }, "AR Bio", []])
      expect(() => readSellerName({ seller }, ORG_A)).toThrow("partner_context_unavailable");
  });
});

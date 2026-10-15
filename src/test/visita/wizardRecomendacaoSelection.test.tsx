import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ scope: { organizationId: "AR", userId: "ar" },
  deferred: null as Promise<void> | null, calls: [] as Record<string, unknown>[] }));
vi.mock("@/hooks/useTenantCatalogVisibility", () => ({ useTenantCatalogScope: () => state.scope }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOnlineStatus: () => true }));
vi.mock("@/hooks/useVisitaWorkspace", () => ({ TECHNICAL_STALE_REVALIDATION: {} }));
vi.mock("@/lib/offlineDb", () => ({ getPendingRecomendacoesByRegistro: async () => [], savePendingRecomendacao: vi.fn(), removePendingRecomendacao: vi.fn() }));
vi.mock("@/components/ui/select", () => ({ Select: ({ children }: any) => <div>{children}</div>, SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null, SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, disabled, value }: any) => <option value={value} disabled={disabled}>{children}</option> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (_fn: string, args: Record<string, unknown>) => {
    const org = state.scope.organizationId; const delay = state.deferred; state.calls.push(args);
    const request = (async () => { if (delay) await delay;
      return { error: null, data: args.p_entity_type === "produto" ? [
        { id: `${org}-chemical`, nome: `${org} Químico`, familia_catalogo: "quimico", selectable: true, in_page: true, total: 2 },
        { id: `${org}-fert`, nome: `${org} Adubo`, familia_catalogo: "fertilizante", selectable: true, in_page: true, total: 2 },
      ] : [] };
    })(); return Object.assign(request, { abortSignal: () => request });
  },
  from: (table: string) => {
    const b: any = { select: () => b, eq: () => b, order: () => b, in: () => b, abortSignal: () => b,
      then: (ok: any) => Promise.resolve({ error: null, data: table === "registros_consultor_recomendacoes" ? [{ id: "rec", recomendacao_tecnica: "Histórico", produto_biologico_sugerido_id: "hidden", versao: 1 }] :
        table === "produtos" ? [{ id: "hidden", nome: "Global oculto", familia_catalogo: "biologico" }] : [] }).then(ok) };
    return b;
  },
} }));
import Wizard from "@/pages/app/wizard/WizardRecomendacaoStep";
describe("seleção de recomendação por identidade", () => {
  beforeEach(() => { state.scope = { organizationId: "AR", userId: "ar" }; state.deferred = null; state.calls = []; });
  function setup() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = () => <QueryClientProvider client={qc}><Wizard localRegistroId="local" remoteRegistroId="visit" locked={false} onDone={() => {}} /></QueryClientProvider>;
    return { ...render(tree()), tree, qc };
  }
  it("oferece químicos/adubos e preserva oculto histórico sem oferecer nova seleção", async () => {
    setup();
    await screen.findByText(/Global oculto/);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    await screen.findByRole("option", { name: /AR Químico/ });
    expect(screen.getByRole("option", { name: /AR Adubo/ }).getAttribute("disabled")).toBeNull();
    expect(screen.getByRole("option", { name: /Global oculto/ }).hasAttribute("disabled")).toBe(true);
    expect(state.calls.some(c => c.p_limit === 50 && c.p_registro_id === "visit")).toBe(true);
  });
  it("AR → FSF → AR descarta resposta pendente e fecha formulário", async () => {
    let resolve = () => {}; state.deferred = new Promise<void>(r => { resolve = r; });
    const ui = setup(); fireEvent.click(screen.getByRole("button", { name: "Nova" }));
    await waitFor(() => expect(state.calls.length).toBeGreaterThan(0));
    state.scope = { organizationId: "FSF", userId: "fsf" }; ui.rerender(ui.tree());
    expect(screen.queryByRole("dialog")).toBeNull();
    state.scope = { organizationId: "AR", userId: "ar" }; ui.rerender(ui.tree());
    await act(async () => { resolve(); });
    expect(screen.queryByRole("option", { name: /AR Químico/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
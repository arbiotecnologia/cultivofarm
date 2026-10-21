import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "fake-indexeddb/auto";
import { __resetOfflineDbForTests, savePendingRecomendacao, getAllPendingRecomendacoes } from "@/lib/offlineDb";
const state = vi.hoisted(() => ({ remote: [] as any[], valid: true, calls: [] as [string, any][] }));
vi.mock("@/hooks/useTenantCatalogVisibility", () => ({ useTenantCatalogScope: () => ({ userId: "A", organizationId: "TA" }) }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOnlineStatus: () => true }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ ready: state.valid, capture: () => () => state.valid }) }));
vi.mock("@/hooks/useVisitaWorkspace", () => ({ TECHNICAL_STALE_REVALIDATION: {} }));
vi.mock("@/components/ui/select", () => ({ Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>, SelectItem: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: "A" } }, error: null }) },
  from: (table: string) => {
    const b: any = { select: () => b, eq: () => b, order: () => b, abortSignal: () => b,
      maybeSingle: async () => ({ data: { user_id: "A", organization_id: "TA", ativo: true }, error: null }),
      then: (resolve: any) => Promise.resolve({ data: table === "registros_consultor_recomendacoes" ? state.remote : [], error: null }).then(resolve) };
    return b;
  },
  rpc: async (name: string, args: any) => {
    state.calls.push([name, args]);
    if (name === "rpc_get_visita_workspace") return { data: { registro: { id: "visit" }, permissions: { can_edit: true } }, error: null };
    if (name === "tenant_catalog_visit_selection_page") return { data: [], error: null };
    return { data: { id: "rec", client_uuid: args.p_client_uuid, versao: args.p_expected_versao }, error: null };
  },
} }));
import Wizard from "@/pages/app/wizard/WizardRecomendacaoStep";
beforeEach(async () => { state.remote = []; state.calls = []; state.valid = true; await __resetOfflineDbForTests(); });
function setup() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Wizard localRegistroId="local" remoteRegistroId="visit" locked={false} onDone={() => {}} />
  </QueryClientProvider>);
}
it("salvar criação sem produto/encaminhamento usa versão1 e limpa só após recibo", async () => {
  setup(); fireEvent.click(screen.getByRole("button", { name: "Nova" }));
  fireEvent.change(screen.getByPlaceholderText("Descreva a intervenção recomendada"), { target: { value: "Fictícia" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(state.calls.some(c => c[0] === "rpc_upsert_recomendacao_visita")).toBe(true));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(state.calls.find(c => c[0] === "rpc_upsert_recomendacao_visita")?.[1]).toMatchObject({ p_expected_versao: 1, p_payload: { encaminhar_para_os: false, produto_biologico_sugerido_id: null } });
  expect(await getAllPendingRecomendacoes()).toEqual([]);
});
it("salvar edição remota envia versão atual7", async () => {
  state.remote = [{ id: "rec", client_uuid: "existing", recomendacao_tecnica: "Fictícia", versao: 7 }];
  setup(); fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(state.calls.find(c => c[0] === "rpc_upsert_recomendacao_visita")?.[1]).toMatchObject({ p_expected_versao: 7, p_client_uuid: "existing" }));
});
it("editar pendingnew não criado preserva UUID e versão1", async () => {
  await savePendingRecomendacao({ clientUuid: "pendingnew", localRegistroId: "local", remoteRegistroId: "visit",
    ownerUserId: "A", ownerOrganizationId: "TA", versionContract: "expected_v1", versao: 1,
    payload: { recomendacao_tecnica: "Fictícia" }, updatedAt: "old", syncStatus: "pending_sync" });
  setup(); fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(state.calls.find(c => c[0] === "rpc_upsert_recomendacao_visita")?.[1]).toMatchObject({ p_expected_versao: 1, p_client_uuid: "pendingnew" }));
  await act(async () => {});
});
it("texto livre legado inválido não substitui pendência nem envia RPC", async () => {
  state.remote = [{ id: "rec", client_uuid: "existing", recomendacao_tecnica: "Fictícia", objetivo_recomendacao: "controle_praga", versao: 1 }];
  setup(); fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect(state.calls.some(c => c[0] === "rpc_upsert_recomendacao_visita")).toBe(false);
  expect(await getAllPendingRecomendacoes()).toEqual([]);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
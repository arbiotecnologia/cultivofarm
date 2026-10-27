import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const V1 = "2026-10-21T10:00:00.000000+00:00";
const V2 = "2026-10-21T10:05:00.000000+00:00";
const ID = "00000000-0000-4000-8000-000000000301";
const state = vi.hoisted(() => ({ exib: "Fungicida", ver: "", conflict: false, conflictCode: "40001", calls: [] as string[], expected: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (name: string, args: Record<string, unknown>) => ({
  abortSignal: async () => {
    state.calls.push(name);
    if (name === "platform_list_catalog_labels") return { data: args.p_familia === "quimico"
      ? [{ id: ID, familia: "quimico", rotulo: "fungicida", rotulo_exibicao: state.exib, ativo: true, updated_at: state.ver }] : [], error: null };
    if (name === "catalog_family_labels_read") return { data: args.p_familia === "quimico"
      ? [{ familia: "quimico", rotulo: "fungicida", rotulo_exibicao: state.exib }] : [], error: null };
    if (name === "platform_update_catalog_label") {
      state.expected.push(args.p_expected_updated_at);
      if (state.conflict) return { data: null, error: { code: state.conflictCode } };
      state.exib = String(args.p_rotulo_exibicao); state.ver = V2;
      return { data: { id: ID, familia: "quimico", rotulo: "fungicida", rotulo_exibicao: state.exib, updated_at: V2,
        idempotency_key: args.p_idempotency_key, audit_id: ID, idempotent: false }, error: null };
    }
    return { data: null, error: { code: "XX" } };
  } }) } }));
const actor = { user: { id: "u1" }, session: { user: { id: "u1" }, expires_at: 9999999999 },
  profile: { id: "p1", user_id: "u1", ativo: true, senha_provisoria: false, organization_id: null },
  roles: ["superadmin"], loading: false, error: null };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => actor }));

import { PlatformCatalogLabelsPanel } from "@/components/plataforma/PlatformCatalogLabelsPanel";
import { labelDisplayName, useCatalogLabelNames } from "@/lib/catalogo/catalogLabelDisplay";
import { platformCatalogAccess } from "@/lib/catalogo/platformCatalogRead";

function Reader({ scope }: { scope: string }) {
  const names = useCatalogLabelNames(scope, true);
  return <p data-testid="reader">{labelDisplayName(names, "quimico", "fungicida")}</p>;
}
function setup() {
  const scope = platformCatalogAccess(actor as never).scope;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Reader scope={scope} /><PlatformCatalogLabelsPanel scope={scope} /></QueryClientProvider>);
}
async function rename(to: string) {
  fireEvent.click(await screen.findByRole("button", { name: "Renomear exibição" }));
  fireEvent.change(screen.getByLabelText(/Nome de exibição \(a chave/), { target: { value: to } });
  fireEvent.change(document.getElementById(`reason-${ID}`) as HTMLElement, { target: { value: "Ajuste de nome confirmado" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo a alteração/ }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar nome" }));
}
afterEach(() => { cleanup(); state.exib = "Fungicida"; state.ver = V1; state.conflict = false; state.conflictCode = "40001"; state.calls = []; state.expected = []; });

describe("painel de rótulos → leitor de exibição (fluxo real)", () => {
  it("renomeação confirmada invalida o leitor sem invalidação manual", async () => {
    state.ver = V1; setup();
    await waitFor(() => expect(screen.getByTestId("reader").textContent).toBe("Fungicida"));
    await rename("Fungicida sistêmico");
    await waitFor(() => expect(screen.getByTestId("reader").textContent).toBe("Fungicida sistêmico"));
    expect(state.calls.filter((c) => c === "catalog_family_labels_read").length).toBeGreaterThan(3);
  });
  it("conflito CAS oferece atualização controlada sem recarregar a página", async () => {
    state.ver = V1; state.conflict = true; setup();
    await rename("Outro nome");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Atualize os dados/);
    expect(screen.queryByText(/Recarregue/)).toBeNull();
    state.exib = "Renomeado por outro admin"; state.ver = V2;
    const before = state.calls.filter((c) => c === "platform_list_catalog_labels").length;
    fireEvent.click(screen.getByRole("button", { name: "Atualizar dados" }));
    await waitFor(() => expect(screen.getByTestId("reader").textContent).toBe("Renomeado por outro admin"));
    expect(state.calls.filter((c) => c === "platform_list_catalog_labels").length).toBeGreaterThan(before);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Atualizar dados" })).toBeNull());
  });
  it("PT409: sem nova escrita automática e revisão esperada só muda após ação do usuário", async () => {
    state.ver = V1; state.conflict = true; state.conflictCode = "PT409"; setup();
    await rename("Outro nome");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Atualize os dados/);
    state.exib = "Renomeado por outro admin"; state.ver = V2;
    const lists = state.calls.filter((c) => c === "platform_list_catalog_labels").length;
    await new Promise((r) => setTimeout(r, 300));
    expect(state.calls.filter((c) => c === "platform_update_catalog_label")).toHaveLength(1);
    expect(state.calls.filter((c) => c === "platform_list_catalog_labels").length).toBe(lists);
    expect(state.expected).toEqual([V1]);
    expect(screen.getByTestId("reader").textContent).toBe("Fungicida");
    fireEvent.click(screen.getByRole("button", { name: "Atualizar dados" }));
    await waitFor(() => expect(screen.getByTestId("reader").textContent).toBe("Renomeado por outro admin"));
    expect(state.calls.filter((c) => c === "platform_update_catalog_label")).toHaveLength(1);
    state.conflict = false;
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await rename("Nome revisado");
    await waitFor(() => expect(state.expected).toEqual([V1, V2]));
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  rpcResult: { data: null as unknown, error: null as unknown },
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  labelPages: [] as unknown[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return { abortSignal: () => {
        if (name === "catalog_family_labels_read" && state.labelPages.length > 0)
          return Promise.resolve({ data: state.labelPages.shift(), error: null });
        return Promise.resolve({ data: state.rpcResult.data, error: state.rpcResult.error });
      } };
    },
  },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1" }, session: { user: { id: "u1" }, expires_at: 9999999999 },
    profile: { id: "p1", user_id: "u1", ativo: true, senha_provisoria: false, organization_id: null },
    roles: ["superadmin"], loading: false, error: null,
  }),
}));

import { labelDisplayName, labelNameKey, readActiveCatalogLabels, useCatalogLabelNames } from "@/lib/catalogo/catalogLabelDisplay";
import { PlatformCatalogReadTab } from "@/components/plataforma/PlatformCatalogReadTab";

const NPK = { familia: "fertilizante_adubo", rotulo: "npk", rotulo_exibicao: "NPK" };
const PAGE = { items: [{ id: "00000000-0000-4000-8000-000000000201", codigo: null, nome: "Produto P", tipo: null,
  ativo: true, b2b_enabled: true, updated_at: null, familia_catalogo: "fertilizante_adubo", classe_catalogo: "npk" }],
  has_more: false };

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

afterEach(() => { cleanup(); state.rpcCalls = []; state.rpcResult = { data: null, error: null }; state.labelPages = []; });

describe("exibição dinâmica de rótulos — leitores autorizados", () => {
  it("lê pela RPC de exibição, nunca pela RPC administrativa", async () => {
    state.rpcResult = { data: [NPK], error: null };
    const list = await readActiveCatalogLabels("fertilizante_adubo", new AbortController().signal);
    expect(list).toHaveLength(1);
    expect(state.rpcCalls[0]).toEqual({ name: "catalog_family_labels_read", args: { p_familia: "fertilizante_adubo" } });
    expect(state.rpcCalls.some((c) => c.name === "platform_list_catalog_labels")).toBe(false);
  });
  it("falha fechado em erro ou payload malformado", async () => {
    state.rpcResult = { data: null, error: { code: "42501" } };
    await expect(readActiveCatalogLabels("quimico", new AbortController().signal)).rejects.toThrow("catalog_label_read_unavailable");
    state.rpcResult = { data: [{ rotulo: "x" }], error: null };
    await expect(readActiveCatalogLabels("quimico", new AbortController().signal)).rejects.toThrow("catalog_label_read_unavailable");
  });
  it("nome de exibição: fonte canônica > fallback > chave crua", () => {
    expect(labelDisplayName({ [labelNameKey("fertilizante_adubo", "npk")]: "NPK Organomineral" }, "fertilizante_adubo", "npk", "NPK")).toBe("NPK Organomineral");
    expect(labelDisplayName({}, "fertilizante_adubo", "npk", "NPK")).toBe("NPK");
    expect(labelDisplayName({}, "fertilizante_adubo", "npk")).toBe("npk");
  });
  it("renomeação na Gestão reflete no leitor após invalidação", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    state.labelPages = [[], [], [{ ...NPK, rotulo_exibicao: "NPK" }]];
    const { result } = renderHook(() => useCatalogLabelNames("scope-A", true), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current[labelNameKey("fertilizante_adubo", "npk")]).toBe("NPK"));
    state.labelPages = [[], [], [{ ...NPK, rotulo_exibicao: "NPK Organomineral" }]];
    await client.invalidateQueries({ queryKey: ["catalog-labels-read", "scope-A"] });
    await waitFor(() => expect(result.current[labelNameKey("fertilizante_adubo", "npk")]).toBe("NPK Organomineral"));
  });
  it("mesma chave em famílias distintas não cruza nomes", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // ordem das famílias: quimico, biologico, fertilizante_adubo
    state.labelPages = [[{ familia: "quimico", rotulo: "foliar", rotulo_exibicao: "Foliar químico" }], [],
      [{ familia: "fertilizante_adubo", rotulo: "foliar", rotulo_exibicao: "Foliar adubo" }]];
    const { result } = renderHook(() => useCatalogLabelNames("scope-C", true), { wrapper: wrapper(client) });
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(2));
    expect(labelDisplayName(result.current, "quimico", "foliar")).toBe("Foliar químico");
    expect(labelDisplayName(result.current, "fertilizante_adubo", "foliar")).toBe("Foliar adubo");
    expect(labelDisplayName(result.current, "biologico", "foliar")).toBe("foliar");
  });
  it("leitor do catálogo exibe o nome do servidor para rótulo novo", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    state.labelPages = [[], [], [NPK]];
    state.rpcResult = { data: PAGE, error: null };
    render(<PlatformCatalogReadTab />, { wrapper: wrapper(client) });
    await waitFor(() => expect(screen.getByText(/NPK/)).toBeTruthy());
    const cell = screen.getByText(/Fertilizantes\/Adubos ·/);
    expect(cell.textContent).toContain("NPK");
  });
});

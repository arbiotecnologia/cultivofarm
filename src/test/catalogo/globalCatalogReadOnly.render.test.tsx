import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({ writes: [] as string[], rpcs: [] as string[] }));
const ROWS: Record<string, unknown[]> = {
  produtos: [{ id: "p1", codigo: "PRD-1", nome: "Produto Global Um", tipo: "inoculante", ativo: true, b2b_enabled: false }],
  microrganismos: [{ id: "m1", codigo: "BAC-1", nome: "Micro Global Um", nome_cientifico: "X y", tipo: "bacteria", ativo: true }],
  catalogo_problemas: [{ id: "k1", nome: "Problema Global Um", categoria: "outro", ativo: true }],
  cq_parametros_referencia: [{ id: "q1", microrganismo_id: "m1", produto_id: null, parametro: "ufc", ativo: true }],
  catalogo_volumes: [{ id: "v1", item_id: "p1", item_tipo: "produto", volume_ml: 1000, preco_brl: 10, rotulo: "1 L", ordem: 1, ativo: true }],
};
function builder(table: string) {
  const res = { data: ROWS[table] ?? [], error: null };
  const b: object = new Proxy({}, {
    get(_t, k) {
      if (k === "then") return (r: (v: unknown) => unknown) => Promise.resolve(res).then(r);
      if (k === "insert" || k === "update" || k === "delete" || k === "upsert") return () => { m.writes.push(`${table}.${String(k)}`); return b; };
      if (k === "single" || k === "maybeSingle") return () => Promise.resolve({ data: (ROWS[table] ?? [])[0] ?? null, error: null });
      return () => b;
    },
  });
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t), rpc: (n: string) => { m.rpcs.push(n); return Promise.resolve({ data: null, error: null }); },
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }), getSession: async () => ({ data: { session: null } }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {} },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "administrador", user: { id: "u" }, roles: ["administrador"] }) }));

import { ProdutosTab } from "@/components/protocolos/ProdutosTab";
import { MicrorganismosTab } from "@/components/protocolos/MicrorganismosTab";
import { ProblemasTab } from "@/pages/Protocolos";
import ParametrosCQPage from "@/pages/configuracoes/ParametrosCQPage";
import { CatalogoVolumesDialog } from "@/components/protocolos/CatalogoVolumesDialog";
import { ProblemaSelector } from "@/components/visita/ProblemaSelector";

const wrap = (ui: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>,
);
const MUTATION = /^(Novo|Nova|Editar|Excluir|Salvar|Adicionar|Inativar|Ativar|Desativar|Cadastrar)/i;
const noMutationButtons = () => {
  const names = screen.queryAllByRole("button").map((b) => (b.textContent ?? b.getAttribute("aria-label") ?? "").trim());
  expect(names.filter((n) => MUTATION.test(n))).toEqual([]);
};
beforeEach(() => { m.writes = []; m.rpcs = []; });
afterEach(cleanup);

describe("catálogo global somente consulta (render real, Administrador de empresa)", () => {
  it("Produtos: lista sem Novo/Excluir e clique na linha não abre edição", async () => {
    wrap(<ProdutosTab />);
    const cell = await screen.findByText("Produto Global Um");
    noMutationButtons();
    fireEvent.click(cell);
    expect(screen.queryByText(/Editar Produto|Salvar Produto/)).toBeNull();
    expect(screen.getByRole("button", { name: /Ficha/ })).toBeTruthy();
    expect(m.writes).toEqual([]);
  });
  it("Microrganismos: lista sem Novo/Excluir e sem edição", async () => {
    wrap(<MicrorganismosTab />);
    const cell = await screen.findByText("Micro Global Um");
    noMutationButtons();
    fireEvent.click(cell);
    expect(screen.queryByText(/Salvar Alterações/)).toBeNull();
    expect(m.writes).toEqual([]);
  });
  it("Problemas: sem Novo Problema, editar ou inativar", async () => {
    wrap(<ProblemasTab />);
    await waitFor(() => expect(screen.getAllByText("Problema Global Um").length).toBeGreaterThan(0));
    noMutationButtons();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.writes).toEqual([]);
  });
  it("Parâmetros CQ: sem criar/editar/excluir", async () => {
    wrap(<ParametrosCQPage />);
    await waitFor(() => expect(screen.queryByText(/Carregando/i)).toBeNull());
    noMutationButtons();
    expect(screen.queryByText("Ações")).toBeNull();
    expect(m.writes).toEqual([]);
  });
  it("Volumes: leitura sem Adicionar/Salvar/Excluir", async () => {
    wrap(<CatalogoVolumesDialog open onOpenChange={() => {}} itemId="p1" itemTipo="produto" itemNome="Produto Global Um" valorLitroBase={0} />);
    await screen.findByText("1 L");
    noMutationButtons();
    expect(screen.queryByText("Adicionar volume")).toBeNull();
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(m.writes).toEqual([]);
  });
  it("ProblemaSelector: sem atalho Cadastrar novo problema", async () => {
    wrap(<ProblemaSelector value="" onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    await screen.findByText("Problema Global Um");
    expect(screen.queryByText(/Cadastrar novo problema/)).toBeNull();
    expect(m.writes).toEqual([]);
  });
});

/**
 * Integração com QueryClient REAL: ocultar/exibir + alternância de abas (desmontagem) deve refletir no
 * catálogo imediatamente, sem reload. Reproduz o FAIL real pós-publicação de7d5cc5.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const BOMB = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";
const db = { hidden: new Set<string>(), version: 0 };
const calls = { hiddenIds: 0, produtos: 0 };
let hiddenDelay: Promise<void> | null = null;

function builder(table: string) {
  if (table === "produtos") calls.produtos += 1;
  const state: { notIn: string[] } = { notIn: [] };
  const rows = () => {
    if (table === "produtos") return [{ id: BOMB, nome: "Bombarbio", ativo: true, b2b_enabled: true }, { id: OUTRO, nome: "Outro", ativo: true, b2b_enabled: true }]
      .filter((r) => !state.notIn.includes(r.id));
    return [];
  };
  const b: Record<string, unknown> = {
    select: () => b, order: () => b, eq: () => b, in: () => b, abortSignal: () => b,
    not: (_c: string, _op: string, v: string) => { state.notIn = v.slice(1, -1).split(","); return b; },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: (fn: string, args: Record<string, unknown>) => {
      const run = async () => {
        if (fn === "tenant_catalog_hidden_ids") {
          calls.hiddenIds += 1;
          const snapshot = [...db.hidden];
          if (hiddenDelay) await hiddenDelay;
          return { data: args.p_entity_type === "produto" ? snapshot.map((id) => ({ entity_id: id })) : [], error: null };
        }
        if (fn === "tenant_catalog_set_visibility") {
          if (args.p_hidden) db.hidden.add(args.p_entity_id as string); else db.hidden.delete(args.p_entity_id as string);
          db.version += 1;
          return { data: { entity_type: args.p_entity_type, entity_id: args.p_entity_id, hidden: args.p_hidden, version: db.version, replayed: false }, error: null };
        }
        return { data: [], error: null };
      };
      const p = run();
      return Object.assign(p, { abortSignal: () => p });
    },
  },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u-ar" }, profile: { user_id: "u-ar", organization_id: "org-ar" }, loading: false, roles: ["administrador"] }),
}));

import { useCatalogoUnificado } from "@/hooks/useCatalogoUnificado";
import { catalogoKeyMatchesScope, useSetTenantVisibility, useTenantCatalogScope } from "@/hooks/useTenantCatalogVisibility";

function Catalogo() {
  const q = useCatalogoUnificado("admin");
  if (q.isLoading || !q.data) return <p>carregando</p>;
  return <p data-testid="n">{q.data.filter((r) => r.tipo === "produto").map((r) => r.nome).join("|")}</p>;
}
let act$: ((hidden: boolean) => Promise<unknown>) | null = null;
function Gestao() {
  const scope = useTenantCatalogScope();
  const m = useSetTenantVisibility("produto");
  act$ = (hidden) => m.mutateAsync({ entityId: BOMB, hidden, expectedVersion: db.version, reason: "motivo teste", idempotencyKey: crypto.randomUUID(), scopeAtStart: scope! });
  return <p>gestao</p>;
}
let setTab: (t: "catalogo" | "gestao") => void = () => {};
function App() {
  const [tab, s] = useState<"catalogo" | "gestao">("catalogo");
  setTab = s;
  return tab === "catalogo" ? <Catalogo /> : <Gestao />;
}

describe("cache da visibilidade com QueryClient real", () => {
  beforeEach(() => { db.hidden.clear(); db.version = 0; hiddenDelay = null; calls.hiddenIds = 0; calls.produtos = 0; });

  it("ocultar e reexibir em outra aba refletem ao voltar, sem reload", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><App /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("n").textContent).toBe("Bombarbio|Outro"));

    act(() => setTab("gestao"));
    await act(async () => { await act$!(true); });
    act(() => setTab("catalogo"));
    await waitFor(() => expect(screen.getByTestId("n").textContent).toBe("Outro"));

    act(() => setTab("gestao"));
    await act(async () => { await act$!(false); });
    act(() => setTab("catalogo"));
    await waitFor(() => expect(screen.getByTestId("n").textContent).toBe("Bombarbio|Outro"));
  });

  it("nunca mostra catálogo do estado anterior enquanto os ocultos estão sendo relidos", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><App /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("n").textContent).toBe("Bombarbio|Outro"));
    act(() => setTab("gestao"));
    await act(async () => { await act$!(true); });
    let release!: () => void;
    hiddenDelay = new Promise<void>((r) => { release = r; });
    act(() => setTab("catalogo"));
    // enquanto relê ocultos, não pode exibir a lista antiga com Bombarbio
    expect(screen.queryByTestId("n")?.textContent ?? "carregando").not.toContain("Bombarbio");
    await act(async () => { release(); });
    await waitFor(() => expect(screen.getByTestId("n").textContent).toBe("Outro"));
  });

  it("resposta em voo de ocultos anterior à mutação não prevalece", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let release!: () => void;
    hiddenDelay = new Promise<void>((r) => { release = r; });
    render(<QueryClientProvider client={qc}><App /></QueryClientProvider>);
    // leitura em voo captura estado "sem ocultos"; a mutação acontece antes da resposta chegar
    act(() => setTab("gestao"));
    hiddenDelay = null;
    await act(async () => { await act$!(true); });
    act(() => setTab("catalogo"));
    await act(async () => { release(); });
    await waitFor(() => expect(screen.getByTestId("n").textContent).toBe("Outro"));
  });

  it("pai+filho com o mesmo hook (padrão CatalogoTecnicoTab → CatalogoCardsGrid) não entram em loop", async () => {
    function Filho() {
      const q = useCatalogoUnificado("admin");
      return <p data-testid="filho">{q.data ? q.data.length : "…"}</p>;
    }
    function Pai() {
      const q = useCatalogoUnificado("admin");
      if (q.isLoading) return <p>carregando</p>;
      return <><p data-testid="pai">{q.data?.length}</p><Filho /></>;
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><Pai /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("filho").textContent).toBe("2"));
    const settled = { ...calls };
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(calls).toEqual(settled);
    // 2 entidades (produto+micro) = 2 leituras de ocultos; 1 leitura do catálogo
    expect(settled.hiddenIds).toBe(2);
    expect(settled.produtos).toBe(1);
    expect(screen.getByTestId("pai").textContent).toBe("2");
  });

  it("pós-mutação não refaz catálogo de outra sessão, de outra empresa, global nem B2B", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spies = { outroUser: vi.fn(async () => ["x"]), outraOrg: vi.fn(async () => ["x"]), b2b: vi.fn(async () => ["x"]), global: vi.fn(async () => ["x"]) };
    const seeds: Array<[readonly unknown[], () => Promise<unknown>]> = [
      [["catalogo-unificado", "admin", "org-ar|u-outro|", "org-ar|u-outro|"], spies.outroUser],
      [["catalogo-unificado", "interno", "org-fsf|u-fsf|", "org-fsf|u-fsf|"], spies.outraOrg],
      [["catalogo-unificado", "b2b", "global", "global"], spies.b2b],
      [["catalogo-unificado", "admin", "global", "global"], spies.global],
    ];
    for (const [key, fn] of seeds) await qc.prefetchQuery({ queryKey: key, queryFn: fn });
    Object.values(spies).forEach((f) => f.mockClear());
    render(<QueryClientProvider client={qc}><Gestao /></QueryClientProvider>);
    await act(async () => { await act$!(true); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    for (const f of Object.values(spies)) expect(f).not.toHaveBeenCalled();
    for (const [key] of seeds) expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
  });

  it("predicado aceita só admin/interno do escopo exato", () => {
    const m = catalogoKeyMatchesScope({ organizationId: "org-ar", userId: "u-ar" });
    expect(m({ queryKey: ["catalogo-unificado", "admin", "org-ar|u-ar|", "org-ar|u-ar|"] })).toBe(true);
    expect(m({ queryKey: ["catalogo-unificado", "interno", "org-ar|u-ar|B", "org-ar|u-ar|"] })).toBe(true);
    expect(m({ queryKey: ["catalogo-unificado", "b2b", "org-ar|u-ar|", "org-ar|u-ar|"] })).toBe(false);
    expect(m({ queryKey: ["catalogo-unificado", "admin", "org-ar|u-ar2|", "org-ar|u-ar2|"] })).toBe(false);
    expect(m({ queryKey: ["catalogo-unificado", "admin", "org-arx|u-ar|", "global"] })).toBe(false);
  });
});

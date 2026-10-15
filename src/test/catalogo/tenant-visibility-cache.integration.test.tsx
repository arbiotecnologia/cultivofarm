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
let hiddenDelay: Promise<void> | null = null;

function builder(table: string) {
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
import { useSetTenantVisibility, useTenantCatalogScope } from "@/hooks/useTenantCatalogVisibility";

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
  beforeEach(() => { db.hidden.clear(); db.version = 0; hiddenDelay = null; });

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
});

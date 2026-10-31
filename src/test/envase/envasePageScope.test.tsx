import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const t = vi.hoisted(() => ({ auth: {} as any, pending: [] as { table: string; from: number; resolve: (v: any) => void }[], events: [] as (() => void)[], removed: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => t.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => { const q: any = { select: () => q, order: () => q, eq: () => q, gte: () => q, lte: () => q, or: () => q, ilike: () => q, range: (from: number) => new Promise(resolve => t.pending.push({ table, from, resolve })) }; return q; },
  channel: () => { const c: any = { on: (_: any, __: any, fn: () => void) => { t.events.push(fn); return c; }, subscribe: () => c }; return c; }, removeChannel: t.removed,
} }));
vi.mock("@/components/etiquetas/EtiquetaProdutoActions", () => ({ EtiquetaProdutoActions: () => null }));
import EnvasePage from "@/pages/EnvasePage";
const view = () => <MemoryRouter><EnvasePage /></MemoryRouter>;
const rows = (name: string) => [{ id: name, tipo_embalagem: "frasco_1L", data_envase: "2026-10-31", lotes: { codigo_lote: name } }];
async function finish(index: number, name: string, count = 100) { await act(async () => t.pending[index].resolve({ data: t.pending[index].table === "produtos" ? [{ id: name, nome: name }] : rows(name), count, error: null })); }
beforeEach(() => { vi.clearAllMocks(); t.pending = []; t.events = []; t.auth = { user: { id: "actor" }, profile: { user_id: "actor", organization_id: "ARB", ativo: true }, roles: ["gestor"], loading: false, authzReady: true, authzEpoch: 0 }; });
describe("Envase mounted current-query fences", () => {
  it("inverted filter responses never overwrite current history", async () => {
    render(view()); const old = t.pending.findIndex(p => p.table === "envase");
    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-10-01" } });
    const fresh = t.pending.map(p => p.table).lastIndexOf("envase"); await finish(fresh, "CURRENT"); await finish(old, "STALE");
    expect(screen.getByText("CURRENT")).toBeInTheDocument(); expect(screen.queryByText("STALE")).toBeNull();
  });
  it("inverted page responses preserve the latest page", async () => {
    render(view()); await finish(0, "FIRST"); fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    const second = t.pending.length - 1; fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-10-31" } });
    const latest = t.pending.length - 1; await finish(latest, "FILTER-PAGE-1"); await finish(second, "OLD-PAGE-2");
    expect(screen.getByText("FILTER-PAGE-1")).toBeInTheDocument(); expect(screen.queryByText("OLD-PAGE-2")).toBeNull();
  });
  it.each(["FSF", "inactive"])("%s clears immediately and refuses old history/products", async kind => {
    const h = render(view()); const old = [...t.pending]; await finish(0, "ARB-ROW");
    t.auth = { ...t.auth, profile: { ...t.auth.profile, organization_id: kind === "FSF" ? "FSF" : "ARB", ativo: kind !== "inactive" } }; h.rerender(view());
    expect(screen.queryByText("ARB-ROW")).toBeNull();
    await act(async () => old.forEach(p => p.resolve({ data: p.table === "produtos" ? [{ id: "ARB", nome: "ARB-PRODUCT" }] : rows("ARB-LATE"), count: 1, error: null })));
    expect(screen.queryByText("ARB-LATE")).toBeNull();
    if (kind === "FSF") { const p = t.pending.map(x => x.table).lastIndexOf("produtos"); await finish(p, "FSF-PRODUCT"); fireEvent.click(screen.getByRole("combobox")); expect(await screen.findByText("FSF-PRODUCT")).toBeInTheDocument(); expect(screen.queryByText("ARB-PRODUCT")).toBeNull(); }
    else expect(t.pending).toHaveLength(2);
    expect(t.removed).toHaveBeenCalled();
  });
  it("unmount retires pending promises and realtime timers", async () => {
    const h = render(view()); const events = [...t.events]; const pending = [...t.pending]; events[0](); h.unmount(); const count = t.pending.length;
    events.forEach(fn => fn()); await act(async () => pending.forEach(p => p.resolve({ data: [], count: 0, error: null })));
    await new Promise(resolve => setTimeout(resolve, 1250)); expect(t.pending).toHaveLength(count); expect(t.removed).toHaveBeenCalledTimes(1);
  });
});
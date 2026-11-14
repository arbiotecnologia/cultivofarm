import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const t = vi.hoisted(() => ({ rows: [] as any[], rpc: vi.fn(), open: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "actor" }, profile: { user_id: "actor", organization_id: "ARB", ativo: true }, roles: ["gestor"], loading: false, authzReady: true }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: t.rpc,
  from: (table: string) => {
    const q: any = { select: () => q, order: () => q, eq: () => q, gte: () => q, lte: () => q, or: () => q,
      range: () => Promise.resolve({ data: table === "envase" ? t.rows : [], count: t.rows.length, error: null }) };
    return q;
  },
  channel: () => { const c: any = { on: () => c, subscribe: () => c }; return c; }, removeChannel: vi.fn(),
} }));
import EnvasePage from "@/pages/EnvasePage";
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, "open").mockImplementation(t.open); t.rows = [
  { id: "envase-1", lote_id: "lot-1", tipo_embalagem: "frasco_1L", volume_por_unidade: 1000, quantidade: 1, data_envase: "2026-10-31", lotes: { codigo_lote: "LOCAL-1", produtos: { nome: "LOCAL" } }, produto_etiquetas: { id: "label-1", status: "gerada", trace_token: "trace" } },
  { id: "envase-2", lote_id: "lot-2", tipo_embalagem: "frasco_1L", quantidade: 1, data_envase: "2026-10-31", lotes: { codigo_lote: "LOCAL-2" } },
]; });
describe("EnvasePage contained independent contracts", () => {
  it("mounts only the authorized label integration without complement or package creation", async () => {
    render(<MemoryRouter><EnvasePage /></MemoryRouter>);
    await screen.findByText("LOCAL-1");
    expect(screen.getByText("LOCAL-2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /complementar|Criar embalagens|Cancelar/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Gerar etiquetas" })).toHaveLength(2);
    expect(document.querySelector("form")).toBeNull();
    expect(t.rpc).not.toHaveBeenCalled();
  });
  it("keeps existing label view and print available without calling a writer", async () => {
    render(<MemoryRouter><EnvasePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Ver" }));
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    await waitFor(() => expect(t.open).toHaveBeenCalledTimes(2));
    expect(t.open).toHaveBeenCalledWith("/etiquetas/label-1/imprimir", "_blank");
    expect(t.rpc).not.toHaveBeenCalled();
  });
});
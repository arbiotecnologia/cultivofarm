import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({ from: vi.fn(), reads: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { AprovacaoCard } from "@/components/visita/AprovacaoCard";

const approval: Tables<"aprovacoes_tecnicas"> = {
  id: "decision-fake", registro_consultor_id: "visit-fake", aprovado_por: "admin-fake",
  aprovado_por_role: "administrador", comentario_gestor: "Decisão de teste",
  data_aprovacao: "2026-10-09T22:46:00Z", created_at: "2026-10-09T22:46:00Z",
  status_aprovacao: "aprovado", override: false,
};
let approvals: Tables<"aprovacoes_tecnicas">[];
const clients: QueryClient[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  approvals = [approval];
  mocks.from.mockImplementation((table: string) => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(async () => ({ data: table === "aprovacoes_tecnicas" ? approvals : [{
        id: "log-fake", changed_by: "admin-fake", changed_at: "2026-10-09T22:46:00Z",
        status_anterior: "enviado_aprovacao", status_novo: "aprovado", motivo: "Motivo de teste",
      }], error: null })),
      in: vi.fn(async (column: string, ids: string[]) => {
        mocks.reads(table, column, ids);
        return { data: ids.includes("admin-fake") ? [{ user_id: "admin-fake", nome: "Autor fictício" }] : [], error: null };
      }),
    };
    return builder;
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AprovacaoCard registroId="visit-fake" registroStatus="aprovado" /></QueryClientProvider>);
}

it("resolve autor da decisão por aprovado_por em profiles.user_id, somente com leituras", async () => {
  renderCard();
  await waitFor(() => expect(mocks.reads).toHaveBeenCalledWith("profiles", "user_id", ["admin-fake"]));
  expect(await screen.findByText(/Aprovado por: Autor fictício/)).toBeTruthy();
  expect(screen.getByText('"Decisão de teste"')).toBeTruthy();
  expect(mocks.from.mock.calls.every(([table]) => ["aprovacoes_tecnicas", "profiles", "registros_consultor_status_log"].includes(table))).toBe(true);
});

it("mantém autor, transição e motivo no histórico existente sem gravar aprovação", async () => {
  renderCard();
  const history = await screen.findByRole("list");
  await waitFor(() => expect(within(history).getByText(/Autor fictício/)).toBeTruthy());
  expect(within(history).getByText("Aguardando aprovação")).toBeTruthy();
  expect(within(history).getByText("Aprovado")).toBeTruthy();
  expect(within(history).getByText('"Motivo de teste"')).toBeTruthy();
  expect(within(history).getAllByRole("listitem")).toHaveLength(1);
});

it("não inventa autor da aprovação quando aprovado_por é nulo", async () => {
  approvals = [{ ...approval, aprovado_por: null }];
  renderCard();
  await screen.findByText('"Decisão de teste"');
  expect(screen.queryByText(/Aprovado por:/)).toBeNull();
  // O autor do status log é independente do autor nulo da decisão.
  expect(await screen.findByText(/Autor fictício/)).toBeTruthy();
});
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrdensServico from "@/pages/OrdensServico";

const fixture = vi.hoisted(() => ({
  client: "cc586e4a-8953-4f3c-9a38-57e3665d1667",
  farm: "46bea8e9-79fc-440b-bdb5-76f40ba4550f",
  field: "806d9789-a87e-4e25-8d59-aa9eea24dabe",
  insert: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ roles: ["administrador"] }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/ordens-servico/OSDetalhesDialog", () => ({ OSDetalhesDialog: () => null }));
vi.mock("@/components/faturamento/BaseFaturamentoSection", () => ({ BaseFaturamentoSection: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const data = table === "clientes" ? [{ id: fixture.client, nome: "Cliente B" }]
      : table === "fazendas" ? [{ id: fixture.farm, nome: "Fazenda B", cliente_id: fixture.client }]
      : table === "talhoes" ? [{ id: fixture.field, nome: "Talhão B", fazenda_id: fixture.farm, area_hectares: 12 }]
      : [];
    const query = { select: () => query, gte: () => query, order: () => query, limit: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
      insert: fixture.insert };
    return query;
  },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: vi.fn(),
} }));

beforeEach(() => {
  vi.clearAllMocks();
  // JSDOM lacks browser scrolling; keep the real Radix controls and keyboard flow.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});
afterEach(() => { Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView"); });
describe("Nova OS — progressão do formulário real com transporte fake, sem escrita hosted", () => {
  it("permite escolher fazenda e talhão antes de completar o submit", async () => {
    render(<MemoryRouter><OrdensServico /></MemoryRouter>);
    const open = screen.getByRole("button", { name: "Nova OS" });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    const dialog = screen.getByRole("dialog");
    const combos = within(dialog).getAllByRole("combobox");
    expect(combos[1]).toBeDisabled();
    fireEvent.keyDown(combos[0], { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Cliente B" }));
    await waitFor(() => expect(combos[1]).toBeEnabled());
    expect(combos[2]).toBeDisabled();
    fireEvent.keyDown(combos[1], { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Fazenda B" }));
    await waitFor(() => expect(combos[2]).toBeEnabled());
    fireEvent.keyDown(combos[2], { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Talhão B" }));
    await waitFor(() => expect(within(dialog).getByDisplayValue("12")).toBeTruthy());
    expect(dialog.querySelector('button[type="submit"]')).toBeDisabled();
    // Even a direct form submit must run the unchanged full validation.
    const form = dialog.querySelector("form");
    if (!form) throw new Error("Formulário ausente");
    fireEvent.submit(form);
    expect(fixture.insert).not.toHaveBeenCalled();
  });
});
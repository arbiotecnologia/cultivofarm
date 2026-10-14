import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { supabaseMock, resetSupabaseMock, setTableData } from "../helpers/supabaseMock";

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "t@t.com" }, loading: false }),
  AuthProvider: ({ children }: any) => children,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

import { ProblemaSelector } from "@/components/visita/ProblemaSelector";

describe("ProblemaSelector (catálogo de problemas)", () => {
  beforeEach(() => {
    resetSupabaseMock();
    setTableData("catalogo_problemas", [
      { id: "p1", nome: "Lagarta-do-cartucho", categoria: "insetos_praga", nome_cientifico: "Spodoptera frugiperda" },
      { id: "p2", nome: "Ferrugem asiática", categoria: "doencas_fungicas", nome_cientifico: "Phakopsora pachyrhizi" },
    ]);
  });

  it("renderiza o catálogo e dispara onSelect com o problema escolhido", async () => {
    const onSelect = vi.fn();
    renderWithProviders(<ProblemaSelector value="" onSelect={onSelect} />);

    const trigger = await screen.findByRole("combobox");
    fireEvent.click(trigger);

    const item = await screen.findByText("Lagarta-do-cartucho");
    fireEvent.click(item);

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSelect.mock.calls[0][0]).toMatchObject({ id: "p1", nome: "Lagarta-do-cartucho" });
  });

  it("não oferece cadastro de problema global (contenção: somente consulta)", async () => {
    renderWithProviders(<ProblemaSelector value="" onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole("combobox"));
    await screen.findByPlaceholderText(/Buscar problema/i);
    expect(screen.queryByText(/Cadastrar novo problema/i)).toBeNull();
  });
});

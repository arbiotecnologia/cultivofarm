import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NatureOperationCombobox from "@/components/fiscal/NatureOperationCombobox";

const eq = vi.fn().mockResolvedValue({
  data: [{ nature_operation: "Venda definida por política publicada" }],
  error: null,
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq }) }) },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe("NatureOperationCombobox", () => {
  it("lista políticas publicadas e preserva opção personalizada", async () => {
    render(<NatureOperationCombobox value="Minha natureza antiga" customOptions={["Minha natureza antiga"]} onChange={() => {}} />, { wrapper });
    fireEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByText("Venda definida por política publicada")).toBeInTheDocument();
    expect(screen.getByText("Minha natureza antiga")).toBeInTheDocument();
  });

  it("adiciona opção personalizada normalizada e seleciona o novo valor", async () => {
    const onChange = vi.fn();
    const onCustomOptionsChange = vi.fn();
    render(<NatureOperationCombobox value={null} onChange={onChange} onCustomOptionsChange={onCustomOptionsChange} />, { wrapper });
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar natureza personalizada" }));
    fireEvent.change(screen.getByLabelText("Natureza da operação"), { target: { value: "  Venda   especial  " } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar e selecionar" }));
    await waitFor(() => expect(onCustomOptionsChange).toHaveBeenCalledWith(["Venda especial"]));
    expect(onChange).toHaveBeenCalledWith("Venda especial");
  });
});
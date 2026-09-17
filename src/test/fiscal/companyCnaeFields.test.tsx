import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CompanyCnaeFields from "@/components/fiscal/CompanyCnaeFields";

vi.mock("@/hooks/useFiscalCatalog", () => ({
  useFiscalCatalogResolve: () => ({ isSuccess: true, data: [
    { code: "7490103", description: "Serviços de agronomia e de consultoria às atividades agrícolas e pecuárias", is_active: true },
    { code: "4623106", description: "Comércio atacadista de sementes, flores, plantas e gramas", is_active: true },
  ] }),
}));
vi.mock("@/components/fiscal/FiscalCatalogCombobox", () => ({ default: (props: { placeholder: string; onChange: (code: string) => void }) => (
  <div><button onClick={() => props.onChange("4623106")}>{props.placeholder}</button>
    <button onClick={() => props.onChange("7490103")}>Escolher principal</button></div>
) }));

describe("CompanyCnaeFields", () => {
  it("exibe descrição integral e remove somente o CNAE escolhido", () => {
    const change = vi.fn();
    render(<CompanyCnaeFields primary="7490103" secondary={["4623106"]} onPrimaryChange={vi.fn()} onSecondaryChange={change} />);
    expect(screen.getByText("Comércio atacadista de sementes, flores, plantas e gramas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remover CNAE 4623106" }));
    expect(change).toHaveBeenCalledWith([]);
  });
  it("adiciona pela ação explícita", () => {
    const change = vi.fn();
    render(<CompanyCnaeFields primary="7490103" secondary={[]} onPrimaryChange={vi.fn()} onSecondaryChange={change} />);
    expect(screen.getByText("Nenhum CNAE secundário informado.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar CNAE secundário" }));
    expect(change).toHaveBeenCalledWith(["4623106"]);
  });
  it("rejeita duplicação e código principal", () => {
    const change = vi.fn();
    render(<CompanyCnaeFields primary="7490103" secondary={["4623106"]} onPrimaryChange={vi.fn()} onSecondaryChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar CNAE secundário" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Escolher principal" })[1]);
    expect(change).not.toHaveBeenCalled();
  });
});
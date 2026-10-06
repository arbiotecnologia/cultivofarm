import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersaoComercialEditor } from "@/components/plataforma/VersaoComercialEditor";
import {
  centsToDecimal,
  formatCommercialMoney,
  parseCommercialMoney,
} from "@/components/plataforma/commercialMoney";

const salvar = vi.fn();

vi.mock("@/hooks/usePlataformaSaaS", () => ({
  mensagemErroPlataforma: () => "Erro",
  usePlanosSaaS: () => ({ data: [{ id: "plan-1", key: "essencial", name: "Essencial", active: true }] }),
  useVersoesPlanosSaaS: () => ({ data: [] }),
  useCatalogoPlanosSaaS: () => ({ data: { features: [], links: [] } }),
  useSalvarRascunhoPlano: () => ({ mutate: salvar, isPending: false }),
  usePublicarRascunhoPlano: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("moeda da versão comercial", () => {
  it("formata centavos em BRL, USD e EUR", () => {
    expect(formatCommercialMoney(5990, "BRL")).toMatch(/R\$\s?59,90/);
    expect(formatCommercialMoney(5990, "USD")).toMatch(/US\$59\.90|\$59\.90/);
    expect(formatCommercialMoney(5990, "EUR")).toMatch(/59,90\s?€/);
  });

  it("aceita vírgula ou ponto, preserva centavos e rejeita caracteres inválidos", () => {
    expect(parseCommercialMoney("59,90")).toEqual({ kind: "valid", cents: 5990 });
    expect(parseCommercialMoney("59.90")).toEqual({ kind: "valid", cents: 5990 });
    expect(parseCommercialMoney("59,9")).toEqual({ kind: "valid", cents: 5990 });
    expect(parseCommercialMoney("R$ 59,90").kind).toBe("invalid");
    expect(centsToDecimal(5990)).toBe("59.90");
  });
});

describe("editor de versão comercial", () => {
  beforeEach(() => salvar.mockClear());

  it("exibe seletor fixo de moeda e mantém o valor ao trocar a moeda", () => {
    render(<VersaoComercialEditor />);
    const price = screen.getByLabelText("Preço *") as HTMLInputElement;
    fireEvent.focus(price);
    fireEvent.change(price, { target: { value: "59,90" } });
    fireEvent.blur(price);
    expect(price.value).toMatch(/R\$\s?59,90/);

    fireEvent.click(screen.getByLabelText("Moeda *"));
    fireEvent.click(screen.getByText("Dólar americano (USD) — US$"));
    expect(price.value).toMatch(/US\$59\.90|\$59\.90/);
  });

  it("normaliza o preço para a RPC e apresenta os textos amigáveis de limites", () => {
    render(<VersaoComercialEditor />);
    fireEvent.click(screen.getByLabelText("Plano *"));
    fireEvent.click(screen.getByText("Essencial"));
    const price = screen.getByLabelText("Preço *");
    fireEvent.focus(price);
    fireEvent.change(price, { target: { value: "59.90" } });
    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "Preço inicial" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar rascunho/i }));

    expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ priceAmount: "59.90", currency: "BRL" }), expect.any(Object));
    expect(screen.getByText("Limites de uso do plano *")).toBeInTheDocument();
    expect(screen.getByText("Defina os limites incluídos no plano, como quantidade de usuários, unidades ou recursos.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Limites de uso do plano *"), { target: { value: "{" } });
    expect(screen.getByText("Confira o formato dos limites de uso.")).toBeInTheDocument();
  });
});
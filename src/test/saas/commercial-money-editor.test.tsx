import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersaoComercialEditor } from "@/components/plataforma/VersaoComercialEditor";
import {
  centsToDecimal,
  formatCommercialMoney,
  parseCommercialMoney,
} from "@/components/plataforma/commercialMoney";

const salvar = vi.fn();
const validar = vi.fn();
const publicar = vi.fn();
const planosData = [{ id: "plan-1", key: "essencial", name: "Essencial", active: true }];
const versoesData: unknown[] = [];
const catalogoData = {
  modules: [{ id: "module-1", key: "agronomico", name: "Agronômico", description: "Recursos agronômicos", active: true }],
  features: [{ id: "feature-1", module_id: "module-1", key: "consultas", name: "Consultas", description: "Consulta técnica", active: true, commercializable: true, created_at: "2026-10-06T00:00:00Z" }],
  links: [{ plan_id: "plan-1", feature_id: "feature-1", enabled: true }],
  limits: [], featureLimits: [], dependencies: [],
};

vi.mock("@/hooks/usePlataformaSaaS", () => ({
  mensagemErroPlataforma: () => "Erro",
  usePlanosSaaS: () => ({ data: planosData }),
  useVersoesPlanosSaaS: () => ({ data: versoesData }),
  useCatalogoPlanosSaaS: () => ({ data: catalogoData }),
  useSalvarRascunhoPlano: () => ({ mutate: salvar, isPending: false }),
  useValidarRascunhoPlano: () => ({ mutate: validar, isPending: false }),
  usePublicarRascunhoPlano: () => ({ mutate: publicar, isPending: false }),
}));

describe("moeda da versão comercial", () => {
  it("formata centavos em BRL, USD e EUR", () => {
    expect(formatCommercialMoney(5990, "BRL")).toBe("R$ 59,90");
    expect(formatCommercialMoney(5990, "USD")).toBe("US$ 59.90");
    expect(formatCommercialMoney(5990, "EUR")).toBe("€ 59,90");
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
  beforeEach(() => {
    salvar.mockReset();
    validar.mockReset();
    publicar.mockReset();
  });

  it("exibe seletor fixo de moeda e mantém o valor ao trocar a moeda", () => {
    render(<VersaoComercialEditor />);
    const price = screen.getByLabelText("Preço *") as HTMLInputElement;
    fireEvent.focus(price);
    fireEvent.change(price, { target: { value: "59,90" } });
    fireEvent.blur(price);
    expect(price.value).toBe("R$ 59,90");

    fireEvent.click(screen.getByLabelText("Moeda *"));
    fireEvent.click(screen.getByText("Dólar americano (USD) — US$"));
    expect(price.value).toBe("US$ 59.90");
  });

  it("mantém a publicação bloqueada até salvar e validar o draft no servidor", () => {
    salvar.mockImplementation((_payload, callbacks) => callbacks.onSuccess("draft-1"));
    validar.mockImplementation((_draftId, callbacks) => callbacks.onSuccess({ complete: true, valid: true }));
    render(<VersaoComercialEditor />);
    fireEvent.click(screen.getByLabelText("Plano *"));
    fireEvent.click(screen.getByText("Essencial"));
    fireEvent.focus(screen.getByLabelText("Preço *"));
    fireEvent.change(screen.getByLabelText("Preço *"), { target: { value: "59,90" } });
    fireEvent.click(screen.getByText("Selecione o ciclo"));
    fireEvent.click(screen.getByText("Mensal"));
    fireEvent.change(screen.getByLabelText("Dias de teste *"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("Início da vigência *"), { target: { value: "2026-10-07T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: /Agronômico/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Consultas/ }));
    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "Preço inicial" } });
    fireEvent.change(screen.getByLabelText("Digite PUBLICAR para confirmar"), { target: { value: "PUBLICAR" } });

    const publishButton = screen.getByRole("button", { name: "Publicar versão" });
    expect(publishButton).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));

    expect(validar).toHaveBeenCalledWith("draft-1", expect.any(Object));
    expect(publishButton).toBeEnabled();
    expect(publicar).not.toHaveBeenCalled();
  });

  it("gera outra chave idempotente após alteração lógica do formulário", () => {
    render(<VersaoComercialEditor />);
    fireEvent.click(screen.getByLabelText("Plano *"));
    fireEvent.click(screen.getByText("Essencial"));
    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "Primeira tentativa" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar rascunho/i }));
    const firstKey = salvar.mock.calls[0][0].idempotencyKey;

    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "Segunda tentativa" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar rascunho/i }));

    expect(salvar.mock.calls[1][0].idempotencyKey).not.toBe(firstKey);
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
    expect(screen.getByText("Limites de uso do plano")).toBeInTheDocument();
    expect(screen.getByText("Defina limites incluídos no plano, como quantidade de usuários, unidades ou recursos.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma definição real de limite foi cadastrada. Nenhum valor padrão foi inventado.")).toBeInTheDocument();
  });
});
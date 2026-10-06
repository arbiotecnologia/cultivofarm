import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const refetchVersoes = vi.fn();
const planosData = [
  { id: "plan-1", key: "essencial", name: "Essencial", active: true },
  { id: "plan-2", key: "gestao", name: "Gestão", active: true },
];
const versoesData: unknown[] = [];
const catalogoData = {
  modules: [
    { id: "module-1", key: "agronomico", name: "Agronômico", description: "Recursos agronômicos", active: true },
    { id: "module-2", key: "fiscal", name: "Fiscal", description: "Recursos fiscais", active: true },
    { id: "module-3", key: "vazio", name: "Módulo vazio", description: "Sem recursos", active: true },
  ],
  features: [
    { id: "feature-1", module_id: "module-1", key: "consultas", name: "Consultas", description: "Consulta técnica", active: true, commercializable: true, created_at: "2026-10-06T00:00:00Z" },
    { id: "feature-2", module_id: "module-2", key: "documentos", name: "Documentos fiscais", description: "Documentos", active: true, commercializable: true, created_at: "2026-10-06T00:00:00Z" },
  ],
  links: [{ plan_id: "plan-1", feature_id: "feature-1", enabled: true }],
  limits: [], featureLimits: [], dependencies: [],
};

vi.mock("@/hooks/usePlataformaSaaS", () => ({
  mensagemErroPlataforma: () => "Erro",
  usePlanosSaaS: () => ({ data: planosData }),
  useVersoesPlanosSaaS: () => ({ data: versoesData, refetch: refetchVersoes }),
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
    refetchVersoes.mockReset();
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

  it("salva, recarrega o baseline canônico, preserva motivo e limpa a confirmação", async () => {
    salvar.mockImplementation((_payload, callbacks) => callbacks.onSuccess("draft-1"));
    validar.mockImplementation((_draftId, callbacks) => callbacks.onSuccess({ complete: true, valid: true }));
    refetchVersoes.mockResolvedValue({
      data: [{
        id: "draft-1", plan_id: "plan-1", status: "DRAFT", revision: 1,
        price_amount: 59.9, currency: "BRL", billing_cycle: "monthly", trial_days: 14,
        effective_from: new Date(2026, 9, 7, 9, 0).toISOString(), limits_snapshot: {},
        features_snapshot: [{ feature_id: "feature-1", enabled: true }],
      }],
    });
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

    await waitFor(() => expect(validar).toHaveBeenCalledWith("draft-1", expect.any(Object)));
    expect(screen.getByLabelText("Motivo *")).toHaveValue("Preço inicial");
    expect(screen.getByLabelText("Digite PUBLICAR para confirmar")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeDisabled();
    expect(publishButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Digite PUBLICAR para confirmar"), { target: { value: "PUBLICAR" } });
    expect(publishButton).toBeEnabled();
    expect(publicar).not.toHaveBeenCalled();
  });

  it("motivo não suja o draft e a chave muda somente após alteração comercial", () => {
    render(<VersaoComercialEditor />);
    fireEvent.click(screen.getByLabelText("Plano *"));
    fireEvent.click(screen.getByText("Essencial"));
    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "Primeira tentativa" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar rascunho/i }));
    const firstKey = salvar.mock.calls[0][0].idempotencyKey;

    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "Segunda tentativa" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar rascunho/i }));
    expect(salvar.mock.calls[1][0].idempotencyKey).toBe(firstKey);

    fireEvent.change(screen.getByLabelText("Dias de teste *"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar rascunho/i }));
    expect(salvar.mock.calls[2][0].idempotencyKey).not.toBe(firstKey);
  });

  it("aceita motivo com dois caracteres e não aceita um caractere", () => {
    render(<VersaoComercialEditor />);
    fireEvent.click(screen.getByLabelText("Plano *"));
    fireEvent.click(screen.getByText("Essencial"));

    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "a" } });
    expect(screen.getByRole("button", { name: /Salvar rascunho/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "á🌱" } });
    expect(screen.getByRole("button", { name: /Salvar rascunho/i })).toBeEnabled();
  });

  it("mostra o catálogo global e módulos vazios para cada plano sem compartilhar seleção", () => {
    render(<VersaoComercialEditor />);
    fireEvent.click(screen.getByLabelText("Plano *"));
    fireEvent.click(screen.getByText("Essencial"));
    expect(screen.getByText("0 selecionadas de 2 disponíveis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fiscal/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Módulo vazio/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Agronômico/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Consultas/ }));
    expect(screen.getByText("1 selecionadas de 2 disponíveis")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Plano *"));
    fireEvent.click(screen.getByText("Gestão"));
    expect(screen.getByText("0 selecionadas de 2 disponíveis")).toBeInTheDocument();
  });

  it("desabilita publicação após alteração comercial até novo save", async () => {
    salvar.mockImplementation((_payload, callbacks) => callbacks.onSuccess("draft-1"));
    validar.mockImplementation((_draftId, callbacks) => callbacks.onSuccess({ complete: true, valid: true }));
    refetchVersoes.mockResolvedValue({
      data: [{
        id: "draft-1", plan_id: "plan-1", status: "DRAFT", revision: 1,
        price_amount: 59.9, currency: "BRL", billing_cycle: "monthly", trial_days: 14,
        effective_from: new Date(2026, 9, 7, 0, 13).toISOString(), limits_snapshot: {},
        features_snapshot: [{ feature_id: "feature-1", enabled: true }],
      }],
    });
    render(<VersaoComercialEditor />);
    fireEvent.click(screen.getByLabelText("Plano *"));
    fireEvent.click(screen.getByText("Essencial"));
    fireEvent.focus(screen.getByLabelText("Preço *"));
    fireEvent.change(screen.getByLabelText("Preço *"), { target: { value: "59,90" } });
    fireEvent.click(screen.getByText("Selecione o ciclo"));
    fireEvent.click(screen.getByText("Mensal"));
    fireEvent.change(screen.getByLabelText("Dias de teste *"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("Início da vigência *"), { target: { value: "2026-10-07T00:13" } });
    fireEvent.click(screen.getByRole("button", { name: /Agronômico/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Consultas/ }));
    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "Agrônomo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeDisabled());

    fireEvent.change(screen.getByLabelText("Digite PUBLICAR para confirmar"), { target: { value: "PUBLICAR" } });
    expect(screen.getByRole("button", { name: "Publicar versão" })).toBeEnabled();
    expect(screen.getByLabelText("Início da vigência *")).toHaveValue("2026-10-07T00:13");

    fireEvent.change(screen.getByLabelText("Dias de teste *"), { target: { value: "15" } });
    expect(screen.getByRole("button", { name: "Publicar versão" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeEnabled();
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
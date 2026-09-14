import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinalizarOSButton } from "@/components/cockpit/FinalizarOSButton";
import { EsteiraStepper } from "@/components/cockpit/EsteiraStepper";
import cockpitSource from "@/pages/CockpitLaboratorio.tsx?raw";

const { finalizarOS, toastError, toastInfo } = vi.hoisted(() => ({
  finalizarOS: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("@/hooks/useEsteiraLaboratorio", () => ({
  useEsteiraLaboratorio: () => ({ finalizarOS }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, info: toastInfo },
}));

const renderFinalizar = (onSuccess = vi.fn()) => {
  render(
    <FinalizarOSButton
      osId="os-1"
      origem="manual"
      podeFinalizar
      onSuccess={onSuccess}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Finalizar OS" }));
  return { onSuccess };
};

describe("FinalizarOSButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("impede envio duplicado enquanto a primeira finalização está em andamento", async () => {
    let concluir: ((value: boolean) => void) | undefined;
    finalizarOS.mockReturnValue(new Promise<boolean>((resolve) => { concluir = resolve; }));
    renderFinalizar();
    const confirmar = screen.getByRole("button", { name: "Sim, Finalizar OS" });

    fireEvent.click(confirmar);
    fireEvent.click(confirmar);

    expect(finalizarOS).toHaveBeenCalledTimes(1);
    await act(async () => concluir?.(true));
  });

  it("mantém a confirmação aberta quando a operação retorna falha", async () => {
    finalizarOS.mockResolvedValue(false);
    renderFinalizar();
    fireEvent.click(screen.getByRole("button", { name: "Sim, Finalizar OS" }));

    await waitFor(() => expect(finalizarOS).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("fecha e chama onSuccess somente quando a operação tem sucesso", async () => {
    const onSuccess = vi.fn();
    finalizarOS.mockResolvedValue(true);
    renderFinalizar(onSuccess);
    fireEvent.click(screen.getByRole("button", { name: "Sim, Finalizar OS" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("mantém a confirmação aberta e mostra retorno amigável em exceção", async () => {
    finalizarOS.mockRejectedValue(new Error("detalhe interno"));
    renderFinalizar();
    fireEvent.click(screen.getByRole("button", { name: "Sim, Finalizar OS" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(
      "Não foi possível finalizar esta OS.",
      expect.any(Object),
    ));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("explica pendências mesmo quando a lista está vazia", () => {
    render(<FinalizarOSButton osId="os-1" origem="manual" podeFinalizar={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver pendências para finalizar" }));
    expect(toastInfo).toHaveBeenCalledWith("Ações pendentes para finalização", expect.objectContaining({ description: expect.anything() }));
  });
});

describe("refinamentos do Cockpit", () => {
  it("mantém filtros acessíveis, textos completos e chave de histórico sensível ao status", () => {
    expect(cockpitSource).toContain('aria-label="Filtrar por origem"');
    expect(cockpitSource).toContain('aria-label="Filtrar por prioridade"');
    expect(cockpitSource).toContain("Todas as origens");
    expect(cockpitSource).toContain("Todas as prioridades");
    expect(cockpitSource).toContain('["esteira-history", selectedItem?.os_id, selectedItem?.status_esteira_oficial]');
    expect(cockpitSource).toContain("replace(/_/g, ' ')");
    expect(cockpitSource).toContain("Nenhuma OS nesta etapa com os filtros atuais");
  });

  it("mostra o pré-requisito de lote no CQ bloqueado", () => {
    render(
      <MemoryRouter>
        <EsteiraStepper
          item={{ id: "p-1", os_id: "os-1", origem: "manual", stage: "aguardando_cq" }}
          handlers={{
            onAssumirProducao: vi.fn(),
            onEnviarParaCQ: vi.fn(),
            onEnviarParaEnvase: vi.fn(),
            onConcluirEnvase: vi.fn(),
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Pré-requisito: gere o lote antes de registrar o CQ.")).toBeInTheDocument();
  });
});
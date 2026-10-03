import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PwaManualCheckButton } from "./PwaManualCheckButton";

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  inspect: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("./registerSW", () => ({ inspectPublishedVersion: mocks.inspect }));

function renderButton() {
  return render(<TooltipProvider><PwaManualCheckButton /></TooltipProvider>);
}

describe("PwaManualCheckButton", () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.inspect.mockReset().mockResolvedValue({ status: "current" });
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  it("fica ausente sem autenticação e visível no cabeçalho autenticado", () => {
    const view = renderButton();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    mocks.user = { id: "usuario-1" };
    view.rerender(<TooltipProvider><PwaManualCheckButton /></TooltipProvider>);
    expect(screen.getByRole("button", { name: "Verificar se há nova versão do Cultivo Farm" })).toBeInTheDocument();
  });

  it.each([
    ["current", "Você já está na versão mais recente.", "success"],
    ["offline", "Sem conexão. Não foi possível verificar atualizações.", "error"],
    ["error", "Não foi possível verificar a atualização agora.", "error"],
  ] as const)("informa o resultado manual %s", async (status, message, channel) => {
    mocks.user = { id: "usuario-1" };
    mocks.inspect.mockResolvedValue({ status });
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Verificar se há nova versão do Cultivo Farm" }));
    await waitFor(() => expect(mocks[channel]).toHaveBeenCalledWith(message));
    expect(mocks.inspect).toHaveBeenCalledWith(fetch, "manual");
  });

  it("protege contra duplo clique e não mostra toast redundante para update", async () => {
    let finish: ((value: { status: string }) => void) | undefined;
    mocks.user = { id: "usuario-1" };
    mocks.inspect.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderButton();
    const button = screen.getByRole("button", { name: "Verificar se há nova versão do Cultivo Farm" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.inspect).toHaveBeenCalledTimes(1);
    await act(async () => finish?.({ status: "update_available" }));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("usa texto no desktop, ícone em telas estreitas, tooltip e aria-label", () => {
    mocks.user = { id: "usuario-1" };
    renderButton();
    const button = screen.getByRole("button", { name: "Verificar se há nova versão do Cultivo Farm" });
    expect(button.querySelector("span")?.className).toContain("hidden sm:inline");
    expect(button.className).not.toContain("fixed");
  });
});
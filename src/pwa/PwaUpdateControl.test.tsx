import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PwaUpdateControl } from "./PwaUpdateControl";

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  snapshot: { status: "hidden", version: null, staleBuild: false },
  inspect: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("./registerSW", () => ({
  PWA_UPDATE_STATE_EVENT: "pwa:update-state",
  getPwaUpdateSnapshot: () => mocks.snapshot,
  inspectPublishedVersion: mocks.inspect,
}));

describe("PwaUpdateControl", () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.snapshot = { status: "hidden", version: null, staleBuild: false };
    mocks.inspect.mockReset().mockResolvedValue({ status: "current" });
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  it("fica ausente sem autenticação e visível globalmente após login", async () => {
    const view = render(<PwaUpdateControl />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    mocks.user = { id: "usuario-1" };
    view.rerender(<PwaUpdateControl />);
    expect(screen.getByRole("button", { name: "Verificar se há nova versão do Cultivo Farm" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(1));
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each([
    ["current", "Você já está na versão mais recente.", "success"],
    ["offline", "Sem conexão. Não foi possível verificar atualizações.", "error"],
    ["error", "Não foi possível verificar a atualização agora.", "error"],
  ] as const)("informa o resultado manual %s", async (status, message, channel) => {
    mocks.user = { id: "usuario-1" };
    render(<PwaUpdateControl />);
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(1));
    mocks.inspect.mockClear().mockResolvedValue({ status });
    fireEvent.click(screen.getByRole("button", { name: "Verificar se há nova versão do Cultivo Farm" }));
    await waitFor(() => expect(mocks[channel]).toHaveBeenCalledWith(message));
  });

  it("não duplica clique nem toast quando uma atualização é encontrada", async () => {
    let finish: ((value: { status: string }) => void) | undefined;
    mocks.user = { id: "usuario-1" };
    render(<PwaUpdateControl />);
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(1));
    mocks.inspect.mockClear().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const button = screen.getByRole("button", { name: "Verificar se há nova versão do Cultivo Farm" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.inspect).toHaveBeenCalledTimes(1);
    await act(async () => finish?.({ status: "update_available" }));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("some quando o aviso de atualização assume o fluxo e respeita safe-area", () => {
    mocks.user = { id: "usuario-1" };
    render(<PwaUpdateControl />);
    const button = screen.getByRole("button", { name: "Verificar se há nova versão do Cultivo Farm" });
    expect(button.className).toContain("safe-area-inset-bottom");
    act(() => window.dispatchEvent(new CustomEvent("pwa:update-state", {
      detail: { status: "prompt", version: "nova", staleBuild: false },
    })));
    expect(screen.queryByRole("button", { name: "Verificar se há nova versão do Cultivo Farm" })).not.toBeInTheDocument();
  });
});
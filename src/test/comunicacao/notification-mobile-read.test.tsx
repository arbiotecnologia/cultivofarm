import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
const m = vi.hoisted(() => ({ read: vi.fn(), allRead: vi.fn(), refetch: vi.fn(), error: false, pending: false }));
vi.mock("@/hooks/useNotificacoesUnificadas", () => ({ useNotificacoesUnificadas: () => ({
  data: [], all: [{ id: "op:N", titulo: "Aviso próprio", tipo: "informativo", lido: false, created_at: "2026-10-08T04:00:00Z" }],
  unreadCount: 1, isLoading: false, isError: m.error, refetch: m.refetch,
  markRead: { mutate: m.read, isPending: m.pending }, markAllRead: { mutate: m.allRead, isPending: m.pending },
}) }));
vi.mock("@/hooks/usePushSubscription", () => ({ usePushSubscription: () => ({ permission: "denied" }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import MobileNotificacoes from "@/pages/app/MobileNotificacoes";
beforeEach(() => { vi.clearAllMocks(); m.error = false; m.pending = false; });
describe("Mobile notifications (mock, not authenticated browser)", () => {
  it("uses the same counted collection and offers individual and batch reading", () => {
    render(<MobileNotificacoes />);
    expect(screen.getByText("Aviso próprio")).toBeInTheDocument();
    expect(screen.getByText("1 não lidas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar Aviso próprio como lida" }));
    expect(m.read).toHaveBeenCalledWith("op:N", expect.objectContaining({ onError: expect.any(Function) }));
    fireEvent.click(screen.getByRole("button", { name: "Marcar todas" }));
    expect(m.allRead).toHaveBeenCalled();
  });
  it("shows failure and retry instead of false empty state", () => {
    m.error = true; render(<MobileNotificacoes />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar");
    expect(screen.queryByText("Nenhuma notificação")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(m.refetch).toHaveBeenCalled();
  });
  it("disables read commands while pending", () => {
    m.pending = true; render(<MobileNotificacoes />);
    expect(screen.getByRole("button", { name: "Marcar todas" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Marcar Aviso próprio como lida" })).toBeDisabled();
  });
});
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mutateAsync = vi.fn();
const success = vi.fn();
vi.mock("@/hooks/useRespondB2BQuote", () => ({ useRespondB2BQuote: () => ({ mutateAsync, isPending: false }) }));
vi.mock("sonner", () => ({ toast: { success: (m: string) => success(m), error: vi.fn() } }));
vi.mock("@/components/pedidos-b2b/PedidoItemProdutoInfo", () => ({ PedidoItemProdutoInfo: () => null }));

import { ResponderCotacaoDialog } from "@/components/comercial/ResponderCotacaoDialog";

async function respondWith(reason: string | null) {
  mutateAsync.mockResolvedValueOnce({ id: "o1", numero: "PED-1", status: "aguardando_aprovacao_credito", credit_block_reason: reason, final_amount: 10 });
  render(<ResponderCotacaoDialog open onOpenChange={() => {}} orderId="o1" orderNumero="PED-1" items={[{ id: "i1", quantidade: 1 }]} />);
  fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar cotação" }));
  await waitFor(() => expect(success).toHaveBeenCalled());
  return success.mock.calls[0][0] as string;
}

describe("ResponderCotacaoDialog credit block reason", () => {
  beforeEach(() => { mutateAsync.mockReset(); success.mockReset(); });
  it("shows the inactive-settings reason returned by the server", async () => {
    expect(await respondWith("configuracao_financeira_inativa")).toContain("Configuração financeira do parceiro ausente ou inativa");
  });
  it("shows the undefined-limit reason", async () => {
    expect(await respondWith("limite_nao_definido")).toContain("Limite de crédito não definido");
  });
  it("adds nothing when there is no reason", async () => {
    expect(await respondWith(null)).not.toContain("Bloqueio");
  });
});

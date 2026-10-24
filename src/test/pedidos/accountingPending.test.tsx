import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { orderAccountingState, isAccountingPending, ACCOUNTING_PENDING_CONTRACT } from "@/lib/orderAccountingState";
import { AccountingPendingNotice } from "@/components/pedidos/AccountingPendingNotice";

const pending = { c2_external_origin_snapshot: { contract: ACCOUNTING_PENDING_CONTRACT, accounting_validated: false, issuer_state: "DRAFT" } };

describe("estado contábil do pedido (somente snapshot do servidor)", () => {
  it("pedido criado pendente é reconhecido", () => {
    expect(orderAccountingState(pending)).toBe("pending");
  });
  it("contrato pendente com accounting_validated diferente de false não é tratado como pendente nem validado", () => {
    expect(orderAccountingState({ c2_external_origin_snapshot: { contract: ACCOUNTING_PENDING_CONTRACT, accounting_validated: true } })).toBe("unknown");
  });
  it("V1 validado não mostra pendência", () => {
    expect(orderAccountingState({ c2_external_origin_snapshot: { contract: "C2_EXTERNAL_ORDER_ORIGIN_V1" } })).toBe("validated");
  });
  it("coluna ausente (pacote não instalado) ou pedido interno => unknown", () => {
    expect(orderAccountingState({ id: "x" })).toBe("unknown");
    expect(isAccountingPending(null)).toBe(false);
  });
  it("aviso ao parceiro não promete aprovação, cobrança, NF ou entrega", () => {
    render(<AccountingPendingNotice audience="partner" />);
    const txt = screen.getByTestId("accounting-pending-notice").textContent ?? "";
    expect(txt).toMatch(/não pode ser aprovado, cobrado, faturado nem entregue/);
    expect(txt).not.toMatch(/será (aprovado|entregue|faturado)/);
  });
});

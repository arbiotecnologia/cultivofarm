import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinishedProductPurchaseEntrySection } from "./FinishedProductPurchaseEntrySection";

const mocks = vi.hoisted(() => ({
  capability: vi.fn(),
  purchaseForm: vi.fn(() => <div>formulário de compra montado</div>),
}));
vi.mock("@/hooks/useFinishedProductPurchase", () => ({
  useFinishedProductPurchaseCapability: mocks.capability,
}));
vi.mock("./FinishedProductPurchaseEntryForm", () => ({
  FinishedProductPurchaseEntryForm: mocks.purchaseForm,
}));

function renderSection() {
  return render(
    <FinishedProductPurchaseEntrySection
      open
      biologicalEntry={<div>envase biológico preservado</div>}
      onSuccess={vi.fn()}
    />,
  );
}

describe("entrada de revenda condicionada à capability", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it.each([undefined, { contract: "FINISHED_PRODUCT_PURCHASE_V1", available: false, reason: "ACTOR_DENIED" }])(
    "não mostra nem monta a compra sem disponibilidade positiva: %o",
    (data) => {
      mocks.capability.mockReturnValue({ data });
      renderSection();
      expect(screen.getByText("envase biológico preservado")).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: "Compra para revenda" })).toBeNull();
      expect(mocks.purchaseForm).not.toHaveBeenCalled();
    },
  );

  it("mostra a escolha somente com ACK compatível e monta o formulário apenas na aba", async () => {
    mocks.capability.mockReturnValue({ data: { contract: "FINISHED_PRODUCT_PURCHASE_V1", available: true } });
    renderSection();
    expect(screen.getByText("envase biológico preservado")).toBeInTheDocument();
    expect(mocks.purchaseForm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Compra para revenda" }));
    expect(screen.getByText("formulário de compra montado")).toBeInTheDocument();
    expect(mocks.purchaseForm).toHaveBeenCalled();
  });
});

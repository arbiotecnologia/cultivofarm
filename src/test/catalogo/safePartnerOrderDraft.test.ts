import { expect, it } from "vitest";
import { safePartnerOrderDraft } from "@/lib/authz/safePartnerOrderDraft";
it("retains only user choices, never a price/hash/receipt", () => {
  const raw = { partnerId: "partner", addItemId: "item", items: [{ itemId: "item", volumeId: "volume", quantity: 2, price: 99 }], hash: "old", token: "not-authority" };
  expect(safePartnerOrderDraft(raw)).toEqual({ partnerId: "partner", addItemId: "item", items: [{ itemId: "item", volumeId: "volume", quantity: 2 }] });
});
it.each([0, -1, Infinity, NaN])("rejects invalid quantity %s", quantity => {
  expect(safePartnerOrderDraft({ partnerId: "partner", addItemId: null, items: [{ itemId: "item", volumeId: "volume", quantity }] })).toBeNull();
});
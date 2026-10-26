import { expect, it } from "vitest";
import { safePartnerOrderDraft } from "@/lib/authz/safePartnerOrderDraft";
it("retains only user choices, never a price/hash/receipt", () => {
  const raw = { partnerId: "partner", addItemId: "item", requestedDeliveryDate: null, items: [{ itemId: "item", volumeId: "volume", quantity: 2, price: 99 }], hash: "old", token: "not-authority" };
  expect(safePartnerOrderDraft(raw)).toEqual({ partnerId: "partner", addItemId: "item", requestedDeliveryDate: null, items: [{ itemId: "item", volumeId: "volume", quantity: 2 }] });
});
it.each([0, -1, Infinity, NaN])("rejects invalid quantity %s", quantity => {
  expect(safePartnerOrderDraft({ partnerId: "partner", addItemId: null, requestedDeliveryDate: null, items: [{ itemId: "item", volumeId: "volume", quantity }] })).toBeNull();
});
it("retains a well-formed requested delivery date (volatile user choice)", () => {
  const draft = safePartnerOrderDraft({ partnerId: "partner", addItemId: null, requestedDeliveryDate: "2026-11-05", items: [{ itemId: "item", volumeId: "volume", quantity: 1 }] });
  expect(draft?.requestedDeliveryDate).toBe("2026-11-05");
});
it.each(["05/11/2026", "2026-11-5", "not-a-date", "2026-11-05T00:00:00Z", "'; drop"])("drops malformed date %s instead of restoring it", requestedDeliveryDate => {
  const draft = safePartnerOrderDraft({ partnerId: "partner", addItemId: null, requestedDeliveryDate, items: [{ itemId: "item", volumeId: "volume", quantity: 1 }] });
  expect(draft?.requestedDeliveryDate).toBeNull();
});

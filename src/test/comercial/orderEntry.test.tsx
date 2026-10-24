import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { PartnerOrderEntry } from "@/components/comercial/PartnerOrderEntry";
import { CommercialOrderEntry } from "@/components/comercial/CommercialOrderEntry";
import { ownFinanceActorAllowed } from "@/lib/comercial/financeAccess";
import { readOwnerOrderCapability, ownerOrderRoute } from "@/lib/comercial/ownerOrderAccess";
afterEach(cleanup);
it("pending access offers no navigation to an order even with a previous capability", () => {
  render(<MemoryRouter><PartnerOrderEntry pending canReadCatalog canCreate /></MemoryRouter>);
  expect(screen.queryByRole("link")).toBeNull();
});
it("catalog denial offers no buyer link or mutation command", () => {
  render(<MemoryRouter><PartnerOrderEntry canReadCatalog={false} canCreate={false} /></MemoryRouter>);
  expect(screen.queryByRole("link")).toBeNull(); expect(screen.queryByRole("button")).toBeNull();
});
it("commercial guidance never routes staff into buyer impersonation or a fabricated sale writer", () => {
  render(<MemoryRouter><CommercialOrderEntry /></MemoryRouter>);
  expect(screen.queryByRole("link")).toBeNull(); expect(screen.queryByRole("button")).toBeNull();
});
it("catalogue-only contract cannot grant order creation or finance, including technical scope", () => {
  const catalogOnly = { contract: "C2_CAT_V1", order_create: true };
  expect(readOwnerOrderCapability(catalogOnly)).toBe(false);
  expect(ownerOrderRoute("/portal-parceiro/catalogo", false, new Set(["pedidos_b2b"]))).toBe(false);
  expect(ownFinanceActorAllowed(["parceiro_b2b_tecnico"], true)).toBe(false);
});
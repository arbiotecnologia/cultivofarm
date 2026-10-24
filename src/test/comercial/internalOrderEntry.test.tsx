import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { CommercialOrderEntry } from "@/components/comercial/CommercialOrderEntry";
import { readInternalOrderEntryCapability, internalOrderTargetAllowed, internalOrderDraftScope, INTERNAL_ORDER_ENTRY_CONTRACT } from "@/lib/comercial/internalOrderEntry";
import { readOwnerOrderCapability } from "@/lib/comercial/ownerOrderAccess";

afterEach(cleanup);
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const PA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const capA = { contract: INTERNAL_ORDER_ENTRY_CONTRACT, order_create: true, organization_id: A, partners: [{ partner_id: PA, commercial_owner_organization_id: A }] };

describe("entrada comercial interna — fail-closed sem contrato LIVE", () => {
  it("sem resposta, contrato de catálogo ou de compra própria não abre", () => {
    expect(readInternalOrderEntryCapability(undefined, A)).toBeNull();
    expect(readInternalOrderEntryCapability({ ...capA, contract: "C2_OWNER_ORDER_V1" }, A)).toBeNull();
    expect(readInternalOrderEntryCapability({ ...capA, order_create: "true" }, A)).toBeNull();
    expect(readOwnerOrderCapability(capA)).toBe(false);
  });
  it("interno A aceita só parceiros de A; interno B não reutiliza resposta de A", () => {
    const cap = readInternalOrderEntryCapability(capA, A);
    expect(internalOrderTargetAllowed(cap, PA)).toBe(true);
    expect(readInternalOrderEntryCapability(capA, B)).toBeNull();
    expect(readInternalOrderEntryCapability({ ...capA, partners: [{ partner_id: PB, commercial_owner_organization_id: B }] }, A)).toBeNull();
  });
  it("ID de empresa estrangeira na URL não autoriza", () => {
    const cap = readInternalOrderEntryCapability(capA, A);
    expect(internalOrderTargetAllowed(cap, PB)).toBe(false);
    expect(internalOrderTargetAllowed(null, PA)).toBe(false);
  });
  it("troca de empresa, parceiro, perfil ou revogação descarta rascunho", () => {
    const base = { actorId: "u", organizationId: A, roles: ["gestor_comercial"], partnerId: PA, authzEpoch: 1, ready: true };
    const k = internalOrderDraftScope(base);
    expect(k).not.toBeNull();
    expect(internalOrderDraftScope({ ...base, organizationId: B })).not.toBe(k);
    expect(internalOrderDraftScope({ ...base, partnerId: PB })).not.toBe(k);
    expect(internalOrderDraftScope({ ...base, roles: ["financeiro"] })).not.toBe(k);
    expect(internalOrderDraftScope({ ...base, authzEpoch: 2 })).not.toBe(k);
    expect(internalOrderDraftScope({ ...base, ready: false })).toBeNull();
  });
  it("tela comercial não expõe criar/enviar nem link enquanto o servidor não libera", () => {
    render(<MemoryRouter><CommercialOrderEntry /></MemoryRouter>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/não liberado/);
  });
});

import { afterEach, expect, it } from "vitest";
import { clearAllPartnerOrderDrafts, loadPartnerOrderDraft, savePartnerOrderDraft, PARTNER_ORDER_DRAFT_TTL_MS } from "@/lib/authz/partnerOrderDraftStore";

const scope = { userId: "u1", tenantId: "t1", partnerId: "p1" };
const draft = { partnerId: "p1", addItemId: "row", requestedDeliveryDate: "2026-11-20",
  items: [{ itemId: "liq", volumeId: "v1", quantity: 3 }, { itemId: "sol", packagingId: "pk", quantity: 2 }] };
afterEach(() => sessionStorage.clear());

it("guarda só ids/quantidades/data no escopo e devolve na montagem seguinte", () => {
  savePartnerOrderDraft(scope, draft, 1000);
  const raw = sessionStorage.getItem("cf:b2b-order-draft:v1:u1:t1:p1") ?? "";
  expect(raw).not.toMatch(/preco|price|hash|token|key|receipt/i);
  expect(loadPartnerOrderDraft(scope, 2000)).toEqual({ ...draft, addItemId: null });
});
it.each([
  ["outro usuário", { ...scope, userId: "u2" }], ["outro tenant", { ...scope, tenantId: "t2" }], ["outro parceiro", { ...scope, partnerId: "p2" }],
])("escopo diferente (%s) não lê", (_n, other) => {
  savePartnerOrderDraft(scope, draft, 1000);
  expect(loadPartnerOrderDraft(other, 2000)).toBeNull();
});
it("expira e é apagado", () => {
  savePartnerOrderDraft(scope, draft, 1000);
  expect(loadPartnerOrderDraft(scope, 1000 + PARTNER_ORDER_DRAFT_TTL_MS + 1)).toBeNull();
  expect(sessionStorage.getItem("cf:b2b-order-draft:v1:u1:t1:p1")).toBeNull();
});
it.each([
  ["JSON inválido", "{x"],
  ["chave extra no registro", JSON.stringify({ v: 1, u: "u1", t: "t1", p: "p1", savedAt: 1, expiresAt: 2e15, draft: { ...draft }, hash: "h" })],
  ["preço no item", JSON.stringify({ v: 1, u: "u1", t: "t1", p: "p1", savedAt: 1000, expiresAt: 5000, draft: { ...draft, items: [{ itemId: "s", packagingId: "pk", quantity: 1, preco: 9 }] } })],
  ["volume+embalagem na mesma linha", JSON.stringify({ v: 1, u: "u1", t: "t1", p: "p1", savedAt: 1000, expiresAt: 5000, draft: { ...draft, items: [{ itemId: "s", packagingId: "pk", volumeId: "v", quantity: 1 }] } })],
  ["embalagem fracionada", JSON.stringify({ v: 1, u: "u1", t: "t1", p: "p1", savedAt: 1000, expiresAt: 5000, draft: { ...draft, items: [{ itemId: "s", packagingId: "pk", quantity: 1.5 }] } })],
  ["parceiro divergente no rascunho", JSON.stringify({ v: 1, u: "u1", t: "t1", p: "p1", savedAt: 1000, expiresAt: 5000, draft: { ...draft, partnerId: "p9" } })],
  ["validade maior que o TTL", JSON.stringify({ v: 1, u: "u1", t: "t1", p: "p1", savedAt: 1000, expiresAt: 1000 + PARTNER_ORDER_DRAFT_TTL_MS * 10, draft })],
])("dado corrompido (%s) é ignorado e apagado", (_n, raw) => {
  sessionStorage.setItem("cf:b2b-order-draft:v1:u1:t1:p1", raw);
  expect(loadPartnerOrderDraft(scope, 2000)).toBeNull();
  expect(sessionStorage.getItem("cf:b2b-order-draft:v1:u1:t1:p1")).toBeNull();
});
it("carrinho vazio remove a retenção (pedido enviado limpa)", () => {
  savePartnerOrderDraft(scope, draft, 1000);
  savePartnerOrderDraft(scope, { ...draft, items: [], requestedDeliveryDate: null }, 1500);
  expect(sessionStorage.getItem("cf:b2b-order-draft:v1:u1:t1:p1")).toBeNull();
});
it("clearAll (logout/troca de escopo/revogação) apaga só as retenções do pedido", () => {
  savePartnerOrderDraft(scope, draft, 1000); savePartnerOrderDraft({ ...scope, partnerId: "p2" }, { ...draft, partnerId: "p2" }, 1000);
  sessionStorage.setItem("pending-order-attempt:keep", "x");
  clearAllPartnerOrderDrafts();
  expect(Object.keys(sessionStorage)).toEqual(["pending-order-attempt:keep"]);
});

import { expect, it } from "vitest";
import { readOwnFinanceCapability, ownFinanceRoute } from "./financeAccess";
const features = new Set(["pedidos_b2b", "contas_receber"]);
it("catalogue capability never authorizes finance", () => {
  expect(readOwnFinanceCapability({ contract: "C2_CAT_V1", catalog_read: true, obligations_read: true })).toBe(false);
});
it("explicit finance projection and both existing entitlements permit only the own page", () => {
  expect(ownFinanceRoute("/portal-parceiro/financeiro", readOwnFinanceCapability({ contract: "C2_OWN_OBLIGATIONS_V1", obligations_read: true }), features)).toBe(true);
});
it.each(["pedidos_b2b", "contas_receber"])("missing %s denies menu and route", feature => {
  expect(ownFinanceRoute("/portal-parceiro/financeiro", true, new Set([...features].filter(f => f !== feature)))).toBe(false);
});
it.each(["simulador", "arquivos", "pedidos", "financeiro/documentos"])("finance capability does not open sibling %s", path => {
  expect(ownFinanceRoute(`/portal-parceiro/${path}`, true, features)).toBe(false);
});
it.each([null, {}, { contract: "C2_OWN_OBLIGATIONS_V1", obligations_read: "true" }])("missing or malformed capability denies", raw => {
  expect(readOwnFinanceCapability(raw)).toBe(false);
});
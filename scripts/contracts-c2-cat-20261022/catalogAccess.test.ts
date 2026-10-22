import { expect, it } from "vitest";
import { ownerCatalogRoute, readCatalogCapabilities } from "./catalogAccess";
const caps = { catalog_read: true, sheets_read: true };
it.each(["simulador", "financeiro", "arquivos", "pedidos", "novo", "favoritos", "simulacoes", "catalogo/extra"])("catalogue capability never grants %s", route => {
  expect(ownerCatalogRoute(`/portal-parceiro/${route}`, caps)).toBe(false);
});
it("grants only exact catalogue and sheets paths", () => {
  expect(ownerCatalogRoute("/portal-parceiro/catalogo", caps)).toBe(true);
  expect(ownerCatalogRoute("/portal-parceiro/fichas", caps)).toBe(true);
  expect(ownerCatalogRoute("/portal-parceiro/fichas", { catalog_read: true })).toBe(false);
});
it.each([null, {}, { contract: "other", catalog_read: true }, { contract: "C2_CAT_V1", catalog_read: "true" }])("old or malformed projection denies", raw => {
  expect(readCatalogCapabilities(raw).catalog_read).toBe(false);
});
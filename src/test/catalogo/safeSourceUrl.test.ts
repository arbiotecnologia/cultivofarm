import { expect, it } from "vitest";
import {
  safeSourceUrl,
  validateOptionalSourceUrl,
} from "@/lib/catalogo/safeSourceUrl";
import { sourceSchema } from "@/lib/catalogo/documentarySuggestions";
it("HTTPS documental permitido", () =>
  expect(safeSourceUrl("https://www.embrapa.br/ficha")).toBe(
    "https://www.embrapa.br/ficha",
  ));
it.each([
  "javascript:alert(1)",
  "data:text/html,test",
  "http://example.org/ficha",
  "https://u:p@example.org/ficha",
  "https://example.org/\nattack",
  "https://example.org/%0Aattack",
  "https://example.org\\attack",
  "https://localhost/x",
  "https://foo.local/x",
])("nega URL %s", (url) => {
  expect(safeSourceUrl(url)).toBeNull();
  expect(() => validateOptionalSourceUrl(url)).toThrow("HTTPS");
  expect(
    sourceSchema.safeParse({ url, title: "Fonte", excerpt: "Trecho" }).success,
  ).toBe(false);
});
it("ausência opcional não inventa URL", () =>
  expect(() => validateOptionalSourceUrl(null)).not.toThrow());

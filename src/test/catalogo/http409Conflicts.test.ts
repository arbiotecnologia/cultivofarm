import { describe, expect, it } from "vitest";
import { mapTenantVisibilityError } from "@/lib/catalogo/tenantCatalogVisibility";
describe("catalog_visibility_conflict_http409_20261026 — cliente", () => {
  it("PT409 com mensagem canônica mostra conflito (independe do código)", () => {
    for (const code of ["PT409", "40001"]) expect(mapTenantVisibilityError({ code, message: "catalog_visibility_version_conflict" })).toContain("Outra pessoa alterou");
    expect(mapTenantVisibilityError({ code: "PT409", message: "catalog_visibility_idempotency_conflict" })).toContain("Operação repetida");
  });
  it("PT409 sem mensagem conhecida não vira sucesso nem 'indisponível'", () => {
    expect(mapTenantVisibilityError({ code: "PT409", message: "x" })).toBe("Não foi possível concluir a operação de visibilidade.");
  });
});

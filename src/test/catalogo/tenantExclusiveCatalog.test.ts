import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildTenantProductPayload, parseTenantProductAck, tenantProductErrorMessage } from "@/lib/catalogo/tenantProducts";
import { getAccessLevel } from "@/lib/permissions";

describe("catálogo exclusivo por empresa — contrato do cliente", () => {
  it("nunca envia empresa/dono no payload", () => {
    expect(() => buildTenantProductPayload({ nome: "X", owner_organization_id: "a" } as never, true)).toThrow(/não permitido/);
  });
  it("criação exige nome com 2..200 caracteres", () => {
    expect(() => buildTenantProductPayload({ codigo: "A" }, true)).toThrow(/nome/);
    expect(() => buildTenantProductPayload({ nome: " x " }, true)).toThrow(/2 e 200/);
  });
  it("valores monetários negativos ou inválidos são recusados", () => {
    expect(() => buildTenantProductPayload({ nome: "Bio", valor_ha_brl: -1 }, true)).toThrow(/inválido/);
    expect(() => buildTenantProductPayload({ nome: "Bio", valor_ha_brl: "abc" }, true)).toThrow(/inválido/);
    expect(buildTenantProductPayload({ nome: "Bio", tipo: "inoculante", valor_ha_brl: "10,5" }, true)).toEqual({ nome: "Bio", tipo: "inoculante", valor_ha_brl: 10.5 });
  });
  it("revisão f588e1d8: criação exige tipo do enum real; b2b_enabled nunca nulo (omitido = false no servidor)", () => {
    expect(() => buildTenantProductPayload({ nome: "Bio" }, true)).toThrow(/tipo/);
    expect(() => buildTenantProductPayload({ nome: "Bio", tipo: "INVALID" }, true)).toThrow(/tipo de produto válido/);
    expect(() => buildTenantProductPayload({ nome: "Bio", tipo: "solo", b2b_enabled: null }, true)).toThrow(/b2b_enabled/);
    expect(buildTenantProductPayload({ nome: "Bio", tipo: "solo" }, true)).not.toHaveProperty("b2b_enabled");
    expect(buildTenantProductPayload({ descricao: "x" }, false)).toEqual({ descricao: "x" });
    expect(tenantProductErrorMessage("22P02", "invalid input value for enum")).toMatch(/tipo/);
  });
  it("ACK de outro produto é recusado; ACK sem versão é recusado", () => {
    expect(() => parseTenantProductAck({ product_id: "b", updated_at: "t", replayed: false }, "a")).toThrow(/outro produto/);
    expect(() => parseTenantProductAck({ product_id: "a", replayed: false }, "a")).toThrow(/inválida/);
    expect(parseTenantProductAck({ product_id: "a", updated_at: "t", replayed: true }, "a").replayed).toBe(true);
  });
  it("conflitos de versão e permissão têm mensagens específicas", () => {
    expect(tenantProductErrorMessage("PT409", "tenant_product_version_conflict")).toMatch(/alterado/);
    expect(tenantProductErrorMessage("42501", "catalog_tenant_forbidden")).toMatch(/permissão/);
    expect(tenantProductErrorMessage("PT409", "tenant_product_duplicate_name")).toMatch(/mesmo nome|com esse nome/);
  });
  it("Superadmin não recebe a tela de produtos da empresa; administrador edita", () => {
    expect(getAccessLevel("superadmin" as never, "/configuracoes/produtos")).toBe("none");
    expect(getAccessLevel("administrador", "/configuracoes/produtos")).toBe("rw");
    expect(getAccessLevel("parceiro_b2b", "/configuracoes/produtos")).toBe("none");
  });
  it("painel da plataforma não monta mais o catálogo global nem perfis fiscais globais", () => {
    const src = readFileSync("src/pages/plataforma/PlataformaHome.tsx", "utf8");
    expect(src).not.toContain("PlatformCatalogReadTab");
    expect(src).not.toContain("platformGlobal");
  });
});

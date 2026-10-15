import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  TENANT_OWNED_CATALOG_ENABLED, canManageOwnedItem, catalogOrigin, createResponseFence,
  mutateOwnedItem, ownedCatalogError, ownedCatalogKeys,
} from "@/lib/catalogo/tenantCatalogOwnership";

const sql = readFileSync("scripts/rbac-audit/proposed-tenant-catalog-ownership.sql", "utf8");
const rollback = readFileSync("scripts/rbac-audit/rollback-tenant-catalog-ownership.sql", "utf8");

describe("ownership — frontend desabilitado", () => {
  it("gate de UI fechado: mutação não chama o servidor", async () => {
    const rpc = vi.fn();
    await expect(mutateOwnedItem({ rpc }, { entity: "cultura", operation: "create", entityId: null, expectedUpdatedAt: null,
      payload: { nome: "X" }, reason: "motivo suficiente", idempotencyKey: "k" })).rejects.toMatchObject({ code: "disabled" });
    expect(rpc).not.toHaveBeenCalled();
    expect(TENANT_OWNED_CATALOG_ENABLED).toBe(false);
  });
  it("global nunca é gerenciável; próprio só com gate e permissão", () => {
    expect(catalogOrigin({ owner_organization_id: null })).toBe("global");
    expect(canManageOwnedItem({ owner_organization_id: null }, true, true)).toBe(false);
    expect(canManageOwnedItem({ owner_organization_id: "o" }, true, true)).toBe(true);
    expect(canManageOwnedItem({ owner_organization_id: "o" }, false, true)).toBe(false);
    expect(canManageOwnedItem({ owner_organization_id: "o" }, true)).toBe(false);
  });
  it("duplicata global ativa orienta Exibir; inativa orienta solicitar ativação", () => {
    const a = ownedCatalogError({ message: "catalog_owned_duplicate_global_active", code: "23505", details: "1875527c-a65a-483b-a6c2-9122d5ec2a51" }, "produto");
    expect(a.code).toBe("duplicate_global_active");
    expect(a.message).toMatch(/Exibir/);
    expect(a.globalId).toBe("1875527c-a65a-483b-a6c2-9122d5ec2a51");
    const i = ownedCatalogError({ message: "catalog_owned_duplicate_global_inactive", code: "23505" }, "produto");
    expect(i.message).toMatch(/Solicite a ativação/);
    expect(i.message).not.toMatch(/Exibir/);
  });
  it("erros de outra empresa e desconhecidos não revelam existência", () => {
    expect(ownedCatalogError({ message: "catalog_owned_not_found" }, "cultura").code).toBe("denied");
    expect(ownedCatalogError({ message: "boom secret" }, "cultura").message).not.toMatch(/secret/);
  });
  it("cache por empresa+usuário e cerca contra resposta tardia", () => {
    const s = { organizationId: "A", userId: "u" };
    expect(ownedCatalogKeys.list(s, "produto", "", 0, 20)).toEqual(["tenant-catalog", "A", "u", "owned", "produto", "", 0, 20]);
    const f = createResponseFence();
    const first = f.begin("A|u"); const second = f.begin("A|u");
    expect(first("A|u")).toBe(false);
    expect(second("A|u")).toBe(true);
    expect(second("B|u")).toBe(false);
  });
});

describe("ownership — SQL candidato (estrutural)", () => {
  it("gate nasce OFF, sem backfill e sem grants de DML", () => {
    expect(sql).toMatch(/VALUES \(true, false\)/);
    expect(sql).not.toMatch(/UPDATE public\.(produtos|microrganismos|culturas)\s+SET owner_organization_id/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*ON (TABLE )?public\.(produtos|microrganismos|culturas|formulacoes|catalogo_volumes)/);
  });
  it("leitura restritiva global+própria e dono imutável", () => {
    expect(sql.match(/AS RESTRICTIVE FOR SELECT TO anon, authenticated/g)?.length).toBe(5);
    expect(sql).toMatch(/catalog_owner_immutable/);
    expect(sql).toMatch(/catalog_cross_owner_reference/);
  });
  it("fachada INVOKER sem parâmetro de empresa e núcleo DEFINER com search_path fixo", () => {
    const facade = sql.slice(sql.indexOf("CREATE FUNCTION public.tenant_catalog_owned_mutate"));
    expect(facade).toMatch(/SECURITY INVOKER SET search_path=''/);
    expect(facade.split("AS $$")[0]).not.toMatch(/organization/);
    expect(sql).toMatch(/catalog_owned_mutate_core[\s\S]*SECURITY DEFINER SET search_path=''/);
    expect(sql).toMatch(/'organization_id','owner_organization_id'/);
  });
  it("rollback não destrói ledger nem reabre grants", () => {
    expect(rollback).not.toMatch(/DROP TABLE[^;]*catalog_tenant_owned_ledger/);
    expect(rollback).not.toMatch(/catalog_tenant_visibility/);
    expect(rollback).not.toMatch(/\bGRANT\b/);
    expect(rollback).toMatch(/rollback_partial_private_rows_present/);
  });
});

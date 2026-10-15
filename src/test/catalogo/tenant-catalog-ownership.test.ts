import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  TENANT_OWNED_CATALOG_ENABLED, canManageOwnedItem, catalogOrigin, createResponseFence,
  mutateOwnedItem, ownedAllowedKeys, ownedCatalogError, ownedCatalogKeys,
} from "@/lib/catalogo/tenantCatalogOwnership";

const sql = readFileSync("scripts/rbac-audit/proposed-tenant-catalog-ownership.sql", "utf8");
const readers = readFileSync("scripts/rbac-audit/proposed-tenant-catalog-ownership-02-readers.sql", "utf8");
const rollback = readFileSync("scripts/rbac-audit/rollback-tenant-catalog-ownership.sql", "utf8");
const runtime = readFileSync("scripts/rbac-audit/runtime-test-tenant-catalog-ownership.sql", "utf8");

const AR = "007bb519-cba0-4704-be2c-cb93ad010048";
const FSF = "11111111-1111-4111-8111-111111111111";

describe("ownership — frontend desabilitado", () => {
  it("gate de UI fechado: mutação não chama o servidor", async () => {
    const rpc = vi.fn();
    await expect(mutateOwnedItem({ rpc }, { entity: "cultura", operation: "create", entityId: null, expectedUpdatedAt: null,
      payload: { nome: "X" }, reason: "motivo suficiente", idempotencyKey: "k" })).rejects.toMatchObject({ code: "disabled" });
    expect(rpc).not.toHaveBeenCalled();
    expect(TENANT_OWNED_CATALOG_ENABLED).toBe(false);
  });
  it("global nunca é gerenciável; próprio só da empresa atual (FSF não gerencia item AR)", () => {
    expect(catalogOrigin({ owner_organization_id: null })).toBe("global");
    expect(canManageOwnedItem({ owner_organization_id: null }, AR, true, true)).toBe(false);
    expect(canManageOwnedItem({ owner_organization_id: AR }, AR, true, true)).toBe(true);
    expect(canManageOwnedItem({ owner_organization_id: AR }, FSF, true, true)).toBe(false);
    expect(canManageOwnedItem({ owner_organization_id: AR }, null, true, true)).toBe(false);
    expect(canManageOwnedItem({ owner_organization_id: AR }, AR, false, true)).toBe(false);
    expect(canManageOwnedItem({ owner_organization_id: AR }, AR, true)).toBe(false);
  });
  it("whitelist por operação espelha o servidor", () => {
    expect(ownedAllowedKeys("cultura", "create")).toEqual(["nome", "descricao"]);
    expect(ownedAllowedKeys("produto", "update")).not.toContain("tipo");
    expect(ownedAllowedKeys("produto", "archive")).toEqual([]);
    expect(ownedAllowedKeys("cultura", "composition")).toEqual([]);
  });
  it("duplicata global ativa orienta Exibir; inativa orienta solicitar ativação", () => {
    const a = ownedCatalogError({ message: "catalog_owned_duplicate_global_active", code: "23505", details: "1875527c-a65a-483b-a6c2-9122d5ec2a51" }, "produto");
    expect(a.code).toBe("duplicate_global_active");
    expect(a.message).toMatch(/Exibir/);
    expect(a.globalId).toBe("1875527c-a65a-483b-a6c2-9122d5ec2a51");
    const i = ownedCatalogError({ message: "catalog_owned_duplicate_global_inactive", code: "23505" }, "produto");
    expect(i.message).toMatch(/Solicite a ativação/);
    expect(i.message).not.toMatch(/Exibir/);
    expect(ownedCatalogError({ message: "catalog_owned_archived" }, "cultura").code).toBe("archived");
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

describe("ownership — SQL candidato 01 (estrutural)", () => {
  it("gate nasce OFF, sem backfill e sem grants de DML", () => {
    expect(sql).toMatch(/VALUES \(true, false\)/);
    expect(sql).not.toMatch(/UPDATE public\.(produtos|microrganismos|culturas)\s+SET owner_organization_id/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*ON (TABLE )?public\.(produtos|microrganismos|culturas|formulacoes|catalogo_volumes)/);
  });
  it("achado 1: nenhuma policy de escrita FOR ALL restringe SELECT", () => {
    expect(sql).not.toMatch(/AS RESTRICTIVE FOR ALL/);
    expect(sql).toMatch(/AS RESTRICTIVE FOR INSERT/);
    expect(sql).toMatch(/AS RESTRICTIVE FOR UPDATE/);
    expect(sql).toMatch(/AS RESTRICTIVE FOR DELETE/);
  });
  it("achado 2: normalização NFD sem translate desalinhado, com autoteste", () => {
    expect(sql).not.toMatch(/translate\(/);
    expect(sql).toMatch(/normalize\(pg_catalog\.lower\(p\), NFD\)/);
    expect(sql).toMatch(/ownership_norm_selftest_failed/);
  });
  it("achado 7: autorização no trigger pelo ator real, sem GUC", () => {
    expect(sql).not.toMatch(/set_config\('cultivo\./);
    expect(sql).not.toMatch(/current_setting\('cultivo\./);
    expect(sql).toMatch(/catalog_tenant_actor\('mutate'\) IS DISTINCT FROM p_owner/);
    expect(sql).toMatch(/catalog_parent_immutable/);
  });
  it("achado 6: lock comum e índices legados reescopados", () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS public\.microrganismos_nome_unique/);
    expect(sql).toMatch(/microrganismos_nome_global_uq[\s\S]*WHERE owner_organization_id IS NULL/);
    expect(sql).toMatch(/trg_catalog_owner_root[\s\S]*catalog_name_lock/);
  });
  it("achado 5: whitelist, NULL-safe, composição obrigatória, arquivado só restaura", () => {
    expect(sql).toMatch(/catalog_owned_allowed_keys/);
    expect(sql).toMatch(/IN \('produto','microrganismo','cultura'\)\) IS NOT TRUE/);
    expect(sql).toMatch(/jsonb_array_length\(v_payload->'itens'\) NOT BETWEEN 1 AND 50/);
    expect(sql).toMatch(/catalog_owned_archived/);
    expect(sql).toMatch(/catalog_owned_noop/);
  });
  it("fachadas INVOKER sem parâmetro de empresa", () => {
    for (const name of ["tenant_catalog_owned_mutate", "tenant_catalog_owned_list"]) {
      const facade = sql.slice(sql.indexOf(`CREATE FUNCTION public.${name}`));
      expect(facade.split("AS $$")[0]).toMatch(/SECURITY INVOKER SET search_path=''/);
      expect(facade.split("AS $$")[0]).not.toMatch(/organization/);
    }
  });
});

describe("ownership — SQL candidato 02 leitores", () => {
  it("preflight fixa md5 real dos 16 leitores e cada um recebe marcador [OWNER]", () => {
    expect(readers.match(/'[0-9a-f]{32}'\)/g)?.length).toBe(16);
    const bodies = readers.split("CREATE OR REPLACE FUNCTION").slice(1);
    expect(bodies.length).toBe(16);
    for (const b of bodies) expect(b).toMatch(/\[OWNER\]/);
  });
  it("leitores SA filtram somente global; tenant global+próprio; preço sem oráculo", () => {
    expect(readers.match(/owner_organization_id IS NULL -- \[OWNER\]/g)!.length).toBeGreaterThanOrEqual(6);
    expect(readers).toMatch(/owner_organization_id = v_org AND p\.archived_at IS NULL/);
    expect(readers).toMatch(/catalog_item_in_reader_scope\(p_product_id, p_microrganismo_id\) THEN RETURN NULL/);
  });
});

describe("ownership — rollback e runtime", () => {
  it("rollback não destrói ledger, não reabre grants e preserva filtros", () => {
    expect(rollback).not.toMatch(/DROP TABLE/);
    expect(rollback).not.toMatch(/catalog_tenant_visibility_ledger/);
    expect(rollback).not.toMatch(/\bGRANT\b/);
    expect(rollback).toMatch(/rollback_partial/);
    expect(rollback.indexOf("CREATE UNIQUE INDEX IF NOT EXISTS microrganismos_nome_unique"))
      .toBeLessThan(rollback.indexOf("microrganismos_nome_global_uq,"));
  });
  it("achado 3: runtime inclui iat, grants em temporárias e termina em ROLLBACK", () => {
    expect(runtime).toMatch(/'iat'/);
    expect(runtime).toMatch(/GRANT SELECT, INSERT, UPDATE ON _r, _ctx TO authenticated, anon/);
    expect(runtime.trim().endsWith("ROLLBACK;")).toBe(true);
    expect(runtime).not.toMatch(/\bCOMMIT\b/);
    expect(runtime).toMatch(/entity_type='produto' AND entity_id=/);
  });
});

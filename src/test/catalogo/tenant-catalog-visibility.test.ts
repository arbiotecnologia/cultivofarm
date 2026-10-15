import { describe, it, expect, vi } from "vitest";
import {
  applyManagementVisibility, fetchTenantHiddenIds, fetchTenantSelectionPage, postgrestInList, TENANT_VISIBILITY_SCOPE_NOTES, mapTenantVisibilityError, readTenantVisibility,
  setTenantVisibility, tenantCatalogKeys, tenantScopeReady, TENANT_VISIBILITY_UNAVAILABLE, validateVisibilityInput,
} from "@/lib/catalogo/tenantCatalogVisibility";

const ID = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const A = { userId: "u-a", organizationId: "org-a" };
const B = { userId: "u-b", organizationId: "org-b" };

function client(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { rpc };
}

describe("escopo e chaves de cache", () => {
  it("sem usuário ou empresa não há escopo", () => {
    expect(tenantScopeReady({ userId: "u", organizationId: "" })).toBe(false);
    expect(tenantScopeReady({ userId: "", organizationId: "o" })).toBe(false);
    expect(tenantScopeReady(A)).toBe(true);
  });
  it("chaves diferem por empresa e por usuário", () => {
    expect(tenantCatalogKeys.visibility(A, "produto", [ID])).not.toEqual(tenantCatalogKeys.visibility(B, "produto", [ID]));
    expect(tenantCatalogKeys.visibility(A, "produto", [ID])).not.toEqual(tenantCatalogKeys.visibility({ ...A, userId: "u-x" }, "produto", [ID]));
    expect(tenantCatalogKeys.selection(A, "cultura", "", 0, 50, [])).not.toEqual(tenantCatalogKeys.selection(B, "cultura", "", 0, 50, []));
    // limit faz parte da chave
    expect(tenantCatalogKeys.selection(A, "cultura", "", 0, 50, [])).not.toEqual(tenantCatalogKeys.selection(A, "cultura", "", 0, 10, []));
    expect(tenantCatalogKeys.scope(A).slice(0, 3)).toEqual(["tenant-catalog", "org-a", "u-a"]);
  });
});

describe("mutação", () => {
  const base = { entityType: "produto" as const, entityId: ID, hidden: true, expectedVersion: 0, reason: "Não vendemos", idempotencyKey: KEY };

  it("nunca envia empresa ao servidor", async () => {
    const c = client({ data: { entity_type: "produto", entity_id: ID, hidden: true, version: 1, replayed: false } });
    await setTenantVisibility(c, base);
    const args = c.rpc.mock.calls[0][1];
    expect(Object.keys(args).some((k) => /org|tenant|empresa/i.test(k))).toBe(false);
    expect(c.rpc.mock.calls[0][0]).toBe("tenant_catalog_set_visibility");
    expect(args.p_expected_version).toBe(0);
  });
  it("motivo curto é recusado antes do servidor", async () => {
    const c = client({});
    await expect(setTenantVisibility(c, { ...base, reason: "abc" })).rejects.toThrow(/motivo/i);
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("versão negativa/fracionária e IDs inválidos são recusados", () => {
    expect(validateVisibilityInput({ ...base, expectedVersion: -1 })).not.toBeNull();
    expect(validateVisibilityInput({ ...base, expectedVersion: 1.5 })).not.toBeNull();
    expect(validateVisibilityInput({ ...base, entityId: "x" })).not.toBeNull();
    expect(validateVisibilityInput({ ...base, entityType: "semente" })).not.toBeNull();
  });
  it("resposta vazia ou incoerente não vira sucesso", async () => {
    await expect(setTenantVisibility(client({ data: null }), base)).rejects.toThrow(/não confirmou/);
    await expect(setTenantVisibility(client({ data: { entity_type: "produto", entity_id: ID, hidden: true, version: 3, replayed: false } }), base)).rejects.toThrow(/não confirmou/);
    await expect(setTenantVisibility(client({ data: { entity_type: "produto", entity_id: ID, hidden: false, version: 1, replayed: false } }), base)).rejects.toThrow(/não confirmou/);
  });
  it("erros do servidor são traduzidos", async () => {
    await expect(setTenantVisibility(client({ error: { message: "catalog_visibility_version_conflict" } }), base)).rejects.toThrow(/Outra pessoa/);
    expect(mapTenantVisibilityError({ message: "catalog_visibility_platform_actor_denied" })).toMatch(/plataforma/);
    expect(mapTenantVisibilityError({ message: "catalog_visibility_item_inactive" })).toMatch(/não reativa/);
    expect(mapTenantVisibilityError({ code: "PGRST202", message: "Could not find the function" })).toBe(TENANT_VISIBILITY_UNAVAILABLE);
  });
});

describe("leitura da gestão", () => {
  it("lê em lotes de 500 e falha fechado em resposta inválida", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const c = client({ data: [] });
    await readTenantVisibility(c, "produto", ids);
    expect(c.rpc).toHaveBeenCalledTimes(2);
    await expect(readTenantVisibility(client({ data: [{ entity_id: ID }] }), "produto", [ID])).rejects.toThrow(/inválida/);
    await expect(readTenantVisibility(client({ data: null }), "produto", [ID])).rejects.toThrow(/inválida/);
  });
  it("ocultos somem por padrão e voltam com mostrar ocultos", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const vis = new Map([["a", { hidden: true, version: 1 }], ["b", { hidden: false, version: 2 }]]);
    expect(applyManagementVisibility(items, vis, false).map((i) => i.id)).toEqual(["b"]);
    expect(applyManagementVisibility(items, vis, true).map((i) => i.id)).toEqual(["a", "b"]);
    expect(applyManagementVisibility(items, undefined, false).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("seletor de novas seleções", () => {
  it("pagina no servidor e marca vinculado não selecionável", async () => {
    const c = client({ data: [
      { id: ID, nome: "Soja", ativo: true, hidden: false, selectable: true, in_page: true, total: 3 },
      { id: KEY, nome: "Milho", ativo: true, hidden: true, selectable: false, in_page: false, total: null },
    ] });
    const r = await fetchTenantSelectionPage(c, { entity: "cultura", limit: 1, offset: 0, include: [KEY] });
    expect(c.rpc.mock.calls[0][1]).toMatchObject({ p_limit: 1, p_offset: 0, p_include_ids: [KEY] });
    expect(r.total).toBe(3);
    expect(r.hasMore).toBe(true);
    expect(r.rows.find((x) => x.id === KEY)?.selectable).toBe(false);
  });
  it("recusa limite acima de 100 e mais de 50 vinculados", async () => {
    await expect(fetchTenantSelectionPage(client({ data: [] }), { entity: "produto", limit: 101, offset: 0 })).rejects.toThrow();
    const many = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    await expect(fetchTenantSelectionPage(client({ data: [] }), { entity: "produto", limit: 10, offset: 0, include: many })).rejects.toThrow();
  });
  it("erro do RPC não cai em leitura direta", async () => {
    const c = client({ error: { code: "PGRST202", message: "Could not find the function" } });
    await expect(fetchTenantSelectionPage(c, { entity: "cultura", limit: 10, offset: 0 })).rejects.toThrow(TENANT_VISIBILITY_UNAVAILABLE);
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("seletor: include e duplicatas", () => {
  it("include visível fora da página permanece selecionável e não conta na paginação", async () => {
    const c = client({ data: [{ id: KEY, nome: "Milho", ativo: true, hidden: false, selectable: true, in_page: false, total: null }] });
    const r = await fetchTenantSelectionPage(c, { entity: "cultura", limit: 10, offset: 0, include: [KEY], search: "x" });
    expect(r.rows).toEqual([{ id: KEY, nome: "Milho", selectable: true, hidden: false, ativo: true }]);
    expect(r.total).toBe(0);
    expect(r.hasMore).toBe(false);
  });
  it("descarta duplicata do include já presente na página", async () => {
    const c = client({ data: [
      { id: ID, nome: "Soja", ativo: true, hidden: false, selectable: true, in_page: true, total: 1 },
      { id: ID, nome: "Soja", ativo: true, hidden: false, selectable: true, in_page: false, total: null },
    ] });
    const r = await fetchTenantSelectionPage(c, { entity: "cultura", limit: 10, offset: 0, include: [ID] });
    expect(r.rows).toHaveLength(1);
  });
  it("linha sem in_page é resposta inválida", async () => {
    const c = client({ data: [{ id: ID, nome: "Soja", ativo: true, hidden: false, selectable: true, total: 1 }] });
    await expect(fetchTenantSelectionPage(c, { entity: "cultura", limit: 10, offset: 0 })).rejects.toThrow();
  });
});

describe("IDs ocultos para catálogo novo", () => {
  it("devolve ordenado e sem duplicatas; erro do RPC não vira lista vazia", async () => {
    const ok = await fetchTenantHiddenIds(client({ data: [{ entity_id: KEY }, { entity_id: ID }, { entity_id: ID }] }), "produto");
    expect(ok).toEqual([ID, KEY]);
    await expect(fetchTenantHiddenIds(client({ error: { message: "catalog_visibility_tenant_unavailable" } }), "produto")).rejects.toThrow("Empresa ativa");
    await expect(fetchTenantHiddenIds(client({ data: null }), "produto")).rejects.toThrow();
  });
  it("acima de 300 falha explicitamente", async () => {
    const many = Array.from({ length: 301 }, (_, i) => ({ entity_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
    await expect(fetchTenantHiddenIds(client({ data: many }), "produto")).rejects.toThrow("300");
  });
  it("lista PostgREST aceita só UUIDs", () => {
    expect(postgrestInList([ID])).toBe(`(${ID})`);
    expect(() => postgrestInList(["x),or(1.eq.1"])).toThrow();
  });
  it("texto por entidade não promete ocultar produtos no seletor de cultura", () => {
    expect(TENANT_VISIBILITY_SCOPE_NOTES.cultura).toMatch(/etapa Campo/);
    expect(TENANT_VISIBILITY_SCOPE_NOTES.cultura).not.toMatch(/produto/i);
    expect(TENANT_VISIBILITY_SCOPE_NOTES.produto).toMatch(/NÃO vale para o portal B2B/);
  });
});

import { catalogoAppliesTenantVisibility, catalogoExcludeHidden } from "@/hooks/useCatalogoUnificado";
describe("catálogo novo exclui ocultos no servidor", () => {
  it("adiciona not.in só com IDs; B2B ainda não aplica", () => {
    const calls: unknown[][] = [];
    const q = { not: (...a: unknown[]) => { calls.push(a); return q; } };
    catalogoExcludeHidden(q as never, []);
    expect(calls).toHaveLength(0);
    catalogoExcludeHidden(q as never, [ID]);
    expect(calls[0]).toEqual(["id", "in", `(${ID})`]);
    expect(catalogoAppliesTenantVisibility("b2b")).toBe(false);
    expect(catalogoAppliesTenantVisibility("interno")).toBe(true);
    expect(catalogoAppliesTenantVisibility("admin")).toBe(true);
  });
});

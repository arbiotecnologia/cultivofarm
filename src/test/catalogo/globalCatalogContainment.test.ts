import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertGlobalCatalogWriteBlocked,
  GlobalCatalogWriteBlockedError,
  TENANT_CAN_EDIT_GLOBAL_CATALOG,
} from "@/lib/catalogo/globalCatalogWriteContainment";
import { requireActiveCatalogSuperadmin } from "../../../supabase/functions/_shared/catalog-superadmin-guard";

const read = (p: string) => readFileSync(p, "utf8");

function client(hasRole: unknown, isSa: unknown, err?: { at: string }) {
  return {
    rpc: vi.fn(async (fn: string) => {
      if (err?.at === fn) return { data: null, error: { message: "x" } };
      return { data: fn === "has_role" ? hasRole : isSa, error: null };
    }),
  };
}

describe("contenção de escrita do catálogo global", () => {
  it("bloqueia sempre e capacidade de empresa é false", () => {
    expect(() => assertGlobalCatalogWriteBlocked()).toThrow(GlobalCatalogWriteBlockedError);
    expect(TENANT_CAN_EDIT_GLOBAL_CATALOG).toBe(false);
  });

  it.each([
    "src/hooks/useCatalogSources.ts",
    "src/hooks/useCatalogTargetsCrops.ts",
    "src/hooks/useCatalogoAlvos.ts",
    "src/components/protocolos/CatalogoVolumesDialog.tsx",
    "src/components/visita/ProblemaSelector.tsx",
    "src/pages/configuracoes/ParametrosCQPage.tsx",
  ])("%s bloqueia antes de gravar", (f) => {
    const s = read(f);
    const blocks = s.split("mutationFn").slice(1).filter((b) => /\.(insert|update|delete|upsert)\(|bulk_inserir_alvos|saveTenantCatalogRoot\(/.test(b.slice(0, 2500)));
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      const guard = b.indexOf("assertGlobalCatalogWriteBlocked()");
      const write = b.search(/\.(insert|update|delete|upsert)\(|bulk_inserir_alvos|saveTenantCatalogRoot\(/);
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(write);
    }
  });

  // Ficha de microrganismo migrou para o catálogo por empresa (a9740d97c), com o mesmo contrato da ficha de produto.
  it.each([["src/hooks/useProductProfile.ts", "product_technical_profiles"], ["src/hooks/useMicroorganismProfile.ts", "microorganism_technical_profiles"]])("ficha própria %s usa gate de ator e RPC, nunca DML global", (f, table) => {
    const s = read(f);
    expect(s.indexOf("if (!editor.canEdit || !current()")).toBeGreaterThan(-1);
    expect(s.indexOf("if (!editor.canEdit || !current()")).toBeLessThan(s.indexOf("const ack = await saveTenantCatalogRoot"));
    expect(s).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    expect(s).toContain(`"${table}"`);
  });

  it("fichas não oferecem edição e micro removeu caminho B2B-only", () => {
    for (const f of ["ProductTechnicalProfileDialog", "MicroorganismTechnicalProfileDialog"]) {
      const s = read(`src/components/protocolos/${f}.tsx`);
      if (f === "ProductTechnicalProfileDialog") {
        expect(s).toContain("const writable = own && editor.canEdit;");
        expect(s).toContain("produto.owner_organization_id === profile?.organization_id");
      } else expect(s).toMatch(/const canEditFull: boolean = TENANT_CAN_EDIT_GLOBAL_CATALOG;/);
      expect(s).toMatch(/canApprove=\{false\}/);
      expect(s).not.toMatch(/rpc\("update_(microorganism|product)_b2b_description"/);
      expect(s).not.toMatch(/canEditB2BOnly/);
    }
  });

  it("RPCs de aprovação/retorno/versões param antes de chamar", () => {
    for (const f of ["VersoesHistoricoTab", "ReturnToReviewButton", "ApprovalChecklistDialog"]) {
      const s = read(`src/components/protocolos/catalog/${f}.tsx`);
      expect(s.indexOf("GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE);\n    return;")).toBeGreaterThan(-1);
      expect(s.indexOf("GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE);\n    return;")).toBeLessThan(s.indexOf("supabase.rpc("));
    }
  });
});

describe("guard Edge Superadmin ativo/readiness", () => {
  it("aceita só has_role ativo E is_platform_superadmin", async () => {
    expect(await requireActiveCatalogSuperadmin(client(true, true), "u")).toEqual({ ok: true });
  });
  it("nega Superadmin inativo/sem readiness mesmo com user_roles", async () => {
    const c = client(false, true);
    expect(await requireActiveCatalogSuperadmin(c, "u")).toMatchObject({ ok: false, status: 403 });
    expect(c.rpc).toHaveBeenCalledWith("has_role", { _user_id: "u", _role: "superadmin" });
  });
  it("nega papel tenant e valores não booleanos", async () => {
    expect(await requireActiveCatalogSuperadmin(client(true, false), "u")).toMatchObject({ ok: false, status: 403 });
    expect(await requireActiveCatalogSuperadmin(client("true", true), "u")).toMatchObject({ ok: false, status: 403 });
    expect(await requireActiveCatalogSuperadmin(client(true, true), "")).toMatchObject({ ok: false, status: 403 });
  });
  it("erro de RPC falha fechado", async () => {
    expect(await requireActiveCatalogSuperadmin(client(true, true, { at: "has_role" }), "u")).toMatchObject({ ok: false, status: 500 });
    expect(await requireActiveCatalogSuperadmin(client(true, true, { at: "is_platform_superadmin" }), "u")).toMatchObject({ ok: false, status: 500 });
  });
  it("Edges usam o guard antes de service_role e não usam TECH_ROLES", () => {
    for (const f of ["ai-generate-ficha-campo", "ai-sugerir-alvos"]) {
      const s = read(`supabase/functions/${f}/index.ts`);
      const g = s.indexOf("requireActiveCatalogSuperadmin(userClient");
      expect(g).toBeGreaterThan(-1);
      expect(g).toBeLessThan(s.indexOf("createClient(SUPABASE_URL, SERVICE_ROLE)"));
      expect(s).not.toMatch(/TECH_ROLES/);
    }
  });
});

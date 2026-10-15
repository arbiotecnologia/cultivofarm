import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  TENANT_OWNED_CATALOG_ENABLED, canManageOwnedItem, catalogOrigin, createResponseFence,
  mutateOwnedItem, ownedAllowedKeys, ownedCatalogError, ownedCatalogKeys,
  mutateOwnedPresentation,
} from "@/lib/catalogo/tenantCatalogOwnership";

const sql = readFileSync("scripts/rbac-audit/proposed-tenant-catalog-ownership.sql", "utf8");
const readers = readFileSync("scripts/rbac-audit/proposed-tenant-catalog-ownership-02-readers.sql", "utf8");
const containment = readFileSync("scripts/rbac-audit/proposed-tenant-catalog-ownership-04-operational-containment.sql", "utf8");
const backend = readFileSync("scripts/rbac-audit/proposed-tenant-catalog-ownership-05-backend.sql", "utf8");
const operationalReaders = readFileSync("scripts/rbac-audit/proposed-tenant-catalog-ownership-06-operational-readers.sql", "utf8");
const rollback = readFileSync("scripts/rbac-audit/rollback-tenant-catalog-ownership.sql", "utf8");
const runtime = readFileSync("scripts/rbac-audit/runtime-test-tenant-catalog-ownership.sql", "utf8");
const rollbackRuntime = readFileSync("scripts/rbac-audit/runtime-test-tenant-catalog-ownership-rollback.sql", "utf8");

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
    expect(ownedAllowedKeys("produto", "composition")).toEqual(["status", "itens"]);
  });
  it("handlers exercitáveis em teste chamam somente RPCs próprias e validam retorno", async () => {
    const rpc = vi.fn()
      .mockReturnValueOnce(Promise.resolve({ data: { id: "p1", updated_at: "2026-10-15T00:00:00Z", idempotency_key: "k", origin: "proprio", replayed: false }, error: null }))
      .mockReturnValueOnce(Promise.resolve({ data: { id: "v1", parent_id: "p1", updated_at: "2026-10-15T00:00:01Z", replayed: false }, error: null }));
    await expect(mutateOwnedItem({ rpc }, { entity: "produto", operation: "create", entityId: null, expectedUpdatedAt: null,
      payload: { nome: "Produto próprio", tipo: "solo" }, reason: "cadastro da empresa", idempotencyKey: "k" }, undefined, true)).resolves.toMatchObject({ id: "p1" });
    await expect(mutateOwnedPresentation({ rpc }, { operation: "create", parentId: "p1", presentationId: null, expectedUpdatedAt: null,
      payload: { volume_ml: 1000, preco_brl: 180, ordem: 0 }, reason: "apresentação própria", idempotencyKey: "v" }, undefined, true)).resolves.toMatchObject({ id: "v1" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["tenant_catalog_owned_mutate", "tenant_catalog_owned_presentation_mutate"]);
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
    expect(sql).toMatch(/normalize\(pg_catalog\.lower\(p\), 'NFD'\)/);
    expect(sql).not.toMatch(/normalize\([^)]*\), NFD\)/);
    expect(sql).toMatch(/catalog_norm_name\('Açúcar'\) <> 'acucar'/);
    expect(sql).toMatch(/ownership_norm_selftest_failed/);
  });
  it("achado 7: autorização no trigger pelo ator real, sem GUC", () => {
    expect(sql).not.toMatch(/set_config\('cultivo\./);
    expect(sql).not.toMatch(/current_setting\('cultivo\./);
    expect(sql).toMatch(/catalog_tenant_actor\('mutate'\) IS DISTINCT FROM p_owner/);
    expect(sql).toMatch(/catalog_parent_immutable/);
  });
  it("achado C (110c9c41): um trigger por tabela descendente, sem campo alheio, com autoteste em linha global", () => {
    const f = sql.slice(sql.indexOf("trg_catalog_owner_child_formulacoes() RETURNS"), sql.indexOf("trg_catalog_owner_child_volumes() RETURNS"));
    const v = sql.slice(sql.indexOf("trg_catalog_owner_child_volumes() RETURNS"), sql.indexOf("ownership_child_selftest_ok"));
    expect(f).not.toMatch(/item_tipo/);
    expect(v).not.toMatch(/component_insumo_id/);
    expect(sql).not.toMatch(/FUNCTION platform_private\.trg_catalog_owner_child\(\)/);
    expect(sql).toMatch(/ownership_child_selftest_ok/);
  });
  it("medida declarativa rejeita limites, unidades e bases fora do contrato global", () => {
    expect(sql).toMatch(/\(v_item->>'quantidade'\)::numeric <= 0/);
    expect(sql).toMatch(/\(v_item->>'quantidade'\)::numeric>1e15/);
    expect(sql).toMatch(/\(v_item->>'quantidade'\)::numeric>1000/);
    expect(sql).toMatch(/\(v_item->>'quantidade'\)::numeric>100/);
  });
  it("achado 6: lock comum e índices legados reescopados", () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS public\.microrganismos_nome_unique/);
    expect(sql).toMatch(/microrganismos_nome_global_uq[\s\S]*WHERE owner_organization_id IS NULL/);
    expect(sql).toMatch(/trg_catalog_owner_root[\s\S]*catalog_name_lock/);
  });
  it("achado 5: whitelist, NULL-safe, composição obrigatória, arquivado só restaura", () => {
    expect(sql).toMatch(/catalog_owned_allowed_keys/);
    expect(sql).toMatch(/IN \('produto','microrganismo','cultura'\)\) IS NOT TRUE/);
    expect(sql).toMatch(/jsonb_array_length\(v_payload->'itens'\) NOT BETWEEN 0 AND 50/);
    expect(sql).toMatch(/catalog_owned_archived/);
    expect(sql).toMatch(/catalog_owned_noop/);
  });
  it("dada2410: CASE parentetizado compila sem ambiguidade no IF", () => {
    expect(sql).toMatch(/char_length\(v_val #>> '\{\}'\) > \(CASE WHEN v_key='nome' THEN 500 ELSE 10000 END\) THEN/);
    expect(sql).not.toMatch(/> CASE WHEN v_key='nome'/);
  });
  it("formulacoes mantém micro NOT NULL; química/fertilizante usa declarações existentes", () => {
    expect(sql).not.toMatch(/INSERT INTO public\.formulacoes\(produto_id, microrganismo_id, component_insumo_id/);
    expect(sql).toMatch(/produto_composicao_conjuntos/);
    expect(sql).toMatch(/produto_composicao_declaracoes/);
    expect(sql).toMatch(/catalog_composition_type_allowed\(v_fam,v_item->>'tipo_componente'\)/);
  });
  it("composição própria reutiliza integralmente o contrato global real", () => {
    expect(sql).toMatch(/ARRAY\['status','itens'\]/);
    expect(sql).toMatch(/NOT IN \('rascunho','completo'\)/);
    expect(sql).toMatch(/NOT IN \('microrganismo','ingrediente_ativo','nutriente','outro'\)/);
    expect(sql).toMatch(/NOT IN \('teor_garantido','concentracao_declarada'\)/);
    expect(sql).toMatch(/NOT IN \('mL\/L','g\/L','g\/kg','%m\/m','%m\/v','%v\/v','UFC\/mL','UFC\/g'\)/);
    expect(sql).toMatch(/'por_volume_produto'/);
    expect(sql).toMatch(/'por_massa_produto'/);
    expect(sql).not.toMatch(/VALUES \(v_id,'draft'/);
    expect(sql).not.toMatch(/'insumo', p\.nome/);
    expect(sql).not.toMatch(/'%', 'produto'/);
    expect(sql).not.toMatch(/THEN 'fertilizante' ELSE 'quimico'/);
    expect(sql).not.toMatch(/DELETE FROM public\.formulacoes WHERE produto_id=v_id/);
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

describe("ownership — SQL candidato 03 volumes/B2B", () => {
  const b2b = readFileSync("scripts/rbac-audit/proposed-tenant-catalog-ownership-03-volumes-b2b.sql", "utf8");
  it("preflight fixa 7 md5 reais e pós confere só o manifesto", () => {
    expect(b2b.match(/'[0-9a-f]{32}'\)/g)?.length).toBe(7);
    expect(b2b).not.toMatch(/FROM pg_proc/);
    expect(readers).not.toMatch(/FROM pg_proc/);
  });
  it("helpers SA de volume e B2B filtram dono; fornecedor vem do vínculo, nunca do cliente", () => {
    expect(b2b.match(/-- \[OWNER\]/g)!.length).toBeGreaterThanOrEqual(12);
    expect(b2b).toMatch(/commercial_owner_organization_id INTO v_owner FROM public\.partner_accounts/);
    expect(b2b).toMatch(/b2b_commercial_context\(\)/);
    expect(b2b).not.toMatch(/GRANT EXECUTE/);
    expect(b2b).toMatch(/b2b_post_price_acl_reopened/);
  });
});

describe("ownership — SQL candidato 04 contenção operacional", () => {
  it("mantém gate OFF e não amplia grants nem altera históricos", () => {
    expect(containment).toMatch(/ownership04_gate_must_remain_off/);
    expect(containment).not.toMatch(/\bGRANT\b/);
    expect(containment).not.toMatch(/\b(UPDATE|DELETE)\s+public\.(partner_|ordens_|registros_|product_|microorganism_)/);
  });
  it("protege descendentes B2B, fiscal, produção, visita e regulatório", () => {
    for (const table of ["partner_order_items", "partner_simulation_items", "product_fiscal_profiles",
      "programacao_producao", "registros_consultor_recomendacoes", "microorganism_regulatory_dossiers"]) {
      expect(containment).toContain(`('${table}'`);
    }
    expect(containment).toMatch(/catalog_private_reference_module_unavailable/);
  });
  it("update irrelevante de histórico não é bloqueado pela referência antiga", () => {
    expect(containment).toMatch(/TG_OP='UPDATE'[\s\S]*to_jsonb\(OLD\)[\s\S]*IS NOT DISTINCT FROM[\s\S]*CONTINUE/);
  });
});

describe("ownership — SQL candidato 05 backend", () => {
  it("fixa os 12 hashes live e traz definições completas dos writers SA", () => {
    expect(backend.match(/'[0-9a-f]{32}'\)/g)?.length).toBe(12);
    for (const fn of ["create_global_product_core", "set_global_product_composition_core", "set_global_product_family_core",
      "set_global_b2b_enabled_core", "update_global_product_metadata_core", "update_global_microorganism_core",
      "update_global_culture_core", "set_global_microorganism_status_core", "set_global_culture_status_core"]) {
      expect(backend).toContain(`CREATE OR REPLACE FUNCTION platform_private.${fn}`);
    }
  });
  it("writers SA filtram a raiz global no lock e no alvo", () => {
    expect(backend).toMatch(/FROM public\.produtos WHERE id=p_id AND owner_organization_id IS NULL FOR UPDATE/);
    expect(backend).toMatch(/UPDATE public\.produtos SET[\s\S]*WHERE id=p_id AND owner_organization_id IS NULL AND updated_at/);
    expect(backend).toMatch(/FROM public\.microrganismos WHERE id=p_id AND owner_organization_id IS NULL FOR UPDATE/);
    expect(backend).toMatch(/FROM public\.culturas WHERE id=p_id AND owner_organization_id IS NULL FOR UPDATE/);
  });
  it("micro product_id e tabelas de composição herdam e validam owner", () => {
    expect(backend).toMatch(/catalog_owner_guard_micro_product/);
    expect(backend).toMatch(/catalog_composition_set_guard/);
    expect(backend).toMatch(/catalog_composition_declaration_guard/);
    expect(backend).not.toMatch(/TG_TABLE_NAME='produto_composicao_declaracoes' AND NEW\.microrganismo_id/);
    expect(backend).toMatch(/catalog_composition_parent_visible/);
    expect(backend).toMatch(/GRANT EXECUTE ON FUNCTION platform_private\.catalog_composition_parent_visible\(uuid\) TO authenticated/);
    expect(backend).toMatch(/catalog_composition_parent_scope/);
    expect(backend).toMatch(/catalog_composition_declaration_parent_scope/);
    expect(backend).toMatch(/catalog_cross_owner_reference/);
  });
  it("composição permite micro global em produto próprio e fecha as quatro combinações de owner", () => {
    const guard = backend.slice(
      backend.indexOf("catalog_composition_declaration_guard() RETURNS trigger"),
      backend.indexOf("REVOKE ALL ON FUNCTION platform_private.catalog_composition_declaration_guard"),
    );
    expect(guard).toMatch(/v_owner IS NULL AND v_micro_owner IS NOT NULL/);
    expect(guard).toMatch(/v_owner IS NOT NULL AND v_micro_owner IS NOT NULL AND v_micro_owner IS DISTINCT FROM v_owner/);
    expect(guard).not.toMatch(/v_micro_owner IS DISTINCT FROM v_owner THEN/);
    // global→global e privado→global passam porque nenhuma condição de negação aceita v_micro_owner NULL.
    expect(guard).not.toMatch(/v_owner IS NOT NULL AND v_micro_owner IS NULL/);
  });
  it("apresentação própria é RPC transacional com CAS, ledger e sem organization_id do cliente", () => {
    const body = backend.slice(backend.indexOf("catalog_owned_presentation_mutate_core"));
    expect(body).toMatch(/catalog_tenant_actor\('mutate'\)/);
    expect(body).toMatch(/owner_organization_id=v_org FOR UPDATE/);
    expect(body).toMatch(/updated_at IS DISTINCT FROM p_expected_updated_at/);
    expect(body).toMatch(/catalog_tenant_owned_ledger/);
    expect(body).toMatch(/v_parent\.archived_at IS NOT NULL OR v_parent\.ativo IS NOT TRUE/);
    expect(body).toMatch(/v_payload='\{\}'::jsonb/);
    expect(body).toMatch(/catalog_owned_noop/);
    expect(body).toMatch(/CREATE FUNCTION public\.tenant_catalog_owned_presentation_mutate\(\s*p_operation text/);
    expect(body.split("CREATE FUNCTION public.tenant_catalog_owned_presentation_mutate")[0]).not.toMatch(/p_organization/);
  });
  it("ledger aceita apresentação explicitamente", () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS catalog_tenant_owned_ledger_operation_check/);
    expect(sql).toMatch(/operation IN \('create','update','archive','restore','composition','presentation'\)/);
  });
  it("gate permanece OFF e não há client DML nem publicação", () => {
    expect(backend).toMatch(/ownership05_gate_must_remain_off/);
    expect(backend).not.toMatch(/UPDATE platform_private\.catalog_ownership_gate SET enabled=true/);
    expect(backend).not.toMatch(/GRANT (INSERT|UPDATE|DELETE) ON public\./);
  });
  it("wipe global usa pai global e preserva linhas próprias", () => {
    const wipe = backend.slice(backend.indexOf("-- Wipe global"));
    expect(wipe).toMatch(/ownership05_wipe_drift/);
    expect(wipe).toMatch(/DELETE FROM public\.produtos WHERE owner_organization_id IS NULL/);
    expect(wipe).toMatch(/DELETE FROM public\.product_fiscal_profiles x USING public\.produtos p/);
    expect(wipe).not.toMatch(/DELETE FROM public\.%I WHERE id IS NOT NULL/);
  });
});

describe("ownership — SQL candidato 06 leitores operacionais", () => {
  it("fixa hashes live das três funções e sete views", () => {
    expect(operationalReaders.match(/[0-9a-f]{32}/g)?.length).toBe(10);
    for (const fn of ["fn_fiscal_scenario_coverage", "rpc_fiscal_nfe_readiness_v1", "rpc_microorganism_regulatory_overview"]) {
      expect(operationalReaders).toContain(`FUNCTION public.${fn}`);
    }
  });
  it("funções fiscal/regulatória e views de catálogo são global-only", () => {
    expect(operationalReaders).toMatch(/FROM public\.microrganismos m\s+WHERE m\.owner_organization_id IS NULL/);
    expect(operationalReaders).toMatch(/WHERE m\.ativo AND m\.owner_organization_id IS NULL/);
    expect(operationalReaders).toMatch(/JOIN public\.produtos p ON p\.id=pf\.product_id\s+WHERE p\.owner_organization_id IS NULL/);
    expect(operationalReaders).toMatch(/cpp\.product_id AND p\.owner_organization_id IS NULL/);
  });
  it("mantém as três views comerciais sob RLS parent e não amplia ACL", () => {
    expect(operationalReaders.match(/vw_bi_commercial_/g)?.length).toBeGreaterThanOrEqual(6);
    expect(operationalReaders).not.toMatch(/\bGRANT\b/);
    expect(operationalReaders).not.toMatch(/catalog_ownership_gate SET enabled=true/);
    expect(operationalReaders).toMatch(/ownership06_gate_must_remain_off/);
  });
});

describe("ownership — rollback e runtime", () => {
  it("rollback não destrói ledger, não reabre grants e preserva filtros", () => {
    const executableRollback = rollback.replace(/^--.*$/gm, "");
    expect(rollback).not.toMatch(/DROP TABLE/);
    expect(executableRollback).not.toMatch(/\b(DROP|ALTER|DELETE)\b/);
    expect(executableRollback).not.toMatch(/\bGRANT\b/);
    expect(rollback).toMatch(/catalog_ownership_gate SET enabled=false/);
    expect(rollback).toMatch(/REVOKE EXECUTE ON FUNCTION public\.tenant_catalog_owned_mutate/);
    expect(rollback).toMatch(/REVOKE EXECUTE ON FUNCTION public\.tenant_catalog_owned_presentation_mutate/);
    for (const preserved of ["trg_catalog_private_ref_guard", "trg_catalog_owner_micro_product",
      "catalog_composition_parent_scope", "catalog_composition_declaration_parent_scope",
      "catalog_tenant_owned_ledger", "owner_organization_id"]) {
      expect(rollback).toContain(preserved);
    }
  });
  it("runtime do rollback cria privado e prova leitura cross-tenant negada após contenção", () => {
    expect(rollbackRuntime).toMatch(/catalog_ownership_gate SET enabled=false/);
    expect(rollbackRuntime).toMatch(/REVOKE EXECUTE ON FUNCTION public\.tenant_catalog_owned_mutate/);
    expect(rollbackRuntime).toMatch(/outra_empresa_nao_le_produto/);
    expect(rollbackRuntime).toMatch(/outra_empresa_nao_le_declaracao/);
    expect(rollbackRuntime).toMatch(/protecoes_preservadas/);
    expect(rollbackRuntime).toMatch(/catalog_composition_parent_scope/);
    expect(rollbackRuntime.trim().endsWith("ROLLBACK;")).toBe(true);
  });
  it("achado 3: runtime inclui iat, grants em temporárias e termina em ROLLBACK", () => {
    expect(runtime).toMatch(/'iat'/);
    expect(runtime).toMatch(/GRANT SELECT, INSERT, UPDATE ON _r, _ctx TO authenticated, anon/);
    expect(runtime.trim().endsWith("ROLLBACK;")).toBe(true);
    expect(runtime).not.toMatch(/\bCOMMIT\b/);
    expect(runtime).toMatch(/entity_type='produto' AND entity_id=/);
  });
  it("achado F: runtime não fabrica PASS com qualquer exceção em casos de autorização", () => {
    expect(runtime).not.toMatch(/WHEN OTHERS THEN INSERT INTO _r VALUES\('[a-z_]+',true/);
    expect(runtime).toMatch(/norm_/);
    expect(runtime).toMatch(/proporcao_/);
    expect(runtime).toMatch(/global_child_update/);
  });
});

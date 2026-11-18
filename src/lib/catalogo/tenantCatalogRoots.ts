/**
 * Catálogo EXCLUSIVO por empresa (01/11/2026) — escrita das raízes auxiliares, perfis técnicos e formulações
 * SOMENTE pelas RPCs candidatas `tenant_catalog_root_save/delete` e `tenant_catalog_formulacoes_replace`
 * (scripts/tenant-exclusive-catalog-20261101/crud_section.py). Empresa/dono e status de validação nunca são
 * enviados; a edição exige o `updated_at` observado (CAS); cada tentativa leva chave de idempotência e
 * nunca é repetida automaticamente após falha incerta.
 */
export type TenantCatalogRoot =
  | "microrganismos"
  | "culturas"
  | "catalogo_volumes"
  | "product_technical_profiles"
  | "microorganism_technical_profiles";

/** Campos que o servidor recusa; filtrados aqui para falhar antes do envio. */
const FORBIDDEN = new Set([
  "id", "owner_organization_id", "created_at", "updated_at", "created_by", "updated_by",
  "status_validacao", "validado_por", "validado_em", "desativada_em", "desativada_por",
]);

export interface TenantCatalogAck { id: string; updated_at: string | null; replayed: boolean }

export function buildTenantCatalogPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(payload)) {
    if (FORBIDDEN.has(k)) throw new Error(`Campo não permitido: ${k}`);
    const v = payload[k];
    if (v === undefined) continue;
    if (typeof v === "number" && !Number.isFinite(v)) throw new Error(`Valor inválido em ${k}`);
    out[k] = v;
  }
  return out;
}

export function parseTenantCatalogAck(data: unknown, expectedId: string | null): TenantCatalogAck {
  const d = data as Record<string, unknown> | null;
  if (!d || d.ok !== true || typeof d.id !== "string" || typeof d.replayed !== "boolean") {
    throw new Error("Resposta do servidor inválida");
  }
  if (expectedId && d.id !== expectedId) throw new Error("Resposta do servidor de outro registro");
  return { id: d.id, updated_at: typeof d.updated_at === "string" ? d.updated_at : null, replayed: d.replayed };
}

export function tenantCatalogErrorMessage(code: string | undefined, message: string | undefined): string {
  const m = message ?? "";
  if (m.includes("tenant_catalog_stale") || m.includes("cas_required")) return "O registro foi alterado por outra pessoa. Recarregue e tente de novo.";
  if (m.includes("idempotency_conflict")) return "Tentativa anterior diferente com a mesma chave. Recarregue e tente de novo.";
  if (m.includes("tenant_catalog_duplicate")) return "Já existe um registro igual na sua empresa.";
  if (m.includes("tenant_catalog_in_use")) return "O registro está em uso e não pode ser excluído.";
  if (m.includes("ref_foreign")) return "O item vinculado não pertence à sua empresa.";
  if (m.includes("tenant_catalog_not_found")) return "Registro não encontrado na sua empresa.";
  if (m.includes("field_forbidden")) return "Há um campo que não pode ser alterado por aqui.";
  if (code === "42501" || m.includes("permission denied") || m.includes("actor_changed")) return "Você não tem permissão para gerenciar o catálogo desta empresa.";
  if (code === "PGRST202" || m.includes("Could not find the function")) return "Cadastro do catálogo da empresa ainda não está disponível neste ambiente.";
  return "Não foi possível salvar.";
}

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };

export async function saveTenantCatalogRoot(
  client: RpcClient,
  root: TenantCatalogRoot,
  id: string | null,
  payload: Record<string, unknown>,
  expectedUpdatedAt: string | null,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<TenantCatalogAck> {
  if (id && !expectedUpdatedAt) throw new Error(tenantCatalogErrorMessage(undefined, "cas_required"));
  const { data, error } = await client.rpc("tenant_catalog_root_save", {
    p_root: root, p_id: id, p_payload: buildTenantCatalogPayload(payload),
    p_expected_updated_at: id ? expectedUpdatedAt : null, p_idempotency_key: idempotencyKey,
  });
  if (error) throw Object.assign(new Error(tenantCatalogErrorMessage(error.code, error.message)), { serverCode: error.code ?? null });
  return parseTenantCatalogAck(data, id);
}

export async function deleteTenantCatalogRoot(
  client: RpcClient, root: "microrganismos" | "culturas" | "catalogo_volumes", id: string, expectedUpdatedAt: string,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<void> {
  const { data, error } = await client.rpc("tenant_catalog_root_delete", {
    p_root: root, p_id: id, p_expected_updated_at: expectedUpdatedAt, p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(tenantCatalogErrorMessage(error.code, error.message));
  const d = data as Record<string, unknown> | null;
  if (!d || d.ok !== true || d.deleted !== true || d.id !== id) throw new Error("Resposta do servidor inválida");
}

const FORM_FIELDS = ["microrganismo_id", "component_insumo_id", "concentracao", "unidade", "volume_ml", "proporcao", "e_volume_fixo"];

/** Substitui atomicamente o conjunto de formulações do produto (CAS pelo `updated_at` do produto). */
export async function replaceTenantFormulacoes(
  client: RpcClient, produtoId: string, items: Record<string, unknown>[], expectedProdutoUpdatedAt: string,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<{ updated_at: string; items: number }> {
  const clean = items.map((it) => {
    const o: Record<string, unknown> = {};
    for (const k of FORM_FIELDS) if (it[k] !== undefined) o[k] = it[k];
    return o;
  });
  const { data, error } = await client.rpc("tenant_catalog_formulacoes_replace", {
    p_produto_id: produtoId, p_items: clean, p_expected_produto_updated_at: expectedProdutoUpdatedAt, p_idempotency_key: idempotencyKey,
  });
  // `serverCode` marca uma resposta explícita do servidor (recusa definitiva); exceções sem código são incertas.
  if (error) throw Object.assign(new Error(tenantCatalogErrorMessage(error.code, error.message)), { serverCode: error.code || null });
  const d = data as Record<string, unknown> | null;
  if (!d || d.ok !== true || d.produto_id !== produtoId || typeof d.updated_at !== "string" || d.items !== clean.length) {
    throw new Error("Resposta do servidor inválida");
  }
  return { updated_at: d.updated_at, items: d.items as number };
}

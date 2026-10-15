/**
 * Itens PRÓPRIOS por empresa (Fase 3 — fundação candidata, gate do servidor DESABILITADO).
 *
 * - Empresa/dono derivados no servidor; nenhuma função envia organization_id/owner.
 * - Duplicidade é decidida SOMENTE no servidor (normalização + lock + índice único).
 *   Este módulo apenas traduz o código devolvido em mensagem amigável; não há checagem client-only.
 * - Enquanto o gate do servidor estiver fechado, a UI não oferece criar/editar/arquivar próprios.
 */
import type { RpcClient, TenantCatalogEntity, TenantCatalogScope } from "./tenantCatalogVisibility";

/** Capacidade de CRUD próprio na UI. Só muda após aplicação revisada + certificação dos leitores. */
export const TENANT_OWNED_CATALOG_ENABLED = false as const;

export type CatalogOrigin = "global" | "proprio";
export function catalogOrigin(row: { owner_organization_id?: string | null }): CatalogOrigin {
  return row.owner_organization_id ? "proprio" : "global";
}
export const CATALOG_ORIGIN_LABEL: Record<CatalogOrigin, string> = { global: "Global", proprio: "Próprio" };

/**
 * Globais nunca são editáveis/arquiváveis pela empresa; próprio só da empresa ATUAL do ator,
 * com gate + permissão. Visibilidade apenas — o servidor reautoriza.
 */
export function canManageOwnedItem(
  row: { owner_organization_id?: string | null },
  actorOrganizationId: string | null | undefined,
  canManage: boolean,
  enabled: boolean = TENANT_OWNED_CATALOG_ENABLED,
) {
  return enabled && canManage && !!actorOrganizationId && !!row.owner_organization_id
    && row.owner_organization_id === actorOrganizationId;
}

export type OwnedOperation = "create" | "update" | "archive" | "restore" | "composition";
export interface OwnedMutation {
  entity: TenantCatalogEntity;
  operation: OwnedOperation;
  entityId: string | null;
  expectedUpdatedAt: string | null;
  payload: Record<string, unknown>;
  reason: string;
  idempotencyKey: string;
}

/** Espelho da whitelist do servidor (catalog_owned_allowed_keys); o servidor decide. */
export function ownedAllowedKeys(entity: TenantCatalogEntity, op: OwnedOperation): readonly string[] {
  if (op === "archive" || op === "restore") return [];
  if (op === "composition") return entity === "produto" ? ["status", "itens"] : [];
  if (entity === "produto") return [...(op === "create" ? ["tipo"] : []), "nome", "descricao", "modo_acao", "funcao_completa", "modo_aplicacao", "familia_catalogo", "classe_catalogo", "composition"];
  if (entity === "microrganismo") return [...(op === "create" ? ["tipo"] : []), "nome", "nome_cientifico", "descricao"];
  return ["nome", "descricao"];
}

export class OwnedCatalogError extends Error {
  constructor(public readonly code: string, message: string, public readonly globalId: string | null = null) {
    super(message);
    this.name = "OwnedCatalogError";
  }
}

const ENTITY_LABEL: Record<TenantCatalogEntity, string> = { produto: "produto", microrganismo: "microrganismo", cultura: "cultura" };

/** Traduz erros do servidor sem vazar detalhes nem existência de itens de outra empresa. */
export function ownedCatalogError(error: unknown, entity: TenantCatalogEntity): OwnedCatalogError {
  const e = (typeof error === "object" && error !== null ? error : {}) as { message?: string; code?: string; details?: string };
  const msg = e.message ?? "";
  const label = ENTITY_LABEL[entity];
  const uuid = typeof e.details === "string" && /^[0-9a-f-]{36}$/i.test(e.details) ? e.details : null;
  if (msg.includes("catalog_owned_duplicate_global_active"))
    return new OwnedCatalogError("duplicate_global_active",
      `Este ${label} já existe no catálogo global. Localize-o no catálogo da empresa e use “Exibir” caso esteja oculto.`, uuid);
  if (msg.includes("catalog_owned_duplicate_global_inactive"))
    return new OwnedCatalogError("duplicate_global_inactive",
      `Este ${label} já existe no catálogo global, mas está inativo. Solicite a ativação à plataforma.`, uuid);
  if (msg.includes("catalog_owned_duplicate_own"))
    return new OwnedCatalogError("duplicate_own", `Sua empresa já tem um ${label} próprio com esse nome.`);
  if (msg.includes("catalog_ownership_disabled"))
    return new OwnedCatalogError("disabled", "Cadastro de itens próprios ainda não está disponível.");
  if (e.code === "40001" || msg.includes("catalog_owned_stale"))
    return new OwnedCatalogError("stale", "O item mudou desde que foi aberto. Reabra para conferir os dados.");
  if (msg.includes("catalog_owned_idempotency_conflict"))
    return new OwnedCatalogError("idempotency", "Esta solicitação já foi usada com outros dados. Reabra a edição.");
  if (msg.includes("catalog_owned_archived"))
    return new OwnedCatalogError("archived", "Item arquivado. Restaure-o antes de editar.");
  if (msg.includes("catalog_owned_noop"))
    return new OwnedCatalogError("noop", "Nenhuma alteração para salvar.");
  if (msg.includes("catalog_owned_component_unavailable"))
    return new OwnedCatalogError("component", "Um dos componentes não está disponível para sua empresa.");
  if (e.code === "42501" || msg.includes("catalog_owned_not_found"))
    return new OwnedCatalogError("denied", "Sem permissão para alterar este item.");
  return new OwnedCatalogError("unknown", "Não foi possível confirmar a alteração. Confira os dados antes de tentar novamente.");
}

export async function mutateOwnedItem(client: RpcClient, m: OwnedMutation, signal?: AbortSignal, enabled: boolean = TENANT_OWNED_CATALOG_ENABLED) {
  if (!enabled) throw new OwnedCatalogError("disabled", "Cadastro de itens próprios ainda não está disponível.");
  const allowed = ownedAllowedKeys(m.entity, m.operation);
  if (Object.keys(m.payload).some((k) => !allowed.includes(k)))
    throw new OwnedCatalogError("invalid", "Dados inválidos.");
  const reason = m.reason.trim();
  if (reason.length < 10 || reason.length > 500) throw new OwnedCatalogError("invalid", "Informe um motivo entre 10 e 500 caracteres.");
  let q = client.rpc("tenant_catalog_owned_mutate", {
    p_entity_type: m.entity, p_operation: m.operation, p_entity_id: m.entityId,
    p_expected_updated_at: m.expectedUpdatedAt, p_payload: m.payload, p_reason: reason, p_idempotency_key: m.idempotencyKey,
  });
  if (signal && q?.abortSignal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (signal?.aborted) throw new OwnedCatalogError("aborted", "Solicitação encerrada.");
  if (error) throw ownedCatalogError(error, m.entity);
  if (!data || data.id == null || data.idempotency_key !== m.idempotencyKey || data.origin !== "proprio")
    throw ownedCatalogError(null, m.entity);
  return data as { id: string; updated_at: string; replayed: boolean };
}

export interface OwnedPresentationMutation {
  operation: "create" | "update" | "archive" | "restore";
  parentId: string;
  presentationId: string | null;
  expectedUpdatedAt: string | null;
  payload: { volume_ml?: number; rotulo?: string | null; preco_brl?: number; ordem?: number };
  reason: string;
  idempotencyKey: string;
}

/** Apresentações próprias de produto usam o RPC transacional; nunca fazem DML direto. */
export async function mutateOwnedPresentation(client: RpcClient, m: OwnedPresentationMutation, signal?: AbortSignal, enabled: boolean = TENANT_OWNED_CATALOG_ENABLED) {
  if (!enabled) throw new OwnedCatalogError("disabled", "Cadastro de apresentações próprias ainda não está disponível.");
  const reason = m.reason.trim();
  if (reason.length < 10 || reason.length > 500) throw new OwnedCatalogError("invalid", "Informe um motivo entre 10 e 500 caracteres.");
  let q = client.rpc("tenant_catalog_owned_presentation_mutate", {
    p_operation: m.operation,
    p_parent_id: m.parentId,
    p_presentation_id: m.presentationId,
    p_expected_updated_at: m.expectedUpdatedAt,
    p_payload: m.payload,
    p_reason: reason,
    p_idempotency_key: m.idempotencyKey,
  });
  if (signal && q?.abortSignal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (signal?.aborted) throw new OwnedCatalogError("aborted", "Solicitação encerrada.");
  if (error) throw ownedCatalogError(error, "produto");
  if (!data || data.id == null || data.parent_id !== m.parentId || typeof data.updated_at !== "string") {
    throw ownedCatalogError(null, "produto");
  }
  return data as { id: string; parent_id: string; updated_at: string; replayed: boolean };
}

export const ownedCatalogKeys = {
  list: (s: TenantCatalogScope, entity: TenantCatalogEntity, search: string, offset: number, limit: number, archived = false) =>
    ["tenant-catalog", s.organizationId, s.userId, "owned", entity, "list", search, offset, limit, archived] as const,
  detail: (s: TenantCatalogScope, entity: TenantCatalogEntity, id: string, offset = 0, limit = 50) =>
    ["tenant-catalog", s.organizationId, s.userId, "owned", entity, "detail", id, offset, limit] as const,
};

export interface OwnedCatalogRow {
  id: string; nome: string; ativo: boolean; owner_organization_id: string; archived_at: string | null;
  updated_at: string; tipo?: string; descricao?: string | null; nome_cientifico?: string | null;
  familia_catalogo?: string | null; classe_catalogo?: string | null;
  modo_acao?: string | null; funcao_completa?: string | null; modo_aplicacao?: string | null;
  composition_status?: "rascunho" | "completo" | null;
  declarations?: Array<Record<string, unknown>>;
}

export async function readOwnedCatalog(client: RpcClient, scope: TenantCatalogScope, entity: TenantCatalogEntity,
  opts: { search?: string; offset?: number; limit?: number; archived?: boolean; id?: string; signal?: AbortSignal }) {
  let query = opts.id ? client.rpc("tenant_catalog_owned_detail", {
    p_entity_type: entity, p_entity_id: opts.id, p_limit: opts.limit ?? 50, p_offset: opts.offset ?? 0,
  }) : client.rpc("tenant_catalog_owned_list", {
    p_entity_type: entity, p_search: opts.search ?? "", p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0, p_include_archived: opts.archived ?? false,
  });
  if (opts.signal && query?.abortSignal) query = query.abortSignal(opts.signal);
  const { data, error } = await query;
  if (opts.signal?.aborted) throw new OwnedCatalogError("aborted", "Leitura encerrada.");
  if (error) throw ownedCatalogError(error, entity);
  const rows: OwnedCatalogRow[] = opts.id ? [data?.item] : data?.items;
  if (!data || (opts.id && data.item?.id !== opts.id) || !Array.isArray(rows) || rows.some((row) => !row || row.owner_organization_id !== scope.organizationId
    || typeof row.id !== "string" || typeof row.updated_at !== "string") || typeof data.has_more !== "boolean") {
    throw new OwnedCatalogError("invalid_read", "Não foi possível confirmar os dados do catálogo.");
  }
  return { items: rows, has_more: data.has_more as boolean, presentations: (data.presentations ?? []) as unknown[] };
}

/** Guarda de resposta tardia: só aplica se o escopo/geração ainda for o mesmo do disparo. */
export function createResponseFence() {
  let generation = 0;
  return {
    begin(scope: string) { generation += 1; const g = generation; return (current: string) => g === generation && current === scope; },
    invalidate() { generation += 1; },
  };
}
